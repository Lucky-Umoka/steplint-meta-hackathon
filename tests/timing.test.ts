import { expect, it } from "vitest";
import {
  createSessionClock,
  clockPhase,
  timingSummary,
} from "../src/guide/timing";
import { fixture } from "./fixtures/guide";
it("excludes setup and separates active session, explicit breaks and verification waits", () => {
  const clock = createSessionClock();
  clockPhase(clock, 1000, "verifying");
  clockPhase(clock, 5000, "active", "remove-cover");
  clockPhase(clock, 7000, "paused");
  clockPhase(clock, 10000, "verifying");
  clockPhase(clock, 11000, "active", "remove-phone");
  clockPhase(clock, 14000, "complete");
  const result = timingSummary(
    clock,
    fixture(),
    { "remove-cover": "verified", "remove-phone": "verified" },
    20000,
  );
  expect(result).toMatchObject({
    elapsedMs: 9000,
    activeMs: 5000,
    pausedMs: 3000,
    verificationMs: 1000,
    remainingMs: 0,
    stepMs: { "remove-cover": 2000, "remove-phone": 3000 },
  });
});
it("uses demonstrated durations first, measured pace later, and never completes just because an estimate expired", () => {
  const guide = fixture(),
    clock = createSessionClock();
  clockPhase(clock, 0, "active", "remove-cover");
  expect(timingSummary(clock, guide, {}, 0).estimateBasis).toBe(
    "demonstration",
  );
  clockPhase(clock, 1000, "active", "remove-phone");
  const paced = timingSummary(
    clock,
    guide,
    { "remove-cover": "verified" },
    1000,
  );
  expect(paced.estimateBasis).toBe("your_completed_steps");
  expect(paced.remainingMs).toBeGreaterThan(0);
  expect(
    timingSummary(clock, guide, { "remove-cover": "verified" }, 20000)
      .remainingMs,
  ).toBeNull();
  expect(
    timingSummary(clock, guide, { "remove-cover": "waiting" }, 1000).completed,
  ).toBe(0);
});
it("does not infer breaks from immobility, does not mutate on reading and rejects a backward clock", () => {
  const clock = createSessionClock();
  clockPhase(clock, 100, "active", "remove-cover");
  expect(timingSummary(clock, fixture(), {}, 1100).activeMs).toBe(1000);
  expect(clock.activeMs).toBe(0);
  expect(() => clockPhase(clock, 99, "paused")).toThrow("forward");
});

it("does not invent an average from one demonstration or one learner", async () => {
  const { localAverage } = await import("../src/guide/timing");
  const result = {
    at: 1,
    completed: true,
    activeMs: 1000,
    pausedMs: 0,
    verificationMs: 0,
    elapsedMs: 1000,
    corrections: 0,
    stepMs: {},
  };
  expect(localAverage([])).toBeNull();
  expect(localAverage([result])).toBeNull();
  expect(
    localAverage([
      result,
      { ...result, activeMs: 2000 },
      { ...result, activeMs: 3000 },
    ]),
  ).toEqual({ samples: 3, activeMs: 2000 });
});
