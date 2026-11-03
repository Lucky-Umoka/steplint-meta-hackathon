import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ExecutionV3 } from "../src/procedure/execution-v3";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { sparkStructured } from "../src/server/meta/spark";
import {
  bindTeachVideo,
  decodeTeachVideo,
} from "../src/server/teach/video-evidence";
import { parseSparkDraft, sparkRequest } from "../src/server/teach/pipeline";
import * as pipeline from "../src/server/teach/pipeline";
import { compile } from "../src/server/teach/http";
import { seal } from "../src/server/teach/security";
import { validateDraft } from "../src/teach/schema";
import { localExecutionDraft } from "../src/teach/local-execution";
import { mediaBudget } from "../src/media/limits";
import { teachV3Fixture, v3Frames } from "./fixtures/teach-v3";

vi.mock("server-only", () => ({}));
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("Live network forbidden");
    }),
  ),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function clip() {
  const bytes = await readFile(
    new URL("./fixtures/teach-preview.mp4", import.meta.url),
  );
  return {
    bytes,
    url: `data:video/mp4;base64,${bytes.toString("base64")}`,
    videoSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
function visualDraft() {
  const fixture = teachV3Fixture(true);
  fixture.draft.videoReview = {
    actions: fixture.draft.procedure.steps.map((step, index) => ({
      id: `action-${index + 1}`,
      description: step.description,
      objectIds: ["component-1"],
      requirementIds: ["requirement-1"],
      stepIds: [step.id],
      evidenceWindow: step.execution!.evidenceWindow,
      visualSupport: "visible",
      coverage: "represented",
      reason: "Mock visible transfer between two source views",
    })),
    goal: {
      description: fixture.execution.goal,
      requirementIds: ["requirement-1"],
      // The fixture's final scene frame (v3Frames(true).last).
      evidenceFrames: [v3Frames(true).last],
      limitations: ["Synthetic audit; not a live perception result"],
    },
  };
  return fixture;
}
it("sends actual bounded video bytes to Baseten Chat Completions in one request without Meta file references", async () => {
  const { url } = await clip();
  vi.stubEnv("SPARK_PROVIDER", "baseten");
  vi.stubEnv("BASETEN_API_KEY", "fake-key");
  const transport = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "data:,") return new Response("");
      const request = new Request(input, init),
        body = await request.json();
      expect(request.url).toBe(
        "https://inference.baseten.co/v1/chat/completions",
      );
      expect(body.model).toBe("meta-models/muse-spark-open-1026");
      expect(
        body.messages[1].content.find(
          (part: { type: string }) => part.type === "video_url",
        ),
      ).toEqual({ type: "video_url", video_url: { url } });
      expect(JSON.stringify(body)).not.toContain("file-meta-only");
      expect(body.response_format).toBeUndefined();
      return Response.json({
        choices: [
          { finish_reason: "stop", message: { content: '{"ok":true}' } },
        ],
      });
    },
  );
  vi.stubGlobal("fetch", transport);
  const { z } = await import("zod");
  const result = await sparkStructured({
    instructions: "Watch actions",
    text: "Narration",
    schema: z.object({ ok: z.boolean() }),
    name: "Video",
    maxTokens: 128,
    videoBase64: url,
  });
  expect(result.diagnostic.visualInput).toBe("video");
  expect(
    transport.mock.calls.filter(([url]) => String(url) !== "data:,"),
  ).toHaveLength(1);
});
it("binds video to the reviewed upload and rejects substitution, legacy references and malformed media before network", async () => {
  const { url, bytes, videoSha256 } = await clip();
  const source = {
    lesson: { media: { info: { bytes: bytes.length } } },
    videoSha256,
  };
  expect(decodeTeachVideo(url).equals(bytes)).toBe(true);
  expect(() => bindTeachVideo(url, source)).not.toThrow();
  expect(() =>
    bindTeachVideo(url, { ...source, videoSha256: "0".repeat(64) }),
  ).toThrow("differs");
  expect(() => bindTeachVideo(url, { lesson: source.lesson })).toThrow(
    "predates",
  );
  for (const forged of [
    "https://example.com/video.mp4",
    "data:video/mp4;base64,AAAA",
    "data:video/mp4;base64,!!!!",
  ])
    expect(() => decodeTeachVideo(forged)).toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it("fits existing 60-second video budgets under each host's compile body cap with base64 overhead", () => {
  for (const profile of ["vercel", "standard"] as const) {
    const budget = mediaBudget(profile);
    expect(
      Math.ceil(budget.videoBytes / 3) * 4 + 1_000_000 + 10_000,
    ).toBeLessThan(budget.bodyBytes);
  }
});
it("requires video review on visual drafts and preserves it through parser and normalizer", async () => {
  const { draft, context } = visualDraft();
  const { url } = await clip();
  const options = { goal: "Narration", videoBase64: url };
  const request = sparkRequest(context, options);
  expect(request.instructions).toContain("Watch the attached reviewed video");
  expect(JSON.stringify(request.text.format.schema)).toContain("videoReview");
  expect(request.input).not.toContain(url);
  const parsed = parseSparkDraft(
    { status: "completed", output_text: JSON.stringify(draft) },
    context,
    options,
  );
  expect(parsed.videoReview).toEqual(draft.videoReview);
  delete draft.videoReview;
  expect(() =>
    parseSparkDraft(
      { status: "completed", output_text: JSON.stringify(draft) },
      context,
      options,
    ),
  ).toThrow();
});
it.each([
  "missing-action",
  "wrong-window",
  "unseen",
  "unknown-object",
  "unknown-requirement",
  "wrong-goal-frame",
])("rejects inconsistent visual claims: %s", (kind) => {
  const { draft, context } = visualDraft();
  if (kind === "missing-action") draft.videoReview!.actions.pop();
  if (kind === "wrong-window")
    draft.videoReview!.actions[0].evidenceWindow = {
      startFrame: 1,
      changeFrame: 2,
      resultFrame: 3,
    };
  if (kind === "unseen")
    draft.videoReview!.actions[0].visualSupport = "not_shown";
  if (kind === "unknown-object")
    draft.videoReview!.actions[0].objectIds = ["invented"];
  if (kind === "unknown-requirement")
    draft.videoReview!.goal.requirementIds = ["invented"];
  if (kind === "wrong-goal-frame") draft.videoReview!.goal.evidenceFrames = [0];
  expect(() =>
    validateDraft(localExecutionDraft(draft, "Narration"), context),
  ).toThrow();
});
it("retains necessary untracked video actions as unsupported rather than inventing identities or dropping work", () => {
  const { draft, context, execution } = visualDraft();
  execution.requirements.push({
    id: "film",
    description: "Remove film",
    status: "unsupported",
    capability: "unsupported",
    stepIds: [],
    goalPredicateIds: [],
    reason: "No tracked film identity",
  });
  draft.videoReview!.actions.push({
    id: "film-action",
    description: "Film action",
    objectIds: [],
    requirementIds: ["film"],
    stepIds: [],
    evidenceWindow: { startFrame: 0, changeFrame: 1, resultFrame: 2 },
    visualSupport: "unclear",
    coverage: "unsupported",
    reason: "No reliable identity to measure",
  });
  draft.videoReview!.goal.requirementIds.push("film");
  expect(
    validateDraft(localExecutionDraft(draft, "Narration"), context).videoReview!
      .actions,
  ).toHaveLength(3);
});

it("allows an explicitly unshown requirement without fabricating action timing", () => {
  const { draft, context, execution } = visualDraft();
  execution.requirements.push({
    id: "hidden",
    description: "Required but unshown check",
    status: "unsupported",
    capability: "unsupported",
    stepIds: [],
    goalPredicateIds: [],
    reason: "Not demonstrated",
  });
  draft.videoReview!.actions.push({
    id: "unshown",
    description: "Unshown required check",
    objectIds: [],
    requirementIds: ["hidden"],
    stepIds: [],
    evidenceWindow: null,
    visualSupport: "not_shown",
    coverage: "unsupported",
    reason: "No source window exists",
  });
  draft.videoReview!.goal.requirementIds.push("hidden");
  expect(() =>
    validateDraft(localExecutionDraft(draft, "Narration"), context),
  ).not.toThrow();
  draft.videoReview!.actions.at(-1)!.evidenceWindow = {
    startFrame: 0,
    changeFrame: 1,
    resultFrame: 2,
  };
  expect(() =>
    validateDraft(localExecutionDraft(draft, "Narration"), context),
  ).toThrow("must not invent");
});
it("rejects a substituted clip through the canonical HTTP handler before starting any provider", async () => {
  vi.stubEnv(
    "TEACH_ACCESS_TOKEN",
    "fake-owner-access-token-over-32-characters",
  );
  const { context } = visualDraft();
  const { url, bytes } = await clip();
  context.lesson.media.info.bytes = bytes.length;
  const token = seal(
    {
      fileId: "file-video",
      lesson: context.lesson,
      videoSha256: "0".repeat(64),
    },
    "upload",
    "owner-cli",
  );
  const response = await compile(
    new Request("http://localhost/api/teach/compile", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TEACH_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        goal: "Visible transfer",
        automatic: true,
        confirmed: true,
        videoBase64: url,
      }),
    }),
  );
  expect(response.status).toBe(422);
  expect((await response.json()).error).toContain("differs");
  expect(fetch).not.toHaveBeenCalled();
});

