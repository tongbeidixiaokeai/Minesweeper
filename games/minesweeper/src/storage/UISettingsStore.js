import { UI_STORAGE_KEY, DEFAULT_OPTIONS, detectTouchDevice, normalizeContrastMode, normalizeZoomLevel } from "../core.js";

export class UISettingsStore {
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

