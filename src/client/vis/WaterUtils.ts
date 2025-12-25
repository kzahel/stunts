export function drawWater(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  frame: number,
) {
  ctx.save();
  ctx.translate(x, y);

  // Clear
  ctx.fillStyle = '#0277bd'; // Deep Blue
  ctx.fillRect(0, 0, size, size);

  // Waves
  ctx.fillStyle = '#4fc3f7'; // Light Blue

  // Deterministic "Random" based on frame for consistent loops (or just shifting)
  // We want shifting waves.
  // We can just draw a pattern and shift it by frame.

  const waveCount = 20;
  for (let i = 0; i < waveCount; i++) {
    // Random positions seeded by 'i' effectively
    // Use simple pseudo-random
    const seed = i * 1337;
    const r1 = Math.abs(Math.sin(seed));
    const r2 = Math.abs(Math.cos(seed * 1.5));

    let wx = r1 * size;
    let wy = r2 * size;

    // Animate: Shift X by frame
    wx = (wx + frame * 0.5) % size;
    // Shift Y slightly
    wy = (wy + Math.sin(frame * 0.05 + i) * 10) % size;
    if (wy < 0) wy += size;

    ctx.fillRect(wx, wy, 20, 4);
    // Wrap around for seamless look (optional, but good for edges)
    if (wx + 20 > size) {
      ctx.fillRect(wx - size, wy, 20, 4);
    }
  }

  ctx.restore();
}
