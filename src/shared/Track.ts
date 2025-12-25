export const TILE_SIZE = 10;
export const HEIGHT_STEP = TILE_SIZE / 4;

export const TileType = {
  Grass: 0,
  Road: 1, // Straight
  RoadTurn: 2,
  RoadIntersection: 3,
  Start: 4,
  Finish: 5,
  Dirt: 6,
  Sand: 7,
  Water: 8,
  Snow: 9,
} as const;

export const MAX_HEIGHT_TILES = 2;
export const MIN_HEIGHT_TILES = -2;
export const MAX_HEIGHT = MAX_HEIGHT_TILES * TILE_SIZE; // 2 * 10 = 20
export const MIN_HEIGHT = MIN_HEIGHT_TILES * TILE_SIZE; // -2 * 10 = -20
// Note: Steps are TILE_SIZE / 4 = 2.5. So 8 steps up/down.

export type TileType = (typeof TileType)[keyof typeof TileType];

export interface TrackTile {
  type: TileType;
  height: number; // 0 is ground
  orientation: number; // 0, 1, 2, 3 (90 degree increments clockwise)
}

export const TRACK_SIZE = 30;

export class Track {
  public tiles: TrackTile[][];
  public heightMap: Float32Array; // (TRACK_SIZE + 1) * (TRACK_SIZE + 1) vertices

  constructor() {
    this.tiles = [];
    for (let x = 0; x < TRACK_SIZE; x++) {
      const col: TrackTile[] = [];
      for (let y = 0; y < TRACK_SIZE; y++) {
        col.push({ type: TileType.Grass, height: 0, orientation: 0 });
      }
      this.tiles.push(col);
    }
    // Initialize height map with 0s
    this.heightMap = new Float32Array((TRACK_SIZE + 1) * (TRACK_SIZE + 1)).fill(0);
  }

  public setTile(
    x: number,
    y: number,
    type: TileType,
    height: number = 0,
    orientation: number = 0,
  ) {
    if (x >= 0 && x < TRACK_SIZE && y >= 0 && y < TRACK_SIZE) {
      this.tiles[x][y] = { type, height, orientation };
    }
  }

  public getTile(x: number, y: number): TrackTile | null {
    if (x >= 0 && x < TRACK_SIZE && y >= 0 && y < TRACK_SIZE) {
      return this.tiles[x][y];
    }
    return null;
  }

  // Vertex Height Methods
  public getVertexHeight(vx: number, vy: number): number {
    if (vx < 0 || vx > TRACK_SIZE || vy < 0 || vy > TRACK_SIZE) return 0;
    return this.heightMap[vx * (TRACK_SIZE + 1) + vy];
  }

  public setVertexHeight(vx: number, vy: number, h: number) {
    if (vx < 0 || vx > TRACK_SIZE || vy < 0 || vy > TRACK_SIZE) return;
    this.heightMap[vx * (TRACK_SIZE + 1) + vy] = h;
  }

  public getTileCornerHeights(
    x: number,
    y: number,
  ): { nw: number; ne: number; se: number; sw: number } {
    // Tile (x, y) has corners:
    // NW: (x, y)
    // NE: (x+1, y)
    // SE: (x+1, y+1)
    // SW: (x, y+1)
    // Note: Depends on coordinate system convention.
    // Let's assume +X is Right, +Y is Down (2D array index).
    // In 3D World: x is X, y is Z.
    // NW (Top Left) -> 0,0
    return {
      nw: this.getVertexHeight(x, y),
      ne: this.getVertexHeight(x + 1, y),
      se: this.getVertexHeight(x + 1, y + 1),
      sw: this.getVertexHeight(x, y + 1),
    };
  }

  public smoothRegion(cx: number, cy: number, radius: number = 2) {
    // Simple average smoothing
    for (let x = cx - radius; x <= cx + radius; x++) {
      for (let y = cy - radius; y <= cy + radius; y++) {
        if (x < 0 || x > TRACK_SIZE || y < 0 || y > TRACK_SIZE) continue;

        let sum = 0;
        let count = 0;
        for (let nx = x - 1; nx <= x + 1; nx++) {
          for (let ny = y - 1; ny <= y + 1; ny++) {
            const h = this.getVertexHeight(nx, ny);
            sum += h;
            count++;
          }
        }
        if (count > 0) {
          const newVal = sum / count;
          // Blend current with new for softness
          const current = this.getVertexHeight(x, y);
          this.setVertexHeight(x, y, current * 0.5 + newVal * 0.5);
        }
      }
    }
  }

