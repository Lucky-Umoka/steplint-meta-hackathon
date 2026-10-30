import { expect, it } from "vitest";
import { frameAtSourceTime } from "../src/guide/source-time";
it("maps timestamps using actual decoded metadata independently of frame rate", () => {
  expect(
    frameAtSourceTime(
      1000,
      Array.from({ length: 31 }, (_, i) => Math.round((i * 1000) / 15)),
      2000,
    ),
  ).toBe(15);
  expect(
    frameAtSourceTime(
      1000,
      Array.from({ length: 61 }, (_, i) => Math.round((i * 1000) / 30)),
      2000,
    ),
  ).toBe(30);
  expect(frameAtSourceTime(650, [0, 500, 1000, 1500], 2000)).toBe(1);
});
it("rejects invented future times, missing frames and ambiguous metadata", () => {
  for (const time of [-1, 9000, NaN])
    expect(() => frameAtSourceTime(time, [0, 500, 1000], 1500)).toThrow(
      "timestamp",
    );
  expect(() => frameAtSourceTime(500, [0, 1000], 1000)).toThrow("nearby");
  expect(() => frameAtSourceTime(500, [0, 500, 500], 1000)).toThrow();
});
