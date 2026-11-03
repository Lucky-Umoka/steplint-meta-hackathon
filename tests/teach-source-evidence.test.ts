import { expect, it, vi } from "vitest";
import {
  measuredDisplacementWindows,
  sourceEvidenceCatalog,
} from "../src/teach/source-evidence";
import {
  compilerWireSchema,
  sparkRequest,
  parseSparkDraft,
} from "../src/server/teach/pipeline";
import { validateDraft, validateReviewEvidence } from "../src/teach/schema";
import {
  reviewBlockers,
  reviewEvidenceIssue,
  reviewStepInput,
  suggestReviews,
} from "../src/teach/review-suggestions";
import { localExecutionDraft } from "../src/teach/local-execution";
import { teachV3Fixture } from "./fixtures/teach-v3";
import type { ExecutionV3 } from "../src/procedure/execution-v3";
import { alignScenePredicateEvidence } from "../src/teach/predicate-evidence";

vi.mock("server-only", () => ({}));
it("budgets Baseten reasoning and JSON for every provider setting (Spark is Baseten-only)", () => {
  const { context } = teachV3Fixture();
  try {
    for (const value of ["", "baseten", "meta"]) {
      vi.stubEnv("SPARK_PROVIDER", value);
      expect(sparkRequest(context, { goal: "Transfer" }).max_output_tokens).toBe(24_576);
    }
    expect(sparkRequest(context).max_output_tokens).toBe(6144);
  } finally {
    vi.unstubAllEnvs();
  }
});
it("gives the model exact eligible source ranges instead of equating visible video frames with measurements", () => {
  const { context } = teachV3Fixture(true);
  context.tracking[0].samples[1].confidence = 0.8769;
  expect(sourceEvidenceCatalog(context)[0]).toMatchObject({
    trustedFrames: [0, ...Array.from({ length: 15 }, (_, i) => i + 2)],
    inclusiveFrameRanges: [
      [0, 0],
      [2, 16],
    ],
  });
  const request = sparkRequest(context, { goal: "Transfer" });
  const input = JSON.parse(request.input);
  expect(
    input.sourceEvidencePolicy.objects[0].eligibleInclusiveFrameRanges,
  ).toEqual([
    [0, 0],
    [2, 16],
  ]);
  expect(
    input.tracking[0].samples.some(
      (sample: { frame: number }) => sample.frame === 1,
    ),
  ).toBe(false);
  expect(request.instructions).toContain("SOURCE ELIGIBILITY IS AUTHORITATIVE");
});
it.each(["low-score", "missing", "wrong-timestamp"])(
  "does not admit %s identity evidence through the model wire schema",
  (kind) => {
    const { context, draft } = teachV3Fixture();
    if (kind === "low-score")
      context.tracking[0].samples[1].confidence = 0.8769;
    if (kind === "missing") context.tracking[0].samples.splice(1, 1);
    if (kind === "wrong-timestamp")
      context.tracking[0].samples[1].timestampMs = 101;
    draft.procedure.components[0].execution!.referenceFrames = [1];
    expect(() =>
      compilerWireSchema(true, false, context).parse(draft),
    ).toThrow();
    expect(() =>
      parseSparkDraft(
        { status: "completed", output_text: JSON.stringify(draft) },
        context,
        { goal: "Transfer" },
      ),
    ).toThrow();
    expect(() =>
      validateDraft(localExecutionDraft(draft, "Transfer"), context),
    ).toThrow("Unsupported source evidence");
  },
);
it("does not silently repair an invalid transition using neighbouring eligible identity frames", () => {
  const { context, draft } = teachV3Fixture();
  context.tracking[0].samples[0].confidence = 0.8769;
  draft.procedure.components[0].execution!.referenceFrames = [1, 2];
  expect(() => compilerWireSchema(true, false, context).parse(draft)).toThrow();
  expect(sourceEvidenceCatalog(context)[0].inclusiveFrameRanges).toEqual([
    [1, 10],
  ]);
  // Initial/action evidence relying on frame zero is still invalid; no global
  // bypass (the settled start now needs that untrusted history too).
  expect(() =>
    validateDraft(localExecutionDraft(draft, "Transfer"), context),
  ).toThrow(/frame 0|start frame 4 is not a settled position/);
});
it("represents an object with no trusted tracking as unavailable rather than fabricating source frames", () => {
  const { context } = teachV3Fixture();
  context.tracking[0].samples.forEach((sample) => {
    sample.confidence = null;
  });
  expect(sourceEvidenceCatalog(context)[0]).toMatchObject({
    trustedFrames: [],
    inclusiveFrameRanges: [],
  });
  expect(
    JSON.parse(sparkRequest(context, { goal: "Transfer" }).input)
      .sourceEvidencePolicy.objects[0].eligibleInclusiveFrameRanges,
  ).toEqual([]);
});
it("catalogs deterministic measured movement windows and sends them to the compiler", () => {
  const { context } = teachV3Fixture(true);
  // Settled start (still 400 ms before) to FIRST settled landing.
  expect(sourceEvidenceCatalog(context)[0].displacementWindows).toEqual([
    { startFrame: 4, resultFrame: 6, displacement: 0.3 },
    { startFrame: 10, resultFrame: 12, displacement: 0.3 },
  ]);
  const input = JSON.parse(sparkRequest(context, { goal: "Transfer" }).input);
  expect(input.sourceEvidencePolicy.minimumTransferDisplacement).toBe(0.05);
  expect(
    input.sourceEvidencePolicy.objects[0].measuredMovementWindows,
  ).toHaveLength(2);
});
it("rejects a trusted but motionless action window through the real draft parser and names measured windows (live trial 3)", () => {
  const { context, draft } = teachV3Fixture(true);
  // Mirrors the live failure: the tracked object is still during the chosen
  // window and only moves later; frames remain trusted, so this is a motion
  // contract failure, not a source-score failure.
  context.tracking[0].samples.forEach((sample) => {
    const left = sample.frame <= 10 ? 0.1 : sample.frame === 11 ? 0.25 : 0.4;
    sample.box = { left, top: 0.3, right: left + 0.15, bottom: 0.65 };
  });
  expect(sourceEvidenceCatalog(context)[0].displacementWindows).toEqual([
    { startFrame: 10, resultFrame: 12, displacement: 0.3 },
  ]);
  expect(() =>
    parseSparkDraft(
      { status: "completed", output_text: JSON.stringify(draft) },
      context,
      { goal: "Transfer" },
    ),
  ).toThrow(
    "Unsupported transfer for transfer (component-1, frames 4-6): tracked box centre moved less than 0.05. Measured movement windows for this object: 10-12.",
  );
});
it("does not let a whole-scene or stationary mask become a step mover, even with many trusted frames", () => {
  const { context, draft } = teachV3Fixture(true);
  context.tracking[0].samples.forEach((sample) => {
    sample.box = { left: 0, top: 0.13, right: 1, bottom: 0.98 };
  });
  expect(sourceEvidenceCatalog(context)[0].trustedFrames).toHaveLength(17);
  expect(sourceEvidenceCatalog(context)[0].displacementWindows).toEqual([]);
  expect(() => compilerWireSchema(true, false, context).parse(draft)).toThrow();
  expect(() =>
    validateDraft(localExecutionDraft(draft, "Transfer"), context),
  ).toThrow("has no measured movement window");
});
it("ignores low-score samples when measuring movement windows", () => {
  const { context } = teachV3Fixture(true);
  // Only untrusted frames would show the move; no window may be built from them.
  context.tracking[0].samples.forEach((sample) => {
    if (sample.frame > 0) sample.confidence = 0.5;
  });
  expect(sourceEvidenceCatalog(context)[0].displacementWindows).toEqual([]);
});
/** Re-time the single-action fixture: frame 5 comes gapMs after frame 4. */
function gapFixture(gapMs: number) {
  const fixture = teachV3Fixture();
  const times = fixture.context.lesson.media.frameTimesMs.map((t, frame) =>
    frame <= 4 ? t : t + gapMs - 100,
  );
  fixture.context.lesson.media.frameTimesMs = times;
  fixture.context.tracking[0].samples.forEach((sample) => {
    sample.timestampMs = times[sample.frame];
  });
  return fixture;
}
it("accepts an action spanning a short tracking gap between a settled start and landing (owner bottle: hand over the object)", () => {
  const { context, draft } = gapFixture(500);
  const parsed = parseSparkDraft(
    { status: "completed", output_text: JSON.stringify(draft) },
    context,
    { goal: "Transfer" },
  );
  const checks = suggestReviews(parsed, context);
  expect(checks.transfer.evidenceStatus).toBe("supported");
  expect(() =>
    validateReviewEvidence(
      parsed,
      [
        reviewStepInput("transfer", {
          ...checks.transfer,
          reviewed: true,
          conditionConfirmed: true,
        }),
      ],
      context,
    ),
  ).not.toThrow();
});
it("rejects an action spanning a tracking gap longer than 600 ms, at compile and approval", () => {
  const { context, draft } = gapFixture(700);
  expect(() =>
    parseSparkDraft(
      { status: "completed", output_text: JSON.stringify(draft) },
      context,
      { goal: "Transfer" },
    ),
  ).toThrow();
  expect(() => localExecutionDraft(draft, "Transfer", context)).toThrow(
    /Action window for transfer .*tracking is missing for more than 600 ms between frames 4 and 6/,
  );
  const accepted = teachV3Fixture();
  const parsed = parseSparkDraft(
    { status: "completed", output_text: JSON.stringify(accepted.draft) },
    accepted.context,
    { goal: "Transfer" },
  );
  const checks = suggestReviews(parsed, accepted.context);
  expect(() =>
    validateReviewEvidence(
      parsed,
      [
        reviewStepInput("transfer", {
          ...checks.transfer,
          reviewed: true,
          conditionConfirmed: true,
        }),
      ],
      gapFixture(700).context,
    ),
  ).toThrow("tracking is missing for more than 600 ms");
});
it("rejects a result frame where the object is still moving, so the after moment cannot show it mid-air (owner after-image report)", () => {
  const { context, draft } = teachV3Fixture(true);
  // Remove the still period after the first landing: frame 6 is now followed
  // directly by the next movement, so it is not where the object comes to rest.
  context.tracking[0].samples = context.tracking[0].samples.filter(
    (sample) => sample.frame < 7 || sample.frame > 10,
  );
  expect(() =>
    parseSparkDraft(
      { status: "completed", output_text: JSON.stringify(draft) },
      context,
      { goal: "Transfer" },
    ),
  ).toThrow();
  expect(() => localExecutionDraft(draft, "Transfer", context)).toThrow(
    /Action window for transfer \(component-1, frames 4-6\): the result frame 6 is not where the object comes to rest .* mid-motion/,
  );
});
it("builds windows from the settled start to the FIRST settled landing across a short gap, and not across a long one", () => {
  // 15 fps: still at x=0.1, a carry, a hand gap, then still at x=0.5.
  const sample = (frame: number, left: number) => ({
    frame,
    timestampMs: Math.round(frame * 66.7),
    confidence: 0.98,
    maskPixels: 100,
    box: { left, top: 0.3, right: left + 0.1, bottom: 0.5 },
  });
  const carry = (gapFrames: number) => [
    ...Array.from({ length: 9 }, (_, f) => sample(f, 0.1)),
    ...Array.from({ length: 6 }, (_, i) => sample(9 + i, 0.1 + 0.03 * (i + 1))),
    ...Array.from({ length: 12 }, (_, i) => sample(15 + gapFrames + i, 0.5)),
  ];
  // 7 missing frames (about 470 ms, like the bottle): one rest-to-rest window
  // whose result is the first settled landing frame.
  expect(measuredDisplacementWindows(carry(7))).toEqual([
    { startFrame: 8, resultFrame: 22, displacement: 0.4 },
  ]);
  // 10 missing frames (about 670 ms): no window may cross the gap.
  expect(measuredDisplacementWindows(carry(10))).toEqual([]);
});
it("every draft the compiler accepts gets supported suggestions that pass approval-time evidence checks", () => {
  for (const twoActions of [false, true]) {
    const { context, draft } = teachV3Fixture(twoActions);
    const parsed = parseSparkDraft(
      { status: "completed", output_text: JSON.stringify(draft) },
      context,
      { goal: "Transfer" },
    );
    const checks = suggestReviews(parsed, context);
    for (const step of parsed.procedure.steps) {
      expect(checks[step.id].evidenceStatus).toBe("supported");
      expect(checks[step.id].fromRegion).not.toBeNull();
    }
    expect(() =>
      validateReviewEvidence(
        parsed,
        parsed.procedure.steps.map((s) => ({ stepId: s.id, ...checks[s.id] })),
        context,
      ),
    ).not.toThrow();
  }
});
it("widens only a zone reused at different places, then reports an impossible step instead of a vague review failure (live trial 6)", () => {
  const { context, draft, execution } = teachV3Fixture(true);
  // The second action ends far from the start but reuses the start zone ID,
  // like the live draft's "center_table" used by two objects at two places.
  draft.procedure.steps[1].condition.toZone = "origin";
  execution.finalConditions[0] = {
    ...execution.finalConditions[0],
    kind: "object_in_zone",
    zoneId: "origin",
  };
  const checks = suggestReviews(draft, context);
  expect(checks["transfer-again"].evidenceStatus).toBe("unsupported");
  expect(checks["transfer-again"].evidenceReason).toContain(
    'Zone "origin" is used at several different places (transfer (component-1 start), transfer-again (component-1 target), initial-position (component-1 scene condition), goal-position (component-1 scene condition))',
  );
  expect(checks["transfer-again"].zoneConflict).toBe(true);
  // A reviewer can fix zones, so the compiler does not reject the draft for
  // this; it reaches review with the step flagged and approval still blocked.
  const parsed = parseSparkDraft(
    { status: "completed", output_text: JSON.stringify(draft) },
    context,
    { goal: "Transfer" },
  );
  expect(reviewEvidenceIssue(parsed, context)).toMatch(
    /Review evidence: transfer: Zone "origin".* transfer-again: Zone "origin"/,
  );
  expect(reviewBlockers(parsed, context, checks).join(" ")).toContain(
    'Zone "origin"',
  );
});
it("keeps the exact suggested regions when shared zones already contain every use", () => {
  const { context, draft } = teachV3Fixture(true);
  const checks = suggestReviews(draft, context);
  // Same-object chain: the first target is reused verbatim as the next start.
  expect(checks["transfer-again"].fromRegion).toEqual(checks.transfer.toRegion);
  expect(checks.transfer.evidenceStatus).toBe("supported");
  expect(checks["transfer-again"].evidenceStatus).toBe("supported");
});
it("explains why an object has no measured movement window, from its own tracking", () => {
  const still = teachV3Fixture();
  still.context.tracking[0].samples.forEach(
    (s) => (s.box = still.context.tracking[0].samples[0].box),
  );
  expect(sourceEvidenceCatalog(still.context)[0].movementDiagnosis).toMatch(
    /never moved 0.05/,
  );
  const gapped = teachV3Fixture();
  // Remove frames 3-9 around the move: frames 2 and 10 are 800 ms apart.
  gapped.context.tracking[0].samples =
    gapped.context.tracking[0].samples.filter(
      (s) => s.frame < 3 || s.frame > 9,
    );
  expect(sourceEvidenceCatalog(gapped.context)[0].movementDiagnosis).toMatch(
    /missing for 800 ms \(frames 2-10\)/,
  );
  const restless = teachV3Fixture();
  restless.context.tracking[0].samples.forEach((s) => {
    const left = 0.1 + s.frame * 0.02; // drifts every frame, never still
    s.box = { left, top: 0.3, right: left + 0.15, bottom: 0.65 };
  });
  expect(sourceEvidenceCatalog(restless.context)[0].movementDiagnosis).toMatch(
    /never still for 400 ms/,
  );
  expect(
    sourceEvidenceCatalog(teachV3Fixture().context)[0].movementDiagnosis,
  ).toBeNull();
  // The reason reaches the compiler evidence.
  const input = JSON.parse(
    sparkRequest(still.context, { goal: "Transfer" }).input,
  );
  expect(input.sourceEvidencePolicy.objects[0].whyNoMovementWindow).toMatch(
    /never moved/,
  );
});