  public flattenRegion(cx: number, cy: number, radius: number = 2, targetHeight: number) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      for (let y = cy - radius; y <= cy + radius; y++) {
        if (x < 0 || x > TRACK_SIZE || y < 0 || y > TRACK_SIZE) continue;
        // Check distance for circle brush? Or square? Square is easier for tile alignment.
        this.setVertexHeight(x, y, targetHeight);
      }
    }
  }
  public enforceSlopeConstraints(startX: number, startY: number) {
    const queue: { x: number; y: number }[] = [];
    const visited = new Set<string>();

    queue.push({ x: startX, y: startY });
    visited.add(`${startX},${startY}`);

    const MAX_SLOPE = TILE_SIZE; // 45 degrees (Rise == Run)

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const hCurr = this.getVertexHeight(curr.x, curr.y);

      // Check all 4 neighbors
      const neighbors = [
        { x: curr.x - 1, y: curr.y },
        { x: curr.x + 1, y: curr.y },
        { x: curr.x, y: curr.y - 1 },
        { x: curr.x, y: curr.y + 1 },
      ];

      for (const n of neighbors) {
        if (n.x < 0 || n.x > TRACK_SIZE || n.y < 0 || n.y > TRACK_SIZE) continue;

        const hNiegh = this.getVertexHeight(n.x, n.y);
        const diff = hNiegh - hCurr;

        let needsUpdate = false;
        let newHeight = hNiegh;

        // If neighbor is too high, pull it down?
        // Or if current is too high, pull neighbor up?
        // User wants "smoother gradual ramps", so usually we PULL UP neighbors to meet the slope.
        // But if we Lower a peak, we might want to push down neighbors?
        // BFS propagation usually enforces: |h1 - h2| <= MAX_SLOPE
        // So h2 must be between [h1 - MAX, h1 + MAX]

        if (diff > MAX_SLOPE) {
          // Neighbor is too high relative to current: Pull Neighbor Down
          newHeight = hCurr + MAX_SLOPE;
          needsUpdate = true;
        } else if (diff < -MAX_SLOPE) {
          // Neighbor is too low relative to current: Pull Neighbor Up
          newHeight = hCurr - MAX_SLOPE;
          needsUpdate = true;
        }

        if (needsUpdate) {
          this.setVertexHeight(n.x, n.y, newHeight);
          if (!visited.has(`${n.x},${n.y}`)) {
            visited.add(`${n.x},${n.y}`);
            queue.push(n);
          }
        }
      }
    }
  }

  public isRoad(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    return (
      tile.type === TileType.Road ||
      tile.type === TileType.RoadTurn ||
      tile.type === TileType.RoadIntersection ||
      tile.type === TileType.Start ||
      tile.type === TileType.Finish
    );
  }

  public placeRoad(x: number, y: number) {
    if (x < 0 || x >= TRACK_SIZE || y < 0 || y >= TRACK_SIZE) return;

    // Force current to be a road (overwriting whatever was there)
    const current = this.getTile(x, y);
    if (current) {
      this.setTile(x, y, TileType.Road, current.height, 0);
    }

    // Update current and neighbors
    this.autoTile(x, y);
    this.autoTile(x - 1, y);
    this.autoTile(x + 1, y);
    this.autoTile(x, y - 1);
    this.autoTile(x, y + 1);
  }

  private autoTile(x: number, y: number) {
    if (!this.isRoad(x, y)) return;

    const n = this.isRoad(x, y - 1);
    const s = this.isRoad(x, y + 1);
    const e = this.isRoad(x + 1, y);
    const w = this.isRoad(x - 1, y);

    let type: TileType = TileType.Road; // Default
    let orientation = 0;

    // Bitmask: N=1, E=2, S=4, W=8
    let mask = 0;
    if (n) mask |= 1;
    if (e) mask |= 2;
    if (s) mask |= 4;
    if (w) mask |= 8;

    // Logic Map
    switch (mask) {
      case 0: // Isolated
      case 1: // N
      case 4: // S
      case 5: // N+S
        type = TileType.Road;
        orientation = 1; // Vertical
        break;
      case 2: // E
      case 8: // W
      case 10: // E+W
        type = TileType.Road;
        orientation = 0; // Horizontal
        break;

      // Turns
      case 3: // N+E => NE Corner (Turn that connects N and E).
        // In our system: Orient 0=NW?, 1=NE?, 2=SE?, 3=SW?
        // Need to verify standard orientation for turns.
        // Usually:
        // 0: NW (Connects N and W)
        // 1: NE (Connects N and E)
        // 2: SE (Connects S and E)
        // 3: SW (Connects S and W)
        type = TileType.RoadTurn;
        orientation = 1;
        break;
      case 6: // E+S => SE
        type = TileType.RoadTurn;
        orientation = 2;
        break;
      case 12: // S+W => SW
        type = TileType.RoadTurn;
        orientation = 3;
        break;
      case 9: // N+W => NW
        type = TileType.RoadTurn;
        orientation = 0;
        break;

      // Intersections (3-way or 4-way)
      // For now, map all >2 connections to Intersection
      case 7: // N+E+S (No W)
      case 11: // N+E+W (No S)
      case 13: // N+S+W (No E)
      case 14: // E+S+W (No N)
      case 15: // All
        type = TileType.RoadIntersection;
        orientation = 0;
        break;
    }

    const tile = this.getTile(x, y);
    if (tile) {
      tile.type = type;
      tile.orientation = orientation;
    }
  }

  public serialize(): SerializedTrack {
    return {
      tiles: this.tiles,
      heightMap: Array.from(this.heightMap),
    };
  }

  public deserialize(data: SerializedTrack) {
    if (data.tiles) {
      this.tiles = data.tiles;
    }
    if (data.heightMap && Array.isArray(data.heightMap)) {
      this.heightMap = new Float32Array(data.heightMap);
    }
  }
}

export interface SerializedTrack {
  tiles: TrackTile[][];
  heightMap: number[];
}
