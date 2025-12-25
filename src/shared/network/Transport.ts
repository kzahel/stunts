
export interface NetworkTransport {
    isConnected(): boolean;
    send(data: any): void;
    onReceive(callback: (data: any) => void): void;
    onConnect(callback: () => void): void;
    onDisconnect(callback: () => void): void;
    connect?(): void;
    disconnect?(): void;
}
