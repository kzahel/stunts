import { describe, it, expect } from 'vitest';
import { GameServer } from './GameServer';
import { ClientMessageType, ServerMessageType as SMT } from '../shared/network/Protocol';
import type { WelcomeMessage, StateMessage } from '../shared/network/Protocol';

describe('GameServer Integration', () => {
  it('allows a local client to connect and receive updates', async () => {
    const server = new GameServer();
    const client = server.connectLocal();

    let playerId = -1;
    let receivedStateCount = 0;

    // Promise to wait for welcome
    const welcomePromise = new Promise<void>((resolve) => {
      client.onReceive((data) => {
        if (data.type === SMT.WELCOME) {
          const msg = data as WelcomeMessage;
          playerId = msg.payload.playerId;
          resolve();
        } else if (data.type === SMT.STATE) {
          const msg = data as StateMessage;
          receivedStateCount++;
          // Basic sanity check
          expect(msg.payload.players.length).toBeGreaterThan(0);
        }
      });
    });

    await welcomePromise;
    expect(playerId).toBeGreaterThanOrEqual(0);

    // Send input
    client.send({
      type: ClientMessageType.INPUT,
      payload: { accel: 1, steer: 0 },
    });

    const statePromise = new Promise<void>((resolve) => {
      const check = () => {
        if (receivedStateCount > 0) resolve();
        else setTimeout(check, 10);
      };
      check();
    });

    await expect(statePromise).resolves.toBeUndefined(); // Implicitly waits or timeouts
    expect(receivedStateCount).toBeGreaterThan(0);

    server.stop();
  });
});
