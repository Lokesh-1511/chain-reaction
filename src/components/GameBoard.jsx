import React, { useState, useEffect, useRef } from 'react';
import GridCell from './GridCell';
import socket from '../services/socket';
import { getGameState } from '../services/api';
import './GameBoard.css';

const GameBoard = ({ row, col, players, onExit, gameId, playerId, mode, isHost }) => {
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
  const [waitingForPlayers, setWaitingForPlayers] = useState([]);
  const [hasResponded, setHasResponded] = useState(false);
  const [showReplayWaiting, setShowReplayWaiting] = useState(false);
  const [showGameClosed, setShowGameClosed] = useState(false);
  const [gameClosedMessage, setGameClosedMessage] = useState('');
  const [remainingPlayers, setRemainingPlayers] = useState([]);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);
  const [explodingCells, setExplodingCells] = useState(new Set());
  const containerRef = useRef(null);
  const headerRef = useRef(null);

  useEffect(() => {
    const calculateCellSize = () => {
      if (containerRef.current && headerRef.current) {
        const containerHeight = containerRef.current.offsetHeight;
        const headerHeight = headerRef.current.offsetHeight;
        const availableHeight = containerHeight - headerHeight;
        const containerWidth = containerRef.current.offsetWidth;
        const gap = 5;
        const margin = 40; // 20px top and bottom margin for the grid

        // Calculate cell size based on available container width and height
        const sizeByWidth = (containerWidth - (col + 1) * gap) / col;
        const sizeByHeight = (availableHeight - (row + 1) * gap - margin) / row;

        // Use the smaller of the two to ensure it fits both ways, with a max of 60
        setCellSize(Math.floor(Math.min(sizeByWidth, sizeByHeight, 60)));
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
    // Join game room
    socket.emit('joinGame', { gameId, playerId });
    // Fetch initial state
    getGameState(gameId).then(game => {
      setGameState(game.state);
      setCells(game.state.grid);
      setCurrentPlayer(game.state.currentPlayer);
      setActivePlayers(game.state.activePlayers);
    });
    // Listen for updates
    socket.on('gameUpdate', ({ state }) => {
      setGameState(state);
      
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
    socket.on('gameOver', ({ winner }) => {
      setWinner(winner);
      setShowModal(true);
    });

    // Listen for replay-related events
    socket.on('replayRequested', ({ requestedBy, message }) => {
      if (requestedBy !== playerId) {
        setReplayRequested(true);
        setReplayRequestedBy(requestedBy);
        setReplayMessage(message);
        setHasResponded(false);
      }
    });

    socket.on('replayResponse', ({ playerId: respondedPlayerId, response, waitingFor }) => {
      setWaitingForPlayers(waitingFor);
      // Could add more UI feedback here about who responded
    });

    socket.on('gameRestarted', ({ state }) => {
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
  }, [gameId, playerId]);

  const handleCellClick = (x, y) => {
    // In single player mode, any click is valid.
    // In multiplayer, only the current player can make a move.
    if (showModal || (mode === 'multi' && currentPlayer !== playerId)) return;

    // In single player mode, we send the currentPlayer's ID with the move.
    const movePlayerId = mode === 'single' ? currentPlayer : playerId;
    socket.emit('makeMove', { gameId, playerId: movePlayerId, move: { x, y } });
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
    if (mode === 'single') {
      window.location.reload();
    } else {
      // In multiplayer, request replay from all players
      socket.emit('requestReplay', { gameId, playerId });
      setShowModal(false); // Close the game over modal
      setShowReplayWaiting(true); // Show waiting for others modal
    }
  };

  const handleReplayResponse = (response) => {
    socket.emit('respondToReplay', { gameId, playerId, response });
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
    if (mode === 'multi' && gameId && playerId) {
      // Notify server about player exit
      socket.emit('exitGame', { gameId, playerId });
    }
    onExit();
  };

  const handleSurrender = () => {
    if (mode === 'multi' && gameId && playerId) {
      socket.emit('surrenderGame', { gameId, playerId });
    } else {
      // In single player mode, just exit
      onExit();
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
      {/* Game Header */}
      <div className="game-header" ref={headerRef}>
        <h1 className="game-title">⚡ Chain Reaction ⚡</h1>
        
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
              {isHost && <span className="host-badge">👑 Host</span>}
            </div>
          </div>
        )}
        
        {/* Current Player Display */}
        <div className="current-player-section">
          <div className="player-indicator">
            <span className="player-label">Current Turn:</span>
            <div className="player-info">
              <div className={`player-color-indicator player-${currentPlayer}`}></div>
              <span className="player-name">{getPlayerName(currentPlayer)}</span>
            </div>
          </div>
          
          {/* Surrender Button - Only in multiplayer */}
          {mode === 'multi' && !showModal && (
            <button
              onClick={handleSurrenderConfirm}
              className="surrender-button"
            >
              🏳️ Surrender
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
            padding: '20px',
            background: 'linear-gradient(145deg, #1a1a2e, #16213e)',
            borderRadius: '15px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            border: `3px solid ${getPlayerColor(currentPlayer)}`,
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
            <h2>🎉 Game Over! 🎉</h2>
            <p>{getPlayerName(winner)} wins!</p>
            <button onClick={handleReplay} className="button button-replay">
              {mode === 'single' ? '🔄 Play Again' : '🔄 Request Replay'}
            </button>
            <button onClick={handleExit} className="button button-exit">
              {mode === 'single' ? '🚪 Exit to Menu' : '🚪 Leave Game'}
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
            {waitingForPlayers.length > 0 && (
              <p>Still waiting for: {waitingForPlayers.join(', ')}</p>
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
            <h2>🚪 Game Closed</h2>
            <p>{gameClosedMessage}</p>
            <button onClick={onExit} className="button button-exit">
              🏠 Back to Menu
            </button>
          </div>
        </div>
      )}

      {showSurrenderConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>🏳️ Surrender Game</h2>
            <p>Are you sure you want to surrender?</p>
            <p style={{ fontSize: '14px', opacity: 0.8 }}>
              {isHost ? 'As the host, surrendering will close the game for all players.' : 'You will leave the game and other players will continue.'}
            </p>
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