import { expect, it } from "vitest";
import { cameraNeedsAlignment } from "../src/practice/camera-motion";
it("does not let camera jitter count as a tiny-object action", () => {
  expect(cameraNeedsAlignment(0.006, 0, 1, 0.01)).toBe(true);
  expect(cameraNeedsAlignment(0.001, 0, 1, 0.1)).toBe(false);
  expect(cameraNeedsAlignment(0, 0.02, 1, 0.01)).toBe(true);
  expect(cameraNeedsAlignment(0, 0, 1.02, 0.01)).toBe(true);
  expect(cameraNeedsAlignment(NaN, 0, 1, 0.1)).toBe(true);
});
