import { expect, it, vi } from "vitest";
import { teachV3Fixture } from "./fixtures/teach-v3";
import { buildRepairedWire, RepairPlanSchema } from "../src/server/teach/repair";
import { parseSparkDraft } from "../src/server/teach/pipeline";
import { reviewEvidenceIssue } from "../src/teach/review-suggestions";
import { suggestReviews, reviewStepInput } from "../src/teach/review-suggestions";
import { approveDraft } from "../src/teach/schema";

vi.mock("server-only", () => ({}));

const plan = (extra: Partial<ReturnType<typeof RepairPlanSchema.parse>> = {}) =>
  RepairPlanSchema.parse({
    title: "Move the object twice",
    goal: "The object ends at its final place",
    steps: [
      { objectId: "component-1", window: 0, instruction: "Move the object to the middle" },
      { objectId: "component-1", window: 1, instruction: "Move the object to its final place" },
    ],
    unsupported: [],
    ...extra,
  });
function approveAll(context: ReturnType<typeof teachV3Fixture>["context"], draft: ReturnType<typeof parseSparkDraft>) {
  const checks = suggestReviews(draft, context);
  return approveDraft(draft, { reviewer: "T", confirmed: true, goalConfirmed: true, steps: draft.procedure.steps.map((s) => reviewStepInput(s.id, { ...checks[s.id], reviewed: true, conditionConfirmed: true })) }, context, 1000);
}
it("a Felicity plan (window indexes only) builds a draft that passes every existing validator and approval", () => {
  const { context } = teachV3Fixture(true);
  for (const video of [false, true]) {
    const wire = buildRepairedWire(context, plan(), video);
    const draft = parseSparkDraft({ status: "completed", output_text: JSON.stringify(wire) }, context, { goal: "Move it", ...(video ? { videoBase64: "data:video/mp4;base64,AAAA" } : {}) });
    expect(draft.procedure.steps.map((s) => s.execution!.evidenceWindow)).toEqual([
      { startFrame: 4, changeFrame: 5, resultFrame: 6 },
      { startFrame: 10, changeFrame: 11, resultFrame: 12 },
    ]);
    expect(reviewEvidenceIssue(draft, context)).toBeNull();
    const approved = approveAll(context, draft);
    expect(approved.procedure.execution?.schemaVersion).toBe(3);
  }
});
it("steps are put in time order and a window cannot be invented, reused or overlapped", () => {
  const { context } = teachV3Fixture(true);
  const reversed = plan({ steps: [...plan().steps].reverse() });
  expect(buildRepairedWire(context, reversed, false).procedure.steps[0].execution.evidenceWindow.startFrame).toBe(4);
  expect(() => buildRepairedWire(context, plan({ steps: [{ objectId: "component-1", window: 7, instruction: "x" }] }), false)).toThrow(/no measured window/);
  expect(() => buildRepairedWire(context, plan({ steps: [{ objectId: "component-9", window: 0, instruction: "x" }] }), false)).toThrow(/no measured window/);
  expect(() => buildRepairedWire(context, plan({ steps: [plan().steps[0], plan().steps[0]] }), false)).toThrow(/twice/);
});
it("narrated work without a measured window stays unsupported (never invented)", () => {
  const { context } = teachV3Fixture(true);
  const wire = buildRepairedWire(context, plan({ unsupported: ["Wipe the table"] }), false);
  const draft = parseSparkDraft({ status: "completed", output_text: JSON.stringify(wire) }, context, { goal: "Move it" });
  const req = draft.procedure.execution!.requirements.find((r) => r.description === "Wipe the table");
  expect(req?.status).toBe("unsupported");
  expect(req?.stepIds).toEqual([]);
});

it("run-20 root cause: when drafting fails, Felicity's ONE Baseten repair call yields an approvable lesson", async () => {
  const { requestRepairPlan } = await import("../src/server/teach/repair");
  const { applyRepairPlan } = await import("../src/server/teach/pipeline");
  const { context } = teachV3Fixture(true);
  vi.stubEnv("BASETEN_API_KEY", "mock-baseten-key");
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === "data:,") return new Response("");
    const req = new Request(url, init);
    calls.push(req.url);
    const body = await req.json() as { model: string };
    expect(body.model).toBe("meta-models/muse-spark-open-1026");
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(plan()) } }] });
  }));
  const repaired = await requestRepairPlan(context, "Spark returned invalid JSON.", null, undefined, new AbortController().signal);
  expect(calls).toEqual(["https://inference.baseten.co/v1/chat/completions"]);
  const { draft, remaining } = applyRepairPlan(context, repaired, { goal: "Move it" });
  expect(remaining).toBeNull();
  expect(approveAll(context, draft).procedure.steps).toHaveLength(2);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("a plan the validators reject is never applied", async () => {
  const { applyRepairPlan } = await import("../src/server/teach/pipeline");
  const { context } = teachV3Fixture(true);
  expect(() => applyRepairPlan(context, plan({ steps: [{ objectId: "component-1", window: 5, instruction: "x" }] }), { goal: "Move it" })).toThrow();
});
