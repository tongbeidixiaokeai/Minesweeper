(function () {
  "use strict";

  const LEVELS = Object.freeze({
    beginner: { key: "beginner", label: "初级", cols: 9, rows: 9, mines: 10 },
    intermediate: { key: "intermediate", label: "中级", cols: 16, rows: 16, mines: 40 },
    expert: { key: "expert", label: "高级", cols: 30, rows: 16, mines: 99 }
  });

  const STATUS_TEXT = Object.freeze({
    idle: "准备开始",
    playing: "游戏进行中",
    won: "清扫完成",
    lost: "踩雷了，点击重新开始"
  });

  const DEFAULT_OPTIONS = Object.freeze({
    longPressMs: 360,
    defaultLevel: "beginner",
    zoomLevel: "auto",
    flagLock: null,
    contrastMode: "medium",
    autoStart: true
  });
  const STORAGE_KEY = "minesweeper.records.v1";
  const UI_STORAGE_KEY = "minesweeper.ui.v1";
  const ZOOM_LEVELS = Object.freeze(["auto", "100", "125", "150", "175", "200"]);
  const ZOOM_SCALE_MAP = Object.freeze({
    auto: 1,
    "100": 1,
    "125": 1.25,
    "150": 1.5,
    "175": 1.75,
    "200": 2
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatCounter(value) {
    if (value < 0) {
      return `-${String(Math.abs(value)).padStart(2, "0")}`;
    }
    return String(value).padStart(3, "0");
  }

  function getLevel(levelKey) {
    return LEVELS[levelKey] || LEVELS.beginner;
  }

  function normalizeZoomLevel(value) {
    const key = String(value || "auto");
    return Object.prototype.hasOwnProperty.call(ZOOM_SCALE_MAP, key) ? key : "auto";
  }

  function getZoomScale(zoomLevel) {
    return ZOOM_SCALE_MAP[normalizeZoomLevel(zoomLevel)];
  }

  function normalizeContrastMode(value) {
    const mode = String(value || "medium");
    return mode === "medium" ? mode : "medium";
  }

  function detectTouchDevice() {
    if (typeof window === "undefined") {
      return false;
    }
    if ("ontouchstart" in window) {
      return true;
    }
    if (typeof navigator !== "undefined" && Number(navigator.maxTouchPoints) > 0) {
      return true;
    }
    return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  }

  function formatElapsed(seconds) {
    const safe = clamp(Number.isFinite(seconds) ? Math.floor(seconds) : 0, 0, 999);
    const min = Math.floor(safe / 60);
    const sec = safe % 60;
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function formatDateTime(timestamp) {
    const date = new Date(Number(timestamp) || Date.now());
    if (Number.isNaN(date.getTime())) {
      return "--";
    }
    try {
      return new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(date);
    } catch (_err) {
      return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    }
  }

  class BoardModel {
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

  class Animator {
    constructor(boardShell, boardEl) {
      this.boardShell = boardShell;
      this.boardEl = boardEl;
      this.queue = [];
      this.rafId = 0;
      this.cleanupTimers = new Set();
    }

    schedule(task) {
      this.queue.push(task);
      if (this.rafId !== 0) {
        return;
      }
      this.rafId = window.requestAnimationFrame(() => {
        const tasks = this.queue.splice(0, this.queue.length);
        this.rafId = 0;
        for (let i = 0; i < tasks.length; i += 1) {
          tasks[i]();
        }
      });
    }

    animateReveal(cellEl, depth) {
      if (typeof cellEl.animate !== "function") {
        return;
      }
      cellEl.animate(
        [
          { transform: "scale(0.95)", filter: "brightness(1.07)" },
          { transform: "scale(1)", filter: "brightness(1)" }
        ],
        {
          duration: 240,
          delay: Math.min(220, depth * 16),
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both"
        }
      );
    }

    animateFlag(cellEl) {
      if (typeof cellEl.animate !== "function") {
        return;
      }
      cellEl.animate(
        [
          { transform: "scale(0.9)" },
          { transform: "scale(1.08)" },
          { transform: "scale(1)" }
        ],
        {
          duration: 150,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)"
        }
      );
    }

    animateChordPulse(cellEl) {
      if (typeof cellEl.animate !== "function") {
        return;
      }
      cellEl.animate(
        [
          { transform: "scale(1)", filter: "brightness(1)" },
          { transform: "scale(1.08)", filter: "brightness(1.08)" },
          { transform: "scale(1)", filter: "brightness(1)" }
        ],
        {
          duration: 180,
          delay: 0,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)"
        }
      );
    }

    animateExplosion(cellEl) {
      if (typeof cellEl.animate !== "function") {
        return;
      }
      cellEl.animate(
        [
          { transform: "scale(0.94)" },
          { transform: "scale(1.06)" },
          { transform: "scale(1)" }
        ],
        {
          duration: 320,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)"
        }
      );
    }

    animateWin() {
      this.boardShell.classList.remove("is-losing");
      this.boardShell.classList.add("is-winning");
      this.boardEl.classList.add("is-won");

      const timer = window.setTimeout(() => {
        this.boardShell.classList.remove("is-winning");
        this.cleanupTimers.delete(timer);
      }, 1280);
      this.cleanupTimers.add(timer);

      if (typeof this.boardEl.animate === "function") {
        this.boardEl.animate(
          [
            { transform: "translateY(0)" },
            { transform: "translateY(-4px)" },
            { transform: "translateY(-3px)" }
          ],
          {
            duration: 320,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "both"
          }
        );
      }
    }

    animateLoss() {
      this.boardEl.classList.remove("is-won");
      this.boardShell.classList.remove("is-winning");
      this.boardShell.classList.add("is-losing");

      const timer = window.setTimeout(() => {
        this.boardShell.classList.remove("is-losing");
        this.cleanupTimers.delete(timer);
      }, 420);
      this.cleanupTimers.add(timer);
    }

    resetBoardEffects() {
      this.boardShell.classList.remove("is-winning", "is-losing");
      this.boardEl.classList.remove("is-won");
    }

    destroy() {
      if (this.rafId !== 0) {
        window.cancelAnimationFrame(this.rafId);
        this.rafId = 0;
      }
      this.queue = [];
      this.cleanupTimers.forEach((timer) => window.clearTimeout(timer));
      this.cleanupTimers.clear();
    }
  }

  class Renderer {
    constructor(rootEl, options) {
      this.rootEl = rootEl;
      this.longPressMs = options.longPressMs;
      this.zoomLevel = normalizeZoomLevel(options.zoomLevel);
      this.flagLockEnabled = Boolean(options.flagLock);
      this.contrastMode = normalizeContrastMode(options.contrastMode);
      this.boardEl = rootEl.querySelector("#board");
      this.boardShell = rootEl.querySelector("#board-shell");
      this.timerEl = rootEl.querySelector("#timer");
      this.minesLeftEl = rootEl.querySelector("#mines-left");
      this.misTouchEl = rootEl.querySelector("#mistouch-count");
      this.wrongChordEl = rootEl.querySelector("#wrong-chord-count");
      this.statusPillEl = rootEl.querySelector("#status-pill");
      this.restartBtn = rootEl.querySelector("#restart-btn");
      this.zoomButtons = Array.from(rootEl.querySelectorAll(".zoom-btn"));
      this.flagLockBtn = rootEl.querySelector("#flag-lock-btn");
      this.levelButtons = Array.from(rootEl.querySelectorAll(".level-btn"));
      this.clearRecordsBtn = rootEl.querySelector("#clear-records-btn");
      this.hintEl = rootEl.querySelector(".ms-hint");
      this.rankEls = {
        beginner: rootEl.querySelector("#rank-beginner"),
        intermediate: rootEl.querySelector("#rank-intermediate"),
        expert: rootEl.querySelector("#rank-expert")
      };
      this.historyListEl = rootEl.querySelector("#history-list");

      if (!this.boardEl || !this.boardShell || !this.timerEl || !this.minesLeftEl || !this.statusPillEl) {
        throw new Error("扫雷页面结构缺失，无法初始化。");
      }

      this.cellMap = new Map();
      this.activePresses = new Map();
      this.currentLevel = getLevel(DEFAULT_OPTIONS.defaultLevel);
      this.handlers = {
        onReveal: null,
        onFlag: null,
        onChord: null,
        onRestart: null,
        onLevelChange: null,
        onClearRecords: null,
        onZoomChange: null,
        onFlagLockToggle: null
      };

      this.animator = new Animator(this.boardShell, this.boardEl);

      this.boundOnPointerDown = this.onPointerDown.bind(this);
      this.boundOnPointerUp = this.onPointerUp.bind(this);
      this.boundOnPointerCancel = this.onPointerCancel.bind(this);
      this.boundOnContextMenu = this.onContextMenu.bind(this);
      this.boundOnKeyboardClick = this.onKeyboardClick.bind(this);
      this.boundOnBoardKeyDown = this.onBoardKeyDown.bind(this);
      this.boundOnResize = this.onResize.bind(this);
      this.boundOnWheel = this.onWheel.bind(this);
      this.boundOnWindowKeyDown = this.onWindowKeyDown.bind(this);
      this.boundOnRestart = this.onRestart.bind(this);
      this.boundOnLevelClick = this.onLevelClick.bind(this);
      this.boundOnClearRecords = this.onClearRecords.bind(this);
      this.boundOnZoomClick = this.onZoomClick.bind(this);
      this.boundOnFlagLockClick = this.onFlagLockClick.bind(this);

      this.bindEvents();
      this.setContrastMode(this.contrastMode);
      this.setZoomLevel(this.zoomLevel);
      this.setFlagLockEnabled(this.flagLockEnabled);
    }

    bindEvents() {
      this.boardEl.addEventListener("pointerdown", this.boundOnPointerDown);
      this.boardEl.addEventListener("pointerup", this.boundOnPointerUp);
      this.boardEl.addEventListener("pointercancel", this.boundOnPointerCancel);
      this.boardShell.addEventListener("contextmenu", this.boundOnContextMenu);
      this.boardShell.addEventListener("wheel", this.boundOnWheel, { passive: false });
      this.boardEl.addEventListener("click", this.boundOnKeyboardClick);
      this.boardEl.addEventListener("keydown", this.boundOnBoardKeyDown);
      window.addEventListener("keydown", this.boundOnWindowKeyDown);
      window.addEventListener("resize", this.boundOnResize);

      if (this.restartBtn) {
        this.restartBtn.addEventListener("click", this.boundOnRestart);
      }
      if (this.clearRecordsBtn) {
        this.clearRecordsBtn.addEventListener("click", this.boundOnClearRecords);
      }
      if (this.flagLockBtn) {
        this.flagLockBtn.addEventListener("click", this.boundOnFlagLockClick);
      }

      for (let i = 0; i < this.zoomButtons.length; i += 1) {
        this.zoomButtons[i].addEventListener("click", this.boundOnZoomClick);
      }

      for (let i = 0; i < this.levelButtons.length; i += 1) {
        this.levelButtons[i].addEventListener("click", this.boundOnLevelClick);
      }
    }

    setHandlers(handlers) {
      this.handlers = { ...this.handlers, ...handlers };
    }

    onRestart() {
      if (typeof this.handlers.onRestart === "function") {
        this.handlers.onRestart();
      }
    }

    onClearRecords() {
      if (typeof this.handlers.onClearRecords === "function") {
        this.handlers.onClearRecords();
      }
    }

    onLevelClick(event) {
      const btn = event.currentTarget;
      const levelKey = btn && btn.dataset ? btn.dataset.level : null;
      if (!levelKey || typeof this.handlers.onLevelChange !== "function") {
        return;
      }
      this.handlers.onLevelChange(levelKey);
    }

    onZoomClick(event) {
      const btn = event.currentTarget;
      const zoomLevel = btn && btn.dataset ? normalizeZoomLevel(btn.dataset.zoom) : "auto";
      this.setZoomLevel(zoomLevel, true);
    }

    onFlagLockClick() {
      this.setFlagLockEnabled(!this.flagLockEnabled, true);
    }

    onWheel(event) {
      if (!event.ctrlKey) {
        return;
      }
      event.preventDefault();

      const direction = event.deltaY < 0 ? 1 : -1;
      this.adjustZoomByWheel(direction);
    }

    onWindowKeyDown(event) {
      if (!event.ctrlKey) {
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        this.setZoomLevel("auto", true);
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        this.adjustZoomByWheel(1);
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        this.adjustZoomByWheel(-1);
      }
    }

    adjustZoomByWheel(direction) {
      if (direction === 0) {
        return;
      }
      let nextLevel = this.zoomLevel;
      if (this.zoomLevel === "auto") {
        nextLevel = direction > 0 ? "125" : "100";
      } else {
        const index = ZOOM_LEVELS.indexOf(this.zoomLevel);
        const nextIndex = clamp(index + direction, 1, ZOOM_LEVELS.length - 1);
        nextLevel = ZOOM_LEVELS[nextIndex];
      }
      this.setZoomLevel(nextLevel, true);
    }

    setZoomLevel(zoomLevel, emit) {
      const normalized = normalizeZoomLevel(zoomLevel);
      if (this.zoomLevel === normalized && emit) {
        return;
      }
      this.zoomLevel = normalized;

      for (let i = 0; i < this.zoomButtons.length; i += 1) {
        const btn = this.zoomButtons[i];
        const isActive = normalizeZoomLevel(btn.dataset.zoom) === normalized;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      }

      this.updateCellSize(this.currentLevel.rows, this.currentLevel.cols);

      if (emit && typeof this.handlers.onZoomChange === "function") {
        this.handlers.onZoomChange(normalized);
      }
    }

    setFlagLockEnabled(enabled, emit) {
      const next = Boolean(enabled);
      if (this.flagLockEnabled === next && emit) {
        return;
      }
      this.flagLockEnabled = next;
      this.rootEl.classList.toggle("is-flag-lock", next);

      if (this.flagLockBtn) {
        this.flagLockBtn.classList.toggle("is-active", next);
        this.flagLockBtn.setAttribute("aria-pressed", next ? "true" : "false");
        this.flagLockBtn.textContent = next ? "Flag Lock: ON" : "Flag Lock: OFF";
      }

      if (this.hintEl) {
        this.hintEl.textContent = next
          ? "Flag lock is ON: click/tap to place flags. Use Enter/Space to reveal. Zoom: Ctrl+wheel / Ctrl+Plus / Ctrl+Minus."
          : "Tips: Left click/tap to reveal, right click (or long press) to flag, right click number cell to chord. Zoom: Ctrl+wheel / Ctrl+Plus / Ctrl+Minus.";
      }

      if (emit && typeof this.handlers.onFlagLockToggle === "function") {
        this.handlers.onFlagLockToggle(next);
      }
    }

    setContrastMode(mode) {
      const normalized = normalizeContrastMode(mode);
      this.contrastMode = normalized;
      this.rootEl.classList.toggle("is-contrast-medium", normalized === "medium");
    }

    onPointerDown(event) {
      const cellEl = event.target.closest(".cell");
      if (!cellEl) {
        return;
      }

      if (event.pointerType === "mouse" || event.button !== 0) {
        return;
      }

      const row = Number(cellEl.dataset.row);
      const col = Number(cellEl.dataset.col);
      if (!Number.isInteger(row) || !Number.isInteger(col)) {
        return;
      }

      if (this.flagLockEnabled) {
        if (typeof this.handlers.onFlag === "function") {
          this.handlers.onFlag(row, col);
          this.animator.animateFlag(cellEl);
        }
        event.preventDefault();
        return;
      }

      const pressData = {
        row,
        col,
        longPressed: false,
        timer: window.setTimeout(() => {
          const active = this.activePresses.get(event.pointerId);
          if (!active) {
            return;
          }
          active.longPressed = true;
          if (typeof this.handlers.onFlag === "function") {
            this.handlers.onFlag(active.row, active.col);
            this.animator.animateFlag(cellEl);
          }
        }, this.longPressMs)
      };

      this.activePresses.set(event.pointerId, pressData);
      if (typeof cellEl.setPointerCapture === "function") {
        try {
          cellEl.setPointerCapture(event.pointerId);
        } catch (_err) {
          // Ignore capture errors from older browsers.
        }
      }
      event.preventDefault();
    }

    onPointerUp(event) {
      const cellEl = event.target.closest(".cell");
      const active = this.activePresses.get(event.pointerId);

      if (active) {
        window.clearTimeout(active.timer);
        this.activePresses.delete(event.pointerId);

        if (!active.longPressed) {
          if (this.flagLockEnabled && typeof this.handlers.onFlag === "function") {
            this.handlers.onFlag(active.row, active.col);
          } else if (typeof this.handlers.onReveal === "function") {
            this.handlers.onReveal(active.row, active.col);
          }
        }
        return;
      }

      if (event.pointerType === "mouse" && event.button === 0 && cellEl) {
        const row = Number(cellEl.dataset.row);
        const col = Number(cellEl.dataset.col);
        if (Number.isInteger(row) && Number.isInteger(col)) {
          if (this.flagLockEnabled && typeof this.handlers.onFlag === "function") {
            this.handlers.onFlag(row, col);
            this.animator.animateFlag(cellEl);
          } else if (typeof this.handlers.onReveal === "function") {
            this.handlers.onReveal(row, col);
          }
        }
      }
    }

    onPointerCancel(event) {
      const active = this.activePresses.get(event.pointerId);
      if (!active) {
        return;
      }
      window.clearTimeout(active.timer);
      this.activePresses.delete(event.pointerId);
    }

    clearActivePresses() {
      this.activePresses.forEach((press) => {
        window.clearTimeout(press.timer);
      });
      this.activePresses.clear();
    }

    onContextMenu(event) {
      event.preventDefault();
      const cellEl = event.target.closest(".cell");
      if (!cellEl) {
        return;
      }
      const row = Number(cellEl.dataset.row);
      const col = Number(cellEl.dataset.col);
      if (!Number.isInteger(row) || !Number.isInteger(col)) {
        return;
      }

      if (cellEl.classList.contains("is-revealed")) {
        if (typeof this.handlers.onChord === "function") {
          this.handlers.onChord(row, col);
        }
        return;
      }

      if (typeof this.handlers.onFlag === "function") {
        this.handlers.onFlag(row, col);
      }
    }

    onKeyboardClick(event) {
      if (event.detail !== 0) {
        return;
      }
      const cellEl = event.target.closest(".cell");
      if (!cellEl) {
        return;
      }
      const row = Number(cellEl.dataset.row);
      const col = Number(cellEl.dataset.col);
      if (Number.isInteger(row) && Number.isInteger(col)) {
        if (this.flagLockEnabled && typeof this.handlers.onFlag === "function") {
          this.handlers.onFlag(row, col);
        } else if (typeof this.handlers.onReveal === "function") {
          this.handlers.onReveal(row, col);
        }
      }
    }

    onBoardKeyDown(event) {
      const cellEl = event.target.closest(".cell");
      if (!cellEl) {
        return;
      }

      const row = Number(cellEl.dataset.row);
      const col = Number(cellEl.dataset.col);
      if (!Number.isInteger(row) || !Number.isInteger(col)) {
        return;
      }

      if ((event.key === " " || event.key === "Enter") && typeof this.handlers.onReveal === "function") {
        event.preventDefault();
        this.handlers.onReveal(row, col);
      } else if ((event.key === "f" || event.key === "F") && typeof this.handlers.onFlag === "function") {
        event.preventDefault();
        this.handlers.onFlag(row, col);
      }
    }

    onResize() {
      this.updateCellSize(this.currentLevel.rows, this.currentLevel.cols);
    }

    setActiveLevel(levelKey) {
      for (let i = 0; i < this.levelButtons.length; i += 1) {
        const btn = this.levelButtons[i];
        btn.classList.toggle("is-active", btn.dataset.level === levelKey);
      }
    }

    renderBoard(boardModel, level) {
      this.currentLevel = level;
      this.setActiveLevel(level.key);
      this.animator.resetBoardEffects();
      this.clearActivePresses();
      this.boardEl.style.setProperty("--cols", String(level.cols));

      const fragment = document.createDocumentFragment();
      this.cellMap.clear();
      this.boardEl.innerHTML = "";

      for (let row = 0; row < boardModel.rows; row += 1) {
        for (let col = 0; col < boardModel.cols; col += 1) {
          const cell = boardModel.getCell(row, col);
          const cellEl = document.createElement("button");
          cellEl.type = "button";
          cellEl.className = "cell";
          cellEl.dataset.row = String(row);
          cellEl.dataset.col = String(col);
          cellEl.setAttribute("role", "gridcell");
          cellEl.setAttribute("aria-label", `第${row + 1}行第${col + 1}列，未翻开`);
          this.applyCellVisual(cellEl, cell);
          fragment.appendChild(cellEl);
          this.cellMap.set(`${row}:${col}`, cellEl);
        }
      }

      this.boardEl.appendChild(fragment);
      this.updateCellSize(level.rows, level.cols);
      window.requestAnimationFrame(() => {
        this.updateCellSize(level.rows, level.cols);
      });
    }

    updateCellSize(rows, cols) {
      const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const compact = viewportWidth < 760;
      const boardShellStyle = window.getComputedStyle(this.boardShell);
      const paddingX = (parseFloat(boardShellStyle.paddingLeft) || 0) + (parseFloat(boardShellStyle.paddingRight) || 0);
      const paddingY = (parseFloat(boardShellStyle.paddingTop) || 0) + (parseFloat(boardShellStyle.paddingBottom) || 0);

      const maxBoardWidth = Math.max(120, this.boardShell.clientWidth - paddingX - 2);
      const maxBoardHeight = Math.max(120, this.boardShell.clientHeight - paddingY - 2);
      const gap = compact ? 2 : (viewportWidth < 1160 ? 4 : 6);

      const sizeByWidth = Math.floor((maxBoardWidth - (cols - 1) * gap) / cols);
      const sizeByHeight = Math.floor((maxBoardHeight - (rows - 1) * gap) / rows);
      const minSize = compact ? 10 : 14;
      const dpr = Number(window.devicePixelRatio) || 1;
      const maxSize = viewportWidth > 1900 ? 72 : (viewportWidth > 1500 ? 64 : 52);
      const base = clamp(Math.min(sizeByWidth, sizeByHeight), minSize, maxSize);
      const scaled = clamp(base * getZoomScale(this.zoomLevel), minSize, maxSize);
      const target = clamp(Math.round(scaled * dpr) / dpr, minSize, maxSize);

      this.boardEl.style.setProperty("--cell-size", `${target}px`);
      this.boardEl.style.setProperty("--cell-gap", `${gap}px`);
    }

    updateCells(changes, meta) {
      if (changes && changes.length > 0) {
        for (let i = 0; i < changes.length; i += 1) {
          const change = changes[i];
          const key = `${change.cell.row}:${change.cell.col}`;
          const cellEl = this.cellMap.get(key);
          if (!cellEl) {
            continue;
          }

          this.animator.schedule(() => {
            this.applyCellVisual(cellEl, change.cell);
            if (meta && meta.type === "reveal" && change.cell.isRevealed && !change.cell.isMine) {
              this.animator.animateReveal(cellEl, change.depth || 0);
            } else if (meta && meta.type === "flag") {
              this.animator.animateFlag(cellEl);
            } else if (meta && meta.type === "loss" && change.cell.isExploded) {
              this.animator.animateExplosion(cellEl);
            }
          });
        }
      }

      if (meta && meta.type === "win") {
        this.animator.schedule(() => this.animator.animateWin());
      } else if (meta && meta.type === "loss") {
        this.animator.schedule(() => this.animator.animateLoss());
      }
    }

    previewChord(cells) {
      if (!cells || cells.length === 0) {
        return;
      }
      for (let i = 0; i < cells.length; i += 1) {
        const cell = cells[i];
        const key = `${cell.row}:${cell.col}`;
        const cellEl = this.cellMap.get(key);
        if (!cellEl) {
          continue;
        }
        this.animator.schedule(() => this.animator.animateChordPulse(cellEl));
      }
    }

    renderRecords(snapshot) {
      if (!snapshot) {
        return;
      }
      this.renderRankList("beginner", this.rankEls.beginner, snapshot.wins && snapshot.wins.beginner ? snapshot.wins.beginner : []);
      this.renderRankList("intermediate", this.rankEls.intermediate, snapshot.wins && snapshot.wins.intermediate ? snapshot.wins.intermediate : []);
      this.renderRankList("expert", this.rankEls.expert, snapshot.wins && snapshot.wins.expert ? snapshot.wins.expert : []);
      this.renderHistoryList(snapshot.history || []);
    }

    renderRankList(levelKey, listEl, records) {
      if (!listEl) {
        return;
      }
      listEl.innerHTML = "";
      const topRecords = records.slice(0, 5);
      if (topRecords.length === 0) {
        const emptyEl = document.createElement("li");
        emptyEl.className = "records-empty";
        emptyEl.textContent = "暂无通关记录";
        listEl.appendChild(emptyEl);
        return;
      }
      for (let i = 0; i < topRecords.length; i += 1) {
        const item = topRecords[i];
        const li = document.createElement("li");
        li.className = "rank-item";
        li.innerHTML = `<strong>${formatElapsed(item.elapsed)}</strong> · ${formatDateTime(item.playedAt)}`;
        li.setAttribute("aria-label", `${LEVELS[levelKey].label}第${i + 1}名，耗时${formatElapsed(item.elapsed)}`);
        listEl.appendChild(li);
      }
    }

    renderHistoryList(records) {
      if (!this.historyListEl) {
        return;
      }
      this.historyListEl.innerHTML = "";
      const recent = records.slice(0, 8);
      if (recent.length === 0) {
        const emptyEl = document.createElement("li");
        emptyEl.className = "records-empty";
        emptyEl.textContent = "暂无对局历史";
        this.historyListEl.appendChild(emptyEl);
        return;
      }
      for (let i = 0; i < recent.length; i += 1) {
        const item = recent[i];
        const li = document.createElement("li");
        li.className = "history-item";
        const level = getLevel(item.level);
        const resultText = item.result === "won" ? "胜利" : "失败";
        li.innerHTML = `<span>${resultText} · ${level.label} · ${formatElapsed(item.elapsed)}</span><span class="history-item-time">${formatDateTime(item.playedAt)}</span>`;
        this.historyListEl.appendChild(li);
      }
    }

    applyCellVisual(cellEl, cell) {
      cellEl.className = "cell";
      if (cell.isRevealed) {
        cellEl.classList.add("is-revealed");
      }
      if (cell.isFlagged) {
        cellEl.classList.add("is-flagged");
      }
      if (cell.isMine && cell.isRevealed) {
        cellEl.classList.add("is-mine");
      }
      if (cell.isExploded) {
        cellEl.classList.add("is-exploded");
      }
      if (cell.isWrongFlag) {
        cellEl.classList.add("is-wrong-flag");
      }
      if (cell.isRevealed && !cell.isMine && cell.adjacent > 0) {
        cellEl.classList.add(`num-${cell.adjacent}`);
      }

      let content = "";
      if (cell.isWrongFlag) {
        content = "✕";
      } else if (cell.isFlagged && !cell.isRevealed) {
        content = "⚑";
      } else if (cell.isMine && cell.isRevealed) {
        content = "✹";
      } else if (cell.isRevealed && cell.adjacent > 0) {
        content = String(cell.adjacent);
      }

      cellEl.textContent = content;
      cellEl.setAttribute("aria-label", this.buildCellAriaLabel(cell));
    }

    buildCellAriaLabel(cell) {
      if (cell.isWrongFlag) {
        return `第${cell.row + 1}行第${cell.col + 1}列，错误标记`;
      }
      if (cell.isFlagged && !cell.isRevealed) {
        return `第${cell.row + 1}行第${cell.col + 1}列，已插旗`;
      }
      if (!cell.isRevealed) {
        return `第${cell.row + 1}行第${cell.col + 1}列，未翻开`;
      }
      if (cell.isMine) {
        return `第${cell.row + 1}行第${cell.col + 1}列，地雷`;
      }
      if (cell.adjacent > 0) {
        return `第${cell.row + 1}行第${cell.col + 1}列，邻近雷数${cell.adjacent}`;
      }
      return `第${cell.row + 1}行第${cell.col + 1}列，空白`;
    }

    updateStats(stats) {
      this.timerEl.textContent = formatCounter(clamp(stats.elapsed, 0, 999));
      this.minesLeftEl.textContent = formatCounter(stats.minesLeft);
    }

    updateInteractionStats(stats) {
      if (this.misTouchEl) {
        this.misTouchEl.textContent = formatCounter(clamp(stats && stats.misTouchLosses, 0, 999));
      }
      if (this.wrongChordEl) {
        this.wrongChordEl.textContent = formatCounter(clamp(stats && stats.wrongChordAttempts, 0, 999));
      }
    }

    updateStatus(state, message) {
      this.statusPillEl.textContent = message || STATUS_TEXT[state] || STATUS_TEXT.idle;
      this.statusPillEl.classList.remove("is-playing", "is-won", "is-lost");
      if (state === "playing") {
        this.statusPillEl.classList.add("is-playing");
      } else if (state === "won") {
        this.statusPillEl.classList.add("is-won");
      } else if (state === "lost") {
        this.statusPillEl.classList.add("is-lost");
      }
    }

    destroy() {
      this.animator.destroy();
      this.clearActivePresses();

      this.boardEl.removeEventListener("pointerdown", this.boundOnPointerDown);
      this.boardEl.removeEventListener("pointerup", this.boundOnPointerUp);
      this.boardEl.removeEventListener("pointercancel", this.boundOnPointerCancel);
      this.boardShell.removeEventListener("contextmenu", this.boundOnContextMenu);
      this.boardShell.removeEventListener("wheel", this.boundOnWheel);
      this.boardEl.removeEventListener("click", this.boundOnKeyboardClick);
      this.boardEl.removeEventListener("keydown", this.boundOnBoardKeyDown);
      window.removeEventListener("keydown", this.boundOnWindowKeyDown);
      window.removeEventListener("resize", this.boundOnResize);

      if (this.restartBtn) {
        this.restartBtn.removeEventListener("click", this.boundOnRestart);
      }
      if (this.clearRecordsBtn) {
        this.clearRecordsBtn.removeEventListener("click", this.boundOnClearRecords);
      }
      if (this.flagLockBtn) {
        this.flagLockBtn.removeEventListener("click", this.boundOnFlagLockClick);
      }

      for (let i = 0; i < this.zoomButtons.length; i += 1) {
        this.zoomButtons[i].removeEventListener("click", this.boundOnZoomClick);
      }

      for (let i = 0; i < this.levelButtons.length; i += 1) {
        this.levelButtons[i].removeEventListener("click", this.boundOnLevelClick);
      }
    }
  }

  class GameController {
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

  class RecordStore {
    constructor(storageKey = STORAGE_KEY) {
      this.storageKey = storageKey;
      this.isAvailable = typeof window !== "undefined" && typeof window.localStorage !== "undefined";
      this.data = this.load();
    }

    createEmptyData() {
      return {
        wins: {
          beginner: [],
          intermediate: [],
          expert: []
        },
        history: []
      };
    }

    load() {
      if (!this.isAvailable) {
        return this.createEmptyData();
      }
      try {
        const raw = window.localStorage.getItem(this.storageKey);
        if (!raw) {
          return this.createEmptyData();
        }
        const parsed = JSON.parse(raw);
        return this.normalize(parsed);
      } catch (_err) {
        return this.createEmptyData();
      }
    }

    normalize(input) {
      const data = this.createEmptyData();
      const source = input && typeof input === "object" ? input : {};
      const sourceWins = source.wins && typeof source.wins === "object" ? source.wins : {};
      const levelKeys = Object.keys(LEVELS);

      for (let i = 0; i < levelKeys.length; i += 1) {
        const level = levelKeys[i];
        const rawRecords = Array.isArray(sourceWins[level]) ? sourceWins[level] : [];
        const normalized = [];
        for (let j = 0; j < rawRecords.length; j += 1) {
          const item = rawRecords[j];
          const elapsed = clamp(Number.isFinite(item && item.elapsed) ? Math.floor(item.elapsed) : Number(item && item.elapsed) || 0, 0, 999);
          const playedAt = Number(item && item.playedAt) || Date.now();
          normalized.push({ elapsed, playedAt });
        }
        normalized.sort((a, b) => a.elapsed - b.elapsed || a.playedAt - b.playedAt);
        data.wins[level] = normalized.slice(0, 10);
      }

      const sourceHistory = Array.isArray(source.history) ? source.history : [];
      for (let i = 0; i < sourceHistory.length; i += 1) {
        const item = sourceHistory[i];
        const level = LEVELS[item && item.level] ? item.level : "beginner";
        const result = item && item.result === "won" ? "won" : "lost";
        const elapsed = clamp(Number.isFinite(item && item.elapsed) ? Math.floor(item.elapsed) : Number(item && item.elapsed) || 0, 0, 999);
        const playedAt = Number(item && item.playedAt) || Date.now();
        data.history.push({ level, result, elapsed, playedAt });
      }

      data.history.sort((a, b) => b.playedAt - a.playedAt);
      data.history = data.history.slice(0, 40);
      return data;
    }

    save() {
      if (!this.isAvailable) {
        return;
      }
      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      } catch (_err) {
        // Ignore write failures in restricted/private mode.
      }
    }

    recordGame(game) {
      const level = LEVELS[game && game.level] ? game.level : "beginner";
      const result = game && game.result === "won" ? "won" : "lost";
      const elapsed = clamp(Number.isFinite(game && game.elapsed) ? Math.floor(game.elapsed) : Number(game && game.elapsed) || 0, 0, 999);
      const playedAt = Number(game && game.playedAt) || Date.now();

      this.data.history.unshift({ level, result, elapsed, playedAt });
      this.data.history = this.data.history.slice(0, 40);

      if (result === "won") {
        this.data.wins[level].push({ elapsed, playedAt });
        this.data.wins[level].sort((a, b) => a.elapsed - b.elapsed || a.playedAt - b.playedAt);
        this.data.wins[level] = this.data.wins[level].slice(0, 10);
      }

      this.save();
    }

    clear() {
      this.data = this.createEmptyData();
      this.save();
    }

    getSnapshot() {
      return {
        wins: {
          beginner: this.data.wins.beginner.slice(),
          intermediate: this.data.wins.intermediate.slice(),
          expert: this.data.wins.expert.slice()
        },
        history: this.data.history.slice()
      };
    }
  }

  class UISettingsStore {
    constructor(storageKey = UI_STORAGE_KEY) {
      this.storageKey = storageKey;
      this.isAvailable = typeof window !== "undefined" && typeof window.localStorage !== "undefined";
      this.data = this.load();
    }

    createDefaults() {
      return {
        zoomLevel: DEFAULT_OPTIONS.zoomLevel,
        contrastMode: DEFAULT_OPTIONS.contrastMode,
        flagLock: detectTouchDevice()
      };
    }

    normalize(input) {
      const defaults = this.createDefaults();
      const source = input && typeof input === "object" ? input : {};
      return {
        zoomLevel: normalizeZoomLevel(source.zoomLevel || defaults.zoomLevel),
        contrastMode: normalizeContrastMode(source.contrastMode || defaults.contrastMode),
        flagLock: typeof source.flagLock === "boolean" ? source.flagLock : defaults.flagLock
      };
    }

    load() {
      if (!this.isAvailable) {
        return this.createDefaults();
      }
      try {
        const raw = window.localStorage.getItem(this.storageKey);
        if (!raw) {
          return this.createDefaults();
        }
        return this.normalize(JSON.parse(raw));
      } catch (_err) {
        return this.createDefaults();
      }
    }

    save() {
      if (!this.isAvailable) {
        return;
      }
      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      } catch (_err) {
        // Ignore write failures in restricted/private mode.
      }
    }

    setSettings(partial) {
      this.data = this.normalize({ ...this.data, ...partial });
      this.save();
      return this.getSnapshot();
    }

    getSnapshot() {
      return {
        zoomLevel: this.data.zoomLevel,
        contrastMode: this.data.contrastMode,
        flagLock: this.data.flagLock
      };
    }
  }

  class MinesweeperGame {
    constructor(rootEl, options = {}) {
      const resolvedRoot = typeof rootEl === "string" ? document.querySelector(rootEl) : rootEl;
      if (!resolvedRoot) {
        throw new Error("未找到扫雷挂载节点。");
      }

      const incomingOptions = options && typeof options === "object" ? options : {};
      this.options = { ...DEFAULT_OPTIONS, ...incomingOptions };
      this.recordStore = new RecordStore();
      this.uiSettingsStore = new UISettingsStore();
      this.uiSettings = this.buildInitialUISettings(incomingOptions, this.uiSettingsStore.getSnapshot());
      this.renderer = new Renderer(resolvedRoot, {
        longPressMs: this.options.longPressMs,
        zoomLevel: this.uiSettings.zoomLevel,
        flagLock: this.uiSettings.flagLock,
        contrastMode: this.uiSettings.contrastMode
      });
      this.controller = new GameController({
        onBoardReady: (board, level) => this.renderer.renderBoard(board, level),
        onCellsChanged: (changes, meta) => this.renderer.updateCells(changes, meta),
        onStatusChange: (state, message) => this.renderer.updateStatus(state, message),
        onStatsChange: (stats) => this.renderer.updateStats(stats),
        onInteractionStatsChange: (stats) => this.renderer.updateInteractionStats(stats),
        onChordPreview: (cells) => this.renderer.previewChord(cells),
        onGameFinished: (game) => {
          this.recordStore.recordGame(game);
          this.renderer.renderRecords(this.recordStore.getSnapshot());
        }
      });

      this.renderer.setHandlers({
        onReveal: (row, col) => this.controller.reveal(row, col),
        onFlag: (row, col) => this.controller.toggleFlag(row, col),
        onChord: (row, col) => this.controller.chord(row, col),
        onRestart: () => this.restart(),
        onLevelChange: (levelKey) => this.start(levelKey),
        onClearRecords: () => this.clearRecords(),
        onZoomChange: (zoomLevel) => this.updateUISettings({ zoomLevel }),
        onFlagLockToggle: (flagLock) => this.updateUISettings({ flagLock })
      });

      if (this.options.autoStart) {
        this.start(this.options.defaultLevel);
      }
      this.renderer.renderRecords(this.recordStore.getSnapshot());
    }

    buildInitialUISettings(options, storedSettings) {
      const initial = { ...storedSettings };
      if (Object.prototype.hasOwnProperty.call(options, "zoomLevel") && options.zoomLevel != null) {
        initial.zoomLevel = normalizeZoomLevel(options.zoomLevel);
      }
      if (Object.prototype.hasOwnProperty.call(options, "contrastMode") && options.contrastMode != null) {
        initial.contrastMode = normalizeContrastMode(options.contrastMode);
      }
      if (Object.prototype.hasOwnProperty.call(options, "flagLock") && typeof options.flagLock === "boolean") {
        initial.flagLock = options.flagLock;
      }
      this.uiSettingsStore.setSettings(initial);
      return this.uiSettingsStore.getSnapshot();
    }

    updateUISettings(partial) {
      this.uiSettings = this.uiSettingsStore.setSettings(partial);
    }

    start(levelKey) {
      this.controller.start(levelKey);
    }

    restart() {
      this.controller.restart();
    }

    clearRecords() {
      this.recordStore.clear();
      this.renderer.renderRecords(this.recordStore.getSnapshot());
    }

    destroy() {
      this.controller.destroy();
      this.renderer.destroy();
    }
  }

  window.MinesweeperGame = MinesweeperGame;

  window.addEventListener("DOMContentLoaded", () => {
    const rootEl = document.getElementById("game-root");
    if (!rootEl) {
      return;
    }
    window.__minesweeper = new MinesweeperGame(rootEl, {
      defaultLevel: DEFAULT_OPTIONS.defaultLevel,
      longPressMs: DEFAULT_OPTIONS.longPressMs,
      zoomLevel: DEFAULT_OPTIONS.zoomLevel,
      flagLock: DEFAULT_OPTIONS.flagLock,
      contrastMode: DEFAULT_OPTIONS.contrastMode,
      autoStart: true
    });
  });
})();
