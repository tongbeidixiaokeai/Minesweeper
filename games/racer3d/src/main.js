import { GameRuntime } from "./game-runtime.js";
import { RuntimeDiagnostics } from "./diagnostics.js";
import { byId } from "../../../src/shared/dom.js";
import { ARCADE_MESSAGE_TYPES, isAllowedArcadeMessageOrigin, postArcadeMessage } from "../../../src/arcade/bridge.js";

const host = byId("webgl-host");
const overlayRoot = byId("race-overlay");
const menuBtn = byId("menu-btn");

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

const debugRefs = {
  panel: byId("debug-panel"),
  content: byId("debug-content")
};

const diagnostics = new RuntimeDiagnostics(260);
diagnostics.attachGlobalHandlers();
window.__racer3dDiag = diagnostics;
window.__racer3Diag = diagnostics;
let runtime = null;
try {
  if (window.parent && window.parent !== window) {
    window.parent.__racer3dDiag = diagnostics;
    window.parent.__racer3Diag = diagnostics;
  }
} catch (_err) {
  // Ignore cross-window access failures.
}

function requestParentFocus(reason) {
  try {
    if (window.parent && window.parent !== window) {
      postArcadeMessage(window.parent, { type: ARCADE_MESSAGE_TYPES.requestFocus, reason });
    }
  } catch (_err) {
    // Ignore cross-window postMessage errors.
  }
}

window.addEventListener("message", (event) => {
  if (!event || !event.data || typeof event.data !== "object") {
    return;
  }
  if (!isAllowedArcadeMessageOrigin(event.origin || "")) return;
  if (window.parent && window.parent !== window && event.source !== window.parent) return;
  if (event.data.type === ARCADE_MESSAGE_TYPES.focus) {
    try {
      window.focus();
    } catch (_err) {
      // Ignore focus failures.
    }
    diagnostics.info("focus", "received focus ping from hub");
    return;
  }
  if (event.data.type === ARCADE_MESSAGE_TYPES.keyBridge) {
    runtime?.forwardKeyEvent?.(event.data.payload || null);
    if ((event.data.payload?.phase || "") === "keydown") {
      diagnostics.info("bridge", "key down forwarded", {
        code: event.data.payload?.code || "",
        key: event.data.payload?.key || ""
      });
    }
  }
});

host.addEventListener("pointerdown", () => {
  try {
    window.focus();
  } catch (_err) {
    // Ignore focus failures.
  }
  diagnostics.info("focus", "host pointerdown focus request");
  requestParentFocus("pointerdown");
});

window.setTimeout(() => {
  try {
    window.focus();
  } catch (_err) {
    // Ignore focus failures.
  }
  requestParentFocus("boot");
}, 0);

try {
  diagnostics.info("bootstrap", "starting runtime", { href: window.location.href });
  runtime = new GameRuntime(host, hudRefs, overlayRefs, debugRefs, {
    isDev: import.meta.env.DEV,
    diagnostics,
    startWithDebug: true
  });
  window.__racer3dRuntime = runtime;
  window.__racer3Runtime = runtime;
  try {
    if (window.parent && window.parent !== window) {
      window.parent.__racer3dRuntime = runtime;
      window.parent.__racer3Runtime = runtime;
    }
  } catch (_err) {
    // Ignore cross-window access failures.
  }
  runtime.init();
  if (menuBtn) {
    menuBtn.addEventListener("click", () => {
      runtime?.setPaused?.(true, "menu-btn");
      requestParentFocus("menu-btn");
    });
  }
} catch (err) {
  console.error("[racer3d:bootstrap]", err);
  const detail = err instanceof Error ? err.message : String(err);
  diagnostics.error("bootstrap", "bootstrap failed", { detail });
  const title = overlayRefs.title;
  const body = overlayRefs.body;
  if (title) {
    title.textContent = "BOOT FAILED";
  }
  if (body) {
    body.textContent = `Bootstrap failed. Open DevTools console for details.\n${detail}`;
  }
  overlayRoot.classList.remove("is-hidden");
  if (hudRefs.state) {
    hudRefs.state.textContent = "ERROR";
  }
}
