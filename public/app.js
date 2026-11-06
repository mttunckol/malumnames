'use strict';

/* ================================================================
   MALUM MECRA — istemci mantığı
   Sunucu otoritedir; durum SSE ile canlı akar.
   ================================================================ */

const $ = (sel) => document.querySelector(sel);

const els = {
  setup: $('#setupScreen'),
  game: $('#gameScreen'),
  grid: $('#setupGrid'),
  board: $('#board'),
  counters: {
    purple: $('#counterPurple'),
    yellow: $('#counterYellow'),
    neutral: $('#counterNeutral')
  },
  seriesPurple: $('#seriesPurple'),
  seriesYellow: $('#seriesYellow'),
  purpleCount: $('#purpleCount'),
  yellowCount: $('#yellowCount'),
  turnPill: $('#turnPill'),
  turnTeam: $('#turnTeam'),
  spyBtn: $('#spyBtn'),
  spyState: $('#spyState'),
  rulesModal: $('#rulesModal'),
  win: $('#winOverlay'),
  winTitle: $('#winTitle'),
  winSeries: $('#winSeries'),
  confetti: $('#confetti'),
  toast: $('#toast')
};

const TEAM_NAME = { purple: 'MOR', yellow: 'SARI' };
const TEAM_LONG = { purple: 'MOR TAKIM', yellow: 'SARI TAKIM' };
const STORAGE_SPY = 'malummecra.spy';

/** 20 slot: ilk 8 mor, sonraki 8 sarı, son 4 sivil */
const slots = Array.from({ length: 20 }, (_, i) => ({
  word: '',
  type: i < 8 ? 'purple' : i < 16 ? 'yellow' : 'neutral'
}));

/** İsim → kategori haritası */
const NAME_CATS = new Map(
  ALL_NAMES.map(({ name, cat }) => [upper(name), cat])
);

const app = {
  game: null,
  spy: localStorage.getItem(STORAGE_SPY) === '1',
  winKey: null,
  busy: false
};

/* ---------------------------------------------------------------- */
/* Yardımcılar                                                       */
/* ---------------------------------------------------------------- */

function upper(text) {
  return String(text).toLocaleUpperCase('en-US');
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let toastTimer = null;
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 3400);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return res.json();
}

/* ---------------------------------------------------------------- */
/* Kurulum ekranı                                                    */
/* ---------------------------------------------------------------- */

function buildSetup() {
  const frag = document.createDocumentFragment();

  slots.forEach((slot, i) => {
    const el = document.createElement('div');
    el.className = `slot ${slot.type}`;
    el.dataset.index = String(i);

    const no = document.createElement('span');
    no.className = 'slot-no';
    no.textContent = String(i + 1).padStart(2, '0');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'slot-input';
    input.maxLength = 32;
    input.placeholder = `İSİM ${i + 1}`;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = slot.word;

    const switcher = document.createElement('div');
    switcher.className = 'type-switch';
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', `${i + 1}. ismin takımı`);

    [['purple', 'MOR'], ['yellow', 'SARI'], ['neutral', 'SİVİL']].forEach(([type, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'type-btn';
      btn.dataset.type = type;
      btn.textContent = label;
      if (slot.type === type) btn.classList.add('active');
      switcher.appendChild(btn);
    });

    el.append(no, input, switcher);
    frag.appendChild(el);
  });

  els.grid.appendChild(frag);
}

function slotEl(index) {
  return els.grid.querySelector(`.slot[data-index="${index}"]`);
}

function paintSlot(index) {
  const el = slotEl(index);
  if (!el) return;
  el.className = `slot ${slots[index].type}`;
  el.querySelectorAll('.type-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === slots[index].type);
  });
}

function updateCounters() {
  const counts = { purple: 0, yellow: 0, neutral: 0 };
  slots.forEach((s) => { counts[s.type] += 1; });

  Object.entries(counts).forEach(([team, count]) => {
    const el = els.counters[team];
    const target = team === 'neutral' ? 4 : 8;
    el.querySelector('b').textContent = String(count);
    el.classList.toggle('ok', count === target);
    el.classList.toggle('bad', count !== target);
  });
}

