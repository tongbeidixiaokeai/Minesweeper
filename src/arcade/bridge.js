export const ARCADE_MESSAGE_TYPES = Object.freeze({
  focus: "arcade-focus",
  requestFocus: "arcade-request-focus",
  keyBridge: "arcade-key-bridge"
});

export function getArcadeTargetOrigin() {
  const origin = String(window.location?.origin || "");
  if (!origin || origin === "null") return "*";
  return origin;
}

export function isAllowedArcadeMessageOrigin(eventOrigin) {
  const target = getArcadeTargetOrigin();
  if (target === "*") return true;
  return eventOrigin === target;
}

export function postArcadeMessage(targetWindow, data) {
  try {
    targetWindow?.postMessage?.(data, getArcadeTargetOrigin());
    return true;
  } catch (_err) {
    return false;
  }
}

export function shouldBridgeKey(event) {
  const key = event?.key || "";
  const code = event?.code || "";
  if (key.startsWith("Arrow")) return true;
  if ([" ", "Enter", "F3", "r", "R", "t", "T", "1", "2", "3", "w", "W", "a", "A", "s", "S", "d", "D", "Escape"].includes(key)) return true;
  if (["Space", "Enter", "F3", "KeyW", "KeyA", "KeyS", "KeyD", "KeyR", "KeyT", "Digit1", "Digit2", "Digit3", "Escape"].includes(code)) return true;
  return false;
}

export function toKeyBridgePayload(domEvent, phase) {
  return {
    phase,
    key: domEvent?.key || "",
    code: domEvent?.code || "",
    repeat: Boolean(domEvent?.repeat)
  };
}

