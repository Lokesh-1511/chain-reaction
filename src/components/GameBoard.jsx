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
          <p style={{ margin: 0 }}>Current Player: {getPlayerName(currentPlayer)}</p>
          {mode === 'multi' && !showModal && (
            <button
              onClick={handleSurrenderConfirm}
              className="surrender-button"
            >
              Surrender
            </button>
          )}
        </div>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${displayCol}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${displayRow}, ${cellSize}px)`,
        gap: '5px',
        margin: '20px auto',
        justifyContent: 'center'
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
              currentPlayer={currentPlayer}
            />
          ))
        )}
      </div>
      {showModal && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <h2>Game Over!</h2>
            <p>{getPlayerName(winner)} wins!</p>
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
    </div>
  );
};

export default GameBoard;