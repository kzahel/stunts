import type { Input } from '../shared/Schema';
import { ControlType } from '../shared/Settings';
import type { PlayerControlConfig } from '../shared/Settings';

export class InputManager {
  private keysPressed = new Set<string>();
  private gamepads: (Gamepad | null)[] = [];
  private playerConfigs: PlayerControlConfig[] = [];

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.keysPressed.add(e.code); // Use code for physical layout (WASD)
      this.keysPressed.add(e.key); // Use key for logical layout (Arrows)
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed.delete(e.code);
      this.keysPressed.delete(e.key);
    });

    window.addEventListener('gamepadconnected', (e) => {
      console.log(
        'Gamepad connected at index %d: %s. %d buttons, %d axes.',
        e.gamepad.index,
        e.gamepad.id,
        e.gamepad.buttons.length,
        e.gamepad.axes.length,
      );
    });
  }

  public setConfig(configs: PlayerControlConfig[]) {
    this.playerConfigs = configs;
  }

  public update() {
    // Poll gamepads
    this.gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  }

  public getInput(playerIndex: number): Input {
    const input: Input = { accel: 0, steer: 0 };
    const config = this.playerConfigs.find((c) => c.playerId === playerIndex);

    if (!config) return input; // No config for this player slot

    switch (config.type) {
      case ControlType.WASD:
        if (this.keysPressed.has('KeyW')) input.accel += 1;
        if (this.keysPressed.has('KeyS')) input.accel -= 1;
        if (this.keysPressed.has('KeyA')) input.steer -= 1;
        if (this.keysPressed.has('KeyD')) input.steer += 1;
        break;
      case ControlType.ARROWS:
        if (this.keysPressed.has('ArrowUp')) input.accel += 1;
        if (this.keysPressed.has('ArrowDown')) input.accel -= 1;
        if (this.keysPressed.has('ArrowLeft')) input.steer -= 1;
        if (this.keysPressed.has('ArrowRight')) input.steer += 1;
        break;
      case ControlType.GAMEPAD: {
        const idx = config.gamepadIndex ?? 0;
        const pad = this.gamepads[idx];
        if (pad) {
          const DEADZONE = 0.1;
          const axisX = pad.axes[0]; // Steer
          const axisY = pad.axes[1]; // Accel (-1 is Up)

          if (Math.abs(axisY) > DEADZONE) {
            input.accel -= axisY;
          }
          if (Math.abs(axisX) > DEADZONE) {
            input.steer += axisX;
          }
          // Triggers
          if (pad.buttons[7] && pad.buttons[7].value > 0) input.accel += pad.buttons[7].value; // R2
          if (pad.buttons[6] && pad.buttons[6].value > 0) input.accel -= pad.buttons[6].value; // L2
        }
        break;
      }
    }

    // Clamp
    input.accel = Math.max(-1, Math.min(1, input.accel));
    input.steer = Math.max(-1, Math.min(1, input.steer));

    return input;
  }
}
