import { GameRuntime } from "./game-runtime.js";

function byId(id) {
  return document.getElementById(id);
}

const host = byId("webgl-host");
const overlayRoot = byId("race-overlay");

if (!host || !overlayRoot) {
  throw new Error("Racer root layout is incomplete.");
}

const hudRefs = {
  speed: byId("speed"),
  lap: byId("lap"),
  position: byId("position"),
  track: byId("track"),
  difficulty: byId("difficulty"),
  bestLap: byId("best-lap"),
  state: byId("state")
};

const overlayRefs = {
  root: overlayRoot,
  title: byId("overlay-title"),
  body: byId("overlay-body")
};

const runtime = new GameRuntime(host, hudRefs, overlayRefs);
runtime.init();
