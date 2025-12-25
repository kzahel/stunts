import * as THREE from 'three';

export function createWorldTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Clear (Debug Pink)
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0, 0, size, size);

  const half = size / 2;

  // 4 Quadrants:
  // Top-Left (0, 0): Grass
  // Top-Right (half, 0): Road Straight
  // Bottom-Left (0, half): Road Turn
  // Bottom-Right (half, half): Road Intersection

  // 1. Grass (Top-Left)
  // Fill Green
  ctx.fillStyle = '#1a472a'; // Darker Green
  ctx.fillRect(0, 0, half, half);
  // Add some noise/blades
  ctx.fillStyle = '#2d5e3e';
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * half;
    const y = Math.random() * half;
    const w = 2 + Math.random() * 4;
    const h = 2 + Math.random() * 4;
    ctx.fillRect(x, y, w, h);
  }

  // 2. Road Straight (Top-Right)
  // Grey Background
  ctx.save();
  ctx.translate(half, 0);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, half, half);

  // Center Stripe (Dashed) - Horizontal now
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.setLineDash([30, 30]); // Dash pattern
  ctx.beginPath();
  // Horizontal line in center (West to East)
  ctx.moveTo(0, half / 2);
  ctx.lineTo(half, half / 2);
  ctx.stroke();

  // Curbs/Edges
  ctx.fillStyle = '#555555'; // Darker edge
  ctx.fillRect(0, 0, half, 10); // Top
  ctx.fillRect(0, half - 10, half, 10); // Bottom

  ctx.restore();

  // 3. Road Turn (Bottom-Left)
  // Standard Turn: Enter Bottom, Exit Right? (South to East?)
  // Let's define "Turn" as Bottom -> Right (90 deg Turn)
  ctx.save();
  ctx.translate(0, half);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, half, half);

  // Curved Center Stripe
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.setLineDash([30, 20]); // Dash pattern slightly tighter
  ctx.beginPath();
  // Arc centered at Top-Left? No.
  // We want to turn from Bottom (Vertical) to Right (Horizontal).
  // Arc center should be Top-Left (0,0) of this quadrant? No, that would make a big radius corner.
  // Typically a tight corner:
  // Enter at (half/2, half) -> Moving Up
  // Exist at (half, half/2) -> Moving Right
  // Wait, standard road width = half.
  // Center is at half/2.
  // Standard corner:
  // Center of curvature is at (half + buffer?, -buffer?).
  // Simple 90 deg turn:
  // Center of arc is (0, half)? No.
  // If we take the inside corner as the pivot.
  // Inside corner is Top-Right? No.
  // Imagine coming from Bottom (South). Lane is centered at X=half/2.
  // Turning Right (East). Lane is centered at Y=half/2.
  // So we turn around the Top-Left corner? No, Top-Left is (0,0).
  // If we turn around (0,0):
  // Entry: X=half/2. Radius = half/2.
  // Angle: Start at 90 (Bottom), End at 0 (Right).
  // Yes. Arc centered at (0,0) with radius half/2.
  // But wait, (0,0) is the "Grass" corner (inner corner).
  // So the turn goes around the inner corner.

  // Draw Road Surface (Curved?)
  // It's already filled grey.
  // We should probably paint the corners grass if we want a rounded look.
  // Inner Corner (0,0): Grass.
  // Outer Corner (half, half): Road.

  // Inner Corner Grass:
  // Draw Green Arc?
  // Actually, let's keep it simple first just stripes.
  // But purely square grey tile with reduced corner looks weird.
  // Let's paint the inner corner Green.
  ctx.fillStyle = '#1a472a';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 10, 0, Math.PI / 2); // Small inner corner grass?
  // Let's stick to full road for now, just stripe.

  ctx.beginPath();
  ctx.arc(0, 0, half / 2, 0, Math.PI / 2, false);
  // 0 is Right (3 o'clock). PI/2 is Bottom (6 o'clock).
  // Canvas arc angles: 0 is Right. Math.PI/2 is Down.
  // So this draws from Right to Down.
  // Matches our Exit (Right) and Entry (Bottom).
  ctx.stroke();

  // Draw Edge lines (Curbs)
  ctx.strokeStyle = '#555555';
  ctx.lineWidth = 10;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI / 2, false); // Inner
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, half - 10, 0, Math.PI / 2, false); // Outer
  ctx.stroke();

  ctx.restore();

  // 4. Intersection (Bottom-Right)
  ctx.save();
  ctx.translate(half, half);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, half, half);

  // Cross Stripes? intersections usually don't have dashes in the middle.
  // Just stop lines?
  // Or just grey.
  // Let's add simple dashed lines crossing for visualization?
  // Usually intersections are clear.

  // Curbs on corners?
  // No curbs on edges.

  // Maybe just a darker center patch?
  ctx.fillStyle = '#777777';
  ctx.fillRect(10, 10, half - 20, half - 20);

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter; // Retro look
  texture.minFilter = THREE.NearestFilter;
  return texture;
}
