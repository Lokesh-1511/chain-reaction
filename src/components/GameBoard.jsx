import React, { useState, useEffect, useRef } from 'react';
import GridCell from './GridCell';
import socket from '../services/socket';
import { getGameState } from '../services/api';
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
  waitingForPlayers = false 
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
  const containerRef = useRef(null);
  const headerRef = useRef(null);

  // Debug logging for modal states
  useEffect(() => {
    console.log(`🖥️ Modal states: showModal=${showModal}, replayRequested=${replayRequested}, showReplayWaiting=${showReplayWaiting}, hasResponded=${hasResponded}`);
  }, [showModal, replayRequested, showReplayWaiting, hasResponded]);

  // Helper function to get player display name
  const getPlayerDisplayName = (playerId) => {
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
    
    // Process explosions
    let explosionsOccurred;
    do {
      explosionsOccurred = false;
      const explosionQueue = [];
      for (let i = 0; i < newState.row; i++) {
        for (let j = 0; j < newState.col; j++) {
          if (newState.grid[i][j].value > newState.grid[i][j].max_value) {
            explosionQueue.push({ i, j });
          }
        }
      }
      if (explosionQueue.length > 0) {
        explosionsOccurred = true;
        for (const { i, j } of explosionQueue) {
          const explodingCell = newState.grid[i][j];
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
            }
          }
        }
      }
    } while (explosionsOccurred);
    
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
      if (containerRef.current && headerRef.current) {
        const containerHeight = containerRef.current.offsetHeight;
        const headerHeight = headerRef.current.offsetHeight;
        const availableHeight = containerHeight - headerHeight;
        const containerWidth = containerRef.current.offsetWidth;
        const gap = 6; // Match the gap in the grid
        const padding = 50; // 25px padding on each side
        const margin = 120; // Increased margin to prevent overlap with header

        // Calculate cell size based on available container width and height
        const sizeByWidth = (containerWidth - padding - 40) / col - gap; // Account for padding and margins
        const sizeByHeight = (availableHeight - padding - margin) / row - gap;

        // Use the smaller of the two to ensure it fits both ways, with a min of 30 and max of 55
        setCellSize(Math.floor(Math.min(Math.max(sizeByWidth, sizeByHeight, 30), 55)));
      }
    };

    // Use a timeout to ensure layout is stable before calculating
    const timer = setTimeout(calculateCellSize, 0);
    window.addEventListener('resize', calculateCellSize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculateCellSize);
    };
  }, [row, col, gameState]);

  useEffect(() => {
    if (!gameId) return;
    
    // For singleplayer, only initialize the game state locally
    if (mode === 'single') {
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
      return;
    }
    
    // For multiplayer, handle server connections
    if (mode === 'multi' && roomCode) {
      // For room-based multiplayer, we're already connected to the room from Menu
      // Just fetch the game state
      getGameState(gameId).then(game => {
        setGameState(game.state);
        setCells(game.state.grid);
        setCurrentPlayer(game.state.currentPlayer);
        setActivePlayers(game.state.activePlayers);
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
      // Show a brief notification that a player left
      console.log(message);
      // You could add a toast notification here
    });

    socket.on('playerSurrendered', ({ playerId: surrenderedPlayerId, remainingPlayers, message }) => {
      setRemainingPlayers(remainingPlayers);
      // Show a brief notification that a player surrendered
      console.log(message);
      // You could add a toast notification here
    });

    return () => {
      socket.off('gameUpdate');
      socket.off('gameOver');
      socket.off('replayRequested');
      socket.off('replayResponse');
      socket.off('gameRestarted');
      socket.off('replayCancelled');
      socket.off('gameClosedByHost');
      socket.off('playerLeft');
      socket.off('playerSurrendered');
    };
  }, [gameId, playerId, mode, row, col, players]);

  const handleCellClick = (x, y) => {
    // Basic validation: no moves if modal is showing
    if (showModal) return;
    
    // In local mode, only check for surrendered state in multiplayer
    if (mode === 'multi' && hasSurrendered) return;
    
    // In single player mode, handle moves locally
    if (mode === 'single') {
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
      if (x < 0 || x >= currentState.row || y < 0 || y >= currentState.col) return;
      const cell = currentState.grid[x][y];
      if (cell.value !== 0 && cell.player !== currentState.currentPlayer) return;
      
      // Apply move locally
      const newState = applyMoveLocally(currentState, { x, y }, currentState.currentPlayer);
      
      // Update state
      setGameState(newState);
      setCells(newState.grid);
      setCurrentPlayer(newState.currentPlayer);
      setActivePlayers(newState.activePlayers);
      
      // Check for game over
      if (newState.status === 'finished') {
        setWinner(newState.winner);
        setShowModal(true);
      }
      
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
        socket.emit('makeMove', { roomCode, move: { x, y } });
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
    if (mode === 'single') {
      // For singleplayer, restart the game locally without reloading the page
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

  const handleCopyGameId = () => {
    if (gameId) {
      navigator.clipboard.writeText(gameId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
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
    <div className="game-container" ref={containerRef}>
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

      {/* Game Header */}
      <div className="game-header" ref={headerRef}>
        <h1 className="game-title">Chain Reaction</h1>
        
        {/* Multiplayer Info - Only show in multiplayer mode */}
        {mode === 'multi' && (
          <div className="multiplayer-info">
            <div className="game-id-section">
              <span className="info-label">Game ID:</span>
              <span className="info-value">{gameId || 'N/A'}</span>
              <button
                onClick={handleCopyGameId}
                className="copy-button"
              >
                {copied ? "✓ Copied!" : "📋 Copy"}
              </button>
            </div>
            <div className="player-id-section">
              <span className="info-label">Player ID:</span>
              <span className="info-value">{playerId || 'N/A'}</span>
              {isHost && <span className="host-badge">Host</span>}
            </div>
          </div>
        )}
        
        {/* Current Player Display */}
        <div className="current-player-section">
          <div className="player-indicator">
            <span className="player-label">
              {activePlayers && activePlayers.length === 1 ? "Playing:" : "Current Turn:"}
            </span>
            <div className="player-info">
              <div className={`player-color-indicator player-${currentPlayer}`}></div>
              <span className="player-name">{getPlayerDisplayName(currentPlayer)}</span>
            </div>
          </div>
          
          {/* Show surrender status */}
          {hasSurrendered && (
            <div style={{ 
              backgroundColor: 'rgba(255, 71, 87, 0.2)', 
              border: '1px solid rgba(255, 71, 87, 0.4)',
              borderRadius: '15px',
              padding: '8px 16px',
              fontSize: '0.9rem',
              color: '#ffcccb'
            }}>
              You have surrendered
            </div>
          )}
          
          {/* Surrender Button - Both modes */}
          {!showModal && !hasSurrendered && (
            <button
              onClick={handleSurrenderConfirm}
              className="surrender-button"
            >
              {mode === 'single' ? 'Exit Game' : 'Surrender'}
            </button>
          )}
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
      {showModal && (
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
              {mode === 'single' ? '🔄 Play Again' : '🔄 Request Replay'}
            </button>
            <button onClick={handleExit} className="button button-exit">
              {mode === 'single' ? 'Exit to Menu' : 'Leave Game'}
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
            <h2>{mode === 'single' ? 'Surrender Game' : 'Surrender Game'}</h2>
            <p>Are you sure you want to {mode === 'single' ? 'surrender and be eliminated from the game' : 'surrender'}?</p>
            {mode === 'multi' && (
              <p style={{ fontSize: '14px', opacity: 0.8 }}>
                {isHost ? 'As the host, surrendering will close the game for all players.' : 'You will leave the game and other players will continue.'}
              </p>
            )}
            {mode === 'single' && (
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
    </div>
  );
};

export default GameBoard;