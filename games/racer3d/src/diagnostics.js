function nowStamp() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function metaToText(meta) {
  if (!meta || typeof meta !== "object") {
    return "";
  }
  const parts = [];
  Object.entries(meta).forEach(([k, v]) => {
    if (v == null) {
      return;
    }
    if (typeof v === "number") {
      parts.push(`${k}=${Number.isFinite(v) ? v.toFixed(3).replace(/\.?0+$/, "") : String(v)}`);
      return;
    }
    parts.push(`${k}=${String(v)}`);
  });
  return parts.join(" ");
}

export class RuntimeDiagnostics {
  constructor(maxEntries = 220) {
    this.maxEntries = Math.max(40, maxEntries);
    this.entries = [];
    this.state = {
      phase: "unknown",
      focus: "unknown"
    };
    this.onUpdate = null;
    this.globalHandlersBound = false;
  }

  setOnUpdate(handler) {
    this.onUpdate = typeof handler === "function" ? handler : null;
  }

  setState(key, value) {
    this.state[key] = value;
    this.notify();
  }

  info(scope, message, meta = null) {
    this.push("INFO", scope, message, meta);
  }

  warn(scope, message, meta = null) {
    this.push("WARN", scope, message, meta);
  }

  error(scope, message, meta = null) {
    this.push("ERROR", scope, message, meta);
  }

  push(level, scope, message, meta = null) {
    this.entries.push({
      ts: nowStamp(),
      level,
      scope,
      message,
      meta
    });
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
    this.notify();
  }

  notify() {
    if (this.onUpdate) {
      this.onUpdate(this);
    }
  }

  attachGlobalHandlers() {
    if (this.globalHandlersBound) {
      return;
    }
    this.globalHandlersBound = true;

    window.addEventListener("error", (event) => {
      this.error("window", event.message || "Unhandled error", {
        file: event.filename || "",
        line: event.lineno || 0,
        col: event.colno || 0
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      const reasonText = reason instanceof Error ? reason.message : String(reason);
      this.error("promise", `Unhandled rejection: ${reasonText}`);
    });

    window.addEventListener("focus", () => this.setState("focus", "focused"));
    window.addEventListener("blur", () => this.setState("focus", "blurred"));
    this.setState("focus", document.hasFocus() ? "focused" : "blurred");
  }

  renderText(maxLines = 10) {
    const lines = [];
    lines.push(`state phase=${this.state.phase || "unknown"} focus=${this.state.focus || "unknown"}`);
    const tail = this.entries.slice(-Math.max(1, maxLines));
    tail.forEach((entry) => {
      const metaText = metaToText(entry.meta);
      lines.push(`[${entry.ts}] ${entry.level} ${entry.scope}: ${entry.message}${metaText ? ` | ${metaText}` : ""}`);
    });
    return lines.join("\n");
  }
}

