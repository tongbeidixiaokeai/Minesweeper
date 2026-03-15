import * as THREE from "three";
import { ASSET_MANIFEST, DEFAULT_CONFIG, DIFFICULTY_PRESETS, TRACKS, VEHICLE_SPECS } from "./config.js";
import { EventBus } from "./events.js";
import { AssetPipeline } from "./asset-pipeline.js";
import { PhysicsSystem } from "./physics-system.js";
import { RendererSystem } from "./renderer-system.js";
import { VehicleController } from "./vehicle-controller.js";
import { AIController } from "./ai-controller.js";
import { RaceRules } from "./race-rules.js";
import { RacerRecords, msToText } from "./records.js";

function cloneConfig(base) {
  return JSON.parse(JSON.stringify(base));
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function vehicleColor(index) {
  const palette = [0x45a2ff, 0xff9a42, 0x59d283, 0xc87cff, 0xff5f77, 0x43cad2];
  return palette[index % palette.length];
}

export class GameRuntime {
  constructor(root, hudRefs, overlayRefs) {
    this.root = root;
    this.hud = hudRefs;
    this.overlay = overlayRefs;

    this.events = new EventBus();
    this.config = cloneConfig(DEFAULT_CONFIG);
    this.records = new RacerRecords();

    this.assetPipeline = new AssetPipeline(ASSET_MANIFEST);
    this.physics = new PhysicsSystem(this.config.physics);
    this.renderer = new RendererSystem(root, hudRefs, this.config);
    this.vehicleController = new VehicleController(this.config.controls);
    this.aiController = new AIController(this.config.ai);
    this.raceRules = new RaceRules(this.events);

    this.assets = null;
    this.entities = new Map();
    this.progressByVehicle = new Map();

    this.difficulty = "pro";
    this.trackIndex = 0;
    this.championshipPositions = [];
    this.awaitNext = false;
    this.pendingAdvance = null;

    this.lastTime = performance.now();

    this.bindEvents();
  }

  async init() {
    this.showOverlay("LOADING", "正在加载高质量资源与物理系统...");
    this.assets = await this.assetPipeline.loadAll();
    await this.physics.init();

    this.vehicleController.bindInput((key) => this.handleSpecialKey(key));

    this.startChampionship();
    requestAnimationFrame((time) => this.frame(time));
  }

  bindEvents() {
    this.events.on("onRaceCountdown", (payload) => {
      this.showOverlay(`START IN ${payload.value}`, "锦标赛模式: 保持节奏，精准走线。");
    });

    this.events.on("onRaceStart", () => {
      this.hideOverlay();
    });

    this.events.on("onLapComplete", ({ id, lap, lapTime, lapTimes }) => {
      if (id !== "player") {
        return;
      }
      this.records.upsertBestLap(this.currentTrack.id, this.difficulty, lapTime);
      this.hud.bestLap.textContent = this.records.getBestLapText(this.currentTrack.id, this.difficulty);

      if (lap < this.currentTrack.lapCount) {
        this.showOverlay(`LAP ${lap}/${this.currentTrack.lapCount}`, `本圈: ${msToText(lapTime)} | 最佳: ${msToText(Math.min(...lapTimes))}`);
        window.setTimeout(() => this.hideOverlay(), 1000);
      }
    });
    this.events.on("onCrash", ({ impactSpeed }) => {
      this.hud.state.textContent = "HIT";
      if (impactSpeed > 20) {
        this.showOverlay("HEAVY IMPACT", "注意入弯速度与走线，避免连续碰撞。\n");
        window.setTimeout(() => {
          if (this.raceRules.phase === "running") {
            this.hideOverlay();
          }
        }, 520);
      }
    });

    this.events.on("onRaceFinish", (result) => {
      this.championshipPositions.push(result.position);
      const bestLapText = result.bestLap > 0 ? msToText(result.bestLap) : "--:--";
      this.showOverlay(
        `RACE ${this.trackIndex + 1} FINISHED`,
        `排名 P${result.position} | 最佳圈速 ${bestLapText}`
      );

      this.awaitNext = true;
      if (this.trackIndex < TRACKS.length - 1) {
        this.pendingAdvance = "nextRace";
      } else {
        const summary = this.records.finalizeChampionship({
          difficulty: this.difficulty,
          positions: this.championshipPositions.slice()
        });
        this.pendingAdvance = "restartChampionship";
        this.showOverlay(
          "CHAMPIONSHIP COMPLETE",
          `总积分 ${summary.total} | 分站排名 ${summary.positions.map((p) => `P${p}`).join(" / ")}`
        );
      }
    });
  }

  startChampionship() {
    this.trackIndex = 0;
    this.championshipPositions = [];
    this.awaitNext = false;
    this.pendingAdvance = null;
    this.startRace(TRACKS[this.trackIndex]);
  }

  applyDifficultyPreset() {
    const preset = DIFFICULTY_PRESETS[this.difficulty] || DIFFICULTY_PRESETS.pro;
    this.config.ai = { ...this.config.ai, ...preset.ai };
    this.config.controls = { ...this.config.controls, ...preset.controls };
    this.aiController.updateConfig(this.config.ai);
    this.vehicleController.updateAssistConfig(this.config.controls);
    this.hud.difficulty.textContent = this.difficulty;
  }

  startRace(track) {
    this.currentTrack = track;
    this.applyDifficultyPreset();

    this.renderer.setTrack(track);
    this.renderer.setEnvironmentPreset(track.envPreset);
    this.hud.bestLap.textContent = this.records.getBestLapText(track.id, this.difficulty);

    const ids = ["player"];
    for (let i = 0; i < this.config.race.aiCount; i += 1) {
      ids.push(`ai-${i + 1}`);
    }

    this.ensureEntities(ids);
    this.resetEntitiesToSpawn(track);

    this.raceRules.initRace({
      track,
      difficulty: this.difficulty,
      vehicleIds: ids,
      totalSamples: this.renderer.trackSamples.length,
      playerId: "player"
    });

    this.progressByVehicle.clear();
    ids.forEach((id) => this.progressByVehicle.set(id, 0));

    this.awaitNext = false;
    this.pendingAdvance = null;
    this.hud.state.textContent = "COUNTDOWN";
  }

  ensureEntities(ids) {
    ids.forEach((id, index) => {
      if (this.entities.has(id)) {
        return;
      }

      const isPlayer = id === "player";
      const spec = isPlayer ? VEHICLE_SPECS.player : VEHICLE_SPECS.ai;
      const body = this.physics.createVehicleBody(id, spec, { x: 0, y: 0.36, z: 0 }, isPlayer);

      const template = isPlayer ? this.assets.vehicles.player : this.assets.vehicles.ai;
      const visual = this.renderer.createVehicleVisual(id, template, isPlayer ? 0xff5945 : vehicleColor(index));

      this.entities.set(id, {
        id,
        isPlayer,
        body,
        visual,
        sampleHint: 0
      });

      if (!isPlayer) {
        this.aiController.register(id, (Math.random() - 0.5) * 0.8);
      }
    });
  }

  resetEntitiesToSpawn(track) {
    const spawn = track.spawnPoints;
    let i = 0;
    this.entities.forEach((entity) => {
      const s = spawn[Math.min(i, spawn.length - 1)] || { s: 0, lane: 0 };
      const frame = this.renderer.getTrackFrameAtS(s.s);
      const pos = frame.point.clone().addScaledVector(frame.right, s.lane * track.width * 0.35);
      pos.y = 0.36;
      const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);

      this.physics.setVehicleTransform(entity.id, {
        position: { x: pos.x, y: pos.y, z: pos.z },
        velocity: { x: 0, y: 0, z: 0 },
        yaw
      });

      entity.sampleHint = Math.floor(s.s * this.renderer.trackSamples.length);
      i += 1;
    });

    this.aiController.unregisterAll();
    for (let idx = 1; idx <= this.config.race.aiCount; idx += 1) {
      const id = `ai-${idx}`;
      const laneSeed = (idx % 2 === 0 ? -1 : 1) * (0.2 + (idx / 14));
      this.aiController.register(id, laneSeed);
    }
  }

  handleSpecialKey(key) {
    if (key === "Enter") {
      if (this.awaitNext) {
        if (this.pendingAdvance === "nextRace") {
          this.trackIndex += 1;
          this.startRace(TRACKS[this.trackIndex]);
        } else if (this.pendingAdvance === "restartChampionship") {
          this.startChampionship();
        }
      }
      return;
    }

    if (key === "r" || key === "R") {
      this.startRace(this.currentTrack);
      return;
    }

    if (key === "t" || key === "T") {
      this.trackIndex = (this.trackIndex + 1) % TRACKS.length;
      this.startRace(TRACKS[this.trackIndex]);
      return;
    }

    if (key === "1") {
      this.difficulty = "rookie";
      this.startRace(this.currentTrack);
    } else if (key === "2") {
      this.difficulty = "pro";
      this.startRace(this.currentTrack);
    } else if (key === "3") {
      this.difficulty = "legend";
      this.startRace(this.currentTrack);
    }
  }

  findNearestVehicleDistance(vehicleId) {
    const self = this.entities.get(vehicleId);
    if (!self) {
      return Infinity;
    }

    const selfState = this.physics.getVehicleState(vehicleId);
    if (!selfState) {
      return Infinity;
    }

    let best = Infinity;
    this.entities.forEach((entity) => {
      if (entity.id === vehicleId) {
        return;
      }
      const other = this.physics.getVehicleState(entity.id);
      if (!other) {
        return;
      }
      const dx = other.position.x - selfState.position.x;
      const dz = other.position.z - selfState.position.z;
      const d = Math.hypot(dx, dz);
      if (d < best) {
        best = d;
      }
    });
    return best;
  }

  updateProgressTracking() {
    this.entities.forEach((entity) => {
      const state = this.physics.getVehicleState(entity.id);
      if (!state) {
        return;
      }
      const nearest = this.renderer.findNearestSampleIndex(state.position, entity.sampleHint);
      entity.sampleHint = nearest;
      const s = nearest / Math.max(1, this.renderer.trackSamples.length);
      this.progressByVehicle.set(entity.id, s);
      this.raceRules.updateProgress(entity.id, nearest);
    });
  }

  applyInputs(dt) {
    const playerState = this.physics.getVehicleState("player");

    if (this.raceRules.isRunning()) {
      const playerInput = this.vehicleController.getPlayerInput(playerState);
      this.physics.setInput("player", playerInput);

      this.entities.forEach((entity) => {
        if (entity.isPlayer) {
          return;
        }
        const aiState = this.physics.getVehicleState(entity.id);
        const aiInput = this.aiController.buildInput(entity.id, aiState, {
          dt,
          renderer: this.renderer,
          track: this.currentTrack,
          progressByVehicle: this.progressByVehicle,
          findNearestVehicleDistance: (id) => this.findNearestVehicleDistance(id)
        });
        this.physics.setInput(entity.id, aiInput);
      });
    } else {
      this.entities.forEach((entity) => {
        this.physics.setInput(entity.id, { throttle: 0, brake: 1, steer: 0, handbrake: false });
      });
    }
  }

  syncVisualsAndHud() {
    this.entities.forEach((entity) => {
      const vState = this.physics.getVehicleState(entity.id);
      if (!vState) {
        return;
      }
      this.renderer.updateVehicleVisual(entity.id, vState);
    });

    const playerState = this.physics.getVehicleState("player");
    if (playerState) {
      this.renderer.updateCamera(playerState);

      const hudState = this.raceRules.getHUDState("player");
      this.hud.state.textContent = this.raceRules.phase.toUpperCase();
      this.renderer.updateHud({
        speedKmh: playerState.speed * 3.6,
        lap: hudState.lap,
        totalLaps: hudState.totalLaps,
        position: hudState.position,
        difficulty: this.difficulty,
        state: this.hud.state.textContent,
        bestLapText: this.records.getBestLapText(this.currentTrack.id, this.difficulty)
      });
    }
  }

  showOverlay(title, body) {
    this.overlay.root.classList.remove("is-hidden");
    this.overlay.title.textContent = title;
    this.overlay.body.textContent = body;
  }

  hideOverlay() {
    this.overlay.root.classList.add("is-hidden");
  }

  detectPlayerCrash() {
    const player = this.physics.getVehicleState("player");
    if (!player || !this.raceRules.isRunning()) {
      return;
    }
    this.entities.forEach((entity) => {
      if (entity.isPlayer) {
        return;
      }
      const ai = this.physics.getVehicleState(entity.id);
      if (!ai) {
        return;
      }
      const dx = ai.position.x - player.position.x;
      const dz = ai.position.z - player.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.55) {
        return;
      }
      const relativeSpeed = Math.abs(player.speed - ai.speed);
      if (relativeSpeed < 8) {
        return;
      }

      const damp = 0.58;
      this.physics.setVehicleTransform("player", {
        position: player.position,
        velocity: { x: player.velocity.x * damp, y: player.velocity.y, z: player.velocity.z * damp },
        yaw: player.yaw
      });

      this.events.emit("onCrash", {
        with: entity.id,
        impactSpeed: relativeSpeed,
        distance: dist
      });
    });
  }
  frame(time) {
    const dt = clamp((time - this.lastTime) / 1000, 0, 0.05);
    this.lastTime = time;

    this.raceRules.tick(dt);
    this.applyInputs(dt);
    this.physics.step(dt);
    this.detectPlayerCrash();
    this.updateProgressTracking();
    this.syncVisualsAndHud();
    this.renderer.render();

    requestAnimationFrame((next) => this.frame(next));
  }
}


