import type { Input } from './Schema';

export class InputManager {
    private keysPressed = new Set<string>();
    private gamepads: (Gamepad | null)[] = [];

    constructor() {
        window.addEventListener('keydown', (e) => {
            this.keysPressed.add(e.code); // Use code for physical layout (WASD)
            this.keysPressed.add(e.key);  // Use key for logical layout (Arrows)
        });

        window.addEventListener('keyup', (e) => {
            this.keysPressed.delete(e.code);
            this.keysPressed.delete(e.key);
        });

        window.addEventListener('gamepadconnected', (e) => {
            console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
                e.gamepad.index, e.gamepad.id,
                e.gamepad.buttons.length, e.gamepad.axes.length);
        });
    }

    public update() {
        // Poll gamepads
        this.gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    }

    public getInput(playerIndex: number): Input {
        const input: Input = { accel: 0, steer: 0 };

        // Player 1: Arrow Keys (Keyboard)
        if (playerIndex === 0) {
            if (this.keysPressed.has('ArrowUp')) input.accel += 1;
            if (this.keysPressed.has('ArrowDown')) input.accel -= 1;
            if (this.keysPressed.has('ArrowLeft')) input.steer -= 1;
            if (this.keysPressed.has('ArrowRight')) input.steer += 1;
        }

        // Player 2: WASD (Keyboard - Physical)
        if (playerIndex === 1) {
            if (this.keysPressed.has('KeyW')) input.accel += 1;
            if (this.keysPressed.has('KeyS')) input.accel -= 1;
            if (this.keysPressed.has('KeyA')) input.steer -= 1;
            if (this.keysPressed.has('KeyD')) input.steer += 1;
        }

        // Gamepad Fallback / Override (P3, P4, or P1/P2 if preferred)
        // For simplicity:
        // P1 uses Gamepad 0 if present (adds to keyboard input)
        // P2 uses Gamepad 1 ...
        // P3 uses Gamepad 2
        // P4 uses Gamepad 3

        const pad = this.gamepads[playerIndex];
        if (pad) {
            // Standard Gamepad Mapping
            // Axis 1 (Left Stick Y): -1 is Up usually? verify.
            // Actually Standard Gamepad: Axis 1 is Left Stick Y. Up is -1.
            // Axis 0 is Left Stick X. Left is -1.

            // Deadzone
            const DEADZONE = 0.1;

            const axisX = pad.axes[0]; // Steer
            const axisY = pad.axes[1]; // Accel (or triggers?) Let's use left stick for everything for now.

            if (Math.abs(axisY) > DEADZONE) {
                // Up (-1) -> Accel (1)
                input.accel -= axisY;
            }
            if (Math.abs(axisX) > DEADZONE) {
                input.steer += axisX;
            }

            // Triggers (often Button 6/7)
            if (pad.buttons[7] && pad.buttons[7].value > 0) input.accel += pad.buttons[7].value; // R2 Gas
            if (pad.buttons[6] && pad.buttons[6].value > 0) input.accel -= pad.buttons[6].value; // L2 Brake
        }

        // Clamp
        input.accel = Math.max(-1, Math.min(1, input.accel));
        input.steer = Math.max(-1, Math.min(1, input.steer));

        return input;
    }
}
