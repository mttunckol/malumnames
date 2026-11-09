'use strict';

/* ================================================================
   MALUM FUFU — fotoğraflı eleme yarışması
   8 / 16 / 32 kişi · eşleşmeler tek tek · otomatik tur geçişi
   ================================================================ */

const STORAGE_KEY = 'malumfufu.v1';
const ALLOWED_COUNTS = [8, 16, 32];
const DEFAULT_COUNT = 8;

const $ = (sel) => document.querySelector(sel);

const els = {
  countScreen: $('#countScreen'),
  setup: $('#setupScreen'),
  game: $('#gameScreen'),
  grid: $('#participantGrid'),
  countBadge: $('#countBadge'),
  pairs: $('#pairsList'),
  pairHint: $('#pairHint'),
  setupCount: $('#setupCount'),
  changeCountBtn: $('#changeCountBtn'),
  shuffleBtn: $('#shuffleBtn'),
  clearBtn: $('#clearBtn'),
  startBtn: $('#startBtn'),
  flowHint: $('#flowHint'),
  roundLabel: $('#roundLabel'),
  matchProgress: $('#matchProgress'),
  progressFill: $('#progressFill'),
  arena: $('#arena'),
  quitBtn: $('#quitBtn'),
  interlude: $('#interlude'),
  interKicker: $('#interKicker'),
  interTitle: $('#interTitle'),
  interText: $('#interText'),
  interNames: $('#interNames'),
  interBar: $('#interBar'),
  win: $('#winOverlay'),
  winnerPhoto: $('#winnerPhoto'),
  winnerName: $('#winnerName'),
  confetti: $('#confetti'),
  streamBtn: $('#streamBtn'),
  streamExit: $('#streamExit'),
  toast: $('#toast')
};

let state = {
  count: 0,
  participants: [],
  pairs: [],
  tournament: null,
  demo: false,
  stream: false
};

let saveTimer = null;
let advanceTimer = null;
let interludeTimer = null;
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

function newParticipant(name = '') {
  return { id: uid(), name, img: null };
}

function defaultParticipants(count = DEFAULT_COUNT) {
  return Array.from({ length: count }, () => newParticipant());
}

/* ---------------------------------------------------------------- */
/* Kalıcılık                                                         */
/* ---------------------------------------------------------------- */

function saveNow() {
  if (state.demo) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      count: state.count,
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

function normalizeCount(value) {
  const n = Number(value);
  return ALLOWED_COUNTS.includes(n) ? n : 0;
}

function resizeParticipants() {
  const list = state.participants.slice(0, state.count);
  while (list.length < state.count) list.push(newParticipant());
  state.participants = list;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);

    if (Array.isArray(data.participants) && data.participants.length) {
      state.participants = data.participants.map((p) => ({
        id: p.id || uid(),
        name: String(p.name || ''),
        img: typeof p.img === 'string' ? p.img : null
      }));
    }

    state.count = normalizeCount(data.count);
    if (!state.count && ALLOWED_COUNTS.includes(state.participants.length)) {
      state.count = state.participants.length;
    }

    if (state.count) {
      resizeParticipants();
      state.pairs = Array.isArray(data.pairs) ? data.pairs : [];
      if (state.pairs.length !== state.count / 2) autoPair();
    } else {
      state.participants = [];
      state.pairs = [];
    }

    const t = data.tournament;
    const validTournament = state.count > 0
      && t
      && typeof t.roundIndex === 'number'
      && typeof t.matchIndex === 'number'
      && typeof t.stage === 'string'
      && Array.isArray(t.rounds);
    state.tournament = validTournament ? t : null;
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- */
/* Fotoğraf                                                          */
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
/* Kurulum                                                           */
/* ---------------------------------------------------------------- */

function autoPair() {
  const ids = state.participants.map((p) => p.id);
  const pairs = [];
  for (let i = 0; i < ids.length; i += 2) {
    pairs.push([ids[i], ids[i + 1] || null]);
  }
  state.pairs = pairs;
}

function chooseCount(count) {
  if (!ALLOWED_COUNTS.includes(count)) return;

  if (state.count === 0) {
    state.count = count;
    state.participants = defaultParticipants(count);
    autoPair();
  } else if (state.count !== count) {
    if (!setCount(count)) return;
  }

  showSetup();
  saveNow();
}

function setCount(count) {
  if (!ALLOWED_COUNTS.includes(count) || count === state.count) return true;

  if (count < state.count) {
    const removed = state.participants.slice(count);
    const hasData = removed.some((p) => p.name.trim() || p.img);
    if (hasData && !confirm(`Katılımcı sayısı ${count} olarak değişsin mi? Fazla isim ve fotoğraflar silinecek.`)) {
      return false;
    }
  }

  state.count = count;
  resizeParticipants();
  autoPair();

  if (!els.setup.classList.contains('hidden')) renderSetup();
  saveNow();
  return true;
}

function renderParticipants() {
  els.grid.innerHTML = '';
  els.grid.className = `participant-grid count-${state.count}`;
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
    nameInput.placeholder = 'İSİM YAZ';
    nameInput.value = p.name;
    nameInput.autocomplete = 'off';
    nameInput.spellcheck = false;

    card.append(order, photoLabel, nameInput);

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

    frag.appendChild(card);
  });

  els.grid.appendChild(frag);
}

