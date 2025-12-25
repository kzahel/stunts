import type { WorldState, Input, PhysicalBody } from '../shared/Schema';
import type { Track } from '../shared/Track';
import { TileType } from '../shared/Track';

interface VehicleConfig {
  mass: number; // kg
  drag: number; // Air resistance coefficient
  corneringStiffness: number; // N/rad
  maxSteer: number; // radians
  wheelBase: number; // meters
  trackWidth: number; // meters
  engineForce: number; // Newtons
  brakeForce: number; // Newtons
  eBrakeForce: number; // Newtons
  weightTransfer: number; // 0 to 1 simplified scalar
  driveTrain: 'FWD' | 'RWD' | 'AWD';
}

const CAR_CFG: VehicleConfig = {
  mass: 1200,
  drag: 2.5, // Air resistance
  corneringStiffness: 12000,
  maxSteer: 0.6, // ~34 degrees
  wheelBase: 2.5,
  trackWidth: 1.6,
  engineForce: 18000,
  brakeForce: 12000,
  eBrakeForce: 6000,
  weightTransfer: 0.2, // Simple shift effect
  driveTrain: 'RWD', // Drift friendly
};

export class PhysicsEngine {
  step(state: WorldState, inputs: Input[], dt: number, track?: Track): WorldState {
    const next = JSON.parse(JSON.stringify(state)) as WorldState;

    next.players.forEach((player, i) => {
      const input = inputs[i] || { accel: 0, steer: 0, handbrake: false };
      this.updatePlayer(player, input, dt, track);
    });

    return next;
  }

  private updatePlayer(body: PhysicalBody, input: Input, dt: number, track?: Track) {
    // 1. World Transform
    const cosVal = Math.cos(body.angle);
    const sinVal = Math.sin(body.angle);

    // Local Velocity calculation
    // Forward is +X in local space? No, usually in 2D games:
    // Let's assume: Angle 0 = Points Right (+X).
    // Forward Vector = (cos, sin)
    // Side Vector = (-sin, cos)

    const localVelX = cosVal * body.velocity.x + sinVal * body.velocity.y; // Forward speed
    const localVelY = -sinVal * body.velocity.x + cosVal * body.velocity.y; // Lateral speed

    // 2. Prepare visual steer
    body.steer = input.steer * CAR_CFG.maxSteer;

    // 3. Wheel Physics
    // We simulate 4 wheels.
    // FL, FR, RL, RR
    // Positions relative to center:
    const halfL = CAR_CFG.wheelBase / 2;
    const halfW = CAR_CFG.trackWidth / 2;

    const wheelOffsets = [
      { x: halfL, y: -halfW, id: 'FL' },
      { x: halfL, y: halfW, id: 'FR' },
      { x: -halfL, y: -halfW, id: 'RL' },
      { x: -halfL, y: halfW, id: 'RR' },
    ];

    let totalForceX = 0; // Forward/Back in local space
    let totalForceY = 0; // Left/Right in local space
    let totalTorque = 0;

    // Weight distribution (simplified)
    // Static weight per wheel
    const weightPerWheel = (CAR_CFG.mass * 9.81) / 4;

    // Total speed for drag
    const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);

