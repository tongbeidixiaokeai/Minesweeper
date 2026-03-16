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

function fmt(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return Number(value).toFixed(digits);
}

function vehicleColor(index) {
  const palette = [0x45a2ff, 0xff9a42, 0x59d283, 0xc87cff, 0xff5f77, 0x43cad2];
  return palette[index % palette.length];
}

const SETTINGS_KEY = "racer3d.settings.v1";

export class GameRuntime {
  constructor(root, hudRefs, overlayRefs, debugRefs = {}, options = {}) {
    this.root = root;
    this.hud = hudRefs;
    this.overlay = overlayRefs;
    this.debug = debugRefs;
    this.isDev = Boolean(options.isDev);
    this.diagnostics = options.diagnostics || null;

    this.events = new EventBus();
    this.config = cloneConfig(DEFAULT_CONFIG);
    this.records = new RacerRecords();

    this.assetPipeline = new AssetPipeline(ASSET_MANIFEST);
    this.physics = new PhysicsSystem(this.config.physics);
    this.renderer = new RendererSystem(root, hudRefs, this.config);
    this.vehicleController = new VehicleController(this.config.controls, {
      onInputEvent: (payload) => this.onInputEvent(payload)
    });
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
    this.debugVisible = Boolean(options.startWithDebug);
    this.lastCrashAt = 0;
    this.crashCooldownMs = 900;
    this.noMoveWhileThrottleSec = 0;
    this.paused = false;

    this.lastTime = performance.now();

    this.bindEvents();
  }

  info(scope, message, meta = null) {
    this.diagnostics?.info(scope, message, meta);
  }

  warn(scope, message, meta = null) {
    this.diagnostics?.warn(scope, message, meta);
  }

  error(scope, message, meta = null) {
    this.diagnostics?.error(scope, message, meta);
  }

  onInputEvent(payload) {
    if (!payload) {
      return;
    }
    if (payload.type === "keydown") {
      this.info("input", `keydown ${payload.code || payload.key}`, {
        key: payload.key || "",
        repeat: payload.repeat ? "1" : "0",
        special: payload.extra?.specialKey || ""
      });
    }
    if (payload.type === "keyup") {
      this.info("input", `keyup ${payload.code || payload.key}`, {
        key: payload.key || ""
      });
    }
  }

  forwardKeyEvent(payload) {
    this.vehicleController.handleExternalEvent(payload);
  }

  async init() {
    this.showOverlay("LOADING", "正在加载高质量资源与物理系统...");
    this.info("init", "runtime init start");
    this.diagnostics?.setState("phase", this.raceRules.phase);
    if (this.debugVisible) {
      this.setDebugVisible(true);
    }
    try {
      this.assets = await this.assetPipeline.loadAll();
      this.info("init", "assets loaded");
      await this.physics.init();
      this.info("init", "physics initialized");

      this.vehicleController.bindInput((key) => this.handleSpecialKey(key));
      this.info("init", "input listeners bound");

      this.applyPersistedSettings();

      this.startChampionship();
      this.info("init", "championship started");
      requestAnimationFrame((time) => this.frame(time));
    } catch (err) {
      console.error("[racer3d:init]", err);
      const detail = err instanceof Error ? err.message : String(err);
      this.hud.state.textContent = "ERROR";
      this.error("init", "runtime init failed", { detail });
      this.showOverlay("INIT FAILED", `初始化失败，请打开控制台查看错误。\n${detail}`);
    }
  }

