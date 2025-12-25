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

  constructor() {
    this.tiles = [];
    for (let x = 0; x < TRACK_SIZE; x++) {
      const col: TrackTile[] = [];
      for (let y = 0; y < TRACK_SIZE; y++) {
        col.push({ type: TileType.Grass, height: 0 });
      }
      this.tiles.push(col);
    }
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
}
