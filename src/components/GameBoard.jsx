import React, { useState } from 'react';
import Cell from '../models/Cell';
import GridCell from './GridCell';

const GameBoard = ({ row, col, players, onExit }) => {
  // Game state
  const [cells, setCells] = useState(createInitialCells());
  const [currentPlayer, setCurrentPlayer] = useState(1);
  const [activePlayers, setActivePlayers] = useState(
    Array.from({ length: players }, (_, i) => i + 1)
  );
  const [playersMoved, setPlayersMoved] = useState([]); // Track who has moved
  const [showModal, setShowModal] = useState(false);
  const [winner, setWinner] = useState(null);

  // Initialize grid
  function createInitialCells() {
    const grid = [];
    for (let i = 0; i < row; i++) {
      grid[i] = [];
      for (let j = 0; j < col; j++) {
        const cell = new Cell();
        cell.setMaxValue(i, j, row, col);
        grid[i][j] = cell;
      }
    }
    return grid;
  }

  // Handle cell clicks
  const handleCellClick = (x, y) => {
    if (showModal) return;

    const newCells = cells.map(row => row.map(cell => ({ ...cell })));
    const cell = newCells[x][y];

    // Only allow move if cell is empty or belongs to current player
    if (cell.player === 0 || cell.player === currentPlayer) {
      processMoveWithExplosions(currentPlayer, x, y, newCells);

      // Mark this player as having moved
      setPlayersMoved(prev => {
        if (!prev.includes(currentPlayer)) {
          return [...prev, currentPlayer];
        }
        return prev;
      });

      // Advance to next active player
      setTimeout(() => {
        setCurrentPlayer(prev => {
          const updatedPlayers = checkPlayerElimination(newCells, playersMoved);
          if (updatedPlayers.length === 1) return prev;
          const idx = updatedPlayers.indexOf(prev);
          return updatedPlayers[(idx + 1) % updatedPlayers.length];
        });
      }, 0);
    }
  };

  // Process move and explosions
  const processMoveWithExplosions = (player, x, y, newCells) => {
    placeOrb(player, x, y, newCells);

    let explosionsOccurred;
    do {
      explosionsOccurred = false;
      const explosionQueue = [];

      for (let i = 0; i < row; i++) {
        for (let j = 0; j < col; j++) {
          if (newCells[i][j].value > newCells[i][j].max_value) {
            explosionQueue.push({i, j});
          }
        }
      }

      if (explosionQueue.length > 0) {
        explosionsOccurred = true;
        for (const {i, j} of explosionQueue) {
          explodeCell(player, i, j, newCells);
        }
      }
    } while (explosionsOccurred);

    updateGameState(newCells, player);
  };

  // Place an orb
  const placeOrb = (player, x, y, newCells) => {
    const cell = newCells[x][y];
    if (cell.player === player) {
      cell.value++;
    } else if (cell.value === 0) {
      cell.value = 1;
      cell.player = player;
    }
  };

  // Explode a cell
  const explodeCell = (player, x, y, newCells) => {
    const cell = newCells[x][y];
    if (cell.value <= cell.max_value) return;

    cell.value = 0;
    cell.player = 0;

    const directions = [
      {dx: -1, dy: 0}, {dx: 1, dy: 0}, 
      {dx: 0, dy: -1}, {dx: 0, dy: 1}
    ];

    for (const {dx, dy} of directions) {
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < row && ny >= 0 && ny < col) {
        const neighbor = newCells[nx][ny];
        neighbor.value++;
        neighbor.player = player;
      }
    }
  };

  // Update game state
  const updateGameState = (newCells, player) => {
    setCells(newCells);

    // Only check for elimination after all players have moved at least once
    if (playersMoved.length + 1 >= players) {
      const updatedActivePlayers = checkPlayerElimination(newCells, playersMoved.concat(player));
      setActivePlayers(updatedActivePlayers);

      if (updatedActivePlayers.length === 1) {
        setWinner(updatedActivePlayers[0]);
        setShowModal(true);
        return;
      }
    }
  };

  // Check active players (only eliminate if player has moved at least once)
  const checkPlayerElimination = (cellsToCheck, movedPlayers) => {
    const playersWithOrbs = new Set();
    cellsToCheck.forEach(row => {
      row.forEach(cell => {
        if (cell.player !== 0) {
          playersWithOrbs.add(cell.player);
        }
      });
    });
    // Only keep players who have orbs, or who haven't moved yet
    return activePlayers.filter(
      p => playersWithOrbs.has(p) || !movedPlayers || !movedPlayers.includes(p)
    );
  };

  // Get player name
  const getPlayerName = (player) => {
    const playerNames = [
      "Player 1 (RED)", "Player 2 (BLUE)", 
      "Player 3 (GREEN)", "Player 4 (YELLOW)",
      "Player 5 (PURPLE)", "Player 6 (ORANGE)",
      "Player 7 (PINK)", "Player 8 (BROWN)"
    ];
    return playerNames[player - 1] || `Player ${player}`;
  };

  // Reset game
  const handleReplay = () => {
    setCells(createInitialCells());
    setCurrentPlayer(1);
    setActivePlayers(Array.from({ length: players }, (_, i) => i + 1));
    setPlayersMoved([]);
    setShowModal(false);
    setWinner(null);
  };

  // Modal styles
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
      maxWidth: '80%'
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

  return (
    <div>
      <h2>Chain Reaction Game</h2>
      <p>Current Player: {getPlayerName(currentPlayer)}</p>
      
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${col}, 60px)`,
        gridTemplateRows: `repeat(${row}, 60px)`,
        gap: '5px',
        margin: '20px auto',
        justifyContent: 'center'
      }}>
        {cells.map((rowArr, i) =>
          rowArr.map((cell, j) => (
            <GridCell
              key={`${i}-${j}`}
              x={i}
              y={j}
              orb={cell.value}
              player={cell.player}
              onClick={handleCellClick}
            />
          ))
        )}
      </div>

      {showModal && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.modal}>
            <h2>Game Over!</h2>
            <p>{getPlayerName(winner)} wins!</p>
            <button 
              onClick={handleReplay} 
              style={modalStyles.button}
            >
              Replay
            </button>
            <button 
              onClick={onExit} 
              style={{...modalStyles.button, backgroundColor: '#f44336'}}
            >
              Exit to Menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GameBoard;