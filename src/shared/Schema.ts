export interface Input {
  accel: number; // -1 (brake/reverse) to 1 (gas)
  steer: number; // -1 (left) to 1 (right)
  handbrake: boolean;
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface PhysicalBody {
  id?: number; // Player ID (optional for now as we transition)
  x: number; // Changed from position: Vector2
  y: number; // Changed from position: Vector2
  z: number; // Height
  velocity: Vector2; // Ground plane velocity (x, y)
  vz: number; // Vertical velocity

  angle: number; // Yaw (radians)
  angularVelocity: number; // Yaw velocity

  pitch: number; // Radians
  vPitch: number; // Pitch velocity
  roll: number; // Radians
  vRoll: number; // Roll velocity

  steer: number; // Added for visual wheel rotation
  skidding: boolean; // Visual skid flag
}

export interface WorldState {
  players: PhysicalBody[]; // Index 0 is player 1, etc.
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
  const diff = b - a;
  const wrapped = diff - Math.floor(diff / (Math.PI * 2) + 0.5) * (Math.PI * 2);
  return a + wrapped * t;
}

export function lerpBody(a: PhysicalBody, b: PhysicalBody, t: number): PhysicalBody {
  return {
    id: b.id, // ID should match
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
    angle: lerpAngle(a.angle, b.angle, t),
    pitch: lerpAngle(a.pitch, b.pitch, t),
    roll: lerpAngle(a.roll, b.roll, t),
    velocity: {
      x: lerp(a.velocity.x, b.velocity.x, t),
      y: lerp(a.velocity.y, b.velocity.y, t),
    },
    vz: lerp(a.vz, b.vz, t),
    angularVelocity: lerp(a.angularVelocity, b.angularVelocity, t),
    vPitch: lerp(a.vPitch, b.vPitch, t),
    vRoll: lerp(a.vRoll, b.vRoll, t),
    steer: lerp(a.steer, b.steer, t),
    skidding: b.skidding, // Boolean, easier to snap than lerp? Or use t > 0.5
  };
}

export function interpolateState(a: WorldState, b: WorldState, t: number): WorldState {
  // Assuming player lists match in size and order for now
  return {
    players: a.players.map((pA, i) => {
      const pB = b.players[i];
      if (!pB) return pA;
      return lerpBody(pA, pB, t);
    }),
  };
}

export const createInitialState = (playerCount: number = 1): WorldState => ({
  players: Array.from({ length: playerCount }, () => ({
    x: 0,
    y: 0,
    z: 0.5, // Start grounded (Rest length ~0.6, so 0.5 is compressed/sprung)
    velocity: { x: 0, y: 0 },
    vz: 0,
    angle: 0,
    angularVelocity: 0,
    pitch: 0,
    vPitch: 0,
    roll: 0,
    vRoll: 0,
    steer: 0,
    skidding: false,
  })),
});
