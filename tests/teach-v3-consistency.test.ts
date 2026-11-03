import { expect, it, vi } from "vitest";
import {
  draftWithOneCorrection,
  parseSparkDraft,
  sparkRequest,
} from "../src/server/teach/pipeline";
import { validateDraft } from "../src/teach/schema";
import { deriveV3Relevance } from "../src/teach/v3-relevance";
import { localExecutionDraft } from "../src/teach/local-execution";
import { SparkError } from "../src/server/meta/spark";
import { teachV3Fixture } from "./fixtures/teach-v3";

vi.mock("server-only", () => ({}));
const options = { goal: "Transfer" };
const parse = (draft: unknown, context = teachV3Fixture().context) =>
  parseSparkDraft(
    { status: "completed", output_text: JSON.stringify(draft) },
    context,
    options,
  );

it("derives required role and activation from explicit references (owner Teach step-4 failure)", () => {
  const { context, draft } = teachV3Fixture();
  // The live draft called a measured object supporting and gave it a later
  // activation while an initial predicate measured it.
  draft.procedure.components[0].execution = {
    ...draft.procedure.components[0].execution!,
    role: "supporting",
    firstRequiredAt: { stepId: "transfer" },
  };
  // The rules themselves are unchanged: without derivation this is rejected.
  expect(() =>
    validateDraft(localExecutionDraft(draft, "Transfer", context), context),
  ).toThrow(/must not gate activation|known required objects/);
  const parsed = parse(draft, context);
  const object = parsed.procedure.components[0].execution!;
  expect(object.role).toBe("required");
  expect(object.firstRequiredAt).toBe("initial");
  expect(object.roleReason).toMatch(
    /^Compiler-derived: role required \(model said supporting\).*activation initial \(model said transfer\)/,
  );
});
it("downgrades an unreferenced 'required' object to non-gating supporting and never invents steps", () => {
  const { draft } = teachV3Fixture();
  draft.procedure.components.push({
    id: "component-2",
    description: "Unused tool",
    execution: {
      role: "required",
      roleReason: "Tool for unsupported later work",
      motion: "stationary",
      firstRequiredAt: { stepId: "transfer" },
      referenceFrames: [0],
    },
  });
  const derived = deriveV3Relevance(draft);
  expect(derived.procedure.components[1].execution).toMatchObject({
    role: "supporting",
    firstRequiredAt: "never",
    referenceFrames: [0],
  });
  expect(derived.procedure.steps).toEqual(draft.procedure.steps);
  expect(derived.procedure.execution).toEqual(draft.procedure.execution);
  // Consistent objects are left untouched, without a reviewer note.
  expect(derived.procedure.components[0]).toEqual(draft.procedure.components[0]);
});
it("leaves irrelevant/supporting choices for unreferenced objects to the model", () => {
  const { draft } = teachV3Fixture();
  draft.procedure.components.push({
    id: "component-2",
    description: "Background",
    execution: {
      role: "irrelevant",
      roleReason: "Background",
      motion: "stationary",
      firstRequiredAt: "never",
      referenceFrames: [],
    },
  });
  expect(deriveV3Relevance(draft).procedure.components[1]).toEqual(
    draft.procedure.components[1],
  );
});
it("does not repair intent links: a covered requirement without a final predicate stays rejected", () => {
  const { context, draft, execution } = teachV3Fixture();
  execution.requirements[0].goalPredicateIds = [];
  expect(() => parse(draft, context)).toThrow(
    "Covered claims require a supported visual capability and final predicate.",
  );
});

