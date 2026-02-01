/**
 * Chain Reaction AI Bot with multiple difficulty levels
 */

class ChainReactionBot {
  constructor(difficulty = 'medium') {
    this.difficulty = difficulty;
    this.config = this.getDifficultyConfig(difficulty);
  }

  getDifficultyConfig(difficulty) {
    const configs = {
      easy: {
        thinkTime: 300,
        lookaheadDepth: 1,
        randomnessFactor: 0.4,
        aggressiveness: 0.3,
        defensiveness: 0.3,
        expansionFocus: 0.4
      },
      medium: {
        thinkTime: 600,
        lookaheadDepth: 2,
        randomnessFactor: 0.2,
        aggressiveness: 0.4,
        defensiveness: 0.4,
        expansionFocus: 0.2
      },
      hard: {
        thinkTime: 1000,
        lookaheadDepth: 3,
        randomnessFactor: 0.1,
        aggressiveness: 0.5,
        defensiveness: 0.4,
        expansionFocus: 0.1
      },
      expert: {
        thinkTime: 1500,
        lookaheadDepth: 4,
        randomnessFactor: 0.05,
        aggressiveness: 0.6,
        defensiveness: 0.3,
        expansionFocus: 0.1
      }
    };
    return configs[difficulty] || configs.medium;
  }

  /**
   * Main method to get the bot's next move
   */
  async getNextMove(gameState, botPlayerId) {
    // Simulate thinking time
    await this.sleep(this.config.thinkTime);

    const validMoves = this.getValidMoves(gameState, botPlayerId);
    if (validMoves.length === 0) return null;

    // Apply randomness for lower difficulties
    if (Math.random() < this.config.randomnessFactor) {
      return validMoves[Math.floor(Math.random() * validMoves.length)];
    }

    // Use strategy evaluation for moves
    return this.findBestMove(gameState, botPlayerId, validMoves);
  }

  getValidMoves(gameState, playerId) {
    const moves = [];
    const { grid, row, col } = gameState;

    for (let r = 0; r < row; r++) {
      for (let c = 0; c < col; c++) {
        const cell = grid[r][c];
        // Can place orb if cell is empty or belongs to player
        if (cell.value === 0 || cell.player === playerId) {
          moves.push({ x: r, y: c });
        }
      }
    }
    return moves;
  }

  findBestMove(gameState, playerId, validMoves) {
    let bestMove = null;
    let bestScore = -Infinity;

    for (const move of validMoves) {
      const score = this.evaluateMove(gameState, move, playerId);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  evaluateMove(gameState, move, playerId) {
    const { x, y } = move;
    const { grid, row, col } = gameState;
    
    let score = 0;

    // 1. Strategic position value
    score += this.getPositionValue(x, y, row, col);

    // 2. Check if move causes chain reaction (offensive)
    const criticalMass = this.getCriticalMass(x, y, row, col);
    const currentValue = grid[x][y].value || 0;
    if (currentValue + 1 >= criticalMass) {
      score += 50 * this.config.aggressiveness;
    }

    // 3. Check if move threatens opponent cells
    const threatenedCells = this.getThreatenedOpponentCells(x, y, gameState, playerId);
    score += threatenedCells * 30 * this.config.aggressiveness;

    // 4. Defensive: Check if opponent can explode this cell
    const isVulnerable = this.isCellVulnerableToOpponent(x, y, gameState, playerId);
    if (isVulnerable) {
      score -= 40 * this.config.defensiveness;
    }

    // 5. Expansion: favor empty cells
    if (!grid[x][y].player || grid[x][y].value === 0) {
      score += 20 * this.config.expansionFocus;
    }

    // 6. Control: favor cells near critical mass
    const nearCritical = currentValue === criticalMass - 2;
    if (nearCritical) {
      score += 25;
    }

    return score;
  }

  getPositionValue(x, y, rows, cols) {
    // Corner cells (2 neighbors) - defensive value
    if ((x === 0 || x === rows - 1) && (y === 0 || y === cols - 1)) {
      return 10;
    }
    
    // Edge cells (3 neighbors) - moderate value
    if (x === 0 || x === rows - 1 || y === 0 || y === cols - 1) {
      return 5;
    }
    
    // Center cells (4 neighbors) - offensive value
    return 15;
  }

  getCriticalMass(x, y, rows, cols) {
    const isCorner = (x === 0 || x === rows - 1) && (y === 0 || y === cols - 1);
    const isEdge = x === 0 || x === rows - 1 || y === 0 || y === cols - 1;

    if (isCorner) return 2;
    if (isEdge) return 3;
    return 4;
  }

  getThreatenedOpponentCells(x, y, gameState, playerId) {
    const { grid, row, col } = gameState;
    const neighbors = this.getNeighbors(x, y, row, col);
    let threatened = 0;

    for (const [nx, ny] of neighbors) {
      const cell = grid[nx][ny];
      if (cell.player && cell.player !== playerId) {
        const criticalMass = this.getCriticalMass(nx, ny, row, col);
        // Check if neighbor is about to explode
        if (cell.value >= criticalMass - 1) {
          threatened++;
        }
      }
    }

    return threatened;
  }

  isCellVulnerableToOpponent(x, y, gameState, playerId) {
    const { grid, row, col } = gameState;
    const neighbors = this.getNeighbors(x, y, row, col);
    
    for (const [nx, ny] of neighbors) {
      const cell = grid[nx][ny];
      if (cell.player && cell.player !== playerId) {
        const criticalMass = this.getCriticalMass(nx, ny, row, col);
        if (cell.value >= criticalMass - 1) {
          return true; // Opponent can explode and capture this cell
        }
      }
    }
    return false;
  }

  getNeighbors(x, y, rows, cols) {
    const neighbors = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    
    for (const [dx, dy] of directions) {
      const newX = x + dx;
      const newY = y + dy;
      if (newX >= 0 && newX < rows && newY >= 0 && newY < cols) {
        neighbors.push([newX, newY]);
      }
    }
    return neighbors;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ChainReactionBot;