it("passes the exact bound video through the canonical compile handler and returns its visual audit", async () => {
  vi.stubEnv(
    "TEACH_ACCESS_TOKEN",
    "fake-owner-access-token-over-32-characters",
  );
  vi.stubEnv("MODEL_API_KEY", "fake-meta-key");
  const { draft, context } = visualDraft();
  const { url, bytes, videoSha256 } = await clip();
  context.lesson.media.info.bytes = bytes.length;
  const normalized = localExecutionDraft(draft, "Narration", context);
  const compiler = vi.spyOn(pipeline, "compileLesson").mockResolvedValue({
    draft: normalized,
    context,
    providerDiagnostic: {
      provider: "baseten",
      modelId: "meta-models/muse-spark-open-1026",
      outputTokens: 100,
      visualInput: "video",
    },
  });
  const token = seal(
    { fileId: "file-video", lesson: context.lesson, videoSha256 },
    "upload",
    "owner-cli",
  );
  const response = await compile(
    new Request("http://localhost/api/teach/compile", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TEACH_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        goal: "Visible transfer",
        automatic: true,
        confirmed: true,
        videoBase64: url,
      }),
    }),
  );
  expect(response.status).toBe(200);
  const event = JSON.parse((await response.text()).trim());
  expect(event.type).toBe("draft");
  expect(event.draft.videoReview).toEqual(draft.videoReview);
  expect(compiler).toHaveBeenCalledWith(
    expect.any(OpenAI),
    expect.objectContaining({ videoSha256 }),
    undefined,
    expect.any(Function),
    expect.any(AbortSignal),
    { goal: "Visible transfer", videoBase64: url },
  );
  expect(fetch).not.toHaveBeenCalled();
});

