import * as THREE from 'three';
import { Track, TILE_SIZE, HEIGHT_STEP } from '../shared/Track';
import { GameRenderer } from './vis/Renderer';
import { UIManager } from './vis/UI';

export const EditorTool = {
    None: 0,
    Raise: 1,
    Lower: 2,
    Flatten: 3
} as const;

export type EditorTool = (typeof EditorTool)[keyof typeof EditorTool];

export class Editor {
    private track: Track;
    private renderer: GameRenderer;
    private canvas: HTMLCanvasElement;
    private scene: THREE.Scene | null = null; // Scene reference

    private active: boolean = false;
    private currentTool: EditorTool = EditorTool.None;

    // Interaction State
    private mouseX: number = 0;
    private mouseY: number = 0;
    private raycaster = new THREE.Raycaster();
    private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Ground plane

    // Visuals
    private highlightMesh: THREE.Mesh;

    private ui: UIManager;

    private onMapChange: (() => void) | null = null;

    constructor(track: Track, renderer: GameRenderer, canvas: HTMLCanvasElement, ui: UIManager, onMapChange?: () => void) {
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
            depthWrite: false
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

    private updateUI() {
        let name = "None";
        switch (this.currentTool) {
            case EditorTool.Raise: name = "RAISE (1)"; break;
            case EditorTool.Lower: name = "LOWER (2)"; break;
            case EditorTool.Flatten: name = "FLATTEN (3)"; break;
        }
        this.ui.updateEditorStatus(this.active, name);
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
        this.raycaster.setFromCamera(mouseVec, this.renderer.getCamera());
        const target = new THREE.Vector3();

        // Raycast against infinite plane for generic ground targeting
        if (this.raycaster.ray.intersectPlane(this.plane, target)) {
            // Snap to Tile Center
            const tx = Math.floor(target.x / TILE_SIZE);
            const ty = Math.floor(target.z / TILE_SIZE);

            // Snap Highlight
            const centerX = tx * TILE_SIZE + TILE_SIZE / 2;
            const centerZ = ty * TILE_SIZE + TILE_SIZE / 2;

            // Get roughly current height for cursor
            const baseH = this.track.getVertexHeight(tx, ty);

            this.highlightMesh.position.set(centerX, baseH + 0.5, centerZ);

            // Logic is now in onMouseDown for discrete clicks
        }
    }

    private applyRaise(cx: number, cy: number) {
        // Get heights of 4 corners
        const corners = [
            { x: cx, y: cy },
            { x: cx + 1, y: cy },
            { x: cx + 1, y: cy + 1 },
            { x: cx, y: cy + 1 }
        ];

        let maxHeight = -Infinity;
        corners.forEach(c => {
            const h = this.track.getVertexHeight(c.x, c.y);
            if (h > maxHeight) maxHeight = h;
        });

        // Check if all are max
        let allFlat = true;
        corners.forEach(c => {
            if (this.track.getVertexHeight(c.x, c.y) < maxHeight - 0.01) allFlat = false;
        });

        if (!allFlat) {
            // Flatten to top
            corners.forEach(c => this.track.setVertexHeight(c.x, c.y, maxHeight));
        } else {
            // Already flat, raise all
            corners.forEach(c => this.track.setVertexHeight(c.x, c.y, maxHeight + HEIGHT_STEP));
        }

        // Propagate
        corners.forEach(c => this.track.enforceSlopeConstraints(c.x, c.y));
        this.renderer.initTrackOrUpdate(this.track);
        this.notifyChange();
    }

    private applyLower(cx: number, cy: number) {
        const corners = [
            { x: cx, y: cy },
            { x: cx + 1, y: cy },
            { x: cx + 1, y: cy + 1 },
            { x: cx, y: cy + 1 }
        ];

        let minHeight = Infinity;
        corners.forEach(c => {
            const h = this.track.getVertexHeight(c.x, c.y);
            if (h < minHeight) minHeight = h;
        });

        let allFlat = true;
        corners.forEach(c => {
            if (this.track.getVertexHeight(c.x, c.y) > minHeight + 0.01) allFlat = false;
        });

        if (!allFlat) {
            // Flatten to bottom
            corners.forEach(c => this.track.setVertexHeight(c.x, c.y, minHeight));
        } else {
            // Lower all
            corners.forEach(c => this.track.setVertexHeight(c.x, c.y, minHeight - HEIGHT_STEP));
        }

        corners.forEach(c => this.track.enforceSlopeConstraints(c.x, c.y));
        this.renderer.initTrackOrUpdate(this.track);
        this.notifyChange();
    }

    public onMouseDown() {
        if (!this.active) return;

        // Discrete Action
        const mouseVec = new THREE.Vector2(this.mouseX, this.mouseY);
        this.raycaster.setFromCamera(mouseVec, this.renderer.getCamera());

        // Raycast against track group for precise hit, or plane if needed?
        // Plane is easier for generic tile selection
        const target = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.plane, target)) {
            const tx = Math.floor(target.x / TILE_SIZE);
            const ty = Math.floor(target.z / TILE_SIZE);

            switch (this.currentTool) {
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
            }
        }
    }
}