    wheelOffsets.forEach((w) => {
      // Is this wheel steered?
      const isFront = w.x > 0;
      const wheelSteer = isFront ? body.steer : 0;

      // World position of the wheel for Surface lookup
      // Body Pos + Rotate(WheelOffset)
      const wx = body.x + (cosVal * w.x - sinVal * w.y);
      const wy = body.y + (sinVal * w.x + cosVal * w.y);

      // Surface Traction
      let frictionCoeff = 1.0; // Tarmac default
      if (track) {
        // Convert world units to tiles. Assuming 1 tile = 10 world units?
        // Or 1 world unit = 1 tile?
        // Wait, Track.ts says TRACK_SIZE=30. In games usually 1 tile is some size.
        // Let's assume 1-to-1 for now based on Schema `x: 0, y: 0`.
        // If the map is 30x30, coordinates are likely 0..30.
        const tx = Math.floor(wx);
        const ty = Math.floor(wy);
        const tile = track.getTile(tx, ty);
        if (tile) {
          switch (tile.type) {
            case TileType.Grass:
              frictionCoeff = 0.4;
              break;
            case TileType.Road:
              frictionCoeff = 2.5;
              break; // Racing Rubber
            case TileType.Start:
              frictionCoeff = 2.5;
              break;
            case TileType.Finish:
              frictionCoeff = 2.5;
              break;
            default:
              frictionCoeff = 0.5;
          }
        } else {
          // Off map
          frictionCoeff = 0.3;
        }
      }

      // Calculate Wheel Velocity
      // V_wheel = V_car + Omega x R_wheel
      // 2D Cross product scalar: w * r
      const wy_rot = body.angularVelocity * w.x; // Tangential velocity Y component contrib
      const wx_rot = -body.angularVelocity * w.y; // Tangential velocity X component contrib

      const wheelVx = localVelX + wx_rot; // Local forward velocity at wheel
      const wheelVy = localVelY + wy_rot; // Local lateral velocity at wheel

      // Slip Angle
      // alpha = atan2(Vy, Vx) - delta_steer
      // Important: handle low speed stability (divide by zero or huge slip at 0 speed)
      const minSpeed = 0.1;
      let slipAngle = 0;
      if (Math.abs(wheelVx) > minSpeed) {
        slipAngle = Math.atan2(wheelVy, wheelVx) - wheelSteer;
      }

      // Lateral Force (Cornering)
      // F_lat = C_alpha * alpha
      // Clamped by Friction limits: MaxF = NormalForce * mu
      const load = weightPerWheel; // simplify dynamic load transfer for stability first
      const maxFriction = load * frictionCoeff;

      let latForce = -CAR_CFG.corneringStiffness * slipAngle;

      // Cap lateral force
      // Standard "Friction Circle" simplified: just clamp independent? or combine?
      // Let's clamp lateral first.
      if (Math.abs(latForce) > maxFriction) {
        latForce = Math.sign(latForce) * maxFriction;
      }

      // Longitudinal Force (Drive / Brake)
      let longForce = 0;

      // Drive
      if (input.accel > 0) {
        // Gas
        let drive = false;
        if (CAR_CFG.driveTrain === 'AWD') drive = true;
        if (CAR_CFG.driveTrain === 'FWD' && isFront) drive = true;
        if (CAR_CFG.driveTrain === 'RWD' && !isFront) drive = true;

        if (drive) {
          longForce += input.accel * (CAR_CFG.engineForce / (CAR_CFG.driveTrain === 'AWD' ? 4 : 2));
        }
      } else if (input.accel < 0) {
        // Brake / Reverse
        // Simple logic: if moving forward, brake. If stopped/reversing, reverse.
        // Dot product to check direction?
        if (localVelX > 0.5) {
          // Brakes apply to all wheels
          longForce += input.accel * (CAR_CFG.brakeForce / 4); // accel is negative here
        } else {
          // Reverse (treat as RWD engine usually, or just apply backwards force)
          // Let's just apply simplified reverse force
          longForce += input.accel * (CAR_CFG.engineForce / 2); // lower reverse power
        }
      }

      // Handbrake
      if (input.handbrake && !isFront) {
        // Lock rears = high friction sliding?
        // Or massive drag?
        // Physical model: Friction circle. If we use all traction for braking, zero for cornering?
        // Simplified: Add huge drag force, reduce cornering stiffness effectively?
        // Let's replace the calculated longForce with a friction-limited drag
        longForce = -Math.sign(wheelVx) * maxFriction * 0.95;
        // Reduce lateral capability when locked
        latForce *= 0.05;
      }

      // Apply Friction Circle cap on total force
      // F_total^2 = F_lat^2 + F_long^2 <= MaxF^2
      // We prioritize Lateral (turning) or Longitudinal (braking)?
      // Tires usually lose steering when braking hard (lock up).
      // So verify magnitude.
      const currentForceMag = Math.sqrt(longForce ** 2 + latForce ** 2);
      if (currentForceMag > maxFriction) {
        const scale = maxFriction / currentForceMag;
        longForce *= scale;
        latForce *= scale;
      }

      // Add to chassis totals
      // We need to rotate these forces back from Wheel Heading to Car Heading?
      // Yes, the wheel forces are computed in the *Wheel's* frame?
      // No, `latForce` is perpendicular to wheel heading. `longForce` is parallel.
      // So we have force in direction of Wheel Angle.

      const cosSteer = Math.cos(wheelSteer);
      const sinSteer = Math.sin(wheelSteer);

      // Force in Car Local Space
      // F_car_x = F_long * cos(steer) - F_lat * sin(steer)
      // F_car_y = F_long * sin(steer) + F_lat * cos(steer)

      const fx = longForce * cosSteer - latForce * sinSteer;
      const fy = longForce * sinSteer + latForce * cosSteer;

      totalForceX += fx;
      totalForceY += fy;

      // Torque = r x F (2D)
      // r = (w.x, w.y)
      // torque = x * Fy - y * Fx
      totalTorque += w.x * fy - w.y * fx;
    });

