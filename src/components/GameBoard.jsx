import React, { useState, useEffect, useRef } from 'react';
import GridCell from './GridCell';
import socket from '../services/socket';
import { getGameState } from '../services/api';
import { updateGameStats } from '../services/userStats';
import { getCurrentUsername } from './UserProfile';
import ChainReactionBot from '../ai/chainReactionBot';
import './GameBoard.css';

const GameBoard = ({ 
  row, 
  col, 
  players, 
  onExit, 
  gameId, 
  playerId, 
  mode, 
  isHost, 
  roomCode, 
  playerUsernames = {}, 
  waitingForPlayers = false,
  isOnline = true,
  botDifficulty: propBotDifficulty = 'medium'
}) => {
  // Helper function to get maximum tokens a cell can hold
  const getMaxTokens = (row, col, totalRows, totalCols) => {
    const isCorner = (row === 0 || row === totalRows - 1) && (col === 0 || col === totalCols - 1);
    const isEdge = row === 0 || row === totalRows - 1 || col === 0 || col === totalCols - 1;
    
    if (isCorner) return 1; // Corner cells can hold 2 tokens before explosion (explode at 2)
    if (isEdge) return 2; // Edge cells can hold 3 tokens before explosion (explode at 3)
    return 3; // Center cells can hold 4 tokens before explosion (explode at 4)
  };

  const [cells, setCells] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(1);
  const [activePlayers, setActivePlayers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [winner, setWinner] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [copied, setCopied] = useState(false);
  const [cellSize, setCellSize] = useState(60);
  const [replayRequested, setReplayRequested] = useState(false);
  const [replayRequestedBy, setReplayRequestedBy] = useState(null);
  const [replayMessage, setReplayMessage] = useState('');
  const [hasResponded, setHasResponded] = useState(false);
  const [showReplayWaiting, setShowReplayWaiting] = useState(false);
  const [waitingForPlayersState, setWaitingForPlayers] = useState([]);
  const [showGameClosed, setShowGameClosed] = useState(false);
  const [gameClosedMessage, setGameClosedMessage] = useState('');
  const [remainingPlayers, setRemainingPlayers] = useState([]);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);
  const [hasSurrendered, setHasSurrendered] = useState(false);
  const [explodingCells, setExplodingCells] = useState(new Set());
  const [gamePlayerUsernames, setGamePlayerUsernames] = useState(playerUsernames);
  const [gameStartTime, setGameStartTime] = useState(null);
  const [isLoadingBoard, setIsLoadingBoard] = useState(true);
  
  // Bot AI state
  const [botPlayer, setBotPlayer] = useState(mode === 'bot' ? 2 : null);
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState(propBotDifficulty || 'medium');
  const [lastBotMoveTime, setLastBotMoveTime] = useState(0);
  const botRef = useRef(null);

  // Update gamePlayerUsernames when playerUsernames prop changes
  useEffect(() => {
    setGamePlayerUsernames(playerUsernames);
  }, [playerUsernames]);

  // Initialize bot if mode is 'bot'
  useEffect(() => {
    if (mode === 'bot' && !botRef.current) {
      const difficulty = propBotDifficulty || botDifficulty || 'medium';
      botRef.current = new ChainReactionBot(difficulty);
      setBotPlayer(2);
      setBotDifficulty(difficulty);
      console.log(`🤖 Bot initialized with ${difficulty} difficulty`);
    }
  }, [mode, propBotDifficulty]);

  // Bot move handler - triggers when it's bot's turn
  useEffect(() => {
    if (mode === 'bot' && botPlayer && currentPlayer === botPlayer && !winner && !isBotThinking && cells && cells.length > 0) {
      // Add cooldown to prevent rapid repeated moves
      const now = Date.now();
      if (now - lastBotMoveTime > 300) {
        console.log('🤖 Bot turn detected, making move...');
        handleBotMove();
      }
    }
  }, [currentPlayer, botPlayer, winner, isBotThinking, mode, cells, lastBotMoveTime]);

  const handleBotMove = async () => {
    if (isBotThinking) return; // Prevent multiple simultaneous bot moves
    
    setIsBotThinking(true);
    setLastBotMoveTime(Date.now());
    console.log('🤖 Bot is thinking...');
    
    const currentGameState = {
      grid: cells,
      row: displayRow,
      col: displayCol,
      currentPlayer: currentPlayer,
      activePlayers: activePlayers
    };

    try {
      // Get bot difficulty config for think time
      const config = botRef.current.getDifficultyConfig(botDifficulty);
      
      // Add timeout protection (slightly longer than think time)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Bot timeout')), Math.max(config.thinkTime + 500, 6000))
      );
      
      const movePromise = botRef.current.getNextMove(currentGameState, botPlayer);
      const move = await Promise.race([movePromise, timeoutPromise]);
      
      console.log('🤖 Bot selected move:', move);
      
      if (move) {
        // Try to apply bot move directly
        const applied = applyLocalMove(move.x, move.y, { isBotMove: true });
        if (!applied) {
          console.warn('🤖 Bot move invalid, selecting fallback move');
          const fallbackState = {
            grid: cells,
            row: displayRow,
            col: displayCol,
            players: players,
            currentPlayer: currentPlayer,
            activePlayers: activePlayers,
            playersMoved: [],
            winner: null,
            status: 'active',
          };
          const validMoves = getValidMoves(fallbackState, botPlayer);
          if (validMoves.length > 0) {
            const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
            applyLocalMove(randomMove.x, randomMove.y, { isBotMove: true });
          } else {
            console.warn('🤖 No valid moves available for bot');
            setIsBotThinking(false);
          }
        }
      } else {
        console.warn('🤖 Bot returned no valid move');
        setIsBotThinking(false);
      }
    } catch (error) {
      console.error('🤖 Bot move error:', error);
      setIsBotThinking(false);
    }
  };

  // This effect is for debugging modal states.
  useEffect(() => {
  }, [showModal, replayRequested, showReplayWaiting, hasResponded]);

  // When a winner is declared, update game statistics for multiplayer games.
  useEffect(() => {
    if (winner && gameStartTime && mode === 'multi') {
      const gameDuration = Math.floor((Date.now() - gameStartTime) / 60000); // Duration in minutes
      const gameData = {
        winner,
        playerId,
        gridSize: row * col,
        gameDuration,
        gameMode: mode,
        totalPlayers: players,
        roomCode: roomCode || gameId
      };
      
      updateGameStats(gameData).catch(error => {
        console.error('Failed to update game stats:', error);
      });
    }
  }, [winner, gameStartTime, playerId, row, col, mode, players, roomCode, gameId]);

  // Helper function to get player display name
  const getPlayerDisplayName = (playerId) => {
    if (!playerId) return 'Unknown Player';
    if (mode === 'bot' && playerId === botPlayer) {
      return '🤖 Bot';
    }
    if (mode === 'multi' && gamePlayerUsernames[playerId]) {
      return gamePlayerUsernames[playerId];
    }
    return `Player ${playerId}`;
  };

  // Local game logic for singleplayer mode
  const applyMoveLocally = (state, move, playerId) => {
    if (state.status !== 'active') return state;
    
    // Create a deep copy of the state
    const newState = JSON.parse(JSON.stringify(state));
    
    // Place orb
    const cell = newState.grid[move.x][move.y];
    if (cell.player === playerId) {
      cell.value++;
    } else if (cell.value === 0) {
      cell.value = 1;
      cell.player = playerId;
    }
    
    // Ensure max_value is always initialized (prevents endless reactions)
    for (let i = 0; i < newState.row; i++) {
      for (let j = 0; j < newState.col; j++) {
        const cellToNormalize = newState.grid[i][j];
        if (cellToNormalize.max_value == null || cellToNormalize.max_value <= 0) {
          cellToNormalize.max_value = getMaxTokens(i, j, newState.row, newState.col);
        }
      }
    }

    // Process explosions using a queue (guarantees termination)
    const explosionQueue = [];
    const inQueue = new Set();

    for (let i = 0; i < newState.row; i++) {
      for (let j = 0; j < newState.col; j++) {
        if (newState.grid[i][j].value > newState.grid[i][j].max_value) {
          const key = `${i}-${j}`;
          explosionQueue.push({ i, j });
          inQueue.add(key);
        }
      }
    }

    while (explosionQueue.length > 0) {
      const { i, j } = explosionQueue.shift();
      inQueue.delete(`${i}-${j}`);

      const explodingCell = newState.grid[i][j];
      if (explodingCell.value <= explodingCell.max_value) continue;

      explodingCell.value = 0;
      explodingCell.player = 0;

      const directions = [
        { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 }
      ];

      for (const { dx, dy } of directions) {
        const nx = i + dx;
        const ny = j + dy;
        if (nx >= 0 && nx < newState.row && ny >= 0 && ny < newState.col) {
          const neighbor = newState.grid[nx][ny];
          neighbor.value++;
          neighbor.player = playerId;

          if (neighbor.value > neighbor.max_value) {
            const key = `${nx}-${ny}`;
            if (!inQueue.has(key)) {
              explosionQueue.push({ i: nx, j: ny });
              inQueue.add(key);
            }
          }
        }
      }
    }
    
    // Add to moved players if not already
    if (!newState.playersMoved.includes(playerId)) {
      newState.playersMoved.push(playerId);
    }
    
    // Check for player elimination
    const playersWithOrbs = new Set();
    newState.grid.forEach(row => {
      row.forEach(cell => {
        if (cell.player !== 0) {
          playersWithOrbs.add(cell.player);
        }
      });
    });
    const updatedActivePlayers = newState.activePlayers.filter(
      p => playersWithOrbs.has(p) || !newState.playersMoved.includes(p)
    );
    newState.activePlayers = updatedActivePlayers;
    
    // Check win condition
    if (newState.players > 1 && updatedActivePlayers.length === 1) {
      newState.winner = updatedActivePlayers[0];
      newState.status = 'finished';
    } else if (updatedActivePlayers.length === 0) {
      newState.status = 'finished';
    } else {
      // Advance to next player
      const idx = updatedActivePlayers.indexOf(playerId);
      newState.currentPlayer = updatedActivePlayers[(idx + 1) % updatedActivePlayers.length];
    }
    
    return newState;
  };

  useEffect(() => {
    const calculateCellSize = () => {
      // Get viewport dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Account for fixed controls height (varies by screen size)
      let controlsHeight = 80; // Default desktop
      if (viewportWidth <= 480) {
        controlsHeight = 100;
      } else if (viewportWidth <= 768) {
        controlsHeight = 90;
      }
      
      // Available space for the game board
      const availableWidth = viewportWidth - 40; // 20px padding on each side
      const availableHeight = viewportHeight - controlsHeight - 40; // Controls height + padding
      
      // Grid layout calculations
      const gap = 6; // Gap between cells
      const padding = 50; // Game board internal padding (25px * 2)
      
      // Use backend state for dimensions if available
      const gridRows = gameState?.row || row;
      const gridCols = gameState?.col || col;
      
      // Calculate maximum cell size that fits in available space
      const maxCellWidth = (availableWidth - padding - (gap * (gridCols - 1))) / gridCols;
      const maxCellHeight = (availableHeight - padding - (gap * (gridRows - 1))) / gridRows;
      
      // Use the smaller dimension to ensure the grid fits completely
      const optimalCellSize = Math.floor(Math.min(maxCellWidth, maxCellHeight));
      
      // Set bounds: minimum 25px for very large grids, maximum 70px for small grids
      const finalCellSize = Math.max(25, Math.min(optimalCellSize, 70));
      
      setCellSize(finalCellSize);
    };

    // Calculate immediately and on window resize
    calculateCellSize();
    window.addEventListener('resize', calculateCellSize);

    return () => {
      window.removeEventListener('resize', calculateCellSize);
    };
  }, [row, col, gameState]);

  useEffect(() => {
    // Set game start time when component mounts
    setGameStartTime(Date.now());

    // For local/single/bot, initialize even if gameId is missing (prevents stuck loading after restart)
    if (mode === 'single' || mode === 'bot' || mode === 'local') {
      const initialState = {
        grid: Array(row).fill().map((_, i) => 
          Array(col).fill().map((_, j) => {
            const cell = { value: 0, player: 0, max_value: 0 };
            // Set max value based on position
            if ((i === 0 || i === row - 1) && (j === 0 || j === col - 1)) {
              cell.max_value = 1; // Corner cells
            } else if (i === 0 || i === row - 1 || j === 0 || j === col - 1) {
              cell.max_value = 2; // Edge cells
            } else {
              cell.max_value = 3; // Inner cells
            }
            return cell;
          })
        ),
        row: row,
        col: col,
        players: players,
        currentPlayer: 1,
        activePlayers: Array.from({ length: players }, (_, i) => i + 1),
        playersMoved: [],
        winner: null,
        status: 'active',
      };
      
      setGameState(initialState);
      setCells(initialState.grid);
      setCurrentPlayer(1);
      setActivePlayers(initialState.activePlayers);
      setIsLoadingBoard(false);
      return;
    }

    if (!gameId) return;
    
    // For multiplayer, handle server connections and rejoining
    if (mode === 'multi' && roomCode) {
      // Always attempt to rejoin when the component loads
      // The server will decide if this player has a reconnect timer running
      console.log('🔄 Attempting to rejoin multiplayer game...', { roomCode, playerId });
      
      socket.emit('rejoinRoom', { 
        roomCode, 
        playerId, 
        username: getCurrentUsername() 
      });
      
      // Set a timeout in case rejoin fails
      const rejoinTimeout = setTimeout(() => {
        console.warn('⚠️ Rejoin timeout - fetching fresh game state');
        // Fall back to fetching game state normally
        getGameState(gameId).then(game => {
          setGameState(game.state);
          setCells(game.state.grid);
          setCurrentPlayer(game.state.currentPlayer);
          setActivePlayers(game.state.activePlayers);
        }).catch(error => {
          console.error('Failed to fetch game state:', error);
        });
      }, 5000); // 5 second timeout
      
      // Clear timeout when rejoin succeeds or fails
      socket.once('rejoinedRoom', () => {
        clearTimeout(rejoinTimeout);
      });
      
      socket.once('rejoinFailed', () => {
        clearTimeout(rejoinTimeout);
        // If rejoin failed, fetch normal game state
        getGameState(gameId).then(game => {
          setGameState(game.state);
          setCells(game.state.grid);
          setCurrentPlayer(game.state.currentPlayer);
          setActivePlayers(game.state.activePlayers);
        });
      });
    } else if (mode === 'multi') {
      // For old-style multiplayer games, join the game room
      socket.emit('joinGame', { gameId, playerId });
      // Fetch initial state
      getGameState(gameId).then(game => {
        setGameState(game.state);
        setCells(game.state.grid);
        setCurrentPlayer(game.state.currentPlayer);
        setActivePlayers(game.state.activePlayers);
      });
    }
    // Listen for updates
    socket.on('gameUpdate', ({ state, roomCode: updateRoomCode, playerUsernames: updateUsernames }) => {
      setGameState(state);
      
      // Update player usernames if provided (for room-based games)
      if (updateUsernames) {
        setGamePlayerUsernames(updateUsernames);
      }
      
      // Check for explosions by detecting cells that reached their limits
      const newExplodingCells = new Set();
      if (cells.length > 0) {
        state.grid.forEach((row, i) => {
          row.forEach((cell, j) => {
            const position = `${i}-${j}`;
            const maxTokens = getMaxTokens(i, j, state.grid.length, row.length);
            
            // If cell was at capacity in previous state but now has fewer tokens, it exploded
            if (cells[i] && cells[i][j]) {
              const prevCell = cells[i][j];
              if (prevCell.tokenCount >= maxTokens && cell.tokenCount < maxTokens) {
                newExplodingCells.add(position);
              }
            }
          });
        });
      }
      
      setCells(state.grid);
      setCurrentPlayer(state.currentPlayer);
      setActivePlayers(state.activePlayers);
      
      // Trigger explosion animations
      if (newExplodingCells.size > 0) {
        setExplodingCells(newExplodingCells);
        // Clear explosion animations after 1.2 seconds to match animation duration
        setTimeout(() => {
          setExplodingCells(new Set());
        }, 1200);
      }
    });
    socket.on('gameOver', ({ winner, winnerUsername, playerUsernames: updateUsernames }) => {
      if (updateUsernames) {
        setGamePlayerUsernames(updateUsernames);
      }
      setWinner(winner);
      setShowModal(true);
      
      // Update user stats only for multiplayer games
      if (gameStartTime && mode === 'multi') {
        const gameDuration = Math.floor((Date.now() - gameStartTime) / 60000); // Duration in minutes
        const gameData = {
          winner,
          playerId,
          gridSize: row * col,
          gameDuration,
          gameMode: mode,
          totalPlayers: players,
          roomCode: roomCode || gameId
        };
        
        updateGameStats(gameData).catch(error => {
          console.error('Failed to update game stats:', error);
        });
      }
    });

    // Listen for rejoin success
    socket.on('rejoinedRoom', ({ state, playerUsernames, message }) => {
      console.log('✅ Successfully rejoined multiplayer game:', message);
      if (state) {
        setGameState(state);
        setCells(state.grid);
        setCurrentPlayer(state.currentPlayer);
        setActivePlayers(state.activePlayers);
      }
      if (playerUsernames) {
        setGamePlayerUsernames(playerUsernames);
      }
    });

    // Listen for rejoin failure
    socket.on('rejoinFailed', ({ message }) => {
      console.error('❌ Failed to rejoin game:', message);
      // Could show an error message to the user
      setError && setError('Failed to rejoin the game. Starting a new game.');
    });

    // Listen for player disconnect/rejoin events
    socket.on('playerDisconnected', ({ playerId, username, message, gracePeriodSeconds }) => {
      if (gracePeriodSeconds) {
        console.log(`⏰ Player ${username} (${playerId}) disconnected - ${gracePeriodSeconds}s to reconnect`);
        // Silently handle disconnection - no user prompts
      }
    });

    socket.on('playerRejoined', ({ playerId, username, message }) => {
      console.log(`✅ Player ${username} (${playerId}) rejoined successfully`);
      // Silently handle reconnection - no user prompts
    });

    // Listen for replay-related events
    socket.on('replayRequested', ({ requestedBy, message, roomCode: eventRoomCode, gameId: eventGameId }) => {
      console.log(`🔔 Received replayRequested: requestedBy=${requestedBy}, eventRoomCode=${eventRoomCode}, eventGameId=${eventGameId}, myPlayerId=${playerId}`);
      console.log(`🎯 Current state: replayRequested=${replayRequested}, showModal=${showModal}, hasResponded=${hasResponded}`);
      
      if (requestedBy !== playerId) {
        console.log(`✅ Player ${playerId} should show replay request modal`);
        setReplayRequested(true);
        setReplayRequestedBy(requestedBy);
        setReplayMessage(message);
        setHasResponded(false);
      } else {
        console.log(`🚫 Player ${playerId} is the requester, not showing modal`);
      }
    });

    socket.on('replayResponse', ({ playerId: respondedPlayerId, response, waitingFor, roomCode: eventRoomCode, gameId: eventGameId }) => {
      console.log(`📨 Received replayResponse: respondedPlayerId=${respondedPlayerId}, response=${response}, waitingFor=${JSON.stringify(waitingFor)}`);
      setWaitingForPlayers(waitingFor);
      // Could add more UI feedback here about who responded
    });

    socket.on('gameRestarted', ({ state, roomCode: eventRoomCode, gameId: eventGameId }) => {
      console.log(`🎮 Received gameRestarted: eventRoomCode=${eventRoomCode}, eventGameId=${eventGameId}, myPlayerId=${playerId}`);
      setGameState(state);
      setCells(state.grid);
      setCurrentPlayer(state.currentPlayer);
      setActivePlayers(state.activePlayers);
      setShowModal(false);
      setWinner(null);
      setReplayRequested(false);
      setReplayRequestedBy(null);
      setReplayMessage('');
      setHasResponded(false);
      setWaitingForPlayers([]);
      setShowReplayWaiting(false);
      setHasSurrendered(false); // Reset surrender flag for new game
    });

    socket.on('replayCancelled', () => {
      setReplayRequested(false);
      setReplayRequestedBy(null);
      setReplayMessage('');
      setHasResponded(false);
      setWaitingForPlayers([]);
      setShowReplayWaiting(false);
    });

    socket.on('gameClosedByHost', ({ message }) => {
      setShowGameClosed(true);
      setGameClosedMessage(message);
      setShowModal(false);
      setReplayRequested(false);
      setShowReplayWaiting(false);
    });

    socket.on('playerLeft', ({ playerId: leftPlayerId, remainingPlayers, message }) => {
      setRemainingPlayers(remainingPlayers);
      console.log(message);
      
      // Check if only one player remains - they win
      if (remainingPlayers.length === 1 && mode === 'multi' && gameStartTime) {
        const winner = remainingPlayers[0];
        const gameDuration = Math.floor((Date.now() - gameStartTime) / 60000);
        const gameData = {
          winner,
          playerId,
          gridSize: row * col,
          gameDuration,
          gameMode: mode,
          totalPlayers: players,
          roomCode: roomCode || gameId,
          endReason: 'player_left'
        };
        
        updateGameStats(gameData).catch(error => {
          console.error('Failed to update game stats for player left:', error);
        });
      }
    });

    socket.on('playerSurrendered', ({ playerId: surrenderedPlayerId, remainingPlayers, message }) => {
      setRemainingPlayers(remainingPlayers);
      console.log(message);
      
      // Check if only one player remains - they win
      if (remainingPlayers.length === 1 && mode === 'multi' && gameStartTime) {
        const winner = remainingPlayers[0];
        const gameDuration = Math.floor((Date.now() - gameStartTime) / 60000);
        const gameData = {
          winner,
          playerId,
          gridSize: row * col,
          gameDuration,
          gameMode: mode,
          totalPlayers: players,
          roomCode: roomCode || gameId,
          endReason: 'player_surrendered'
        };
        
        updateGameStats(gameData).catch(error => {
          console.error('Failed to update game stats for surrender:', error);
        });
      }
    });

    return () => {
      socket.off('gameUpdate');
      socket.off('gameOver');
      socket.off('rejoinedRoom');
      socket.off('rejoinFailed');
      socket.off('playerDisconnected');
      socket.off('playerRejoined');
      socket.off('replayRequested');
      socket.off('replayResponse');
      socket.off('gameRestarted');
      socket.off('replayCancelled');
      socket.off('gameClosedByHost');
      socket.off('playerLeft');
      socket.off('playerSurrendered');
    };
  }, [gameId, playerId, mode, row, col, players]);

  // State persistence for game board
  useEffect(() => {
    // Disable restore for local/single/bot to prevent stale stuck state
    if (mode === 'local' || mode === 'single' || mode === 'bot') {
      localStorage.removeItem('chainReactionGameBoardState');
      setIsLoadingBoard(false);
      return;
    }

    // Load saved game board state on component mount (multiplayer only)
    const savedGameBoardState = localStorage.getItem('chainReactionGameBoardState');
    if (savedGameBoardState) {
      try {
        const state = JSON.parse(savedGameBoardState);

        // If saved state doesn't match this game or is stale, clear it
        const isStale = state.timestamp && Date.now() - state.timestamp > 30 * 60 * 1000;
        if ((state.gameId && gameId && state.gameId !== gameId) || isStale) {
          localStorage.removeItem('chainReactionGameBoardState');
        } else if (state.cells && state.cells.length > 0) {
          setCells(state.cells);
          setCurrentPlayer(state.currentPlayer || 1);
          setActivePlayers(state.activePlayers || []);
          setGameState(state.gameState || null);
        }
      } catch (error) {
        console.error('Error loading game board state:', error);
        localStorage.removeItem('chainReactionGameBoardState');
      }
    }
    // Set loading to false after attempting to load state
    setIsLoadingBoard(false);
  }, [mode, gameId]);

  // Save game board state whenever relevant state changes
  useEffect(() => {
    // Disable saving for local/single/bot to prevent stale stuck state
    if (mode === 'local' || mode === 'single' || mode === 'bot') return;

    if (cells.length > 0 && !showModal && !winner) {
      const gameBoardState = {
        cells,
        currentPlayer,
        activePlayers,
        gameState,
        gameId,
        mode,
        timestamp: Date.now()
      };
      localStorage.setItem('chainReactionGameBoardState', JSON.stringify(gameBoardState));
    }
  }, [cells, currentPlayer, activePlayers, gameState, showModal, winner, gameId, mode]);

  // Clear saved state when game ends (winner is declared)
  useEffect(() => {
    if (winner) {
      localStorage.removeItem('chainReactionGameBoardState');
    }
  }, [winner]);

  const getValidMoves = (state, playerIdToCheck) => {
    const validMoves = [];
    for (let i = 0; i < state.row; i++) {
      for (let j = 0; j < state.col; j++) {
        const cell = state.grid[i][j];
        if (cell.value === 0 || cell.player === playerIdToCheck) {
          validMoves.push({ x: i, y: j });
        }
      }
    }
    return validMoves;
  };

  const applyLocalMove = (x, y, { isBotMove = false } = {}) => {
    // Basic validation: no moves if modal is showing
    if (showModal) return false;

    // In local mode, only check for surrendered state in multiplayer
    if (mode === 'multi' && hasSurrendered) return false;

    // Only handle local/single/bot here
    if (!(mode === 'local' || mode === 'single' || mode === 'bot')) return false;

    // Block human clicks while bot is thinking
    if (!isBotMove && mode === 'bot' && isBotThinking) return false;

    // Create a local copy of the current game state
    const currentState = gameState || {
      grid: cells,
      row: displayRow,
      col: displayCol,
      players: players,
      currentPlayer: currentPlayer,
      activePlayers: activePlayers,
      playersMoved: [],
      winner: null,
      status: 'active',
    };

    // Check if move is valid
    if (x < 0 || x >= currentState.row || y < 0 || y >= currentState.col) return false;
    const cell = currentState.grid[x][y];
    if (cell.value !== 0 && cell.player !== currentState.currentPlayer) return false;

    try {
      // Apply move locally
      const newState = applyMoveLocally(currentState, { x, y }, currentState.currentPlayer);

      console.log(`✅ Move applied: Player ${currentState.currentPlayer} -> (${x}, ${y}), Next player: ${newState.currentPlayer}`);

      // Update state
      setGameState(newState);
      setCells(newState.grid);
      setCurrentPlayer(newState.currentPlayer);
      setActivePlayers(newState.activePlayers);

      // Reset bot thinking flag if the bot just made a move
      if (mode === 'bot' && currentState.currentPlayer === botPlayer) {
        console.log('🤖 Bot move completed, resetting thinking flag');
        setIsBotThinking(false);
      }

      // Check for game over
      if (newState.status === 'finished') {
        console.log('🏆 Game finished! Winner:', newState.winner, 'Active players:', newState.activePlayers);
        setWinner(newState.winner);
        setShowModal(true);
      }

      return true;
    } catch (error) {
      console.error('❌ Error applying move:', error);
      return false;
    }
  };

  const handleCellClick = (x, y) => {
    if (mode === 'local' || mode === 'single' || mode === 'bot') {
      applyLocalMove(x, y, { isBotMove: false });
      return;
    }

    // In multiplayer mode, only allow moves if it's the player's turn
    // Exception: if only 1 active player, allow them to play
    if (mode === 'multi') {
      const isSingleActivePlayer = activePlayers && activePlayers.length === 1;
      if (!isSingleActivePlayer && currentPlayer !== playerId) {
        return; // Not this player's turn
      }
      
      // Use room-based move if roomCode is available, otherwise use old game-based system
      if (roomCode) {
        const username = getCurrentUsername();
        socket.emit('makeMove', { roomCode, playerId, username, move: { x, y } });
      } else {
        socket.emit('makeMove', { gameId, playerId, move: { x, y } });
      }
    }
  };

  const getPlayerColor = (player) => {
    const colors = ['#ff4444', '#4444ff', '#44ff44', '#ffff44', '#ff44ff', '#ff8844', '#ff4488', '#88ff44'];
    return colors[player - 1] || '#ffffff';
  };

  const getPlayerName = (player) => {
    const playerNames = [
      "Player 1 (RED)", "Player 2 (BLUE)", 
      "Player 3 (GREEN)", "Player 4 (YELLOW)",
      "Player 5 (PURPLE)", "Player 6 (ORANGE)",
      "Player 7 (PINK)", "Player 8 (BROWN)"
    ];
    return playerNames[player - 1] || `Player ${player}`;
  };

  const handleReplay = () => {
    console.log(`🎯 HandleReplay called: mode=${mode}, gameId=${gameId}, roomCode=${roomCode}, playerId=${playerId}`);
    if (mode === 'local' || mode === 'single' || mode === 'bot') {
      // For local, singleplayer and bot mode, restart the game locally without reloading the page
      const newState = {
        grid: Array(displayRow).fill().map((_, i) => 
          Array(displayCol).fill().map((_, j) => {
            const cell = { value: 0, player: 0, max_value: 0 };
            // Set max value based on position
            if ((i === 0 || i === displayRow - 1) && (j === 0 || j === displayCol - 1)) {
              cell.max_value = 1; // Corner cells
            } else if (i === 0 || i === displayRow - 1 || j === 0 || j === displayCol - 1) {
              cell.max_value = 2; // Edge cells
            } else {
              cell.max_value = 3; // Inner cells
            }
            return cell;
          })
        ),
        row: displayRow,
        col: displayCol,
        players: players,
        currentPlayer: 1,
        activePlayers: Array.from({ length: players }, (_, i) => i + 1),
        playersMoved: [],
        winner: null,
        status: 'active',
      };
      
      // Reset all game state
      setGameState(newState);
      setCells(newState.grid);
      setCurrentPlayer(1);
      setActivePlayers(newState.activePlayers);
      setShowModal(false);
      setWinner(null);
      setHasSurrendered(false);
      setExplodingCells(new Set());
    } else {
      // In multiplayer, request replay from all players
      console.log(`🚀 Emitting replay request: roomCode=${roomCode}, gameId=${gameId}, playerId=${playerId}`);
      
      // Send both roomCode and gameId for backend compatibility
      const replayData = { playerId };
      if (roomCode) replayData.roomCode = roomCode;
      if (gameId) replayData.gameId = gameId;
      
      console.log(`📡 Sending requestReplay with data:`, replayData);
      socket.emit('requestReplay', replayData);
      
      setShowModal(false); // Close the game over modal
      setShowReplayWaiting(true); // Show waiting for others modal
    }
  };

  const handleReplayResponse = (response) => {
    console.log(`🎯 HandleReplayResponse called: response=${response}, roomCode=${roomCode}, gameId=${gameId}, playerId=${playerId}`);
    
    // Send both roomCode and gameId for backend compatibility
    const responseData = { playerId, response };
    if (roomCode) responseData.roomCode = roomCode;
    if (gameId) responseData.gameId = gameId;
    
    console.log(`📡 Sending respondToReplay with data:`, responseData);
    socket.emit('respondToReplay', responseData);
    
    setHasResponded(true);
    if (!response) {
      setReplayRequested(false);
      setReplayRequestedBy(null);
      setReplayMessage('');
      setShowReplayWaiting(false);
    }
  };

  const handleExit = () => {
    if (mode === 'multi' && playerId) {
      // Send both roomCode and gameId for backend compatibility
      const exitData = { playerId };
      
      if (roomCode) {
        exitData.roomCode = roomCode;
        socket.emit('exitRoom', exitData);
      } else if (gameId) {
        exitData.gameId = gameId;
        socket.emit('exitGame', exitData);
      }
    }
    
    // Clear saved game board state when exiting
    localStorage.removeItem('chainReactionGameBoardState');

    // Reset local UI state
    setShowModal(false);
    setWinner(null);
    
    onExit();
  };

  const handleSurrender = () => {
    if (mode === 'multi' && playerId) {
      setHasSurrendered(true); // Mark that this player has surrendered
      // Use roomCode if available (new system), otherwise use gameId (old system)
      if (roomCode) {
        socket.emit('surrenderRoom', { roomCode, playerId });
      } else if (gameId) {
        socket.emit('surrenderGame', { gameId, playerId });
      }
      // Close the surrender confirmation modal
      setShowSurrenderConfirm(false);
      // Don't exit immediately - wait for gameOver event like other players
    } else {
      // In local mode, eliminate the current player like they naturally lost
      setShowSurrenderConfirm(false);
      
      // Remove all orbs belonging to the current player from the grid
      const newGrid = cells.map(row => 
        row.map(cell => 
          cell.player === currentPlayer 
            ? { value: 0, player: 0 } 
            : cell
        )
      );
      
      // Remove current player from active players
      const newActivePlayers = activePlayers.filter(p => p !== currentPlayer);
      
      // Determine next player
      let nextPlayer;
      if (newActivePlayers.length > 0) {
        // Find the next player in the sequence
        const currentIndex = activePlayers.indexOf(currentPlayer);
        const remainingAfterCurrent = activePlayers.slice(currentIndex + 1).filter(p => p !== currentPlayer);
        const remainingBeforeCurrent = activePlayers.slice(0, currentIndex).filter(p => p !== currentPlayer);
        const nextInSequence = [...remainingAfterCurrent, ...remainingBeforeCurrent];
        nextPlayer = nextInSequence.length > 0 ? nextInSequence[0] : newActivePlayers[0];
      }
      
      // Update game state
      const newState = {
        ...gameState,
        grid: newGrid,
        activePlayers: newActivePlayers,
        players: newActivePlayers.length,
        currentPlayer: nextPlayer
      };
      
      setGameState(newState);
      setActivePlayers(newActivePlayers);
      setCurrentPlayer(nextPlayer);
      setCells(newGrid);
      
      // Check if only one player remains (game over)
      if (newActivePlayers.length === 1) {
        setWinner(newActivePlayers[0]);
        setShowModal(true);
      }
    }
  };

  const handleSurrenderConfirm = () => {
    setShowSurrenderConfirm(true);
  };

  const handleSurrenderCancel = () => {
    setShowSurrenderConfirm(false);
  };


  // Use backend state for row/col if available
  const displayRow = gameState?.row || row;
  const displayCol = gameState?.col || col;

  return (
    <div className="game-container">
      {/* Loading Screen */}
      {isLoadingBoard ? (
        <div className="waiting-overlay">
          <div className="waiting-content">
            <h2>🎮 Loading Game</h2>
            <p>Restoring game state...</p>
          </div>
        </div>
      ) : (
        <>
      {/* Waiting Screen for Multiplayer */}
      {mode === 'multi' && waitingForPlayers && (
        <div className="waiting-overlay">
          <div className="waiting-content">
            <h2>🎮 Waiting for Players</h2>
            <div className="room-info">
              <p><strong>Room Code:</strong> {roomCode || gameId}</p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomCode || gameId);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="copy-room-button"
              >
                {copied ? '✓ Copied!' : '📋 Copy Room Code'}
              </button>
            </div>
            
            <div className="players-joined">
              <h3>Players Joined:</h3>
              {Object.entries(gamePlayerUsernames).map(([id, username]) => (
                <div key={id} className="joined-player">
                  <div className={`player-color-indicator player-${id}`}></div>
                  <span>{username}</span>
                  {id == playerId && <span className="you-label">(You)</span>}
                </div>
              ))}
            </div>
            
            <div className="waiting-animation">
              <div className="spinner"></div>
              <p>Share the room code with friends to start playing!</p>
            </div>
          </div>
        </div>
      )}

      {/* Game Header - Hidden during gameplay */}

      {/* Game Controls Section - Above the grid */}
      <div className="game-controls-section">
        <div className="current-turn">
          <div 
            className="current-turn-indicator" 
            style={{ backgroundColor: getPlayerColor(currentPlayer) }}
          ></div>
          <span>Current Turn: {getPlayerDisplayName(currentPlayer)}</span>
        </div>
        <div className="bot-thinking-indicator" style={{ visibility: isBotThinking ? 'visible' : 'hidden' }}>
          🤖 Bot is thinking...
        </div>

        <div className="controls-row">

          {/* Room Code Display for Multiplayer - Left */}
          {mode === 'multi' && (roomCode || gameId) ? (
            <div className="room-code-display">
              <div className="room-code-info">
                <span className="room-code-label">Room Code:</span>
                <span className="room-code-value">{roomCode || gameId}</span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomCode || gameId);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="copy-room-code-btn"
              >
                {copied ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
          ) : (
            <div className="room-code-placeholder"></div>
          )}

          {/* Action Buttons - Center and Right */}
          <div className="button-group">
            {/* Show surrender status */}
            {hasSurrendered ? (
              <div className="surrender-status">
                You have surrendered
              </div>
            ) : mode === 'multi' ? (
              <>
                <button
                  onClick={handleSurrenderConfirm}
                  className="surrender-button"
                >
                  Surrender
                </button>
                <button onClick={handleExit} className="exit-button">
                  Exit Game
                </button>
              </>
            ) : (
              <button onClick={handleExit} className="exit-button">
                Exit Game
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Game Board */}
      <div className="game-board-container">
        <div 
          className="game-board"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${displayCol}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${displayRow}, ${cellSize}px)`,
            gap: '6px',
            padding: '25px',
            background: 'linear-gradient(145deg, #1a1a2e, #16213e)',
            borderRadius: '15px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            border: `3px solid ${getPlayerColor(currentPlayer)}`,
            margin: '10px',
            width: 'fit-content',
            height: 'fit-content',
          }}
        >
        {cells && cells.map((rowArr, i) =>
          rowArr.map((cell, j) => (
            <GridCell
              key={`${i}-${j}`}
              x={i}
              y={j}
              orb={cell.value}
              player={cell.player}
              onClick={handleCellClick}
              size={cellSize}
              currentPlayer={currentPlayer}
              isExploding={explodingCells.has(`${i}-${j}`)}
            />
          ))
        )}
        </div>
      </div>
      
      {/* Modals and overlays */}
      {showModal && winner && (
        <div className="modal-overlay">
          <div className="modal-content">
            {hasSurrendered ? (
              <>
                <h2>🏳️ You Surrendered</h2>
                <p>{getPlayerDisplayName(winner)} wins!</p>
                <p style={{ fontSize: '14px', opacity: 0.8 }}>
                  You can still participate in replay requests.
                </p>
              </>
            ) : (
              <>
                <h2>🎉 Game Over! 🎉</h2>
                <p>{getPlayerDisplayName(winner)} wins!</p>
              </>
            )}
            <button onClick={handleReplay} className="button button-replay">
              {(mode === 'single' || mode === 'bot' || mode === 'local') ? '🔄 Play Again' : '🔄 Request Replay'}
            </button>
            <button onClick={handleExit} className="button button-exit">
              {(mode === 'single' || mode === 'bot' || mode === 'local') ? 'Exit to Menu' : 'Leave Game'}
            </button>
          </div>
        </div>
      )}
      
      {replayRequested && !hasResponded && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>🔄 Replay Request</h2>
            <p>{replayMessage}</p>
            <p>Do you want to play again?</p>
            <button 
              onClick={() => handleReplayResponse(true)} 
              className="button button-replay"
            >
              ✅ Yes, Play Again
            </button>
            <button 
              onClick={() => handleReplayResponse(false)} 
              className="button button-exit"
            >
              ❌ No, I'll Leave
            </button>
          </div>
        </div>
      )}
      
      {(replayRequested && hasResponded) || showReplayWaiting ? (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>⏳ Waiting for Other Players</h2>
            <p>
              {showReplayWaiting 
                ? "Waiting for all players to respond to your replay request..." 
                : "Waiting for all players to respond to the replay request..."}
            </p>
            {waitingForPlayersState.length > 0 && (
              <p>Still waiting for: {waitingForPlayersState.join(', ')}</p>
            )}
            <div style={{ margin: '20px 0' }}>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                border: '4px solid rgba(255,255,255,0.3)', 
                borderTop: '4px solid #ffd700', 
                borderRadius: '50%', 
                animation: 'spin 1s linear infinite',
                margin: '0 auto'
              }}></div>
            </div>
          </div>
        </div>
      ) : null}

      {showGameClosed && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Game Closed</h2>
            <p>{gameClosedMessage}</p>
            <button onClick={onExit} className="button button-exit">
              Back to Menu
            </button>
          </div>
        </div>
      )}

      {showSurrenderConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Surrender Game</h2>
            <p>Are you sure you want to {(mode === 'single' || mode === 'bot' || mode === 'local') ? 'surrender and be eliminated from the game' : 'surrender'}?</p>
            {mode === 'multi' && (
              <p style={{ fontSize: '14px', opacity: 0.8 }}>
                {isHost ? 'As the host, surrendering will close the game for all players.' : 'You will leave the game and other players will continue.'}
              </p>
            )}
            {(mode === 'single' || mode === 'bot' || mode === 'local') && (
              <p style={{ fontSize: '14px', opacity: 0.8 }}>
                You will be eliminated and the remaining players will continue playing locally.
              </p>
            )}
            <button 
              onClick={handleSurrender} 
              className="button button-exit"
            >
              ✅ Yes, Surrender
            </button>
            <button 
              onClick={handleSurrenderCancel} 
              className="button"
              style={{ background: 'linear-gradient(45deg, #666, #999)' }}
            >
              ❌ Cancel
            </button>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default GameBoard;