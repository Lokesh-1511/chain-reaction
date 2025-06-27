const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createInitialState, applyMove, checkWin } = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// In-memory store for games
const games = {};
let gameIdCounter = 1;

// Helper: Create a new game session
function createGame({ mode, row = 9, col = 6, players = 2 }) {
  const id = gameIdCounter++;
  games[id] = {
    id,
    mode, // 'single' or 'multi'
    players: [],
    state: createInitialState(row, col, players),
    currentPlayer: 1,
    status: 'waiting', // 'waiting', 'active', 'finished'
  };
  return games[id];
}

// Log every request
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// REST endpoint: Create a new game
app.post('/api/game', (req, res) => {
  console.log('POST /api/game called', req.body);
  const { mode, row, col, players } = req.body;
  if (!['single', 'multi'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode' });
  }
  const game = createGame({ mode, row, col, players });
  res.json(game);
});

// REST endpoint: Join a game
app.post('/api/game/:id/join', (req, res) => {
  console.log(`POST /api/game/${req.params.id}/join called`);
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.players.length >= game.state.players) return res.status(400).json({ error: 'Game full' });
  const playerId = game.players.length + 1;
  game.players.push(playerId);
  if (game.players.length === game.state.players || game.mode === 'single') game.status = 'active';
  res.json({ game, playerId });
});

// REST endpoint: Get game state
app.get('/api/game/:id', (req, res) => {
  console.log(`GET /api/game/${req.params.id} called`);
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

// Socket.IO: Handle moves and real-time updates
io.on('connection', (socket) => {
  socket.on('joinGame', ({ gameId, playerId }) => {
    socket.join(`game_${gameId}`);
    socket.emit('joined', { gameId, playerId });
  });

  socket.on('makeMove', ({ gameId, playerId, move }) => {
    const game = games[gameId];
    if (!game || game.status !== 'active') return;
    game.state = applyMove(game.state, move, playerId);
    io.to(`game_${gameId}`).emit('gameUpdate', { gameId, state: game.state });
    if (game.state.status === 'finished') {
      io.to(`game_${gameId}`).emit('gameOver', { winner: game.state.winner });
    }
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
