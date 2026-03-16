import { Animator } from "./Animator.js";
import {
  LEVELS,
  STATUS_TEXT,
  DEFAULT_OPTIONS,
  ZOOM_LEVELS,
  clamp,
  formatCounter,
  getLevel,
  getZoomScale,
  normalizeContrastMode,
  normalizeZoomLevel,
  formatElapsed,
  formatDateTime
} from "../core.js";

export class Renderer {
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
