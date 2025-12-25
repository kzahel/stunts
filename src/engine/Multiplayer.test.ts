import { expect, test, describe } from 'vitest';
import { InputManager } from './Input';
import { PhysicsEngine } from './Physics';
import { createInitialState } from './Schema';
import { ControlType } from './Settings';

// Note: jsdom environment is configured in vite.config.ts, so window/document are available globally.

describe('Multiplayer Input & Physics', () => {
  test('InputManager separates P1 (Arrows) and P2 (WASD)', () => {
    const manager = new InputManager();
    manager.setConfig([
      { playerId: 0, type: ControlType.ARROWS },
      { playerId: 1, type: ControlType.WASD },
    ]);

    // Emulate Key Press for P1
    const eventUp = new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp' });
    window.dispatchEvent(eventUp);

    // Check P1
    let p1Input = manager.getInput(0);
    expect(p1Input.accel).toBe(1);

    // Check P2 (should be 0)
    let p2Input = manager.getInput(1);
    expect(p2Input.accel).toBe(0);

    // Emulate Key Press for P2
    const eventW = new KeyboardEvent('keydown', { key: 'w', code: 'KeyW' });
    window.dispatchEvent(eventW);

    // Check P2
    p2Input = manager.getInput(1);
    expect(p2Input.accel).toBe(1);

    // P1 should still be 1 (ArrowUp is still 'pressed' in our Set)
    p1Input = manager.getInput(0);
    expect(p1Input.accel).toBe(1);

    // Release P1
    const eventUpRel = new KeyboardEvent('keyup', { key: 'ArrowUp', code: 'ArrowUp' });
    window.dispatchEvent(eventUpRel);
    p1Input = manager.getInput(0);
    expect(p1Input.accel).toBe(0);
  });

  test('Physics updates correct player', () => {
    const physics = new PhysicsEngine();
    const state = createInitialState(2);

    // P1 Idle, P2 Accelerating
    const inputs = [
      { accel: 0, steer: 0 },
      { accel: 1, steer: 0 },
    ];

    const nextState = physics.step(state, inputs, 0.1);

    // P1 should not move
    expect(nextState.players[0].position.x).toBe(0);
    expect(nextState.players[0].position.y).toBe(0);

    // P2 should move (accel -> velocity -> position)
    // 0.1s update:
    // accel = 1 * 20 = 20
    // speed = 20 * 0.1 = 2
    // drag = 2 * (1 - 0.05) = 1.9
    // pos += 1.9 * 0.1 = 0.19
    expect(nextState.players[1].velocity.x).toBeGreaterThan(0);
    expect(nextState.players[1].position.x).toBeGreaterThan(0);
  });
});
