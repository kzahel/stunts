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
import { interpolateState } from '../shared/Schema';
import { GameServer } from '../server/GameServer';
import { ClientMessageType, ServerMessageType } from '../shared/network/Protocol';
import type { LocalChannel } from '../shared/network/LocalTransport';
import { Editor, EditorTool } from './Editor';

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

// UI Manager (Moved up for injection)
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

// Editor Init
const editor = new Editor(track, renderer, renderer.domElement, ui);
editor.setScene(renderer.getScene());

// Game Server (Local)
let server: GameServer | null = null;
const clients: LocalChannel[] = []; // Operations for each local player

// Game Simulation State (Client View)
let simState: SimState | null = null;
const serverUpdates: Array<{ tick: number; time: number; state: SimState }> = [];

// UI Manager (Already Initialized Above)


// Initialization
void (async () => {
  await settingsManager.load();

  // Check for URL override
  const params = new URLSearchParams(window.location.search);
  const playersParam = params.get('players');
  const tickRateParam = params.get('tick_rate');
  const tickRate = tickRateParam ? parseInt(tickRateParam, 10) : 60;

  if (playersParam) {
    const count = Math.min(Math.max(1, parseInt(playersParam, 10)), 4);
    await settingsManager.updateSettings({ playerCount: count });
    startGame(settingsManager.getSettings(), tickRate);
  } else {
    // For normal startup, we might want to pass this through UI or just default?
    // For this demo, let's just hack it into the start call if we could,
    // but UI calls startGame. Let's just override it for now if param exists.
    if (tickRateParam) {
      console.log('Overriding tick rate to', tickRate);
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
  // Clear buffer on restart
  serverUpdates.length = 0;

  // Initialize Networking
  clients.length = 0;
  // Create one client for each local player
  for (let i = 0; i < settings.playerCount; i++) {
    const client = server.connectLocal();
    client.latency = 100; // 100ms simulated lag
    clients.push(client);

    // Join Room
    client.send({ type: ClientMessageType.JOIN, payload: {} });

    // Listen for updates
    client.onReceive((msg) => {
      if (msg.type === ServerMessageType.WELCOME) {
        const payload = msg.payload; // Type assertion needed until Protocol is stricter
        console.log(`Player ${i} Joined. ID: ${payload.id}`);
        // If we are player 1 (index 0), we might want to capture initial state
        if (i === 0 && payload.initialState) {
          simState = payload.initialState;
        }
      }
      if (msg.type === ServerMessageType.STATE) {
        // "Naive" Reconciliation: Overwrite local state with server state
        // This is what snaps the local player.
        const serverState = msg.payload as SimState;

        // 1. Update Prediction (Snap)
        if (i === 0) {
          // Only do this once, not per client
          // In a perfect prediction, serverState should match simState very closely.
          // We just snap for now.
          simState = serverState;

          // 2. Add to Interpolation Buffer
          serverUpdates.push({
            tick: 0, // Unknown tick for now
            time: performance.now(),
            state: serverState,
          });
          // Keep buffer small
          if (serverUpdates.length > 20) serverUpdates.shift();
        }
      }
    });
  }
  // ... (rest of input logic, omitted for brevity of replacement) ...    // Trigger join (handled by connectLocal implicitly for now via addClient, but ensuring flow)

  // Setup Track (Client side)
  // TODO: Sync track from server?
  track = new Track();
  for (let i = 10; i < 20; i++) {
    track.setTile(i, 15, TileType.Road);
    track.setTile(15, i, TileType.Road);
  }
  renderer.initTrackOrUpdate(track);
  editor.setTrack(track);

  // Initial Positions - Server handles this
  // We just wait for state

  appState = AppState.PLAYING;
}

// Global Input Handling (ESC)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (appState === AppState.PLAYING) {
      editor.setActive(false); // Close editor if open
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

  // Editor Toggle
  if (e.code === 'KeyE') {
    editor.setActive(!editor.isActive());
  }

  // Camera vs Editor Switching
  if (appState === AppState.PLAYING) {
    if (editor.isActive()) {
      // Editor Tools
      if (e.code === 'Digit1') editor.setTool(EditorTool.Raise);
      if (e.code === 'Digit2') editor.setTool(EditorTool.Lower);
      if (e.code === 'Digit3') editor.setTool(EditorTool.Flatten);
    } else {
      // Camera
      if (e.code === 'Digit1') renderer.cycleCameraMode(0);
      if (e.code === 'Digit2') renderer.cycleCameraMode(1);
      if (e.code === 'Digit3') renderer.cycleCameraMode(2);
      if (e.code === 'Digit4') renderer.cycleCameraMode(3);
    }
  }
});

// Editor Mouse Input
window.addEventListener('mousemove', (e) => {
  if (appState === AppState.PLAYING) {
    editor.onMouseMove(e);
  }
});
window.addEventListener('mousedown', (_e) => {
  if (appState === AppState.PLAYING) {
    if (editor.isActive()) editor.onMouseDown();
  }
});


// Game Loop
const loop = new GameLoop(
  (dt) => {
    if (appState === AppState.PLAYING) {
      if (editor.isActive()) {
        // Editor Logic
        editor.update(dt);
      } else if (simState) {
        inputManager.update();

        // Collect inputs for each local player
        // For now, simpler case: assuming 1 local player for prediction or just predicting all
        // We need to run physics locally for "Predicted State"

        // 1. Send inputs to server
        clients.forEach((client, i) => {
          const input = inputManager.getInput(i);
          client.send({
            type: ClientMessageType.INPUT,
            payload: input,
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
        simState = physics.step(simState, inputs, dt, track);
      }
    }
  },
  (alpha) => {
    if (simState) {
      // RENDERING
      // We have two states:
      // 1. simState: The predicted state of the world (Best for Local Player)
      // 2. interpolatedState: The smooth past state of the world (Best for Remote Players)

      let renderState = simState;

      // Calculate Interpolation
      const interpolationDelay = 100; // ms
      const renderTime = performance.now() - interpolationDelay;

      // Find range in buffer
      // We need at least 2 updates to interpolate
      if (serverUpdates.length >= 2) {
        let prev = serverUpdates[0];
        let next = serverUpdates[1];

        // Find the two updates surrounding renderTime
        for (let i = 0; i < serverUpdates.length - 1; i++) {
          if (serverUpdates[i].time <= renderTime && serverUpdates[i + 1].time >= renderTime) {
            prev = serverUpdates[i];
            next = serverUpdates[i + 1];
            break;
          }
        }

        // If renderTime is newer than newest update, we can't interpolate, we extrapolate or just clamp
        if (renderTime > serverUpdates[serverUpdates.length - 1].time) {
          // Fallback: Just use latest
          // renderState = serverUpdates[serverUpdates.length - 1].state;
          // Actually we want to mix.
        } else {
          // Interpolate
          const total = next.time - prev.time;
          const current = renderTime - prev.time;
          const t = Math.max(0, Math.min(1, current / total));

          const interpolated = interpolateState(prev.state, next.state, t);

          // MIXING:
          // Use Predicted state for Local Players (so they feel responsive)
          // Use Interpolated state for Remote Players (so they look smooth)
          // Assuming local players are 0..settings.playerCount-1

          // We need to clone it to avoid mutating buffer? interpolateState creates new object.
          renderState = {
            ...interpolated, // Copy other properties like track, etc.
            players: interpolated.players.map((p, i) => {
              // If this is a local player, use the PREDICTED state
              // (Assuming player index corresponds to local control)
              // clients array length matches local players
              if (i < clients.length) {
                return simState!.players[i];
              }
              // Otherwise use INTERPOLATED state
              return p;
            }),
          };
        }
      }

      renderer.render(renderState, alpha);
    }
  },
);

loop.start();
