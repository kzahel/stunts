import { SettingsManager, ControlType } from '../engine/Settings';
import type { GameSettings } from '../engine/Settings';

export class UIManager {
  private container: HTMLElement;
  private settingsManager: SettingsManager;
  private onStartGame: (settings: GameSettings) => void;
  private onOptionsClosed: () => void;

  constructor(
    container: HTMLElement,
    settingsManager: SettingsManager,
    onStartGame: (settings: GameSettings) => void,
    onOptionsClosed: () => void,
  ) {
    this.container = container;
    this.settingsManager = settingsManager;
    this.onStartGame = onStartGame;
    this.onOptionsClosed = onOptionsClosed;
  }

  public showStartupScreen() {
    this.clearScreens();
    const screen = this.createScreen('startup-screen');

    const title = document.createElement('h1');
    title.textContent = 'STUNTS REMAKE';
    screen.appendChild(title);

    const sub = document.createElement('h2');
    sub.textContent = 'Select Players';
    screen.appendChild(sub);

    [1, 2, 3, 4].forEach((count) => {
      const btn = document.createElement('div');
      btn.className = 'menu-item';
      btn.textContent = `${count} Player${count > 1 ? 's' : ''}`;
      btn.onclick = async () => {
        console.log(`Selected ${count} players`);
        await this.settingsManager.updateSettings({ playerCount: count });
        this.onStartGame(this.settingsManager.getSettings());
        this.clearScreens();
      };
      screen.appendChild(btn);
    });

    const optionsBtn = document.createElement('div');
    optionsBtn.className = 'menu-item';
    optionsBtn.textContent = 'Options';
    optionsBtn.style.marginTop = '20px';
    optionsBtn.onclick = () => this.showOptionsScreen(() => this.showStartupScreen());
    screen.appendChild(optionsBtn);

    this.container.appendChild(screen);
  }

  public showOptionsScreen(
    onBack: () => void,
    onMainMenu?: () => void,
    backLabel: string = 'Back',
  ) {
    this.clearScreens();
    const screen = this.createScreen('options-screen');
    const settings = this.settingsManager.getSettings();

    const title = document.createElement('h1');
    title.textContent = 'OPTIONS';
    screen.appendChild(title);

    const itemsContainer = document.createElement('div');
    itemsContainer.style.overflowY = 'auto';
    itemsContainer.style.maxHeight = '70%';
    itemsContainer.style.width = '100%';
    itemsContainer.style.display = 'flex';
    itemsContainer.style.flexDirection = 'column';
    itemsContainer.style.alignItems = 'center';

    // Controls for each player
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const hasGamepad = Array.from(gamepads).some((g) => g !== null);

    [0, 1, 2, 3].forEach((playerId) => {
      const row = document.createElement('div');
      row.className = 'control-row';

      const label = document.createElement('div');
      label.className = 'control-label';
      label.textContent = `Player ${playerId + 1}:`;

      const select = document.createElement('select');
      const options = [
        { val: ControlType.WASD, text: 'Keyboard (WASD)' },
        { val: ControlType.ARROWS, text: 'Keyboard (Arrows)' },
      ];
      if (hasGamepad) {
        options.push({ val: ControlType.GAMEPAD, text: 'Gamepad' });
      }

      options.forEach((opt) => {
        const el = document.createElement('option');
        el.value = opt.val;
        el.textContent = opt.text;
        select.appendChild(el);
      });

      // Find current setting
      const specific = settings.controls.find((c) => c.playerId === playerId);
      if (specific) {
        select.value = specific.type;
      }

      select.onchange = async () => {
        await this.settingsManager.updatePlayerControl(playerId, {
          type: select.value as ControlType,
        });
      };

      row.appendChild(label);
      row.appendChild(select);
      itemsContainer.appendChild(row);
    });

    screen.appendChild(itemsContainer);

    const backBtn = document.createElement('div');
    backBtn.className = 'menu-item';
    backBtn.textContent = backLabel;
    backBtn.style.marginTop = '20px';
    backBtn.onclick = () => {
      this.onOptionsClosed(); // Notify main that options are closed
      onBack();
    };
    screen.appendChild(backBtn);

    if (onMainMenu) {
      const menuBtn = document.createElement('div');
      menuBtn.className = 'menu-item';
      menuBtn.textContent = 'Return to Main Menu';
      menuBtn.onclick = () => {
        if (confirm('Are you sure you want to quit the current game?')) {
          this.onOptionsClosed();
          onMainMenu();
        }
      };
      screen.appendChild(menuBtn);
    }

    this.container.appendChild(screen);
  }

  private createScreen(id: string): HTMLElement {
    const el = document.createElement('div');
    el.id = id;
    el.className = 'screen';
    return el;
  }

  public clearScreens() {
    const screens = this.container.querySelectorAll('.screen');
    screens.forEach((s) => s.remove());
  }
}
