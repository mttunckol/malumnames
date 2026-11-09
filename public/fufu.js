'use strict';

/* ================================================================
   MALUM FUFU — fotoğraflı eleme yarışması
   Tek ekranda, tarayıcıda çalışır; veriler localStorage'da saklanır.
   ================================================================ */

const STORAGE_KEY = 'malumfufu.v1';
const ALLOWED_COUNTS = [4, 8, 16, 32];
const MAX_PARTICIPANTS = 32;

const $ = (sel) => document.querySelector(sel);

const els = {
  setup: $('#setupScreen'),
  game: $('#gameScreen'),
  grid: $('#participantGrid'),
  countBadge: $('#countBadge'),
  pairs: $('#pairsList'),
  pairHint: $('#pairHint'),
  addBtn: $('#addBtn'),
  shuffleBtn: $('#shuffleBtn'),
  clearBtn: $('#clearBtn'),
  startBtn: $('#startBtn'),
  roundLabel: $('#roundLabel'),
  progressFill: $('#progressFill'),
  progressText: $('#progressText'),
  matches: $('#matches'),
  undoBtn: $('#undoBtn'),
  quitBtn: $('#quitBtn'),
  win: $('#winOverlay'),
  winnerPhoto: $('#winnerPhoto'),
  winnerName: $('#winnerName'),
  confetti: $('#confetti'),
  toast: $('#toast')
};

let state = {
  participants: [],
  pairs: [],
  tournament: null,
  demo: false
};

let saveTimer = null;
let advanceTimer = null;
let undoStack = [];
let toastTimer = null;

/* ---------------------------------------------------------------- */
/* Yardımcılar                                                       */
/* ---------------------------------------------------------------- */

function upper(text) {
  return String(text || '').toLocaleUpperCase('en-US');
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return upper(parts[0][0]);
  return upper(parts[0][0] + parts[1][0]);
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 3200);
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function participantById(id) {
  return state.participants.find((p) => p.id === id) || null;
}

/* ---------------------------------------------------------------- */
/* Kalıcılık                                                         */
/* ---------------------------------------------------------------- */

function saveNow() {
  if (state.demo) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      participants: state.participants,
      pairs: state.pairs,
      tournament: state.tournament
    }));
  } catch {
    toast('Depolama alanı doldu. Bazı fotoğrafları kaldırıp tekrar deneyin.');
  }
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.participants)) return false;
    state.participants = data.participants.map((p) => ({
      id: p.id || uid(),
      name: String(p.name || ''),
      img: typeof p.img === 'string' ? p.img : null
    }));
    state.pairs = Array.isArray(data.pairs) ? data.pairs : [];
    state.tournament = data.tournament || null;
    if (!state.participants.length) return false;
    if (state.pairs.length !== Math.ceil(state.participants.length / 2)) autoPair();
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- */
/* Fotoğraf işleme                                                    */
/* ---------------------------------------------------------------- */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function photoFromFile(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Lütfen bir görsel dosyası seçin.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Fotoğraf çok büyük (en fazla 15 MB).');

  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);

  const size = 520;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const min = Math.min(img.width, img.height);
  const sx = (img.width - min) / 2;
  const sy = (img.height - min) / 2;
  ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);

  return canvas.toDataURL('image/jpeg', 0.82);
}

/* ---------------------------------------------------------------- */
/* Kurulum ekranı                                                    */
/* ---------------------------------------------------------------- */

function newParticipant(name = '') {
  return { id: uid(), name, img: null };
}

function defaultParticipants() {
  return Array.from({ length: 8 }, () => newParticipant());
}

function autoPair() {
  const ids = state.participants.map((p) => p.id);
  const pairs = [];
  for (let i = 0; i < ids.length; i += 2) {
    pairs.push([ids[i], ids[i + 1] || null]);
  }
  state.pairs = pairs;
}

