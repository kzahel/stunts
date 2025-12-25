export const TILE_SIZE = 10;
export const HEIGHT_STEP = TILE_SIZE / 4;

export const TileType = {
  Grass: 0,
  Road: 1,
  Start: 2,
  Finish: 3,
} as const;

export type TileType = (typeof TileType)[keyof typeof TileType];

export interface TrackTile {
  type: TileType;
  height: number; // 0 is ground
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
        col.push({ type: TileType.Grass, height: 0 });
      }
      this.tiles.push(col);
    }
    // Initialize height map with 0s
    this.heightMap = new Float32Array((TRACK_SIZE + 1) * (TRACK_SIZE + 1)).fill(0);
  }

  public setTile(x: number, y: number, type: TileType, height: number = 0) {
    if (x >= 0 && x < TRACK_SIZE && y >= 0 && y < TRACK_SIZE) {
      this.tiles[x][y] = { type, height };
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

  public getTileCornerHeights(x: number, y: number): { nw: number; ne: number; se: number; sw: number } {
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

  public serialize(): any {
    return {
      tiles: this.tiles,
      heightMap: Array.from(this.heightMap)
    };
  }

  public deserialize(data: any) {
    if (data.tiles) {
      // Deep copy or assign?
      // Type safety is minimal here for validation
      this.tiles = data.tiles;
    }
    if (data.heightMap && Array.isArray(data.heightMap)) {
      this.heightMap = new Float32Array(data.heightMap);
    }
  }
}