function onGridClick(event) {
  const typeBtn = event.target.closest('.type-btn');
  if (!typeBtn) return;
  const slot = typeBtn.closest('.slot');
  if (!slot) return;
  const index = Number(slot.dataset.index);
  slots[index].type = typeBtn.dataset.type;
  paintSlot(index);
  updateCounters();
}

function onGridInput(event) {
  const input = event.target.closest('.slot-input');
  if (!input) return;

  const index = Number(input.closest('.slot').dataset.index);
  const caret = input.selectionStart;
  const upperValue = upper(input.value);

  if (input.value !== upperValue) {
    input.value = upperValue;
    if (caret !== null) input.setSelectionRange(caret, caret);
  }
  slots[index].word = upperValue;
}

function clearSetup() {
  slots.forEach((slot, i) => {
    slot.word = '';
    const input = slotEl(i)?.querySelector('.slot-input');
    if (input) input.value = '';
  });
  toast('Alanlar temizlendi.');
}

/* ---------------------------------------------------------------- */
/* RANDOM — 200 isimlik havuzdan dengeli seçim                        */
/* ---------------------------------------------------------------- */

const QUOTAS = { futbol: 6, basketbol: 4, tenis: 3, f1: 3, atletizm: 2, diger: 2 };

function randomFill() {
  const picked = [];

  Object.entries(QUOTAS).forEach(([cat, quota]) => {
    const pool = shuffle(NAME_POOL[cat] || []);
    pool.slice(0, quota).forEach((name) => picked.push({ name, cat }));
  });

  // Güvenlik ağı: eksik kalırsa havuzdan tamamla
  while (picked.length < 20) {
    const candidate = ALL_NAMES[Math.floor(Math.random() * ALL_NAMES.length)];
    if (!picked.some((p) => p.name === candidate.name)) picked.push(candidate);
  }

  const names = shuffle(picked).slice(0, 20);
  const types = shuffle([
    ...Array(8).fill('purple'),
    ...Array(8).fill('yellow'),
    ...Array(4).fill('neutral')
  ]);

  names.forEach((entry, i) => {
    slots[i].word = upper(entry.name);
    slots[i].type = types[i];
  });

  slots.forEach((slot, i) => {
    const el = slotEl(i);
    if (!el) return;
    const input = el.querySelector('.slot-input');
    input.value = slot.word;
    paintSlot(i);
  });

  updateCounters();

  // Küçük bir "karıştı" animasyonu
  els.grid.classList.remove('is-shuffling');
  void els.grid.offsetWidth;
  els.grid.classList.add('is-shuffling');
}

/* ---------------------------------------------------------------- */
/* Oyunu başlatma                                                    */
/* ---------------------------------------------------------------- */

function validateSetup() {
  const counts = { purple: 0, yellow: 0, neutral: 0 };
  const seen = new Set();

  for (let i = 0; i < slots.length; i += 1) {
    const word = slots[i].word.trim();
    if (!word) return `${i + 1}. isim boş. Tüm alanları doldur.`;
    if (seen.has(word)) return `“${word}” iki kez girilmiş.`;
    seen.add(word);
    counts[slots[i].type] += 1;
  }

  if (counts.purple !== 8) return `Mor takımda 8 isim olmalı (şu an ${counts.purple}).`;
  if (counts.yellow !== 8) return `Sarı takımda 8 isim olmalı (şu an ${counts.yellow}).`;
  if (counts.neutral !== 4) return `Sivil isim 4 olmalı (şu an ${counts.neutral}).`;
  return null;
}

async function startGame(silent) {
  if (app.busy) return;
  const error = validateSetup();
  if (error) {
    if (!silent) toast(error);
    return;
  }

  app.busy = true;
  els.setup.querySelector('#startBtn')?.setAttribute('disabled', 'disabled');

  try {
    const result = await api('/api/start', {
      board: slots.map((slot) => ({ word: slot.word.trim(), type: slot.type }))
    });
    if (!result.ok) toast(result.error || 'Oyun başlatılamadı.');
    await refreshState();
  } catch {
    toast('Sunucuya ulaşılamadı. Bağlantını kontrol et.');
  } finally {
    app.busy = false;
    els.setup.querySelector('#startBtn')?.removeAttribute('disabled');
  }
}

