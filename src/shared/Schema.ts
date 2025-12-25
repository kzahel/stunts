export interface Input {
  accel: number; // -1 (brake/reverse) to 1 (gas)
  steer: number; // -1 (left) to 1 (right)
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface PhysicalBody {
  id?: number; // Player ID (optional for now as we transition)
  x: number; // Changed from position: Vector2
  y: number; // Changed from position: Vector2
  velocity: Vector2;
  angle: number; // radians
  angularVelocity: number; // Added angularVelocity
  steer: number; // Added for visual wheel rotation
}

export interface WorldState {
  players: PhysicalBody[]; // Index 0 is player 1, etc.
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpBody(a: PhysicalBody, b: PhysicalBody, t: number): PhysicalBody {
  return {
    id: b.id, // ID should match
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    angle: lerp(a.angle, b.angle, t), // Note: For full correctness, need shortest path angle interpolation
    velocity: {
      x: lerp(a.velocity.x, b.velocity.x, t),
      y: lerp(a.velocity.y, b.velocity.y, t)
    },
    angularVelocity: lerp(a.angularVelocity, b.angularVelocity, t),
    steer: lerp(a.steer, b.steer, t)
  };
}

export function interpolateState(a: WorldState, b: WorldState, t: number): WorldState {
  // Assuming player lists match in size and order for now
  return {
    players: a.players.map((pA, i) => {
      const pB = b.players[i];
      if (!pB) return pA;
      return lerpBody(pA, pB, t);
    })
  };
}

export const createInitialState = (playerCount: number = 1): WorldState => ({
  players: Array.from({ length: playerCount }, () => ({
    x: 0, // Changed from position: { x: 0, y: 0 }
    y: 0, // Changed from position: { x: 0, y: 0 }
    velocity: { x: 0, y: 0 },
    angle: 0,
    angularVelocity: 0, // Added angularVelocity
    steer: 0,
  })),
});
