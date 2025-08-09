const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createInitialState, applyMove, checkWin } = require('./gameLogic');

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for debugging
    methods: ['GET', 'POST'],
    credentials: false
  }
});

// Configure CORS for Express
app.use(cors({
  origin: "*", // Allow all origins for debugging
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Origin: ${req.get('Origin') || 'none'}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'chain-reaction-backend',
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'Chain Reaction Backend Server', 
    status: 'running',
    endpoints: ['/api/game', '/health'],
    timestamp: new Date().toISOString()
  });
});

// In-memory store for games
const games = {};
let gameIdCounter = 1;

// Generate a unique alphanumeric Game/Room ID
function generateRoomCode() {
  let roomCode;
  let attempts = 0;
  const maxAttempts = 10;
  
  do {
    roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
    attempts++;
  } while (games[roomCode] && attempts < maxAttempts);
  
  if (attempts >= maxAttempts) {
    // Fallback to timestamp-based code if too many collisions
    roomCode = Date.now().toString(36).toUpperCase().substr(-6);
  }
  
  return roomCode;
}

// Helper: Create a new game session
function createGame({ id, mode, row = 9, col = 6, players = 2 }) {
  // For multiplayer room-based games, use alphanumeric room codes
  // For single player games, use incrementing numbers for simplicity
  const gameId = id || (mode === 'multi' ? generateRoomCode() : gameIdCounter++);
  
  const initialState = createInitialState(row, col, players);
  
  games[gameId] = {
    id: gameId,
    mode, // 'single' or 'multi'
    players: [],
    playerUsernames: {}, // Track player usernames
    state: initialState,
    currentPlayer: 1,
    status: 'waiting', // 'waiting', 'active', 'finished'
    replayRequests: {}, // Track replay requests: { playerId: boolean }
    replayRequestedBy: null, // Track who requested the replay
    hostPlayerId: null, // Track the host player (first player to join)
    activePlayers: new Set(), // Track currently active players - CONVERT TO SET!
  };
  return games[gameId];
}

// Helper: Completely reset game state while preserving player information
function resetGameState(game) {
  // For Play Again, restore ALL original players (not just currently active ones)
  const allOriginalPlayers = game.players; // Use all original players
  const originalRow = game.state.row;
  const originalCol = game.state.col;
  
  // Create completely fresh game state with all original players
  game.state = createInitialState(originalRow, originalCol, allOriginalPlayers.length);
  
  // Restore all original players
  game.state.activePlayers = [...allOriginalPlayers];
  game.state.currentPlayer = allOriginalPlayers[0]; // Start with first player
  
  // Reset all game status and clear surrendered players
  game.status = 'active';
  game.surrenderedPlayers = new Set(); // Clear all surrendered players
  game.replayRequests = {};
  game.replayRequestedBy = null;
  
  // Make sure activePlayers set includes all original players again
  game.activePlayers = new Set(allOriginalPlayers);
  
  return game.state;
}

// Log every request
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    server: 'Chain Reaction Backend'
  });
});

