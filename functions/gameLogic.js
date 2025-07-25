// Cell class for backend logic
class Cell {
  constructor() {
    this.value = 0; // Represents the count of orbs in the cell
    this.player = 0; // 0 for no player, 1 for player 1, 2 for player 2, etc.
    this.max_value = 0; // The maximum count before explosion
  }

  setMaxValue(i, j, row, col) {
    if ((i === 0 || i === row - 1) && (j === 0 || j === col - 1)) {
      this.max_value = 1; // Corner cells have max 1
    } else if (i === 0 || i === row - 1 || j === 0 || j === col - 1) {
      this.max_value = 2; // Edge cells have max 2
    } else {
      this.max_value = 3; // Inner cells have max 3
    }
  }
}

function createInitialState(row = 9, col = 6, players = 2) {
  const grid = [];
  for (let i = 0; i < row; i++) {
    grid[i] = [];
    for (let j = 0; j < col; j++) {
      const cell = new Cell();
      cell.setMaxValue(i, j, row, col);
      grid[i][j] = cell;
    }
  }
  return {
    grid,
    row,
    col,
    players,
    currentPlayer: 1,
    activePlayers: Array.from({ length: players }, (_, i) => i + 1),
    playersMoved: [],
    winner: null,
    status: 'active',
  };
}

function isValidMove(state, player, x, y) {
  // Check if coordinates are within bounds
  if (x < 0 || x >= state.row || y < 0 || y >= state.col) {
    return false;
  }
  
  const cell = state.grid[x][y];
  
  // Can place orb if cell is empty OR if cell belongs to the current player
  return cell.value === 0 || cell.player === player;
}

function placeOrb(state, player, x, y) {
  const cell = state.grid[x][y];
  if (cell.player === player) {
    cell.value++;
  } else if (cell.value === 0) {
    cell.value = 1;
    cell.player = player;
  }
}

function explodeCell(state, player, x, y) {
  const cell = state.grid[x][y];
  if (cell.value <= cell.max_value) return;
  cell.value = 0;
  cell.player = 0;
  const directions = [
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 }
  ];
  for (const { dx, dy } of directions) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < state.row && ny >= 0 && ny < state.col) {
      const neighbor = state.grid[nx][ny];
      neighbor.value++;
      neighbor.player = player;
    }
  }
}

function processMoveWithExplosions(state, player, x, y) {
  placeOrb(state, player, x, y);
  let explosionsOccurred;
  do {
    explosionsOccurred = false;
    const explosionQueue = [];
    for (let i = 0; i < state.row; i++) {
      for (let j = 0; j < state.col; j++) {
        if (state.grid[i][j].value > state.grid[i][j].max_value) {
          explosionQueue.push({ i, j });
        }
      }
    }
    if (explosionQueue.length > 0) {
      explosionsOccurred = true;
      for (const { i, j } of explosionQueue) {
        explodeCell(state, player, i, j);
      }
    }
  } while (explosionsOccurred);
}

function checkPlayerElimination(state) {
  const playersWithOrbs = new Set();
  state.grid.forEach(row => {
    row.forEach(cell => {
      if (cell.player !== 0) {
        playersWithOrbs.add(cell.player);
      }
    });
  });
  return state.activePlayers.filter(
    p => playersWithOrbs.has(p) || !state.playersMoved || !state.playersMoved.includes(p)
  );
}

function checkWin(state) {
  const updatedActivePlayers = checkPlayerElimination(state);
  if (updatedActivePlayers.length === 1) {
    state.winner = updatedActivePlayers[0];
    state.status = 'finished';
    return state.winner;
  }
  return null;
}

function applyMove(state, move, playerId) {
  if (state.status !== 'active') return state;
  if (state.currentPlayer !== playerId) return state;
  
  // Check if the move is valid before processing
  if (!isValidMove(state, playerId, move.x, move.y)) {
    return state; // Return unchanged state for invalid moves
  }
  
  processMoveWithExplosions(state, playerId, move.x, move.y);
  if (!state.playersMoved.includes(playerId)) {
    state.playersMoved.push(playerId);
  }
  // Advance to next player
  const updatedPlayers = checkPlayerElimination(state);
  state.activePlayers = updatedPlayers;
  
  // Only end the game if we have multiple players configured but only 1 remains
  // Single-player games (state.players === 1) should continue indefinitely
  if (state.players > 1 && updatedPlayers.length === 1) {
    state.winner = updatedPlayers[0];
    state.status = 'finished';
  } else if (updatedPlayers.length === 0) {
    // No players left - game over
    state.status = 'finished';
  } else {
    // Continue the game - advance to next player
    const idx = updatedPlayers.indexOf(playerId);
    state.currentPlayer = updatedPlayers[(idx + 1) % updatedPlayers.length];
  }
  return state;
}

module.exports = {
  createInitialState,
  applyMove,
  checkWin,
  isValidMove,
};
