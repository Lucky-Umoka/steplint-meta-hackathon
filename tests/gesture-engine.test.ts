import { describe, expect, it } from "vitest";
import {
  DEFAULT_ZONE,
  GestureEngine,
  inZone,
  controlPointer,
} from "../src/gesture/engine";

const read = (
  kind: "point" | "pinch" | "open_palm" | "none",
  at: number,
  extra = {},
) => ({
  kind,
  confidence: 0.9,
  x: 0.89,
  y: 0.5,
  ...extra,
  at,
});
describe("inZone", () => {
  it("accepts the control strip and rejects the work area", () => {
    expect(inZone(DEFAULT_ZONE, 0.89, 0.5)).toBe(true);
    expect(inZone(DEFAULT_ZONE, 0.4, 0.5)).toBe(false);
  });
});
describe("GestureEngine", () => {
  it("moves the pointer on confident points inside the zone", () => {
    const engine = new GestureEngine();
    expect(engine.observe(read("point", 0))).toEqual({
      kind: "move",
      x: 0.89,
      y: 0.5,
    });
  });
  it("ignores low-confidence readings and reports why", () => {
    const engine = new GestureEngine();
    expect(
      engine.observe({
        kind: "point",
        confidence: 0.2,
        x: 0.89,
        y: 0.5,
        at: 0,
      }),
    ).toEqual({ kind: "none" });
    expect(engine.lastIgnored).toBe("low-confidence");
  });
  it("ignores the work area and reports why", () => {
    const engine = new GestureEngine();
    expect(
      engine.observe({ kind: "point", confidence: 0.9, x: 0.4, y: 0.5, at: 0 }),
    ).toEqual({ kind: "none" });
    expect(engine.lastIgnored).toBe("outside-zone");
  });
  it("fires one click after pinch dwell, then cools down", () => {
    const engine = new GestureEngine();
    const gap = { pinchGap: 0.03 };
    expect(engine.observe(read("pinch", 0, gap))).toEqual({ kind: "none" });
    expect(engine.observe(read("pinch", 300, gap))).toEqual({
      kind: "click",
      x: 0.89,
      y: 0.5,
    });
    // Still held: pointer keeps moving, but no repeat click.
    expect(engine.observe(read("pinch", 500, gap))).toEqual({
      kind: "move",
      x: 0.89,
      y: 0.5,
    });
    // Release with hysteresis gap, then a quick re-pinch stays cooling down.
    expect(engine.observe(read("pinch", 600, { pinchGap: 0.09 }))).toEqual({
      kind: "move",
      x: 0.89,
      y: 0.5,
    });
    expect(engine.observe(read("pinch", 700, gap))).toEqual({ kind: "none" });
    expect(engine.observe(read("pinch", 1300, gap))).toEqual({
      kind: "click",
      x: 0.89,
      y: 0.5,
    });
  });
  it("needs a stable pinch: flicker below dwell never clicks", () => {
    const engine = new GestureEngine();
    const gap = { pinchGap: 0.03 };
    expect(engine.observe(read("pinch", 0, gap))).toEqual({ kind: "none" });
    expect(engine.observe(read("point", 100))).toEqual({
      kind: "move",
      x: 0.89,
      y: 0.5,
    });
    expect(engine.observe(read("pinch", 200, gap))).toEqual({ kind: "none" });
  });
  it("fires pause once per open-palm presentation", () => {
    const engine = new GestureEngine();
    expect(engine.observe(read("open_palm", 0))).toEqual({ kind: "none" });
    expect(engine.observe(read("open_palm", 1300))).toEqual({ kind: "pause" });
    expect(engine.observe(read("open_palm", 2600))).toEqual({ kind: "none" });
    // Hand leaves and returns: a fresh dwell fires again.
    expect(engine.observe(read("none", 2700))).toEqual({ kind: "none" });
    expect(engine.observe(read("open_palm", 2800))).toEqual({ kind: "none" });
    expect(engine.observe(read("open_palm", 4100))).toEqual({ kind: "pause" });
  });
  it("resets cleanly", () => {
    const engine = new GestureEngine();
    engine.observe(read("pinch", 0, { pinchGap: 0.03 }));
    engine.reset();
    expect(engine.observe(read("open_palm", 100))).toEqual({ kind: "none" });
    expect(engine.lastIgnored).toBe(null);
  });
});

it("requires an open palm in the designated zone and allows a second fresh hold", () => {
  const e = new GestureEngine();
  e.observe(read("open_palm", 0, { x: 0.4 }));
  expect(e.observe(read("open_palm", 1500, { x: 0.4 }))).toEqual({
    kind: "none",
  });
  e.observe(read("open_palm", 1600));
  expect(e.observe(read("open_palm", 2900)).kind).toBe("pause");
  e.observe(read("point", 3000));
  e.observe(read("open_palm", 3100));
  expect(e.observe(read("open_palm", 4400)).kind).toBe("pause");
});
it("maps the hand control strip across the screen so controls outside the video are reachable", () => {
  expect(controlPointer(DEFAULT_ZONE, 0.8, 0.1)).toEqual({ x: 0, y: 0 });
  expect(controlPointer(DEFAULT_ZONE, 0.98, 0.9)).toEqual({ x: 1, y: 1 });
  expect(controlPointer(DEFAULT_ZONE, 0.89, 0.5).x).toBeCloseTo(0.5);
});

it("geometric pinch uses dwell and one-shot click without a fabricated classifier score", () => {
  const engine = new GestureEngine();
  const pinch = (at: number) => ({
    kind: "pinch" as const,
    confidence: null,
    geometry: "hand-relative-pinch" as const,
    pinchGap: 0.02,
    x: 0.89,
    y: 0.5,
    at,
  });
  expect(engine.observe(pinch(0)).kind).toBe("none");
  expect(engine.observe(pinch(300)).kind).toBe("click");
  expect(engine.observe(pinch(1200)).kind).not.toBe("click");
  expect(engine.observe({ ...pinch(1400), geometry: undefined }).kind).toBe(
    "none",
  );
});
