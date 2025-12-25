import type { TrafficCar, WorldState } from '../shared/Schema';
import { Track, TILE_SIZE, TileType } from '../shared/Track';

export class TrafficManager {
  private static readonly MAX_CARS = 5; // User asked for ~5 cars
  private static readonly LANE_OFFSET = TILE_SIZE * 0.25; // Quarter tile width offset
  private static readonly STOP_DURATION = 1.62; // Seconds to stop at intersection
  private static readonly MIN_SPEED = 8; // Faster (was 2)
  private static readonly MAX_SPEED = 15; // Faster (was 5)

  // Keep track of internal state not in Schema (like stop timers)
  // Map car ID to state
  private carStates = new Map<
    number,
    {
      stopTimer: number;
      turning: boolean;
      targetX: number;
      targetY: number;
    }
  >();
  private nextId = 1;

  public populate(state: WorldState, track: Track) {
    // Collect all valid road tiles
    const roadTiles: { x: number; y: number }[] = [];
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) {
        if (track.isRoad(x, y)) {
          roadTiles.push({ x, y });
        }
      }
    }

    // Shuffle
    for (let i = roadTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roadTiles[i], roadTiles[j]] = [roadTiles[j], roadTiles[i]];
    }

    // Spawn cars
    let spawned = 0;
    for (const tile of roadTiles) {
      if (spawned >= TrafficManager.MAX_CARS) break;
      if (this.spawnCarAt(state, track, tile.x, tile.y)) {
        spawned++;
      }
    }
    console.log(`Spawned ${spawned} traffic cars.`);
  }

  private spawnCarAt(state: WorldState, track: Track, rx: number, ry: number): boolean {
    const validDirs = track.getTrafficDirections(rx, ry);
    if (validDirs.length === 0) return false;

    const dirIndex = Math.floor(Math.random() * validDirs.length);
    const dir = validDirs[dirIndex];

    let angle = 0;
    if (dir === 0) angle = -Math.PI / 2;
    else if (dir === 1) angle = 0;
    else if (dir === 2) angle = Math.PI / 2;
    else if (dir === 3) angle = Math.PI;

    const ox = -Math.sin(angle) * TrafficManager.LANE_OFFSET;
    const oy = Math.cos(angle) * TrafficManager.LANE_OFFSET;

    const cx = rx * TILE_SIZE + TILE_SIZE / 2;
    const cy = ry * TILE_SIZE + TILE_SIZE / 2;
    const x = cx + ox;
    const y = cy + oy;

    // Check Overlap
    for (const other of state.traffic) {
      const dx = other.x - x;
      const dy = other.y - y;
      if (dx * dx + dy * dy < TILE_SIZE * TILE_SIZE) return false;
    }

    const speed =
      TrafficManager.MIN_SPEED +
      Math.random() * (TrafficManager.MAX_SPEED - TrafficManager.MIN_SPEED);
    const color = Math.floor(Math.random() * 0xffffff);

    const newCar: TrafficCar = {
      id: this.nextId++,
      x,
      y,
      angle,
      speed,
      color,
      type: Math.floor(Math.random() * 3),
    };

    state.traffic.push(newCar);
    // Not turning initially, moving straight
    this.carStates.set(newCar.id, {
      stopTimer: 0,
      turning: false,
      targetX: 0,
      targetY: 0,
    });
    return true;
  }

  public update(state: WorldState, track: Track, dt: number) {
    // 2. Update Cars
    for (let i = state.traffic.length - 1; i >= 0; i--) {
      const car = state.traffic[i];
      const alive = this.updateCar(car, track, dt);
      if (!alive) {
        state.traffic.splice(i, 1);
        this.carStates.delete(car.id);
      }
    }
  }

  // Helper removed (spawnCar) - merged into populate/spawnCarAt

  private updateCar(car: TrafficCar, track: Track, dt: number): boolean {
    const carState = this.carStates.get(car.id) || {
      stopTimer: 0,
      turning: false,
      targetX: 0,
      targetY: 0,
    };

    if (carState.stopTimer > 0) {
      carState.stopTimer -= dt;
      return true;
    }

    const gx = Math.floor(car.x / TILE_SIZE);
    const gy = Math.floor(car.y / TILE_SIZE);

    // Bounds check
    if (gx < 0 || gx >= 30 || gy < 0 || gy >= 30) return false;

    const cx = gx * TILE_SIZE + TILE_SIZE / 2;
    const cy = gy * TILE_SIZE + TILE_SIZE / 2;

    // Check intersection trigger
    // Distance to center of current tile
    const dx = cx - car.x;
    const dy = cy - car.y;
    const distToCenter = Math.sqrt(dx * dx + dy * dy);

    // Moving towards center?
    const vx = Math.cos(car.angle);
    const vy = Math.sin(car.angle);
    const dot = dx * vx + dy * vy;

    // Trigger turning logic if close to center and moving towards it (or already turning)
    // If not turning, and close to center (within 4 units), and moving TOWARDS it.
    // TILE_SIZE=10. Center is 5. Lane is 2.5 away.
    // So we are 2.5 units away. 4 is safe.
    if (!carState.turning && distToCenter < 4 && dot > 0) {
      // Start Turning Sequence

      // Find Exits
      const exits = track.getTrafficDirections(gx, gy);

      // Current Dir
      let currentDir = -1;
      const a = (car.angle + Math.PI * 4) % (Math.PI * 2);
      if (a < 0.1 || a > 6.2)
        currentDir = 1; // E
      else if (Math.abs(a - Math.PI / 2) < 0.1)
        currentDir = 2; // S
      else if (Math.abs(a - Math.PI) < 0.1)
        currentDir = 3; // W
      else if (Math.abs(a - 1.5 * Math.PI) < 0.1) currentDir = 0; // N

      const reverseDir = (currentDir + 2) % 4;
      let choices = exits.filter((d) => d !== reverseDir);
      if (choices.length === 0) choices = exits;

      if (choices.length === 0) return false; // Dead

      // Pick Next Dir
      const nextDir = choices[Math.floor(Math.random() * choices.length)];

      // Stop Chance
      const tile = track.getTile(gx, gy);
      if (tile?.type === TileType.RoadIntersection && Math.random() < 0.5) {
        carState.stopTimer = TrafficManager.STOP_DURATION;
      }

      // Calculate Target Point (Entry of NEXT lane)
      // Next Tile
      let nx = gx;
      let ny = gy;
      if (nextDir === 0) ny--;
      else if (nextDir === 1) nx++;
      else if (nextDir === 2) ny++;
      else if (nextDir === 3) nx--;

      // Next Center
      const ncx = nx * TILE_SIZE + TILE_SIZE / 2;
      const ncy = ny * TILE_SIZE + TILE_SIZE / 2;

      // Offset for Next Dir
      let nAngle = 0;
      if (nextDir === 0) nAngle = -Math.PI / 2;
      else if (nextDir === 1) nAngle = 0;
      else if (nextDir === 2) nAngle = Math.PI / 2;
      else if (nextDir === 3) nAngle = Math.PI;

      const nox = -Math.sin(nAngle) * TrafficManager.LANE_OFFSET;
      const noy = Math.cos(nAngle) * TrafficManager.LANE_OFFSET;

      // Target is somewhere "into" the next lane?
      // Actually, aim for the ideal point in the next tile.
      carState.targetX = ncx + nox;
      carState.targetY = ncy + noy;
      carState.turning = true;

      this.carStates.set(car.id, carState);
      return true;
    }

    if (carState.turning) {
      // Steering behavior towards target
      const tx = carState.targetX - car.x;
      const ty = carState.targetY - car.y;
      const dist = Math.sqrt(tx * tx + ty * ty);

      if (dist < 1.0) {
        // Arrived
        carState.turning = false;

        // Snap angle to nearest cardinal
        const snapAngle = Math.round(car.angle / (Math.PI / 2)) * (Math.PI / 2);
        car.angle = snapAngle;
      } else {
        // Steer
        const desiredAngle = Math.atan2(ty, tx);
        // Lerp angle
        let dAngle = desiredAngle - car.angle;
        while (dAngle > Math.PI) dAngle -= 2 * Math.PI;
        while (dAngle < -Math.PI) dAngle += 2 * Math.PI;

        // Turn speed
        const turnRate = 5.0 * dt; // radians per sec
        if (Math.abs(dAngle) < turnRate) {
          car.angle = desiredAngle;
        } else {
          car.angle += Math.sign(dAngle) * turnRate;
        }
      }
    }

    // Move
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;

    this.carStates.set(car.id, carState);
    return true;
  }
}
