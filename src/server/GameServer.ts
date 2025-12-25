import { Room } from './Room';
import { LocalChannel } from '../shared/network/LocalTransport';

export class GameServer {
  private rooms: Room[] = [];

  constructor(roomTickRate: number = 60) {
    // Create default room
    const room = new Room(roomTickRate);
    room.start();
    this.rooms.push(room);
  }

  public connectLocal(): LocalChannel {
    const clientSide = new LocalChannel();
    const serverSide = new LocalChannel();

    clientSide.connectTo(serverSide);

    // Add serverSide to room
    this.rooms[0].addClient(serverSide);

    return clientSide;
  }

  public stop() {
    this.rooms.forEach((r) => r.stop());
  }
}
