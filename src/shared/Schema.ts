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
  position: Vector2;
  velocity: Vector2;
  angle: number; // radians
}

export interface WorldState {
  time: number;
  players: PhysicalBody[];
}

export const createInitialState = (playerCount: number = 1): WorldState => ({
  time: 0,
  players: Array.from({ length: playerCount }, () => ({
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    angle: 0,
  })),
});
