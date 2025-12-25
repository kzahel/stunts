
import type { NetworkTransport } from './Transport';

export class LocalChannel implements NetworkTransport {
    private otherSide: LocalChannel | null = null;
    private receiveCallback: ((data: any) => void) | null = null;
    private connectCallback: (() => void) | null = null;
    private disconnectCallback: (() => void) | null = null;
    private _isConnected: boolean = false;
    public latency: number = 0; // Simulated latency in ms
    private messageBuffer: any[] = [];

    public connectTo(other: LocalChannel) {
        this.otherSide = other;
        other.otherSide = this;
        this._isConnected = true;
        other._isConnected = true;

        if (this.connectCallback) this.connectCallback();
        if (other.connectCallback) other.connectCallback();
    }

    public isConnected(): boolean {
        return this._isConnected;
    }

    public send(data: any): void {
        if (!this._isConnected || !this.otherSide) {
            console.warn("LocalChannel: Attempted to send while disconnected");
            return;
        }

        const payload = JSON.parse(JSON.stringify(data)); // Simulate serialization

        if (this.latency > 0) {
            setTimeout(() => {
                this.otherSide?.receive(payload);
            }, this.latency);
        } else {
            this.otherSide.receive(payload);
        }
    }

    public receive(data: any) {
        if (this.receiveCallback) {
            this.receiveCallback(data);
        } else {
            this.messageBuffer.push(data);
        }
    }

    public onReceive(callback: (data: any) => void): void {
        this.receiveCallback = callback;
        // Flush buffer
        while (this.messageBuffer.length > 0) {
            const data = this.messageBuffer.shift();
            callback(data);
        }
    }

    public onConnect(callback: () => void): void {
        this.connectCallback = callback;
    }

    public onDisconnect(callback: () => void): void {
        this.disconnectCallback = callback;
    }

    public disconnect() {
        if (this._isConnected) {
            this._isConnected = false;
            if (this.otherSide) {
                this.otherSide._isConnected = false;
                if (this.otherSide.disconnectCallback) this.otherSide.disconnectCallback();
                this.otherSide.otherSide = null;
            }
            if (this.disconnectCallback) this.disconnectCallback();
            this.otherSide = null;
        }
    }
}
