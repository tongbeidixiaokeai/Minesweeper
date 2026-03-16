/** @typedef {{ quality: "epic"|"high"|"medium", bloom: boolean, ssao: boolean, motionBlur: boolean, fxaa: boolean, vignette: boolean }} GraphicsConfig */
/** @typedef {{ fixedTimeStep: number, gravity: number, maxSubSteps: number, collisionDamping: number }} PhysicsConfig */
/** @typedef {{ targetSpeed: number, aggression: number, avoidDistance: number, overtakeBias: number, laneChangeCooldownSec: number, laneCommitSec: number, followGap: number, overtakeTriggerGap: number, maxBrakeOnFollow: number }} AIConfig */
/** @typedef {{ lapCount: number, aiCount: number }} RaceConfig */
/** @typedef {{ steerSensitivity: number, steerMinFactor: number, steerFadeSpeed: number, throttleRise: number, throttleFall: number, brakeRise: number, brakeFall: number, handbrakeGripFactor: number, tractionAssist: number, absAssist: number, stabilityYawDamping: number }} ControlConfig */
/** @typedef {{ graphics: GraphicsConfig, physics: PhysicsConfig, ai: AIConfig, race: RaceConfig, controls: ControlConfig }} GameRuntimeConfig */

/** @typedef {{ id: string, name: string, lapCount: number, width: number, controlPoints: number[][], envPreset: "day"|"sunset", spawnPoints: {s:number, lane:number}[] }} RaceTrackConfig */
/** @typedef {{ id:string, mass:number, power:number, brakeForce:number, tireGrip:number, aeroDrag:number, steeringRate:number }} VehicleSpec */
/** @typedef {{ trackId:string, difficulty:"rookie"|"pro"|"legend", position:number, lapTimes:number[], bestLap:number, penalties:number }} RaceResult */

export const DIFFICULTY_PRESETS = Object.freeze({
  rookie: {
    ai: {
      targetSpeed: 56,
      aggression: 0.38,
      avoidDistance: 7.8,
      overtakeBias: 0.26,
      laneChangeCooldownSec: 2.4,
      laneCommitSec: 1.3,
      followGap: 9.2,
      overtakeTriggerGap: 6.4,
      maxBrakeOnFollow: 0.45
    },
    controls: {
      steerSensitivity: 1.04,
      steerMinFactor: 0.58,
      steerFadeSpeed: 105,
      throttleRise: 2.8,
      throttleFall: 4.2,
      brakeRise: 3.4,
      brakeFall: 5.0,
      handbrakeGripFactor: 0.64,
      tractionAssist: 0.84,
      absAssist: 0.82,
      stabilityYawDamping: 0.78
    }
  },
  pro: {
    ai: {
      targetSpeed: 68,
      aggression: 0.58,
      avoidDistance: 6.4,
      overtakeBias: 0.54,
      laneChangeCooldownSec: 1.8,
      laneCommitSec: 1.05,
      followGap: 7.5,
      overtakeTriggerGap: 5.2,
      maxBrakeOnFollow: 0.58
    },
    controls: {
      steerSensitivity: 1.0,
      steerMinFactor: 0.5,
      steerFadeSpeed: 118,
      throttleRise: 3.6,
      throttleFall: 4.8,
      brakeRise: 3.8,
      brakeFall: 5.4,
      handbrakeGripFactor: 0.56,
      tractionAssist: 0.58,
      absAssist: 0.56,
      stabilityYawDamping: 0.62
    }
  },
  legend: {
    ai: {
      targetSpeed: 78,
      aggression: 0.76,
      avoidDistance: 5.4,
      overtakeBias: 0.76,
      laneChangeCooldownSec: 1.25,
      laneCommitSec: 0.92,
      followGap: 6.2,
      overtakeTriggerGap: 4.4,
      maxBrakeOnFollow: 0.7
    },
    controls: {
      steerSensitivity: 0.97,
      steerMinFactor: 0.42,
      steerFadeSpeed: 132,
      throttleRise: 4.4,
      throttleFall: 5.6,
      brakeRise: 4.2,
      brakeFall: 5.8,
      handbrakeGripFactor: 0.48,
      tractionAssist: 0.34,
      absAssist: 0.28,
      stabilityYawDamping: 0.44
    }
  }
});