function participantLabel(p, index) {
  return p.name.trim() ? upper(p.name) : `İSİM ${index + 1}`;
}

function renderPairs() {
  els.pairs.innerHTML = '';

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
      updateFlowHint();
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

  els.pairHint.textContent = problem ? 'TEKRAR VAR' : `${state.pairs.length} EŞLEŞME`;
}

function roundName(matchCount) {
  if (matchCount === 1) return 'FİNAL';
  if (matchCount === 2) return 'YARI FİNAL';
  if (matchCount === 4) return 'ÇEYREK FİNAL';
  if (matchCount === 8) return 'SON 16';
  if (matchCount === 16) return 'SON 32';
  return `${matchCount * 2}'Lİ TUR`;
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

function updateFlowHint() {
  if (!els.flowHint) return;
  els.flowHint.textContent = roundFlow(state.count);
}

function renderCountScreen() {
  document.querySelectorAll('.count-card').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.count) === state.count);
  });
}

function renderSetup() {
  renderCountScreen();
  els.setupCount.textContent = String(state.count);

  renderParticipants();
  renderPairs();
  updateFlowHint();

  els.countBadge.textContent = `${state.count} KATILIMCI`;
  els.countBadge.classList.add('ok');
}

/* ---------------------------------------------------------------- */
/* Oyun                                                              */
/* ---------------------------------------------------------------- */

