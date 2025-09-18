/**
 * Local Game Logic for Chain Reaction
 * This module handles all game logic for offline/local play
 */

export class LocalGameEngine {
  constructor(rows, cols, players) {
    this.rows = rows;
    this.cols = cols;
    this.players = players;
    this.currentPlayer = 1;
    this.activePlayers = Array.from({ length: players }, (_, i) => i + 1);
    this.cells = this.initializeBoard();
    this.gameState = 'waiting'; // waiting, playing, finished
    this.winner = null;
    this.moveCount = 0;
  }

  /**
   * Initialize empty game board
   */
  initializeBoard() {
    return Array(this.rows).fill(null).map(() => 
      Array(this.cols).fill(null).map(() => ({
        orb: 0,
        player: 0
      }))
    );
  }

  /**
   * Get maximum tokens a cell can hold before exploding
   */
  getMaxTokens(row, col) {
    const isCorner = (row === 0 || row === this.rows - 1) && (col === 0 || col === this.cols - 1);
    const isEdge = row === 0 || row === this.rows - 1 || col === 0 || col === this.cols - 1;
    
    if (isCorner) return 1; // Corner cells explode at 2 orbs
    if (isEdge) return 2; // Edge cells explode at 3 orbs
    return 3; // Center cells explode at 4 orbs
  }

  /**
   * Check if a move is valid
   */
  isValidMove(row, col) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      return false;
    }
    
    const cell = this.cells[row][col];
    // Can only place in empty cells or cells owned by current player
    return cell.player === 0 || cell.player === this.currentPlayer;
  }

  /**
   * Make a move on the board
   */
  makeMove(row, col) {
    if (!this.isValidMove(row, col) || this.gameState !== 'playing') {
      return false;
    }

    // Place orb
    this.cells[row][col].orb++;
    this.cells[row][col].player = this.currentPlayer;
    this.moveCount++;

    // Start the game after the first move
    if (this.gameState === 'waiting') {
      this.gameState = 'playing';
    }

    // Check for explosions
    const explosions = this.checkAndHandleExplosions();
    
    // After all explosions, check for eliminated players and winner
    this.updateActivePlayers();
    this.checkWinner();

    // Move to next player if game is still ongoing
    if (this.gameState === 'playing') {
      this.nextPlayer();
    }

    return {
      success: true,
      explosions,
      currentPlayer: this.currentPlayer,
      activePlayers: this.activePlayers,
      winner: this.winner,
      gameState: this.gameState,
      cells: this.cells
    };
  }

  /**
   * Handle chain explosions
   */
  checkAndHandleExplosions() {
    let explosions = [];
    let hasExplosions = true;

    while (hasExplosions) {
      hasExplosions = false;
      const currentExplosions = [];

      // Find all cells that should explode
      for (let row = 0; row < this.rows; row++) {
        for (let col = 0; col < this.cols; col++) {
          const cell = this.cells[row][col];
          const maxTokens = this.getMaxTokens(row, col);
          
          if (cell.orb > maxTokens) {
            currentExplosions.push({ row, col, player: cell.player });
            hasExplosions = true;
          }
        }
      }

      // Process explosions
      currentExplosions.forEach(({ row, col, player }) => {
        this.explodeCell(row, col, player);
      });

      explosions.push(...currentExplosions);
    }

    return explosions;
  }

  /**
   * Explode a single cell
   */
  explodeCell(row, col, player) {
    const cell = this.cells[row][col];
    const orbsToDistribute = cell.orb;
    
    // Clear the exploding cell
    cell.orb = 0;
    cell.player = 0;

    // Get adjacent cells
    const directions = [
      { dr: -1, dc: 0 }, // up
      { dr: 1, dc: 0 },  // down
      { dr: 0, dc: -1 }, // left
      { dr: 0, dc: 1 }   // right
    ];

    directions.forEach(({ dr, dc }) => {
      const newRow = row + dr;
      const newCol = col + dc;

      // Check if the adjacent cell is within bounds
      if (newRow >= 0 && newRow < this.rows && newCol >= 0 && newCol < this.cols) {
        const adjacentCell = this.cells[newRow][newCol];
        adjacentCell.orb++;
        adjacentCell.player = player; // Capture the cell
      }
    });
  }

  /**
   * Update list of active players (players with orbs on the board)
   */
  updateActivePlayers() {
    if (this.moveCount <= this.players) {
      // Don't eliminate players until everyone has made at least one move
      return;
    }

    const playersWithOrbs = new Set();
    
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cell = this.cells[row][col];
        if (cell.orb > 0 && cell.player > 0) {
          playersWithOrbs.add(cell.player);
        }
      }
    }

    this.activePlayers = this.activePlayers.filter(player => playersWithOrbs.has(player));
  }

  /**
   * Check if there's a winner
   */
  checkWinner() {
    if (this.moveCount <= this.players) {
      // Game can't end until everyone has made at least one move
      return;
    }

    if (this.activePlayers.length === 1) {
      this.winner = this.activePlayers[0];
      this.gameState = 'finished';
    } else if (this.activePlayers.length === 0) {
      // Draw (shouldn't happen in normal gameplay)
      this.winner = null;
      this.gameState = 'finished';
    }
  }

  /**
   * Move to the next active player
   */
  nextPlayer() {
    if (this.activePlayers.length === 0) return;

    let currentIndex = this.activePlayers.indexOf(this.currentPlayer);
    if (currentIndex === -1) {
      // Current player was eliminated, start from beginning
      this.currentPlayer = this.activePlayers[0];
    } else {
      // Move to next player in the list
      currentIndex = (currentIndex + 1) % this.activePlayers.length;
      this.currentPlayer = this.activePlayers[currentIndex];
    }
  }

  /**
   * Get current game state
   */
  getGameState() {
    return {
      cells: this.cells,
      currentPlayer: this.currentPlayer,
      activePlayers: this.activePlayers,
      winner: this.winner,
      gameState: this.gameState,
      moveCount: this.moveCount,
      rows: this.rows,
      cols: this.cols,
      totalPlayers: this.players
    };
  }

  /**
   * Reset the game
   */
  reset() {
    this.currentPlayer = 1;
    this.activePlayers = Array.from({ length: this.players }, (_, i) => i + 1);
    this.cells = this.initializeBoard();
    this.gameState = 'waiting';
    this.winner = null;
    this.moveCount = 0;
  }
}

/**
 * Create a new local game instance
 */
export const createLocalGame = (rows, cols, players) => {
  return new LocalGameEngine(rows, cols, players);
};

/**
 * Save game state to localStorage
 */
export const saveLocalGameState = (gameState, gameKey = 'chainReactionLocalGame') => {
  try {
    localStorage.setItem(gameKey, JSON.stringify(gameState));
    return true;
  } catch (error) {
    console.error('Failed to save local game state:', error);
    return false;
  }
};

/**
 * Load game state from localStorage
 */
export const loadLocalGameState = (gameKey = 'chainReactionLocalGame') => {
  try {
    const saved = localStorage.getItem(gameKey);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.error('Failed to load local game state:', error);
    return null;
  }
};

/**
 * Clear saved game state
 */
export const clearLocalGameState = (gameKey = 'chainReactionLocalGame') => {
  try {
    localStorage.removeItem(gameKey);
    return true;
  } catch (error) {
    console.error('Failed to clear local game state:', error);
    return false;
  }
};