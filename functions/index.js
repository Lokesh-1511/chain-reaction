/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

const functions = require("firebase-functions");
const express = require("express");
const {Server} = require("socket.io");
const cors = require("cors");
const {createInitialState, applyMove, checkWin} = require("./gameLogic");

const app = express();
app.use(cors({origin: true}));

// In-memory store for games
const games = {};
let gameIdCounter = 1;

// Helper: Create a new game session
function createGame({id, mode, row = 9, col = 6, players = 2}) {
  const gameId = id || gameIdCounter++;
  games[gameId] = {
    id: gameId,
    mode, // 'single' or 'multi'
    players: [],
    state: createInitialState(row, col, players),
    maxPlayers: players,
    status: "waiting", // 'waiting', 'active', 'finished'
    createdAt: Date.now(),
    sockets: [], // Track socket connections
  };
  return games[gameId];
}

// Basic HTTP endpoint for health check
app.get("/", (req, res) => {
  res.json({message: "Chain Reaction Game Server is running!"});
});

// Create a new game
app.post("/api/games", (req, res) => {
  const {mode = "multi", row = 9, col = 6, players = 2} = req.body;
  const game = createGame({mode, row, col, players});
  res.json({gameId: game.id, message: "Game created successfully!"});
});

// Get game state
app.get("/api/games/:gameId", (req, res) => {
  const gameId = parseInt(req.params.gameId);
  const game = games[gameId];

  if (!game) {
    return res.status(404).json({error: "Game not found"});
  }

  res.json({
    gameId: game.id,
    mode: game.mode,
    players: game.players.length,
    maxPlayers: game.maxPlayers,
    status: game.status,
    state: game.state,
  });
});

// Create HTTP function
const api = functions.https.onRequest(app);

// Create Socket.IO function
const gameServer = functions.https.onRequest((req, res) => {
  if (!global.io) {
    const server = require("http").createServer();
    global.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    // Socket.IO connection handling
    global.io.on("connection", (socket) => {
      console.log("User connected:", socket.id);

      // Join a game
      socket.on("join-game", ({gameId, playerId}) => {
        const game = games[gameId];
        if (!game) {
          socket.emit("error", {message: "Game not found"});
          return;
        }

        // Add player if not already in game
        if (!game.players.find((p) => p.id === playerId)) {
          if (game.players.length < game.maxPlayers) {
            game.players.push({id: playerId, socketId: socket.id});
            socket.join(gameId.toString());
            game.sockets.push(socket.id);
          } else {
            socket.emit("error", {message: "Game is full"});
            return;
          }
        } else {
          // Player rejoining
          const player = game.players.find((p) => p.id === playerId);
          player.socketId = socket.id;
          socket.join(gameId.toString());
          if (!game.sockets.includes(socket.id)) {
            game.sockets.push(socket.id);
          }
        }

        // Start game if enough players
        if (game.players.length >= game.maxPlayers && game.status === "waiting") {
          game.status = "active";
        }

        // Send updated game state
        global.io.to(gameId.toString()).emit("game-updated", {
          gameId,
          players: game.players,
          state: game.state,
          status: game.status,
        });
      });

      // Handle moves
      socket.on("make-move", ({gameId, playerId, move}) => {
        const game = games[gameId];
        if (!game) {
          socket.emit("error", {message: "Game not found"});
          return;
        }

        if (game.status !== "active") {
          socket.emit("error", {message: "Game is not active"});
          return;
        }

        // Apply the move
        const newState = applyMove(game.state, move, playerId);
        game.state = newState;

        // Check for winner
        const winner = checkWin(game.state);
        if (winner) {
          game.status = "finished";
        }

        // Broadcast updated state
        global.io.to(gameId.toString()).emit("game-updated", {
          gameId,
          players: game.players,
          state: game.state,
          status: game.status,
          winner,
        });
      });

      // Handle disconnection
      socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
        // Remove socket from all games
        Object.values(games).forEach((game) => {
          game.sockets = game.sockets.filter((s) => s !== socket.id);
        });
      });
    });
  }

  // Handle the request through Socket.IO
  global.io.engine.handleRequest(req, res);
});

module.exports = {
  api,
  gameServer,
};
