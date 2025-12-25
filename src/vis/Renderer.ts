import * as THREE from 'three';
import type { WorldState } from '../engine/Schema';
import { Track, TRACK_SIZE, TileType } from '../engine/Track';

export class GameRenderer {
    private scene: THREE.Scene;
    private camera: THREE.OrthographicCamera;
    private renderer: THREE.WebGLRenderer;

    private trackGroup: THREE.Group;

    private carMeshes: THREE.Mesh[] = [];

    // ... (constructor remains mostly same, but remove single carMesh creation)

    constructor(container: HTMLElement) {
        // Basic Scene
        this.scene = new THREE.Scene();
        // ... (scene setup same)
        this.scene.background = new THREE.Color(0x87CEEB);

        // Camera
        // We will update camera per viewport in render()
        const aspect = container.clientWidth / container.clientHeight;
        const frustumSize = 40;
        this.camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            frustumSize / -2,
            1,
            1000
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

        this.camera.left = -frustumSize * aspect / 2;
        this.camera.right = frustumSize * aspect / 2;
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

    private updateCarMeshes(count: number) {
        // Add needed
        while (this.carMeshes.length < count) {
            const carGeom = new THREE.BoxGeometry(2, 1, 4);
            // Give different colors?
            const colors = [0xff0000, 0x0000ff, 0x00ff00, 0xffff00];
            const color = colors[this.carMeshes.length % colors.length];
            const carMat = new THREE.MeshStandardMaterial({ color });
            const mesh = new THREE.Mesh(carGeom, carMat);
            this.scene.add(mesh);
            this.carMeshes.push(mesh);
        }
        // Remove excess (optional, or just hide)
        // For now we just keep them added.
    }

    public render(state: WorldState, _alpha: number) {
        this.updateCarMeshes(state.players.length);

        // Update all car positions first
        state.players.forEach((player, i) => {
            const mesh = this.carMeshes[i];
            mesh.position.set(player.position.x, 1, player.position.y);
            mesh.rotation.y = -player.angle;
            mesh.visible = true;
        });

        // Hide unused cars
        for (let i = state.players.length; i < this.carMeshes.length; i++) {
            this.carMeshes[i].visible = false;
        }

        const width = this.renderer.domElement.width;
        const height = this.renderer.domElement.height;
        const playerCount = state.players.length;

        // Viewports Config
        let viewports: { x: number, y: number, w: number, h: number }[] = [];

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
            this.camera.left = -frustumSize * vpAspect / 2;
            this.camera.right = frustumSize * vpAspect / 2;
            this.camera.top = frustumSize / 2;
            this.camera.bottom = -frustumSize / 2;
            this.camera.updateProjectionMatrix();

            this.renderer.render(this.scene, this.camera);
        });
    }
}