it("scene predicate observations do not widen step-derived zones into the target", () => {
  const { context, draft, execution } = teachV3Fixture();
  const baseline = suggestReviews(draft, context);
  // A predicate citing the held view cannot redefine the settled action endpoint.
  execution.initialConditions[0].evidenceFrames = [5];
  const checks = suggestReviews(draft, context);
  expect(checks.transfer.fromRegion).toEqual(baseline.transfer.fromRegion);
  expect(checks.transfer.toRegion).toEqual(baseline.transfer.toRegion);
  expect(checks.transfer.zoneConflict).not.toBe(true);
});

it("a slightly different initial scene position adds no overlap or approval blocker", () => {
  const { context, draft } = teachV3Fixture();
  // Normalized image drift of 0.005 is within the existing 0.01 rest policy.
  context.tracking[0].samples[0].box.left += 0.005;
  context.tracking[0].samples[0].box.right += 0.005;
  const parsed = parseSparkDraft(
    { status: "completed", output_text: JSON.stringify(draft) },
    context,
    { goal: "Transfer" },
  );
  const checks = suggestReviews(parsed, context);
  for (const check of Object.values(checks)) {
    check.reviewed = true;
    check.conditionConfirmed = true;
    expect(check.zoneConflict).not.toBe(true);
  }
  expect(reviewBlockers(parsed, context, checks)).toEqual([]);
});

