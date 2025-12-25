import type { Input, WorldState } from '../Schema';

export const ClientMessageType = {
  JOIN: 'JOIN',
  INPUT: 'INPUT',
  PING: 'PING',
} as const;
export type ClientMessageType = (typeof ClientMessageType)[keyof typeof ClientMessageType];

export interface ClientMessage {
  type: ClientMessageType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
}

export interface JoinMessage extends ClientMessage {
  type: typeof ClientMessageType.JOIN;
  payload: {
    name?: string;
  };
}

export interface InputMessage extends ClientMessage {
  type: typeof ClientMessageType.INPUT;
  payload: Input;
}

export const ServerMessageType = {
  WELCOME: 'WELCOME',
  STATE: 'STATE',
  PONG: 'PONG',
} as const;
export type ServerMessageType = (typeof ServerMessageType)[keyof typeof ServerMessageType];

export interface ServerMessage {
  type: ServerMessageType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
}

export interface WelcomeMessage extends ServerMessage {
  type: typeof ServerMessageType.WELCOME;
  payload: {
    playerId: number;
    initialState: WorldState;
  };
}

export interface StateMessage extends ServerMessage {
  type: typeof ServerMessageType.STATE;
  payload: WorldState;
}
