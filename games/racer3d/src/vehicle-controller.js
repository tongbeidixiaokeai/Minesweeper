function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function moveToward(current, target, rate, dt) {
  if (rate <= 0) {
    return target;
  }
  const maxStep = rate * dt;
  const delta = target - current;
  if (Math.abs(delta) <= maxStep) {
    return target;
  }
  return current + Math.sign(delta) * maxStep;
}

const SPECIAL_BY_CODE = {
  Enter: "Enter",
  Escape: "Escape",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  KeyR: "r",
  KeyT: "t",
  F3: "F3"
};

const SPECIAL_BY_KEY = new Set(["r", "R", "t", "T", "1", "2", "3", "Enter", "Escape", "F3"]);

function toSpecialKey(key, code) {
  return SPECIAL_BY_CODE[code] || (SPECIAL_BY_KEY.has(key) ? key : "");
}

export class VehicleController {
  constructor(config, options = {}) {
    this.config = config;
    this.onInputEvent = typeof options.onInputEvent === "function" ? options.onInputEvent : null;
    this.onSpecialKey = null;
    this.keys = new Set();
    this.codes = new Set();
    this.smoothedInput = {
      steer: 0,
      throttle: 0,
      brake: 0
    };
    this.metrics = {
      keydown: 0,
      keyup: 0,
      bridgedKeydown: 0,
      bridgedKeyup: 0,
      lastKey: "",
      lastCode: "",
      lastSpecial: "",
      lastSource: "",
      lastAtMs: 0
    };
    this.lastSpecialDispatch = {
      key: "",
      at: 0
    };
    this.bindings = {
      left: ["ArrowLeft", "a", "A", "KeyA"],
      right: ["ArrowRight", "d", "D", "KeyD"],
      throttle: ["ArrowUp", "w", "W", "KeyW"],
      brake: ["ArrowDown", "s", "S", "KeyS"],
      handbrake: [" ", "Space"]
    };
  }

  bindInput(onSpecialKey) {
    this.onSpecialKey = onSpecialKey;

    window.addEventListener("keydown", (event) => {
      this.processKeyEvent({
        phase: "keydown",
        key: event.key || "",
        code: event.code || "",
        repeat: Boolean(event.repeat),
        source: "window"
      });
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Escape", "F3"].includes(event.key)
        || ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Escape", "F3"].includes(event.code)
      ) {
        event.preventDefault();
      }
    });

    window.addEventListener("keyup", (event) => {
      this.processKeyEvent({
        phase: "keyup",
        key: event.key || "",
        code: event.code || "",
        repeat: Boolean(event.repeat),
        source: "window"
      });
    });

