import type { Box } from "../../src/guide/schema";
import type { Pixels } from "../../src/practice/tracker";

export const W = 160,
  H = 120;
/** A smooth, untextured table (uniform grey) with textured objects on top. */
export function smoothTable(
  objects: { box: Box; seed: number }[],
  options: { shiftX?: number; shiftY?: number } = {},
): Pixels {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([118, 118, 118, 255], i * 4);
  const sx = Math.round((options.shiftX ?? 0) * W),
    sy = Math.round((options.shiftY ?? 0) * H);
  for (const { box, seed } of objects)
    for (let y = Math.floor(box.top * H); y < Math.ceil(box.bottom * H); y++)
      for (
        let x = Math.floor(box.left * W);
        x < Math.ceil(box.right * W);
        x++
      ) {
        const px = x + sx,
          py = y + sy;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        // Texture is fixed to the object (local coordinates), so it moves with it.
        const lx = x - Math.floor(box.left * W),
          ly = y - Math.floor(box.top * H);
        let hash =
          Math.imul(lx + seed * 977, 0x9e3779b1) ^
          Math.imul(ly + seed * 131, 0x85ebca6b);
        hash ^= hash >>> 15;
        const value = 30 + ((hash >>> 0) % 200);
        data.set([value, value, value, 255], (py * W + px) * 4);
      }
  return { width: W, height: H, data };
}
export const at = (box: Box, dx = 0, dy = 0): Box => ({
  left: box.left + dx,
  right: box.right + dx,
  top: box.top + dy,
  bottom: box.bottom + dy,
});
