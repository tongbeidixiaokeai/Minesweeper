import RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsSystem {
  constructor(config) {
    this.config = config;
    this.world = null;
    this.RAPIER = null;
    this.accumulator = 0;
    this.entities = new Map();
  }

  async init() {
    await RAPIER.init();
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: this.config.gravity, z: 0 });

    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.2, 0));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(400, 0.2, 400).setFriction(1.1), ground);
  }

  createVehicleBody(id, spec, position, isPlayer) {
    const R = this.RAPIER;
    const rb = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(0.15)
        .setAngularDamping(2.6)
        .setEnabledRotations(false, true, false)
    );
    const collider = this.world.createCollider(
      R.ColliderDesc.cuboid(0.82, 0.45, 1.6)
        .setMass(spec.mass)
        .setRestitution(0.04)
        .setFriction(1.45),
      rb
    );

    this.entities.set(id, {
      id,
      body: rb,
      collider,
      spec,
      isPlayer,
      input: { throttle: 0, brake: 0, steer: 0, handbrake: false }
    });

    return rb;
  }

  setInput(id, input) {
    const vehicle = this.entities.get(id);
    if (!vehicle) {
      return;
    }
    vehicle.input = { ...vehicle.input, ...input };
  }

  applyVehicleDynamics(vehicle, dt) {
    const body = vehicle.body;
    const spec = vehicle.spec;
    const input = vehicle.input;

    const position = body.translation();
    const yaw = this.quaternionToYaw(body.rotation());
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    const vel = body.linvel();
    const longVel = vel.x * forwardX + vel.z * forwardZ;
    const latVel = vel.x * rightX + vel.z * rightZ;

    const engine = input.throttle * spec.power;
    const brakeForce = input.brake * spec.brakeForce * (longVel > 0 ? 1 : 0.6);
    const drag = spec.aeroDrag * longVel * Math.abs(longVel);

    let force = engine - brakeForce - drag;
    if (input.handbrake) {
      force *= 0.72;
    }

    const assistFactor = vehicle.isPlayer ? 0.9 : 0.82;
    const targetLatReduction = -latVel * spec.tireGrip * assistFactor * (input.handbrake ? 0.45 : 1.0);

    const accelX = (force * forwardX + targetLatReduction * rightX) / Math.max(1, spec.mass);
    const accelZ = (force * forwardZ + targetLatReduction * rightZ) / Math.max(1, spec.mass);

    const nextVelX = vel.x + accelX * dt;
    const nextVelZ = vel.z + accelZ * dt;
    body.setLinvel({ x: nextVelX, y: vel.y, z: nextVelZ }, true);

    const steerEffect = input.steer * spec.steeringRate * (Math.min(1.3, Math.max(0.12, Math.abs(longVel) / 20)));
    const driftGain = input.handbrake ? 1.45 : 1;
    const yawRate = steerEffect * driftGain;
    body.setAngvel({ x: 0, y: yawRate, z: 0 }, true);

    const nextYaw = yaw + yawRate * dt;
    body.setRotation({ x: 0, y: Math.sin(nextYaw / 2), z: 0, w: Math.cos(nextYaw / 2) }, true);

    if (position.y < -2 || Number.isNaN(position.x) || Number.isNaN(position.z)) {
      body.setTranslation({ x: 0, y: 0.35, z: 0 }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  step(deltaSeconds) {
    if (!this.world) {
      return;
    }

    const dt = this.config.fixedTimeStep;
    this.accumulator += Math.min(0.05, deltaSeconds);

    let steps = 0;
    while (this.accumulator >= dt && steps < this.config.maxSubSteps) {
      this.entities.forEach((vehicle) => this.applyVehicleDynamics(vehicle, dt));
      this.world.timestep = dt;
      this.world.step();
      this.accumulator -= dt;
      steps += 1;
    }
  }

  getVehicleState(id) {
    const entity = this.entities.get(id);
    if (!entity) {
      return null;
    }
    const t = entity.body.translation();
    const v = entity.body.linvel();
    const yaw = this.quaternionToYaw(entity.body.rotation());
    return {
      id,
      position: { x: t.x, y: t.y, z: t.z },
      velocity: { x: v.x, y: v.y, z: v.z },
      speed: Math.hypot(v.x, v.z),
      yaw
    };
  }

  setVehicleTransform(id, transform) {
    const entity = this.entities.get(id);
    if (!entity) {
      return;
    }
    entity.body.setTranslation(transform.position, true);
    entity.body.setLinvel(transform.velocity || { x: 0, y: 0, z: 0 }, true);
    const yaw = transform.yaw || 0;
    entity.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    entity.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  quaternionToYaw(q) {
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
  }
}
