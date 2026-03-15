/** @typedef {{ quality: "epic"|"high"|"medium", bloom: boolean, ssao: boolean, motionBlur: boolean, fxaa: boolean, vignette: boolean }} GraphicsConfig */
/** @typedef {{ fixedTimeStep: number, gravity: number, maxSubSteps: number, collisionDamping: number }} PhysicsConfig */
/** @typedef {{ targetSpeed: number, aggression: number, avoidDistance: number, overtakeBias: number }} AIConfig */
/** @typedef {{ lapCount: number, aiCount: number }} RaceConfig */
/** @typedef {{ steerSensitivity: number, handbrakeGripFactor: number, tractionAssist: number, absAssist: number }} ControlConfig */
/** @typedef {{ graphics: GraphicsConfig, physics: PhysicsConfig, ai: AIConfig, race: RaceConfig, controls: ControlConfig }} GameRuntimeConfig */

/** @typedef {{ id: string, name: string, lapCount: number, width: number, controlPoints: number[][], envPreset: "day"|"sunset", spawnPoints: {s:number, lane:number}[] }} RaceTrackConfig */
/** @typedef {{ id:string, mass:number, power:number, brakeForce:number, tireGrip:number, aeroDrag:number, steeringRate:number }} VehicleSpec */
/** @typedef {{ trackId:string, difficulty:"rookie"|"pro"|"legend", position:number, lapTimes:number[], bestLap:number, penalties:number }} RaceResult */

export const DIFFICULTY_PRESETS = Object.freeze({
  rookie: {
    ai: { targetSpeed: 56, aggression: 0.38, avoidDistance: 7.8, overtakeBias: 0.26 },
    controls: { steerSensitivity: 1.02, handbrakeGripFactor: 0.62, tractionAssist: 0.78, absAssist: 0.74 }
  },
  pro: {
    ai: { targetSpeed: 68, aggression: 0.58, avoidDistance: 6.4, overtakeBias: 0.54 },
    controls: { steerSensitivity: 1.0, handbrakeGripFactor: 0.56, tractionAssist: 0.52, absAssist: 0.5 }
  },
  legend: {
    ai: { targetSpeed: 78, aggression: 0.76, avoidDistance: 5.4, overtakeBias: 0.76 },
    controls: { steerSensitivity: 0.95, handbrakeGripFactor: 0.48, tractionAssist: 0.28, absAssist: 0.2 }
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
    overtakeBias: 0.54
  },
  race: {
    lapCount: 3,
    aiCount: 6
  },
  controls: {
    steerSensitivity: 1.0,
    handbrakeGripFactor: 0.56,
    tractionAssist: 0.52,
    absAssist: 0.5
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
