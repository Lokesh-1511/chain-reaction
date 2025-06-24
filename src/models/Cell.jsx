class Cell {
  constructor() {
    this.value = 0; // Represents the count of orbs in the cell
    this.player = 0; // 0 for no player, 1 for player 1, 2 for player 2, etc.
    this.max_value = 0; // The maximum count before explosion
  }

  setMaxValue(i, j, row, col) {
    // Based on the position of the cell, determine its max_value
    if ((i === 0 || i === row - 1) && (j === 0 || j === col - 1)) {
      this.max_value = 1; // Corner cells have max 1
    } else if (i === 0 || i === row - 1 || j === 0 || j === col - 1) {
      this.max_value = 2; // Edge cells have max 2
    } else {
      this.max_value = 3; // Inner cells have max 3
    }
  }
}

export default Cell;