function renderParticipants() {
  els.grid.innerHTML = '';
  const frag = document.createDocumentFragment();

  state.participants.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'p-card';
    card.dataset.id = p.id;

    const order = document.createElement('span');
    order.className = 'p-order';
    order.textContent = String(i + 1).padStart(2, '0');

    const photoLabel = document.createElement('label');
    photoLabel.className = 'p-photo';
    photoLabel.title = 'Fotoğraf yükle';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;

    if (p.img) {
      const img = document.createElement('img');
      img.src = p.img;
      img.alt = p.name || 'Katılımcı';
      photoLabel.appendChild(img);
    } else {
      const ph = document.createElement('span');
      ph.className = 'initials';
      ph.textContent = initials(p.name);
      photoLabel.appendChild(ph);
    }

    const hint = document.createElement('span');
    hint.className = 'photo-hint';
    hint.textContent = p.img ? 'DEĞİŞTİR' : '+ FOTO';
    photoLabel.appendChild(hint);
    photoLabel.appendChild(fileInput);

    const nameInput = document.createElement('input');
    nameInput.className = 'p-name';
    nameInput.type = 'text';
    nameInput.maxLength = 24;
    nameInput.placeholder = 'İSİM';
    nameInput.value = p.name;
    nameInput.autocomplete = 'off';
    nameInput.spellcheck = false;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'p-remove';
    remove.title = 'Kaldır';
    remove.textContent = '✕';

    card.append(order, photoLabel, nameInput, remove);

    nameInput.addEventListener('input', () => {
      p.name = nameInput.value;
      const ph = photoLabel.querySelector('.initials');
      if (ph) ph.textContent = initials(p.name);
      updatePairLabels();
      saveSoon();
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const imgData = await photoFromFile(file);
        p.img = imgData;
        saveNow();
        renderParticipants();
        renderPairs();
        toast(`${p.name || 'Katılımcı'} fotoğrafı eklendi.`);
      } catch (error) {
        toast(error.message || 'Fotoğraf yüklenemedi.');
      } finally {
        fileInput.value = '';
      }
    });

    remove.addEventListener('click', () => {
      state.participants = state.participants.filter((x) => x.id !== p.id);
      autoPair();
      renderSetup();
      saveNow();
    });

    frag.appendChild(card);
  });

  els.grid.appendChild(frag);
}

function participantLabel(p, index) {
  return p.name.trim() ? upper(p.name) : `İSİM ${index + 1}`;
}

function renderPairs() {
  els.pairs.innerHTML = '';

  if (state.participants.length < 2) {
    const empty = document.createElement('p');
    empty.className = 'pairs-note';
    empty.textContent = 'Eşleşme için en az 2 katılımcı ekleyin.';
    els.pairs.appendChild(empty);
    els.pairHint.textContent = '—';
    return;
  }

  state.pairs.forEach((pair, i) => {
    const row = document.createElement('div');
    row.className = 'pair-row';

    const selectA = document.createElement('select');
    selectA.className = 'pair-select';
    selectA.dataset.pair = String(i);
    selectA.dataset.side = 'a';
    fillSelect(selectA, pair[0]);

    const vs = document.createElement('span');
    vs.className = 'pair-vs';
    vs.textContent = 'VS';

    const selectB = document.createElement('select');
    selectB.className = 'pair-select';
    selectB.dataset.pair = String(i);
    selectB.dataset.side = 'b';
    fillSelect(selectB, pair[1]);

    const onChange = (event) => {
      const el = event.currentTarget;
      const pairIndex = Number(el.dataset.pair);
      const side = el.dataset.side === 'a' ? 0 : 1;
      state.pairs[pairIndex][side] = el.value || null;
      validatePairUI();
      saveSoon();
    };

    selectA.addEventListener('change', onChange);
    selectB.addEventListener('change', onChange);

    row.append(selectA, vs, selectB);
    els.pairs.appendChild(row);
  });

  validatePairUI();
}

function fillSelect(select, selectedId) {
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'SEÇ';
  select.appendChild(placeholder);

  state.participants.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = participantLabel(p, i);
    if (p.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  });
}

function updatePairLabels() {
  els.pairs.querySelectorAll('.pair-select').forEach((select) => {
    Array.from(select.options).forEach((opt) => {
      if (!opt.value) return;
      const p = participantById(opt.value);
      if (p) {
        const index = state.participants.indexOf(p);
        opt.textContent = participantLabel(p, index);
      }
    });
  });
}

