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
function createGame({ id, mode, row = 9, col = 6, players = 2 }) {
  const gameId = id || gameIdCounter++;
  games[gameId] = {
    id: gameId,
    mode, // 'single' or 'multi'
    players: [],
    state: createInitialState(row, col, players),
    currentPlayer: 1,
    status: 'waiting', // 'waiting', 'active', 'finished'
    replayRequests: {}, // Track replay requests: { playerId: boolean }
    replayRequestedBy: null, // Track who requested the replay
    hostPlayerId: null, // Track the host player (first player to join)
    activePlayers: new Set(), // Track currently active players
  };
  return games[gameId];
}

// Log every request
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// REST endpoint: Create a new game
app.post('/api/game', (req, res) => {
  console.log('POST /api/game called', req.body);
  const { id, mode, row, col, players } = req.body;
  if (!['single', 'multi'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode' });
  }
  if (id && games[id]) {
    return res.status(400).json({ error: 'Game ID already exists.' });
  }
  const game = createGame({ id, mode, row, col, players });
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
  game.activePlayers.add(playerId);
  
  // Set the first player as the host
  if (!game.hostPlayerId) {
    game.hostPlayerId = playerId;
  }
  
  if (game.players.length === game.state.players || game.mode === 'single') game.status = 'active';
  res.json({ game, playerId, isHost: playerId === game.hostPlayerId });
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
    socket.gameId = gameId;
    socket.playerId = playerId;
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

  socket.on('exitGame', ({ gameId, playerId }) => {
    const game = games[gameId];
    if (!game || game.mode !== 'multi') return;
    
    // Remove player from active players
    game.activePlayers.delete(playerId);
    
    // If the host exits, close the game for all players
    if (playerId === game.hostPlayerId) {
      io.to(`game_${gameId}`).emit('gameClosedByHost', { 
        gameId, 
        message: 'Game closed: Host has left the game' 
      });
      delete games[gameId];
      return;
    }
    
    // If not the host, reduce player count and notify others
    if (game.activePlayers.size < 2) {
      // Not enough players to continue
      io.to(`game_${gameId}`).emit('gameClosedByHost', { 
        gameId, 
        message: 'Game closed: Not enough players to continue' 
      });
      delete games[gameId];
    } else {
      // Update game state with reduced player count
      game.state.players = game.activePlayers.size;
      
      // Remove the player from active players in game state
      const activePlayerArray = Array.from(game.activePlayers);
      game.state.activePlayers = activePlayerArray;
      
      // Notify remaining players
      io.to(`game_${gameId}`).emit('playerLeft', { 
        gameId, 
        playerId, 
        remainingPlayers: activePlayerArray,
        message: `Player ${playerId} has left the game` 
      });
    }
  });

  socket.on('disconnect', () => {
    if (socket.gameId && socket.playerId) {
      // Handle disconnect the same way as exit
      socket.emit('exitGame', { gameId: socket.gameId, playerId: socket.playerId });
    }
  });

  socket.on('requestReplay', ({ gameId, playerId }) => {
    const game = games[gameId];
    if (!game || game.mode !== 'multi') return;
    
    // Initialize replay requests if not exists
    if (!game.replayRequests) {
      game.replayRequests = {};
    }
    
    // Set the player who requested the replay
    game.replayRequestedBy = playerId;
    game.replayRequests[playerId] = true;
    
    // Notify all players about the replay request
    io.to(`game_${gameId}`).emit('replayRequested', { 
      gameId, 
      requestedBy: playerId,
      message: `Player ${playerId} wants to play again!`
    });
  });

  socket.on('respondToReplay', ({ gameId, playerId, response }) => {
    const game = games[gameId];
    if (!game || game.mode !== 'multi') return;
    
    game.replayRequests[playerId] = response;
    
    // If player refuses to play again, handle it as an exit
    if (!response) {
      // Remove player from active players
      game.activePlayers.delete(playerId);
      
      // If the host refuses, close the game
      if (playerId === game.hostPlayerId) {
        io.to(`game_${gameId}`).emit('gameClosedByHost', { 
          gameId, 
          message: 'Game closed: Host declined to play again' 
        });
        delete games[gameId];
        return;
      }
      
      // If not enough players remain, close the game
      if (game.activePlayers.size < 2) {
        io.to(`game_${gameId}`).emit('gameClosedByHost', { 
          gameId, 
          message: 'Game closed: Not enough players to continue' 
        });
        delete games[gameId];
        return;
      }
      
      // Update game state with reduced player count
      game.state.players = game.activePlayers.size;
      const activePlayerArray = Array.from(game.activePlayers);
      game.state.activePlayers = activePlayerArray;
      
      // Notify remaining players
      io.to(`game_${gameId}`).emit('playerLeft', { 
        gameId, 
        playerId, 
        remainingPlayers: activePlayerArray,
        message: `Player ${playerId} declined to play again and left the game` 
      });
      
      // Reset replay requests and check if remaining players all agreed
      delete game.replayRequests[playerId];
      const activePlayersArray = Array.from(game.activePlayers);
      const allActivePlayersResponded = activePlayersArray.every(pid => game.replayRequests[pid] !== undefined);
      const allActivePlayersAgreed = activePlayersArray.every(pid => game.replayRequests[pid] === true);
      
      if (allActivePlayersResponded && allActivePlayersAgreed) {
        // Reset the game state for remaining players
        game.state = createInitialState(game.state.row, game.state.col, game.activePlayers.size);
        game.status = 'active';
        game.replayRequests = {};
        game.replayRequestedBy = null;
        
        // Notify remaining players that the game is restarting
        io.to(`game_${gameId}`).emit('gameRestarted', { gameId, state: game.state });
      }
      
      return;
    }
    
    // Check if all active players have responded
    const activePlayersArray = Array.from(game.activePlayers);
    const allActivePlayersResponded = activePlayersArray.every(pid => game.replayRequests[pid] !== undefined);
    const allActivePlayersAgreed = activePlayersArray.every(pid => game.replayRequests[pid] === true);
    
    if (allActivePlayersResponded) {
      if (allActivePlayersAgreed) {
        // Reset the game state
        game.state = createInitialState(game.state.row, game.state.col, game.activePlayers.size);
        game.status = 'active';
        game.replayRequests = {};
        game.replayRequestedBy = null;
        
        // Notify all players that the game is restarting
        io.to(`game_${gameId}`).emit('gameRestarted', { gameId, state: game.state });
      } else {
        // Not all players agreed, cancel the replay
        game.replayRequests = {};
        game.replayRequestedBy = null;
        
        io.to(`game_${gameId}`).emit('replayCancelled', { gameId });
      }
    } else {
      // Update other players about the response
      io.to(`game_${gameId}`).emit('replayResponse', { 
        gameId, 
        playerId, 
        response,
        waitingFor: activePlayersArray.filter(pid => game.replayRequests[pid] === undefined)
      });
    }
  });

  socket.on('surrenderGame', ({ gameId, playerId }) => {
    const game = games[gameId];
    if (!game || game.status !== 'active') return;
    
    // Remove player from active players
    game.activePlayers.delete(playerId);
    
    // If the host surrenders, close the game for all players
    if (playerId === game.hostPlayerId) {
      io.to(`game_${gameId}`).emit('gameClosedByHost', { 
        gameId, 
        message: 'Game closed: Host has surrendered' 
      });
      delete games[gameId];
      return;
    }
    
    // If not enough players remain, close the game
    if (game.activePlayers.size < 2) {
      io.to(`game_${gameId}`).emit('gameClosedByHost', { 
        gameId, 
        message: 'Game closed: Not enough players to continue' 
      });
      delete games[gameId];
    } else {
      // Update game state with reduced player count
      game.state.players = game.activePlayers.size;
      
      // Remove the player from active players in game state
      const activePlayerArray = Array.from(game.activePlayers);
      game.state.activePlayers = activePlayerArray;
      
      // Check if there's only one player left - they win
      if (game.activePlayers.size === 1) {
        const winner = activePlayerArray[0];
        game.state.status = 'finished';
        game.state.winner = winner;
        io.to(`game_${gameId}`).emit('gameOver', { winner });
      } else {
        // Notify remaining players about the surrender
        io.to(`game_${gameId}`).emit('playerSurrendered', { 
          gameId, 
          playerId, 
          remainingPlayers: activePlayerArray,
          message: `Player ${playerId} has surrendered` 
        });
        
        // Update the game state for remaining players
        io.to(`game_${gameId}`).emit('gameUpdate', { gameId, state: game.state });
      }
    }
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