function validateStart() {
  if (!ALLOWED_COUNTS.includes(state.count)) {
    return 'Katılımcı sayısı 8, 16 veya 32 olmalı.';
  }
  if (state.participants.length !== state.count) {
    return `Tam ${state.count} katılımcı olmalı.`;
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
  if (used.size !== state.count) return 'Her katılımcı tam olarak bir kez eşleşmeli.';

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

  return {
    rounds,
    roundIndex: 0,
    matchIndex: 0,
    stage: 'match',
    finished: false,
    winner: null
  };
}

function currentRound() {
  return state.tournament.rounds[state.tournament.roundIndex];
}

function currentMatch() {
  return currentRound()[state.tournament.matchIndex];
}

function startTournament(silent) {
  const error = validateStart();
  if (error) {
    if (!silent) toast(error);
    return false;
  }

  state.tournament = buildTournament();
  clearTimeout(advanceTimer);
  showGame();
  saveNow();
  return true;
}

function showCountScreen() {
  els.countScreen.classList.remove('hidden');
  els.setup.classList.add('hidden');
  els.game.classList.add('hidden');
  els.interlude.classList.add('hidden');
  els.win.classList.add('hidden');
  renderCountScreen();
}

function showSetup() {
  els.countScreen.classList.add('hidden');
  els.setup.classList.remove('hidden');
  els.game.classList.add('hidden');
  els.interlude.classList.add('hidden');
  els.win.classList.add('hidden');
  renderSetup();
}

function showGame() {
  els.countScreen.classList.add('hidden');
  els.setup.classList.add('hidden');
  els.game.classList.remove('hidden');
  els.interlude.classList.add('hidden');
  els.win.classList.add('hidden');
  renderMatch();
}

function renderMatch() {
  const t = state.tournament;
  if (!t) return;

  const round = currentRound();
  const match = currentMatch();
  const decided = round.filter((m) => m.winner).length;

  els.roundLabel.textContent = roundName(round.length);
  els.matchProgress.textContent = `EŞLEŞME ${t.matchIndex + 1} / ${round.length}`;
  els.progressFill.style.width = `${(decided / round.length) * 100}%`;

  els.arena.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'arena-match';

  wrap.append(
    buildFighter(participantById(match.a), match, 'a'),
    buildVs(),
    buildFighter(participantById(match.b), match, 'b')
  );

  els.arena.appendChild(wrap);
}

function buildVs() {
  const vs = document.createElement('span');
  vs.className = 'vs-badge';
  vs.textContent = 'VS';
  return vs;
}

function buildFighter(participant, match, side) {
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
    btn.addEventListener('click', () => pick(participant.id));
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

function pick(participantId) {
  const t = state.tournament;
  if (!t || t.stage !== 'match' || t.finished) return;

  const match = currentMatch();
  if (!match || match.winner) return;

  match.winner = participantId;
  t.stage = 'resolving';

  renderMatch();
  saveNow();

  clearTimeout(advanceTimer);
  advanceTimer = setTimeout(advanceAfterPick, 1000);
}

function advanceAfterPick() {
  const t = state.tournament;
  if (!t) return;

  const round = currentRound();
  t.stage = 'match';

  if (t.matchIndex < round.length - 1) {
    t.matchIndex += 1;
    renderMatch();
    saveNow();
    return;
  }

  endRound();
}

function endRound() {
  const t = state.tournament;
  const round = currentRound();
  const winners = round.map((m) => m.winner);

  if (t.roundIndex === t.rounds.length - 1) {
    finish(round[0].winner);
    return;
  }

  const next = t.rounds[t.roundIndex + 1];
  next.forEach((match, i) => {
    match.a = winners[i * 2];
    match.b = winners[i * 2 + 1];
    match.winner = null;
  });

  t.stage = 'interlude';
  showInterlude(next);
  saveNow();
}

function showInterlude(nextRound) {
  const isFinal = nextRound.length === 1;

  els.interKicker.textContent = isFinal ? 'SON 2 KALDI' : 'TUR TAMAMLANDI';
  els.interTitle.textContent = roundName(nextRound.length);
  els.interText.textContent = isFinal
    ? 'Kazanan tek isim olacak.'
    : `${nextRound.length} eşleşme`;

  els.interNames.innerHTML = '';
  nextRound.forEach((match) => {
    const a = participantById(match.a);
    const b = participantById(match.b);
    if (!a || !b) return;

    const row = document.createElement('span');
    row.className = 'inter-pair';
    row.textContent = `${upper(a.name)}  vs  ${upper(b.name)}`;
    els.interNames.appendChild(row);
  });

  els.interlude.classList.remove('hidden');

  if (els.interBar) {
    els.interBar.classList.remove('run');
    void els.interBar.offsetWidth;
    els.interBar.classList.add('run');
  }

  clearTimeout(interludeTimer);
  interludeTimer = setTimeout(() => continueRound(), 2200);
}

function continueRound() {
  clearTimeout(interludeTimer);
  const t = state.tournament;
  if (!t || t.stage !== 'interlude') return;

  els.interlude.classList.add('hidden');
  t.roundIndex += 1;
  t.matchIndex = 0;
  t.stage = 'match';
  clearTimeout(advanceTimer);

  renderMatch();
  saveNow();
}

function finish(winnerId) {
  const t = state.tournament;
  t.finished = true;
  t.winner = winnerId;
  t.stage = 'champion';
  clearTimeout(advanceTimer);
  clearTimeout(interludeTimer);

  renderChampion();
  saveNow();
  showWin(winnerId);
}

function renderChampion() {
  const t = state.tournament;
  const p = participantById(t.winner);
  els.arena.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'champion';

  const kicker = document.createElement('span');
  kicker.className = 'kicker';
  kicker.textContent = 'ŞAMPİYON';

  const photo = document.createElement('div');
  photo.className = 'champion-photo';

  if (p && p.img) {
    const img = document.createElement('img');
    img.src = p.img;
    img.alt = p.name;
    photo.appendChild(img);
  } else {
    const ph = document.createElement('span');
    ph.className = 'initials';
    ph.textContent = p ? initials(p.name) : '?';
    photo.appendChild(ph);
  }

  const name = document.createElement('div');
  name.className = 'champion-name';
  name.textContent = p ? upper(p.name) : '—';

  wrap.append(kicker, photo, name);
  els.arena.appendChild(wrap);
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
/* Demo                                                              */
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

function demoSetup(count = 8) {
  const base = ['Ali', 'Veli', 'Ayşe', 'Zeynep', 'Tunç', 'Taygun', 'Gökçe', 'Melisa'];
  const names = count === 8
    ? base
    : Array.from({ length: count }, (_, i) => `Oyuncu ${String(i + 1).padStart(2, '0')}`);
  state.demo = true;
  state.count = count;
  state.participants = names.map((name, i) => ({
    id: `demo-${i}`,
    name,
    img: demoAvatar(name, i)
  }));
  state.pairs = [];
  state.tournament = null;
  autoPair();
}

function demoCompleteRound(winners) {
  winners.forEach((id) => {
    if (state.tournament.stage !== 'match') return;
    currentMatch().winner = id;
    advanceAfterPick();
  });
}

function runDemo(mode) {
  if (mode === 'gate16') {
    state.demo = true;
    state.count = 0;
    state.participants = [];
    state.pairs = [];
    state.tournament = null;
    showCountScreen();
    setTimeout(() => {
      const btn = document.querySelector('.count-card[data-count="16"]');
      if (btn) btn.click();
    }, 120);
    return;
  }

  const demoCount = mode === 'setup16' ? 16 : mode === 'setup32' ? 32 : 8;
  demoSetup(demoCount);

  if (mode === 'setup' || mode === 'setup16' || mode === 'setup32') {
    showSetup();
    return;
  }

  startTournament(true);

  if (mode === 'auto') {
    const timer = setInterval(() => {
      if (!els.win.classList.contains('hidden')) {
        clearInterval(timer);
        return;
      }
      if (!els.interlude.classList.contains('hidden')) return;
      const active = els.arena.querySelector('.fighter:not(:disabled)');
      if (active) active.click();
    }, 1200);
    return;
  }

  if (mode === 'match') return;

  demoCompleteRound(['demo-0', 'demo-3', 'demo-4', 'demo-7']);

  if (mode === 'interlude') return;

  continueRound();
  if (mode === 'match2') return;

  demoCompleteRound(['demo-0', 'demo-7']);

  if (mode === 'finalIntro') return;

  continueRound();

  if (mode === 'final') return;

  demoCompleteRound(['demo-0']);
}

/* ---------------------------------------------------------------- */
/* Olaylar                                                           */
/* ---------------------------------------------------------------- */

function applyStream() {
  document.body.classList.toggle('stream-mode', state.stream);
  if (els.streamBtn) {
    els.streamBtn.textContent = state.stream ? 'YAYIN MODU: AÇIK' : 'YAYIN MODU';
    els.streamBtn.classList.toggle('on', state.stream);
  }
}

function toggleStream() {
  state.stream = !state.stream;
  try {
    localStorage.setItem('malumfufu.stream', state.stream ? '1' : '0');
  } catch {
    /* yoksay */
  }
  applyStream();
  if (state.stream) toast('Yayın modu açık · çıkmak için Esc');
}

function bind() {
  document.querySelectorAll('.count-card').forEach((btn) => {
    btn.addEventListener('click', () => chooseCount(Number(btn.dataset.count)));
  });

  els.changeCountBtn.addEventListener('click', showCountScreen);
  els.streamBtn.addEventListener('click', toggleStream);
  els.streamExit.addEventListener('click', toggleStream);

  els.shuffleBtn.addEventListener('click', () => {
    state.participants = shuffle(state.participants);
    autoPair();
    renderSetup();
    saveNow();
    toast('Katılımcılar karıştırıldı, eşleşmeler yenilendi.');
  });

  els.clearBtn.addEventListener('click', () => {
    if (!confirm('Tüm isimler ve fotoğraflar silinsin mi?')) return;
    state.participants = defaultParticipants(state.count);
    state.tournament = null;
    autoPair();
    renderSetup();
    saveNow();
  });

  els.startBtn.addEventListener('click', () => startTournament(false));

  els.quitBtn.addEventListener('click', () => {
    if (!confirm('Yarışmadan çıkılsın mı? İsimler, fotoğraflar ve eşleşmeler korunur.')) return;
    clearTimeout(advanceTimer);
    clearTimeout(interludeTimer);
    state.tournament = null;
    showSetup();
    saveNow();
  });

  $('#againBtn').addEventListener('click', () => {
    clearTimeout(advanceTimer);
    clearTimeout(interludeTimer);
    state.tournament = null;
    showSetup();
    saveNow();
  });

  $('#closeWinBtn').addEventListener('click', () => {
    els.win.classList.add('hidden');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!els.win.classList.contains('hidden')) {
      els.win.classList.add('hidden');
      return;
    }
    if (state.stream) toggleStream();
  });
}

/* ---------------------------------------------------------------- */
/* Başlat                                                            */
/* ---------------------------------------------------------------- */

function boot() {
  bind();

  state.stream = localStorage.getItem('malumfufu.stream') === '1';
  applyStream();

  const params = new URLSearchParams(location.search);
  const demo = params.get('demo');

  if (params.get('stream') === '1') {
    state.stream = true;
    applyStream();
  }

  if (demo) {
    runDemo(demo);
    return;
  }

  const loaded = load();

  if (!loaded) {
    state.count = 0;
    state.participants = [];
    state.pairs = [];
  }

  if (state.tournament) {
    if (state.tournament.finished) {
      state.tournament = null;
      saveNow();
      showSetup();
      return;
    }

    if (state.tournament.stage === 'resolving') {
      state.tournament.stage = 'match';
      showGame();
      if (currentMatch().winner) {
        advanceTimer = setTimeout(advanceAfterPick, 400);
      }
      return;
    }

    if (state.tournament.stage === 'interlude') {
      showGame();
      showInterlude(state.tournament.rounds[state.tournament.roundIndex + 1]);
      return;
    }

    showGame();
    return;
  }

  showCountScreen();
}

boot();
