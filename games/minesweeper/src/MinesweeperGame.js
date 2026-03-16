import { DEFAULT_OPTIONS, normalizeContrastMode, normalizeZoomLevel } from "./core.js";
import { GameController } from "./controller/GameController.js";
import { Renderer } from "./ui/Renderer.js";
import { RecordStore } from "./storage/RecordStore.js";
import { UISettingsStore } from "./storage/UISettingsStore.js";

export class MinesweeperGame {
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