it("realigning a contradicted final condition also realigns the video goal review (live run 6 root cause)", async () => {
  const fixture = visualDraft();
  const { draft, context, execution } = fixture;
  // Extend the source: the object rests after the last result, then is lifted
  // again at frame 20, which the model cites for the final scene.
  const track = context.tracking[0];
  const settled = track.samples.at(-1)!;
  for (let frame = settled.frame + 1; frame <= 20; frame++) {
    context.lesson.media.frameTimesMs.push(frame * 100);
    track.samples.push({
      ...settled,
      frame,
      timestampMs: frame * 100,
      box:
        frame === 20
          ? { ...settled.box, top: settled.box.top - 0.2, bottom: settled.box.bottom - 0.2 }
          : { ...settled.box },
    });
  }
  context.lesson.media.info.video!.frames = 21;
  execution.finalConditions[0].evidenceFrames = [20];
  draft.videoReview!.goal.evidenceFrames = [20];
  const { url } = await clip();
  const parsed = parseSparkDraft(
    { status: "completed", output_text: JSON.stringify(draft) },
    context,
    { goal: "Narration", videoBase64: url },
  );
  const result = parsed.procedure.steps.at(-1)!.execution!.evidenceWindow.resultFrame;
  const e = parsed.procedure.execution as unknown as ExecutionV3;
  expect(e.finalConditions[0].evidenceFrames).toEqual([result]);
  expect(parsed.videoReview!.goal.evidenceFrames).toEqual([result]);
});