/** Single-action fixture extended so the bottle is lifted again at frame 15. */
function reliftedFixture() {
  const fixture = teachV3Fixture();
  const { context } = fixture;
  const track = context.tracking[0];
  const settled = track.samples.at(-1)!;
  for (let frame = settled.frame + 1; frame <= 15; frame++) {
    context.lesson.media.frameTimesMs.push(frame * 100);
    track.samples.push({
      ...settled,
      frame,
      timestampMs: frame * 100,
      box:
        frame === 15
          ? { ...settled.box, top: settled.box.top - 0.2, bottom: settled.box.bottom - 0.2 }
          : { ...settled.box },
    });
  }
  context.lesson.media.info.video!.frames = 16;
  fixture.execution.finalConditions[0].evidenceFrames = [15];
  return fixture;
}
const v3Execution = (d: { procedure: { execution?: unknown } }) => {
  const e = d.procedure.execution as { schemaVersion: number };
  if (e?.schemaVersion !== 3) throw Error("expected V3");
  return e as unknown as ExecutionV3;
};
const reviewedBlockers = (
  d: Parameters<typeof suggestReviews>[0],
  context: Parameters<typeof suggestReviews>[1],
) => {
  const checks = suggestReviews(d, context);
  for (const check of Object.values(checks)) {
    check.reviewed = true;
    check.conditionConfirmed = true;
  }
  return reviewBlockers(d, context, checks);
};