function validatePairUI() {
  const seen = new Set();
  let problem = false;

  els.pairs.querySelectorAll('.pair-select').forEach((select) => {
    const value = select.value;
    const duplicate = Boolean(value) && seen.has(value);
    if (value) seen.add(value);
    select.classList.toggle('invalid', duplicate);
    if (duplicate) problem = true;
  });

  els.pairHint.textContent = problem
    ? 'TEKRAR VAR'
    : `${state.pairs.length} EŞLEŞME`;
}

function renderSetup() {
  renderParticipants();
  renderPairs();

  const count = state.participants.length;
  els.countBadge.textContent = `${count} KATILIMCI`;
  els.countBadge.classList.toggle('ok', ALLOWED_COUNTS.includes(count));

  const flow = $('#flowHint');
  if (flow) {
    flow.textContent = ALLOWED_COUNTS.includes(count)
      ? roundFlow(count)
      : '4 · 8 · 16 · 32 KATILIMCI';
  }
}

/* ---------------------------------------------------------------- */
/* Yarışma                                                           */
/* ---------------------------------------------------------------- */

function validateStart() {
  const count = state.participants.length;

  if (!ALLOWED_COUNTS.includes(count)) {
    return `Katılımcı sayısı 4, 8, 16 veya 32 olmalı (şu an ${count}).`;
  }

  const empty = state.participants.find((p) => !p.name.trim());
  if (empty) return 'Tüm katılımcıların ismini yazın.';

  const used = new Set();
  for (const pair of state.pairs) {
    for (const id of pair) {
      if (!id) return 'Tüm eşleşmeleri doldurun.';
      if (used.has(id)) return 'Aynı katılımcı birden fazla eşleşmede olamaz.';
      used.add(id);
    }
  }
  if (used.size !== count) return 'Her katılımcı tam olarak bir kez eşleşmeli.';

  return null;
}

function buildTournament() {
  const first = state.pairs.map((pair, i) => ({
    id: `r0m${i}`,
    a: pair[0],
    b: pair[1],
    winner: null
  }));

  const rounds = [first];
  let matches = first.length;
  let roundNo = 1;

  while (matches > 1) {
    matches /= 2;
    rounds.push(Array.from({ length: matches }, (_, i) => ({
      id: `r${roundNo}m${i}`,
      a: null,
      b: null,
      winner: null
    })));
    roundNo += 1;
  }

  return { rounds, roundIndex: 0, finished: false, winner: null, advancing: false };
}

function roundFlow(count) {
  const names = [];
  let matches = count / 2;
  while (matches >= 1) {
    names.push(roundName(matches));
    matches /= 2;
  }
  return names.join('  →  ');
}

function roundName(matchCount) {
  if (matchCount === 1) return 'FİNAL';
  if (matchCount === 2) return 'YARI FİNAL';
  if (matchCount === 4) return 'ÇEYREK FİNAL';
  if (matchCount === 8) return 'SON 16';
  if (matchCount === 16) return 'SON 32';
  return `${matchCount * 2}'Lİ TUR`;
}

function startTournament(silent) {
  const error = validateStart();
  if (error) {
    if (!silent) toast(error);
    return false;
  }

  state.tournament = buildTournament();
  undoStack = [];
  showGame();
  saveNow();
  return true;
}

function showSetup() {
  els.setup.classList.remove('hidden');
  els.game.classList.add('hidden');
  els.win.classList.add('hidden');
  renderSetup();
}

function showGame() {
  els.setup.classList.add('hidden');
  els.game.classList.remove('hidden');
  els.win.classList.add('hidden');
  renderRound();
}

function renderRound() {
  const t = state.tournament;
  if (!t) return;

  const round = t.rounds[t.roundIndex];
  const decided = round.filter((m) => m.winner).length;

  els.roundLabel.textContent = roundName(round.length);
  els.progressFill.style.width = `${(decided / round.length) * 100}%`;
  els.progressText.textContent = `${decided}/${round.length}`;
  els.undoBtn.disabled = undoStack.length === 0;

  els.matches.className = `matches${round.length === 1 ? ' final' : ''}${round.length >= 8 ? ' dense' : ''}`;
  els.matches.innerHTML = '';

  const frag = document.createDocumentFragment();
  round.forEach((match, index) => {
    frag.appendChild(buildMatch(match, index));
  });
  els.matches.appendChild(frag);
}

