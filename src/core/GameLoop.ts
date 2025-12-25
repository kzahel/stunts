export class GameLoop {
  private lastTime: number = 0;
  private accumulator: number = 0;
  private running: boolean = false;
  private rafId: number | null = null;
  private readonly timeStep: number;
  private timeoutId: any = null;

  private update: (dt: number) => void;
  private render: (alpha: number) => void;

  constructor(
    update: (dt: number) => void,
    render: (alpha: number) => void,
    targetFps: number = 60,
  ) {
    this.update = update;
    this.render = render;
    this.timeStep = 1 / targetFps;
  }

  private loop = (currentTime: number): void => {
    this.tick(currentTime);
    if (this.running) {
      if (typeof requestAnimationFrame === 'function') {
        this.rafId = requestAnimationFrame(this.loop);
      } else {
        // Target 60 FPS roughly
        this.timeoutId = setTimeout(() => this.loop(this.getNow()), 1000 / 60);
      }
    }
  };

  private getNow(): number {
    if (typeof performance !== 'undefined') return performance.now();
    return Date.now();
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = this.getNow();
    this.accumulator = 0;
    this.loop(this.lastTime);
  }

  public stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  // Exposed for testing and manual control
  public tick(currentTime: number): void {
    if (!this.running) return;

    // Cap frame time to avoid spiral of death (e.g. 0.25s)
    let frameTime = (currentTime - this.lastTime) / 1000;
    if (frameTime > 0.25) frameTime = 0.25;

    this.lastTime = currentTime;
    this.accumulator += frameTime;

    while (this.accumulator >= this.timeStep) {
      this.update(this.timeStep);
      this.accumulator -= this.timeStep;
    }

    const alpha = this.accumulator / this.timeStep;
    this.render(alpha);
  }
}
