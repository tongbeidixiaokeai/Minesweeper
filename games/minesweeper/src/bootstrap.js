import { DEFAULT_OPTIONS } from "./core.js";
import { MinesweeperGame } from "./MinesweeperGame.js";

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

