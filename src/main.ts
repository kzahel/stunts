import './style.css';
import { GameLoop } from './engine/GameLoop';
import { PhysicsEngine } from './engine/Physics';
import { GameRenderer } from './vis/Renderer';
import { Track, TileType } from './engine/Track';
import { createInitialState } from './engine/Schema';
import { InputManager } from './engine/Input'; // New import

// Initialize Components
const app = document.querySelector<HTMLDivElement>('#app')!;
const renderer = new GameRenderer(app);
const physics = new PhysicsEngine();
const track = new Track();
const inputManager = new InputManager();

// Parse URL params for split screen
const params = new URLSearchParams(window.location.search);
const splitPlayers = parseInt(params.get('split_players') || '1', 10);
const playerCount = Math.min(Math.max(1, splitPlayers), 4); // Clamp 1-4

console.log(`Starting with ${playerCount} players.`);

// Create some track for visual interest
// Center is 15,15
for (let i = 10; i < 20; i++) {
  track.setTile(i, 15, TileType.Road);
  track.setTile(15, i, TileType.Road);
}
renderer.initTrackOrUpdate(track);

// State
let state = createInitialState(playerCount);
state.players.forEach((p, i) => {
  // Offset start positions slightly so they don't overlap perfectly
  p.position.x = 150 + i * 5;
  p.position.y = 150;
});

// Game Loop
const loop = new GameLoop(
  (dt) => {
    inputManager.update();
    const inputs = state.players.map((_, i) => inputManager.getInput(i));
    state = physics.step(state, inputs, dt);
  },
  (alpha) => {
    renderer.render(state, alpha);
  }
);

loop.start();