// CORS preflight handler
app.options('*', cors());

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
  console.log(`POST /api/game/${req.params.id}/join called`, req.body);
  const { username } = req.body;
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.players.length >= game.state.players) return res.status(400).json({ error: 'Game full' });
  const playerId = game.players.length + 1;
  game.players.push(playerId);
  game.activePlayers.add(playerId);
  
  // Store username for this player
  if (username) {
    game.playerUsernames[playerId] = username;
  }
  
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
    
    // Use the correct room format based on game mode
    const roomName = game.mode === 'multi' ? `room_${gameId}` : `game_${gameId}`;
    
    game.state = applyMove(game.state, move, playerId);
    io.to(roomName).emit('gameUpdate', { gameId, state: game.state });
    if (game.state.status === 'finished') {
      io.to(roomName).emit('gameOver', { winner: game.state.winner });
    }
  });

  socket.on('exitGame', ({ gameId, playerId }) => {
    const game = games[gameId];
    if (!game || game.mode !== 'multi') return;
    
    // Use the correct room format for multiplayer games
    const roomName = game.mode === 'multi' ? `room_${gameId}` : `game_${gameId}`;
    
    // Remove player from active players
    game.activePlayers.delete(playerId);
    
    // If the host exits, close the game for all players
    if (playerId === game.hostPlayerId) {
      io.to(roomName).emit('gameClosedByHost', { 
        gameId, 
        message: 'Game closed: Host has left the game' 
      });
      delete games[gameId];
      return;
    }
    
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
      io.to(roomName).emit('gameOver', { winner });
    } else if (game.activePlayers.size < 1) {
      // If no players remain, close the game
      io.to(roomName).emit('gameClosedByHost', { 
        gameId, 
        message: 'Game closed: No players remaining' 
      });
      delete games[gameId];
    } else {
      // Notify remaining players
      io.to(roomName).emit('playerLeft', { 
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
    
    // Use the correct room format for multiplayer games
    const roomName = game.mode === 'multi' ? `room_${gameId}` : `game_${gameId}`;
    
    // Notify all players about the replay request
    io.to(roomName).emit('replayRequested', { 
      gameId, 
      requestedBy: playerId,
      message: `Player ${playerId} wants to play again!`
    });
  });

  socket.on('respondToReplay', ({ gameId, playerId, response }) => {
    const game = games[gameId];
    if (!game || game.mode !== 'multi') return;
    
    // Use the correct room format for multiplayer games
    const roomName = game.mode === 'multi' ? `room_${gameId}` : `game_${gameId}`;
    
    game.replayRequests[playerId] = response;
    
    // If player refuses to play again, handle it as an exit
    if (!response) {
      // Remove player from active players
      game.activePlayers.delete(playerId);
      
      // If the host refuses, close the game
      if (playerId === game.hostPlayerId) {
        io.to(roomName).emit('gameClosedByHost', { 
          gameId, 
          message: 'Game closed: Host declined to play again' 
        });
        delete games[gameId];
        return;
      }
      
      // Update game state with reduced player count
      game.state.players = game.activePlayers.size;
      const activePlayerArray = Array.from(game.activePlayers);
      game.state.activePlayers = activePlayerArray;
      
      // Check if there's only one player left - they win
      if (game.activePlayers.size === 1) {
        const winner = activePlayerArray[0];
        game.state.status = 'finished';
        game.state.winner = winner;
        io.to(roomName).emit('gameOver', { winner });
        return;
      } else if (game.activePlayers.size < 1) {
        // If no players remain, close the game
        io.to(roomName).emit('gameClosedByHost', { 
          gameId, 
          message: 'Game closed: No players remaining' 
        });
        delete games[gameId];
        return;
      }
      
      // Notify remaining players
      io.to(roomName).emit('playerLeft', { 
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
        // Completely reset the game state while preserving player information
        const newState = resetGameState(game);
        
        // Notify remaining players that the game is restarting
        io.to(roomName).emit('gameRestarted', { gameId, state: newState });
      }
      
      return;
    }
    
    // Check if all active players have responded
    const activePlayersArray = Array.from(game.activePlayers);
    const allActivePlayersResponded = activePlayersArray.every(pid => game.replayRequests[pid] !== undefined);
    const allActivePlayersAgreed = activePlayersArray.every(pid => game.replayRequests[pid] === true);
    
    if (allActivePlayersResponded) {
      if (allActivePlayersAgreed) {
        // Completely reset the game state while preserving player information  
        const newState = resetGameState(game);
        
        // Notify all players that the game is restarting
        io.to(roomName).emit('gameRestarted', { gameId, state: newState });
      } else {
        // Not all players agreed, cancel the replay
        game.replayRequests = {};
        game.replayRequestedBy = null;
        
        io.to(roomName).emit('replayCancelled', { gameId });
      }
    } else {
      // Update other players about the response
      io.to(roomName).emit('replayResponse', { 
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
    
    // Use the correct room format for multiplayer games
    const roomName = game.mode === 'multi' ? `room_${gameId}` : `game_${gameId}`;
    
    // Remove player from active players
    game.activePlayers.delete(playerId);
    
    // If the host surrenders, close the game for all players
    if (playerId === game.hostPlayerId) {
      io.to(roomName).emit('gameClosedByHost', { 
        gameId, 
        message: 'Game closed: Host has surrendered' 
      });
      delete games[gameId];
      return;
    }
    
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
      io.to(roomName).emit('gameOver', { winner });
    } else if (game.activePlayers.size < 1) {
      // If no players remain, close the game
      io.to(roomName).emit('gameClosedByHost', { 
        gameId, 
        message: 'Game closed: No players remaining' 
      });
      delete games[gameId];
    } else {
      // Notify remaining players about the surrender
      io.to(roomName).emit('playerSurrendered', { 
        gameId, 
        playerId, 
        remainingPlayers: activePlayerArray,
        message: `Player ${playerId} has surrendered` 
      });
      
      // Update the game state for remaining players
      io.to(roomName).emit('gameUpdate', { gameId, state: game.state });
    }
  });

  // Room-based multiplayer handlers
  socket.on('createRoom', ({ username }) => {
    const game = createGame({ mode: 'multi', players: 2 });
    const roomCode = game.id.toString();
    const playerId = 1;
    
    game.players.push(playerId);
    game.activePlayers.add(playerId);
    game.hostPlayerId = playerId;
    game.playerUsernames[playerId] = username || 'Player 1';
    
    socket.join(`room_${roomCode}`);
    socket.roomCode = roomCode;
    socket.playerId = playerId;
    socket.username = username;
    
    socket.emit('roomCreated', { 
      roomCode, 
      playerId, 
      username,
      isHost: true,
      game 
    });
  });

  socket.on('joinRoom', ({ roomCode, username }) => {
    const game = games[roomCode];
    if (!game) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    if (game.players.length >= game.state.players) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }
    
    const playerId = game.players.length + 1;
    game.players.push(playerId);
    game.activePlayers.add(playerId);
    game.playerUsernames[playerId] = username || `Player ${playerId}`;
    
    socket.join(`room_${roomCode}`);
    socket.roomCode = roomCode;
    socket.playerId = playerId;
    socket.username = username;
    
    // Start the game if we have enough players
    if (game.players.length === game.state.players) {
      game.status = 'active';
    }
    
    // Notify all players in the room
    io.to(`room_${roomCode}`).emit('playerJoined', {
      roomCode,
      playerId,
      username,
      playerUsernames: game.playerUsernames,
      game
    });
    
    socket.emit('roomJoined', { 
      roomCode, 
      playerId, 
      username,
      isHost: false,
      game 
    });
  });

  socket.on('makeMove', ({ roomCode, move, username }) => {
    const game = games[roomCode];
    if (!game || game.status !== 'active') return;
    
    const playerId = socket.playerId;
    if (!playerId || game.state.currentPlayer !== playerId) return;
    
    game.state = applyMove(game.state, move, playerId);
    
    io.to(`room_${roomCode}`).emit('gameUpdate', { 
      roomCode, 
      state: game.state,
      playerUsernames: game.playerUsernames
    });
    
    if (game.state.status === 'finished') {
      const winnerUsername = game.playerUsernames[game.state.winner] || `Player ${game.state.winner}`;
      io.to(`room_${roomCode}`).emit('gameOver', { 
        winner: game.state.winner,
        winnerUsername,
        playerUsernames: game.playerUsernames
      });
    }
  });
});

const PORT = process.env.PORT || 5000;

// Add error handling for server
server.on('error', (error) => {
  console.error('Server error:', error);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
