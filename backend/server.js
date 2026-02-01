require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createInitialState, applyMove, checkWin } = require('./gameLogic');
const db = require('./db');

// Initialize Firebase
db.initializeFirebase();

const app = express();
const server = http.createServer(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API server
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Parse allowed origins from environment
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

// Configure CORS for Socket.IO
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Configure CORS for Express
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Game ID counter for single-player games
let gameIdCounter = 1;

// Generate a random alphanumeric Room ID
function generateRoomCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Generate a unique room code by checking Firestore for collisions
async function generateUniqueRoomCode() {
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const roomCode = generateRoomCode();
    const existingGame = await db.getGame(roomCode);
    if (!existingGame) {
      return roomCode;
    }
  }
  // Fallback to timestamp-based code if collisions persist
  return Date.now().toString(36).toUpperCase().substr(-6);
}

// Helper: Create a new game session
async function createGame({ id, mode, row = 9, col = 6, players = 2 }) {
  try {
    const gameId = id || (mode === 'multi' ? await generateUniqueRoomCode() : gameIdCounter++);
    
    const initialState = createInitialState(row, col, players);
    
    const gameData = {
      id: gameId,
      mode,
      players: [],
      playerUsernames: {},
      state: initialState,
      status: 'waiting',
      replayRequests: {},
      replayRequestedBy: null,
      hostPlayerId: null,
      activePlayers: new Set(),
      surrenderedPlayers: new Set(),
    };
    
    await db.createGame(gameData);
    console.log(`✅ Game created: ${gameId} (${mode})`);
    
    return gameData;
  } catch (error) {
    console.error('❌ Error creating game:', error);
    throw error;
  }
}

// Helper: Completely reset game state while preserving player information
function resetGameState(game) {
  const allOriginalPlayers = game.players;
  const originalRow = game.state.row;
  const originalCol = game.state.col;
  
  game.state = createInitialState(originalRow, originalCol, allOriginalPlayers.length);
  
  game.state.activePlayers = [...allOriginalPlayers];
  game.state.currentPlayer = allOriginalPlayers[0];
  
  game.status = 'active';
  game.surrenderedPlayers = new Set();
  game.replayRequests = {};
  game.replayRequestedBy = null;
  
  game.activePlayers = new Set(allOriginalPlayers);
  
  return game.state;
}

// Helper: Get correct room name for socket operations
function getRoomName(gameId, mode) {
  return mode === 'multi' ? `room_${gameId}` : `game_${gameId}`;
}

// Helper: Remove player from game
function removePlayerFromGame(game, playerId, reason = 'left') {
  game.activePlayers.delete(playerId);
  
  game.state.players = game.activePlayers.size;
  const activePlayerArray = Array.from(game.activePlayers);
  game.state.activePlayers = activePlayerArray;
  
  return {
    activePlayerArray,
    shouldEndGame: game.activePlayers.size <= 1,
    winner: game.activePlayers.size === 1 ? activePlayerArray[0] : null
  };
}

// A health check endpoint to verify that the server is running.
app.get('/health', async (req, res) => {
  try {
    const stats = await db.getDatabaseStats();
    res.status(200).json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      service: 'chain-reaction-backend',
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: 'connected',
      stats
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      service: 'chain-reaction-backend',
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: 'error',
      error: 'Database unavailable'
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'Chain Reaction Backend Server', 
    status: 'running',
    endpoints: ['/api/game', '/api/user', '/health'],
    timestamp: new Date().toISOString()
  });
});

// CORS preflight handler
app.options('*', cors());

