import type { WorldState, Input, PhysicalBody } from '../shared/Schema';
import type { Track } from '../shared/Track';
import { TileType, TILE_SIZE } from '../shared/Track';

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

  private getHeightAt(worldX: number, worldY: number, track: Track): number {
    // Convert World to Grid
    const x = worldX / TILE_SIZE;
    const y = worldY / TILE_SIZE;

    // Bilinear interpolation
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const u = x - tx;
    const v = y - ty;

    const corners = track.getTileCornerHeights(tx, ty);

    // Interpolate Top Edge (NW -> NE)
    const hTop = corners.nw * (1 - u) + corners.ne * u;
    // Interpolate Bottom Edge (SW -> SE)
    const hBot = corners.sw * (1 - u) + corners.se * u;

    // Interpolate Vertical
    return hTop * (1 - v) + hBot * v;
  }

  private getNormalAt(x: number, y: number, track: Track): { x: number; y: number; z: number } {
    // Gradient method or cross product of triangle?
    // Bilinear patch normal is complex.
    // Approximate by sampling nearby heights.
    const h = this.getHeightAt(x, y, track);
    const hx = this.getHeightAt(x + 0.1, y, track);
    const hy = this.getHeightAt(x, y + 0.1, track);

    // Vector 1: (0.1, 0, hx - h)
    // Vector 2: (0, 0.1, hy - h)
    // Normal = V2 x V1 (or V1 x V2 depending on handedness)
    // We want Up to be +Y? No, in Physics Z is up?
    // Wait, in Physics: x, y are ground plane.
    // So "Height" is Z? Or "Y" in 3D rendering?
    // Let's call Height "Z" for math here, but map to Y in renderer.
    // Physics 2D: x, y. Height is extra dimension "Z".

    // V1 = (0.1, 0, hx-h)
    // V2 = (0, 0.1, hy-h)
    // N = (dy*vz - dz*vy, dz*vx - dx*vz, dx*vy - dy*vx)
    // dx=0.1, dy=0, dz=hx-h
    // dx=0, dy=0.1, dz=hy-h

    // Nx = 0*(hy-h) - (hy-h)*0.1 = -(hy-h)*0.1 ?? No
    // Cross Product:
    // x   y   z
    // 0.1 0   dz1
    // 0   0.1 dz2

    // Nx = 0*dz2 - dz1*0.1 = -0.1 * (hx - h) -> Wait this is slope x.
    // Ny = dz1*0 - 0.1*dz2 = -0.1 * (hy - h)
    // Nz = 0.1*0.1 - 0*0   = 0.01

    // Normalize
    const nx = -(hx - h) * 10; // Approx slope
    const ny = -(hy - h) * 10;
    const nz = 1;

    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  private updatePlayer(body: PhysicalBody, input: Input, dt: number, track?: Track) {
    // 1. World Transform
    const cosVal = Math.cos(body.angle);
    const sinVal = Math.sin(body.angle);

    // Apply Slope Physics (Gravity)
    if (track) {
      // Get normal at center of car
      const normal = this.getNormalAt(body.x, body.y, track);
      // Gravity Vector is (0, 0, -g)
      // We want component parallel to the plane defined by normal.
      // Force = m * g * sin(slopeAngle)
      // Or simply project gravity vector onto the plane.
      // Downwards vector D = (0,0,-1).
      // Tangent direction T = D - (D . N) * N
      // (D . N) = -Nz
      // T = (0,0,-1) - (-Nz) * (Nx, Ny, Nz)
      // T = (Nx*Nz, Ny*Nz, -1 + Nz*Nz)
      // We only care about x/y accel.
      // AccelX = g * Nx * Nz
      // AccelY = g * Ny * Nz

      // Wait, simpler:
      // Slide force is proportional to slope.
      const gravity = 9.81 * 2; // Extra gravity feels better for cars
      // verify signs:
      // if slope goes UP in X (Nx < 0), we want force BACK in X (Negative).
      // My normal Calc: Nx = -(hx-h). If hx > h, Nx is negative. Correct.
      // So Fx = Nx * gravity?
      // If flat: Nx=0. Force=0.
      // If 45 deg up: hx-h=0.1. Nx = -1. Nz = 1? No.
      // If hx-h=0.1 (over 0.1 step), slope = 1. Normal = (-1, 0, 1). Normalized (-0.7, 0, 0.7).
      // Force should be -g * sin(45) = -g * 0.7.
      // With Nx = -0.7. So Fx = Nx * g * (something).
      // If we simpler assume normal z is close to 1 for shallow slopes:
      // Fx = Nx * g (approx).
      // Let's use `normal.x * gravity`.

      body.velocity.x += normal.x * gravity * dt;
      body.velocity.y += normal.y * gravity * dt;
    }

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
    // Total speed for drag
    // const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
    // (Unused)

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
        // Convert world units to tiles.
        const tx = Math.floor(wx / TILE_SIZE);
        const ty = Math.floor(wy / TILE_SIZE);
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
