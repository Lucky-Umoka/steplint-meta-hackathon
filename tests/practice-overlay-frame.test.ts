import { expect, it } from "vitest";
import {
  overlayFrame,
  OVERLAY_REPLAY_FRAMES,
} from "../src/practice/overlay-frame";
import {
  motionSignature,
  signatureDifference,
  MotionWindows,
} from "../src/practice/motion-windows";
function camera(brightness = 0, moved = false) {
  const width = 640,
    height = 480,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const part =
        x >= (moved ? 350 : 200) &&
        x < (moved ? 378 : 228) &&
        y >= 220 &&
        y < 248;
      const v = (part ? 180 : 70) + brightness;
      const j = (y * width + x) * 4;
      data[j] = data[j + 1] = data[j + 2] = v;
      data[j + 3] = 255;
    }
  return { width, height, data };
}
it("retains eight seconds of delayed setup without the old five-second tracking dropout", () => {
  const frame = overlayFrame(camera());
  expect(frame.width).toBe(320);
  expect(frame.height).toBe(240);
  const history = Array.from({ length: 96 }, (_, i) => ({
    at: (i * 1000) / 12,
    frame,
  }));
  expect(history.length).toBeLessThan(OVERLAY_REPLAY_FRAMES);
  expect(OVERLAY_REPLAY_FRAMES * frame.data.byteLength).toBeLessThan(
    60 * 640 * 480 * 4,
  );
});
it("camera auto-exposure does not look like task motion", () => {
  expect(
    signatureDifference(
      motionSignature(overlayFrame(camera())),
      motionSignature(overlayFrame(camera(15))),
    ),
  ).toBeLessThan(0.001);
});
it("a small moved part triggers automatic capture without global-scene movement", () => {
  const c = new MotionWindows();
  const before = motionSignature(overlayFrame(camera()));
  const after = motionSignature(overlayFrame(camera(0, true)));
  expect(signatureDifference(before, after)).toBeGreaterThan(3);
  const take = (t: number, signature: number[]) =>
    c.observe(signature, t, () => ({
      frame: t,
      image: "test",
      width: 640,
      height: 480,
    }));
  take(0, before);
  take(100, after);
  take(500, after);
  expect(take(900, after)?.frames.map((f) => f.frame)).toEqual([0, 500, 900]);
});