async function refreshState() {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    render(await res.json());
  } catch {
    /* SSE zaten akıyor */
  }
}

/* ---------------------------------------------------------------- */
/* Oyun tahtası                                                      */
/* ---------------------------------------------------------------- */

function renderBoard() {
  const { board } = app.game;
  els.board.innerHTML = '';
  els.board.classList.toggle('spy', app.spy);

  const frag = document.createDocumentFragment();
  board.forEach((card) => {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = String(card.id);
    el.dataset.type = card.type;
    el.setAttribute('role', 'gridcell');
    el.tabIndex = 0;

    if (card.revealed) {
      el.classList.add('revealed', card.type);
      el.setAttribute('aria-label', `${card.word} — açıldı`);
    } else {
      el.setAttribute('aria-label', card.word);
    }

    const cat = document.createElement('span');
    cat.className = 'cat';
    cat.textContent = CATEGORY_LABELS[NAME_CATS.get(card.word)] || '';

    const word = document.createElement('span');
    word.className = 'word';
    word.textContent = card.word;

    el.append(cat, word);
    frag.appendChild(el);
  });

  els.board.appendChild(frag);
}

async function revealCard(id) {
  if (!app.game || app.game.phase !== 'playing' || app.game.winner) return;
  try {
    const result = await api('/api/reveal', { id });
    if (!result.ok && result.error && result.error !== 'Bu kart zaten açık.') {
      toast(result.error);
    }
  } catch {
    toast('Hamle gönderilemedi.');
  }
}

function updateScore() {
  const { board, turn } = app.game;
  const left = (team) => board.filter((c) => c.type === team && !c.revealed).length;

  els.purpleCount.textContent = String(left('purple'));
  els.yellowCount.textContent = String(left('yellow'));

  els.turnTeam.textContent = TEAM_NAME[turn];
  els.turnPill.className = `turn-pill turn-${turn}`;
}

/* ---------------------------------------------------------------- */
/* Spymaster                                                         */
/* ---------------------------------------------------------------- */

function setSpy(value) {
  app.spy = Boolean(value);
  localStorage.setItem(STORAGE_SPY, app.spy ? '1' : '0');
  els.board.classList.toggle('spy', app.spy);
  els.spyBtn.classList.toggle('on', app.spy);
  els.spyBtn.setAttribute('aria-pressed', String(app.spy));
  els.spyState.textContent = app.spy ? 'AÇIK' : 'KAPALI';
}

/* ---------------------------------------------------------------- */
/* Kazanan                                                           */
/* ---------------------------------------------------------------- */

function makeConfetti() {
  els.confetti.innerHTML = '';
  const colors = ['#b394d4', '#eec56a', '#ffffff', '#7e5798', '#cfa033'];
  for (let i = 0; i < 46; i += 1) {
    const piece = document.createElement('span');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = `${2.4 + Math.random() * 2.2}s`;
    piece.style.animationDelay = `${-Math.random() * 3.4}s`;
    piece.style.width = `${6 + Math.random() * 8}px`;
    piece.style.height = `${10 + Math.random() * 12}px`;
    piece.style.opacity = String(0.55 + Math.random() * 0.45);
    els.confetti.appendChild(piece);
  }
}

function showWin(winner) {
  els.winTitle.textContent = `${TEAM_LONG[winner]} KAZANDI`;
  const { purple, yellow } = app.game.series;
  els.winSeries.textContent = `${purple} : ${yellow}`;
  makeConfetti();
  els.win.classList.remove('hidden');
  app.winKey = winner;
}

/* ---------------------------------------------------------------- */
/* Ana render                                                        */
/* ---------------------------------------------------------------- */

function render(state) {
  app.game = state;

  els.seriesPurple.textContent = String(state.series.purple);
  els.seriesYellow.textContent = String(state.series.yellow);

  if (state.phase === 'setup') {
    els.setup.classList.remove('hidden');
    els.game.classList.add('hidden');
    els.win.classList.add('hidden');
    els.board.dataset.signature = '';
    els.board.innerHTML = '';
    app.winKey = null;
    return;
  }

  els.setup.classList.add('hidden');
  els.game.classList.remove('hidden');

  updateScore();

  const signature = `${state.board.filter((c) => c.revealed).length}-${state.winner}-${state.series.purple}-${state.series.yellow}`;
  const boardSignature = els.board.dataset.signature || '';
  if (signature !== boardSignature) {
    els.board.dataset.signature = signature;
    renderBoard();
  } else {
    els.board.classList.toggle('spy', app.spy);
  }

  if (state.winner && app.winKey !== `${state.winner}-${signature}`) {
    showWin(state.winner);
    app.winKey = `${state.winner}-${signature}`;
  }
  if (!state.winner) {
    els.win.classList.add('hidden');
    app.winKey = null;
  }
}

