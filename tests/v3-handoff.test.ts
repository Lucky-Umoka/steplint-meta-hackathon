import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { teachV3Fixture } from "./fixtures/teach-v3";
import { localFixture } from "./fixtures/local-procedure";
import { parseSparkDraft } from "../src/server/teach/pipeline";
import {
  reviewStepInput,
  suggestReviews,
} from "../src/teach/review-suggestions";
import { automaticSetupPlan } from "../src/teach/automatic-setup";
import { approveDraft, type TeachContext } from "../src/teach/schema";
import { localExecutionDraft } from "../src/teach/local-execution";
import { loadApprovedLesson } from "../src/practice/load-approved-lesson";
import { PracticeLessonSchema } from "../src/practice/lesson";
import {
  listApprovedProcedures,
  saveApprovedProcedure,
} from "../src/teach/approved-storage";
import { ApprovedArtifactSchema } from "../src/teach/approved-artifact";
import { executableRevision, sha256Hex } from "../src/teach/revision";
import { nextRehearsal, type Rehearsal } from "../src/teach/rehearsal";

vi.mock("server-only", () => ({}));
const token = "phase-two-handoff-test-token-over-32-chars";

/** Minimal in-memory IndexedDB covering what approved-storage.ts uses. */
function memoryIndexedDb() {
  const stores = new Map<string, Map<string, unknown>>();
  const later = (fn: () => void) => setTimeout(fn, 0);
  const request = <T>(run: () => T) => {
    const r: { result?: T; onsuccess?: () => void; onerror?: () => void } = {};
    later(() => {
      r.result = run();
      r.onsuccess?.();
    });
    return r;
  };
  return {
    open() {
      const r: {
        result?: unknown;
        onupgradeneeded?: () => void;
        onsuccess?: () => void;
        onerror?: () => void;
      } = {};
      const db = {
        createObjectStore(name: string) {
          stores.set(name, new Map());
        },
        transaction(name: string) {
          const tx: { oncomplete?: () => void; onerror?: () => void; objectStore: () => unknown } = {
            objectStore: () => ({
              get: (key: string) => request(() => stores.get(name)!.get(key)),
              put: (value: { id: string }) => {
                stores.get(name)!.set(value.id, structuredClone(value));
                later(() => tx.oncomplete?.());
              },
              getAll: () => request(() => [...stores.get(name)!.values()]),
            }),
          };
          return tx;
        },
        close() {},
      };
      later(() => {
        r.result = db;
        if (!stores.size) r.onupgradeneeded?.();
        r.onsuccess?.();
      });
      return r;
    },
  };
}

let jpeg = "";
beforeEach(async () => {
  vi.stubEnv("TEACH_ACCESS_TOKEN", token);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("Live network forbidden");
    }),
  );
  vi.stubGlobal("indexedDB", memoryIndexedDb());
  const sharp = (await import("sharp")).default;
  jpeg =
    "data:image/jpeg;base64," +
    (
      await sharp({
        create: { width: 320, height: 240, channels: 3, background: "#88aa88" },
      })
        .jpeg()
        .toBuffer()
    ).toString("base64");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Steps 1-3: compile through the real parser, review, approve via the real handler. */
async function compileReviewApprove(options: {
  rehearsal?: (revision: string) => unknown;
  omitSetup?: boolean;
} = {}) {
  const { seal } = await import("../src/server/teach/security");
  const { approve } = await import("../src/server/teach/http");
  const { context, draft } = teachV3Fixture(true);
  const compiled = parseSparkDraft(
    { status: "completed", output_text: JSON.stringify(draft) },
    context,
    { goal: "Transfer" },
  );
  const checks = suggestReviews(compiled, context);
  const review = {
    reviewer: "Reviewer",
    confirmed: true,
    goalConfirmed: true,
    steps: compiled.procedure.steps.map((step) =>
      reviewStepInput(step.id, {
        ...checks[step.id],
        reviewed: true,
        conditionConfirmed: true,
      }),
    ),
  };
  // The browser computes the same plan before extracting frames.
  const local = approveDraft(compiled, review, context, 1);
  const plan = automaticSetupPlan(local.procedure, local.review, context);
  const setupFrames = [
    ...new Set([plan.sceneFrame, plan.goalFrame, ...plan.objects.map((o) => o.frame)]),
  ].map((frame) => ({ frame, image: jpeg }));
  const rehearsedRevision = executableRevision({
    procedure: local.procedure,
    zoneBindings: local.zoneBindings,
    automaticSetup: { sceneFrame: plan.sceneFrame, objects: plan.objects, frames: setupFrames },
  });
  const response = await approve(
    new Request("http://localhost/api/teach/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        token: seal(context, "review", "owner-cli"),
        draft: compiled,
        review,
        ...(options.omitSetup ? {} : { setupFrames }),
        ...(options.rehearsal ? { rehearsal: options.rehearsal(rehearsedRevision) } : {}),
      }),
    }),
  );
  return { response, compiled, context, rehearsedRevision };
}
const passed = (revision: string): Rehearsal => ({
  status: "passed",
  revision,
  atMs: 5,
  hadViolations: false,
  source: "browser_rehearsal",
});

