import { DEFAULT_OPTIONS, STATUS_TEXT, clamp, getLevel } from "../core.js";
import { BoardModel } from "../model/BoardModel.js";

export class GameController {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.board = null;
    this.level = getLevel(DEFAULT_OPTIONS.defaultLevel);
    this.state = "idle";
    this.elapsed = 0;
    this.timerId = 0;
    this.chordTimerId = 0;
    this.interactionStats = this.createInteractionStats();
  }

  start(levelKey) {
    this.level = getLevel(levelKey);
    this.stopTimer();
    this.clearChordTimer();

    this.board = new BoardModel(this.level.rows, this.level.cols, this.level.mines);
    this.state = "idle";
    this.elapsed = 0;
    this.interactionStats = this.createInteractionStats();

    this.callbacks.onBoardReady(this.board, this.level);
    this.callbacks.onStatusChange(this.state, STATUS_TEXT.idle);
    this.emitStats();
    this.emitInteractionStats();
  }

  restart() {
    this.start(this.level.key);
  }

  reveal(row, col) {
    if (!this.board || this.state === "won" || this.state === "lost") {
      return;
    }

    const target = this.board.getCell(row, col);
    if (!target || target.isRevealed || target.isFlagged) {
      return;
    }

    if (this.state === "idle") {
      this.board.placeMines(row, col);
      this.state = "playing";
      this.callbacks.onStatusChange(this.state, STATUS_TEXT.playing);
      this.startTimer();
    }

    const revealResult = this.board.revealFrom(row, col);
    if (revealResult.changed.length > 0) {
      this.callbacks.onCellsChanged(revealResult.changed, { type: "reveal" });
    }

    if (revealResult.exploded) {
      this.finishLost(revealResult.trigger || target, "reveal");
      return;
    }

    if (this.board.isCleared()) {
      this.finishWon();
      return;
    }

    this.emitStats();
  }

  chord(row, col) {
    if (!this.board || this.state !== "playing") {
      return;
    }

    const center = this.board.getCell(row, col);
    if (!center || !center.isRevealed || center.isMine || center.adjacent <= 0) {
      return;
    }

    const neighbors = this.board.getNeighbors(row, col);
    const hiddenNeighbors = neighbors.filter((cell) => !cell.isRevealed && !cell.isFlagged);
    if (hiddenNeighbors.length > 0 && typeof this.callbacks.onChordPreview === "function") {
      this.callbacks.onChordPreview(hiddenNeighbors);
      this.clearChordTimer();
      this.chordTimerId = window.setTimeout(() => {
        this.chordTimerId = 0;
        this.executeChord(row, col);
      }, 90);
      return;
    }

    this.executeChord(row, col);
  }

  executeChord(row, col) {
    if (!this.board || this.state !== "playing") {
      return;
    }

    const center = this.board.getCell(row, col);
    if (!center || !center.isRevealed || center.isMine || center.adjacent <= 0) {
      return;
    }

    const neighbors = this.board.getNeighbors(row, col);
    const hiddenNeighbors = neighbors.filter((cell) => !cell.isRevealed && !cell.isFlagged);
    const flaggedCount = neighbors.reduce((count, cell) => count + (cell.isFlagged ? 1 : 0), 0);
    if (flaggedCount !== center.adjacent || hiddenNeighbors.length === 0) {
      if (hiddenNeighbors.length > 0 && flaggedCount !== center.adjacent) {
        this.interactionStats.wrongChordAttempts = clamp(this.interactionStats.wrongChordAttempts + 1, 0, 999);
        this.emitInteractionStats();
      }
      return;
    }

    const changed = [];
    const seen = new Set();
    let explodedTrigger = null;

    for (let i = 0; i < hiddenNeighbors.length; i += 1) {
      const cell = hiddenNeighbors[i];
      const revealResult = this.board.revealFrom(cell.row, cell.col);

      for (let j = 0; j < revealResult.changed.length; j += 1) {
        const patch = revealResult.changed[j];
        const key = `${patch.cell.row}:${patch.cell.col}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        changed.push(patch);
      }

      if (revealResult.exploded) {
        explodedTrigger = revealResult.trigger || cell;
        break;
      }
    }

    if (changed.length > 0) {
      this.callbacks.onCellsChanged(changed, { type: "reveal" });
    }

    if (explodedTrigger) {
      this.finishLost(explodedTrigger, "chord");
      return;
    }

    if (this.board.isCleared()) {
      this.finishWon();
      return;
    }

    this.emitStats();
  }

  toggleFlag(row, col) {
    if (!this.board || this.state === "won" || this.state === "lost") {
      return;
    }

    const result = this.board.toggleFlag(row, col);
    if (!result) {
      return;
    }
    this.callbacks.onCellsChanged([{ cell: result.cell, depth: 0 }], { type: "flag" });
    this.emitStats();
  }

  finishLost(triggerCell, source) {
    this.state = "lost";
    this.stopTimer();
    this.clearChordTimer();
    if (source === "reveal") {
      this.interactionStats.misTouchLosses = clamp(this.interactionStats.misTouchLosses + 1, 0, 999);
    }
    const lossChanges = this.board.revealMinesOnLoss(triggerCell);
    this.callbacks.onCellsChanged(lossChanges, { type: "loss" });
    this.callbacks.onStatusChange(this.state, STATUS_TEXT.lost);
    this.emitStats();
    this.emitInteractionStats();
    this.emitGameFinished("lost");
  }

  finishWon() {
    this.state = "won";
    this.stopTimer();
    this.clearChordTimer();
    const autoFlagChanges = this.board.autoFlagRemainingMines();
    this.callbacks.onCellsChanged(autoFlagChanges, { type: "win" });
    this.callbacks.onStatusChange(this.state, STATUS_TEXT.won);
    this.emitStats();
    this.emitInteractionStats();
    this.emitGameFinished("won");
  }

  emitGameFinished(result) {
    if (typeof this.callbacks.onGameFinished !== "function") {
      return;
    }
    this.callbacks.onGameFinished({
      level: this.level.key,
      result,
      elapsed: this.elapsed,
      playedAt: Date.now()
    });
  }

  emitStats() {
    if (!this.board) {
      return;
    }
    this.callbacks.onStatsChange({
      elapsed: this.elapsed,
      minesLeft: this.board.mineCount - this.board.flagCount
    });
  }

  createInteractionStats() {
    return {
      misTouchLosses: 0,
      wrongChordAttempts: 0
    };
  }

  emitInteractionStats() {
    if (typeof this.callbacks.onInteractionStatsChange !== "function") {
      return;
    }
    this.callbacks.onInteractionStatsChange({
      misTouchLosses: this.interactionStats.misTouchLosses,
      wrongChordAttempts: this.interactionStats.wrongChordAttempts
    });
  }

  startTimer() {
    if (this.timerId !== 0) {
      return;
    }
    this.timerId = window.setInterval(() => {
      if (this.state !== "playing") {
        return;
      }
      this.elapsed = clamp(this.elapsed + 1, 0, 999);
      this.emitStats();
    }, 1000);
  }

  stopTimer() {
    if (this.timerId === 0) {
      return;
    }
    window.clearInterval(this.timerId);
    this.timerId = 0;
  }

  clearChordTimer() {
    if (this.chordTimerId === 0) {
      return;
    }
    window.clearTimeout(this.chordTimerId);
    this.chordTimerId = 0;
  }

  destroy() {
    this.stopTimer();
    this.clearChordTimer();
  }
}