    window.addEventListener("blur", () => {
      this.keys.clear();
      this.codes.clear();
      // Only clear steering on blur, but let throttle/brake decay naturally or hold
      // to avoid sudden stops if focus is lost momentarily.
      this.smoothedInput.steer = 0;
      this.emitInputEvent("blur", { key: "", code: "", repeat: false }, { source: "window" });
    });
  }

  handleExternalEvent(payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const phase = payload.phase === "keyup" ? "keyup" : "keydown";
    this.processKeyEvent({
      phase,
      key: payload.key || "",
      code: payload.code || "",
      repeat: Boolean(payload.repeat),
      source: "bridge"
    });
  }

  processKeyEvent({ phase, key, code, repeat, source }) {
    const specialKey = toSpecialKey(key, code);
    const now = performance.now();

    if (phase === "keydown") {
      this.keys.add(key);
      this.codes.add(code);
      if (source === "bridge") {
        this.metrics.bridgedKeydown += 1;
      } else {
        this.metrics.keydown += 1;
      }
      if (specialKey && this.onSpecialKey) {
        const sameAsLast = this.lastSpecialDispatch.key === specialKey && (now - this.lastSpecialDispatch.at) < 120;
        if (!sameAsLast) {
          this.lastSpecialDispatch.key = specialKey;
          this.lastSpecialDispatch.at = now;
          this.onSpecialKey(specialKey);
        }
      }
      this.emitInputEvent("keydown", { key, code, repeat }, {
        specialKey: specialKey || "",
        source
      });
    } else {
      this.keys.delete(key);
      this.codes.delete(code);
      if (source === "bridge") {
        this.metrics.bridgedKeyup += 1;
      } else {
        this.metrics.keyup += 1;
      }
      this.emitInputEvent("keyup", { key, code, repeat }, { source });
    }

    this.metrics.lastKey = key || "";
    this.metrics.lastCode = code || "";
    this.metrics.lastSpecial = specialKey || "";
    this.metrics.lastSource = source || "";
    this.metrics.lastAtMs = now;
  }

  emitInputEvent(type, event, extra = null) {
    if (!this.onInputEvent) {
      return;
    }
    this.onInputEvent({
      type,
      key: event.key || "",
      code: event.code || "",
      repeat: Boolean(event.repeat),
      ts: performance.now(),
      extra
    });
  }

  isPressed(list) {
    return list.some((key) => this.keys.has(key) || this.codes.has(key));
  }

  updateAssistConfig(config) {
    this.config = config;
  clearInputState(source = "runtime") {
    this.keys.clear();
    this.codes.clear();
    this.smoothedInput.steer = 0;
    // Don't zero out throttle/brake immediately, let them decay or stay as is
    // so momentary pauses or blurs don't jerk the car.
    // Physics or runtime can override inputs if needed (e.g. countdown).
  }  this.emitInputEvent("clear", { key: "", code: "", repeat: false }, { source });
  }

  getDiagnosticsSnapshot() {
    return {
      keydown: this.metrics.keydown,
      keyup: this.metrics.keyup,
      bridgedKeydown: this.metrics.bridgedKeydown,
      bridgedKeyup: this.metrics.bridgedKeyup,
      lastKey: this.metrics.lastKey,
      lastCode: this.metrics.lastCode,
      lastSpecial: this.metrics.lastSpecial,
      lastSource: this.metrics.lastSource,
      lastAtMs: this.metrics.lastAtMs,
      pressed: Array.from(this.codes.values())
    };
  }

  getPlayerInput(vehicleState, dt = 1 / 60) {
    const safeDt = clamp(Number.isFinite(dt) ? dt : (1 / 60), 1 / 240, 0.1);
    const steerLeft = this.isPressed(this.bindings.left);
    const steerRight = this.isPressed(this.bindings.right);
    const throttleTarget = this.isPressed(this.bindings.throttle) ? 1 : 0;
    const brakeTarget = this.isPressed(this.bindings.brake) ? 1 : 0;
    const handbrake = this.isPressed(this.bindings.handbrake);

    let steerTarget = 0;
    if (steerLeft) {
      steerTarget -= this.config.steerSensitivity;
    }
    if (steerRight) {
      steerTarget += this.config.steerSensitivity;
    }

    this.smoothedInput.throttle = moveToward(
      this.smoothedInput.throttle,
      throttleTarget,
      throttleTarget > this.smoothedInput.throttle ? this.config.throttleRise : this.config.throttleFall,
      safeDt
    );
    this.smoothedInput.brake = moveToward(
      this.smoothedInput.brake,
      brakeTarget,
      brakeTarget > this.smoothedInput.brake ? this.config.brakeRise : this.config.brakeFall,
      safeDt
    );
    this.smoothedInput.steer = moveToward(
      this.smoothedInput.steer,
      steerTarget,
      7.2 + this.config.steerSensitivity * 2.6,
      safeDt
    );

    const speed = vehicleState ? vehicleState.speed : 0;
    const speedFactor = Math.max(this.config.steerMinFactor, 1 - speed / this.config.steerFadeSpeed);
    const steer = this.smoothedInput.steer * speedFactor;

    return {
      throttle: this.smoothedInput.throttle,
      brake: this.smoothedInput.brake,
      steer,
      handbrake,
      tractionAssist: this.config.tractionAssist,
      absAssist: this.config.absAssist,
      handbrakeGripFactor: this.config.handbrakeGripFactor,
      stabilityYawDamping: this.config.stabilityYawDamping
    };
  }
}