/* ---------------------------------------------------------------- */
/* Modal & olaylar                                                   */
/* ---------------------------------------------------------------- */

function openRules() {
  els.rulesModal.classList.remove('hidden');
  $('#rulesClose')?.focus();
}
function closeRules() {
  els.rulesModal.classList.add('hidden');
}

function bindEvents() {
  els.grid.addEventListener('click', onGridClick);
  els.grid.addEventListener('input', onGridInput);

  $('#randomBtn').addEventListener('click', randomFill);
  $('#clearBtn').addEventListener('click', clearSetup);
  $('#startBtn').addEventListener('click', () => startGame(false));

  $('#rulesBtn').addEventListener('click', openRules);
  $('#rulesClose').addEventListener('click', closeRules);
  els.rulesModal.addEventListener('click', (event) => {
    if (event.target === els.rulesModal) closeRules();
  });

  els.spyBtn.addEventListener('click', () => setSpy(!app.spy));

  els.board.addEventListener('click', (event) => {
    const card = event.target.closest('.card');
    if (!card || card.classList.contains('revealed')) return;
    revealCard(Number(card.dataset.id));
  });

  els.board.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.card');
    if (!card || card.classList.contains('revealed')) return;
    event.preventDefault();
    revealCard(Number(card.dataset.id));
  });

  $('#endTurnBtn').addEventListener('click', async () => {
    try {
      const result = await api('/api/end-turn');
      if (!result.ok) toast(result.error || 'Sıra değiştirilemedi.');
    } catch {
      toast('Sunucuya ulaşılamadı.');
    }
  });

  const resetWithConfirm = async () => {
    if (!confirm('Yeni oyun kurulsun mu? Mevcut masa sıfırlanacak, seri skoru korunacak.')) return;
    try {
      await api('/api/reset');
      els.win.classList.add('hidden');
      await refreshState();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      toast('Sunucuya ulaşılamadı.');
    }
  };

  $('#newGameBtn').addEventListener('click', resetWithConfirm);
  $('#gameNewBtn').addEventListener('click', resetWithConfirm);
  $('#winNewBtn').addEventListener('click', resetWithConfirm);
  $('#winCloseBtn').addEventListener('click', () => els.win.classList.add('hidden'));

  $('#resetSeriesBtn').addEventListener('click', async () => {
    if (!confirm('Seri skoru sıfırlansın mı?')) return;
    try {
      await api('/api/reset-series');
      await refreshState();
    } catch {
      toast('Sunucuya ulaşılamadı.');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeRules();
      els.win.classList.add('hidden');
    }
  });
}

/* ---------------------------------------------------------------- */
/* Canlı bağlantı                                                    */
/* ---------------------------------------------------------------- */

function connect() {
  const source = new EventSource('/events');
  source.onmessage = (event) => {
    try {
      render(JSON.parse(event.data));
    } catch {
      /* yoksay */
    }
  };
  source.onerror = () => {
    // EventSource otomatik yeniden bağlanır.
  };
}

/* ---------------------------------------------------------------- */
/* Başlat                                                            */
/* ---------------------------------------------------------------- */

function boot() {
  buildSetup();
  updateCounters();
  setSpy(app.spy);
  bindEvents();
  connect();

  const params = new URLSearchParams(location.search);
  const demo = params.get('demo');

  if (params.get('spy') === '1') setSpy(true);
  if (params.get('rules') === '1') openRules();
  if (demo === 'random') randomFill();

  if (demo === 'game') {
    randomFill();
    setTimeout(async () => {
      await startGame(true);
      if (params.get('spy') === '1') setSpy(true);
    }, 250);
  }
}

boot();
