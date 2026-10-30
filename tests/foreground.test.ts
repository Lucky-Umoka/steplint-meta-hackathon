import { expect, it } from "vitest";
import { foregroundPixels, ForegroundSchema } from "../src/guide/foreground";
import { PerceptionResultSchema } from "../src/guide/perception-contract";
import { groundAppearance, groundBackground } from "../src/practice/appearance";
const bounds = { left: 0.2, top: 0.2, right: 0.6, bottom: 0.6 };
it("maps decoded foreground to crop bounds, excluding background through holes", () => {
  const inside = foregroundPixels({
    width: 2,
    height: 2,
    bounds,
    bits: Buffer.from([0b10010000]).toString("base64"),
  });
  expect(inside(0.25, 0.25)).toBe(true);
  expect(inside(0.45, 0.25)).toBe(false);
  expect(inside(0.45, 0.45)).toBe(true);
  expect(inside(0.7, 0.5)).toBe(false);
});
it("does not seed local features from texture outside the actual mask", () => {
  const width = 120,
    height = 90,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let hash = Math.imul(x, 0x45d9f3b) ^ Math.imul(y, 0x119de1f3);
      hash ^= hash >>> 16;
      const value = ((hash >>> 0) % 190) + 50;
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  const image = { width, height, data },
    box = { left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 };
  expect(
    groundAppearance(image, "part", box).features.length,
  ).toBeGreaterThanOrEqual(5);
  const onlyLeft = new Uint8Array(Math.ceil((width * height) / 8));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < 30; x++) {
      const index = y * width + x;
      onlyLeft[index >> 3] |= 1 << (7 - (index & 7));
    }
  const mask = {
    width,
    height,
    bounds: { left: 0, top: 0, right: 1, bottom: 1 },
    bits: Buffer.from(onlyLeft).toString("base64"),
  };
  const track = groundAppearance(image, "part", box, mask);
  expect(track.features.every((feature) => feature.x + 2 < 30)).toBe(true);
  expect(() =>
    groundAppearance(image, "part", box, {
      ...mask,
      bits: Buffer.alloc(onlyLeft.length).toString("base64"),
    }),
  ).toThrow("clearer");
});
it("rejects malformed dimensions and missing or duplicate foreground identities", () => {
  expect(
    ForegroundSchema.safeParse({ width: 10, height: 10, bounds, bits: "AA==" })
      .success,
  ).toBe(false);
  const object = {
      objectId: "part",
      quality: "observed",
      box: bounds,
      score: 0.99,
    },
    foreground = {
      objectId: "part",
      foreground: { width: 2, height: 2, bounds, bits: "8A==" },
    };
  const result = {
    phase: "starting",
    objects: [object],
    foregrounds: [foreground],
    remainingModelRequests: 4,
  };
  expect(PerceptionResultSchema.safeParse(result).success).toBe(true);
  expect(
    PerceptionResultSchema.safeParse({ ...result, foregrounds: [] }).success,
  ).toBe(false);
  expect(
    PerceptionResultSchema.safeParse({
      ...result,
      foregrounds: [foreground, foreground],
    }).success,
  ).toBe(false);
});

it("grounds camera alignment outside object boxes and abstains on a featureless surface", () => {
  const width = 120,
    height = 90,
    data = new Uint8ClampedArray(width * height * 4);
  const object = { left: 0.25, top: 0.25, right: 0.75, bottom: 0.75 };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let hash = Math.imul(x, 0x45d9f3b) ^ Math.imul(y, 0x119de1f3);
      hash ^= hash >>> 16;
      const v = 55 + ((hash >>> 0) % 100);
      data.set([v, v, v, 255], (y * width + x) * 4);
    }
  const track = groundBackground({ width, height, data }, [object]);
  expect(track).not.toBeNull();
  expect(
    track!.features.every(
      (f) =>
        !(
          f.x / width > 0.21 &&
          f.x / width < 0.79 &&
          f.y / height > 0.21 &&
          f.y / height < 0.79
        ),
    ),
  ).toBe(true);
  data.fill(70);
  expect(groundBackground({ width, height, data }, [object])).toBeNull();
});
