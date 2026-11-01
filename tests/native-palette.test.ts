import { expect, it } from "vitest";
import {
  groundNativePalette,
  measureNativePalette,
} from "../src/practice/native-palette";
function image(colour: number[], xs = [25], gain = 1, scale = 1, top = 30) {
  const width = 160,
    height = 120,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inside = xs.some(
        (left) =>
          x >= left &&
          x < left + 24 * scale &&
          y >= top &&
          y < top + 48 * scale,
      );
      data.set(
        inside ? [...colour.map((v) => v * gain), 255] : [95, 95, 95, 255],
        (y * width + x) * 4,
      );
    }
  return { width, height, data };
}
const box = {
  left: 24 / 160,
  top: 29 / 120,
  right: 50 / 160,
  bottom: 79 / 120,
};
it.each([
  [180, 30, 60],
  [30, 160, 180],
  [100, 40, 180],
])(
  "learns native surface %j without named-colour assumptions across motion, lighting and moderate scale",
  (...colour) => {
    const profile = groundNativePalette(
      image(colour),
      "real-object-profile",
      box,
    );
    expect(profile).not.toBeNull();
    for (let x = 25; x <= 45; x += 2)
      expect(
        measureNativePalette(image(colour, [x], 0.8, 1.1), profile!).quality,
      ).toBe("observed");
  },
);
it("abstains on competing surfaces and cannot silently reacquire after identity loss", () => {
  const colour = [180, 30, 60];
  const profile = groundNativePalette(image(colour), "object", box)!;
  expect(measureNativePalette(image(colour, [25, 65]), profile).quality).toBe(
    "ambiguous",
  );
  expect(measureNativePalette(image(colour), profile).quality).not.toBe(
    "observed",
  );
});
it("seeds the selected object rather than a larger matching object outside its mark", () => {
  const colour = [180, 30, 60];
  const profile = groundNativePalette(image(colour, [25, 100]), "object", box)!;
  expect(profile.last.x).toBeLessThan(50);
});
it("rejects an indistinguishable surface against its surrounding background", () => {
  expect(groundNativePalette(image([95, 95, 95]), "object", box)).toBeNull();
});
it("a clipped but continuously visible distinctive body preserves only identity, never endpoint geometry", () => {
  const colour = [180, 30, 60],
    profile = groundNativePalette(image(colour), "object", box)!;
  const partial = measureNativePalette(image(colour, [25], 1, 1, -10), profile);
  expect(partial.quality).toBe("obstructed");
  expect(partial.box).toBeNull();
  expect(partial.score).toBeNull();
  expect(profile.partialIdentity?.score).toBeGreaterThanOrEqual(0.9);
  expect(profile.lost).toBe(false);
  expect(measureNativePalette(image(colour), profile).quality).toBe("observed");
  expect(profile.partialIdentity).toBeUndefined();
});
