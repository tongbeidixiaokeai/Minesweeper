export class VehicleController {
  constructor(config) {
    this.config = config;
    this.keys = new Set();
    this.bindings = {
      left: ["ArrowLeft", "a", "A"],
      right: ["ArrowRight", "d", "D"],
      throttle: ["ArrowUp", "w", "W"],
      brake: ["ArrowDown", "s", "S"],
      handbrake: [" "]
    };
  }

  bindInput(onSpecialKey) {
    window.addEventListener("keydown", (event) => {
      if (["r", "R", "t", "T", "1", "2", "3", "Enter"].includes(event.key)) {
        onSpecialKey(event.key);
      }
      this.keys.add(event.key);
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key)) {
        event.preventDefault();
      }
    });

    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.key);
    });

    window.addEventListener("blur", () => {
      this.keys.clear();
    });
  }

  isPressed(list) {
    return list.some((key) => this.keys.has(key));
  }

  updateAssistConfig(config) {
    this.config = config;
  }

  getPlayerInput(vehicleState) {
    const steerLeft = this.isPressed(this.bindings.left);
    const steerRight = this.isPressed(this.bindings.right);
    const throttle = this.isPressed(this.bindings.throttle) ? 1 : 0;
    const brake = this.isPressed(this.bindings.brake) ? 1 : 0;
    const handbrake = this.isPressed(this.bindings.handbrake);

    let steer = 0;
    if (steerLeft) {
      steer -= this.config.steerSensitivity;
    }
    if (steerRight) {
      steer += this.config.steerSensitivity;
    }

    const speed = vehicleState ? vehicleState.speed : 0;
    const speedFactor = Math.max(0.4, 1 - speed / 120);
    steer *= speedFactor;

    return {
      throttle,
      brake,
      steer,
      handbrake,
      tractionAssist: this.config.tractionAssist,
      absAssist: this.config.absAssist,
      handbrakeGripFactor: this.config.handbrakeGripFactor
    };
  }
}