it("sha256Hex matches Node's SHA-256 (revision identity correctness)", () => {
  for (const text of ["", "abc", "x".repeat(1000), "é🙂".repeat(77)])
    expect(sha256Hex(text)).toBe(createHash("sha256").update(text).digest("hex"));
});

it("preserves the complete V3 contract through approve → IndexedDB → reload → Practice loader (no receipt or creator token)", async () => {
  const { response, compiled, rehearsedRevision } = await compileReviewApprove({ rehearsal: passed });
  expect(response.status, await response.clone().text()).toBe(200);
  const approved = await response.json();
  // Step 4 needs no receipt or token: drop the receipt to prove it.
  delete approved.approvalReceipt;
  const raw = JSON.stringify(approved);
  await saveApprovedProcedure(raw);
  const [row] = await listApprovedProcedures();
  expect(row.raw).toBe(raw);
  const lesson = loadApprovedLesson(row.raw);
  const before = compiled.procedure;
  const after = lesson.procedure;
  // Nothing disappears or changes, apart from the approval stamp.
  expect({ ...after, approval: null }).toEqual(
    JSON.parse(JSON.stringify({ ...before, approval: null, steps: after.steps })),
  );
  expect(after.execution).toEqual(before.execution);
  expect(after.components.map((c) => c.execution)).toEqual(before.components.map((c) => c.execution));
  expect(after.steps.map((s) => s.execution)).toEqual(before.steps.map((s) => s.execution));
  expect(after.steps.map((s) => s.measurement?.sourceFrames)).toEqual(
    before.steps.map((s) => ({
      start: s.execution!.evidenceWindow.startFrame,
      change: s.execution!.evidenceWindow.changeFrame,
      result: s.execution!.evidenceWindow.resultFrame,
    })),
  );
  expect(lesson.automaticSetup?.objects.map((o) => o.id)).toEqual(["component-1"]);
  expect(after.approval?.revision).toBe(rehearsedRevision);
  expect(ApprovedArtifactSchema.parse(JSON.parse(row.raw)).rehearsal).toEqual(passed(rehearsedRevision));
});

it("rejects V3 approval without automatic setup, and rejects missing or inconsistent setup at load", async () => {
  const missing = await compileReviewApprove({ omitSetup: true });
  expect(missing.response.status).toBe(422);
  expect((await missing.response.json()).error).toContain("Automatic setup frames are required");
  const { response } = await compileReviewApprove();
  const approved = await response.json();
  expect(() => loadApprovedLesson(JSON.stringify({ ...approved, automaticSetup: undefined }))).toThrow(
    "Automatic setup is missing",
  );
  const inconsistent = structuredClone(approved);
  inconsistent.automaticSetup.objects[0].id = "component-9";
  expect(() => loadApprovedLesson(JSON.stringify(inconsistent))).toThrow(/does not match|stale/);
  // The rehearsal tab uses the same Practice lesson contract.
  expect(() =>
    PracticeLessonSchema.parse({ ...approved, automaticSetup: undefined, origin: "teach" }),
  ).toThrow("Automatic setup is missing");
});

it("rejects stale approval and stale rehearsal evidence after an executable edit", async () => {
  const { response } = await compileReviewApprove({ rehearsal: passed });
  const approved = await response.json();
  for (const edit of [
    (a: typeof approved) => (a.procedure.steps[0].description = "Edited after approval"),
    (a: typeof approved) => (a.procedure.components[0].execution.role = "supporting"),
    (a: typeof approved) => (a.procedure.execution.requirements[0].status = "outside_goal"),
    (a: typeof approved) => (a.zoneBindings[0].region.left = 0.01),
    (a: typeof approved) => (a.automaticSetup.objects[0].box.left = 0.01),
  ]) {
    const changed = structuredClone(approved);
    edit(changed);
    expect(() => loadApprovedLesson(JSON.stringify(changed))).toThrow();
  }
  const reused = structuredClone(approved);
  reused.rehearsal.revision = "0".repeat(64);
  expect(() => loadApprovedLesson(JSON.stringify(reused))).toThrow("different revision");
});

