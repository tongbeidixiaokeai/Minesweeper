import { postArcadeMessage, shouldBridgeKey, toKeyBridgePayload, isAllowedArcadeMessageOrigin, ARCADE_MESSAGE_TYPES } from "./arcade/bridge.js";
import { byId } from "./shared/dom.js";

(function () {
  "use strict";

  const STORAGE_KEY = "arcade.lastGame.v1";

  const GAMES = [
    {
      id: "minesweeper",
      title: "扫雷",
      desc: "经典扫雷，支持缩放、高对比、防误触。",
      path: "./games/minesweeper/index.html"
    },
    {
      id: "racer3d",
      title: "3D 赛车",
      desc: "伪 3D 赛道冲刺，方向键/WASD 操作。",
      path: "./games/racer3d/index.html"
    }
  ];

  function getSavedGameId() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) || "";
    } catch (_err) {
      return "";
    }
  }

  function saveGameId(id) {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch (_err) {
      // Ignore private mode write failures.
    }
  }

  class ArcadeHub {
    constructor() {
      this.selectorEl = byId("game-selector");
      this.titleEl = byId("game-title");
      this.descEl = byId("game-desc");
      this.frameEl = byId("game-frame");
      this.currentGameId = "";

      if (!this.selectorEl || !this.titleEl || !this.descEl || !this.frameEl) {
        throw new Error("Arcade hub layout is incomplete.");
      }
      this.frameEl.setAttribute("tabindex", "0");
      this.frameEl.addEventListener("load", () => this.focusGameFrame());
      this.frameEl.addEventListener("pointerdown", () => this.focusGameFrame());

      this.renderGameSelector();

      const saved = getSavedGameId();
      const initial = GAMES.find((item) => item.id === saved) || GAMES[0];
      this.openGame(initial.id);

      window.addEventListener("message", (event) => {
        if (!event || !event.data || typeof event.data !== "object") {
          return;
        }
        if (event.data.type === ARCADE_MESSAGE_TYPES.requestFocus) {
          if (!isAllowedArcadeMessageOrigin(event.origin || "")) return;
          if (this.frameEl.contentWindow && event.source !== this.frameEl.contentWindow) return;
          this.focusGameFrame();
        }
      });

      window.addEventListener("keydown", (event) => {
        if (this.currentGameId === "racer3d" && shouldBridgeKey(event)) {
          postArcadeMessage(this.frameEl.contentWindow, {
            type: ARCADE_MESSAGE_TYPES.keyBridge,
            payload: toKeyBridgePayload(event, "keydown")
          });
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Escape"].includes(event.key) || ["Space", "Escape"].includes(event.code)) {
            event.preventDefault();
          }
        }
        if (event.key === "1") {
          this.openGame("minesweeper");
        } else if (event.key === "2") {
          this.openGame("racer3d");
        }
      });

      window.addEventListener("keyup", (event) => {
        if (this.currentGameId === "racer3d" && shouldBridgeKey(event)) {
          postArcadeMessage(this.frameEl.contentWindow, {
            type: ARCADE_MESSAGE_TYPES.keyBridge,
            payload: toKeyBridgePayload(event, "keyup")
          });
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Escape"].includes(event.key) || ["Space", "Escape"].includes(event.code)) {
            event.preventDefault();
          }
        }
      });
    }

    focusGameFrame() {
      try {
        this.frameEl.contentWindow?.focus();
        postArcadeMessage(this.frameEl.contentWindow, { type: ARCADE_MESSAGE_TYPES.focus });
      } catch (_err) {
        // Ignore cross-window focus failures.
      }
      this.frameEl.focus();
    }

    renderGameSelector() {
      this.selectorEl.innerHTML = "";
      for (let i = 0; i < GAMES.length; i += 1) {
        const game = GAMES[i];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "game-option";
        btn.dataset.game = game.id;
        btn.setAttribute("role", "option");
        btn.innerHTML = `<span class="game-option-title">${game.title}</span><span class="game-option-desc">${game.desc}</span>`;
        btn.addEventListener("click", () => this.openGame(game.id));
        this.selectorEl.appendChild(btn);
      }
    }

    openGame(gameId) {
      const target = GAMES.find((item) => item.id === gameId);
      if (!target) {
        return;
      }
      if (this.currentGameId === target.id) {
        this.focusGameFrame();
        return;
      }

      this.currentGameId = target.id;
      this.titleEl.textContent = target.title;
      this.descEl.textContent = target.desc;
      this.frameEl.src = target.path;
      saveGameId(target.id);
      window.setTimeout(() => this.focusGameFrame(), 0);

      const options = this.selectorEl.querySelectorAll(".game-option");
      for (let i = 0; i < options.length; i += 1) {
        const option = options[i];
        const active = option.dataset.game === target.id;
        option.classList.toggle("is-active", active);
        option.setAttribute("aria-selected", active ? "true" : "false");
      }
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    new ArcadeHub();
  });
})();
