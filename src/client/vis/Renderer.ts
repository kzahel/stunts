import * as THREE from 'three';
import type { WorldState, TrafficCar } from '../../shared/Schema';
import { Track, TRACK_SIZE, TileType, TILE_SIZE } from '../../shared/Track';
import { createWorldTexture, createWaterTexture } from './TextureGenerator';

export class GameRenderer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;

  private trackGroup: THREE.Group;
  private skidGroup: THREE.Group;

  private carMeshes: THREE.Group[] = [];

  private perspectiveCamera: THREE.PerspectiveCamera;
  private playerCameraModes: number[] = []; // 0: First, 1: Third, 2: Iso Fixed, 3: Iso Relative

  private track: Track | null = null; // Stored reference for height lookup
  private editorEnabled: boolean = false;
  private activeCamera: THREE.Camera;
  private worldTexture: THREE.CanvasTexture | null = null;
  private dedicatedWaterTexture: THREE.CanvasTexture | null = null;
  private waterGroup: THREE.Group | null = null;

  private trafficGroup: THREE.Group;
  private trafficMeshes = new Map<number, THREE.Group>();

  // ... (constructor remains mostly same, but remove single carMesh creation)

  public getPrimaryCamera(): THREE.Camera {
    return this.camera; // Default Ortho
  }

  public getCamera(): THREE.Camera {
    return this.camera;
  }

  public getTrackGroup(): THREE.Group {
    return this.trackGroup;
  }

  public get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  public getScene(): THREE.Scene {
    return this.scene;
  }

  public getActiveCamera(): THREE.Camera {
    return this.activeCamera;
  }

  constructor(container: HTMLElement) {
    // Basic Scene
    this.scene = new THREE.Scene();
    // ... (scene setup same)
    this.scene.background = new THREE.Color(0x87ceeb);

    // Camera
    // We will update camera per viewport in render()
    const aspect = container.clientWidth / container.clientHeight;
    const frustumSize = 40;
    this.camera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      (frustumSize * aspect) / -2,
      -100,
      2000,
    );

    this.perspectiveCamera = new THREE.PerspectiveCamera(100, aspect, 0.1, 1000);

    this.activeCamera = this.camera;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setScissorTest(true); // Enable scissor test for split screen
    container.appendChild(this.renderer.domElement);

    // Light (same)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    this.scene.add(dirLight);

    // Track Group
    this.skidGroup = new THREE.Group();
    this.scene.add(this.skidGroup);

    this.trackGroup = new THREE.Group();
    this.scene.add(this.trackGroup);

    this.trafficGroup = new THREE.Group();
    this.scene.add(this.trafficGroup);

    // Axes Helper
    const axesHelper = new THREE.AxesHelper(5);
    this.scene.add(axesHelper);

    window.addEventListener('resize', this.onWindowResize.bind(this, container), false);
  }

  private onWindowResize(container: HTMLElement) {
    const aspect = container.clientWidth / container.clientHeight;
    const frustumSize = 40;

    this.camera.left = (-frustumSize * aspect) / 2;
    this.camera.right = (frustumSize * aspect) / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = -frustumSize / 2;

    this.camera.updateProjectionMatrix();

    this.perspectiveCamera.aspect = aspect;
    this.perspectiveCamera.updateProjectionMatrix();

    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  public cycleCameraMode(playerIndex: number) {
    if (this.playerCameraModes[playerIndex] === undefined) {
      this.playerCameraModes[playerIndex] = 0;
    }
    this.playerCameraModes[playerIndex] = (this.playerCameraModes[playerIndex] + 1) % 4; // 4 modes
  }

  public initTrackOrUpdate(track: Track) {
    this.track = track;
    // Clear existing
    while (this.trackGroup.children.length > 0) {
      this.trackGroup.remove(this.trackGroup.children[0]);
    }
    // Clear Skids on track update
    while (this.skidGroup.children.length > 0) {
      this.skidGroup.remove(this.skidGroup.children[0]);
    }

    // Generate Texture
    const texture = createWorldTexture();
    texture.colorSpace = THREE.SRGBColorSpace;
    this.worldTexture = texture;

    // Dedicated Water Texture
    this.dedicatedWaterTexture = createWaterTexture();
    this.dedicatedWaterTexture.colorSpace = THREE.SRGBColorSpace;

    // Clear old water group if exists
    if (this.waterGroup) {
      this.trackGroup.remove(this.waterGroup);
    }
    this.waterGroup = new THREE.Group();
    this.trackGroup.add(this.waterGroup);

    const vertices: number[] = [];
    const uvs: number[] = [];

    const waterVertices: number[] = [];
    const waterUVs: number[] = [];

    // Helper to add Quad with UVs
    const addQuad = (
      targetVerts: number[],
      targetUVs: number[],
      x: number,
      y: number, // Grid Coordinates
      hNW: number,
      hNE: number,
      hSE: number,
      hSW: number,
      orientation: number,
      type: TileType,
      isWater: boolean,
    ) => {
      // Coordinates in World (Scale by TILE_SIZE)
      const x1 = x * TILE_SIZE;
      const z1 = y * TILE_SIZE; // Top Left (NW)

      const x2 = x * TILE_SIZE;
      const z2 = (y + 1) * TILE_SIZE; // Bot Left (SW)

      const x3 = (x + 1) * TILE_SIZE;
      const z3 = (y + 1) * TILE_SIZE; // Bot Right (SE)

      const x4 = (x + 1) * TILE_SIZE;
      const z4 = y * TILE_SIZE; // Top Right (NE)

      // Triangle 1: NW, SW, SE
      // Triangle 2: NW, SE, NE
      targetVerts.push(x1, hNW, z1);
      targetVerts.push(x2, hSW, z2);
      targetVerts.push(x3, hSE, z3);

      targetVerts.push(x1, hNW, z1);
      targetVerts.push(x3, hSE, z3);
      targetVerts.push(x4, hNE, z4);

      // UVs
      if (isWater) {
        // Simple UV mapping for repeating texture
        // Map whole tile to whole texture (0..1)
        // But maybe repeat it? 64x64 texture on 10x10 tile?
        // Let's use world coords for continuous water?
        // Or simple 0..1 per tile.
        targetUVs.push(0, 1);
        targetUVs.push(0, 0);
        targetUVs.push(1, 0);

        targetUVs.push(0, 1);
        targetUVs.push(1, 0);
        targetUVs.push(1, 1);
        return;
      }

      // UV Mapping
      // Atlas: 2x2
      // Grass (0): 0, 0.5 -> 0.5, 1.0 (Top Left)
      // Road (1): 0.5, 0.5 -> 1.0, 1.0 (Top Right)
      // Turn (2): 0, 0 -> 0.5, 0.5 (Bot Left)
      // Inter (3): 0.5, 0 -> 1.0, 0.5 (Bot Right)

      let uMin = 0;
      let vMin = 0;
      let uMax = 0.25;
      let vMax = 0.5;

      // Handle Start/Finish as Road for now
      let mappingType = type;
      if (type === TileType.Start || type === TileType.Finish) {
        mappingType = TileType.Road;
      }

      switch (mappingType) {
        case TileType.Grass:
          // Col 0, Top (0..0.25, 0.5..1.0)
          uMin = 0;
          vMin = 0.5;
          uMax = 0.25;
          vMax = 1.0;
          break;
        case TileType.RoadTurn:
          // Col 0, Bot (0..0.25, 0..0.5)
          uMin = 0;
          vMin = 0;
          uMax = 0.25;
          vMax = 0.5;
          break;
        case TileType.Road:
          // Col 1, Top (0.25..0.5, 0.5..1.0)
          uMin = 0.25;
          vMin = 0.5;
          uMax = 0.5;
          vMax = 1.0;
          break;
        case TileType.RoadIntersection:
          // Col 1, Bot (0.25..0.5, 0..0.5)
          uMin = 0.25;
          vMin = 0;
          uMax = 0.5;
          vMax = 0.5;
          break;
        case TileType.Dirt:
          // Col 2, Top (0.5..0.75, 0.5..1.0)
          uMin = 0.5;
          vMin = 0.5;
          uMax = 0.75;
          vMax = 1.0;
          break;
        case TileType.Sand:
          // Col 3, Top (0.75..1.0, 0.5..1.0)
          uMin = 0.75;
          vMin = 0.5;
          uMax = 1.0;
          vMax = 1.0;
          break;
        case TileType.Snow:
          // Col 3, Bot (0.75..1.0, 0..0.5)
          uMin = 0.75;
          vMin = 0;
          uMax = 1.0;
          vMax = 0.5;
          break;
        case TileType.Water:
          // Should be handled by isWater block above now?
          // Keeping just in case, but unused if we filter correctly.
          // Col 2, Bot (0.5..0.75, 0..0.5)
          uMin = 0.5;
          vMin = 0;
          uMax = 0.75;
          vMax = 0.5;
          break;
        default: // Grass default
          uMin = 0;
          vMin = 0.5;
          uMax = 0.25;
          vMax = 1.0;
          break;
      }

      // UV Corners:
      // NW (TopLeft in World) -> V=Max (Top in Texture) ?
      // Canvas Top is V=1 (if properly mapped) or V=0?
      // ThreeJS UV (0,0) is Bottom Left.
      // Canvas (0,0) is Top Left.
      // So Canvas Y=0 is UV V=1. Canvas Y=1 is UV V=0.
      // My Atlas definitions above assumed Canvas coords logic for "Top/Bot".
      // Grass (Top Left in Canvas): Y=0..0.5 => V=1..0.5.
      // So Grass V range is [0.5, 1.0].
      // Grass NW (Top Left Tile) maps to Texture Top Left (uMin, vMax).
      // Grass SW (Bot Left Tile) maps to Texture Bot Left (uMin, vMin).
      // Grass SE (Bot Right Tile) maps to Texture Bot Right (uMax, vMin).
      // Grass NE (Top Right Tile) maps to Texture Top Right (uMax, vMax).

      const uvNW = { u: uMin, v: vMax };
      const uvSW = { u: uMin, v: vMin };
      const uvSE = { u: uMax, v: vMin };
      const uvNE = { u: uMax, v: vMax };

      const baseCorners = [uvNW, uvSW, uvSE, uvNE];

      // Rotate Corners based on Orientation
      // Orientation 0: No Rotation.
      // Orientation 1: 90 deg CW.
      //   World NW gets Texture SW?
      //   Visual Rotation: We want the texture to rotate CW.
      //   If we assign UVs:
      //   NW maps to SW (uMin, vMin)
      //   NE maps to NW (uMin, vMax)
      //   SE maps to NE (uMax, vMax)
      //   SW maps to SE (uMax, vMin)
      //   Let's cycle the array.
      //   Indices: 0=NW, 1=SW, 2=SE, 3=NE.
      //   Rot 1 shifts indices?
      //   Let's do shift.

      // Rot 0: [NW, SW, SE, NE]
      // Rot 1: [SW, SE, NE, NW] (Texture's SW is at World NW)

      const rotatedCorners = [...baseCorners];

      for (let i = 0; i < orientation; i++) {
        const first = rotatedCorners.shift()!;
        rotatedCorners.push(first);
      }

      // vertices pushed: NW, SW, SE ... NW, SE, NE
      // indices in 'rotatedCorners': 0(NW), 1(SW), 2(SE), 3(NE)

      const cNW = rotatedCorners[0];
      const cSW = rotatedCorners[1];
      const cSE = rotatedCorners[2];
      const cNE = rotatedCorners[3];

      // Tri 1: NW, SW, SE
      targetUVs.push(cNW.u, cNW.v);
      targetUVs.push(cSW.u, cSW.v);
      targetUVs.push(cSE.u, cSE.v);

      // Tri 2: NW, SE, NE
      targetUVs.push(cNW.u, cNW.v);
      targetUVs.push(cSE.u, cSE.v);
      targetUVs.push(cNE.u, cNE.v);
    };

    for (let x = 0; x < TRACK_SIZE; x++) {
      for (let y = 0; y < TRACK_SIZE; y++) {
        const tile = track.getTile(x, y);
        if (!tile) continue;

        const corners = track.getTileCornerHeights(x, y);

        if (tile.type === TileType.Water) {
          addQuad(
            waterVertices,
            waterUVs,
            x,
            y,
            corners.nw,
            corners.ne,
            corners.se,
            corners.sw,
            tile.orientation,
            tile.type,
            true,
          );
        } else {
          addQuad(
            vertices,
            uvs,
            x,
            y,
            corners.nw,
            corners.ne,
            corners.se,
            corners.sw,
            tile.orientation,
            tile.type,
            false,
          );
        }
      }
    }

    // Create Mesh
    const createMesh = (
      verts: number[],
      uvCoords: number[],
      tex: THREE.Texture,
      parent: THREE.Group,
    ) => {
      if (verts.length === 0) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvCoords, 2));
      geo.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        color: 0xffffff,
        side: THREE.FrontSide,
        flatShading: false, // Smooth shading looks better on curved road? Or keep flat.
        // Standard Material works with lights.
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      parent.add(mesh);
    };

    createMesh(vertices, uvs, this.worldTexture, this.trackGroup);

    // Create Water Mesh
    if (this.waterGroup) {
      createMesh(waterVertices, waterUVs, this.dedicatedWaterTexture, this.waterGroup);
    }
  }

  private createCarMesh(color: number): THREE.Group {
    const group = new THREE.Group();

    // Materials
    const bodyMat = new THREE.MeshStandardMaterial({ color });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x333333 }); // Tires/Spoiler parts

    // 1. Narrow Body
    // Original was 2 wide, 1 high, 4 long. Let's make it narrower and lower.
    const bodyGeo = new THREE.BoxGeometry(1.0, 0.6, 4.2);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5; // Lift up slightly
    body.castShadow = true;
    group.add(body);

    // 2. Cockpit / Engine bump (behind driver)
    const cockpitGeo = new THREE.BoxGeometry(0.9, 0.4, 1.5);
    const cockpit = new THREE.Mesh(cockpitGeo, bodyMat);
    cockpit.position.set(0, 0.9, -0.5); // Slightly back and up
    group.add(cockpit);

    // 3. Wheels (Open wheel style)
    // Cylinder oriented along Z by default, we need to rotate it to be an axle along X
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.4, 16);
    wheelGeo.rotateZ(Math.PI / 2);

    const wheelOffsets = [
      { x: -0.9, z: 1.2 }, // Front Left
      { x: 0.9, z: 1.2 }, // Front Right
      { x: -0.9, z: -1.4 }, // Rear Left
      { x: 0.9, z: -1.4 }, // Rear Right
    ];

    wheelOffsets.forEach((offset) => {
      const wheel = new THREE.Mesh(wheelGeo, blackMat);
      wheel.position.set(offset.x, 0.4, offset.z);
      // Name wheels to find them later. Front are index 0,1 (z > 0)
      if (offset.z > 0) {
        wheel.name = 'WheelFront';
      } else {
        wheel.name = 'WheelRear';
      }
      wheel.castShadow = true;
      group.add(wheel);
    });

    // 4. Rear Spoiler
    const spoilerZ = -1.9;

    // Struts
    const strutGeo = new THREE.BoxGeometry(0.1, 0.5, 0.1);
    const strutL = new THREE.Mesh(strutGeo, blackMat);
    strutL.position.set(-0.3, 1.0, spoilerZ);
    group.add(strutL);

    const strutR = new THREE.Mesh(strutGeo, blackMat);
    strutR.position.set(0.3, 1.0, spoilerZ);
    group.add(strutR);

    // Wing
    const wingGeo = new THREE.BoxGeometry(2.2, 0.1, 0.6);
    const wing = new THREE.Mesh(wingGeo, bodyMat); // Wing matches car color usually
    wing.position.set(0, 1.3, spoilerZ);
    group.add(wing);

    // 5. Front Spoiler (Wing)
    const frontWingGeo = new THREE.BoxGeometry(2.0, 0.1, 0.5);
    const frontWing = new THREE.Mesh(frontWingGeo, bodyMat);
    frontWing.position.set(0, 0.2, 2.1);
    group.add(frontWing);

    return group;
  }

  private updateCarMeshes(count: number) {
    // Add needed
    while (this.carMeshes.length < count) {
      // Give different colors
      const colors = [0xff0000, 0x0000ff, 0x00ff00, 0xffff00];
      const color = colors[this.carMeshes.length % colors.length];

      const mesh = this.createCarMesh(color);
      this.scene.add(mesh);
      this.carMeshes.push(mesh);
    }
    // Remove excess (optional, or just hide)
    // For now we just keep them added.
  }

  private createTrafficCarMesh(color: number, type: number): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color });
    const black = new THREE.MeshStandardMaterial({ color: 0x333333 });

    // Simple Box Car
    // Types could vary geometry slightly?
    // Type 0: Sedan (Low)
    // Type 1: Truck (High)
    // Type 2: Van (Boxy)

    let bodyGeo;
    let cabinGeo;

    if (type === 1) {
      // Truck
      bodyGeo = new THREE.BoxGeometry(1.2, 0.8, 4.0);
      cabinGeo = new THREE.BoxGeometry(1.2, 0.6, 1.5);
    } else {
      // Sedan
      bodyGeo = new THREE.BoxGeometry(1.2, 0.6, 3.5);
      cabinGeo = new THREE.BoxGeometry(1.0, 0.5, 1.2);
    }

    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.5;
    body.castShadow = true;
    group.add(body);

    const cabin = new THREE.Mesh(cabinGeo, mat);
    cabin.position.set(0, 0.9, -0.2);
    cabin.castShadow = true;
    group.add(cabin);

    // Wheels
    const wGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
    wGeo.rotateZ(Math.PI / 2);
    const wPos = [
      { x: -0.7, z: 1.0 },
      { x: 0.7, z: 1.0 },
      { x: -0.7, z: -1.0 },
      { x: 0.7, z: -1.0 },
    ];

    wPos.forEach((p) => {
      const w = new THREE.Mesh(wGeo, black);
      w.position.set(p.x, 0.35, p.z);
      group.add(w);
    });

    return group;
  }

  private updateTrafficMeshes(traffic: TrafficCar[]) {
    const activeIds = new Set<number>();

    traffic.forEach((car) => {
      activeIds.add(car.id);
      let mesh = this.trafficMeshes.get(car.id);
      if (!mesh) {
        mesh = this.createTrafficCarMesh(car.color, car.type);
        this.trafficGroup.add(mesh);
        this.trafficMeshes.set(car.id, mesh);
      }

      // Update Position
      // Similar to player car
      mesh.position.set(car.x, 0, car.y); // Ground height 0 approx? Or use getHeight?
      // Traffic on road is usually at known height if flat.
      // But map is 3D.
      const h = this.getHeightAt(car.x, car.y);
      mesh.position.y = h;

      // Rotation
      // Yaw: -angle + PI/2 ? Same as player
      mesh.rotation.y = -car.angle + Math.PI / 2;

      // Pitch/Roll? Simple traffic usually doesn't need complex physics tilt
      // unless we calculate partials.
      // Let's just align to Normal?
      // Align Up Vector to Normal
      // mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), normal);
      // And rotate Y? Mixing lookAt and Up is tricky.
      // Simpler: Just allow it to clip slightly or set y offset.
    });

    // Cleanup
    for (const [id, mesh] of this.trafficMeshes) {
      if (!activeIds.has(id)) {
        this.trafficGroup.remove(mesh);
        this.trafficMeshes.delete(id);
      }
    }
  }

  // Helper to interpolate height at visual position
  private getHeightAt(worldX: number, worldY: number): number {
    if (!this.track) return 0;

    // Identical to Physics Logic
    const x = worldX / TILE_SIZE;
    const y = worldY / TILE_SIZE;

    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const u = x - tx;
    const v = y - ty;

    const corners = this.track.getTileCornerHeights(tx, ty);

    const hTop = corners.nw * (1 - u) + corners.ne * u;
    const hBot = corners.sw * (1 - u) + corners.se * u;
    return hTop * (1 - v) + hBot * v;
  }

  // Helper to get Normal
  private getNormalAt(worldX: number, worldY: number): THREE.Vector3 {
    if (!this.track) return new THREE.Vector3(0, 1, 0);

    const h = this.getHeightAt(worldX, worldY);
    const hx = this.getHeightAt(worldX + 0.1, worldY);
    const hy = this.getHeightAt(worldX, worldY + 0.1);

    const nx = -(hx - h) * 10;
    const ny = -(hy - h) * 10;
    const nz = 1;

    return new THREE.Vector3(nx, nz, ny).normalize(); // Swapped Y/Z for ThreeJS
    // ThreeJS: Y is Up. Physics: Z (height) is Up.
    // Our Physics calculation returned (Nx, Ny, Nz) where Z was height.
    // ThreeJS Vector: (Nx, Nz, Ny) because Y is Height.
  }

  public render(state: WorldState, _alpha: number) {
    // Animate Water (Texture Offset)
    if (this.dedicatedWaterTexture) {
      // Flow direction
      this.dedicatedWaterTexture.offset.y += 0.002;
      this.dedicatedWaterTexture.offset.x += 0.001;
    }

    this.updateCarMeshes(state.players.length);
    this.updateTrafficMeshes(state.traffic);

    // Update all car positions
    state.players.forEach((player, i) => {
      const group = this.carMeshes[i];

      // Use Physics Position directly (3D)
      group.position.set(player.x, player.z - 0.6, player.y); // Visual offset to align wheels with ground (Model Center vs Physics COM)

      // Orientation (Yaw, Pitch, Roll)
      // Order: Yaw (Y) -> Pitch (X) -> Roll (Z)
      // ThreeJS Rotation Order is usually 'XYZ'.
      // Our Physics Mappings:
      // Yaw 'angle' -> Around Y axis (since Y is Up in ThreeJS world, although we verified Y=Z earlier?)
      // Wait, let's verify Coordinates transform.
      // Physics: X,Y ground, Z height.
      // ThreeJS: X right, Y up, Z forward?
      // Renderer Setup:
      //   addQuad: params (x, y, cornerHeights).
      //   vertices.push(x1, hNW, z1) -> (X, Y, Z).
      //   So Height is Y in ThreeJS. Ground is X,Z.
      //   Physics X -> ThreeJS X.
      //   Physics Y -> ThreeJS Z.
      //   Physics Z -> ThreeJS Y.

      // Position Set: (player.x, player.z, player.y) -> Correct.

      // Rotation:
      // Physics Yaw (angle) is rotation around Z (Up). -> ThreeJS 'Y'.
      // Physics Pitch (pitch) is rotation around Y (Right? No, Y is Left) -> ThreeJS 'X'?
      // Physics Roll (roll) is rotation around X (Forward) -> ThreeJS 'Z'?

      // Let's assume standard vehicle set:
      // Yaw: around vertical axis. (ThreeJS Y).
      //   Physics Angle 0 = +X. +Angle = CCW.
      //   ThreeJS: Rotate Y. +Angle = CCW around Y.
      //   Car Model faces -Z. +X is -90deg.
      //   So RotY = -angle + PI/2.

      // Pitch: Nose Up. Rotation around "Transverse" axis (World Z in ThreeJS? or Local X?)
      //   Local X axis of Car Model (Right/Left).
      //   Car faces -Z.
      //   So Right is -X.
      //   Nose UP -> Rotate around -X by +Pitch?
      //   Or Rotate around X by -Pitch.

      // Roll: Tilt Left/Right. Rotation around "Longitudinal" axis (Local Z in ThreeJS? -Z)
      //   Car faces -Z.
      //   Roll Right -> Clockwise looking forward.
      //   Physics Roll: Check direction.
      //   Used (w.ly * Force). Left wheel pushes UP -> +Roll Torque.
      //   If +Roll, Left side goes up. Car tilts Right.
      //   So +Roll is "Roll Right".
      //   ThreeJS: Rotate around -Z.
      //   Looking down -Z. CCW is +.
      //   We want Clockwise. So -Roll?

      // Let's use Quaternions to be safe.
      const qYaw = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        -player.angle + Math.PI / 2,
      );
      const qPitch = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        -player.pitch,
      ); // Adjust sign: Physics +Pitch is Up, Renderer +Pitch is Down
      const qRoll = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        player.roll,
      ); // Adjust sign: Physics -Roll is LeftUp, Renderer -Roll is LeftUp

      // Order: Yaw -> Pitch -> Roll?
      // group.quaternion.copy(qYaw.multiply(qPitch).multiply(qRoll));
      // Note: multiply applies right-to-left in local? qA.multiply(qB) -> apply A then B?
      // ThreeJS: qA * qB means Apply B then A.
      // We want: Local Roll, then Local Pitch, then World Yaw.
      // qTotal = qYaw * qPitch * qRoll

      const qTotal = qYaw.clone();
      qTotal.multiply(qPitch);
      qTotal.multiply(qRoll);

      group.quaternion.copy(qTotal);

      // Update Wheel Rotation (Steering)
      group.children.forEach((child) => {
        if (child.name === 'WheelFront') {
          child.rotation.y = -(player.steer || 0) * 0.5;
        }
      });

      group.visible = true;

      // Skid Marks
      if (player.skidding) {
        // Physics Angle
        const angle = player.angle;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Rear Wheel Offsets (Physics space)
        // x = -1.25, y = +/- 0.8

        const offsets = [
          { x: -1.25, y: -0.8 },
          { x: -1.25, y: 0.8 },
        ];

        const mat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide });
        const geo = new THREE.PlaneGeometry(0.5, 0.5);
        // Plane is XY. Flat on ground -> Rotate X.
        // BUT we want it to match slope!
        // For simple skids, just laying flat (horizontal) is okay if slope is small, but might clip.
        // Better: Position at terrain height + offset.

        // geo.rotateX(-Math.PI / 2); // Flat on ground (Normal +Y)

        offsets.forEach((off) => {
          const wx = player.x + (cos * off.x - sin * off.y);
          const wy = player.y + (sin * off.x + cos * off.y);
          const wh = this.getHeightAt(wx, wy);

          const mark = new THREE.Mesh(geo, mat);
          mark.position.set(wx, wh + 0.05, wy);

          // Align with slope
          const markNormal = this.getNormalAt(wx, wy);
          const qMark = new THREE.Quaternion();
          qMark.setFromUnitVectors(new THREE.Vector3(0, 0, 1), markNormal); // Plane default normal is +Z? No +Z.
          // PlaneGeometry default: in XY plane. Normal is +Z. We want Normal to match Terrain Normal (+Y approx).
          // So rotate geometry X -90 first? Or use quaternion?
          // If we use LookAt, it's easier.

          // Actually, let's just make geometry flat on XZ initially
          // geo.rotateX(-Math.PI / 2); => Normal becomes +Y.
          // qMark.setFromUnitVectors(Vector3(0,1,0), markNormal).

          // Wait, simpler:
          mark.lookAt(wx + markNormal.x, wh + markNormal.y + 1, wy + markNormal.z); // This is weird.
          // LookAt aligns +Z axis.

          // Let's rely on billboards or just standard rotation.
          mark.rotation.x = -Math.PI / 2; // Flat
          // Add random rotation Y
          mark.rotation.y = Math.random() * Math.PI; // Or align with velocity

          // Slope correction (hacky):
          // If steep, it clips.
          // Proper: Align Up vector.

          this.skidGroup.add(mark);
        });

        // Limit total skids to prevent crash
        if (this.skidGroup.children.length > 500) {
          // Reduced limit
          this.skidGroup.remove(this.skidGroup.children[0]);
          this.skidGroup.remove(this.skidGroup.children[0]);
        }
      }
    });

    // Hide unused cars
    for (let i = state.players.length; i < this.carMeshes.length; i++) {
      this.carMeshes[i].visible = false;
    }

    const width = this.renderer.domElement.width;
    const height = this.renderer.domElement.height;
    const playerCount = state.players.length;

    // Viewports Config
    const viewports: { x: number; y: number; w: number; h: number }[] = [];

    if (this.editorEnabled) {
      viewports.push({ x: 0, y: 0, w: width, h: height });
    } else if (playerCount === 1) {
      viewports.push({ x: 0, y: 0, w: width, h: height });
    } else if (playerCount === 2) {
      // Split Vertical (Left/Right)
      viewports.push({ x: 0, y: 0, w: width / 2, h: height });
      viewports.push({ x: width / 2, y: 0, w: width / 2, h: height });
    } else {
      // 4 Corners (Top Left, Top Right, Bottom Left, Bottom Right)
      // 0: Bottom Left, 1: Bottom Right, 2: Top Left, 3: Top Right (standard GL coords?)
      // Three.js setScissor (x, y, w, h) where x,y is lower-left corner
      const w = width / 2;
      const h = height / 2;
      viewports.push({ x: 0, y: h, w, h }); // Top Left
      viewports.push({ x: w, y: h, w, h }); // Top Right
      viewports.push({ x: 0, y: 0, w, h }); // Bottom Left
      viewports.push({ x: w, y: 0, w, h }); // Bottom Right
    }

    viewports.forEach((vp, i) => {
      if (i >= playerCount) return;
      const player = state.players[i];

      // Initialize mode if needed
      if (this.playerCameraModes[i] === undefined) {
        // Default to Mode 2 (Iso Fixed) to match original behavior
        this.playerCameraModes[i] = 2;
      }
      const mode = this.playerCameraModes[i];

      const vpAspect = vp.w / vp.h;
      this.renderer.setViewport(vp.x, vp.y, vp.w, vp.h);
      this.renderer.setScissor(vp.x, vp.y, vp.w, vp.h);

      let activeCamera: THREE.Camera;

      // Calculate Car Forward Vector
      // Physics Angle: 0 = +X, CCW.
      // Vector: (cos(a), 0, sin(a))
      const angle = player.angle;
      const fwdX = Math.cos(angle);
      const fwdZ = Math.sin(angle);
      const h = this.getHeightAt(player.x, player.y);

      if (mode === 0) {
        // Mode 0: First Person (Perspective)
        // Tune: FOV 100, Pos slightly back (-0.2), Look slightly down (Y=0.5 target)
        this.perspectiveCamera.aspect = vpAspect;
        this.perspectiveCamera.updateProjectionMatrix();

        this.perspectiveCamera.position.set(
          player.x - fwdX * 0.2,
          h + 1.1, // Eye height rel to terrain of car
          player.y - fwdZ * 0.2,
        );
        this.perspectiveCamera.lookAt(
          player.x + fwdX * 20,
          h + 0.5, // Look slightly down
          player.y + fwdZ * 20,
        );
        activeCamera = this.perspectiveCamera;
      } else if (mode === 1) {
        // Mode 1: Third Person (Perspective)
        // Pos: Car - Fwd*8 + Up*4
        this.perspectiveCamera.aspect = vpAspect;
        this.perspectiveCamera.updateProjectionMatrix();

        this.perspectiveCamera.position.set(player.x - fwdX * 8, h + 4, player.y - fwdZ * 8);
        this.perspectiveCamera.lookAt(player.x, h + 1, player.y);
        activeCamera = this.perspectiveCamera;
      } else if (mode === 3) {
        // Mode 3: Iso Relative (Car Faces Up) (Orthographic)
        // Basically a Chase Cam but with Ortho
        const frustumSize = 40;
        this.camera.left = (-frustumSize * vpAspect) / 2;
        this.camera.right = (frustumSize * vpAspect) / 2;
        this.camera.top = frustumSize / 2;
        this.camera.bottom = -frustumSize / 2;
        this.camera.updateProjectionMatrix();

        // Position camera "behind" the car in 3D space, looked down at 45 deg?
        // To make car face UP on 2D screen, the camera needs to look from "behind" the car.
        // And since it is Iso, we want a diagonal down look.
        // Let's try placing camera -20 units behind car vector, and +20 up.

        this.camera.position.set(player.x - fwdX * 200, h + 200, player.y - fwdZ * 200);
        this.camera.lookAt(player.x, h, player.y);
        activeCamera = this.camera;
      } else {
        // Mode 2 (Default): Iso Fixed (Orthographic)
        const frustumSize = 40;
        this.camera.left = (-frustumSize * vpAspect) / 2;
        this.camera.right = (frustumSize * vpAspect) / 2;
        this.camera.top = frustumSize / 2;
        this.camera.bottom = -frustumSize / 2;
        this.camera.updateProjectionMatrix();

        // Fixed offset (-200, 200, -200) - Moving back to avoid near clipping on high terrain
        this.camera.position.set(player.x - 200, h + 200, player.y - 200);
        this.camera.lookAt(player.x, h, player.y);
        activeCamera = this.camera;
      }

      this.activeCamera = activeCamera;
      this.renderer.render(this.scene, activeCamera);
    });
  }
  public setEditorView(enabled: boolean) {
    this.editorEnabled = enabled;
    // Zoom out for editor
    const frustumSize = enabled ? 80 : 40; // Double size = Zoom out
    const aspect = this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight;

    this.camera.left = (-frustumSize * aspect) / 2;
    this.camera.right = (frustumSize * aspect) / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = -frustumSize / 2;
    this.camera.updateProjectionMatrix();
  }
}
