import type { Input } from '../shared/Schema';
import { ControlType } from '../shared/Settings';
import type { PlayerControlConfig } from '../shared/Settings';

export class InputManager {
  private keysPressed = new Set<string>();
  private gamepads: (Gamepad | null)[] = [];
  private playerConfigs: PlayerControlConfig[] = [];

  private accumulatedJustPressedKeys = new Set<string>();
  private justPressedKeys = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.keysPressed.add(e.code); // Use code for physical layout (WASD)
      this.keysPressed.add(e.key); // Use key for logical layout (Arrows)
      if (!e.repeat) {
        this.accumulatedJustPressedKeys.add(e.code);
        this.accumulatedJustPressedKeys.add(e.key);
      }
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

  private prevButtonStates: boolean[][] = [];

  public update() {
    // 1. Snapshot current buttons to prev (before getting new ones)
    for (let i = 0; i < this.gamepads.length; i++) {
      const pad = this.gamepads[i];
      if (pad) {
        this.prevButtonStates[i] = pad.buttons.map((b) => b.pressed);
      } else {
        this.prevButtonStates[i] = [];
      }
    }

    // 2. Cycle Key Presses
    this.justPressedKeys = new Set(this.accumulatedJustPressedKeys);
    this.accumulatedJustPressedKeys.clear();

    // 2. Poll new state
    this.gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  }

  public isButtonJustPressed(playerIdx: number, buttonIdx: number): boolean {
    const pad = this.gamepads[playerIdx];
    if (!pad || !pad.buttons[buttonIdx]) return false;

    const currentlyPressed = pad.buttons[buttonIdx].pressed;
    const previouslyPressed = this.prevButtonStates[playerIdx]?.[buttonIdx] || false;

    return currentlyPressed && !previouslyPressed;
  }

  public isKeyDown(code: string): boolean {
    return this.keysPressed.has(code);
  }

  public isKeyJustPressed(code: string): boolean {
    return this.justPressedKeys.has(code);
  }

  public getInput(playerIndex: number): Input {
    const input: Input = { accel: 0, steer: 0, handbrake: false };
    const config = this.playerConfigs.find((c) => c.playerId === playerIndex);

    if (!config) return input; // No config for this player slot

    switch (config.type) {
      case ControlType.WASD:
        if (this.keysPressed.has('KeyW')) input.accel += 1;
        if (this.keysPressed.has('KeyS')) input.accel -= 1;
        if (this.keysPressed.has('KeyA')) input.steer -= 1;
        if (this.keysPressed.has('KeyD')) input.steer += 1;
        if (this.keysPressed.has('KeyX')) input.handbrake = true;
        break;
      case ControlType.ARROWS:
        if (this.keysPressed.has('ArrowUp')) input.accel += 1;
        if (this.keysPressed.has('ArrowDown')) input.accel -= 1;
        if (this.keysPressed.has('ArrowLeft')) input.steer -= 1;
        if (this.keysPressed.has('ArrowRight')) input.steer += 1;
        if (this.keysPressed.has('Space')) input.handbrake = true;
        break;
      case ControlType.IJKL:
        if (this.keysPressed.has('KeyI')) input.accel += 1;
        if (this.keysPressed.has('KeyK')) input.accel -= 1;
        if (this.keysPressed.has('KeyJ')) input.steer -= 1;
        if (this.keysPressed.has('KeyL')) input.steer += 1;
        if (this.keysPressed.has('Comma')) input.handbrake = true;
        break;
      case ControlType.GAMEPAD: {
        const idx = config.gamepadIndex ?? 0;
        const pad = this.gamepads[idx];
        if (pad) {
          const DEADZONE = 0.1;
          const axisX = pad.axes[0]; // Steer

          if (Math.abs(axisX) > DEADZONE) {
            input.steer += axisX;
          }
          // Triggers
          if (pad.buttons[7] && pad.buttons[7].value > 0) input.accel += pad.buttons[7].value; // R2
          if (pad.buttons[6] && pad.buttons[6].value > 0) input.accel -= pad.buttons[6].value; // L2

          // Handbrake (Button 0 / A / Cross)
          if (pad.buttons[0] && pad.buttons[0].pressed) input.handbrake = true;
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
