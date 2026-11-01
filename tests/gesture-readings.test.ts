import { expect, it } from "vitest";
import { gestureReading, type RecognizedHands } from "../src/gesture/readings";
const hands = (): RecognizedHands => ({
  gestures: [[{ categoryName: "Pointing_Up", score: 0.91 }]],
  landmarks: [
    Array.from({ length: 21 }, (_, i) => ({
      x: i === 8 ? 0.89 : i === 5 ? 0.8 : i === 17 ? 0.9 : 0.5,
      y: 0.5,
    })),
  ],
});
it("reads fingertip coordinates from the actual per-hand landmark array", () => {
  const r = gestureReading(hands(), 10);
  expect(r.kind).toBe("point");
  expect(r.x).toBe(0.89);
  expect(r.y).toBe(0.5);
  expect(r.confidence).toBe(0.91);
});
it("uses thumb/index geometry for pinching without inventing confidence", () => {
  const h = hands();
  h.landmarks[0][4] = { x: 0.88, y: 0.5 };
  expect(gestureReading(h, 10)).toMatchObject({
    kind: "pinch",
    pinchGap: expect.closeTo(0.02),
    confidence: null,
    geometry: "hand-relative-pinch",
  });
});
it("does not emit actionable gestures for missing or malformed landmarks", () => {
  const h = hands();
  h.landmarks = [];
  expect(gestureReading(h, 10).kind).toBe("none");
  const bad = hands();
  bad.landmarks[0][8].x = NaN;
  expect(gestureReading(bad, 10).kind).toBe("none");
});

it("preserves a recognized open palm even when a distant hand has a small image-space finger gap", () => {
  const h = hands();
  h.gestures[0][0].categoryName = "Open_Palm";
  h.landmarks[0][4] = { x: 0.87, y: 0.5 };
  expect(gestureReading(h, 10).kind).toBe("open_palm");
});

it("recognizes a geometric pinch when the built-in gesture classifier says None", () => {
  const h = hands();
  h.gestures[0][0] = { categoryName: "None", score: 0.03 };
  h.landmarks[0][4] = { x: 0.88, y: 0.5 };
  expect(gestureReading(h, 10)).toMatchObject({
    kind: "pinch",
    confidence: null,
  });
});
it("keeps pinch gap relative to hand size rather than distance from the camera", () => {
  const near = hands();
  near.landmarks[0][4] = { x: 0.88, y: 0.5 };
  const far = structuredClone(near);
  far.landmarks[0] = far.landmarks[0].map((p) => ({
    x: 0.5 + (p.x - 0.5) / 2,
    y: 0.5 + (p.y - 0.5) / 2,
  }));
  expect(gestureReading(near, 10).pinchGap).toBeCloseTo(
    gestureReading(far, 10).pinchGap!,
  );
});