type Call = Parameters<typeof draftWithOneCorrection>[2];
const run = (responses: unknown[], context = teachV3Fixture().context) => {
  const calls: Parameters<Call>[0][] = [];
  const stages: string[] = [];
  const call: Call = async (request) => {
    calls.push(request);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return {
      data: next,
      diagnostic: {
        provider: "baseten",
        modelId: "test",
        outputTokens: null,
        visualInput: "none",
      },
    };
  };
  return {
    calls,
    stages,
    result: draftWithOneCorrection(
      context,
      { goal: "Transfer", videoBase64: undefined },
      call,
      (s) => stages.push(s),
      () => {},
    ),
  };
};
it("accepts a valid first draft with exactly one request", async () => {
  const { draft } = teachV3Fixture();
  const { calls, result } = run([draft]);
  expect((await result).corrected).toBe(false);
  expect(calls).toHaveLength(1);
});
it("sends the exact validator issues back once and accepts a corrected draft", async () => {
  const { draft } = teachV3Fixture();
  const { draft: broken, execution } = teachV3Fixture();
  execution.requirements[0].goalPredicateIds = [];
  const { calls, stages, result } = run([broken, draft]);
  const outcome = await result;
  expect(outcome.corrected).toBe(true);
  expect(calls).toHaveLength(2);
  const feedback = JSON.parse(calls[1].text);
  expect(feedback.validationIssues).toContain(
    "Covered claims require a supported visual capability and final predicate.",
  );
  expect(feedback.previousDraft).toEqual(broken);
  expect(calls[1].videoBase64).toBeUndefined();
  expect(calls[1].instructions).toContain("CORRECTION PASS");
  expect(stages).toEqual([
    "Spark request",
    "Spark draft validation",
    "Spark correction request",
    "Spark draft validation after one correction",
  ]);
});
it("never makes a third request and reports both rejections", async () => {
  const { draft } = teachV3Fixture();
  const { draft: broken, execution } = teachV3Fixture();
  execution.requirements[0].goalPredicateIds = [];
  const { calls, result } = run([broken, broken, draft]);
  await expect(result).rejects.toThrow(/First draft was rejected with/);
  expect(calls).toHaveLength(2);
});
it("does not correct transport or truncation failures", async () => {
  const { calls, result } = run([
    new SparkError("truncated_output", "Spark output exhausted its token budget."),
  ]);
  await expect(result).rejects.toThrow("token budget");
  expect(calls).toHaveLength(1);
});
it("does not turn a source-evidence rejection into an accepted draft without a valid correction", async () => {
  const { draft } = teachV3Fixture();
  const bad = structuredClone(draft);
  bad.procedure.components[0].execution!.referenceFrames = [99];
  const { calls, result } = run([bad, bad]);
  await expect(result).rejects.toThrow();
  expect(calls).toHaveLength(2);
});

it("uses review-evidence problems for the one correction, then returns the best valid draft to review instead of failing", async () => {
  const conflicted = () => {
    const fixture = teachV3Fixture(true);
    fixture.draft.procedure.steps[1].condition.toZone = "origin";
    fixture.execution.finalConditions[0] = { ...fixture.execution.finalConditions[0], kind: "object_in_zone", zoneId: "origin" };
    return fixture;
  };
  const { context, draft } = conflicted();
  // Correction still conflicted: the first valid draft reaches review, flagged.
  const still = run([draft, conflicted().draft], context);
  const kept = await still.result;
  expect(still.calls).toHaveLength(2);
  expect(JSON.parse(still.calls[1].text).validationIssues).toContain('Zone "origin"');
  expect(kept.corrected).toBe(false);
  expect(kept.reviewIssue).toMatch(/Zone "origin".*the one correction still had/);
  // Correction fixed it: the corrected draft is used.
  const fixed = run([conflicted().draft, teachV3Fixture(true).draft], context);
  const outcome = await fixed.result;
  expect(outcome.corrected).toBe(true);
  expect(outcome.reviewIssue).toBeNull();
  // A rejected correction never discards a valid first draft.
  const rejected = run([conflicted().draft, { not: "a draft" }], context);
  expect((await rejected.result).reviewIssue).toMatch(/the one correction was rejected/);
});

it("reproduces the owner's 'Final goal conditions must remain maintained' failure with an actionable message", () => {
  const { context, draft, execution } = teachV3Fixture(true);
  // Both actions of the same object listed as goal steps: the first is moved
  // again by the second, so its result cannot hold at the end.
  execution.goalStepIds = ["transfer", "transfer-again"];
  expect(() => parse(draft, context)).toThrow(
    'Final goal conditions must remain maintained: goal step "transfer" moves component-1, but later step "transfer-again" moves it again, so its result cannot hold at the end. Only an object\'s last action can be a goal step; remove "transfer" from goalStepIds and keep it in its requirement.',
  );
  // The rule is unchanged: the object's last action alone is a valid goal step.
  execution.goalStepIds = ["transfer-again"];
  expect(parse(draft, context).procedure.execution!.goalStepIds).toEqual(["transfer-again"]);
});
it("lets the one correction request fix an intermediate goal step from the named reason", async () => {
  const broken = teachV3Fixture(true);
  broken.execution.goalStepIds = ["transfer", "transfer-again"];
  const fixed = teachV3Fixture(true);
  const { calls, result } = run([broken.draft, fixed.draft], broken.context);
  const outcome = await result;
  expect(calls).toHaveLength(2);
  expect(JSON.parse(calls[1].text).validationIssues).toContain(
    'remove "transfer" from goalStepIds',
  );
  expect(outcome.corrected).toBe(true);
  expect(outcome.draft.procedure.execution!.goalStepIds).toEqual(["transfer-again"]);
});
it("tells the compiler that only an object's last action may be a goal step", () => {
  const { context } = teachV3Fixture(true);
  expect(sparkRequest(context, { goal: "Transfer" }).instructions).toContain(
    "for each object only its LAST action may be a goal step",
  );
});
