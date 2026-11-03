import { expect, it, vi } from "vitest";
import { teachV3Fixture } from "./fixtures/teach-v3";
import { localExecutionDraft } from "../src/teach/local-execution";
import { createSession, feedTrackingFrame } from "../src/practice/pipeline";
import { watchSet } from "../src/practice/watch-set";
import {
  automaticSetupPlan,
  automaticSetupIssue,
} from "../src/teach/automatic-setup";
import { approveDraft } from "../src/teach/schema";
import {
  reviewStepInput,
  suggestReviews,
} from "../src/teach/review-suggestions";
import type { ProcedureSpec } from "../src/procedure/schema";

vi.mock("server-only", () => ({}));
/** Two actions: the mover goes origin→middle, then a later "phone" goes middle→destination. */
function laterObjectLesson() {
  const { draft, context, execution } = teachV3Fixture(true);
  const second = draft.procedure.steps[1];
  second.condition.componentId = "component-2";
  second.execution!.requiredObjectIds = ["component-2"];
  second.prerequisites = ["transfer"];
  draft.procedure.components[0].execution!.referenceFrames = [0, 6];
  draft.procedure.components.push(
    {
      id: "component-2",
      description: "Phone revealed later",
      execution: {
        role: "required",
        roleReason: "Moved in the second step",
        motion: "movable",
        firstRequiredAt: { stepId: second.id },
        referenceFrames: [10, 16],
      },
    },
    {
      id: "component-3",
      description: "Background",
      execution: {
        role: "irrelevant",
        roleReason: "Not used",
        motion: "stationary",
        firstRequiredAt: "never",
        referenceFrames: [],
      },
    },
  );
  for (const id of ["component-2", "component-3"])
    context.selections.push({
      ...structuredClone(context.selections[0]),
      id,
      description: id,
    });
  context.tracking.push({
    componentId: "component-2",
    missingFrames: 0,
    samples: structuredClone(context.tracking[0].samples),
  });
  execution.finalConditions[0].objectId = "component-2";
  execution.finalConditions[0].evidenceFrames = [16];
  const local = localExecutionDraft(draft, execution.goal, context);
  return { draft: local, context };
}
const bindings = [
  {
    zoneId: "origin",
    region: { left: 0.1, top: 0.3, right: 0.25, bottom: 0.65 },
  },
  {
    zoneId: "middle",
    region: { left: 0.4, top: 0.3, right: 0.55, bottom: 0.65 },
  },
  {
    zoneId: "destination",
    region: { left: 0.7, top: 0.3, right: 0.85, bottom: 0.65 },
  },
];
const approved = (procedure: ProcedureSpec): ProcedureSpec => ({
  ...procedure,
  approval: { reviewer: "Test", timestampMs: 1, revision: "a".repeat(64) },
});
const box = (x: number) => ({
  left: x - 0.03,
  top: 0.44,
  right: x + 0.03,
  bottom: 0.52,
});
const X = { origin: 0.175, middle: 0.475, destination: 0.775 };
let t = 1000;
/** Like the host: report exactly the current watch set, unseen ones as explicit unknowns. */
function frame(
  session: ReturnType<typeof createSession>,
  objects: Record<string, number | null>,
  options: { watchKey?: string; exact?: boolean } = {},
) {
  t += 100;
  const watch = watchSet(session.procedure, session.result);
  const ids = options.exact ? Object.keys(objects) : watch.required;
  return feedTrackingFrame(session, {
    timestampMs: t,
    frameId: `f${t}`,
    calibrationValid: true,
    partialIdentities: [],
    watchKey: options.watchKey ?? watch.key,
    detections: ids.map((objectId) => {
      const x = objects[objectId] ?? null;
      return {
        objectId,
        quality: x === null ? ("ambiguous" as const) : ("observed" as const),
        box: x === null ? null : box(x),
        score: x === null ? null : 0.97,
      };
    }),
  });
}
const hold = (
  session: ReturnType<typeof createSession>,
  objects: Record<string, number | null>,
  n = 6,
) => {
  for (let i = 0; i < n; i++) frame(session, objects);
};
const status = (session: ReturnType<typeof createSession>, id: string) =>
  session.result.steps.find((s) => s.stepId === id)!.status;

