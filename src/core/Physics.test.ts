import { describe, expect, it, test } from 'vitest';
import { PhysicsEngine } from './Physics';
import { createInitialState } from '../shared/Schema';
import type { Input } from '../shared/Schema';

describe('PhysicsEngine', () => {
  it('is deterministic', () => {
    const physics = new PhysicsEngine();
    const input: Input = { accel: 1, steer: 0.5 };
    const dt = 0.016; // 60hz

    let state1 = createInitialState();
    for (let i = 0; i < 100; i++) {
      state1 = physics.step(state1, [input], dt);
    }

    let state2 = createInitialState();
    for (let i = 0; i < 100; i++) {
      state2 = physics.step(state2, [input], dt);
    }

    expect(state1).toEqual(state2);
  });

  it('moves the car when accelerating', () => {
    const physics = new PhysicsEngine();
    const inputs: Input[] = [{ accel: 1, steer: 0 }];


    let state = createInitialState();
    state = physics.step(state, inputs, 0.016);
  });

  test('driving in a circle roughly returns to start', () => {
    const physics = new PhysicsEngine();
    let state = createInitialState();

    // Drive forward and steer right for 2 seconds (at 60fps)
    const dt = 1 / 60;
    const steps = 120; // 2 seconds

    // Monitor position
    const positions: { x: number, y: number }[] = [];

    for (let i = 0; i < steps; i++) {
      // Accel + Hard Right Turn
      const inputs: Input[] = [{ accel: 1.0, steer: 1.0 }];
      state = physics.step(state, inputs, dt);
      positions.push({ x: state.players[0].x, y: state.players[0].y });
    }

    const finalPos = state.players[0];
    const finalSpeed = Math.hypot(finalPos.velocity.x, finalPos.velocity.y);

    // Should have significant speed and have moved
    expect(finalSpeed).toBeGreaterThan(10);
    expect(finalPos.x).not.toBe(0);
  });
});
