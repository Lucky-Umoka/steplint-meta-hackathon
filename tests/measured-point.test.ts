import { expect, it, vi } from "vitest";
import { teachV3Fixture } from "./fixtures/teach-v3";
import { parseSparkDraft } from "../src/server/teach/pipeline";
import { suggestReviews, reviewStepInput } from "../src/teach/review-suggestions";
import { approveDraft, type TeachDraft, type TeachContext } from "../src/teach/schema";
import { createSession, feedTrackingFrame } from "../src/practice/pipeline";
import { watchSet } from "../src/practice/watch-set";
import { evaluatePredicate, isProcedureComplete } from "../src/procedure/goal";

vi.mock("server-only", () => ({}));

// Paid run 16 root cause: SAM (Teach) and the local tracker (Practice) agree
// on a tall object's base but not its top (bottle nozzle: tops differed by
// 0.058, bases by 0.004). The box centre therefore moved by half that
// disagreement, outside the approved destination zone, and the step never
// passed although the bottle rested on the plate.
function approved(point?: "center" | "bottom_center") {
  const { context, draft } = teachV3Fixture();
  const compiled: TeachDraft = parseSparkDraft(
    { status: "completed", output_text: JSON.stringify(draft) },
    context,
    { goal: "Transfer" },
  );
  if (point) for (const s of compiled.procedure.steps) s.measurement!.point = point;
  return { ...approve(compiled, context), compiled };
}
function approve(compiled: TeachDraft, context: TeachContext) {
  const checks = suggestReviews(compiled, context);
  return approveDraft(
    compiled,
    {
      reviewer: "T",
      confirmed: true,
      goalConfirmed: true,
      steps: compiled.procedure.steps.map((s) =>
        reviewStepInput(s.id, { ...checks[s.id], reviewed: true, conditionConfirmed: true }),
      ),
    },
    context,
    1000,
  );
}
/** Practice frames: Teach's base and x position, but the top drawn `taller` higher. */
function practise(
  lesson: ReturnType<typeof approved>,
  taller: number,
) {
  const session = createSession(lesson.procedure, lesson.zoneBindings, 0);
  let t = 10_000;
  const feed = (left: number | null) => {
    t += 100;
    feedTrackingFrame(session, {
      timestampMs: t,
      frameId: `f${t}`,
      calibrationValid: true,
      partialIdentities: [],
      watchKey: watchSet(session.procedure, session.result).key,
      detections: [
        {
          objectId: "component-1",
          quality: "observed",
          box:
            left === null
              ? { left: 0.28, top: 0.1, right: 0.43, bottom: 0.45 } // lifted, in transit
              : { left, top: 0.3 - taller, right: left + 0.15, bottom: 0.65 },
          score: 0.97,
        },
      ],
    });
  };
  for (let i = 0; i < 8; i++) feed(0.1); // resting at the origin
  feed(null);
  feed(null);
  for (let i = 0; i < 12; i++) feed(0.4); // resting at the destination
  return session;
}

it("V3 steps measure the object's base by default, and the base reaches the approved zone despite top-edge disagreement (paid run 16)", () => {
  const lesson = approved();
  expect(lesson.compiled.procedure.steps[0].measurement?.point).toBe("bottom_center");
  const session = practise(lesson, 0.16);
  expect(session.result.steps[0].status).toBe("passed");
  expect(session.goal.status).toBe("complete");
  expect(isProcedureComplete(session.procedure, session.goal, true)).toBe(true);
});
it("the old centre point reproduces the run-16 failure: the same placement never verifies", () => {
  const session = practise(approved("center"), 0.16);
  expect(session.result.steps[0].status).not.toBe("passed");
  expect(session.goal.status).not.toBe("complete");
});
it("centre-measured lessons still verify when both trackers agree on the box (no regression)", () => {
  const session = practise(approved("center"), 0);
  expect(session.result.steps[0].status).toBe("passed");
  expect(session.goal.status).toBe("complete");
});
it("a base placed outside the destination still never verifies", () => {
  const lesson = approved();
  const session = createSession(lesson.procedure, lesson.zoneBindings, 0);
  let t = 10_000;
  for (const [left, bottom, n] of [[0.1, 0.65, 8], [0.4, 0.8, 12]] as const)
    for (let i = 0; i < n; i++) {
      t += 100;
      feedTrackingFrame(session, {
        timestampMs: t,
        frameId: `f${t}`,
        calibrationValid: true,
        partialIdentities: [],
        watchKey: watchSet(session.procedure, session.result).key,
        detections: [{ objectId: "component-1", quality: "observed", box: { left, top: bottom - 0.35, right: left + 0.15, bottom }, score: 0.97 }],
      });
    }
  expect(session.result.steps[0].status).not.toBe("passed");
  expect(session.goal.status).not.toBe("complete");
});
it("the final goal uses the object's approved point, the same as its steps", () => {
  const zones = { destination: { left: 0.6, top: 0.6, right: 0.9, bottom: 0.7 } };
  const predicate = { id: "g", kind: "object_in_zone" as const, objectId: "a", zoneId: "destination", evidenceFrames: [1] };
  // Box centre (y 0.475) is above the zone; its base (y 0.65) is inside.
  const latest = { a: { timestampMs: 1000, quality: "observed" as const, confidence: 0.97, box: { left: 0.7, top: 0.3, right: 0.8, bottom: 0.65 } } };
  const policy = { freshMs: 600, minConfidence: 0.9, holdMs: 400 };
  expect(evaluatePredicate(predicate, latest, zones, 1100, { ...policy, points: { a: "bottom_center" } }).verdict).toBe("pass");
  expect(evaluatePredicate(predicate, latest, zones, 1100, policy).verdict).not.toBe("pass");
});
it("steps of one object cannot disagree on its measured point (existing schema rule)", () => {
  const { context, draft } = teachV3Fixture(true);
  const compiled = parseSparkDraft(
    { status: "completed", output_text: JSON.stringify(draft) },
    context,
    { goal: "Transfer" },
  );
  compiled.procedure.steps[1].measurement!.point = "center";
  expect(() => approve(compiled, context)).toThrow(/same measured point/);
});