export const TRACKS = Object.freeze([
  {
    id: "alpine-ring",
    name: "Alpine Ring",
    lapCount: 3,
    width: 8.6,
    envPreset: "day",
    controlPoints: [
      [0, 0, 0], [28, 0, -20], [62, 0, -12], [84, 0, 18],
      [70, 0, 58], [28, 0, 82], [-20, 0, 76], [-56, 0, 44],
      [-74, 0, 6], [-56, 0, -34], [-20, 0, -54]
    ],
    spawnPoints: [
      { s: 0.02, lane: 0.0 },
      { s: 0.0, lane: -0.8 },
      { s: 0.98, lane: 0.75 },
      { s: 0.96, lane: -0.3 },
      { s: 0.94, lane: 0.35 },
      { s: 0.92, lane: -0.65 },
      { s: 0.9, lane: 0.75 }
    ]
  },
  {
    id: "coastal-strike",
    name: "Coastal Strike",
    lapCount: 3,
    width: 9.2,
    envPreset: "sunset",
    controlPoints: [
      [0, 0, 0], [36, 0, -14], [78, 0, 6], [84, 0, 46],
      [42, 0, 88], [0, 0, 100], [-46, 0, 92], [-84, 0, 50],
      [-92, 0, 10], [-70, 0, -30], [-30, 0, -54]
    ],
    spawnPoints: [
      { s: 0.03, lane: 0.0 },
      { s: 0.01, lane: -0.9 },
      { s: 0.99, lane: 0.85 },
      { s: 0.97, lane: -0.5 },
      { s: 0.95, lane: 0.45 },
      { s: 0.93, lane: -0.75 },
      { s: 0.91, lane: 0.65 }
    ]
  }
]);

export const VEHICLE_SPECS = Object.freeze({
  player: {
    id: "phoenix-x",
    mass: 1320,
    power: 11400,
    brakeForce: 14800,
    tireGrip: 36,
    aeroDrag: 4.6,
    steeringRate: 1.9
  },
  ai: {
    id: "rival-r",
    mass: 1280,
    power: 10200,
    brakeForce: 12800,
    tireGrip: 33,
    aeroDrag: 4.9,
    steeringRate: 1.72
  }
});

export const DEFAULT_CONFIG = Object.freeze({
  graphics: {
    quality: "epic",
    bloom: true,
    ssao: true,
    motionBlur: true,
    fxaa: true,
    vignette: true
  },
  physics: {
    fixedTimeStep: 1 / 120,
    gravity: -9.81,
    maxSubSteps: 3,
    collisionDamping: 0.26
  },
  ai: {
    targetSpeed: 68,
    aggression: 0.58,
    avoidDistance: 6.4,
    overtakeBias: 0.54,
    laneChangeCooldownSec: 1.8,
    laneCommitSec: 1.05,
    followGap: 7.5,
    overtakeTriggerGap: 5.2,
    maxBrakeOnFollow: 0.58
  },
  race: {
    lapCount: 3,
    aiCount: 6
  },
  controls: {
    steerSensitivity: 1.0,
    steerMinFactor: 0.5,
    steerFadeSpeed: 118,
    throttleRise: 3.6,
    throttleFall: 4.8,
    brakeRise: 3.8,
    brakeFall: 5.4,
    handbrakeGripFactor: 0.56,
    tractionAssist: 0.58,
    absAssist: 0.56,
    stabilityYawDamping: 0.62
  }
});

export const ASSET_MANIFEST = Object.freeze({
  vehicles: {
    player: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb",
    ai: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb"
  }
});

export const STORAGE_KEY = "racer3d.records.v1";

export const CHAMPIONSHIP_POINTS = Object.freeze([10, 8, 6, 5, 4, 3, 2, 1]);
