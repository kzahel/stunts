# Stunts Remake Engine - Core Design & Requirements

**[Play Online](https://kyle.graehl.org/stunts)**

This document outlines the architectural pillars for the Stunts browser remake. Future development must strictly adhere to these constraints to ensure robust support for replays, ghosts, and multiplayer.

## 1. Core Pillars

### 1 DETERMINISM IS PARAMOUNT
The physics engine **must** be 100% deterministic.
- **Same Initial State + Same Input Sequence = Exact Same Final State.**
- Avoid floating-point non-determinism where possible (though in the same JS engine environment, standard `number` is usually consistent).
- **Prohibited**: Using `Math.random()` inside the simulation step. Use a seeded PRNG if randomness is needed.
- **Prohibited**: Using `Date.now()` or variable `dt` inside the simulation step. Physics **always** steps by a fixed constant (e.g. `1/60`s).

### 2. REPLAY-FIRST ARCHITECTURE
The entire game is built around the concept of "Input Logging".
- We do not record "video"; we record **Inputs** per tick.
- **Ghost Replays**: To race against a ghost, we simply instantiate a second (simulated-only) physics body and feed it the recorded inputs from a previous run.
- **Rewind/Resume**: To rewind, we restore a checkpoint and re-sim forward to the desired tick.

### 3. DECOUPLED RENDERING (Interpolation)
The Physics and Rendering loops are decoupled.
- **Physics**: Fixed Timestep (e.g. 60Hz or 120Hz). Logic resides in `PhysicsEngine.step()`.
- **Rendering**: Variable Timestep (VSync). Logic resides in `Renderer.render()`.
- **Interpolation**: The renderer **must not** just draw the current physics state. It receives an `alpha` factor (0.0 to 1.0) representing "how far between the previous tick and the current tick we are."
  - Verified visual smoothness depends on this.
  - Render State = `Lerp(PrevState, CurrState, alpha)`

### 4. MULTIPLAYER READY
The engine supports multiple "Players" (vehicles) in the same `WorldState`.
- **Split Screen**: The renderer needs to support multiple viewports (Cameras) looking at the same World.
- **Local Multiplayer**: Two local inputs driving two cars in the same `step()`.
- **Network Multiplayer**: Sending Input frames (and occasional state checksums) instead of position updates. "Lockstep" or "Prediction/Rollback" strategies rely on the Determinism pillar.

## 2. Architecture Overview

### GameLoop (`src/engine/GameLoop.ts`)
- Manages the "Accumulator".
- If the game lags, it runs multiple `update()` calls in a loop to catch up (within a safety cap).
- Calculates `alpha` for the renderer.

### Physics (`src/engine/Physics.ts`)
- **Pure Function** (conceptually): `step(state: WorldState, inputs: Map<PlayerID, Input>, dt: number) -> WorldState`
- **State**: Contains ALL mutable data (Car position, velocity, active props, etc.).
- **Input**: `{ accel: -1..1, steer: -1..1 }`.

### Rendering (`src/vis/Renderer.ts`)
- Stateless (mostly).
- Takes `WorldState` (ideally `Prev` and `Curr`) and syncs Three.js meshes to it.
- **Interpolation**:
  ```typescript
  const x = lerp(prev.x, curr.x, alpha);
  mesh.position.set(x, ...);
  ```

### Track System
- Tile-based grid (30x30).
- Static data (immutable during race, generally).
- Terrain height map support (future).

## 3. Future Requirements Checklist

- [ ] **Ghost Support**: Ability to load a `.rpl` (JSON input log) and simulate it alongside the live player.
- [ ] **Split Screen**: Verify `Renderer` can accept an array of Cameras/Viewports.
- [ ] **Network Protocol**: Define a compact binary format for Inputs to minimize bandwidth.
