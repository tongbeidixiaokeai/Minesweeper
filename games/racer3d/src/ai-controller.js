function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
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
      progressHint: 0,
      randomTimer: 1 + Math.random() * 3
    });
  }

  unregisterAll() {
    this.aiState.clear();
  }

  buildInput(id, vehicleState, context) {
    const state = this.aiState.get(id);
    if (!state || !vehicleState) {
      return { throttle: 0, brake: 1, steer: 0, handbrake: false };
    }

    state.randomTimer -= context.dt;
    if (state.randomTimer <= 0) {
      const laneShift = (Math.random() - 0.5) * this.config.overtakeBias;
      state.targetLane = clamp(state.laneBias + laneShift, -0.95, 0.95);
      state.randomTimer = 1.2 + Math.random() * 2.4;
    }

    const nearestS = context.progressByVehicle.get(id) || 0;
    const lookAhead = 0.008 + Math.min(0.03, vehicleState.speed / 2200);
    const frameNow = context.renderer.getTrackFrameAtS(nearestS);
    const frameFuture = context.renderer.getTrackFrameAtS(nearestS + lookAhead);

    const target = frameFuture.point.clone().addScaledVector(frameFuture.right, state.targetLane * context.track.width * 0.34);
    const toTargetX = target.x - vehicleState.position.x;
    const toTargetZ = target.z - vehicleState.position.z;

    const desiredYaw = Math.atan2(toTargetX, toTargetZ);
    let yawError = desiredYaw - vehicleState.yaw;
    while (yawError > Math.PI) yawError -= Math.PI * 2;
    while (yawError < -Math.PI) yawError += Math.PI * 2;

    let steer = clamp(yawError * (1.6 + this.config.aggression * 0.8), -1, 1);

    const nearestObstacle = context.findNearestVehicleDistance(id);
    let throttle = 1;
    let brake = 0;

    const targetSpeed = this.config.targetSpeed + (state.targetLane * 2.4);
    if (vehicleState.speed > targetSpeed) {
      throttle = 0.24;
      brake = 0.25;
    }

    if (nearestObstacle < this.config.avoidDistance) {
      throttle = 0.05;
      brake = 0.62;
      steer += (Math.random() > 0.5 ? 1 : -1) * 0.2;
    }

    const curvature = frameNow.tangent.clone().dot(frameFuture.tangent);
    if (curvature < 0.95 && vehicleState.speed > targetSpeed * 0.95) {
      brake = Math.max(brake, 0.35);
      throttle = Math.min(throttle, 0.38);
    }

    steer = clamp(steer, -1, 1);

    return {
      throttle,
      brake,
      steer,
      handbrake: false
    };
  }
}
