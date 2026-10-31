import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Box, GuideObservation } from "../src/guide/schema";
import {
  beginGuide,
  createGuideSession,
  feedGuideObservation,
} from "../src/guide/evaluator";
import { groundAppearance, trackAppearance } from "../src/practice/appearance";
import type { Pixels } from "../src/practice/tracker";
import { fixture } from "./fixtures/guide";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("No network in unit tests");
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
function texture(dx = 0): Pixels {
  const width = 120,
    height = 90,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      let v = 60;
      if (x >= 25 + dx && x < 65 + dx && y >= 25 && y < 65) {
        let hash = Math.imul(x - dx, 0x45d9f3b) ^ Math.imul(y, 0x119de1f3);
        hash ^= hash >>> 16;
        v = ((hash >>> 0) % 190) + 50;
      }
      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = 255;
    }
  return { width, height, data };
}
const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
describe("local-only practice timing on synthetic frames", () => {
  it("tracks, evaluates and verifies without remote calls inside generous ceilings", () => {
    const base = texture(0);
    const track = groundAppearance(base, "cover", {
      left: 25 / 120,
      top: 25 / 90,
      right: 65 / 120,
      bottom: 65 / 90,
    });
    const s = createGuideSession(fixture(), "test");
    const box = (x: number, y = 0.15): Box => ({
      left: x,
      top: y,
      right: x + 0.16,
      bottom: y + 0.2,
    });
    const obs = (t: number, cover: number, id: string): GuideObservation => ({
      id: `${id}-${t}`,
      timestampMs: t,
      cameraEpoch: "test",
      objects: [
        {
          objectId: "cover",
          quality: "observed",
          box: box(cover),
          score: 0.99,
        },
        {
          objectId: "phone",
          quality: "observed",
          box: box(0.1, 0.55),
          score: 0.99,
        },
      ],
    });
    beginGuide(s, obs(0, 0.1, "b"));
    const trackMs: number[] = [],
      evalMs: number[] = [];
    // Even-pixel shifts only: the coarse search samples even offsets, so odd
    // shifts of pixel-independent synthetic noise cannot correlate. Real
    // footage is spatially coherent and unaffected.
    const shifts = [0, 2, 4, 6, 8, 10, 8, 6, 4, 2, 0, 2];
    for (let i = 0; i < shifts.length; i++) {
      const t0 = performance.now();
      const frame = texture(shifts[i]);
      const d = trackAppearance(frame, track);
      trackMs.push(performance.now() - t0);
      expect(d.quality).toBe("observed");
      const t1 = performance.now();
      feedGuideObservation(s, obs(120 + i * 120, 0.1 + i * 0.03, `m${i}`));
      evalMs.push(performance.now() - t1);
    }
    expect(s.steps["remove-cover"]).toBe("verified");
    expect(fetch).not.toHaveBeenCalled();
    const trackMed = Math.round(median(trackMs) * 10) / 10,
      evalMed = Math.round(median(evalMs) * 10) / 10;
    process.stderr.write(
      `local-timing medians: track ${trackMed}ms, evaluate ${evalMed}ms over 12 synthetic frames\n`,
    );
    expect(trackMed).toBeLessThan(1000);
    expect(evalMed).toBeLessThan(50);
  });
});
