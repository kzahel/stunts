import type { WorldState, Input } from '../shared/Schema';

export class PhysicsEngine {
  step(state: WorldState, inputs: Input[], dt: number): WorldState {
    // Deep clone to ensure immutability/determinism
    const next = JSON.parse(JSON.stringify(state)) as WorldState;
    // next.time += dt;

    next.players.forEach((player, i) => {
      const input = inputs[i] || { accel: 0, steer: 0 };

      // Store input steer for visuals
      player.steer = input.steer;

      // Calculate current speed from velocity (approximate for steering logic)
      const speedMag = Math.sqrt(player.velocity.x ** 2 + player.velocity.y ** 2);

      // Update Angle (Rotate only when moving)
      // Real car: dAngle = (speed / wheelbase) * tan(steerAngle) * dt
      // Simplified: dAngle = speed * steer * factor * dt
      // We clip the speed factor so it doesn't turn insanely fast at high speeds if we want arcade feel,
      // but for realistic feel, it should scale with speed.
      // However, at very low speeds, we want to stop rotating.
      if (speedMag > 1.0) {
        // Direction of movement matters. If reversing, steering reverses?
        // Basic implementation: just scale by speed direction if we tracked it, 
        // but here speedMag is always positive.
        // Let's assume standard forward driving for now. 
        // For distinct reverse steering, we'd need to know if we are in "reverse gear" or moving backwards.
        // Dot product of velocity and heading can tell us direction.

        const dot = player.velocity.x * Math.cos(player.angle) + player.velocity.y * Math.sin(player.angle);
        const direction = dot >= -0.1 ? 1 : -1; // -0.1 bias for valid stops

        // Tuned turn rate: scaled by speed, but clamped to avoid super-fast spins at high speed?
        // Or pure arcade: constant turn rate if moving?
        // User asked "rotate only when moving".
        // Let's try: constant turn rate * (speed / max_speed)? No, that's physics based.
        // Let's go with: Constant turn rate, but gated by speed.
        // Actually, physically: angular_vel = v / R. R is const for fixed steer. So ang_vel proportional to v.
        // So `angle += input.steer * speedMag * CONSTANT * dt`.
        // Let's try CONSTANT = 0.15 (since previously it was 4.0 at ~50 speed -> 4/50 = 0.08)

        player.angle += input.steer * direction * speedMag * 0.15 * dt;
      }

      // Car Physics (Infinite Grip / Arcade)
      const forwardX = Math.cos(player.angle);
      const forwardY = Math.sin(player.angle);

      // 1. Project current velocity onto new forward axis
      let currentSpeed = player.velocity.x * forwardX + player.velocity.y * forwardY;

      // 2. Apply Acceleration
      const accelRate = 50; // units/sec^2
      currentSpeed += input.accel * accelRate * dt;

      // 3. Apply Drag (Air resistance + Rolling resistance)
      const drag = 1.0;
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
