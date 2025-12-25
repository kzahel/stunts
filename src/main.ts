
import './style.css';
import { GameLoop } from './engine/GameLoop';
import { PhysicsEngine } from './engine/Physics';
import { GameRenderer } from './vis/Renderer';
import { Track, TileType } from './engine/Track';
import { createInitialState } from './engine/Schema';
import type { WorldState as SimState, PhysicalBody as Player } from './engine/Schema';
import { InputManager } from './engine/Input';
import { SettingsManager, LocalStorageStore } from './engine/Settings';
import type { GameSettings } from './engine/Settings';
import { UIManager } from './vis/UI';

// Application State
const AppState = {
  MENU: 0,
  PLAYING: 1,
  PAUSED: 2,
} as const;
type AppState = typeof AppState[keyof typeof AppState];

let appState: AppState = AppState.MENU;

// Initialize Systems
const app = document.querySelector<HTMLDivElement>('#app')!;
const renderer = new GameRenderer(app);
const physics = new PhysicsEngine();
let track = new Track();
const inputManager = new InputManager();
const settingsManager = new SettingsManager(new LocalStorageStore());

// Game Simulation State
let simState: SimState | null = null;

// UI Manager
const ui = new UIManager(
  document.body,
  settingsManager,
  (settings) => startGame(settings), // On Start
  () => { // On Options Closed (Back)
    if (appState === AppState.PAUSED) {
      appState = AppState.PLAYING;
    } else if (appState === AppState.MENU) {
      // Already handled by UI
    }
  }
);

// Initialization
(async () => {
  await settingsManager.load();

  // Check for URL override
  const params = new URLSearchParams(window.location.search);
  const splitPlayers = params.get('split_players');

  if (splitPlayers) {
    const count = Math.min(Math.max(1, parseInt(splitPlayers, 10)), 4);
    await settingsManager.updateSettings({ playerCount: count });
    startGame(settingsManager.getSettings());
  } else {
    ui.showStartupScreen();
  }
})();

function startGame(settings: GameSettings) {
  console.log(`Starting game with ${settings.playerCount} players`);

  // Update Input Manager
  inputManager.setConfig(settings.controls);

  // Create Initial Sim State
  simState = createInitialState(settings.playerCount);

  // Setup Track
  track = new Track();
  for (let i = 10; i < 20; i++) {
    track.setTile(i, 15, TileType.Road);
    track.setTile(15, i, TileType.Road);
  }
  renderer.initTrackOrUpdate(track);

  // Initial Positions
  if (simState && simState.players) {
    simState.players.forEach((p: Player, i: number) => {
      p.position.x = 150 + i * 5;
      p.position.y = 150;
    });
  }

  appState = AppState.PLAYING;
}

// Global Input Handling (ESC)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (appState === AppState.PLAYING) {
      appState = AppState.PAUSED;
      ui.showOptionsScreen(
        () => {
          appState = AppState.PLAYING;
          ui.clearScreens();
        },
        () => {
          appState = AppState.MENU;
          simState = null;
          ui.showStartupScreen();
        },
        'Return to Game'
      );
    }
  }
});

// Game Loop
const loop = new GameLoop(
  (dt) => {
    if (appState === AppState.PLAYING && simState) {
      inputManager.update();
      const inputs = simState.players.map((_, i) => inputManager.getInput(i));
      simState = physics.step(simState, inputs, dt);
    }
  },
  (alpha) => {
    if (simState) {
      renderer.render(simState, alpha);
    }
  }
);

loop.start();
