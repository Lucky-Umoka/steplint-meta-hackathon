import { expect, it } from "vitest";
import { calibrateLocal, trackLocal } from "../src/practice/local-tracking";
import type { Pixels } from "../src/practice/tracker";
const box = { left: 0.15, top: 0.3, right: 0.35, bottom: 0.65 },
  workspace = { left: 0.65, top: 0.15, right: 0.85, bottom: 0.35 };
function frame(dx = 0, anchorDx = 0, hide = false): Pixels {
  const width = 160,
    height = 120,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const object = !hide && x >= 24 + dx && x < 56 + dx && y >= 36 && y < 78;
      const anchor =
        x >= 104 + anchorDx && x < 136 + anchorDx && y >= 18 && y < 42;
      const sx = object ? x - dx : anchor ? x - anchorDx : x;
      const value =
        object || anchor
          ? 50 + ((((sx * 73856093) ^ (y * 19349663)) >>> 0) % 150)
          : 110 + ((x + y) % 3);
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  return { width, height, data };
}
it("tracks a textured neutral object with a separate fixed reference without colour markers", () => {
  const state = calibrateLocal(frame(), {
    objects: [{ id: "native-object", box }],
    workspace,
  });
  for (let x = 0; x <= 12; x += 2) {
    const result = trackLocal(frame(x), state);
    expect(result.calibrationValid).toBe(true);
    expect(result.detections[0].quality).toBe("observed");
    expect(result.detections[0].box!.left).toBeCloseTo(box.left + x / 160, 2);
  }
});
it("camera/reference movement invalidates calibration and cannot become object motion", () => {
  const state = calibrateLocal(frame(), {
    objects: [{ id: "native-object", box }],
    workspace,
  });
  expect(trackLocal(frame(0, 6), state).calibrationValid).toBe(false);
  expect(trackLocal(frame(), state).calibrationValid).toBe(false);
});
it("does not silently reacquire a lost identity", () => {
  const state = calibrateLocal(frame(), {
    objects: [{ id: "native-object", box }],
    workspace,
  });
  expect(trackLocal(frame(0, 0, true), state).detections[0].quality).not.toBe(
    "observed",
  );
  expect(trackLocal(frame(), state).detections[0].quality).not.toBe("observed");
});
it("rejects overlapping identities and reference regions", () => {
  expect(() =>
    calibrateLocal(frame(), {
      objects: [
        { id: "a", box },
        { id: "b", box },
      ],
      workspace,
    }),
  ).toThrow("separate");
  expect(() =>
    calibrateLocal(frame(), { objects: [{ id: "a", box }], workspace: box }),
  ).toThrow("separate");
});
it("compares a fixed object's measured seed geometry rather than the padded human mark", () => {
  const withAnchor = (dx = 0) => {
    const image = frame();
    for (let y = 72; y < 104; y++)
      for (let x = 96 + dx; x < 120 + dx; x++)
        image.data.set([160, 40, 80, 255], (y * image.width + x) * 4);
    return image;
  };
  const initial = withAnchor();
  const state = calibrateLocal(initial, {
    workspace,
    objects: [
      { id: "moving", box },
      {
        id: "fixed-destination",
        box: { left: 0.55, top: 0.53, right: 0.8, bottom: 0.93 },
        fixed: true,
      },
    ],
  });
  expect(trackLocal(withAnchor(), state).calibrationValid).toBe(true);
  expect(trackLocal(withAnchor(6), state).calibrationValid).toBe(false);
});
