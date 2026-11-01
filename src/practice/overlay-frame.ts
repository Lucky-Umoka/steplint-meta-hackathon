import type { Pixels } from "./tracker";
/** Bound advisory work and replay memory independently of the camera stream. */
export function overlayFrame(p: Pixels): Pixels {
  const scale = Math.min(1, 320 / p.width, 240 / p.height);
  if (scale === 1) return p;
  const width = Math.max(1, Math.round(p.width * scale));
  const height = Math.max(1, Math.round(p.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const from =
        (Math.min(p.height - 1, Math.floor((y + 0.5) / scale)) * p.width +
          Math.min(p.width - 1, Math.floor((x + 0.5) / scale))) *
        4;
      const to = (y * width + x) * 4;
      data[to] = p.data[from];
      data[to + 1] = p.data[from + 1];
      data[to + 2] = p.data[from + 2];
      data[to + 3] = 255;
    }
  return { width, height, data };
}
export const OVERLAY_REPLAY_FRAMES = 160;
