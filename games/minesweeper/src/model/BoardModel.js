export class BoardModel {
  constructor(rows, cols, mineCount) {
    this.rows = rows;
    this.cols = cols;
    this.mineCount = Math.min(mineCount, rows * cols - 1);
    this.totalSafeCount = rows * cols - this.mineCount;
    this.reset();
  }

  reset() {
    this.minesPlaced = false;
    this.flagCount = 0;
    this.revealedSafeCount = 0;
    this.grid = [];
    for (let row = 0; row < this.rows; row += 1) {
      const rowCells = [];
      for (let col = 0; col < this.cols; col += 1) {
        rowCells.push({
          row,
          col,
          isMine: false,
          isRevealed: false,
          isFlagged: false,
          isExploded: false,
          isWrongFlag: false,
          adjacent: 0
        });
      }
      this.grid.push(rowCells);
    }
  }

  inBounds(row, col) {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  getCell(row, col) {
    if (!this.inBounds(row, col)) {
      return null;
    }
    return this.grid[row][col];
  }

  getNeighbors(row, col) {
    const neighbors = [];
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) {
          continue;
        }
        const nr = row + dr;
        const nc = col + dc;
        if (!this.inBounds(nr, nc)) {
          continue;
        }
        neighbors.push(this.grid[nr][nc]);
      }
    }
    return neighbors;
  }

  forEachCell(visitor) {
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        visitor(this.grid[row][col]);
      }
    }
  }

  placeMines(safeRow, safeCol) {
    if (this.minesPlaced) {
      return;
    }

    let placed = 0;
    while (placed < this.mineCount) {
      const row = Math.floor(Math.random() * this.rows);
      const col = Math.floor(Math.random() * this.cols);
      if (row === safeRow && col === safeCol) {
        continue;
      }

      const cell = this.grid[row][col];
      if (cell.isMine) {
        continue;
      }

      cell.isMine = true;
      placed += 1;
    }

    this.calculateAdjacents();
    this.minesPlaced = true;
  }

  calculateAdjacents() {
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const cell = this.grid[row][col];
        if (cell.isMine) {
          cell.adjacent = 0;
          continue;
        }

        let mineNeighbors = 0;
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            if (dr === 0 && dc === 0) {
              continue;
            }
            const nr = row + dr;
            const nc = col + dc;
            if (!this.inBounds(nr, nc)) {
              continue;
            }
            if (this.grid[nr][nc].isMine) {
              mineNeighbors += 1;
            }
          }
        }
        cell.adjacent = mineNeighbors;
      }
    }
  }

  revealFrom(row, col) {
    const result = {
      changed: [],
      exploded: false,
      trigger: null
    };

    const start = this.getCell(row, col);
    if (!start || start.isRevealed || start.isFlagged) {
      return result;
    }

    if (start.isMine) {
      start.isRevealed = true;
      start.isExploded = true;
      result.changed.push({ cell: start, depth: 0 });
      result.exploded = true;
      result.trigger = start;
      return result;
    }

    const queue = [{ row, col, depth: 0 }];
    const visited = new Set();
    let cursor = 0;

    while (cursor < queue.length) {
      const item = queue[cursor];
      cursor += 1;
      const key = `${item.row}:${item.col}`;
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);

      const cell = this.getCell(item.row, item.col);
      if (!cell || cell.isRevealed || cell.isFlagged || cell.isMine) {
        continue;
      }

      cell.isRevealed = true;
      this.revealedSafeCount += 1;
      result.changed.push({ cell, depth: item.depth });

      if (cell.adjacent !== 0) {
        continue;
      }

      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) {
            continue;
          }
          const nr = item.row + dr;
          const nc = item.col + dc;
          if (!this.inBounds(nr, nc)) {
            continue;
          }
          const neighbor = this.grid[nr][nc];
          if (neighbor.isRevealed || neighbor.isFlagged || neighbor.isMine) {
            continue;
          }
          queue.push({ row: nr, col: nc, depth: item.depth + 1 });
        }
      }
    }

    return result;
  }

  toggleFlag(row, col) {
    const cell = this.getCell(row, col);
    if (!cell || cell.isRevealed) {
      return null;
    }

    cell.isFlagged = !cell.isFlagged;
    this.flagCount += cell.isFlagged ? 1 : -1;
    return { cell };
  }

  revealMinesOnLoss(triggerCell) {
    const changed = [];
    this.forEachCell((cell) => {
      if (cell.isMine) {
        if (!cell.isFlagged && !cell.isRevealed) {
          cell.isRevealed = true;
          changed.push({ cell, depth: 0 });
        }
      } else if (cell.isFlagged) {
        cell.isWrongFlag = true;
        changed.push({ cell, depth: 0 });
      }
    });

    if (triggerCell && !triggerCell.isExploded) {
      triggerCell.isExploded = true;
    }
    if (triggerCell) {
      changed.push({ cell: triggerCell, depth: 0 });
    }

    return changed;
  }

  autoFlagRemainingMines() {
    const changed = [];
    this.forEachCell((cell) => {
      if (cell.isMine && !cell.isFlagged) {
        cell.isFlagged = true;
        this.flagCount += 1;
        changed.push({ cell, depth: 0 });
      }
    });
    return changed;
  }

  isCleared() {
    return this.revealedSafeCount >= this.totalSafeCount;
  }
}

