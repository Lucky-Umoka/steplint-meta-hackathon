import { expect, it } from "vitest";
import { bootstrapLocal, trackLocal } from "../src/practice/local-tracking";
import { smoothTable, at, W, H } from "./fixtures/practice-scene";
import type { Pixels } from "../src/practice/tracker";

// Paid run 16 root cause: the red bottle stood on a plain blue lid, so the
// lid's approved appearance included the bottle. Lifting the bottle away
// changed how the (unmoved) lid looked, and Practice treated that as camera
// motion, resetting the session in the middle of the demonstrated move.
type Box = { left: number; top: number; right: number; bottom: number };
const paint = (
  image: Pixels,
  box: Box,
  rgb: (x: number, y: number) => [number, number, number],
) => {
  for (let y = Math.floor(box.top * H); y < Math.ceil(box.bottom * H); y++)
    for (let x = Math.floor(box.left * W); x < Math.ceil(box.right * W); x++)
      image.data.set(
        [...rgb(x - Math.floor(box.left * W), y - Math.floor(box.top * H)), 255],
        (y * W + x) * 4,
      );
};
const plate = { left: 0.6, top: 0.55, right: 0.92, bottom: 0.85 };
// "uncertain": the empty lid is no longer recognised (run 16's message).
// "dragged": the lid's match follows the departing mover (a displaced box).
const layouts = {
  uncertain: {
    tray: { left: 0.05, top: 0.55, right: 0.4, bottom: 0.85 },
    mover: { left: 0.12, top: 0.3, right: 0.3, bottom: 0.78 },
  },
  dragged: {
    tray: { left: 0.08, top: 0.6, right: 0.36, bottom: 0.82 },
    mover: { left: 0.14, top: 0.25, right: 0.3, bottom: 0.75 },
  },
};
function setup(layout: keyof typeof layouts, plateSeed = 2) {
  const { tray, mover } = layouts[layout];
  const scene = (moverBox: Box, shiftX = 0, seed = plateSeed) => {
    const image = smoothTable([{ box: at(plate, shiftX), seed }]);
    paint(image, at(tray, shiftX), () => [40, 90, 210]); // plain blue lid
    paint(image, at(moverBox, shiftX), (x, y) => [
      200 + ((x * 7 + y * 3) % 40),
      30 + ((x * y) % 20),
      30,
    ]); // red bottle
    return image;
  };
  const source = scene(mover);
  const { state } = bootstrapLocal(source, {
    scene: source,
    objects: [
      { id: "mover", box: mover, fixed: false, image: source, required: true },
      { id: "tray", box: tray, fixed: true, image: source },
      { id: "plate", box: plate, fixed: true, image: source },
    ],
  });
  /** Carry the mover dx to the right over `frames` frames (15 fps). */
  const carry = (frames: number, dx: number) => {
    let reply: ReturnType<typeof trackLocal> | null = null;
    for (let i = 1; i <= frames; i++) {
      reply = trackLocal(scene(at(mover, (dx * i) / frames)), state, {
        nowMs: 1000 + i * 67,
        frameId: `f${i}`,
      });
      if (!reply.calibrationValid) break;
    }
    return reply!;
  };
  return { state, scene, carry, mover };
}

it.each(["uncertain", "dragged"] as const)(
  "lifting the mover off the reference it started on is not camera motion (paid run 16, %s lid)",
  (layout) => {
    const { state, carry } = setup(layout);
    expect(state.startSupports?.has("tray")).toBe(true);
    expect(state.startSupports?.has("plate")).toBe(false);
    const reply = carry(12, 0.5);
    expect(reply.reason).toBeNull();
    expect(reply.calibrationValid).toBe(true);
    const seen = reply.detections.find((d) => d.objectId === "mover");
    expect(seen?.quality).toBe("observed");
    expect((seen!.box!.left + seen!.box!.right) / 2).toBeGreaterThan(0.6);
    // A disturbed lid is never reported at a box.
    expect(reply.detections.find((d) => d.objectId === "tray")?.box ?? null).toBeNull();
  },
);
it.each(["uncertain", "dragged"] as const)(
  "the old rule reproduced (%s lid): without the start-support set the same lift is misread as camera motion",
  (layout) => {
    const { state, carry } = setup(layout);
    state.startSupports = new Set();
    expect(carry(12, 0.5).reason).toMatch(/fixed destination or reference moved/);
  },
);
it("a reference the mover never stood on still invalidates when it changes with the mover far away", () => {
  const { state, scene, mover } = setup("uncertain");
  trackLocal(scene(mover), state, { nowMs: 1000, frameId: "a" });
  const reply = trackLocal(scene(mover, 0, 8), state, { nowMs: 1067, frameId: "swap" });
  expect(reply.calibrationValid).toBe(false);
});
it.each(["uncertain", "dragged"] as const)(
  "camera motion after the mover left its start is still detected within the 2 s guard (%s lid)",
  (layout) => {
    const { state, scene, carry, mover } = setup(layout);
    expect(carry(12, 0.5).calibrationValid).toBe(true);
    let reply: ReturnType<typeof trackLocal> | null = null;
    let elapsed = 0;
    for (let i = 0; i < 45 && (reply?.calibrationValid ?? true); i++) {
      elapsed = i * 67;
      reply = trackLocal(scene(at(mover, 0.5), 0.06), state, {
        nowMs: 3000 + elapsed,
        frameId: `cam${i}`,
      });
    }
    expect(reply!.calibrationValid).toBe(false);
    expect(elapsed).toBeLessThanOrEqual(2100);
  },
);
it("camera motion while the mover still stands on its start is detected immediately by the plate", () => {
  const { state, scene, mover } = setup("uncertain");
  trackLocal(scene(mover), state, { nowMs: 1000, frameId: "a" });
  const reply = trackLocal(scene(mover, 0.06), state, { nowMs: 1067, frameId: "b" });
  expect(reply.calibrationValid).toBe(false);
});
