import './style.css';
import { GameLoop } from '../core/GameLoop';
import { PhysicsEngine } from '../core/Physics';
import { GameRenderer } from './vis/Renderer';
import { Track, TileType } from '../shared/Track';
import type { WorldState as SimState } from '../shared/Schema';
import { InputManager } from './InputManager';
import { SettingsManager, LocalStorageStore } from '../shared/Settings';
import type { GameSettings } from '../shared/Settings';
import { UIManager } from './vis/UI';
import { GameServer } from '../server/GameServer';
import { ClientMessageType, ServerMessageType } from '../shared/network/Protocol';
import type { LocalChannel } from '../shared/network/LocalTransport';

// Application State
const AppState = {
  MENU: 0,
  PLAYING: 1,
  PAUSED: 2,
} as const;
type AppState = (typeof AppState)[keyof typeof AppState];

let appState: AppState = AppState.MENU;

// Initialize Systems
const app = document.querySelector<HTMLDivElement>('#app')!;
const renderer = new GameRenderer(app);
const physics = new PhysicsEngine(); // Client-side physics for prediction
let track = new Track();
const inputManager = new InputManager();
const settingsManager = new SettingsManager(new LocalStorageStore());

// Game Server (Local)
let server: GameServer | null = null;
const clients: LocalChannel[] = []; // Operations for each local player

// Game Simulation State (Client View)
let simState: SimState | null = null;

// UI Manager
const ui = new UIManager(
  document.body,
  settingsManager,
  (settings) => startGame(settings), // On Start
  () => {
    // On Options Closed (Back)
    if (appState === AppState.PAUSED) {
      appState = AppState.PLAYING;
    } else if (appState === AppState.MENU) {
      // Already handled by UI
    }
  },
);

// Initialization
void (async () => {
  await settingsManager.load();

  // Check for URL override
  const params = new URLSearchParams(window.location.search);
  const splitPlayers = params.get('split_players');
  const tickRateParam = params.get('tick_rate');
  const tickRate = tickRateParam ? parseInt(tickRateParam, 10) : 60;

  if (splitPlayers) {
    const count = Math.min(Math.max(1, parseInt(splitPlayers, 10)), 4);
    await settingsManager.updateSettings({ playerCount: count });
    startGame(settingsManager.getSettings(), tickRate);
  } else {
    // For normal startup, we might want to pass this through UI or just default?
    // For this demo, let's just hack it into the start call if we could, 
    // but UI calls startGame. Let's just override it for now if param exists.
    if (tickRateParam) {
      console.log("Overriding tick rate to", tickRate);
      // We need to wait for UI to call start, but we can't easily inject the param 
      // without modifying UI or Settings.
      // Quick hack: modify the callback UI uses.
      // Actually simpler: Just store it globally or pass it.
    }
    ui.showStartupScreen();
  }
})();

function startGame(settings: GameSettings, overrideTickRate: number = 60) {
  // Check URL again just to be sure if UI flow masked it (it shouldn't if we passed it)
  const params = new URLSearchParams(window.location.search);
  const tickRateParam = params.get('tick_rate');
  const tickRate = tickRateParam ? parseInt(tickRateParam, 10) : overrideTickRate;

  console.log(`Starting game with ${settings.playerCount} players at ${tickRate}Hz`);

  // Update Input Manager
  inputManager.setConfig(settings.controls);

  // Initialize Server
  if (server) server.stop();
  server = new GameServer(tickRate);
  clients.length = 0;

  // Connect Local Clients (One per player)
  for (let i = 0; i < settings.playerCount; i++) {
    const client = server.connectLocal();
    clients.push(client);

    // Setup Listeners
    client.onReceive((msg) => {
      if (msg.type === ServerMessageType.WELCOME) {
        // Initial State
        if (i === 0) { // Only primary client updates view (or all do, doesn't matter since authoritative)
          simState = msg.payload.initialState;
          // console.log('Received Welcome', simState);
        }
      } else if (msg.type === ServerMessageType.STATE) {
        if (i === 0) {
          simState = msg.payload;
        }
      }
    });
    // Trigger join (handled by connectLocal implicitly for now via addClient, but ensuring flow)
  }

  // Setup Track (Client side)
  // TODO: Sync track from server?
  track = new Track();
  for (let i = 10; i < 20; i++) {
    track.setTile(i, 15, TileType.Road);
    track.setTile(15, i, TileType.Road);
  }
  renderer.initTrackOrUpdate(track);

  // Initial Positions - Server handles this
  // We just wait for state

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
          if (server) {
            server.stop();
            server = null;
          }
          ui.showStartupScreen();
        },
        'Return to Game',
      );
    }
  }
});

// Game Loop
const loop = new GameLoop(
  (dt) => {
    if (appState === AppState.PLAYING && simState) {
      inputManager.update();

      // Collect inputs for each local player
      // For now, simpler case: assuming 1 local player for prediction or just predicting all
      // We need to run physics locally for "Predicted State"

      // 1. Send inputs to server
      clients.forEach((client, i) => {
        const input = inputManager.getInput(i);
        client.send({
          type: ClientMessageType.INPUT,
          payload: input
        });
      });

      // 2. Client-Side Prediction
      // We run the SAME physics engine locally on our current state
      // This makes the game feel responsive (60fps) even if server is 10hz
      // In a full implementation, we would re-simulate from the last confirmed server state
      // if we drifted (Server Reconciliation). 
      // For this step, we just run forward. 
      // When Server 'STATE' arrives (in listeners above), it overwrites simState (Naive Reconciliation).

      const inputs = simState.players.map((_, i) => inputManager.getInput(i));
      // We need a local physics engine instance if we want to separate it from "server" logic 
      // but here we just import the class. Ideally we instantiated one.
      // We cannot use the 'physics' var if we commented it out?
      // Let's re-instantiate it or uncomment it.
      // Since we commented it out globally, let's just make a local one or use a singleton?
      // Better to have one at top level.
      simState = physics.step(simState, inputs, dt);
    }
  },
  (alpha) => {
    if (simState) {
      renderer.render(simState, alpha);
    }
  },
);

loop.start();
