import * as THREE from 'three';
import type { WorldState } from '../../shared/Schema';
import { Track, TRACK_SIZE, TileType } from '../../shared/Track';

export class GameRenderer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;

  private trackGroup: THREE.Group;

  private carMeshes: THREE.Group[] = [];

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
    this.renderer.setSize(container.clientWidth, container.clientHeight);
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
      group.position.set(player.position.x, 0, player.position.y); // y=0 because parts are offset internally
      group.rotation.y = -player.angle; // THREE.js Y-rotation is counter-clockwise? Physics angle might be CW or CCW.
      // Note: Physics.ts: forwardX = Math.cos(angle). Standard math angle starts at X+ (Right) and goes CCW.
      // THREE.js: looking down -Y, X is right, Z is down?
      // Let's assume standard rotation for now. If car moves sideways, fix rotation.
      // Actually, in Physics.ts, velocity.x = cos(angle). This implies 0 angle = +X direction.
      // In THREE.js, objects usually face -Z or +Z. Our car body has length 4 along Z.
      // If we build it along Z, we might need an offset rotation
      // Our Car Body box is (1, 0.6, 4.2). Z is the long axis.
      // If angle 0 is +X in physics, but our car model is along Z, we probably need `rotation.y = -player.angle + Math.PI/2` or something.
      // Let's stick to simple mapping and verify visually.
      // If car travels along X, and car length is Z, it will look like it's drifting.
      // I'll add a boolean flag or just hardcode a +PI/2 rotation offset if typical "forward" is Z for this mesh.
      // Let's assume typical car model faces +Z or -Z.
      // Physics: angle 0 = +X.
      // We want the car (Length along Z) to point to +X. So rotate +90deg (PI/2).

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

      this.renderer.setViewport(vp.x, vp.y, vp.w, vp.h);
      this.renderer.setScissor(vp.x, vp.y, vp.w, vp.h);

      // Update Camera for this player
      // Maintain offset?
      this.camera.position.set(player.position.x + 20, 20, player.position.y + 20);
      this.camera.lookAt(player.position.x, 0, player.position.y);

      // Adjust aspect ratio for orthographic camera if needed?
      // Ortho camera frustum is defined by left/right/top/bottom
      // We instantiated it with full screen aspect.
      // Ideally we should update the camera frustum based on viewport aspect ratio.
      const vpAspect = vp.w / vp.h;
      const frustumSize = 40;
      this.camera.left = (-frustumSize * vpAspect) / 2;
      this.camera.right = (frustumSize * vpAspect) / 2;
      this.camera.top = frustumSize / 2;
      this.camera.bottom = -frustumSize / 2;
      this.camera.updateProjectionMatrix();

      this.renderer.render(this.scene, this.camera);
    });
  }
}