// REST endpoint: Create a new game
app.post('/api/game', async (req, res) => {
  try {
    const { id, mode, row, col, players } = req.body;
    
    if (!['single', 'multi'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }
    
    if (id) {
      const existingGame = await db.getGame(id);
      if (existingGame) {
        return res.status(400).json({ error: 'Game ID already exists.' });
      }
    }
    
    const game = await createGame({ id, mode, row, col, players });
    res.json(game);
  } catch (error) {
    console.error('❌ Error in POST /api/game:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// REST endpoint: Join a game
app.post('/api/game/:id/join', async (req, res) => {
  try {
    const { username } = req.body;
    const game = await db.getGame(req.params.id);
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    if (game.players.length >= game.state.players) {
      return res.status(400).json({ error: 'Game full' });
    }
    
    const playerId = game.players.length + 1;
    game.players.push(playerId);
    game.activePlayers.add(playerId);
    
    if (username) {
      game.playerUsernames[playerId] = username;
    }
    
    if (!game.hostPlayerId) {
      game.hostPlayerId = playerId;
    }
    
    if (game.players.length === game.state.players || game.mode === 'single') {
      game.status = 'active';
    }
    
    await db.updateGame(req.params.id, {
      players: game.players,
      activePlayers: game.activePlayers,
      playerUsernames: game.playerUsernames,
      hostPlayerId: game.hostPlayerId,
      status: game.status
    });
    
    res.json({ game, playerId, isHost: playerId === game.hostPlayerId });
  } catch (error) {
    console.error('❌ Error in POST /api/game/:id/join:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// REST endpoint: Get game state
app.get('/api/game/:id', async (req, res) => {
  try {
    const game = await db.getGame(req.params.id);
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    res.json(game);
  } catch (error) {
    console.error('❌ Error in GET /api/game/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== USER PROFILE API ==========

// Create or get user profile
app.post('/api/user/profile', async (req, res) => {
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
      gamesPlayed: 0,
      gamesWon: 0
    };

    await db.createOrUpdateUser(userId, userProfile);
    
    console.log(`👤 User profile created: ${username} (${userId})`);
    res.json(userProfile);
    
  } catch (error) {
    console.error('❌ Error creating user profile:', error);
    res.status(500).json({ error: 'Failed to create user profile' });
  }
});

// Get user profile
app.get('/api/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await db.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
    
  } catch (error) {
    console.error('❌ Error getting user profile:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Update user stats
app.put('/api/user/:userId/stats', async (req, res) => {
  try {
    const { userId } = req.params;
    const { won } = req.body;
    
    const user = await db.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const updatedUser = await db.updateUserStats(userId, won);
    res.json(updatedUser);
    
  } catch (error) {
    console.error('❌ Error updating user stats:', error);
    res.status(500).json({ error: 'Failed to update user stats' });
  }
});

// Socket.IO: Handle all multiplayer interactions
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // ========== OLD MULTIPLAYER SYSTEM (gameId-based) ==========
  socket.on('joinGame', async ({ gameId, playerId }) => {
    try {
      const game = await db.getGame(gameId);
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
    } catch (error) {
      console.error('❌ Error in joinGame:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  socket.on('makeMove', async ({ gameId, playerId, move, roomCode, username }) => {
    try {
      const id = gameId || roomCode;
      const effectivePlayerId = playerId || socket.playerId;
      console.log(`🎯 makeMove: id=${id}, playerId=${playerId}, move=${JSON.stringify(move)}`);
      
      const game = await db.getGame(id);
      if (!game || game.status !== 'active') {
        console.log(`❌ Invalid move: game not found or not active`);
        return;
      }

      if (roomCode && !effectivePlayerId) {
        console.log('❌ Invalid move: missing playerId for room-based game');
        socket.emit('error', { message: 'Missing playerId for room-based game' });
        return;
      }
      
      // For room-based system, verify it's player's turn
      if (roomCode && effectivePlayerId && game.state.currentPlayer !== effectivePlayerId) {
        console.log(`❌ Invalid move: not player's turn`);
        return;
      }
      
      const roomName = getRoomName(id, game.mode);
      game.state = applyMove(game.state, move, effectivePlayerId || playerId);
      
      await db.updateGame(id, { state: game.state });
      
      if (roomCode) {
        io.to(roomName).emit('gameUpdate', { 
          roomCode, 
          state: game.state,
          playerUsernames: game.playerUsernames
        });
      } else {
        io.to(roomName).emit('gameUpdate', { gameId: id, state: game.state });
      }
      
      if (game.state.status === 'finished') {
        const winnerUsername = game.playerUsernames[game.state.winner] || `Player ${game.state.winner}`;
        
        await db.updateGame(id, { 
          status: 'finished',
          state: game.state
        });
        
        if (roomCode) {
          io.to(roomName).emit('gameOver', { 
            winner: game.state.winner,
            winnerUsername,
            playerUsernames: game.playerUsernames
          });
        } else {
          io.to(roomName).emit('gameOver', { winner: game.state.winner });
        }
      }
    } catch (error) {
      console.error('❌ Error in makeMove:', error);
      socket.emit('error', { message: 'Failed to make move' });
    }
  });

  // ========== NEW MULTIPLAYER SYSTEM (roomCode-based) ==========
  socket.on('createRoom', async ({ username }) => {
    try {
      console.log(`🏠 createRoom: username=${username}`);
      
      const game = await createGame({ mode: 'multi', players: 2 });
      const roomCode = game.id.toString();
      const playerId = 1;
      
      game.players.push(playerId);
      game.activePlayers.add(playerId);
      game.hostPlayerId = playerId;
      game.playerUsernames[playerId] = username || 'Player 1';
      
      await db.updateGame(roomCode, {
        players: game.players,
        activePlayers: game.activePlayers,
        hostPlayerId: game.hostPlayerId,
        playerUsernames: game.playerUsernames
      });
      
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
    } catch (error) {
      console.error('❌ Error in createRoom:', error);
      socket.emit('error', { message: 'Failed to create room' });
    }
  });

  socket.on('joinRoom', async ({ roomCode, username }) => {
    try {
      console.log(`🚪 joinRoom: roomCode=${roomCode}, username=${username}`);
      
      const game = await db.getGame(roomCode);
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
      
      if (game.players.length === game.state.players) {
        game.status = 'active';
      }
      
      await db.updateGame(roomCode, {
        players: game.players,
        activePlayers: game.activePlayers,
        playerUsernames: game.playerUsernames,
        status: game.status
      });
      
      socket.join(`room_${roomCode}`);
      socket.roomCode = roomCode;
      socket.playerId = playerId;
      socket.username = username;
      
      console.log(`✅ Player ${playerId} joined room: ${roomCode}`);
      
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
    } catch (error) {
      console.error('❌ Error in joinRoom:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // ========== UNIFIED REPLAY SYSTEM ==========
  socket.on('requestReplay', async ({ gameId, roomCode, playerId }) => {
    try {
      const id = gameId || roomCode;
      const game = await db.getGame(id);
      
      console.log(`🔄 Replay request: id=${id}, playerId=${playerId}`);
      
      if (!game) {
        console.log(`❌ Game not found for replay: ${id}`);
        return;
      }
      
      console.log(`📊 Game state: activePlayers=${Array.from(game.activePlayers)}, players=${game.players}`);
      
      if (!game.replayRequests) {
        game.replayRequests = {};
      }
      
      game.replayRequestedBy = playerId;
      game.replayRequests[playerId] = true;
      
      await db.updateGame(id, {
        replayRequestedBy: playerId,
        replayRequests: game.replayRequests
      });
      
      const roomName = getRoomName(id, game.mode);
      const eventData = {
        requestedBy: playerId,
        message: `${game.playerUsernames[playerId] || `Player ${playerId}`} wants to play again!`
      };
      
      if (gameId) eventData.gameId = gameId;
      if (roomCode) eventData.roomCode = roomCode;
      
      console.log(`📤 Emitting replayRequested to room: ${roomName}`);
      io.to(roomName).emit('replayRequested', eventData);
    } catch (error) {
      console.error('❌ Error in requestReplay:', error);
    }
  });

  socket.on('respondToReplay', async ({ gameId, roomCode, playerId, response }) => {
    try {
      const id = gameId || roomCode;
      const game = await db.getGame(id);
      
      console.log(`🎯 Replay response: id=${id}, playerId=${playerId}, response=${response}`);
      
      if (!game) {
        console.log(`❌ Game not found for replay response: ${id}`);
        return;
      }
      
      game.replayRequests[playerId] = response;
      const roomName = getRoomName(id, game.mode);
      
      console.log(`📊 Replay requests: ${JSON.stringify(game.replayRequests)}`);
      console.log(`👥 Active players: ${Array.from(game.activePlayers)}`);
      
      if (!response) {
        const result = removePlayerFromGame(game, playerId, 'declined replay');
        
        if (playerId === game.hostPlayerId) {
          console.log(`🏠 Host declined replay, closing game`);
          const eventData = { message: 'Game closed: Host declined to play again' };
          if (gameId) eventData.gameId = gameId;
          if (roomCode) eventData.roomCode = roomCode;
          
          io.to(roomName).emit('gameClosedByHost', eventData);
          await db.deleteGame(id);
          return;
        }
        
        if (result.shouldEndGame && result.winner) {
          const eventData = { 
            winner: result.winner,
            winnerUsername: game.playerUsernames[result.winner] || `Player ${result.winner}`,
            playerUsernames: game.playerUsernames
          };
          
          console.log(`🏆 Game over due to replay decline: winner=${result.winner}`);
          
          await db.updateGame(id, {
            status: 'finished',
            state: game.state,
            activePlayers: game.activePlayers
          });
          
          io.to(roomName).emit('gameOver', eventData);
          return;
        }
        
        delete game.replayRequests[playerId];
      }
      
      await db.updateGame(id, {
        replayRequests: game.replayRequests,
        activePlayers: game.activePlayers
      });
      
      const activePlayersArray = Array.from(game.activePlayers);
      const allActivePlayersResponded = activePlayersArray.every(pid => game.replayRequests[pid] !== undefined);
      const allActivePlayersAgreed = activePlayersArray.every(pid => game.replayRequests[pid] === true);
      
      console.log(`🔍 Response check: activePlayersArray=${activePlayersArray}, allResponded=${allActivePlayersResponded}, allAgreed=${allActivePlayersAgreed}`);
      
      if (allActivePlayersResponded) {
        if (allActivePlayersAgreed) {
          console.log(`🎮 All players agreed! Restarting game: ${id}`);
          const newState = resetGameState(game);
          
          await db.updateGame(id, {
            state: newState,
            status: game.status,
            replayRequests: game.replayRequests,
            replayRequestedBy: game.replayRequestedBy,
            surrenderedPlayers: game.surrenderedPlayers,
            activePlayers: game.activePlayers
          });
          
          const eventData = { state: newState };
          if (gameId) eventData.gameId = gameId;
          if (roomCode) eventData.roomCode = roomCode;
          
          io.to(roomName).emit('gameRestarted', eventData);
        } else {
          console.log(`❌ Not all players agreed, cancelling replay: ${id}`);
          game.replayRequests = {};
          game.replayRequestedBy = null;
          
          await db.updateGame(id, {
            replayRequests: {},
            replayRequestedBy: null
          });
          
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
    } catch (error) {
      console.error('❌ Error in respondToReplay:', error);
    }
  });

  // ========== UNIFIED EXIT/SURRENDER SYSTEM ==========
  socket.on('exitGame', async ({ gameId, playerId }) => {
    await handlePlayerExit(gameId, playerId, 'exit', false);
  });

  socket.on('exitRoom', async ({ roomCode, playerId }) => {
    await handlePlayerExit(roomCode, playerId, 'exit', true);
  });

  socket.on('surrenderGame', async ({ gameId, playerId }) => {
    await handlePlayerExit(gameId, playerId, 'surrender', false);
  });

  socket.on('surrenderRoom', async ({ roomCode, playerId }) => {
    await handlePlayerExit(roomCode, playerId, 'surrender', true);
  });

  async function handlePlayerExit(id, playerId, action, isRoom) {
    try {
      console.log(`🚪 Player ${action}: id=${id}, playerId=${playerId}, isRoom=${isRoom}`);
      
      const game = await db.getGame(id);
      if (!game) {
        console.log(`❌ Game not found for ${action}: ${id}`);
        return;
      }
      
      const roomName = getRoomName(id, game.mode);
      const result = removePlayerFromGame(game, playerId, action);
      
      if (action === 'surrender') {
        game.surrenderedPlayers.add(playerId);
      }
      
      if (playerId === game.hostPlayerId) {
        console.log(`🏠 Host ${action}, closing game`);
        const eventData = { 
          message: `Game closed: Host has ${action === 'surrender' ? 'surrendered' : 'left the game'}` 
        };
        if (!isRoom) eventData.gameId = id;
        if (isRoom) eventData.roomCode = id;
        
        io.to(roomName).emit('gameClosedByHost', eventData);
        await db.deleteGame(id);
        return;
      }
      
      if (result.shouldEndGame) {
        if (result.winner) {
          console.log(`🏆 Game over due to ${action}: winner=${result.winner}`);
          const eventData = {
            winner: result.winner,
            winnerUsername: game.playerUsernames[result.winner] || `Player ${result.winner}`,
            playerUsernames: game.playerUsernames
          };
          
          game.state.status = 'finished';
          game.state.winner = result.winner;
          
          await db.updateGame(id, {
            status: 'finished',
            state: game.state,
            activePlayers: game.activePlayers,
            surrenderedPlayers: game.surrenderedPlayers
          });
          
          io.to(roomName).emit('gameOver', eventData);
        } else {
          console.log(`🚫 No players remaining, closing game`);
          const eventData = { 
            message: 'Game closed: No players remaining' 
          };
          if (!isRoom) eventData.gameId = id;
          if (isRoom) eventData.roomCode = id;
          
          io.to(roomName).emit('gameClosedByHost', eventData);
          await db.deleteGame(id);
        }
        return;
      }
      
      await db.updateGame(id, {
        state: game.state,
        activePlayers: game.activePlayers,
        surrenderedPlayers: game.surrenderedPlayers
      });
      
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
      
      if (action === 'surrender') {
        const updateData = { 
          state: game.state,
          playerUsernames: game.playerUsernames
        };
        if (!isRoom) updateData.gameId = id;
        if (isRoom) updateData.roomCode = id;
        
        io.to(roomName).emit('gameUpdate', updateData);
      }
    } catch (error) {
      console.error(`❌ Error in handlePlayerExit:`, error);
    }
  }

  // Handle rejoining a room after refresh/disconnect
  socket.on('rejoinRoom', async ({ roomCode, playerId, username }) => {
    try {
      console.log(`🔄 rejoinRoom: roomCode=${roomCode}, playerId=${playerId}, username=${username}`);
      
      const game = await db.getGame(roomCode);
      
      if (!game) {
        socket.emit('rejoinFailed', { message: 'Room not found' });
        return;
      }
      
      if (!game.players.includes(playerId)) {
        socket.emit('rejoinFailed', { message: 'Player was not in this room' });
        return;
      }
      
      if (game.reconnectTimers && game.reconnectTimers[playerId]) {
        clearTimeout(game.reconnectTimers[playerId]);
        delete game.reconnectTimers[playerId];
        console.log(`⏰ Cancelled 30s reconnection timer for player ${playerId}`);
        
        socket.join(`room_${roomCode}`);
        socket.roomCode = roomCode;
        socket.playerId = playerId;
        socket.username = username;
        
        game.activePlayers.add(playerId);
        game.playerUsernames[playerId] = username || `Player ${playerId}`;
        
        await db.updateGame(roomCode, {
          activePlayers: game.activePlayers,
          playerUsernames: game.playerUsernames
        });
        
        console.log(`✅ Player ${playerId} rejoined room: ${roomCode}`);
        
        socket.emit('rejoinedRoom', { 
          state: game.state,
          playerUsernames: game.playerUsernames,
          message: 'Successfully rejoined the game'
        });
        
        socket.to(`room_${roomCode}`).emit('playerRejoined', {
          roomCode,
          playerId,
          username,
          playerUsernames: game.playerUsernames,
          message: `${username} reconnected successfully!`
        });
      } else {
        socket.emit('rejoinFailed', { message: 'No pending reconnection for this player or timer expired' });
      }
    } catch (error) {
      console.error('❌ Error in rejoinRoom:', error);
      socket.emit('rejoinFailed', { message: 'Failed to rejoin room' });
    }
  });

  // Handle socket disconnection
  socket.on('disconnect', async () => {
    try {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
      
      if (socket.roomCode && socket.playerId) {
        const game = await db.getGame(socket.roomCode);
        if (game && game.status === 'active') {
          console.log(`⏰ Player ${socket.playerId} disconnected from room ${socket.roomCode}, starting 30s reconnection timer...`);
          
          game.activePlayers.delete(socket.playerId);
          
          socket.to(`room_${socket.roomCode}`).emit('playerDisconnected', {
            roomCode: socket.roomCode,
            playerId: socket.playerId,
            username: socket.username,
            message: `${socket.username || `Player ${socket.playerId}`} disconnected. Waiting 30 seconds for reconnection...`,
            gracePeriodSeconds: 30
          });
          
          const reconnectTimer = setTimeout(async () => {
            console.log(`❌ Reconnection timer expired for player ${socket.playerId} in room ${socket.roomCode}`);
            await handlePlayerExit(socket.roomCode, socket.playerId, 'timeout', true);
          }, 30000);
          
          if (!game.reconnectTimers) {
            game.reconnectTimers = {};
          }
          game.reconnectTimers[socket.playerId] = reconnectTimer;
          
          // Note: reconnectTimers is kept in memory, not persisted to Firestore
        }
      }
      
      if (socket.gameId && socket.playerId) {
        await handlePlayerExit(socket.gameId, socket.playerId, 'disconnect', false);
      }
    } catch (error) {
      console.error('❌ Error in disconnect handler:', error);
    }
  });
});

// Cleanup job for old games (runs hourly)
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
setInterval(async () => {
  try {
    console.log('🧹 Running cleanup job for old games...');
    await db.cleanupOldGames();
  } catch (error) {
    console.error('❌ Error in cleanup job:', error);
  }
}, CLEANUP_INTERVAL);

const PORT = process.env.PORT || 5000;

// Add error handling for server
server.on('error', (error) => {
  console.error('❌ Server error:', error);
});

// Graceful shutdown handlers
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown(signal) {
  console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(async () => {
    console.log('✅ HTTP server closed');
    
    try {
      // Close all active socket connections
      const sockets = await io.fetchSockets();
      console.log(`📢 Notifying ${sockets.length} connected clients...`);
      
      io.emit('serverShutdown', { 
        message: 'Server is shutting down for maintenance. Please reconnect in a few moments.' 
      });
      
      // Give clients time to receive the message
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Close socket.io
      io.close(() => {
        console.log('✅ Socket.IO closed');
      });
      
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  🚀 Chain Reaction Backend Server Started                  ║
╠════════════════════════════════════════════════════════════╣
║  📡 Port: ${PORT.toString().padEnd(48)} ║
║  🌍 Environment: ${(process.env.NODE_ENV || 'development').padEnd(40)} ║
║  🔍 Health: http://localhost:${PORT}/health${' '.repeat(20)} ║
║  🔒 Security: Helmet + Rate Limiting                       ║
║  💾 Database: Firestore (Firebase Admin SDK)              ║
╚════════════════════════════════════════════════════════════╝
  `);
  console.log('✅ All systems operational. Ready to accept connections.');
});
