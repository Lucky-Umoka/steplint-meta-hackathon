import { expect, it } from "vitest";
import { calibrateLocal, trackLocal } from "../src/practice/local-tracking";
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

it("the application tracker keeps measuring continuously visible partial identity on fresh frames", () => {
  const colour = [180, 30, 60];
  const scene = (top = 30) => {
    const pixels = image(colour, [25], 1, 1, top);
    for (let y = 70; y < 110; y++)
      for (let x = 105; x < 145; x++) {
        const value = 40 + ((x * 17 + y * 31) % 180);
        pixels.data.set([value, value, value, 255], (y * 160 + x) * 4);
      }
    return pixels;
  };
  const state = calibrateLocal(scene(), {
    objects: [{ id: "object", box }],
    workspace: {
      left: 105 / 160,
      top: 70 / 120,
      right: 145 / 160,
      bottom: 110 / 120,
    },
  });
  for (let n = 1; n <= 4; n++) {
    const reply = trackLocal(scene(-10), state, {
      nowMs: n * 70,
      frameId: `partial-${n}`,
    });
    expect(reply.calibrationValid).toBe(true);
    expect(reply.detections[0].quality).toBe("obstructed");
    expect(reply.detections[0].box).toBeNull();
    expect(reply.partialIdentities[0]).toMatchObject({ objectId: "object" });
    expect(reply.partialIdentities[0].score).toBeGreaterThanOrEqual(0.9);
    expect(state.slots.object.identity.status).toBe("tracked");
  }
  expect(
    trackLocal(scene(), state, { nowMs: 350, frameId: "restored" })
      .detections[0].quality,
  ).toBe("observed");
});

it("grounds a colour profile when the reviewed box slightly crops the object (cap above the box)", () => {
  // Object spans y 30..78; the reviewed box starts 4 px lower, cutting off
  // its top like SAM's frame-41 bottle box (browser root cause 2026-11-03).
  const cropped = { ...box, top: 34 / 120 };
  expect(groundNativePalette(image([180, 30, 25]), "bottle", cropped)).not.toBeNull();
  // A genuinely non-distinctive surface still fails: same colour all around.
  const flat = { width: 160, height: 120, data: new Uint8ClampedArray(160 * 120 * 4).fill(180) };
  expect(groundNativePalette(flat, "flat", box)).toBeNull();
});
