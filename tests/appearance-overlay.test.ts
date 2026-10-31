import { expect, it } from "vitest";
import {
  groundOverlay,
  trackOverlay,
} from "../src/practice/appearance-overlay";
const box = {
  left: 20 / 160,
  top: 30 / 120,
  right: 44 / 160,
  bottom: 66 / 120,
};
const mask = {
  width: 3,
  height: 4,
  bounds: box,
  bits: Buffer.from([255, 240]).toString("base64"),
};
function frame(xs = [20], hide = false) {
  const width = 160,
    height = 120,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inside =
        !hide &&
        xs.some((left) => x >= left && x < left + 24 && y >= 30 && y < 66);
      data.set(
        inside ? [175, 35, 60, 255] : [80, 100, 110, 255],
        (y * width + x) * 4,
      );
    }
  return { width, height, data };
}
it("tracks a mask-seeded plain object without inventing a success score", () => {
  const t = groundOverlay(frame(), "part", box, mask);
  const d = trackOverlay(frame([39]), t);
  expect(d.quality).toBe("observed");
  expect(d.box?.left).toBeCloseTo(39 / 160, 1);
  expect(d.score).toBeNull();
});
it("does not draw a ghost outline when the part disappears", () => {
  const t = groundOverlay(frame(), "part", box, mask);
  expect(trackOverlay(frame([], true), t).box).toBeNull();
});
it("abstains when two indistinguishable nearby candidates compete", () => {
  const t = groundOverlay(frame(), "part", box, mask);
  expect(trackOverlay(frame([5, 55]), t).quality).toBe("ambiguous");
});
it("does not ground an empty foreground or accept resized frames", () => {
  expect(() =>
    groundOverlay(frame(), "part", box, { ...mask, bits: "AAA=" }),
  ).toThrow();
  const t = groundOverlay(frame(), "part", box, mask);
  expect(trackOverlay({ ...frame(), width: 80 }, t).box).toBeNull();
});
