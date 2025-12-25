
export interface SettingsStore {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
}

export class LocalStorageStore implements SettingsStore {
    async get<T>(key: string): Promise<T | null> {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
    }

    async set<T>(key: string, value: T): Promise<void> {
        localStorage.setItem(key, JSON.stringify(value));
    }
}

export type ControlType = 'WASD' | 'ARROWS' | 'GAMEPAD';
export const ControlType = {
    WASD: 'WASD' as ControlType,
    ARROWS: 'ARROWS' as ControlType,
    GAMEPAD: 'GAMEPAD' as ControlType,
};

export interface PlayerControlConfig {
    playerId: number;
    type: ControlType;
    gamepadIndex?: number;
}

export interface GameSettings {
    playerCount: number;
    controls: PlayerControlConfig[];
}

export const DEFAULT_SETTINGS: GameSettings = {
    playerCount: 1,
    controls: [
        { playerId: 0, type: ControlType.ARROWS },
        { playerId: 1, type: ControlType.WASD },
        { playerId: 2, type: ControlType.GAMEPAD, gamepadIndex: 0 },
        { playerId: 3, type: ControlType.GAMEPAD, gamepadIndex: 1 },
    ],
};

export class SettingsManager {
    private store: SettingsStore;
    private settings: GameSettings;

    constructor(store: SettingsStore) {
        this.store = store;
        this.settings = { ...DEFAULT_SETTINGS };
    }

    async load(): Promise<GameSettings> {
        const loaded = await this.store.get<GameSettings>('stunts_settings');
        if (loaded) {
            this.settings = { ...DEFAULT_SETTINGS, ...loaded };
            // Ensure controls array is populated for all potential players if loaded config is partial
            if (!this.settings.controls) {
                this.settings.controls = [...DEFAULT_SETTINGS.controls];
            }
        }
        return this.settings;
    }

    getSettings(): GameSettings {
        return this.settings;
    }

    async updateSettings(newSettings: Partial<GameSettings>): Promise<void> {
        this.settings = { ...this.settings, ...newSettings };
        await this.store.set('stunts_settings', this.settings);
    }

    async updatePlayerControl(playerId: number, config: Partial<PlayerControlConfig>) {
        const controls = [...this.settings.controls];
        const index = controls.findIndex(c => c.playerId === playerId);
        if (index !== -1) {
            controls[index] = { ...controls[index], ...config };
        } else {
            controls.push({ playerId, type: 'WASD', ...config });
        }
        await this.updateSettings({ controls });
    }
}
