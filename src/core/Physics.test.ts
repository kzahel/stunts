import { describe, it, expect } from 'vitest';
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
    const input: Input = { accel: 1, steer: 0 };
    const dt = 1.0;

    let state = createInitialState();
    state = physics.step(state, [input], dt);

    expect(state.players[0].velocity.x).toBeGreaterThan(0);
    expect(state.players[0].position.x).toBeGreaterThan(0);
  });
});
