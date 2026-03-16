export const LEVELS = Object.freeze({
  beginner: { key: "beginner", label: "初级", cols: 9, rows: 9, mines: 10 },
  intermediate: { key: "intermediate", label: "中级", cols: 16, rows: 16, mines: 40 },
  expert: { key: "expert", label: "高级", cols: 30, rows: 16, mines: 99 }
});

export const STATUS_TEXT = Object.freeze({
  idle: "准备开始",
  playing: "游戏进行中",
  won: "清扫完成",
  lost: "踩雷了，点击重新开始"
});

export const DEFAULT_OPTIONS = Object.freeze({
  longPressMs: 360,
  defaultLevel: "beginner",
  zoomLevel: "auto",
  flagLock: null,
  contrastMode: "medium",
  autoStart: true
});

export const STORAGE_KEY = "minesweeper.records.v1";
export const UI_STORAGE_KEY = "minesweeper.ui.v1";

export const ZOOM_LEVELS = Object.freeze(["auto", "100", "125", "150", "175", "200"]);
export const ZOOM_SCALE_MAP = Object.freeze({
  auto: 1,
  "100": 1,
  "125": 1.25,
  "150": 1.5,
  "175": 1.75,
  "200": 2
});

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function formatCounter(value) {
  if (value < 0) {
    return `-${String(Math.abs(value)).padStart(2, "0")}`;
  }
  return String(value).padStart(3, "0");
}

export function getLevel(levelKey) {
  return LEVELS[levelKey] || LEVELS.beginner;
}

export function normalizeZoomLevel(value) {
  const key = String(value || "auto");
  return Object.prototype.hasOwnProperty.call(ZOOM_SCALE_MAP, key) ? key : "auto";
}

export function getZoomScale(zoomLevel) {
  return ZOOM_SCALE_MAP[normalizeZoomLevel(zoomLevel)];
}

export function normalizeContrastMode(value) {
  const mode = String(value || "medium");
  return mode === "medium" ? mode : "medium";
}

export function detectTouchDevice() {
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

export function formatElapsed(seconds) {
  const safe = clamp(Number.isFinite(seconds) ? Math.floor(seconds) : 0, 0, 999);
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatDateTime(timestamp) {
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

