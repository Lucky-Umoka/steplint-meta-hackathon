import { expect, it } from "vitest";
import {
  contrastForeground,
  groundOverlay,
  trackOverlay,
} from "../src/practice/appearance-overlay";
import type { Pixels } from "../src/practice/tracker";

// Owner export 2026-11-04: a round white bowl on a blue towel, then on a
// black mat. Its box includes the surface at the corners.
function scene(bowlX: number): Pixels {
  const width = 320,
    height = 240,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Table with light texture, towel (left) and mat (right).
      let c = [205 + ((x * 7 + y * 3) % 20), 190, 170];
      if (y > 120 && y < 220 && x > 20 && x < 150) c = [30, 60 + ((x + y) % 25), 200];
      if (y > 120 && y < 220 && x > 170 && x < 300) c = [20 + ((x * 3 + y) % 12), 20, 22];
      // The bowl: a white disc with grey rim texture.
      const dx = x - bowlX,
        dy = y - 170,
        r = Math.hypot(dx, dy);
      if (r < 28) c = r > 22 ? [235, 235, 235] : [150 + ((x * 5 + y * 11) % 70), 140 + ((x + y * 7) % 60), 120];
      data.set([...c, 255], i);
    }
  return { width, height, data };
}
const box = (cx: number) => ({
  left: (cx - 30) / 320,
  top: (170 - 30) / 240,
  right: (cx + 30) / 320,
  bottom: (170 + 30) / 240,
});

it("the bowl's own pixels are separated from the towel behind it", () => {
  const image = scene(85);
  expect(contrastForeground(image, box(85))).not.toBeNull();
});

it("owner root cause: a whole-box template loses the bowl on the mat; an object-only template keeps it", () => {
  const start = scene(85),
    onMat = scene(235);
  const whole = groundOverlay(start, "bowl", box(85));
  whole.illumination = true;
  whole.last = { x: 235, y: 170 }; // searched where it now stands
  const masked = groundOverlay(start, "bowl", box(85), contrastForeground(start, box(85))!);
  masked.illumination = true;
  masked.last = { x: 235, y: 170 };
  expect(trackOverlay(onMat, whole, { multiscale: false, retainFraction: 0.8 }).quality).not.toBe("observed");
  const found = trackOverlay(onMat, masked, { multiscale: false, retainFraction: 0.8 });
  expect(found.quality).toBe("observed");
  expect(((found.box!.left + found.box!.right) / 2) * 320).toBeCloseTo(235, -1);
});

it("an object the same colour as its surroundings keeps the whole-box template (no invented mask)", () => {
  const flat: Pixels = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4).fill(128) };
  expect(contrastForeground(flat, { left: 0.2, top: 0.2, right: 0.8, bottom: 0.8 })).toBeNull();
});
