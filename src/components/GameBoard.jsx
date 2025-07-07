import React, { useState, useEffect, useRef } from 'react';
import GridCell from './GridCell';
import socket from '../services/socket';
import { getGameState } from '../services/api';
import './GameBoard.css';

const GameBoard = ({ row, col, players, onExit, gameId, playerId, mode, isHost }) => {
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
  const [notification, setNotification] = useState({ show: false, message: '', type: 'info' });
  const [gameEndReason, setGameEndReason] = useState(''); // Track how the game ended
  const [isEliminated, setIsEliminated] = useState(false);
  const [isWatching, setIsWatching] = useState(false);
  const [showEliminationModal, setShowEliminationModal] = useState(false);
  const [eliminationModalMessage, setEliminationModalMessage] = useState('');
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
      setCells(state.grid);
      setCurrentPlayer(state.currentPlayer);
      setActivePlayers(state.activePlayers);
    });
    socket.on('gameOver', ({ winner }) => {
      setWinner(winner);
      setShowModal(true);
      // Check if this was due to surrender by checking if we recently got a surrender notification
      if (notification.show && notification.message.includes('surrendered')) {
        setGameEndReason('surrender');
      } else {
        setGameEndReason('normal');
      }
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
      setGameEndReason('');
    });

    socket.on('replayCancelled', () => {
      setReplayRequested(false);
      setReplayRequestedBy(null);
      setReplayMessage('');
      setHasResponded(false);
      setWaitingForPlayers([]);
      setShowReplayWaiting(false);
      setGameEndReason('');
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
      showNotification(message, 'warning');
    });

    socket.on('playerSurrendered', ({ playerId: surrenderedPlayerId, remainingPlayers, message }) => {
      setRemainingPlayers(remainingPlayers);
      showNotification(message, 'info');
      // If only one player remains, prepare for game over
      if (remainingPlayers.length === 1) {
        setGameEndReason('surrender');
      }
    });

    socket.on('playerEliminated', ({ eliminatedPlayerId, message }) => {
      if (eliminatedPlayerId === playerId) {
        // This player was eliminated
        setIsEliminated(true);
        setShowEliminationModal(true);
        setEliminationModalMessage('');
        showNotification(message, 'error');
      } else {
        // Another player was eliminated
        showNotification(`Player ${eliminatedPlayerId} was eliminated`, 'warning');
      }
    });

    socket.on('watchingGame', ({ message }) => {
      setIsWatching(true);
      showNotification(message, 'info');
      // The modal closing is now handled in handleContinueWatching
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
      socket.off('playerEliminated');
      socket.off('watchingGame');
    };
  }, [gameId, playerId]);

  const handleCellClick = (x, y) => {
    // In single player mode, any click is valid.
    // In multiplayer, only the current player can make a move.
    // Eliminated players and watchers cannot make moves.
    if (showModal || isEliminated || isWatching || (mode === 'multi' && currentPlayer !== playerId)) return;

    // In single player mode, we send the currentPlayer's ID with the move.
    const movePlayerId = mode === 'single' ? currentPlayer : playerId;
    socket.emit('makeMove', { gameId, playerId: movePlayerId, move: { x, y } });
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
      setShowSurrenderConfirm(false);
      showNotification('You have surrendered the game', 'warning');
      // Don't immediately exit - let the game over sequence play out naturally
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

  const handleContinueWatching = () => {
    socket.emit('continueWatching', { gameId, playerId });
    setEliminationModalMessage('You are now watching the game...');
    
    // Close the modal after 2 seconds
    setTimeout(() => {
      setShowEliminationModal(false);
      setEliminationModalMessage('');
    }, 2000);
  };

  const handleExitAfterElimination = () => {
    socket.emit('exitAfterElimination', { gameId, playerId });
    onExit();
  };

  const showNotification = (message, type = 'info') => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: 'info' });
    }, 4000);
  };

  const modalStyles = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    },
    modal: {
      backgroundColor: 'white',
      padding: '20px',
      borderRadius: '10px',
      textAlign: 'center',
      maxWidth: '80%',
      color: '#333'
    },
    button: {
      margin: '10px',
      padding: '10px 20px',
      fontSize: '16px',
      cursor: 'pointer',
      backgroundColor: '#4CAF50',
      color: 'white',
      border: 'none',
      borderRadius: '5px'
    }
  };

  // Use backend state for row/col if available
  const displayRow = gameState?.row || row;
  const displayCol = gameState?.col || col;

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div ref={headerRef}>
        <div style={{ color: 'yellow', marginBottom: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
          Game ID: {gameId || 'N/A'}
          <button
            onClick={handleCopyGameId}
            style={{
              padding: "2px 8px",
              fontSize: "14px",
              borderRadius: "4px",
              border: "none",
              background: "#333",
              color: "#fff",
              cursor: "pointer"
            }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          | Player ID: {playerId || 'N/A'}
        </div>
        <h2>Chain Reaction Game</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <p style={{ margin: 0 }}>
              Current Player: {getPlayerName(currentPlayer)}
              {isEliminated && (
                <span style={{ color: '#ff4444', marginLeft: '10px', fontSize: '12px' }}>
                  (You are eliminated)
                </span>
              )}
              {isWatching && (
                <span style={{ color: '#ffeb3b', marginLeft: '10px', fontSize: '12px' }}>
                  (Watching)
                </span>
              )}
            </p>
            {mode === 'multi' && remainingPlayers.length > 0 && (
              <p style={{ margin: 0, fontSize: '12px', color: '#ccc' }}>
                Active Players: {remainingPlayers.length}
              </p>
            )}
          </div>
          {mode === 'multi' && !showModal && !isEliminated && !isWatching && (
            <div style={{ textAlign: 'right' }}>
              <button
                onClick={handleSurrenderConfirm}
                className="surrender-button"
              >
                Surrender
              </button>
              <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                Press ESC
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${displayCol}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${displayRow}, ${cellSize}px)`,
        gap: '5px',
        margin: '20px auto',
        justifyContent: 'center',
        opacity: isEliminated || isWatching ? 0.7 : 1,
        pointerEvents: isEliminated || isWatching ? 'none' : 'auto'
      }}>
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
            />
          ))
        )}
      </div>
      {showModal && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <h2>Game Over!</h2>
            <p>{getPlayerName(winner)} wins!</p>
            {gameEndReason === 'surrender' && (
              <p style={{ fontSize: '14px', color: '#666', fontStyle: 'italic' }}>
                Victory by opponent surrender
              </p>
            )}
            <button onClick={handleReplay} style={modalStyles.button}>
              {mode === 'single' ? 'Replay' : 'Request Replay'}
            </button>
            <button onClick={handleExit} style={{ ...modalStyles.button, backgroundColor: '#f44336' }}>
              {mode === 'single' ? 'Exit to Menu' : 'Leave Game'}
            </button>
          </div>
        </div>
      )}
      
      {replayRequested && !hasResponded && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <h2>Replay Request</h2>
            <p>{replayMessage}</p>
            <p>Do you want to play again?</p>
            <button 
              onClick={() => handleReplayResponse(true)} 
              style={{ ...modalStyles.button, backgroundColor: '#4CAF50' }}
            >
              Yes, Play Again
            </button>
            <button 
              onClick={() => handleReplayResponse(false)} 
              style={{ ...modalStyles.button, backgroundColor: '#f44336' }}
            >
              No, I'll Leave
            </button>
          </div>
        </div>
      )}
      
      {(replayRequested && hasResponded) || showReplayWaiting ? (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <h2>Waiting for Other Players</h2>
            <p>
              {showReplayWaiting 
                ? "Waiting for all players to respond to your replay request..." 
                : "Waiting for all players to respond to the replay request..."}
            </p>
            {waitingForPlayers.length > 0 && (
              <p>Still waiting for: {waitingForPlayers.join(', ')}</p>
            )}
            <div style={{ marginTop: '10px' }}>
              <div style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Notification Toast */}
      {notification.show && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: notification.type === 'warning' ? '#ff9800' : notification.type === 'error' ? '#f44336' : '#2196f3',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '4px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
          zIndex: 1001,
          fontSize: '14px',
          fontWeight: 'bold',
          maxWidth: '300px',
          wordWrap: 'break-word'
        }}>
          {notification.message}
        </div>
      )}
      
      {showGameClosed && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <h2>Game Closed</h2>
            <p>{gameClosedMessage}</p>
            <button onClick={onExit} style={modalStyles.button}>
              Back to Menu
            </button>
          </div>
        </div>
      )}

      {showSurrenderConfirm && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <h2>Surrender Game</h2>
            <p>Are you sure you want to surrender?</p>
            <p style={{ fontSize: '14px', color: '#666' }}>
              {isHost ? 'As the host, surrendering will close the game for all players.' : 'You will leave the game and other players will continue.'}
            </p>
            <button 
              onClick={handleSurrender} 
              style={{ ...modalStyles.button, backgroundColor: '#f44336' }}
            >
              Yes, Surrender
            </button>
            <button 
              onClick={handleSurrenderCancel} 
              style={{ ...modalStyles.button, backgroundColor: '#666' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showEliminationModal && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            {eliminationModalMessage ? (
              <>
                <h2 style={{ color: '#2196f3' }}>Spectating</h2>
                <p>{eliminationModalMessage}</p>
                <div style={{ marginTop: '10px' }}>
                  <div style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</div>
                </div>
              </>
            ) : (
              <>
                <h2 style={{ color: '#f44336' }}>You Lost!</h2>
                <p>You have been eliminated from the game.</p>
                <p style={{ fontSize: '14px', color: '#666' }}>
                  Would you like to continue watching the game or exit?
                </p>
                <button 
                  onClick={handleContinueWatching} 
                  style={{ ...modalStyles.button, backgroundColor: '#2196f3' }}
                >
                  Continue Watching
                </button>
                <button 
                  onClick={handleExitAfterElimination} 
                  style={{ ...modalStyles.button, backgroundColor: '#f44336' }}
                >
                  Exit to Menu
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GameBoard;