  bindEvents() {
    this.events.on("onRaceCountdown", (payload) => {
      this.diagnostics?.setState("phase", "countdown");
      this.showOverlay(`START IN ${payload.value}`, "锦标赛模式: 保持节奏，精准走线。");
    });

    this.events.on("onRaceStart", () => {
      this.diagnostics?.setState("phase", "running");
      this.info("race", "race started", {
        track: this.currentTrack?.id || "",
        difficulty: this.difficulty
      });
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
      this.warn("race", "crash detected", { impactSpeed });
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
      this.diagnostics?.setState("phase", "finished");
      this.info("race", "race finished", {
        position: result.position,
        bestLap: result.bestLap
      });
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
    try {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          this.setPaused(true, "hidden");
        }
      });
      window.addEventListener("blur", () => this.setPaused(true, "blur"));
    } catch (_err) {
    }
  }

  startChampionship() {
    this.info("race", "start championship");
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
    this.info("race", "start race", {
      track: track?.id || "",
      difficulty: this.difficulty
    });
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
    if (key === "Escape") {
      this.setPaused(!this.paused, "esc");
      return;
    }
    if (key === "F3") {
      this.setDebugVisible(!this.debugVisible);
      this.info("input", "toggle debug panel", { visible: this.debugVisible ? 1 : 0 });
      return;
    }

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

  setDebugVisible(nextVisible) {
    if (!this.debug || !this.debug.panel) {
      this.debugVisible = false;
      return;
    }
    this.debugVisible = Boolean(nextVisible);
    this.debug.panel.classList.toggle("is-visible", this.debugVisible);
    try {
      window.localStorage.setItem("racer3d.debug.visible", this.debugVisible ? "1" : "0");
    } catch (_err) {
      // Ignore storage failures.
    }
  }

  getTrafficInfo(vehicleId, knownState = null) {
    const selfState = knownState || this.physics.getVehicleState(vehicleId);
    if (!selfState || !this.currentTrack) {
      return {
        frontDistance: Infinity,
        frontRelativeSpeed: 0,
        nearestDistance: Infinity,
        leftClearance: Infinity,
        rightClearance: Infinity
      };
    }

    const yaw = selfState.yaw;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    let frontDistance = Infinity;
    let frontRelativeSpeed = 0;
    let nearestDistance = Infinity;
    let leftClearance = Infinity;
    let rightClearance = Infinity;

    for (const entity of this.entities.values()) {
      if (entity.id === vehicleId) {
        continue;
      }
      const other = this.physics.getVehicleState(entity.id);
      if (!other) {
        continue;
      }

      const dx = other.position.x - selfState.position.x;
      const dz = other.position.z - selfState.position.z;
      const distance = Math.hypot(dx, dz);
      nearestDistance = Math.min(nearestDistance, distance);

      const localForward = dx * forwardX + dz * forwardZ;
      const localLateral = dx * rightX + dz * rightZ;

      if (
        localForward > 0
        && localForward < 32
        && Math.abs(localLateral) < this.currentTrack.width * 0.78
        && localForward < frontDistance
      ) {
        frontDistance = localForward;
        frontRelativeSpeed = other.speed - selfState.speed;
      }

      if (localForward > -4 && localForward < 12) {
        if (localLateral < -0.15) {
          leftClearance = Math.min(leftClearance, distance);
        } else if (localLateral > 0.15) {
          rightClearance = Math.min(rightClearance, distance);
        }
      }
    }

    return {
      frontDistance,
      frontRelativeSpeed,
      nearestDistance,
      leftClearance: Number.isFinite(leftClearance) ? leftClearance : this.currentTrack.width * 1.4,
      rightClearance: Number.isFinite(rightClearance) ? rightClearance : this.currentTrack.width * 1.4
    };
  }

  updateDebugPanel(dt) {
    if (!this.debugVisible || !this.debug || !this.debug.content) {
      return;
    }

    const player = this.physics.getVehicleState("player");
    if (!player) {
      this.debug.content.textContent = "debug: waiting for player state";
      return;
    }

    const traffic = this.getTrafficInfo("player", player);
    const aiSampleId = this.config.race.aiCount > 0 ? "ai-1" : "";
    const aiDebug = aiSampleId ? this.aiController.getDebugState(aiSampleId) : null;
    const keyDebug = this.vehicleController.getDiagnosticsSnapshot();
    const logText = this.diagnostics ? this.diagnostics.renderText(6) : "diagnostics unavailable";

    this.debug.content.textContent = [
      `phase=${this.raceRules.phase} debug=${this.debugVisible ? "on" : "off"} dev=${this.isDev ? "1" : "0"}`,
      `dt=${fmt(dt, 3)} speed=${fmt(player.speed * 3.6, 1)}km/h yaw=${fmt(player.yaw, 2)}`,
      `slip=${fmt(player.telemetry?.slipRatio ?? 0, 3)} long=${fmt(player.telemetry?.longVel ?? 0, 2)} lat=${fmt(player.telemetry?.latVel ?? 0, 2)}`,
      `input th=${fmt(player.input?.throttle ?? 0, 2)} br=${fmt(player.input?.brake ?? 0, 2)} st=${fmt(player.input?.steer ?? 0, 2)}`,
      `key last=${keyDebug.lastCode || keyDebug.lastKey || "--"} src=${keyDebug.lastSource || "--"} down=${keyDebug.keydown}/${keyDebug.bridgedKeydown} up=${keyDebug.keyup}/${keyDebug.bridgedKeyup} pressed=[${keyDebug.pressed.join(",")}]`,
      `front=${Number.isFinite(traffic.frontDistance) ? fmt(traffic.frontDistance, 2) : "--"} rel=${fmt(traffic.frontRelativeSpeed, 2)} near=${fmt(traffic.nearestDistance, 2)}`,
      aiDebug
        ? `ai(${aiSampleId}) mode=${aiDebug.mode} front=${aiDebug.frontDistance == null ? "--" : fmt(aiDebug.frontDistance, 2)} lane=${fmt(aiDebug.lane, 2)} th=${fmt(aiDebug.throttle, 2)} br=${fmt(aiDebug.brake, 2)}`
        : "ai debug: unavailable",
      "----- logs -----",
      logText
    ].join("\n");
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
      const playerInput = this.vehicleController.getPlayerInput(playerState, dt);
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
          getTrafficInfo: (id, knownState) => this.getTrafficInfo(id, knownState)
        });
        this.physics.setInput(entity.id, {
          ...aiInput,
          tractionAssist: Math.max(0.18, this.config.controls.tractionAssist * 0.78),
          absAssist: Math.max(0.16, this.config.controls.absAssist * 0.72),
          handbrakeGripFactor: Math.max(0.4, this.config.controls.handbrakeGripFactor * 0.9),
          stabilityYawDamping: Math.max(0.35, this.config.controls.stabilityYawDamping * 0.82)
        });
      });
    } else {
      this.entities.forEach((entity) => {
        this.physics.setInput(entity.id, {
          throttle: 0,
          brake: 1,
          steer: 0,
          handbrake: false
        });
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
    this.overlay.root.classList.remove("is-menu");
    this.overlay.title.textContent = title;
    this.overlay.body.textContent = body;
  }

  hideOverlay() {
    this.overlay.root.classList.add("is-hidden");
    this.overlay.root.classList.remove("is-menu");
    const panel = document.getElementById("settings-panel");
    if (panel) {
      panel.classList.add("is-hidden");
    }
  }

  detectPlayerCrash() {
    const player = this.physics.getVehicleState("player");
    if (!player || !this.raceRules.isRunning()) {
      return;
    }
    const now = performance.now();
    if (now - this.lastCrashAt < this.crashCooldownMs) {
      return;
    }

    for (const entity of this.entities.values()) {
      if (entity.isPlayer) {
        continue;
      }
      const ai = this.physics.getVehicleState(entity.id);
      if (!ai) {
        continue;
      }
      const dx = ai.position.x - player.position.x;
      const dz = ai.position.z - player.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.55) {
        continue;
      }
      const relativeSpeed = Math.abs(player.speed - ai.speed);
      if (relativeSpeed < 8) {
        continue;
      }

      const damp = clamp(0.72 - relativeSpeed / 70, 0.45, 0.66);
      this.physics.setVehicleTransform("player", {
        position: player.position,
        velocity: { x: player.velocity.x * damp, y: player.velocity.y, z: player.velocity.z * damp },
        yaw: player.yaw
      });

      this.lastCrashAt = now;
      this.events.emit("onCrash", {
        with: entity.id,
        impactSpeed: relativeSpeed,
        distance: dist
      });
      break;
    }
  }
  frame(time) {
    const dt = clamp((time - this.lastTime) / 1000, 0, 0.05);
    this.lastTime = time;
    this.diagnostics?.setState("phase", this.raceRules.phase);
    if (!this.paused) {
      this.raceRules.tick(dt);
      this.applyInputs(dt);
      this.physics.step(dt);
      this.detectPlayerCrash();
      this.updateProgressTracking();
      this.syncVisualsAndHud();
      this.updateDebugPanel(dt);
      this.renderer.render();
    } else {
      this.syncVisualsAndHud();
      this.renderer.render();
    }

    const player = this.physics.getVehicleState("player");
    if (this.raceRules.isRunning() && player) {
      const throttle = player.input?.throttle || 0;
      if (throttle > 0.45 && player.speed < 0.45) {
        this.noMoveWhileThrottleSec += dt;
        if (this.noMoveWhileThrottleSec > 2.2) {
          this.warn("watchdog", "throttle high but speed low", {
            throttle,
            speed: player.speed,
            phase: this.raceRules.phase
          });
          this.noMoveWhileThrottleSec = 0;
        }
      } else {
        this.noMoveWhileThrottleSec = 0;
      }
    } else {
      this.noMoveWhileThrottleSec = 0;
    }

    requestAnimationFrame((next) => this.frame(next));
  }

  setPaused(next, reason = "") {
    const willPause = Boolean(next);
    if (this.paused === willPause) {
      return;
    }
    this.paused = willPause;
    if (this.paused) {
      this.vehicleController.clearInputState("pause");
      this.showMenuOverlay();
      this.info("pause", "paused", { reason });
    } else {
      this.hideOverlay();
      this.info("pause", "resumed", { reason });
    }
  }

  showMenuOverlay() {
    this.overlay.root.classList.add("is-menu");
    this.overlay.root.classList.remove("is-hidden");
    this.overlay.title.textContent = "PAUSED";
    this.overlay.body.textContent = "暂停中";
    const resume = document.getElementById("overlay-resume");
    const restart = document.getElementById("overlay-restart");
    const settings = document.getElementById("overlay-settings");
    const panel = document.getElementById("settings-panel");
    const pixel = document.getElementById("setting-pixelratio");
    const pixelVal = document.getElementById("setting-pixelratio-value");
    const postfx = document.getElementById("setting-postfx");
    const steer = document.getElementById("setting-steer");
    const steerVal = document.getElementById("setting-steer-value");
    if (resume) resume.onclick = () => this.setPaused(false, "menu");
    if (restart) restart.onclick = () => { this.startRace(this.currentTrack); this.setPaused(false, "menu-restart"); };
    if (settings && panel) {
      settings.onclick = () => {
        panel.classList.toggle("is-hidden");
      };
    }
    if (pixel && pixelVal) {
      const update = () => {
        pixelVal.textContent = Number(pixel.value).toFixed(2);
        this.renderer.setPixelRatioCap(Number(pixel.value));
        this.savePersistedSettings({ pixelRatioCap: Number(pixel.value) });
      };
      pixel.oninput = update;
      const loaded = this.loadPersistedSettings();
      if (loaded.pixelRatioCap != null) {
        pixel.value = String(loaded.pixelRatioCap);
      }
      update();
    }
    if (postfx) {
      const loaded = this.loadPersistedSettings();
      postfx.checked = loaded.postfx != null ? Boolean(loaded.postfx) : this.renderer.effectsEnabled;
      postfx.onchange = () => {
        this.renderer.setPostEffectsEnabled(Boolean(postfx.checked));
        this.savePersistedSettings({ postfx: Boolean(postfx.checked) });
      };
    }
    if (steer && steerVal) {
      const updateSteer = () => {
        steerVal.textContent = Number(steer.value).toFixed(2);
        this.config.controls.steerSensitivity = Number(steer.value);
        this.vehicleController.updateAssistConfig(this.config.controls);
        this.savePersistedSettings({ steerSensitivity: Number(steer.value) });
      };
      const loaded = this.loadPersistedSettings();
      const initial = Number.isFinite(loaded.steerSensitivity) ? loaded.steerSensitivity : this.config.controls.steerSensitivity;
      steer.value = String(Number(initial).toFixed(2));
      updateSteer();
      steer.oninput = updateSteer;
    }
  }

  loadPersistedSettings() {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      return data && typeof data === "object" ? data : {};
    } catch (_err) {
      return {};
    }
  }

  savePersistedSettings(partial) {
    const current = this.loadPersistedSettings();
    const next = { ...current, ...(partial && typeof partial === "object" ? partial : {}) };
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch (_err) {
    }
  }

  applyPersistedSettings() {
    const s = this.loadPersistedSettings();
    if (typeof s.postfx === "boolean") {
      this.renderer.setPostEffectsEnabled(s.postfx);
    }
    if (Number.isFinite(s.pixelRatioCap)) {
      this.renderer.setPixelRatioCap(s.pixelRatioCap);
    }
    if (Number.isFinite(s.steerSensitivity)) {
      this.config.controls.steerSensitivity = s.steerSensitivity;
      this.vehicleController.updateAssistConfig(this.config.controls);
    }
  }
}


