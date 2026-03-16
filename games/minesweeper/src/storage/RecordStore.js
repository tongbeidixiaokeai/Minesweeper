import { STORAGE_KEY, LEVELS, clamp } from "../core.js";

export class RecordStore {
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

