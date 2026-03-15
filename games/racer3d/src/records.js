import { CHAMPIONSHIP_POINTS, STORAGE_KEY } from "./config.js";

function msToText(ms) {
  if (!ms || ms <= 0) {
    return "--:--";
  }
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export class RacerRecords {
  constructor() {
    this.data = this.load();
  }

  createEmpty() {
    return {
      bestLap: {},
      championship: {
        history: [],
        totalWins: 0
      }
    };
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return this.createEmpty();
      }
      const parsed = JSON.parse(raw);
      return {
        bestLap: parsed.bestLap || {},
        championship: {
          history: Array.isArray(parsed.championship?.history) ? parsed.championship.history.slice(0, 16) : [],
          totalWins: Number(parsed.championship?.totalWins || 0)
        }
      };
    } catch (_err) {
      return this.createEmpty();
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (_err) {
      // Ignore persistence errors.
    }
  }

  upsertBestLap(trackId, difficulty, lapMs) {
    if (!lapMs || lapMs <= 0) {
      return;
    }
    const key = `${trackId}:${difficulty}`;
    const current = this.data.bestLap[key];
    if (!current || lapMs < current) {
      this.data.bestLap[key] = lapMs;
      this.save();
    }
  }

  getBestLapText(trackId, difficulty) {
    const key = `${trackId}:${difficulty}`;
    return msToText(this.data.bestLap[key] || 0);
  }

  finalizeChampionship(payload) {
    const points = payload.positions.map((pos) => CHAMPIONSHIP_POINTS[Math.max(0, pos - 1)] || 0);
    const sum = points.reduce((acc, n) => acc + n, 0);

    const record = {
      at: Date.now(),
      difficulty: payload.difficulty,
      positions: payload.positions,
      points,
      total: sum
    };

    this.data.championship.history.unshift(record);
    this.data.championship.history = this.data.championship.history.slice(0, 16);

    const wins = payload.positions.filter((pos) => pos === 1).length;
    if (wins === payload.positions.length) {
      this.data.championship.totalWins += 1;
    }

    this.save();
    return record;
  }
}

export { msToText };