it("a final predicate citing a re-lifted frame blocks approval unless bound to the measured result frame", () => {
  const fixture = reliftedFixture();
  const { context } = fixture;
  // A draft compiled before boundary alignment existed (as in the owner's
  // review): measured steps, but the model-cited re-lifted final frame.
  const draft = structuredClone(
    parseSparkDraft(
      { status: "completed", output_text: JSON.stringify(fixture.draft) },
      context,
      { goal: "Transfer" },
    ),
  );
  v3Execution(draft).finalConditions[0].evidenceFrames = [15];
  // Original failure: approval blocks on the unsupported scene condition.
  expect(reviewedBlockers(draft, context).join(" ")).toMatch(
    /does not support its initial\/final source condition/,
  );
  const result = draft.procedure.steps[0].execution!.evidenceWindow.resultFrame;
  const aligned = alignScenePredicateEvidence(draft, context);
  for (const p of v3Execution(aligned).finalConditions)
    expect(p.evidenceFrames).toEqual([result]);
  expect(reviewedBlockers(aligned, context)).toEqual([]);
  expect(v3Execution(draft).finalConditions[0].evidenceFrames).toEqual([15]);
});

it("the compile path binds a contradicting scene predicate to the measured result frame", () => {
  const fixture = reliftedFixture();
  const parsed = parseSparkDraft(
    { status: "completed", output_text: JSON.stringify(fixture.draft) },
    fixture.context,
    { goal: "Transfer" },
  );
  const result = parsed.procedure.steps.at(-1)!.execution!.evidenceWindow.resultFrame;
  for (const p of v3Execution(parsed).finalConditions)
    expect(p.evidenceFrames).toEqual([result]);
});

it("keeps a clearer cited frame at the same resting position", () => {
  const fixture = teachV3Fixture();
  const parsed = parseSparkDraft(
    { status: "completed", output_text: JSON.stringify(fixture.draft) },
    fixture.context,
    { goal: "Transfer" },
  );
  expect(alignScenePredicateEvidence(parsed, fixture.context)).toBe(parsed);
});

it("leaves a contradicting predicate unchanged when the boundary has no trusted sample", () => {
  const fixture = reliftedFixture();
  const draft = structuredClone(
    parseSparkDraft(
      { status: "completed", output_text: JSON.stringify(fixture.draft) },
      fixture.context,
      { goal: "Transfer" },
    ),
  );
  v3Execution(draft).finalConditions[0].evidenceFrames = [15];
  const result = draft.procedure.steps[0].execution!.evidenceWindow.resultFrame;
  const track = fixture.context.tracking[0];
  track.samples = track.samples.filter((s) => s.frame !== result);
  expect(alignScenePredicateEvidence(draft, fixture.context)).toBe(draft);
});
