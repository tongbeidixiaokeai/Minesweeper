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

  function byId(id) {
    return document.getElementById(id);
  }

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

      this.renderGameSelector();

      const saved = getSavedGameId();
      const initial = GAMES.find((item) => item.id === saved) || GAMES[0];
      this.openGame(initial.id);

      window.addEventListener("keydown", (event) => {
        if (event.key === "1") {
          this.openGame("minesweeper");
        } else if (event.key === "2") {
          this.openGame("racer3d");
        }
      });
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
        return;
      }

      this.currentGameId = target.id;
      this.titleEl.textContent = target.title;
      this.descEl.textContent = target.desc;
      this.frameEl.src = target.path;
      saveGameId(target.id);

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
