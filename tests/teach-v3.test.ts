import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ProcedureSpecSchema } from "../src/procedure/schema";
import {
  approveDraft,
  validateDraft,
  validateReviewEvidence,
  type TeachDraft,
} from "../src/teach/schema";
import { localExecutionDraft } from "../src/teach/local-execution";
import {
  reviewBlockers,
  suggestReviews,
} from "../src/teach/review-suggestions";
import { parseSparkDraft, sparkRequest } from "../src/server/teach/pipeline";
import { reviewStepInput } from "../src/teach/review-suggestions";
import { teachV3Fixture } from "./fixtures/teach-v3";

vi.mock("server-only", () => ({}));
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("Live network forbidden");
    }),
  ),
);
afterEach(() => vi.unstubAllGlobals());
const normalize = (draft: TeachDraft) =>
  localExecutionDraft(
    draft,
    "This narration must not overwrite the explicit goal",
  );

describe("V3 executable Teach contract", () => {
  it("roundtrips explicit intent without inventing goals or approving the draft", () => {
    const { draft, context } = teachV3Fixture(true);
    const normalized = validateDraft(normalize(draft), context);
    expect(normalized.procedure.execution).toEqual(draft.procedure.execution);
    expect(normalized.procedure.steps[0].measurement?.sourceFrames).toEqual({
      start: 4,
      change: 5,
      result: 6,
    });
    expect(normalized.procedure.steps[0].measurement?.releaseStepId).toBe(
      "transfer-again",
    );
    expect(draft.procedure.steps[0].measurement).toBeUndefined();
    expect(normalized.procedure.approval).toBeNull();
  });
  it.each([
    [
      "unknown mover",
      (d: TeachDraft) => {
        d.procedure.steps[0].condition.componentId = "component-4";
      },
    ],
    [
      "unknown required object",
      (d: TeachDraft) => {
        d.procedure.steps[0].execution!.requiredObjectIds.push("component-4");
      },
    ],
    [
      "missing mover dependency",
      (d: TeachDraft) => {
        d.procedure.steps[0].execution!.requiredObjectIds = [];
      },
    ],
    [
      "supporting semantic object",
      (d: TeachDraft) => {
        d.procedure.components[0].execution!.role = "supporting";
        d.procedure.components[0].execution!.firstRequiredAt = "never";
      },
    ],
    [
      "irrelevant semantic object",
      (d: TeachDraft) => {
        d.procedure.components[0].execution!.role = "irrelevant";
      },
    ],
    [
      "unknown activation",
      (d: TeachDraft) => {
        d.procedure.components[0].execution!.firstRequiredAt = {
          stepId: "missing",
        };
      },
    ],
    [
      "missing roles",
      (d: TeachDraft) => {
        delete d.procedure.components[0].execution;
      },
    ],
    [
      "missing window",
      (d: TeachDraft) => {
        delete d.procedure.steps[0].execution;
      },
    ],
    [
      "reversed window",
      (d: TeachDraft) => {
        d.procedure.steps[0].execution!.evidenceWindow.changeFrame = 0;
      },
    ],
    [
      "stationary mover",
      (d: TeachDraft) => {
        d.procedure.components[0].execution!.motion = "stationary";
      },
    ],
  ])("rejects %s", (_, mutate) => {
    const { draft } = teachV3Fixture();
    mutate(draft);
    expect(() =>
      ProcedureSpecSchema.parse(normalize(draft).procedure),
    ).toThrow();
  });
  it("rejects missing coverage, final conditions, dangling predicates and unsupported covered claims", () => {
    for (const mutate of [
      (f: ReturnType<typeof teachV3Fixture>) => {
        f.execution.requirements = [];
      },
      (f: ReturnType<typeof teachV3Fixture>) => {
        f.execution.finalConditions = [];
      },
      (f: ReturnType<typeof teachV3Fixture>) => {
        f.execution.requirements[0].goalPredicateIds = ["unknown"];
      },
      (f: ReturnType<typeof teachV3Fixture>) => {
        f.execution.requirements[0].capability = "unsupported";
      },
      (f: ReturnType<typeof teachV3Fixture>) => {
        f.execution.goalStepIds = ["missing"];
      },
      (f: ReturnType<typeof teachV3Fixture>) => {
        f.execution.requirements[0].stepIds = ["missing"];
      },
    ]) {
      const fixture = teachV3Fixture();
      mutate(fixture);
      expect(() =>
        ProcedureSpecSchema.parse(normalize(fixture.draft).procedure),
      ).toThrow();
    }
  });
  it("keeps unsupported required work and blocks it without shortening scope", () => {
    const { draft, execution, context } = teachV3Fixture();
    execution.requirements.push({
      id: "force",
      description: "Required contact force",
      capability: "unsupported",
      status: "unsupported",
      stepIds: [],
      goalPredicateIds: [],
      reason: "2D geometry cannot prove force",
    });
    const normalized = validateDraft(normalize(draft), context);
    expect(normalized.procedure.execution?.requirements).toHaveLength(2);
    expect(
      reviewBlockers(normalized, context, suggestReviews(normalized, context)),
    ).toContain("Unsupported required work: Required contact force");
    const source = readFileSync("src/app/teach/review.tsx", "utf8");
    expect(source).not.toContain("narrowToVerifiableScope");
    expect(source).not.toContain("autoNarrowed");
  });
  it("approves V3 only after full validation and never accepts an approval without its exact revision (Phase 2)", () => {
    const { draft, context } = teachV3Fixture();
    const normalized = normalize(draft),
      checks = suggestReviews(normalized, context);
    const approved = approveDraft(
      normalized,
      {
        reviewer: "Human",
        confirmed: true,
        goalConfirmed: true,
        steps: [
          reviewStepInput("transfer", {
            ...checks.transfer,
            reviewed: true,
            conditionConfirmed: true,
          }),
        ],
      },
      context,
      1000,
    );
    expect(approved.procedure.approval?.revision).toMatch(/^[0-9a-f]{64}$/);
    // The schema itself refuses a V3 approval that names no revision.
    expect(() =>
      ProcedureSpecSchema.parse({
        ...approved.procedure,
        approval: { reviewer: "Human", timestampMs: 1000 },
      }),
    ).toThrow("V3 approval must identify its exact executable revision.");
  });
  it("rejects invented, low-confidence, inconsistent, and motionless evidence", () => {
    for (const kind of ["invented", "low", "timestamp", "static"]) {
      const { draft, context } = teachV3Fixture();
      if (kind === "invented")
        draft.procedure.components[0].execution!.referenceFrames = [99];
      // Frame 5 is the change landmark, frame 6 the result (v3Frames).
      if (kind === "low") context.tracking[0].samples[5].confidence = 0.2;
      if (kind === "timestamp")
        context.tracking[0].samples[5].timestampMs = 499;
      if (kind === "static")
        context.tracking[0].samples[6].box = context.tracking[0].samples[4].box;
      expect(() => validateDraft(normalize(draft), context)).toThrow();
      expect(() => localExecutionDraft(draft, "Narration", context)).toThrow();
    }
  });
  it("requires source landmarks in the owning note and the same final scene", () => {
    const { draft, context, execution } = teachV3Fixture();
    draft.notes[0].supportingFrames = [4, 6];
    expect(() => validateDraft(normalize(draft), context)).toThrow(
      "own supporting frames",
    );
    draft.notes[0].supportingFrames = [4, 5, 6];
    // Frame 5 is mid-action, before the result frame 6.
    execution.finalConditions[0].evidenceFrames = [5];
    expect(() => validateDraft(normalize(draft), context)).toThrow(
      "shared initial/final",
    );
  });
  it("accepts a clearer initial scene before movement and final scene after the action result through the canonical parser", () => {
    const { draft, context, execution } = teachV3Fixture();
    // A clearer initial view before movement (frame 1 < start 4) and a
    // clearer final view after the result (frame 9 > result 6).
    execution.initialConditions[0].evidenceFrames = [1];
    execution.finalConditions[0].evidenceFrames = [9];
    const parsed = parseSparkDraft(
      { status: "completed", output_text: JSON.stringify(draft) },
      context,
      { goal: execution.goal },
    );
    expect(parsed.procedure.execution).toEqual(execution);
    expect(parsed.procedure.steps[0].measurement?.sourceFrames).toEqual({
      start: 4,
      change: 5,
      result: 6,
    });
    const checks = suggestReviews(parsed, context);
    expect(() =>
      validateReviewEvidence(
        parsed,
        [{ stepId: "transfer", ...checks.transfer }],
        context,
      ),
    ).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects final predicates from different moments even when each individually occurs after the action", () => {
    const { draft, execution } = teachV3Fixture();
    const { context } = teachV3Fixture();
    // Both after the result (6), but frame 9 vs frame 10: different moments.
    execution.finalConditions.push({
      ...structuredClone(execution.finalConditions[0]),
      id: "other-goal",
      evidenceFrames: [9],
    });
    execution.requirements[0].goalPredicateIds.push("other-goal");
    expect(() => validateDraft(normalize(draft), context)).toThrow(
      "share an observed frame",
    );
  });
  it("accepts multiple final predicates only when they share actual post-action evidence", () => {
    const { draft, context, execution } = teachV3Fixture();
    execution.finalConditions[0].evidenceFrames = [9];
    execution.finalConditions.push({
      ...structuredClone(execution.finalConditions[0]),
      id: "other-goal",
    });
    execution.requirements[0].goalPredicateIds.push("other-goal");
    expect(() => validateDraft(normalize(draft), context)).not.toThrow();
    context.tracking[0].samples[9].confidence = null;
    expect(() => validateDraft(normalize(draft), context)).toThrow(
      "Unsupported source evidence",
    );
  });
  it("rejects nonexistent common scene frames instead of inventing observations", () => {
    const { draft, context, execution } = teachV3Fixture();
    execution.finalConditions[0].evidenceFrames = [99];
    expect(() => validateDraft(normalize(draft), context)).toThrow(
      "Unsupported source evidence",
    );
  });
  it("keeps optional objects nonsemantic and supports an object first revealed at a later step", () => {
    const { draft, context, execution } = teachV3Fixture(true);
    const second = draft.procedure.steps[1];
    second.condition.componentId = "component-2";
    second.execution!.requiredObjectIds = ["component-2"];
    draft.procedure.components.push(
      {
        id: "component-2",
        description: "Later object",
        execution: {
          role: "required",
          motion: "movable",
          roleReason: "Second transfer",
          firstRequiredAt: { stepId: second.id },
          referenceFrames: [2, 4],
        },
      },
      {
        id: "component-3",
        description: "Optional context",
        execution: {
          role: "supporting",
          motion: "stationary",
          roleReason: "Helpful only",
          firstRequiredAt: "never",
          referenceFrames: [],
        },
      },
      {
        id: "component-4",
        description: "Unused tool",
        execution: {
          role: "irrelevant",
          motion: "movable",
          roleReason: "Not used by this lesson",
          firstRequiredAt: "never",
          referenceFrames: [],
        },
      },
    );
    for (const component of draft.procedure.components.slice(1))
      context.selections.push({
        ...structuredClone(context.selections[0]),
        id: component.id,
        description: component.description,
        frame: 2,
      });
    context.tracking.push({
      componentId: "component-2",
      missingFrames: 2,
      samples: structuredClone(context.tracking[0].samples.slice(2)),
    });
    execution.finalConditions[0].objectId = "component-2";
    const normalized = validateDraft(normalize(draft), context);
    expect(normalized.procedure.components).toHaveLength(4);
    expect(context.tracking[1].samples[0].frame).toBe(2);
    expect(execution.initialConditions).toHaveLength(1);
    execution.initialConditions[0].objectId = "component-2";
    expect(() => validateDraft(normalize(draft), context)).toThrow();
  });
  it("rejects hidden or physical predicates instead of treating them as geometric proof", () => {
    for (const kind of [
      "contact",
      "torque",
      "hidden_containment",
      "electrical_correctness",
    ]) {
      const { draft } = teachV3Fixture();
      const raw = JSON.parse(JSON.stringify(normalize(draft).procedure));
      raw.execution.finalConditions[0].kind = kind;
      expect(ProcedureSpecSchema.safeParse(raw).success).toBe(false);
    }
  });
  it("validates final-zone evidence against the reviewed region", () => {
    const { draft, context, execution } = teachV3Fixture();
    const normalized = normalize(draft),
      checks = suggestReviews(normalized, context);
    const review = [{ stepId: "transfer", ...checks.transfer }];
    expect(() =>
      validateReviewEvidence(normalized, review, context),
    ).not.toThrow();
    execution.finalConditions[0] = {
      ...execution.finalConditions[0],
      kind: "object_in_zone",
      zoneId: "origin",
    };
    expect(() =>
      validateReviewEvidence(normalize(draft), review, context),
      // The final-goal consistency check now rejects this earlier, with the
      // more specific reason; either way it can never pass.
    ).toThrow(/initial\/final source condition|Final goal names component-1 in "origin"/);
  });
  it("rejects unobserved projected separation at a common source frame", () => {
    const { draft, context, execution } = teachV3Fixture();
    draft.procedure.components.push({
      ...structuredClone(draft.procedure.components[0]),
      id: "component-2",
      description: "Destination reference",
    });
    context.selections.push({
      ...structuredClone(context.selections[0]),
      id: "component-2",
    });
    context.tracking.push({
      ...structuredClone(context.tracking[0]),
      componentId: "component-2",
    });
    execution.finalConditions[0] = {
      id: "goal-position",
      objectId: "component-1",
      kind: "projected_separation",
      otherObjectId: "component-2",
      minimumGap: 0.05,
      evidenceFrames: [10],
    };
    expect(() => validateDraft(normalize(draft), context)).toThrow(
      "projected-separation",
    );
  });
});

