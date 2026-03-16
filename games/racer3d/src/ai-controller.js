function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function normalizeAngle(rad) {
  let value = rad;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

export class AIController {
  constructor(config) {
    this.config = config;
    this.aiState = new Map();
  }

  updateConfig(config) {
    this.config = config;
  }

  register(id, seedLane = 0) {
    this.aiState.set(id, {
      laneBias: seedLane,
      targetLane: seedLane,
      lane: seedLane,
      mode: "cruise",
      modeTimer: 0,
      laneCooldown: 0,
      randomTimer: 1 + Math.random() * 3,
      debug: null
    });
  }

  unregisterAll() {
    this.aiState.clear();
  }

  getDebugState(id) {
    const state = this.aiState.get(id);
    if (!state || !state.debug) {
      return null;
    }
    return { ...state.debug };
  }

  buildInput(id, vehicleState, context) {
    const state = this.aiState.get(id);
    if (!state || !vehicleState) {
      return { throttle: 0, brake: 1, steer: 0, handbrake: false };
    }

    const dt = clamp(context.dt || 1 / 60, 1 / 300, 0.1);
    state.randomTimer = Math.max(0, state.randomTimer - dt);
    state.modeTimer = Math.max(0, state.modeTimer - dt);
    state.laneCooldown = Math.max(0, state.laneCooldown - dt);

    const nearestS = context.progressByVehicle.get(id) || 0;
    const lookAhead = 0.008 + Math.min(0.03, vehicleState.speed / 2200);
    const frameNow = context.renderer.getTrackFrameAtS(nearestS);
    const frameFuture = context.renderer.getTrackFrameAtS(nearestS + lookAhead);
    const traffic = context.getTrafficInfo(id, vehicleState);

    const hasFront = Number.isFinite(traffic.frontDistance);
    const isFollowing = hasFront && traffic.frontDistance < this.config.followGap;
    const shouldAttemptOvertake = hasFront
      && traffic.frontDistance < this.config.overtakeTriggerGap
      && state.laneCooldown <= 0;

    if (state.mode === "overtake" && state.modeTimer <= 0) {
      state.mode = "recover";
      state.modeTimer = 0.6;
    } else if (state.mode === "recover" && state.modeTimer <= 0) {
      state.mode = "cruise";
    }

    if (state.mode !== "overtake") {
      if (isFollowing) {
        state.mode = "follow";
      } else if (state.mode !== "recover") {
        state.mode = "cruise";
      }
    }

    if (state.mode === "follow" && shouldAttemptOvertake) {
      const leftScore = traffic.leftClearance + (state.laneBias <= 0 ? 0.45 : 0);
      const rightScore = traffic.rightClearance + (state.laneBias > 0 ? 0.45 : 0);
      const preferRight = rightScore >= leftScore;
      const chosenClearance = preferRight ? traffic.rightClearance : traffic.leftClearance;
      if (chosenClearance > context.track.width * 0.42) {
        const dir = preferRight ? 1 : -1;
        state.mode = "overtake";
        state.modeTimer = this.config.laneCommitSec;
        state.laneCooldown = this.config.laneChangeCooldownSec;
        state.targetLane = clamp(
          state.laneBias + dir * (0.58 + this.config.overtakeBias * 0.32),
          -0.95,
          0.95
        );
      }
    }

    if (state.mode === "cruise" && state.randomTimer <= 0 && state.laneCooldown <= 0) {
      const laneShift = (Math.random() - 0.5) * this.config.overtakeBias * 0.5;
      state.targetLane = clamp(state.laneBias + laneShift, -0.75, 0.75);
      state.randomTimer = 1.1 + Math.random() * 2.5;
      state.laneCooldown = this.config.laneChangeCooldownSec * 0.4;
    }

    if (state.mode === "follow") {
      state.targetLane = clamp(state.targetLane * 0.9, -0.66, 0.66);
    } else if (state.mode === "recover") {
      state.targetLane += (state.laneBias - state.targetLane) * Math.min(1, dt * 2.8);
    }

    const laneLerpSpeed = state.mode === "overtake" ? 2.8 : 1.9;
    const laneDeltaMax = laneLerpSpeed * dt;
    const laneDelta = clamp(state.targetLane - state.lane, -laneDeltaMax, laneDeltaMax);
    state.lane = clamp(state.lane + laneDelta, -0.95, 0.95);

    const target = frameFuture.point.clone().addScaledVector(frameFuture.right, state.lane * context.track.width * 0.34);
    const toTargetX = target.x - vehicleState.position.x;
    const toTargetZ = target.z - vehicleState.position.z;
    const desiredYaw = Math.atan2(toTargetX, toTargetZ);
    const yawError = normalizeAngle(desiredYaw - vehicleState.yaw);
    const steerGain = 1.45 + this.config.aggression * 0.88 + (state.mode === "overtake" ? 0.26 : 0);
    let steer = clamp(yawError * steerGain, -1, 1);

    let throttle = 1;
    let brake = 0;
    const baseTargetSpeed = this.config.targetSpeed + state.lane * 2.1;

    if (vehicleState.speed > baseTargetSpeed) {
      throttle = 0.22;
      brake = 0.24;
    }

    if (state.mode === "follow" && hasFront) {
      const gapRatio = clamp(traffic.frontDistance / this.config.followGap, 0, 1.4);
      throttle = Math.min(throttle, clamp(gapRatio * 0.9, 0.02, 0.82));
      brake = Math.max(brake, clamp((1 - gapRatio) * this.config.maxBrakeOnFollow, 0, this.config.maxBrakeOnFollow));
      if (traffic.frontRelativeSpeed < -5.5) {
        brake = Math.max(brake, this.config.maxBrakeOnFollow * 0.78);
      }
    }

    if (traffic.nearestDistance < this.config.avoidDistance * 0.6 && state.mode !== "overtake") {
      throttle = Math.min(throttle, 0.3);
      brake = Math.max(brake, this.config.maxBrakeOnFollow * 0.9);
      steer += (Math.random() > 0.5 ? 1 : -1) * 0.1;
    }

    if (state.mode === "overtake") {
      throttle = Math.max(throttle, 0.92);
      brake = Math.min(brake, 0.18);
    }

    const curvature = frameNow.tangent.clone().dot(frameFuture.tangent);
    if (curvature < 0.95 && vehicleState.speed > baseTargetSpeed * 0.95) {
      brake = Math.max(brake, 0.32 + (state.mode === "follow" ? 0.08 : 0));
      throttle = Math.min(throttle, 0.48);
    }

    steer = clamp(steer, -1, 1);
    throttle = clamp(throttle, 0, 1);
    brake = clamp(brake, 0, 1);

    state.debug = {
      mode: state.mode,
      lane: state.lane,
      targetLane: state.targetLane,
      frontDistance: Number.isFinite(traffic.frontDistance) ? traffic.frontDistance : null,
      frontRelativeSpeed: Number.isFinite(traffic.frontRelativeSpeed) ? traffic.frontRelativeSpeed : null,
      leftClearance: traffic.leftClearance,
      rightClearance: traffic.rightClearance,
      throttle,
      brake,
      steer
    };

    return {
      throttle,
      brake,
      steer,
      handbrake: false
    };
  }
}