it("never presents a mismatched, missing or failed rehearsal as passed", async () => {
  const other = await compileReviewApprove({ rehearsal: () => passed("f".repeat(64)) });
  expect((await other.response.json()).rehearsal).toEqual({ status: "not_run" });
  const none = await compileReviewApprove();
  expect((await none.response.json()).rehearsal).toEqual({ status: "not_run" });
  const failed = await compileReviewApprove({
    rehearsal: (revision) => ({ ...passed(revision), status: "failed", hadViolations: true }),
  });
  expect((await failed.response.json()).rehearsal.status).toBe("failed");
  // Only verifier terminal status records anything; recovery keeps the violation.
  const r = "a".repeat(64);
  expect(nextRehearsal(null, "pending", r, 1)).toBeNull();
  expect(nextRehearsal(null, "in_progress", r, 1)).toBeNull();
  expect(nextRehearsal(null, "needs_verification", r, 1)).toBeNull();
  const fail = nextRehearsal(null, "failed", r, 1)!;
  expect(fail).toMatchObject({ status: "failed", hadViolations: true });
  expect(nextRehearsal(fail, "passed", r, 2)).toMatchObject({ status: "passed", hadViolations: true });
  expect(nextRehearsal(fail, "passed", "b".repeat(64), 2)).toMatchObject({ hadViolations: false });
});

it("keeps V2 approvals readable without silently upgrading them or adding V3 fields", () => {
  const { context, draft } = localFixture();
  const local = localExecutionDraft(draft, "Object at destination");
  local.procedure.execution!.requirements[0] = {
    description: "Visible transfer",
    status: "covered",
    stepIds: ["transfer"],
    reason: "Human review fixture",
  };
  const checks = suggestReviews(local, context as TeachContext);
  const v2 = approveDraft(
    local,
    {
      reviewer: "Reviewer",
      confirmed: true,
      goalConfirmed: true,
      steps: [reviewStepInput("transfer", { ...checks.transfer, reviewed: true, conditionConfirmed: true })],
    },
    context,
    1,
  );
  const lesson = loadApprovedLesson(JSON.stringify(v2));
  expect(lesson.procedure.execution?.schemaVersion).toBe(2);
  expect(lesson.procedure.approval?.revision).toBeUndefined();
  expect(() =>
    loadApprovedLesson(JSON.stringify({ ...v2, rehearsal: { status: "not_run" } })),
  ).toThrow("Older (V2)");
});

it("the real approve handler rejects V3 drafts that bypass validation (tampered evidence, unsupported work, missing review)", async () => {
  const { seal } = await import("../src/server/teach/security");
  const { approve } = await import("../src/server/teach/http");
  const { context, draft } = teachV3Fixture(true);
  const compiled = parseSparkDraft(
    { status: "completed", output_text: JSON.stringify(draft) },
    context,
    { goal: "Transfer" },
  );
  const checks = suggestReviews(compiled, context);
  const review = {
    reviewer: "Reviewer",
    confirmed: true,
    goalConfirmed: true,
    steps: compiled.procedure.steps.map((step) =>
      reviewStepInput(step.id, { ...checks[step.id], reviewed: true, conditionConfirmed: true }),
    ),
  };
  const post = (body: Record<string, unknown>) =>
    approve(
      new Request("http://localhost/api/teach/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ token: seal(context, "review", "owner-cli"), review, setupFrames: [{ frame: 0, image: jpeg }], ...body }),
      }),
    );
  const tampered = structuredClone(compiled);
  tampered.procedure.components[0].execution!.referenceFrames = [99];
  const unsupported = structuredClone(compiled);
  unsupported.procedure.execution!.requirements.push({
    id: "hidden-work",
    description: "Unmeasurable required work",
    status: "unsupported",
    capability: "unsupported",
    stepIds: [],
    goalPredicateIds: [],
    reason: "Not visible",
  });
  const preApproved = structuredClone(compiled);
  preApproved.procedure.approval = { reviewer: "Self", timestampMs: 1, revision: "a".repeat(64) };
  for (const [label, body] of [
    ["tampered source evidence", { draft: tampered }],
    ["unsupported required work", { draft: unsupported }],
    ["client-supplied approval", { draft: preApproved }],
    ["unconfirmed goal", { draft: compiled, review: { ...review, goalConfirmed: false } }],
  ] as const) {
    const response = await post(body);
    expect(response.status, label).toBeGreaterThanOrEqual(400);
    expect(await response.json(), label).not.toHaveProperty("procedure");
  }
});
