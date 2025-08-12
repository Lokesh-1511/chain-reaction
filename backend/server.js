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
    players: [], // Array of player IDs that joined the game
    playerUsernames: {}, // Map player ID to username
    state: initialState,
    status: 'waiting', // 'waiting', 'active', 'finished'
    replayRequests: {}, // Track replay requests: { playerId: boolean }
    replayRequestedBy: null, // Track who requested the replay
    hostPlayerId: null, // Track the host player (first player to join)
    activePlayers: new Set(), // Set of currently active player IDs
    surrenderedPlayers: new Set(), // Set of surrendered players
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

// Helper: Get correct room name for socket operations
function getRoomName(gameId, mode) {
  return mode === 'multi' ? `room_${gameId}` : `game_${gameId}`;
}

// Helper: Remove player from game
function removePlayerFromGame(game, playerId, reason = 'left') {
  // Remove from active players
  game.activePlayers.delete(playerId);
  
  // Update game state
  game.state.players = game.activePlayers.size;
  const activePlayerArray = Array.from(game.activePlayers);
  game.state.activePlayers = activePlayerArray;
  
  return {
    activePlayerArray,
    shouldEndGame: game.activePlayers.size <= 1,
    winner: game.activePlayers.size === 1 ? activePlayerArray[0] : null
  };
}

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
  
  if (game.players.length === game.state.players || game.mode === 'single') {
    game.status = 'active';
  }
  
  res.json({ game, playerId, isHost: playerId === game.hostPlayerId });
});

