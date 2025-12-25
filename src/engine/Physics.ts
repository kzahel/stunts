import type { WorldState, Input } from './Schema';

export class PhysicsEngine {
    public step(state: WorldState, inputs: Input[], dt: number): WorldState {
        // Deep clone to ensure immutability/determinism
        const next: WorldState = JSON.parse(JSON.stringify(state));
        next.time += dt;

        // Basic Car Physics Parameters
        const MAX_SPEED = 50; // units per second
        const ACCEL_RATE = 20;
        const TURN_RATE = 2.0;

        next.players.forEach((player, index) => {
            const input = inputs[index] || { accel: 0, steer: 0 };

            // Apply Steering
            player.angle += input.steer * TURN_RATE * dt;

            // Apply Acceleration (Simplified)
            const forwardX = Math.cos(player.angle);
            const forwardY = Math.sin(player.angle);

            // Current speed projection
            let currentSpeed =
                player.velocity.x * forwardX +
                player.velocity.y * forwardY;

            // Apply acceleration
            currentSpeed += input.accel * ACCEL_RATE * dt;

            // Drag (Linear)
            currentSpeed *= (1 - 0.5 * dt);

            // Cap speed
            if (currentSpeed > MAX_SPEED) currentSpeed = MAX_SPEED;
            if (currentSpeed < -MAX_SPEED) currentSpeed = -MAX_SPEED;

            // Reconstruct velocity vector
            player.velocity.x = forwardX * currentSpeed;
            player.velocity.y = forwardY * currentSpeed;

            // Integrate Position
            player.position.x += player.velocity.x * dt;
            player.position.y += player.velocity.y * dt;
        });

        return next;
    }
}
