function nowMs() {
  return performance.now();
}

export class RaceRules {
  constructor(eventBus) {
    this.events = eventBus;
    this.track = null;
    this.difficulty = "pro";
    this.vehicles = new Map();
    this.totalSamples = 1;
    this.startedAt = 0;
    this.countdown = 3;
    this.phase = "countdown";
    this.playerId = "player";
    this.finishOrder = [];
  }

  initRace({ track, difficulty, vehicleIds, totalSamples, playerId }) {
    this.track = track;
    this.difficulty = difficulty;
    this.totalSamples = Math.max(1, totalSamples);
    this.playerId = playerId;
    this.phase = "countdown";
    this.countdown = 3;
    this.startedAt = nowMs();
    this.finishOrder = [];
    this.vehicles.clear();

    vehicleIds.forEach((id) => {
      this.vehicles.set(id, {
        id,
        lap: 0,
        finished: false,
        finishPosition: 0,
        lastSample: 0,
        sample: 0,
        progress: 0,
        lapTimes: [],
        lapStartMs: nowMs(),
        wrapCooldown: 0
      });
    });
  }

  tick(dt) {
    if (this.phase === "countdown") {
      this.countdown -= dt;
      const left = Math.ceil(Math.max(0, this.countdown));
      if (left >= 1) {
        this.events.emit("onRaceCountdown", { value: left });
      }
      if (this.countdown <= 0) {
        this.phase = "running";
        this.events.emit("onRaceStart", { startedAt: nowMs() });
      }
    }

    this.vehicles.forEach((entry) => {
      if (entry.wrapCooldown > 0) {
        entry.wrapCooldown -= dt;
      }
    });
  }

  isRunning() {
    return this.phase === "running";
  }

  updateProgress(id, sampleIndex) {
    const entry = this.vehicles.get(id);
    if (!entry || entry.finished || this.phase !== "running") {
      return;
    }

    const total = this.totalSamples;
    const prev = entry.sample;
    entry.lastSample = prev;
    entry.sample = sampleIndex;

    if (prev > total * 0.82 && sampleIndex < total * 0.18 && entry.wrapCooldown <= 0) {
      const lapMs = nowMs() - entry.lapStartMs;
      entry.lapStartMs = nowMs();
      entry.lap += 1;
      entry.lapTimes.push(lapMs);
      entry.wrapCooldown = 1.2;

      this.events.emit("onLapComplete", {
        id,
        lap: entry.lap,
        lapTime: lapMs,
        lapTimes: entry.lapTimes.slice()
      });

      if (entry.lap >= this.track.lapCount) {
        entry.finished = true;
        entry.finishPosition = this.finishOrder.length + 1;
        this.finishOrder.push(id);

        if (id === this.playerId) {
          this.phase = "finished";
          this.events.emit("onRaceFinish", this.getPlayerResult());
        }
      }
    }

    entry.progress = entry.lap + sampleIndex / total;
  }

  getRanking() {
    const rows = Array.from(this.vehicles.values());
    rows.sort((a, b) => {
      if (a.finished && b.finished) {
        return a.finishPosition - b.finishPosition;
      }
      if (a.finished !== b.finished) {
        return a.finished ? -1 : 1;
      }
      return b.progress - a.progress;
    });
    return rows.map((row) => row.id);
  }

  getPlayerResult() {
    const ranking = this.getRanking();
    const player = this.vehicles.get(this.playerId);
    const position = ranking.indexOf(this.playerId) + 1;
    const bestLap = player && player.lapTimes.length > 0 ? Math.min(...player.lapTimes) : 0;
    return {
      trackId: this.track.id,
      difficulty: this.difficulty,
      position: Math.max(1, position),
      lapTimes: player ? player.lapTimes.slice() : [],
      bestLap,
      penalties: 0
    };
  }

  getHUDState(playerId) {
    const entry = this.vehicles.get(playerId);
    const ranking = this.getRanking();
    return {
      lap: entry ? Math.min(this.track.lapCount, entry.lap + 1) : 1,
      totalLaps: this.track.lapCount,
      position: Math.max(1, ranking.indexOf(playerId) + 1)
    };
  }
}