// REST endpoint: Get game state
app.get('/api/game/:id', (req, res) => {
  console.log(`GET /api/game/${req.params.id} called`);
  const game = games[req.params.id];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

// ========== USER PROFILE API ==========
// In-memory user store (in production, use a database)
const users = new Map();

// Create or get user profile
app.post('/api/user/profile', (req, res) => {
  try {
    const { username, avatar } = req.body;
    
    if (!username || username.trim().length === 0) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const userId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const userProfile = {
      id: userId,
      username: username.trim(),
      avatar: avatar || username.charAt(0).toUpperCase(),
      createdAt: new Date().toISOString(),
      gamesPlayed: 0,
      gamesWon: 0
    };

    users.set(userId, userProfile);
    
    console.log(`👤 User profile created: ${username} (${userId})`);
    res.json(userProfile);
    
  } catch (error) {
    console.error('Error creating user profile:', error);
    res.status(500).json({ error: 'Failed to create user profile' });
  }
});

// Get user profile
app.get('/api/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const user = users.get(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
    
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Update user stats
app.put('/api/user/:userId/stats', (req, res) => {
  try {
    const { userId } = req.params;
    const { won } = req.body;
    
    const user = users.get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.gamesPlayed++;
    if (won) {
      user.gamesWon++;
    }
    
    users.set(userId, user);
    res.json(user);
    
  } catch (error) {
    console.error('Error updating user stats:', error);
    res.status(500).json({ error: 'Failed to update user stats' });
  }
});

// Socket.IO: Handle all multiplayer interactions
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // ========== OLD MULTIPLAYER SYSTEM (gameId-based) ==========
  socket.on('joinGame', ({ gameId, playerId }) => {
    console.log(`🎮 joinGame: gameId=${gameId}, playerId=${playerId}`);
    const game = games[gameId];
    if (!game) {
      console.log(`❌ Game not found: ${gameId}`);
      return;
    }
    
    const roomName = getRoomName(gameId, game.mode);
    socket.join(roomName);
    socket.gameId = gameId;
    socket.playerId = playerId;
    
    console.log(`✅ Player ${playerId} joined room: ${roomName}`);
    socket.emit('joined', { gameId, playerId });
  });

  socket.on('makeMove', ({ gameId, playerId, move }) => {
    console.log(`🎯 makeMove: gameId=${gameId}, playerId=${playerId}, move=${JSON.stringify(move)}`);
    const game = games[gameId];
    if (!game || game.status !== 'active') {
      console.log(`❌ Invalid move: game not found or not active`);
      return;
    }
    
    const roomName = getRoomName(gameId, game.mode);
    game.state = applyMove(game.state, move, playerId);
    
    io.to(roomName).emit('gameUpdate', { gameId, state: game.state });
    
    if (game.state.status === 'finished') {
      io.to(roomName).emit('gameOver', { winner: game.state.winner });
    }
  });

  // ========== NEW MULTIPLAYER SYSTEM (roomCode-based) ==========
  socket.on('createRoom', ({ username }) => {
    console.log(`🏠 createRoom: username=${username}`);
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
    
    console.log(`✅ Room created: ${roomCode}, host: ${playerId}`);
    socket.emit('roomCreated', { 
      roomCode, 
      playerId, 
      username,
      isHost: true,
      game 
    });
  });

  socket.on('joinRoom', ({ roomCode, username }) => {
    console.log(`🚪 joinRoom: roomCode=${roomCode}, username=${username}`);
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
    
    console.log(`✅ Player ${playerId} joined room: ${roomCode}`);
    
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

  // Handle moves for room-based system
  socket.on('makeMove', ({ roomCode, move, username }) => {
    console.log(`🎯 makeMove (room): roomCode=${roomCode}, playerId=${socket.playerId}, move=${JSON.stringify(move)}`);
    const game = games[roomCode];
    if (!game || game.status !== 'active') {
      console.log(`❌ Invalid move: game not found or not active`);
      return;
    }
    
    const playerId = socket.playerId;
    if (!playerId || game.state.currentPlayer !== playerId) {
      console.log(`❌ Invalid move: not player's turn`);
      return;
    }
    
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

  // ========== UNIFIED REPLAY SYSTEM ==========
  // Handle replay requests for both systems
  socket.on('requestReplay', ({ gameId, roomCode, playerId }) => {
    const id = gameId || roomCode;
    const game = games[id];
    
    console.log(`🔄 Replay request: id=${id}, playerId=${playerId}`);
    
    if (!game) {
      console.log(`❌ Game not found for replay: ${id}`);
      return;
    }
    
    console.log(`📊 Game state: activePlayers=${Array.from(game.activePlayers)}, players=${game.players}`);
    
    // Initialize replay requests if not exists
    if (!game.replayRequests) {
      game.replayRequests = {};
    }
    
    // Set the player who requested the replay
    game.replayRequestedBy = playerId;
    game.replayRequests[playerId] = true;
    
    const roomName = getRoomName(id, game.mode);
    const eventData = {
      requestedBy: playerId,
      message: `${game.playerUsernames[playerId] || `Player ${playerId}`} wants to play again!`
    };
    
    // Add both gameId and roomCode for compatibility
    if (gameId) eventData.gameId = gameId;
    if (roomCode) eventData.roomCode = roomCode;
    
    console.log(`📤 Emitting replayRequested to room: ${roomName}`);
    io.to(roomName).emit('replayRequested', eventData);
  });

  socket.on('respondToReplay', ({ gameId, roomCode, playerId, response }) => {
    const id = gameId || roomCode;
    const game = games[id];
    
    console.log(`🎯 Replay response: id=${id}, playerId=${playerId}, response=${response}`);
    
    if (!game) {
      console.log(`❌ Game not found for replay response: ${id}`);
      return;
    }
    
    game.replayRequests[playerId] = response;
    const roomName = getRoomName(id, game.mode);
    
    console.log(`📊 Replay requests: ${JSON.stringify(game.replayRequests)}`);
    console.log(`👥 Active players: ${Array.from(game.activePlayers)}`);
    
    // If player refuses to play again, handle as exit
    if (!response) {
      const result = removePlayerFromGame(game, playerId, 'declined replay');
      
      if (playerId === game.hostPlayerId) {
        console.log(`🏠 Host declined replay, closing game`);
        const eventData = { message: 'Game closed: Host declined to play again' };
        if (gameId) eventData.gameId = gameId;
        if (roomCode) eventData.roomCode = roomCode;
        
        io.to(roomName).emit('gameClosedByHost', eventData);
        delete games[id];
        return;
      }
      
      if (result.shouldEndGame && result.winner) {
        const eventData = { 
          winner: result.winner,
          winnerUsername: game.playerUsernames[result.winner] || `Player ${result.winner}`,
          playerUsernames: game.playerUsernames
        };
        
        console.log(`🏆 Game over due to replay decline: winner=${result.winner}`);
        io.to(roomName).emit('gameOver', eventData);
        return;
      }
      
      // Remove from replay requests
      delete game.replayRequests[playerId];
    }
    
    // Check if all active players have responded
    const activePlayersArray = Array.from(game.activePlayers);
    const allActivePlayersResponded = activePlayersArray.every(pid => game.replayRequests[pid] !== undefined);
    const allActivePlayersAgreed = activePlayersArray.every(pid => game.replayRequests[pid] === true);
    
    console.log(`🔍 Response check: activePlayersArray=${activePlayersArray}, allResponded=${allActivePlayersResponded}, allAgreed=${allActivePlayersAgreed}`);
    
    if (allActivePlayersResponded) {
      if (allActivePlayersAgreed) {
        console.log(`🎮 All players agreed! Restarting game: ${id}`);
        const newState = resetGameState(game);
        
        const eventData = { state: newState };
        if (gameId) eventData.gameId = gameId;
        if (roomCode) eventData.roomCode = roomCode;
        
        io.to(roomName).emit('gameRestarted', eventData);
      } else {
        console.log(`❌ Not all players agreed, cancelling replay: ${id}`);
        game.replayRequests = {};
        game.replayRequestedBy = null;
        
        const eventData = {};
        if (gameId) eventData.gameId = gameId;
        if (roomCode) eventData.roomCode = roomCode;
        
        io.to(roomName).emit('replayCancelled', eventData);
      }
    } else {
      const waitingFor = activePlayersArray.filter(pid => game.replayRequests[pid] === undefined);
      console.log(`⏳ Still waiting for responses from: ${waitingFor}`);
      
      const eventData = {
        playerId,
        response,
        waitingFor
      };
      if (gameId) eventData.gameId = gameId;
      if (roomCode) eventData.roomCode = roomCode;
      
      io.to(roomName).emit('replayResponse', eventData);
    }
  });

  // ========== UNIFIED EXIT/SURRENDER SYSTEM ==========
  socket.on('exitGame', ({ gameId, playerId }) => {
    handlePlayerExit(gameId, playerId, 'exit', false);
  });

  socket.on('exitRoom', ({ roomCode, playerId }) => {
    handlePlayerExit(roomCode, playerId, 'exit', true);
  });

  socket.on('surrenderGame', ({ gameId, playerId }) => {
    handlePlayerExit(gameId, playerId, 'surrender', false);
  });

  socket.on('surrenderRoom', ({ roomCode, playerId }) => {
    handlePlayerExit(roomCode, playerId, 'surrender', true);
  });

  function handlePlayerExit(id, playerId, action, isRoom) {
    console.log(`🚪 Player ${action}: id=${id}, playerId=${playerId}, isRoom=${isRoom}`);
    const game = games[id];
    if (!game) {
      console.log(`❌ Game not found for ${action}: ${id}`);
      return;
    }
    
    const roomName = getRoomName(id, game.mode);
    const result = removePlayerFromGame(game, playerId, action);
    
    // If surrender, mark player as surrendered
    if (action === 'surrender') {
      game.surrenderedPlayers.add(playerId);
    }
    
    // If host exits/surrenders, close game
    if (playerId === game.hostPlayerId) {
      console.log(`🏠 Host ${action}, closing game`);
      const eventData = { 
        message: `Game closed: Host has ${action === 'surrender' ? 'surrendered' : 'left the game'}` 
      };
      if (!isRoom) eventData.gameId = id;
      if (isRoom) eventData.roomCode = id;
      
      io.to(roomName).emit('gameClosedByHost', eventData);
      delete games[id];
      return;
    }
    
    // Check if game should end
    if (result.shouldEndGame) {
      if (result.winner) {
        console.log(`🏆 Game over due to ${action}: winner=${result.winner}`);
        const eventData = {
          winner: result.winner,
          winnerUsername: game.playerUsernames[result.winner] || `Player ${result.winner}`,
          playerUsernames: game.playerUsernames
        };
        
        // Set game status to finished
        game.state.status = 'finished';
        game.state.winner = result.winner;
        
        io.to(roomName).emit('gameOver', eventData);
      } else {
        console.log(`🚫 No players remaining, closing game`);
        const eventData = { 
          message: 'Game closed: No players remaining' 
        };
        if (!isRoom) eventData.gameId = id;
        if (isRoom) eventData.roomCode = id;
        
        io.to(roomName).emit('gameClosedByHost', eventData);
        delete games[id];
      }
      return; // Important: return here to prevent further notifications
    }
    
    // Notify remaining players
    const eventType = action === 'surrender' ? 'playerSurrendered' : 'playerLeft';
    const eventData = {
      playerId,
      remainingPlayers: result.activePlayerArray,
      message: `${game.playerUsernames[playerId] || `Player ${playerId}`} has ${action === 'surrender' ? 'surrendered' : 'left the game'}`
    };
    if (!isRoom) eventData.gameId = id;
    if (isRoom) eventData.roomCode = id;
    
    console.log(`📤 Emitting ${eventType} to room: ${roomName}`);
    io.to(roomName).emit(eventType, eventData);
    
    // For surrender, also update game state
    if (action === 'surrender') {
      const updateData = { 
        state: game.state,
        playerUsernames: game.playerUsernames
      };
      if (!isRoom) updateData.gameId = id;
      if (isRoom) updateData.roomCode = id;
      
      io.to(roomName).emit('gameUpdate', updateData);
    }
  }

  // Handle socket disconnection
  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
    if (socket.gameId && socket.playerId) {
      handlePlayerExit(socket.gameId, socket.playerId, 'disconnect', false);
    }
    if (socket.roomCode && socket.playerId) {
      handlePlayerExit(socket.roomCode, socket.playerId, 'disconnect', true);
    }
  });
});

const PORT = process.env.PORT || 5000;

// Add error handling for server
server.on('error', (error) => {
  console.error('Server error:', error);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
