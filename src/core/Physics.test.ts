import { describe, expect, it, test } from 'vitest';
import { PhysicsEngine } from './Physics';
import { createInitialState } from '../shared/Schema';
import { Track, TileType } from '../shared/Track';
import type { Input } from '../shared/Schema';

describe('PhysicsEngine', () => {
  it('is deterministic', () => {
    const physics = new PhysicsEngine();
    const input: Input = { accel: 1, steer: 0.5, handbrake: false };
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
    const inputs: Input[] = [{ accel: 1, steer: 0, handbrake: false }];

    let state = createInitialState();
    state = physics.step(state, inputs, 0.016);

    // Should start picking up speed
    const speed = Math.hypot(state.players[0].velocity.x, state.players[0].velocity.y);
    expect(speed).toBeGreaterThan(0);
  });

  test('driving on grass is slower/has less grip than road', () => {
    const physics = new PhysicsEngine();
    const dt = 1 / 60;

    // Setup Grass Track
    const grassTrack = new Track(); // Default is grass

    // Setup Road Track (fill with road)
    const roadTrack = new Track();
    for (let x = 0; x < 30; x++) {
      for (let y = 0; y < 30; y++) {
        roadTrack.setTile(x, y, TileType.Road);
      }
    }

    // Simulate Road
    let stateRoad = createInitialState();
    // Move to 15,15 to be safe
    stateRoad.players[0].x = 15;
    stateRoad.players[0].y = 15;

    // Simulate Grass
    let stateGrass = createInitialState();
    stateGrass.players[0].x = 15;
    stateGrass.players[0].y = 15;

    const input: Input = { accel: 1, steer: 0, handbrake: false }; // Drag Race

    for (let i = 0; i < 60; i++) {
      stateRoad = physics.step(stateRoad, [input], dt, roadTrack);
      stateGrass = physics.step(stateGrass, [input], dt, grassTrack);
    }

    const speedRoad = Math.hypot(stateRoad.players[0].velocity.x, stateRoad.players[0].velocity.y);
    const speedGrass = Math.hypot(
      stateGrass.players[0].velocity.x,
      stateGrass.players[0].velocity.y,
    );

    // Road should allow faster acceleration / better cornering maintenance
    expect(speedRoad).toBeGreaterThan(speedGrass);
  });

  test('handbrake induces sliding (rotation)', () => {
    const physics = new PhysicsEngine();
    const dt = 1 / 60;

    let stateNormal = createInitialState();
    let stateHandbrake = createInitialState();

    // Get some speed first
    const runUp: Input = { accel: 1, steer: 0, handbrake: false };
    for (let i = 0; i < 60; i++) {
      stateNormal = physics.step(stateNormal, [runUp], dt);
      stateHandbrake = physics.step(stateHandbrake, [runUp], dt);
    }

    // Now Turn
    const turnInput: Input = { accel: 0, steer: 1, handbrake: false };
    const turnHandbrake: Input = { accel: 0, steer: 1, handbrake: true };

    for (let i = 0; i < 30; i++) {
      stateNormal = physics.step(stateNormal, [turnInput], dt);
      stateHandbrake = physics.step(stateHandbrake, [turnHandbrake], dt);
    }

    // Handbrake should rotate MORE (slide) than normal grip turning which might understeer or be stable
    // Actually with RWD normal might oversteer too, but handbrake locks rear so it should slide out faster initially?
    // Or at least show a difference.

    // Handbrake should Cause SKIDDING flag and slow down (braking)
    expect(stateHandbrake.players[0].skidding).toBe(true);

    // Check it stopped/slowed
    const speedNormal = Math.hypot(
      stateNormal.players[0].velocity.x,
      stateNormal.players[0].velocity.y,
    );
    const speedHandbrake = Math.hypot(
      stateHandbrake.players[0].velocity.x,
      stateHandbrake.players[0].velocity.y,
    );

    expect(speedHandbrake).toBeLessThan(speedNormal);
  });

  test('gravity drops the car', () => {
    const physics = new PhysicsEngine();
    let state = createInitialState();
    state.players[0].z = 10; // Start high
    state.players[0].vz = 0;

    // Step
    state = physics.step(state, [{ accel: 0, steer: 0, handbrake: false }], 0.1);

    // Should fall
    expect(state.players[0].z).toBeLessThan(10);
    expect(state.players[0].vz).toBeLessThan(0);
  });

  test('suspension holds the car up', () => {
    const physics = new PhysicsEngine();
    let state = createInitialState();
    // Start slightly above ground but close enough for suspension (Ground is 0)
    // Rest length 0.6. Wheel radius 0.35. Total ~0.95.
    // Start at 0.5.
    state.players[0].z = 0.5;
    state.players[0].x = 10; // On infinite flat plane (no track provided = 0 height?)
    // Wait, getHeightAt checks track. If no track, returns 0.

    const dt = 0.016;
    for (let i = 0; i < 60; i++) {
      state = physics.step(state, [{ accel: 0, steer: 0, handbrake: false }], dt);
    }

    // Should not fall through floor (z < 0) heavily, should bounce back up
    // Eventually settle around Rest Height - Sag.
    // Sag was calc to be 0.15m -> Target ~0.8m?
    expect(state.players[0].z).toBeGreaterThan(0.2);
  });
});
