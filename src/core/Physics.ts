import type { WorldState, Input } from '../shared/Schema';

export class PhysicsEngine {
  step(state: WorldState, inputs: Input[], dt: number): WorldState {
    // Deep clone to ensure immutability/determinism
    const next = JSON.parse(JSON.stringify(state)) as WorldState;
    // next.time += dt;

    next.players.forEach((player, i) => {
      const input = inputs[i] || { accel: 0, steer: 0 };

      // Update Velocity (Simple acceleration)
      // const accel = input.accel * 500; // Removed unused

      // Update Angle
      player.angle += input.steer * 4.0 * dt; // Tuned turn rate

      // Car Physics (Infinite Grip / Arcade)
      const forwardX = Math.cos(player.angle);
      const forwardY = Math.sin(player.angle);

      // 1. Project current velocity onto new forward axis
      let currentSpeed = player.velocity.x * forwardX + player.velocity.y * forwardY;

      // 2. Apply Acceleration
      const accelRate = 50; // units/sec^2 (was 100) -> Slower acceleration
      currentSpeed += input.accel * accelRate * dt;

      // 3. Apply Drag (Air resistance + Rolling resistance)
      // Simple linear drag: speed = speed * (1 - drag * dt)
      const drag = 1.0; // (was 0.8) Top speed ~= accelRate / drag ~= 50 units/s
      currentSpeed *= Math.max(0, 1 - drag * dt);

      // 4. Update Velocity Vector (aligned with heading = no drift)
      player.velocity.x = forwardX * currentSpeed;
      player.velocity.y = forwardY * currentSpeed;

      // Update Position
      player.x += player.velocity.x * dt;
      player.y += player.velocity.y * dt;
    });

    return next;
  }
}
