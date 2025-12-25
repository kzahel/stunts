import * as THREE from 'three';
import type { WorldState } from '../../shared/Schema';
import { Track, TRACK_SIZE, TileType } from '../../shared/Track';

export class GameRenderer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;

  private trackGroup: THREE.Group;

  private carMeshes: THREE.Group[] = [];

  private perspectiveCamera: THREE.PerspectiveCamera;
  private playerCameraModes: number[] = []; // 0: First, 1: Third, 2: Iso Fixed, 3: Iso Relative

  // ... (constructor remains mostly same, but remove single carMesh creation)

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
      frustumSize / -2,
      1,
      1000,
    );

    this.perspectiveCamera = new THREE.PerspectiveCamera(100, aspect, 0.1, 1000);

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
    this.trackGroup = new THREE.Group();
    this.scene.add(this.trackGroup);

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
    // Clear existing
    while (this.trackGroup.children.length > 0) {
      this.trackGroup.remove(this.trackGroup.children[0]);
    }

    // Geometry cache
    const darkGreen = new THREE.MeshStandardMaterial({ color: 0x006400 });
    const grey = new THREE.MeshStandardMaterial({ color: 0x808080 });
    const boxGeo = new THREE.BoxGeometry(1, 0.1, 1);

    const TILE_SIZE = 10;

    for (let x = 0; x < TRACK_SIZE; x++) {
      for (let y = 0; y < TRACK_SIZE; y++) {
        const tile = track.getTile(x, y);
        if (!tile) continue;

        const mesh = new THREE.Mesh(boxGeo, tile.type === TileType.Grass ? darkGreen : grey);
        mesh.scale.set(TILE_SIZE, 1, TILE_SIZE);

        // Position
        // Physics X -> Three X
        // Physics Y -> Three Z
        mesh.position.set(x * TILE_SIZE, 0, y * TILE_SIZE);

        this.trackGroup.add(mesh);
      }
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

  public render(state: WorldState, _alpha: number) {
    this.updateCarMeshes(state.players.length);

    // Update all car positions
    state.players.forEach((player, i) => {
      const group = this.carMeshes[i];
      group.position.set(player.x, 0, player.y); // y=0 because parts are offset internally
      // Physics angle is CCW from +X. 
      // ThreeJS object space: Car points along -Z? or +Z? 
      // Box(1, 0.6, 4.2). Long axis is Z.
      // We need to rotate it so its forward aligns with velocity.
      // Need to negate physics angle because Physics(+Angle) -> +Z, while Three(+Rotation) -> -Z.
      // Offset of PI/2 aligns model (+Z) to Physics (+X).
      group.rotation.y = -player.angle + Math.PI / 2;
      group.visible = true;
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

    if (playerCount === 1) {
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

      if (mode === 0) {
        // Mode 0: First Person (Perspective)
        // Tune: FOV 100, Pos slightly back (-0.2), Look slightly down (Y=0.5 target)
        this.perspectiveCamera.aspect = vpAspect;
        this.perspectiveCamera.updateProjectionMatrix();

        this.perspectiveCamera.position.set(
          player.x - fwdX * 0.2,
          1.1, // Eye height
          player.y - fwdZ * 0.2
        );
        this.perspectiveCamera.lookAt(
          player.x + fwdX * 20,
          0.5, // Look slightly down
          player.y + fwdZ * 20
        );
        activeCamera = this.perspectiveCamera;

      } else if (mode === 1) {
        // Mode 1: Third Person (Perspective)
        // Pos: Car - Fwd*8 + Up*4
        this.perspectiveCamera.aspect = vpAspect;
        this.perspectiveCamera.updateProjectionMatrix();

        this.perspectiveCamera.position.set(
          player.x - fwdX * 8,
          4,
          player.y - fwdZ * 8
        );
        this.perspectiveCamera.lookAt(player.x, 1, player.y);
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

        this.camera.position.set(
          player.x - fwdX * 20,
          20,
          player.y - fwdZ * 20
        );
        this.camera.lookAt(player.x, 0, player.y);
        activeCamera = this.camera;

      } else {
        // Mode 2 (Default): Iso Fixed (Orthographic)
        const frustumSize = 40;
        this.camera.left = (-frustumSize * vpAspect) / 2;
        this.camera.right = (frustumSize * vpAspect) / 2;
        this.camera.top = frustumSize / 2;
        this.camera.bottom = -frustumSize / 2;
        this.camera.updateProjectionMatrix();

        // Fixed offset (-20, 20, -20)
        this.camera.position.set(player.x - 20, 20, player.y - 20);
        this.camera.lookAt(player.x, 0, player.y);
        activeCamera = this.camera;
      }

      this.renderer.render(this.scene, activeCamera);
    });
  }
}
