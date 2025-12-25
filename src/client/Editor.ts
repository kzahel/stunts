import * as THREE from 'three';
import { Track, TILE_SIZE, HEIGHT_STEP, TileType, MAX_HEIGHT, MIN_HEIGHT } from '../shared/Track';
import { GameRenderer } from './vis/Renderer';
import { UIManager } from './vis/UI';

export const EditorTool = {
  None: 0,
  Raise: 1,
  Lower: 2,
  Flatten: 3,
  Road: 4,
  Place: 5,
} as const;

export type EditorTool = (typeof EditorTool)[keyof typeof EditorTool];

export const PALETTE_ORDER: TileType[] = [
  TileType.Road,
  TileType.Grass,
  TileType.Dirt,
  TileType.Sand,
  TileType.Water,
  TileType.Snow,
];

export class Editor {
  private track: Track;
  private renderer: GameRenderer;
  private canvas: HTMLCanvasElement;
  private scene: THREE.Scene | null = null; // Scene reference

  private active: boolean = false;
  private currentTool: EditorTool = EditorTool.None;

  private selectedTileType: TileType = TileType.Road; // Palette Selection

  // Interaction State
  private mouseX: number = 0;
  private mouseY: number = 0;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Ground plane

  // Cursor State
  private currentTx: number = 0;
  private currentTy: number = 0;

  // Visuals
  private highlightMesh: THREE.Mesh;

  private ui: UIManager;

  private onMapChange: (() => void) | null = null;