function buildMatch(match, index) {
  const wrap = document.createElement('div');
  wrap.className = `match${match.winner ? ' done' : ''}`;

  const a = participantById(match.a);
  const b = participantById(match.b);

  wrap.append(
    buildFighter(a, match, index, 'a'),
    buildVs(),
    buildFighter(b, match, index, 'b')
  );

  return wrap;
}

function buildVs() {
  const vs = document.createElement('span');
  vs.className = 'vs-badge';
  vs.textContent = 'VS';
  return vs;
}

function buildFighter(participant, match, index, side) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fighter';

  if (!participant) {
    btn.disabled = true;
    btn.textContent = '—';
    return btn;
  }

  if (match.winner) {
    btn.classList.add(match.winner === participant.id ? 'win' : 'lose');
    btn.disabled = true;
  } else {
    btn.addEventListener('click', () => pick(index, participant.id));
  }

  const photo = document.createElement('span');
  photo.className = 'f-photo';

  if (participant.img) {
    const img = document.createElement('img');
    img.src = participant.img;
    img.alt = participant.name;
    photo.appendChild(img);
  } else {
    const ph = document.createElement('span');
    ph.className = 'initials';
    ph.textContent = initials(participant.name);
    photo.appendChild(ph);
  }

  const name = document.createElement('span');
  name.className = 'f-name';
  name.textContent = upper(participant.name);

  btn.append(photo, name);
  return btn;
}

function pick(matchIndex, participantId) {
  const t = state.tournament;
  if (!t || t.advancing || t.finished) return;

  const round = t.rounds[t.roundIndex];
  const match = round[matchIndex];
  if (!match || match.winner) return;

  match.winner = participantId;
  undoStack.push({ roundIndex: t.roundIndex, matchIndex, prevWinner: null });

  renderRound();
  saveNow();

  if (round.every((m) => m.winner)) {
    t.advancing = true;
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(advance, 1400);
  }
}

function undo() {
  const t = state.tournament;
  if (!t) return;

  clearTimeout(advanceTimer);
  advanceTimer = null;

  const last = undoStack.pop();
  if (!last || last.roundIndex !== t.roundIndex) {
    undoStack = [];
    renderRound();
    return;
  }

  const match = t.rounds[t.roundIndex][last.matchIndex];
  match.winner = last.prevWinner;
  t.advancing = false;
  renderRound();
  saveNow();
}

function advance() {
  const t = state.tournament;
  if (!t) return;

  const round = t.rounds[t.roundIndex];

  if (t.roundIndex === t.rounds.length - 1) {
    finish(round[0].winner);
    return;
  }

  const winners = round.map((m) => m.winner);
  const next = t.rounds[t.roundIndex + 1];

  next.forEach((match, i) => {
    match.a = winners[i * 2];
    match.b = winners[i * 2 + 1];
    match.winner = null;
  });

  t.roundIndex += 1;
  t.advancing = false;
  undoStack = [];
  renderRound();
  saveNow();
  toast(`${roundName(next.length)} başlıyor.`);
}

function finish(winnerId) {
  const t = state.tournament;
  t.finished = true;
  t.winner = winnerId;
  t.advancing = false;
  saveNow();
  showWin(winnerId);
}

/* ---------------------------------------------------------------- */
/* Kazanan                                                           */
/* ---------------------------------------------------------------- */

function makeConfetti() {
  els.confetti.innerHTML = '';
  const colors = ['#b394d4', '#eec56a', '#ffffff', '#7e5798', '#cfa033'];
  for (let i = 0; i < 52; i += 1) {
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

function showWin(winnerId) {
  const p = participantById(winnerId);
  els.winnerPhoto.innerHTML = '';
  if (p) {
    if (p.img) {
      const img = document.createElement('img');
      img.src = p.img;
      img.alt = p.name;
      els.winnerPhoto.appendChild(img);
    } else {
      const ph = document.createElement('span');
      ph.className = 'initials';
      ph.textContent = initials(p.name);
      els.winnerPhoto.appendChild(ph);
    }
    els.winnerName.textContent = upper(p.name);
  } else {
    els.winnerName.textContent = '—';
  }

  els.toast.classList.add('hidden');
  makeConfetti();
  els.win.classList.remove('hidden');
}

/* ---------------------------------------------------------------- */
/* Demo (ekran görüntüsü / hızlı test)                               */
/* ---------------------------------------------------------------- */

function demoAvatar(name, index) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const palettes = [
    ['#b394d4', '#5c3d72'],
    ['#eec56a', '#cfa033'],
    ['#cbb0e8', '#7e5798']
  ];
  const [c1, c2] = palettes[index % palettes.length];

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, c1);
  gradient.addColorStop(1, c2);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '900 92px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials(name), size / 2, size / 2 + 4);

  return canvas.toDataURL('image/jpeg', 0.8);
}