describe("step-owned review evidence", () => {
  it("preserves two actions sharing a boundary without stealing the later window", () => {
    const { draft, context } = teachV3Fixture(true);
    const checks = suggestReviews(normalize(draft), context);
    expect([
      checks.transfer.fromFrame,
      checks.transfer.changeFrame,
      checks.transfer.toFrame,
    ]).toEqual([4, 5, 6]);
    expect([
      checks["transfer-again"].fromFrame,
      checks["transfer-again"].changeFrame,
      checks["transfer-again"].toFrame,
    ]).toEqual([10, 11, 12]);
    expect(checks["transfer-again"].fromRegion).toEqual(
      checks.transfer.toRegion,
    );
    expect(checks["transfer-again"].evidenceStatus).toBe("supported");
  });
  it("keeps a continuous carry as one action", () => {
    const { draft, context } = teachV3Fixture();
    const normalized = normalize(draft);
    expect(normalized.procedure.steps).toHaveLength(1);
    expect(suggestReviews(normalized, context).transfer.evidenceStatus).toBe(
      "supported",
    );
  });
  it.each(["missing", "unordered", "outside-note", "uncertain"])(
    "returns explicit unsupported evidence for %s",
    (kind) => {
      const { draft, context } = teachV3Fixture();
      // Frame 5 is the change landmark of the 4-5-6 window.
      if (kind === "missing") context.tracking[0].samples.splice(5, 1);
      if (kind === "unordered")
        draft.procedure.steps[0].execution!.evidenceWindow.changeFrame = 0;
      if (kind === "outside-note") draft.notes[0].supportingFrames = [4, 6];
      if (kind === "uncertain")
        context.tracking[0].samples[5].confidence = null;
      const check = suggestReviews(draft, context).transfer;
      expect(check.evidenceStatus).toBe("unsupported");
      expect(check.fromRegion).toBeNull();
      expect(check.toRegion).toBeNull();
      expect(check.changeFrame).toBeUndefined();
    },
  );
});