  constructor(
    track: Track,
    renderer: GameRenderer,
    canvas: HTMLCanvasElement,
    ui: UIManager,
    onMapChange?: () => void,
  ) {
    this.track = track;
    this.renderer = renderer;
    this.canvas = canvas;
    this.ui = ui;
    this.onMapChange = onMapChange || null;

    // Square Brush (Tile Size)
    const geo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthTest: false, // Always show on top
      depthWrite: false,
    });
    geo.rotateX(-Math.PI / 2); // Flat
    this.highlightMesh = new THREE.Mesh(geo, mat);
    this.highlightMesh.visible = false;
    this.highlightMesh.renderOrder = 999;
  }

  public setScene(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.highlightMesh);
  }

  private notifyChange() {
    if (this.onMapChange) this.onMapChange();
  }

  public setTrack(track: Track) {
    this.track = track;
  }

  public setActive(active: boolean) {
    this.active = active;
    this.highlightMesh.visible = active;
    this.renderer.setEditorView(active);

    this.updateUI();
    console.log('Editor Active:', active);
  }

  public isActive(): boolean {
    return this.active;
  }

  public setTool(tool: EditorTool) {
    this.currentTool = tool;
    this.updateUI();
    console.log('Editor Tool:', tool);
  }

  public updateUI() {
    if (!this.active) {
      this.ui.updateEditorStatus(false, '');
      return;
    }

    let name = '';
    let color: string | null = null;
    let tileName = 'ROAD';

    // 1. Determine base tool name
    switch (this.currentTool) {
      case EditorTool.None:
        name = 'NONE (Use Buttons/Keys)';
        break;
      case EditorTool.Raise:
        name = 'RAISE (0)';
        break;
      case EditorTool.Lower:
        name = 'LOWER (1)';
        break;
      case EditorTool.Flatten:
        name = 'FLATTEN (2)';
        break;
      case EditorTool.Place:
        // For Place tool, show current selection prominently
        if (this.selectedTileType === TileType.Grass) tileName = 'GRASS';
        if (this.selectedTileType === TileType.Dirt) tileName = 'DIRT';
        if (this.selectedTileType === TileType.Sand) tileName = 'SAND';
        if (this.selectedTileType === TileType.Water) tileName = 'WATER';
        if (this.selectedTileType === TileType.Snow) tileName = 'SNOW';

        name = `PLACE [${tileName}] (3)`;
        color = this.getTileColor(this.selectedTileType);
        break;
    }

    // 2. Append Palette info if not Place tool (so user knows what's selected mainly)
    if (this.currentTool !== EditorTool.Place) {
      if (this.selectedTileType === TileType.Grass) tileName = 'GRASS';
      else if (this.selectedTileType === TileType.Dirt) tileName = 'DIRT';
      else if (this.selectedTileType === TileType.Sand) tileName = 'SAND';
      else if (this.selectedTileType === TileType.Water) tileName = 'WATER';
      else if (this.selectedTileType === TileType.Snow) tileName = 'SNOW';
      // Road is default

      name += ` | Palette: < ${tileName} >`;
      // Also show color for palette
      color = this.getTileColor(this.selectedTileType);
    }

    this.ui.updateEditorStatus(true, name, color);
  }

  private getTileColor(type: TileType): string {
    switch (type) {
      case TileType.Road:
        return '#555555';
      case TileType.Grass:
        return '#4caf50';
      case TileType.Dirt:
        return '#5d4037';
      case TileType.Sand:
        return '#fbc02d';
      case TileType.Water:
        return '#0277bd';
      case TileType.Snow:
        return '#eeeeee';
      default:
        return '#ffffff';
    }
  }

  public cycleTileType(direction: number) {
    if (!this.active) return;
    const idx = PALETTE_ORDER.indexOf(this.selectedTileType);
    let newIdx = (idx + direction) % PALETTE_ORDER.length;
    if (newIdx < 0) newIdx += PALETTE_ORDER.length;
    this.selectedTileType = PALETTE_ORDER[newIdx];
    this.updateUI();
  }

  public onMouseMove(e: MouseEvent) {
    if (!this.active) return;

    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  public update(_dt: number) {
    if (!this.active) return;

    // Raycast
    const mouseVec = new THREE.Vector2(this.mouseX, this.mouseY);
    this.raycaster.setFromCamera(mouseVec, this.renderer.getActiveCamera());
    const target = new THREE.Vector3();
    let hit = false;

    // 1. Try Terrain Mesh
    const intersects = this.raycaster.intersectObjects(
      this.renderer.getTrackGroup().children,
      false,
    );
    if (intersects.length > 0) {
      target.copy(intersects[0].point);
      hit = true;
    } else if (this.raycaster.ray.intersectPlane(this.plane, target)) {
      hit = true;
    }

    // Raycast against infinite plane for generic ground targeting
    if (hit) {
      // Snap to Tile Center
      const tx = Math.floor(target.x / TILE_SIZE);
      const ty = Math.floor(target.z / TILE_SIZE);
      this.updateHighlight(tx, ty);
    }
  }

  public setCursorFromWorld(x: number, z: number) {
    if (!this.active) return;
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(z / TILE_SIZE);
    this.updateHighlight(tx, ty);
  }

  public getCursorGridPosition(): { x: number; y: number } {
    return { x: this.currentTx, y: this.currentTy };
  }

  private updateHighlight(tx: number, ty: number) {
    this.currentTx = tx;
    this.currentTy = ty;

    // Snap Highlight
    const centerX = tx * TILE_SIZE + TILE_SIZE / 2;
    const centerZ = ty * TILE_SIZE + TILE_SIZE / 2;

    // Get roughly current height for cursor
    const baseH = this.track.getVertexHeight(tx, ty);

    this.highlightMesh.position.set(centerX, baseH + 0.5, centerZ);
  }

  private applyRaise(cx: number, cy: number) {
    // Get heights of 4 corners
    const corners = [
      { x: cx, y: cy },
      { x: cx + 1, y: cy },
      { x: cx + 1, y: cy + 1 },
      { x: cx, y: cy + 1 },
    ];

    let maxHeight = -Infinity;
    corners.forEach((c) => {
      const h = this.track.getVertexHeight(c.x, c.y);
      if (h > maxHeight) maxHeight = h;
    });

    // Check if all are max
    let allFlat = true;
    corners.forEach((c) => {
      if (this.track.getVertexHeight(c.x, c.y) < maxHeight - 0.01) allFlat = false;
    });

    if (!allFlat) {
      // Flatten to top
      corners.forEach((c) => this.track.setVertexHeight(c.x, c.y, maxHeight));
    } else {
      // Already flat, raise all if below MAX
      if (maxHeight < MAX_HEIGHT) {
        corners.forEach((c) => this.track.setVertexHeight(c.x, c.y, maxHeight + HEIGHT_STEP));
      }
    }

    // Propagate
    corners.forEach((c) => this.track.enforceSlopeConstraints(c.x, c.y));
    this.renderer.initTrackOrUpdate(this.track);
    this.notifyChange();
  }

  private applyLower(cx: number, cy: number) {
    const corners = [
      { x: cx, y: cy },
      { x: cx + 1, y: cy },
      { x: cx + 1, y: cy + 1 },
      { x: cx, y: cy + 1 },
    ];

    let minHeight = Infinity;
    corners.forEach((c) => {
      const h = this.track.getVertexHeight(c.x, c.y);
      if (h < minHeight) minHeight = h;
    });

    let allFlat = true;
    corners.forEach((c) => {
      if (this.track.getVertexHeight(c.x, c.y) > minHeight + 0.01) allFlat = false;
    });

    if (!allFlat) {
      // Flatten to bottom
      corners.forEach((c) => this.track.setVertexHeight(c.x, c.y, minHeight));
    } else {
      // Lower all if above MIN
      if (minHeight > MIN_HEIGHT) {
        corners.forEach((c) => this.track.setVertexHeight(c.x, c.y, minHeight - HEIGHT_STEP));
      }
    }

    corners.forEach((c) => this.track.enforceSlopeConstraints(c.x, c.y));
    this.renderer.initTrackOrUpdate(this.track);
    this.notifyChange();
  }

  public onMouseDown() {
    if (!this.active) return;

    // Use current cursor position (which was updated by mouse or gamepad)
    // But wait, if we click mouse, we want to ensure we target where the MOUSE is,
    // which might differ from where gamepad put it if we mix inputs.
    // However, usually update() runs before mousedown?
    // Actually mousedown event might happen between updates.
    // Ideally we re-raycast.

    // Discrete Action
    const mouseVec = new THREE.Vector2(this.mouseX, this.mouseY);
    this.raycaster.setFromCamera(mouseVec, this.renderer.getActiveCamera());

    const target = new THREE.Vector3();
    let hit = false;

    // ... Raycast logic duplicated or we trust the last update?
    // Let's re-run raycast logic to be safe for mouse clicks.

    // 1. Try Terrain Mesh
    const intersects = this.raycaster.intersectObjects(
      this.renderer.getTrackGroup().children,
      false,
    );
    if (intersects.length > 0) {
      target.copy(intersects[0].point);
      hit = true;
    } else if (this.raycaster.ray.intersectPlane(this.plane, target)) {
      hit = true;
    }

    if (hit) {
      const tx = Math.floor(target.x / TILE_SIZE);
      const ty = Math.floor(target.z / TILE_SIZE);
      this.executeTool(tx, ty, this.currentTool);
    }
  }

  public applyToolAtCursor(tool?: EditorTool) {
    if (!this.active) return;
    this.executeTool(this.currentTx, this.currentTy, tool ?? this.currentTool);
  }

  public executeTool(tx: number, ty: number, tool: EditorTool) {
    switch (tool) {
      case EditorTool.Raise:
        this.applyRaise(tx, ty);
        break;
      case EditorTool.Lower:
        this.applyLower(tx, ty);
        break;
      case EditorTool.Flatten:
        this.track.flattenRegion(tx, ty, 1, 0);
        this.renderer.initTrackOrUpdate(this.track);
        this.notifyChange();
        break;
      case EditorTool.Road:
        this.track.placeRoad(tx, ty);
        this.renderer.initTrackOrUpdate(this.track);
        this.notifyChange();
        break;
      case EditorTool.Place:
        if (this.selectedTileType === TileType.Road) {
          this.track.placeRoad(tx, ty); // Use smart road logic
        } else {
          // Retain height, just change type
          const current = this.track.getTile(tx, ty);
          const h = current ? current.height : 0;
          this.track.setTile(tx, ty, this.selectedTileType, h, 0);
        }
        this.renderer.initTrackOrUpdate(this.track);
        this.notifyChange();
        break;
    }
  }
}
