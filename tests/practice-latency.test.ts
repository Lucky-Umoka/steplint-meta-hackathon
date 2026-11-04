import { expect, it } from "vitest";
import { demoProcedure } from "../src/procedure/demo";
import { ProcedureSpecSchema } from "../src/procedure/schema";
import { calibrateLocal, trackLocal } from "../src/practice/local-tracking";
import { createSession, feedTrackingFrame } from "../src/practice/pipeline";
import { watchSet } from "../src/practice/watch-set";
import type { Pixels } from "../src/practice/tracker";

/**
 * Owner requirement 2026-11-04: a correct (or wrong) move must be confirmed
 * in under 1 second. End to end through the REAL local tracker and the REAL
 * Practice pipeline/verifier (no mocked detections), on a scene shaped like
 * the owner's physical setup: white bowl on a blue towel, black mat, ~15
 * frames/s. The learner's hand hides the bowl mid-carry and two blurred
 * frames occur just before it lands (owner exports: single bad frames sent
 * the bowl into slow identity recovery and decisions took seconds).
 */
const W = 320,
  H = 180,
  FRAME_MS = 66;
type Look = { x: number; hidden?: boolean; blur?: boolean };
function scene({ x: bowlX, hidden, blur }: Look, seed: number): Pixels {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let h = Math.imul(x + seed * 7, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b);
      h ^= h >>> 15;
      const n = (h >>> 0) % 14;
      let c = [200 + n, 186 + n, 165 + n];
      if (y > 95 && y < 170 && x > 30 && x < 160) c = [28 + n, 58 + ((x + y) % 25), 190 + n];
      if (y > 100 && y < 168 && x > 180 && x < 290) c = [18 + n, 18 + (n >> 1), 22 + n];
      if (!hidden) {
        const r = Math.hypot(x - bowlX, y - 130);
        if (r < 22) {
          c = r > 17 ? [236, 236, 236] : [150 + ((x * 5 + y * 11) % 60), 135 + ((x + y * 7) % 50), 115];
          // Motion blur: the bowl's texture smeared towards grey.
          if (blur) c = c.map((v) => Math.round(v * 0.45 + 120 * 0.55));
        }
      }
      data.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
    }
  return { width: W, height: H, data };
}
const box = (l: number, t: number, r: number, b: number) => ({ left: l / W, top: t / H, right: r / W, bottom: b / H });
const towel = box(30, 95, 160, 170),
  mat = box(180, 100, 290, 168);

function procedure() {
  const value = structuredClone(demoProcedure);
  value.steps = [value.steps[0]];
  value.components = value.components.filter((c) => c.id === "blue-base");
  value.execution = {
    schemaVersion: 2,
    goal: "Bowl on the mat",
    goalStepIds: [value.steps[0].id],
    requirements: [{ description: "Observed transfer", status: "covered", stepIds: [value.steps[0].id], reason: "Human reviewed transfer" }],
  };
  value.steps[0].measurement = {
    method: "zone_transition",
    point: "center",
    maximumPositionDrift: 0.01,
    minimumFreshFrames: 3,
    stableForMs: 400,
    maxObservationGapMs: 600,
    persistence: "maintain",
    releaseStepId: null,
    reversalRecovery: "restore_target",
    forbiddenZoneIds: [],
    sourceFrames: { start: 0, change: 1, result: 2 },
  };
  return ProcedureSpecSchema.parse(value);
}

