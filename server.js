'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 100 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2'
};

/* ------------------------------------------------------------------ */
/* Oyun durumu                                                         */
/* ------------------------------------------------------------------ */

function freshGame(series) {
  return {
    phase: 'setup',          // 'setup' | 'playing'
    board: [],
    turn: 'purple',          // 'purple' | 'yellow'
    winner: null,            // null | 'purple' | 'yellow'
    series: series || { purple: 0, yellow: 0 },
    updatedAt: Date.now()
  };
}

let game = freshGame();
const sseClients = new Set();

function broadcast() {
  game.updatedAt = Date.now();
  const payload = `data: ${JSON.stringify(game)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

function other(team) {
  return team === 'purple' ? 'yellow' : 'purple';
}

/* ------------------------------------------------------------------ */
/* Doğrulama                                                           */
/* ------------------------------------------------------------------ */

const TEAMS = new Set(['purple', 'yellow', 'neutral']);

function validateBoard(board) {
  if (!Array.isArray(board) || board.length !== 20) {
    return 'Tam 20 kart gerekiyor.';
  }
  const seen = new Set();
  for (const card of board) {
    if (!card || typeof card.word !== 'string') return 'Geçersiz kart verisi.';
    const word = card.word.trim().replace(/\s+/g, ' ');
    if (!word) return 'Boş isim bırakılamaz.';
    if (word.length > 32) return `İsim çok uzun: ${word.slice(0, 32)}…`;
    if (!TEAMS.has(card.type)) return 'Geçersiz takım rengi.';
    const key = word.toLocaleUpperCase('en-US');
    if (seen.has(key)) return `Aynı isim iki kez girilmiş: ${word}`;
    seen.add(key);
  }
  const count = (t) => board.filter((c) => c.type === t).length;
  if (count('purple') !== 8) return 'Mor takımda tam 8 isim olmalı.';
  if (count('yellow') !== 8) return 'Sarı takımda tam 8 isim olmalı.';
  if (count('neutral') !== 4) return 'Tam 4 sivil isim olmalı.';
  return null;
}

function sanitizeWord(word) {
  return word.trim().replace(/\s+/g, ' ').slice(0, 32).toLocaleUpperCase('en-US');
}

/* ------------------------------------------------------------------ */
/* Aksiyonlar                                                          */
/* ------------------------------------------------------------------ */

function startGame(board) {
  const error = validateBoard(board);
  if (error) return { ok: false, error };

  game = {
    phase: 'playing',
    board: board.map((card, i) => ({
      id: i,
      word: sanitizeWord(card.word),
      type: card.type,
      revealed: false
    })),
    turn: 'purple',
    winner: null,
    series: game.series,
    updatedAt: Date.now()
  };
  broadcast();
  return { ok: true };
}

function revealCard(id) {
  if (game.phase !== 'playing' || game.winner) return { ok: false, error: 'Oyun aktif değil.' };
  const card = game.board.find((c) => c.id === id);
  if (!card) return { ok: false, error: 'Kart bulunamadı.' };
  if (card.revealed) return { ok: false, error: 'Bu kart zaten açık.' };

  card.revealed = true;

  // Yanlış tahmin (rakip ya da sivil) sırayı rakibe geçirir.
  if (card.type === 'neutral' || card.type !== game.turn) {
    game.turn = other(game.turn);
  }

  const remaining = (team) => game.board.filter((c) => c.type === team && !c.revealed).length;
  if (remaining('purple') === 0) game.winner = 'purple';
  else if (remaining('yellow') === 0) game.winner = 'yellow';

  if (game.winner) game.series[game.winner] += 1;

  broadcast();
  return { ok: true };
}

function endTurn() {
  if (game.phase !== 'playing' || game.winner) return { ok: false, error: 'Oyun aktif değil.' };
  game.turn = other(game.turn);
  broadcast();
  return { ok: true };
}

function resetGame() {
  game = freshGame(game.series);
  broadcast();
  return { ok: true };
}

function resetSeries() {
  game = freshGame({ purple: 0, yellow: 0 });
  broadcast();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* HTTP yardımcıları                                                   */
/* ------------------------------------------------------------------ */

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Gövde çok büyük.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Geçersiz JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bulunamadı');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(data);
  });
}

/* ------------------------------------------------------------------ */
/* Sunucu                                                              */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  // Canlı akış (Server-Sent Events)
  if (pathname === '/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 1500\n\n');
    res.write(`data: ${JSON.stringify(game)}\n\n`);
    sseClients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
    return;
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    return sendJson(res, 200, game);
  }

  if (pathname === '/api/start' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const result = startGame(body.board);
      return sendJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.message });
    }
  }

  if (pathname === '/api/reveal' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const result = revealCard(Number(body.id));
      return sendJson(res, result.ok ? 200 : 400, result);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.message });
    }
  }

  if (pathname === '/api/end-turn' && req.method === 'POST') {
    const result = endTurn();
    return sendJson(res, result.ok ? 200 : 400, result);
  }

  if (pathname === '/api/reset' && req.method === 'POST') {
    return sendJson(res, 200, resetGame());
  }

  if (pathname === '/api/reset-series' && req.method === 'POST') {
    return sendJson(res, 200, resetSeries());
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { ok: false, error: 'Desteklenmeyen metot.' });
  }

  // Statik dosyalar
  let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Yasak');
  }
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bulunamadı');
  }
  serveFile(res, resolved);
});

server.listen(PORT, () => {
  console.log(`Malum Mecra ${PORT} portunda çalışıyor → http://localhost:${PORT}`);
});