    // Check skidding status using similar logic for average/worst case?
    // Actually we need to track if ANY wheel skidded?
    // Let's re-run a simplified check or just assume if lateral slip OR accel is huge
    // For now, let's just say if we are drifting (lateral slip high) or burning out
    // Re-calculating proper skid per wheel is ideal but expensive to do twice.
    // Let's rely on slip angle for drift, and input for burnout?
    // But we clamped forces in the loop.
    // Hack: if handbrake is on or high steer + high speed, skid = true.
    // Better: if |latForce| was clamped or |longForce| was clamped.
    // As we can't extract variables from the loop easily without refactoring 'updatePlayer's loop...
    // Let's just refactor the loop to track a 'skidCount'.

    // Actually, simple physics heuristic:
    // Skidding if abs(angularVelocity) is high (>2 rad/s) AND speed > 5? (Drift)
    // Skidding if input.accel > 0 and speed < 5 (Burnout?) - No, speed grows fast.

    // Let's use the handbrake flag and slip angle estimation on rear wheels.
    // Rear Slip Angle approx = atan2(localVelY - angularVel * x_rear, localVelX)
    // If slip angle > 0.3 rad -> skid.

    const rearSlip = Math.atan2(
      localVelY - (body.angularVelocity * -CAR_CFG.wheelBase) / 2,
      localVelX,
    );
    const slipThreshold = 0.3; // ~17 degrees
    const isDrifting = Math.abs(rearSlip) > slipThreshold && Math.abs(localVelX) > 2;
    const isBurnout = input.accel > 0 && Math.abs(localVelX) < 1.0 && CAR_CFG.engineForce > 10000; // Crude start check

    body.skidding = isDrifting || input.handbrake || isBurnout; // Simplified skid flag

    // 4. Integration
    // Linear
    // Drag/Air resistance (in local forward approx)
    totalForceX -= CAR_CFG.drag * localVelX * Math.abs(localVelX);
    totalForceY -= CAR_CFG.drag * localVelY * Math.abs(localVelY) * 5; // High lateral drag if sliding sideways (body resistance)

    // Convert Local Force to World Accel
    // F_world = Rotate(F_local, angle)
    const accelX = (cosVal * totalForceX - sinVal * totalForceY) / CAR_CFG.mass;
    const accelY = (sinVal * totalForceX + cosVal * totalForceY) / CAR_CFG.mass;

    body.velocity.x += accelX * dt;
    body.velocity.y += accelY * dt;

    // Angular
    const inertia = (CAR_CFG.mass * (CAR_CFG.wheelBase ** 2 + CAR_CFG.trackWidth ** 2)) / 12; // Box approx
    const angularAccel = totalTorque / inertia;

    // Angular Damping
    body.angularVelocity += angularAccel * dt;
    body.angularVelocity *= 0.95; // Damping

    body.angle += body.angularVelocity * dt;

    // Position
    body.x += body.velocity.x * dt;
    body.y += body.velocity.y * dt;
  }
}