function run(timeline: Look[]) {
  const tracker = calibrateLocal(scene(timeline[0], 0), {
    objects: [
      { id: "blue-base", box: box(73, 108, 117, 152) },
      { id: "towel", box: towel, fixed: true },
      { id: "mat", box: mat, fixed: true },
    ],
    workspace: null,
    zones: [towel, mat],
    consensus: true,
  });
  const session = createSession(procedure(), [
    { zoneId: "staging", region: towel },
    { zoneId: "base-target", region: mat },
  ]);
  let passedAt: number | null = null;
  timeline.forEach((look, i) => {
    const t = (i + 1) * FRAME_MS;
    const watch = watchSet(session.procedure, session.result);
    const r = trackLocal(scene(look, i), tracker, { nowMs: t, frameId: `f${i}`, watch: { required: watch.required, optional: watch.optional } });
    feedTrackingFrame(session, { timestampMs: t, frameId: `f${i}`, calibrationValid: r.calibrationValid, detections: r.detections, partialIdentities: r.partialIdentities, identityEvents: r.identityEvents });
    if (passedAt === null && session.result.steps[0].status === "passed") passedAt = t;
  });
  return { session, passedAt };
}

it("owner requirement: a hand-carried move with occlusion and blurred frames is verified within 1 s of the bowl landing", () => {
  const timeline: Look[] = [];
  for (let i = 0; i < 25; i++) timeline.push({ x: 95 }); // armed on the towel
  for (let x = 95; x <= 140; x += 9) timeline.push({ x }); // lifted, moving
  for (let i = 0; i < 8; i++) timeline.push({ x: 160, hidden: true }); // hand over it (~0.5 s)
  for (let x = 180; x <= 222; x += 7) timeline.push({ x });
  timeline.push({ x: 228, blur: true }, { x: 233, blur: true }); // blurred just before landing
  const landedFrame = timeline.length; // first frame resting on the mat
  for (let i = 0; i < 40; i++) timeline.push({ x: 235 });
  const { session, passedAt } = run(timeline);
  const landedAt = (landedFrame + 1) * FRAME_MS;
  expect(session.armed).toBe(true);
  expect(passedAt).not.toBeNull();
  const latency = passedAt! - landedAt;
  console.info(`[latency] landed ${landedAt} ms -> verified ${passedAt} ms: ${latency} ms`);
  expect(latency).toBeLessThan(1000);
});

it("a wrong move (bowl taken back off the mat after verification) is flagged within 1 s", () => {
  const timeline: Look[] = [];
  for (let i = 0; i < 25; i++) timeline.push({ x: 95 });
  for (let x = 95; x <= 235; x += 7) timeline.push({ x });
  for (let i = 0; i < 20; i++) timeline.push({ x: 235 });
  let leftAt = 0;
  for (let x = 235; x >= 100; x -= 9) {
    // First frame whose bowl centre is outside the mat zone.
    if (!leftAt && x < 180) leftAt = (timeline.length + 1) * FRAME_MS;
    timeline.push({ x });
  }
  for (let i = 0; i < 30; i++) timeline.push({ x: 95 });
  const { session, passedAt } = run(timeline);
  expect(passedAt).not.toBeNull();
  const failed = session.result.events.find((e) => e.status === "failed");
  expect(failed).toBeDefined();
  console.info(`[latency] left the mat ${leftAt} ms -> flagged ${failed!.timestampMs} ms`);
  expect(failed!.timestampMs - leftAt).toBeLessThan(1000);
});

it("the hand still covers the bowl as it lands, then withdraws: verified within 1 s of the bowl being visible again", () => {
  const timeline: Look[] = [];
  for (let i = 0; i < 25; i++) timeline.push({ x: 95 });
  for (let x = 95; x <= 200; x += 9) timeline.push({ x });
  for (let i = 0; i < 10; i++) timeline.push({ x: 235, hidden: true }); // hand over it while placing
  const visibleFrame = timeline.length;
  for (let i = 0; i < 45; i++) timeline.push({ x: 235 });
  const { passedAt } = run(timeline);
  const visibleAt = (visibleFrame + 1) * FRAME_MS;
  expect(passedAt).not.toBeNull();
  console.info(`[latency] hand withdrawn ${visibleAt} ms -> verified ${passedAt} ms: ${passedAt! - visibleAt} ms`);
  expect(passedAt! - visibleAt).toBeLessThan(1000);
});