it("builds role-aware watch sets: irrelevant excluded, later object dormant until its step, key changes (scenarios 1, 4, 5)", () => {
  const { draft } = laterObjectLesson();
  const procedure = approved(draft.procedure);
  const initial = watchSet(procedure, {
    steps: procedure.steps.map((s) => ({ stepId: s.id, status: "pending" })),
  } as never);
  expect(initial).toMatchObject({
    required: ["component-1"],
    optional: [],
    dormant: ["component-2"],
  });
  const later = watchSet(procedure, {
    steps: procedure.steps.map((s, i) => ({
      stepId: s.id,
      status: i === 0 ? "passed" : "pending",
    })),
  } as never);
  expect(later.required).toEqual(["component-1", "component-2"]); // first object still watched for persistence
  expect(later.key).not.toBe(initial.key);
  expect(JSON.stringify([initial, later])).not.toContain("component-3");
});
it("a hidden later object neither blocks startup nor counts as missing; it is rejected if reported before activation (scenario 4)", () => {
  const { draft } = laterObjectLesson();
  const session = createSession(approved(draft.procedure), bindings);
  hold(session, { "component-1": X.origin });
  expect(session.armed).toBe(true);
  expect(() =>
    frame(
      session,
      { "component-1": X.origin, "component-2": X.middle },
      { exact: true },
    ),
  ).toThrow("every approved identity in the active watch set");
  hold(session, { "component-1": X.middle });
  expect(status(session, "transfer")).toBe("passed");
  const passedAt = session.result.events.findIndex(
    (e) => e.stepId === "transfer" && e.status === "passed",
  );
  // While dormant, the hidden phone produced no evidence event at all.
  expect(
    session.result.events
      .slice(0, passedAt)
      .some((e) => e.stepId === "transfer-again"),
  ).toBe(false);
});
it("after activation the later object needs an observed start before its transfer, and reappearing at the target after an unseen interval verifies nothing (scenarios 5, 12)", () => {
  const { draft } = laterObjectLesson();
  const session = createSession(approved(draft.procedure), bindings);
  hold(session, { "component-1": X.origin });
  hold(session, { "component-1": X.middle });
  expect(watchSet(session.procedure, session.result).required).toContain(
    "component-2",
  );
  // First seen already at the target: presence is not a transfer.
  hold(session, { "component-1": X.middle, "component-2": X.destination });
  expect(status(session, "transfer-again")).not.toBe("passed");
  // Seen at its start, then unseen, then at the target: still not a transfer.
  hold(session, { "component-1": X.middle, "component-2": X.middle });
  hold(session, { "component-1": X.middle, "component-2": null }, 4);
  hold(session, { "component-1": X.middle, "component-2": X.destination });
  expect(status(session, "transfer-again")).not.toBe("passed");
  // A fresh, continuously observed transfer from its start does verify.
  hold(session, { "component-1": X.middle, "component-2": X.middle });
  hold(session, { "component-1": X.middle, "component-2": X.destination });
  expect(status(session, "transfer-again")).toBe("passed");
});
it("repeated occlusion and reacquisition never advance a step twice (scenario 13)", () => {
  const { draft } = laterObjectLesson();
  const session = createSession(approved(draft.procedure), bindings);
  hold(session, { "component-1": X.origin });
  hold(session, { "component-1": X.middle });
  for (let i = 0; i < 4; i++) {
    hold(session, { "component-1": null, "component-2": null }, 3);
    hold(session, { "component-1": X.middle, "component-2": X.middle }, 6);
  }
  const transitions = session.result.events.filter(
    (e) =>
      e.stepId === "transfer" &&
      e.status === "passed" &&
      e.decision !== "restoration",
  );
  expect(transitions).toHaveLength(1);
  expect(status(session, "transfer-again")).not.toBe("passed");
});
it("ignores a reply measured for an earlier watch-set revision (scenario 14)", () => {
  const { draft } = laterObjectLesson();
  const session = createSession(approved(draft.procedure), bindings);
  const before = session.events.length;
  const reply = frame(
    session,
    { "component-1": X.origin },
    { watchKey: "v3|0|stale|" },
  );
  expect(reply.stale).toBe(true);
  expect(session.events.length).toBe(before);
});
it("keeps identity lifecycle events in an append-only audit", () => {
  const { draft } = laterObjectLesson();
  const session = createSession(approved(draft.procedure), bindings);
  t += 100;
  feedTrackingFrame(session, {
    timestampMs: t,
    frameId: "audit",
    calibrationValid: true,
    partialIdentities: [],
    detections: [
      { objectId: "component-1", quality: "ambiguous", box: null, score: null },
    ],
    identityEvents: [
      { objectId: "component-1", status: "occluded", reason: "hand" },
    ],
  });
  expect(session.identityAudit).toEqual([
    {
      timestampMs: t,
      frameId: "audit",
      objectId: "component-1",
      status: "occluded",
      reason: "hand",
    },
  ]);
});
it("automatic setup excludes irrelevant objects and still requires every required one (scenario 1, Phase 2 gap)", () => {
  const { draft, context } = laterObjectLesson();
  const checks = suggestReviews(draft, context);
  const reviewed = approveDraft(
    draft,
    {
      reviewer: "Test",
      confirmed: true,
      goalConfirmed: true,
      steps: draft.procedure.steps.map((s) =>
        reviewStepInput(s.id, {
          ...checks[s.id],
          reviewed: true,
          conditionConfirmed: true,
        }),
      ),
    },
    context,
    1,
  );
  const plan = automaticSetupPlan(reviewed.procedure, reviewed.review, context);
  expect(plan.objects.map((o) => o.id)).toEqual(["component-1", "component-2"]);
  const setup = {
    sceneFrame: plan.sceneFrame,
    objects: plan.objects,
    frames: [
      ...new Set([plan.sceneFrame, ...plan.objects.map((o) => o.frame)]),
    ].map((frame) => ({ frame, image: "data:image/jpeg;base64,AAAA" })),
  };
  expect(automaticSetupIssue(reviewed.procedure, setup)).toBeNull();
  expect(
    automaticSetupIssue(reviewed.procedure, {
      ...setup,
      objects: setup.objects.slice(0, 1),
    }),
  ).toMatch(/does not match/);
  context.tracking[1].samples.forEach((s) => (s.confidence = 0.5));
  expect(() =>
    automaticSetupPlan(reviewed.procedure, reviewed.review, context),
  ).toThrow("reliable source");
});
