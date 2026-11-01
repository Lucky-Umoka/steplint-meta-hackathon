import { expect, it, vi } from "vitest";
import { localFixture } from "./fixtures/local-procedure";
import { localExecutionDraft } from "../src/teach/local-execution";
import { approveDraft } from "../src/teach/schema";
import { suggestReviews } from "../src/teach/review-suggestions";
import { sparkRequest } from "../src/server/teach/pipeline";
vi.mock("server-only", () => ({}));
it("keeps local execution fields out of the strict model wire format", () => {
  const { context } = localFixture();
  const wire = JSON.stringify(sparkRequest(context).text.format.schema);
  expect(wire).not.toContain('"measurement"');
  expect(wire).not.toContain('"execution"');
});
it("requires human coverage and distinct source start/change/result before V2 approval", () => {
  const { draft, context } = localFixture();
  const local = localExecutionDraft(draft, "Object at its destination");
  const checks = suggestReviews(local, context);
  const review = {
    reviewer: "Synthetic test human",
    confirmed: true,
    goalConfirmed: true,
    steps: local.procedure.steps.map((s) => ({
      ...checks[s.id],
      stepId: s.id,
      reviewed: true,
      conditionConfirmed: true,
    })),
  };
  expect(() => approveDraft(local, review, context, 1000)).toThrow(
    "Unsupported",
  );
  local.procedure.execution!.requirements[0] = {
    description: "Object transfer",
    status: "covered",
    stepIds: ["transfer"],
    reason: "Explicit synthetic human review",
  };
  const approved = approveDraft(local, review, context, 1000);
  expect(approved.procedure.steps[0].measurement?.sourceFrames).toEqual({
    start: 0,
    change: 1,
    result: 2,
  });
  expect(() =>
    approveDraft(
      local,
      { ...review, steps: [{ ...review.steps[0], changeFrame: 0 }] },
      context,
      1000,
    ),
  ).toThrow("change moment");
  expect(draft.procedure.execution).toBeUndefined();
});
it("approves V2 through real server handlers and verifies its unchanged receipt without model calls", async () => {
  const token = "local-contract-test-token-over-32-characters";
  vi.stubEnv("TEACH_ACCESS_TOKEN", token);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("Live network forbidden");
    }),
  );
  try {
    const { seal } = await import("../src/server/teach/security");
    const { approve } = await import("../src/server/teach/http");
    const { POST } = await import("../src/app/api/teach/practice-lesson/route");
    const { draft, context } = localFixture();
    const local = localExecutionDraft(draft, "Object at destination");
    local.procedure.execution!.requirements[0] = {
      description: "Visible transfer",
      status: "covered",
      stepIds: ["transfer"],
      reason: "Synthetic explicit human review",
    };
    const checks = suggestReviews(local, context);
    const review = {
      reviewer: "Test reviewer",
      confirmed: true,
      goalConfirmed: true,
      steps: [
        {
          stepId: "transfer",
          ...checks.transfer,
          reviewed: true,
          conditionConfirmed: true,
        },
      ],
    };
    const headers = {
      "Content-Type": "application/json",
      authorization: `Bearer ${token}`,
    };
    const response = await approve(
      new Request("http://localhost/api/teach/approve", {
        method: "POST",
        headers,
        body: JSON.stringify({
          token: seal(context, "review", "owner-cli"),
          draft: local,
          review,
        }),
      }),
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const raw = await response.text();
    const loaded = await POST(
      new Request("http://localhost/api/teach/practice-lesson", {
        method: "POST",
        headers,
        body: raw,
      }),
    );
    expect(loaded.status).toBe(200);
    expect((await loaded.json()).procedure.execution.schemaVersion).toBe(2);
    const tampered = JSON.parse(raw);
    tampered.procedure.execution.goal = "Changed after approval";
    expect(
      (
        await POST(
          new Request("http://localhost/api/teach/practice-lesson", {
            method: "POST",
            headers,
            body: JSON.stringify(tampered),
          }),
        )
      ).status,
    ).toBe(422);
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});
it("local compiler accepts repeated-object transfer chains and retains unsupported goal coverage", async () => {
  const { parseSparkDraft } = await import("../src/server/teach/pipeline");
  const { context, draft } = localFixture();
  const second = structuredClone(draft.procedure.steps[0]);
  second.id = "return";
  second.prerequisites = ["transfer"];
  second.condition = {
    ...second.condition,
    fromZone: "destination",
    toZone: "origin",
  };
  draft.procedure.steps.push(second);
  draft.notes.push({ ...structuredClone(draft.notes[0]), stepId: "return" });
  const coverage = [
    {
      description: "Visible return",
      status: "covered",
      stepIds: ["return"],
      reason: "Observed position change",
    },
    {
      description: "Hidden contact force",
      status: "unsupported",
      stepIds: [],
      reason: "No force sensor or approved visual measurement",
    },
  ];
  const parsed = parseSparkDraft(
    {
      status: "completed",
      output_text: JSON.stringify({ ...draft, coverage }),
    },
    context,
    { goal: "Transfer and return with correct force" },
  );
  expect(parsed.procedure.steps).toHaveLength(2);
  expect(parsed.procedure.steps[0].measurement?.releaseStepId).toBe("return");
  expect(parsed.procedure.execution?.requirements[1].status).toBe(
    "unsupported",
  );
  expect(() =>
    parseSparkDraft(
      {
        status: "completed",
        output_text: JSON.stringify({ ...draft, coverage }),
      },
      context,
    ),
  ).toThrow();
});
it("reviews the visible base rather than silently substituting the object's centre for placement", () => {
  const { context, draft } = localFixture();
  const local = localExecutionDraft(draft, "Visible base in destination");
  local.procedure.steps[0].measurement!.point = "bottom_center";
  local.procedure.execution!.requirements[0] = {
    description: "Base placement",
    status: "covered",
    stepIds: ["transfer"],
    reason: "Synthetic explicit review",
  };
  const check = suggestReviews(local, context).transfer;
  expect(check.toRegion!.top).toBeGreaterThan(0.6);
  expect(
    approveDraft(
      local,
      {
        reviewer: "Test",
        confirmed: true,
        goalConfirmed: true,
        steps: [
          {
            ...check,
            stepId: "transfer",
            reviewed: true,
            conditionConfirmed: true,
          },
        ],
      },
      context,
      1000,
    ).procedure.steps[0].measurement?.point,
  ).toBe("bottom_center");
});