describe("canonical compiler V3 wire boundary", () => {
  it("asks for explicit roles, windows, and goals through the existing adapter format", () => {
    const { context } = teachV3Fixture();
    const request = sparkRequest(context, { goal: "A complete transfer" });
    const schema = JSON.stringify(request.text.format.schema);
    for (const field of [
      "evidenceWindow",
      "supportedClaim",
      "firstRequiredAt",
      "finalConditions",
      "goalPredicateIds",
    ])
      expect(schema).toContain(field);
    expect(request.instructions).toContain("ONE action");
    expect(schema).not.toContain('"measurement"');
  });
  it("parses a mock V3 response without deriving goalStepIds or dropping unsupported work", () => {
    const { draft, context } = teachV3Fixture(true);
    const parsed = parseSparkDraft(
      { status: "completed", output_text: JSON.stringify(draft) },
      context,
      { goal: "Narration" },
    );
    expect(parsed.procedure.execution).toEqual(draft.procedure.execution);
    expect(parsed.procedure.steps[1].measurement?.sourceFrames).toEqual({
      start: 10,
      change: 11,
      result: 12,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects incomplete old-format local responses rather than inventing V3 intent", () => {
    const { draft, context } = teachV3Fixture();
    delete draft.procedure.execution;
    expect(() =>
      parseSparkDraft(
        { status: "completed", output_text: JSON.stringify(draft) },
        context,
        { goal: "Narration" },
      ),
    ).toThrow();
  });
});
