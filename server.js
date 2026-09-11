const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let oyunDurumu = {
  isSetup: false,
  board: [],
  currentTurn: 'red'
};

io.on('connection', (socket) => {
  console.log('Yeni oyuncu bağlandı:', socket.id);

  socket.emit('gameUpdate', oyunDurumu);

  // Yönetici 20 Kelimelik Özel Tahtayı Başlattığında
  socket.on('setupCustomGame', (customBoard) => {
    oyunDurumu = {
      isSetup: true,
      board: customBoard,
      currentTurn: 'red'
    };
    io.emit('gameUpdate', oyunDurumu);
  });

  socket.on('clickCard', (cardId) => {
    if (!oyunDurumu.isSetup) return;

    let kart = oyunDurumu.board.find(k => k.id === cardId);
    if (kart && !kart.revealed) {
      kart.revealed = true;

      if (kart.type !== oyunDurumu.currentTurn) {
        oyunDurumu.currentTurn = oyunDurumu.currentTurn === 'red' ? 'blue' : 'red';
      }

      io.emit('gameUpdate', oyunDurumu);
    }
  });

  socket.on('endTurn', () => {
    if (!oyunDurumu.isSetup) return;
    oyunDurumu.currentTurn = oyunDurumu.currentTurn === 'red' ? 'blue' : 'red';
    io.emit('gameUpdate', oyunDurumu);
  });

  socket.on('resetToSetup', () => {
    oyunDurumu.isSetup = false;
    oyunDurumu.board = [];
    io.emit('gameUpdate', oyunDurumu);
  });

  socket.on('disconnect', () => {
    console.log('Oyuncu ayrıldı:', socket.id);
  });
});

server.listen(3000, () => {
  console.log('Sunucu 3000 portunda çalışıyor: http://localhost:3000');
});