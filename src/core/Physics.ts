import type { WorldState, Input, PhysicalBody } from '../shared/Schema';
import type { Track } from '../shared/Track';
import { TileType, TILE_SIZE } from '../shared/Track';

// Vehicle Configuration
interface VehicleConfig {
  mass: number; // kg

  // Dimensions
  wheelBase: number; // meters
  trackWidth: number; // meters

  // Suspension
  suspensionRestLength: number; // meters (max length of spring)
  suspensionStiffness: number; // N/m (Spring K)
  suspensionDamping: number; // N*s/m (Damper b)

  // Wheel Interaction
  wheelRadius: number; // meters
  frictionCoeff: number; // tire friction mu

  // Engine
  engineForce: number; // Newtons
  brakeForce: number; // Newtons
  eBrakeForce: number; // Newtons
  maxSteer: number; // radians
  driveTrain: 'FWD' | 'RWD' | 'AWD';

  // Aero
  drag: number; // Air resistance linear
}

const CAR_CFG: VehicleConfig = {
  mass: 1200,
  wheelBase: 2.5,
  trackWidth: 1.6,

  // Suspension Tuning
  // F = kx. At rest, gravity is supports 1/4 mass.
  // F_g = 1200 * 9.81 / 4 = 2943 N per wheel.
  // If we want 50% compression at rest (0.3m travel = 0.15m sag):
  // k = 2943 / 0.15 = 19620
  suspensionRestLength: 0.6, // Long travel for jumps
  suspensionStiffness: 25000, // Stiffer for racing
  suspensionDamping: 2000, // Damping ratio sqrt(4mk) approx

  wheelRadius: 0.35,
  frictionCoeff: 2.5,

  engineForce: 18000,
  brakeForce: 12000,
  eBrakeForce: 6000,
  maxSteer: 0.6,
  driveTrain: 'RWD',

  drag: 1.5,
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

  // --- Terrain Helpers ---
  public getHeightAt(worldX: number, worldY: number, track?: Track): number {
    if (!track) return 0;

    // Convert World to Grid
    const x = worldX / TILE_SIZE;
    const y = worldY / TILE_SIZE;

    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const u = x - tx;
    const v = y - ty;

    // Boundary Check
    if (tx < 0 || ty < 0 || tx >= 100 || ty >= 100) return -100; // Fall off map

    const corners = track.getTileCornerHeights(tx, ty);

    // Bilinear Interpolation
    const hTop = corners.nw * (1 - u) + corners.ne * u;
    const hBot = corners.sw * (1 - u) + corners.se * u;

    return hTop * (1 - v) + hBot * v;
  }

  private getSurfaceFriction(worldX: number, worldY: number, track?: Track): number {
    if (!track) return 1.0;
    const tx = Math.floor(worldX / TILE_SIZE);
    const ty = Math.floor(worldY / TILE_SIZE);

    // Boundary check
    if (tx < 0 || ty < 0) return 0.5;

    const tile = track.getTile(tx, ty);
    if (!tile) return 0.5;

    switch (tile.type) {
      case TileType.Grass:
        return 0.4;
      case TileType.Road:
        return 2.5;
      case TileType.Start:
        return 2.5;
      case TileType.Finish:
        return 2.5;
      default:
        return 0.5;
    }
  }

  // --- Physics Simulation ---
  private updatePlayer(body: PhysicalBody, input: Input, dt: number, track?: Track) {
    // 1. Setup Car Frame
    // Local to World Transform Basis
    const cosYaw = Math.cos(body.angle);
    const sinYaw = Math.sin(body.angle);

    // NOTE: For full 3D rotation we need quaternions or 3x3 matrix.
    // Given we store Yaw, Pitch, Roll, we can construct the Forward, Up, Right vectors.
    // Simplified rotation sequence: Yaw(Z) * Pitch(X) * Roll(Z_local) ??
    // Standard vehicle order: Yaw -> Pitch -> Roll

    // However, purely compounding Euler angles leads to Gimbal Lock.
    // For this arcade level, we'll try to maintain small pitch/roll and use approximations,
    // or build a rotation matrix each step.

    // Let's compute basis vectors: Right, Up, Forward
    // For now, small angle approximation for Pitch/Roll is risky for 45 deg slopes.
    // Let's assume Body Rotation Matrix R.

    // Construct Rotation Matrix from Yaw(y), Pitch(p), Roll(r)
    // Cy = cos(yaw) ...
    // But since javascript math functions are expensive, let's optimize slightly or just call them.

    const cp = Math.cos(body.pitch);
    const sp = Math.sin(body.pitch);
    const cr = Math.cos(body.roll);
    const sr = Math.sin(body.roll);
    // Yaw uses 'angle'
    const cy = cosYaw;
    const sy = sinYaw;

    // Rotation Matrix Columns (Forward, Right, Up)
    // Standard aerospace: X=Forward, Y=Right, Z=Down (We use Z=Up)
    // Let's stick to our Game Frame: Z=Up.
    // Forward (Initial X)
    // Right (Initial -Y (since we used to have Y as 'up' on screen maybe? No previously X,Y ground))
    // Previous code: Angle 0 points Right (+X).
    // Let's define: Car Forward is +X. Car Left is +Y. Car Up is +Z.

    // Rotate Yaw (around Z):
    // [ cy  -sy   0 ]
    // [ sy   cy   0 ]
    // [ 0    0    1 ]

    // Rotate Pitch (around Y - wait, pitch is usually local Y axis? Yes)
    // Rotate Roll (around X - local X axis? Yes)

    // Let's compute 'Local To World' vectors manually:
    // Forward Vector (X_local):
    // Yaw(Z) -> Pitch(new Y) -> Roll(new X)
    // With Z Up.

    // Fwd = [ cy*cp, sy*cp, sp ]
    const fwdX = cy * cp;
    const fwdY = sy * cp;
    const fwdZ = sp;

    // Right Vector (Y_local - Assuming Y is Left in Right-Handed Z-up if X is Fwd):
    // R = [-sy*cr + cy*sp*sr,  cy*cr + sy*sp*sr,  -cp*sr]
    // (Standard Euler conversion)
    const rightX = -sy * cr + cy * sp * sr;
    const rightY = cy * cr + sy * sp * sr;
    const rightZ = -cp * sr;

    // Up Vector (Z_local) - Unused
    // U = [ sy*sr + cy*sp*cr, -cy*sr + sy*sp*cr,   cp*cr ]

    // Forces Accumulator (World Space)
    let forceX = 0;
    let forceY = 0;
    let forceZ = 0;

    // Torque Accumulator (Local Space? Or World?)
    // Easier to accumulate Torque in Local Space [Roll, Pitch, Yaw]
    let torqueRoll = 0; // X axis
    let torquePitch = 0; // Y axis
    let torqueYaw = 0; // Z axis

    // Apply Gravity
    forceZ += -9.81 * CAR_CFG.mass * 2.5; // Extra gravity for snappy feel

    // Define Wheel Offsets (Local Space)
    const halfBase = CAR_CFG.wheelBase / 2;
    const halfTrack = CAR_CFG.trackWidth / 2;
    // FL, FR, RL, RR
    // Forward is +X, Left is +Y
    const wheels = [
      { id: 'FL', lx: halfBase, ly: halfTrack, steer: true, drive: CAR_CFG.driveTrain !== 'RWD' },
      { id: 'FR', lx: halfBase, ly: -halfTrack, steer: true, drive: CAR_CFG.driveTrain !== 'RWD' },
      { id: 'RL', lx: -halfBase, ly: halfTrack, steer: false, drive: CAR_CFG.driveTrain !== 'FWD' },
      {
        id: 'RR',
        lx: -halfBase,
        ly: -halfTrack,
        steer: false,
        drive: CAR_CFG.driveTrain !== 'FWD',
      },
    ];

    let wheelsOnGround = 0;
    let isSkidding = false;

    // Visual steer update
    body.steer = input.steer * CAR_CFG.maxSteer;

    for (const w of wheels) {
      // 1. Calculate Wheel World Position
      // P_wheel = P_car + R * LocalPos
      // LocalPos = (lx, ly, -wheelRadius/2 + offset?)
      // Actually suspension mount point is usually distinct.
      // Let's assume mount point is at height 0 relative to CM (Center of Mass).

      const wx = body.x + fwdX * w.lx + rightX * w.ly;
      const wy = body.y + fwdY * w.lx + rightY * w.ly;
      const wz = body.z + fwdZ * w.lx + rightZ * w.ly; // Mount point Z

      // 2. Raycast Down
      const groundH = this.getHeightAt(wx, wy, track);

      // Calculate Distance from Mount Point to Ground
      // Vector from Mount to Ground: (0, 0, groundH - wz) assuming vertical raycast
      // Note: "Vertical" raycast is simple. Real raycast vehicle uses "Down" vector of car.
      // Let's use Vertical for stability on simple terrain grids.
      const distToGround = wz - groundH;

      const maxLength = CAR_CFG.suspensionRestLength + CAR_CFG.wheelRadius;

      if (distToGround < maxLength) {
        wheelsOnGround++;

        // 3. Suspension Force
        // Spring Compression
        // distToGround = Current Length.
        // Compression = RestLength - CurrentLength
        // Actually we include wheel radius.
        // Suspension extends from Mount downwards.
        // Contact point is at (distance - radius).
        // Let's treat 'suspensionRestLength' as the spring length.
        // Spring Compression = (RestLength) - (distToGround - WheelRadius)
        // If distToGround = WheelRadius, compression = RestLength (Fully Compressed) -> Huge force
        // If distToGround = MaxLength, compression = 0.

        // Let's use:
        // compression = 1.0 - (distToGround / maxLength) ? No linear K
        // compression = maxLength - distToGround;

        const compression = maxLength - distToGround;

        // Spring Force = k * x
        const springForce = CAR_CFG.suspensionStiffness * compression;

        // Damping Force
        // Need velocity of the suspension compression.
        // Velocity of mount point Z?
        // Vel_mount = Vel_car + Omega x R_mount

        // Velocity is vector (vx, vy, vz)
        // Omega is (vRoll, vPitch, angularVelocity) in local or world?
        // Let's assume state velocities are correct.

        // Since we are doing vertical raycast, we only care about vertical velocity of the point relative to ground.
        // V_point_z = body.vz + (cross product components in Z)

        // V_point = V_cm + Omega x R
        // Omega_world approx?
        // Converting Local Angular Velocity to World is complex without quaternions.
        // Let's approximate:
        // V_point_z approx = body.vz + (body.vPitch * w.lx) - (body.vRoll * w.ly)
        // (Pitch up -> Front moves Up)
        // (Roll right -> Left moves Up)

        const pointVz = body.vz + body.vPitch * w.lx - body.vRoll * w.ly;
        const damperForce = -CAR_CFG.suspensionDamping * pointVz;

        const suspensionForce = springForce + damperForce;

        // Apply Suspension vertical Force (World Z)
        // Only if pushing UP (ignore pulling down unless sticky, we'll ignore pull)
        const finalSuspForce = Math.max(0, suspensionForce);

        // Apply to Body
        // F_z = finalSuspForce
        // Torque? Pushing UP at (lx, ly).
        // Pitch Torque (Rotation around Y): Force * dist_X? No.
        // Cross product: r x F
        // r = (lx, ly, 0)
        // F = (0, 0, Fz) (Vertical World Force, treated as Local Up approx for torque)
        // Torque = (ly*Fz - 0, 0 - lx*Fz, 0) -> (Roll Torq, Pitch Torq, Yaw Torq)
        // Torque_x (Roll) = ly * Fz. (Left wheel at +ly pushes up -> Roll Right (-angle)) -> Wait.
        // Right hand rule: +X axis is Forward. +Y is Left. +Z is Up.
        // Force at +Y (Left): Torque Vector is r x F = (0, y, 0) x (0, 0, F) = (y*F, 0, 0).
        // +X Torque is Roll? Yes.
        // If Left wheel pushes UP, car rolls to Right (negative Roll angle?).
        // If +Torque X, rotation is counter-clockwise looking from X.
        // Left side (+Y) goes UP? Yes.
        // So Left Wheel Push -> +Roll Torque.

        forceZ += finalSuspForce;
        torqueRoll -= w.ly * finalSuspForce; // Left (+y) Push Up -> Decrease Roll (Left Up)
        torquePitch += w.lx * finalSuspForce; // Front (+x) Push Up -> Increase Pitch (Nose Up)

        // 4. Tire Friction (Longitudinal & Lateral)
        // Traction is applied in the Ground Plane (tangent).
        // We need local velocity at the contact patch.

        // Velocity at contact patch in world space (approx):
        // V_contact = V_cm + Omega x R_contact

        // R_contact in World Space:
        const rx = wx - body.x;
        const ry = wy - body.y;

        // V_point = V_cm + Omega x R
        // Omega x R = (-ang * ry, ang * rx)
        const patchVx = body.velocity.x - body.angularVelocity * ry;
        const patchVy = body.velocity.y + body.angularVelocity * rx;

        // Project into Wheel's Local Direction
        // Wheel Heading = Car Yaw + Steer Angle
        const steerAngle = w.steer ? body.steer : 0;
        const wheelHeading = body.angle + steerAngle;

        // Wheel Forward Vector (World Space)
        const wheelRx = Math.cos(wheelHeading);
        const wheelRy = Math.sin(wheelHeading);
        // Side vector (Left)
        const wheelSx = -Math.sin(wheelHeading);
        const wheelSy = Math.cos(wheelHeading);

        // Project Velocity into Wheel Frame
        const velForward = patchVx * wheelRx + patchVy * wheelRy;
        const velSide = patchVx * wheelSx + patchVy * wheelSy;

        // Forces
        const frictionLimit =
          finalSuspForce * this.getSurfaceFriction(wx, wy, track) * CAR_CFG.frictionCoeff;

        // Lateral (Cornering)
        let latForce = -velSide * CAR_CFG.mass * 10; // Simple stiff spring for cornering
        // Clamp
        if (Math.abs(latForce) > frictionLimit) {
          latForce = Math.sign(latForce) * frictionLimit;
          // Mark Skid if at limit
          isSkidding = true;
        }

        // Longitudinal (Drive/Brake)
        let longForce = 0;
        if (input.accel > 0 && w.drive) {
          longForce = input.accel * (CAR_CFG.engineForce / (CAR_CFG.driveTrain === 'AWD' ? 4 : 2));
        } else if (input.accel < 0) {
          // Braking (simplification: all wheels brake)
          longForce = input.accel * (CAR_CFG.brakeForce / 4);
        }

        if (input.handbrake && !w.steer) {
          // Lock rear wheels
          longForce = -Math.sign(velForward) * frictionLimit;
          latForce = 0; // Loss of grip sideways
          isSkidding = true;
        }

        // Combine Forces Limit
        const totalForce = Math.sqrt(longForce ** 2 + latForce ** 2);
        if (totalForce > frictionLimit) {
          const scale = frictionLimit / totalForce;
          longForce *= scale;
          latForce *= scale;
          if (Math.abs(velSide) > 1.0) isSkidding = true; // Slide
        }

        // Transform back to World
        // F_world = F_long * FwdVec + F_lat * SideVec
        const fWx = longForce * wheelRx + latForce * wheelSx;
        const fWy = longForce * wheelRy + latForce * wheelSy;

        forceX += fWx;
        forceY += fWy;

        // Add Torque from Friction
        // Torque Z (Yaw)
        // Moment arm in World Space:
        // (Calculated above: rx, ry)

        // Torque = r x F (2D Cross Product)
        // (rx * Fy - ry * Fx)
        torqueYaw += rx * fWy - ry * fWx;
      }
    }

    // 2. Integration (Symplectic Euler)
    const invMass = 1.0 / CAR_CFG.mass;

    // Linear
    body.velocity.x += forceX * invMass * dt;
    body.velocity.y += forceY * invMass * dt;
    body.vz += forceZ * invMass * dt;

    // Drag
    body.velocity.x *= 1 - 0.01;
    body.velocity.y *= 1 - 0.01;
    body.vz *= 1 - 0.015; // Air resistance Z

    // Update Position
    body.x += body.velocity.x * dt;
    body.y += body.velocity.y * dt;
    body.z += body.vz * dt;

    // Floor Collision (Safety / Bottoming out)
    const centerAppsH = this.getHeightAt(body.x, body.y, track);
    if (body.z < centerAppsH + 0.2) {
      // Hard floor collision
      body.z = centerAppsH + 0.2;
      if (body.vz < 0) body.vz = -body.vz * 0.2; // Bounce slightly
    }

    // Angular
    // Inertia Tensor approx (Box)
    // Ixx (Roll), Iyy (Pitch), Izz (Yaw)
    const Ixx = (CAR_CFG.mass * CAR_CFG.trackWidth ** 2) / 6; // Approx
    const Iyy = (CAR_CFG.mass * CAR_CFG.wheelBase ** 2) / 6;
    const Izz = (CAR_CFG.mass * (CAR_CFG.wheelBase ** 2 + CAR_CFG.trackWidth ** 2)) / 12;

    body.vRoll += (torqueRoll / Ixx) * dt;
    body.vPitch += (torquePitch / Iyy) * dt;
    body.angularVelocity += (torqueYaw / Izz) * dt;

    // Angular Damping
    body.vRoll *= 0.95;
    body.vPitch *= 0.95;
    body.angularVelocity *= 0.95;

    // Correct Pitch/Roll (Spring back to upright if in air? Or let it tumble?)
    // Real cars stabilize. Let's add a "Righting movement" if airborne or unstable?
    // Suspension usually handles it.
    // But we need to prevent flipping for fun arcade physics?
    if (wheelsOnGround === 0) {
      // Air Control (optional)
      // Damping
      body.vPitch *= 0.98;
      body.vRoll *= 0.98;

      // Self-Righting Torque (Arcade Magic)
      body.vRoll -= body.roll * 2.0 * dt;
      body.vPitch -= body.pitch * 2.0 * dt;
    }

    // Update Angles
    body.roll += body.vRoll * dt;
    body.pitch += body.vPitch * dt;
    body.angle += body.angularVelocity * dt;

    // Status
    body.skidding = isSkidding;
  }
}