function demoSetup() {
  const names = ['Ali', 'Veli', 'Ayşe', 'Zeynep', 'Tunç', 'Taygun', 'Gökçe', 'Melisa'];
  state.demo = true;
  state.participants = names.map((name, i) => ({
    id: `demo-${i}`,
    name,
    img: demoAvatar(name, i)
  }));
  state.tournament = null;
  autoPair();
}

function demoPlayRound(winners) {
  winners.forEach((id, i) => pick(i, id));
  clearTimeout(advanceTimer);
  advanceTimer = null;
  const round = state.tournament.rounds[state.tournament.roundIndex];
  if (round.every((m) => m.winner)) advance();
}

function runDemo(mode) {
  demoSetup();

  if (mode === 'setup') {
    showSetup();
    return;
  }

  startTournament(true);

  if (mode === 'round2') {
    demoPlayRound(['demo-0', 'demo-2', 'demo-4', 'demo-6']);
  } else if (mode === 'final') {
    demoPlayRound(['demo-0', 'demo-2', 'demo-4', 'demo-6']);
    demoPlayRound(['demo-0', 'demo-6']);
  } else if (mode === 'win') {
    demoPlayRound(['demo-0', 'demo-2', 'demo-4', 'demo-6']);
    demoPlayRound(['demo-0', 'demo-6']);
    demoPlayRound(['demo-6']);
  }
}

/* ---------------------------------------------------------------- */
/* Olaylar                                                           */
/* ---------------------------------------------------------------- */

function bind() {
  els.addBtn.addEventListener('click', () => {
    if (state.participants.length >= MAX_PARTICIPANTS) {
      toast(`En fazla ${MAX_PARTICIPANTS} katılımcı eklenebilir.`);
      return;
    }
    state.participants.push(newParticipant());
    autoPair();
    renderSetup();
    saveNow();
  });

  els.shuffleBtn.addEventListener('click', () => {
    state.participants = shuffle(state.participants);
    autoPair();
    renderSetup();
    saveNow();
    toast('Katılımcılar karıştırıldı, eşleşmeler yenilendi.');
  });

  els.clearBtn.addEventListener('click', () => {
    if (!confirm('Tüm katılımcılar ve fotoğraflar silinsin mi?')) return;
    state.participants = defaultParticipants();
    state.tournament = null;
    undoStack = [];
    autoPair();
    renderSetup();
    saveNow();
  });

  els.startBtn.addEventListener('click', () => startTournament(false));

  els.undoBtn.addEventListener('click', undo);

  els.quitBtn.addEventListener('click', () => {
    if (!confirm('Yarışmadan çıkılsın mı? Eşleşmeler ve fotoğraflar korunur.')) return;
    state.tournament = null;
    undoStack = [];
    showSetup();
    saveNow();
  });

  $('#againBtn').addEventListener('click', () => {
    state.tournament = null;
    undoStack = [];
    showSetup();
    saveNow();
  });

  $('#closeWinBtn').addEventListener('click', () => {
    els.win.classList.add('hidden');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') els.win.classList.add('hidden');
  });
}

/* ---------------------------------------------------------------- */
/* Başlat                                                            */
/* ---------------------------------------------------------------- */

function boot() {
  bind();

  const params = new URLSearchParams(location.search);
  const demo = params.get('demo');

  if (demo) {
    runDemo(demo);
    return;
  }

  const loaded = load();

  if (!loaded || !state.participants.length) {
    state.participants = defaultParticipants();
    autoPair();
    saveNow();
  }

  if (state.tournament && state.tournament.finished) {
    state.tournament = null;
    saveNow();
  }

  if (state.tournament) {
    showGame();
  } else {
    showSetup();
  }
}

boot();
