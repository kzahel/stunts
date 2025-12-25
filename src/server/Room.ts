import { PhysicsEngine } from '../core/Physics';
import { GameLoop } from '../core/GameLoop';
import { Track, TileType } from '../shared/Track';
import { createInitialState } from '../shared/Schema';
import type { WorldState, Input } from '../shared/Schema';
import type { NetworkTransport } from '../shared/network/Transport';
import { ClientMessageType, ServerMessageType } from '../shared/network/Protocol';
import type { InputMessage, WelcomeMessage, StateMessage } from '../shared/network/Protocol';

interface Client {
  id: number;
  transport: NetworkTransport;
  input: Input;
}

export class Room {
  private physics: PhysicsEngine;
  private state: WorldState;
  private track: Track;
  private clients: Map<number, Client> = new Map();
  private gameLoop: GameLoop | null = null;
  private nextClientId = 0;
  private tickRate: number = 60;
  // tickIntervalMs and lastTickTime removed as they are unused with GameLoop

  constructor(tickRate: number = 60) {
    this.tickRate = tickRate;
    this.physics = new PhysicsEngine();
    this.state = createInitialState(0);

    // Setup same default track as client
    this.track = new Track();
    for (let i = 10; i < 20; i++) {
      this.track.setTile(i, 15, TileType.Road);
      this.track.setTile(15, i, TileType.Road);
    }
  }

  public start() {
    if (this.gameLoop) return;

    console.log(`Room started at ${this.tickRate}Hz`);

    // We use the shared game loop but we control the update rate manually
    // or we can just configure the game loop if it supported it.
    // For now, let's just use the GameLoop as is but we might need to throttle it if we want 'true' 10Hz simulation
    // actually, to demonstrate the 'lag', we want the server to only SEND updates at 10Hz,
    // but arguably the physics should still run at 60Hz for stability?
    // User asked for "low server tick rate". Usually this means simulation AND updates are slow, or at least updates.
    // Let's throttle the whole loop to the target rate to be safe and obvious.

    this.gameLoop = new GameLoop(
      (dt) => this.update(dt),
      () => {}, // No render on server
      this.tickRate, // Target FPS/TPS
    );
    this.gameLoop.start();
  }

  public stop() {
    if (this.gameLoop) {
      this.gameLoop.stop();
      this.gameLoop = null;
    }
  }

  public addClient(transport: NetworkTransport) {
    const id = this.nextClientId++;

    // Add player to simulation
    // Note: For now we just add a player to the array.
    // In a real game we might want to find a spawn point etc.
    if (this.state.players.length < id + 1) {
      this.state.players.push({
        id: id,
        x: 150 + id * 5,
        y: 150,
        z: 0.5,
        velocity: { x: 0, y: 0 },
        vz: 0,
        angle: 0,
        angularVelocity: 0,
        pitch: 0,
        vPitch: 0,
        roll: 0,
        vRoll: 0,
        steer: 0,
        skidding: false,
      });
    }
    // Current Schema for player doesn't have ID, relies on index.
    // This is fragile if players disconnect.
    // TODO: Update Schema to have Player ID.
    // For now, we assume index == id if we don't support leaving/holes.

    const client: Client = {
      id,
      transport,
      input: { accel: 0, steer: 0, handbrake: false },
    };

    this.clients.set(id, client);

    transport.onReceive((data) => this.handleMessage(id, data));

    // Send Welcome
    const welcome: WelcomeMessage = {
      type: ServerMessageType.WELCOME,
      payload: {
        playerId: id,
        initialState: this.state,
      },
    };
    transport.send(welcome);
  }

  private handleMessage(clientId: number, data: any) {
    // TODO: Validate data structure
    const msg = data as { type: string; payload: any };

    if (msg.type === ClientMessageType.INPUT) {
      const inputMsg = msg as InputMessage;
      const client = this.clients.get(clientId);
      if (client) {
        client.input = inputMsg.payload;
      }
    }

    if (msg.type === ClientMessageType.MAP_UPDATE) {
      // Apply map update
      const mapMsg = msg as { type: string; payload: any }; // Type assertion
      // Ideally validate

      // Apply to server track
      this.track.deserialize(mapMsg.payload);

      // Broadcast to others?
      // Or just let them know?
      // Ideally we broadcast a MAP_SYNC or relay the update.
      // Let's relay.
      // Note: We should probably only allow "Host" to update map, but for now any client.
      this.broadcast({
        type: ServerMessageType.MAP_SYNC,
        payload: mapMsg.payload,
      });
    }
  }

  private update(dt: number) {
    // Collect inputs
    // Note: We need to map client ID to player index.
    // If players array matches client insertion order, we can use client.id (if simple increment).

    // For 100% correctness we need to reconstruct the input array for the physics engine.
    // Physics engine expects `inputs: Input[]` corresponding to `state.players`.

    const inputs: Input[] = this.state.players.map((_, index) => {
      // Find client that owns this player index
      // Ideally Player schema should have ownerID.
      // Assuming index == clientId for now (Fragile!)
      const client = this.clients.get(index);
      return client ? client.input : { accel: 0, steer: 0, handbrake: false };
    });

    this.state = this.physics.step(this.state, inputs, dt, this.track);

    // Broadcast State
    const updateMsg: StateMessage = {
      type: ServerMessageType.STATE,
      payload: this.state,
    };

    this.broadcast(updateMsg);
  }

  private broadcast(msg: any) {
    this.clients.forEach((client) => {
      client.transport.send(msg);
    });
  }
}
