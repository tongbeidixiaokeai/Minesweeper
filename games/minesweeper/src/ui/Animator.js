export class Animator {
  constructor(boardShell, boardEl) {
    this.boardShell = boardShell;
    this.boardEl = boardEl;
    this.queue = [];
    this.rafId = 0;
    this.cleanupTimers = new Set();
  }

  schedule(task) {
    this.queue.push(task);
    if (this.rafId !== 0) {
      return;
    }
    this.rafId = window.requestAnimationFrame(() => {
      const tasks = this.queue.splice(0, this.queue.length);
      this.rafId = 0;
      for (let i = 0; i < tasks.length; i += 1) {
        tasks[i]();
      }
    });
  }

  animateReveal(cellEl, depth) {
    if (typeof cellEl.animate !== "function") {
      return;
    }
    cellEl.animate(
      [
        { transform: "scale(0.95)", filter: "brightness(1.07)" },
        { transform: "scale(1)", filter: "brightness(1)" }
      ],
      {
        duration: 240,
        delay: Math.min(220, depth * 16),
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both"
      }
    );
  }

  animateFlag(cellEl) {
    if (typeof cellEl.animate !== "function") {
      return;
    }
    cellEl.animate(
      [
        { transform: "scale(0.9)" },
        { transform: "scale(1.08)" },
        { transform: "scale(1)" }
      ],
      {
        duration: 150,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    );
  }

  animateChordPulse(cellEl) {
    if (typeof cellEl.animate !== "function") {
      return;
    }
    cellEl.animate(
      [
        { transform: "scale(1)", filter: "brightness(1)" },
        { transform: "scale(1.08)", filter: "brightness(1.08)" },
        { transform: "scale(1)", filter: "brightness(1)" }
      ],
      {
        duration: 180,
        delay: 0,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    );
  }

  animateExplosion(cellEl) {
    if (typeof cellEl.animate !== "function") {
      return;
    }
    cellEl.animate(
      [
        { transform: "scale(0.94)" },
        { transform: "scale(1.06)" },
        { transform: "scale(1)" }
      ],
      {
        duration: 320,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    );
  }

  animateWin() {
    this.boardShell.classList.remove("is-losing");
    this.boardShell.classList.add("is-winning");
    this.boardEl.classList.add("is-won");

    const timer = window.setTimeout(() => {
      this.boardShell.classList.remove("is-winning");
      this.cleanupTimers.delete(timer);
    }, 1280);
    this.cleanupTimers.add(timer);

    if (typeof this.boardEl.animate === "function") {
      this.boardEl.animate(
        [
          { transform: "translateY(0)" },
          { transform: "translateY(-4px)" },
          { transform: "translateY(-3px)" }
        ],
        {
          duration: 320,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both"
        }
      );
    }
  }

  animateLoss() {
    this.boardEl.classList.remove("is-won");
    this.boardShell.classList.remove("is-winning");
    this.boardShell.classList.add("is-losing");

    const timer = window.setTimeout(() => {
      this.boardShell.classList.remove("is-losing");
      this.cleanupTimers.delete(timer);
    }, 420);
    this.cleanupTimers.add(timer);
  }

  resetBoardEffects() {
    this.boardShell.classList.remove("is-winning", "is-losing");
    this.boardEl.classList.remove("is-won");
  }

  destroy() {
    if (this.rafId !== 0) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.queue = [];
    this.cleanupTimers.forEach((timer) => window.clearTimeout(timer));
    this.cleanupTimers.clear();
  }
}

