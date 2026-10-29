import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import { parseVideoStream, type ResponsesEvent } from "@meta-sam/parser";
import { approveDraft, validateDraft, validateSelections, type TeachContext, type TeachDraft, type TeachReview } from "../src/teach/schema";
import { inspectLessonVideo, validateLessonAudio } from "../src/teach/media";
import { discoveryRequest, parseDiscovery } from "../src/server/teach/discovery";
import { suggestReviews, keyFrames } from "../src/teach/review-suggestions";
import { normalizeTranscript, samSelectionRequest, summarizeTracking, sparkRequest, parseSparkDraft, uploadLesson, compileLesson } from "../src/server/teach/pipeline";
import { authorize, seal, unseal } from "../src/server/teach/security";
import { boundedBody, lesson as lessonRoute, approve as approvalRoute, compile as compileRoute, access as accessRoute } from "../src/server/teach/http";
import * as providerClient from "../src/server/meta/client";
import * as media from "../src/server/meta/media";

vi.mock("server-only", () => ({}));
vi.mock("../src/server/meta/media", async (original) => { const actual = await original<typeof import("../src/server/meta/media")>(); return { ...actual, transcribeWav: vi.fn() }; });
const token = "unit-test-owner-access-token-at-least-32-characters";
const lessonId = "00000000-0000-4000-8000-000000000001";
const context: TeachContext = {
  lesson: { lessonId, media: { info: { container: "mp4", mime: "video/mp4", bytes: 100, durationSeconds: 15, video: { codec: "avc", width: 640, height: 480, frames: 3, fps: 15 }, audio: { codec: "aac", sampleRate: 48000, channels: 1 } }, frameTimesMs: [0, 1000, 2000] }, transcript: { text: "Move the base into its target.", durationMs: 15000, turns: [{ startMs: 0, endMs: 2000, text: "Move the base." }] } },
  selections: [{ id: "component-1", description: "Base", frame: 0, mark: { kind: "point", x: 10, y: 10 } }],
  tracking: [{ componentId: "component-1", missingFrames: 1, samples: [{ frame: 0, timestampMs: 0, box: { left: 0.05, top: 0.05, right: 0.15, bottom: 0.15 }, confidence: 0.99, maskPixels: 100 }, { frame: 1, timestampMs: 1000, box: { left: 0.55, top: 0.55, right: 0.65, bottom: 0.65 }, confidence: 0.99, maskPixels: 100 }] }],
};
function draftFor(id = lessonId): TeachDraft { return {
  procedure: { id, version: 1, title: "Move the base", approval: null, components: [{ id: "component-1", description: "Base" }], zones: [{ id: "from", description: "Starting zone" }, { id: "to", description: "Target zone" }], steps: [{ id: "move-base", description: "Move the base into the target zone.", prerequisites: [], condition: { kind: "enters_zone", componentId: "component-1", fromZone: "from", toZone: "to", minimumConfidence: 0.9 }, forbiddenTransitions: [], source: { sourceId: id, timestampMs: 0, description: "Before movement" }, recovery: { instruction: "Return to the start and observe again.", source: { sourceId: id, timestampMs: 0, description: "Starting reference" } } }] },
  notes: [{ stepId: "move-base", explanation: "Candidate observable motion.", candidateErrors: ["Wrong order remains a candidate rule."], uncertainties: ["A human must confirm the target zone."], supportingFrames: [0, 1] }],
}; }
const review: TeachReview = { reviewer: "Test reviewer", confirmed: true, steps: [{ stepId: "move-base", reviewed: true, conditionConfirmed: true, fromFrame: 0, toFrame: 1, fromRegion: { left: 0, top: 0, right: 0.2, bottom: 0.2 }, toRegion: { left: 0.5, top: 0.5, right: 0.7, bottom: 0.7 } }] };
function wav(seconds = 15) { const bytes = new Uint8Array(44 + seconds * 24000 * 2); const v = new DataView(bytes.buffer); const ascii = (i: number, s: string) => [...s].forEach((c, n) => { bytes[i + n] = c.charCodeAt(0); }); ascii(0, "RIFF"); v.setUint32(4, bytes.length - 8, true); ascii(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 24000, true); v.setUint32(28, 48000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); ascii(36, "data"); v.setUint32(40, bytes.length - 44, true); return new Blob([bytes], { type: "audio/wav" }); }
const rawTranscript = { sessionId: "mock-session", transcript: "Move the base.", audioDurationMs: 15000, turns: [{ turnId: 1, startMs: 0, endMs: 1000, transcript: "Move the base." }] };
beforeEach(() => { vi.stubEnv("TEACH_ACCESS_TOKEN", token); vi.stubEnv("MODEL_API_KEY", "unit-test-key"); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Live network forbidden"); })); vi.mocked(media.transcribeWav).mockResolvedValue(rawTranscript); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Teach schema, compilation and human approval", () => {
  it("accepts an unapproved evidence-grounded draft", () => { expect(validateDraft(draftFor(), context).procedure.approval).toBeNull(); });
  it("requires explicit human confirmation and per-step review", () => {
    for (const value of [{ ...review, confirmed: false }, { ...review, steps: [] }, { ...review, steps: [{ ...review.steps[0], conditionConfirmed: false }] }, { ...review, steps: [review.steps[0], review.steps[0]] }]) expect(() => approveDraft(draftFor(), value, context, 5000)).toThrow();
  });
  it("approves only a supported zone entry and keeps the original draft unapproved", () => {
    const draft = draftFor(); const result = approveDraft(draft, review, context, 5000);
    expect(result.procedure.approval).toEqual({ reviewer: "Test reviewer", timestampMs: 5000 });
    expect(result.zoneBindings).toHaveLength(2); expect(draft.procedure.approval).toBeNull();
  });
  it.each(["unknown component", "bad source", "invented frame", "auto approval", "no notes"])("rejects %s", (kind) => {
    const draft = draftFor();
    if (kind === "unknown component") draft.procedure.components[0].id = "invented";
    if (kind === "bad source") draft.procedure.steps[0].source.timestampMs = 99999;
    if (kind === "invented frame") draft.notes[0].supportingFrames = [2];
    if (kind === "auto approval") draft.procedure.approval = { reviewer: "Model", timestampMs: 1 };
    if (kind === "no notes") draft.notes = [];
    expect(() => validateDraft(draft, context)).toThrow();
  });
  it("rejects presence without movement into the target", () => {
    const unchanged = structuredClone(context); unchanged.tracking[0].samples[1].box = unchanged.tracking[0].samples[0].box;
    expect(() => approveDraft(draftFor(), review, unchanged, 5000)).toThrow("does not show");
  });
  it.each([null, 0.2])("rejects uncertain/low-confidence observation %s", (confidence) => {
    const uncertain = structuredClone(context); uncertain.tracking[0].samples[1].confidence = confidence;
    expect(() => approveDraft(draftFor(), review, uncertain, 5000)).toThrow("confidence");
  });
  it("rejects missing evidence inside the selected interval", () => {
    const gap = structuredClone(context); gap.tracking[0].samples[1].frame = 2; gap.tracking[0].samples[1].timestampMs = 2000;
    const draft = draftFor(); draft.notes[0].supportingFrames = [0, 2];
    expect(() => approveDraft(draft, { ...review, steps: [{ ...review.steps[0], toFrame: 2 }] }, gap, 5000)).toThrow("missing");
  });
  it("does not approve reversed or identical source times", () => { expect(() => approveDraft(draftFor(), { ...review, steps: [{ ...review.steps[0], fromFrame: 1, toFrame: 0 }] }, context, 5000)).toThrow("ordered"); });
  it("rejects overlapping zone mappings", () => {
    expect(() => approveDraft(draftFor(), { ...review, steps: [{ ...review.steps[0], fromRegion: { left: 0, top: 0, right: 0.8, bottom: 0.8 } }] }, context, 5000)).toThrow("overlap");
  });
  it("requires the next reviewed action to occur after its prerequisite interval", () => {
    const next = structuredClone(context);
    next.selections.push({ ...next.selections[0], id: "component-2" });
    next.tracking.push({ ...structuredClone(next.tracking[0]), componentId: "component-2" });
    const draft = draftFor();
    draft.procedure.components.push({ id: "component-2", description: "Support" });
    draft.procedure.zones.push({ id: "from2", description: "Second start" }, { id: "to2", description: "Second target" });
    const first = draft.procedure.steps[0];
    draft.procedure.steps.push({ ...structuredClone(first), id: "second", prerequisites: [first.id], condition: { ...first.condition, componentId: "component-2", fromZone: "from2", toZone: "to2" } });
    draft.notes.push({ ...structuredClone(draft.notes[0]), stepId: "second" });
    expect(() => approveDraft(draft, { ...review, steps: [...review.steps, { ...review.steps[0], stepId: "second" }] }, next, 5000)).toThrow("ordered");
  });
  it("validates selected points, boxes, frame bounds and the four-component cap", () => {
    expect(validateSelections(context.selections, context.lesson.media)).toHaveLength(1);
    for (const selections of [[{ ...context.selections[0], frame: 3 }], [{ ...context.selections[0], mark: { kind: "point", x: 640, y: 0 } }], [{ ...context.selections[0], mark: { kind: "box", left: 10, right: 5, top: 0, bottom: 10 } }], Array(5).fill(context.selections[0])]) expect(() => validateSelections(selections, context.lesson.media)).toThrow();
  });
  it("uses official frame/object prompts for more than one component", () => {
    const request = samSelectionRequest("file-mock", [...context.selections, { ...context.selections[0], id: "component-2", frame: 1 }], context.lesson.media);
    expect(request.input[0].content[0].text).toContain("<0f>1<|point;"); expect(request.input[0].content[0].text).toContain("<1f>2<|point;");
    expect(request.metadata.include_confidence).toBe("true");
  });
  it("requests bounded schema-constrained Spark output and rejects malformed/incomplete output", () => {
    const request = sparkRequest(context); expect(request.model).toBe("muse-spark-1.3"); expect(request.max_output_tokens).toBe(6144); expect(request.text.format.strict).toBe(true);
    expect(request.instructions).toContain("FIRST step MUST have prerequisites: [] and forbiddenTransitions: []");
    const invalidRule = draftFor();
    const firstStep = invalidRule.procedure.steps[0];
    firstStep.forbiddenTransitions.push({ condition: firstStep.condition, unlessVerified: [firstStep.id], recovery: firstStep.recovery });
    expect(() => parseSparkDraft({ status: "completed", output_text: JSON.stringify(invalidRule) }, context)).toThrow("Forbidden transitions must reference earlier steps");
    expect(parseSparkDraft({ status: "completed", output_text: JSON.stringify(draftFor()) }, context).procedure.approval).toBeNull();
    for (const output of [{ status: "incomplete", output_text: "{}" }, { status: "completed", output_text: "not JSON" }, { status: "completed", output_text: "{}" }]) expect(() => parseSparkDraft(output, context)).toThrow();
  });
});

describe("media and timestamp handling", () => {
  it("inspects real synthetic MP4 bytes and derives source packet timestamps", async () => {
    const bytes = await readFile(new URL("./fixtures/teach-synthetic.mp4", import.meta.url));
    const result = await inspectLessonVideo(new Blob([bytes]));
    expect(result.frameTimesMs.length).toBe(result.info.video?.frames); expect(result.info.video?.codec).toBe("avc");
    expect(result.frameTimesMs.every((t, i, a) => i === 0 || t > a[i - 1])).toBe(true);
  });
  it("rejects oversize, forged and incompatible duration audio before any API call", async () => {
    await expect(inspectLessonVideo(new Blob([new Uint8Array(2_800_001)]))).rejects.toThrow("2.8 MB");
    await expect(inspectLessonVideo(new Blob(["fake MP4"]))).rejects.toThrow();
    expect(() => validateLessonAudio(new Uint8Array(10), context.lesson.media)).toThrow();
    expect(() => validateLessonAudio(new Uint8Array(480044), context.lesson.media)).toThrow();
  });
  it("preserves endpointing turn timestamps; does not invent word timing", () => {
    expect(normalizeTranscript(rawTranscript, context.lesson.media).turns).toEqual([{ startMs: 0, endMs: 1000, text: "Move the base." }]);
    expect(() => normalizeTranscript({ ...rawTranscript, turns: [] }, context.lesson.media)).toThrow("timestamped");
    expect(() => normalizeTranscript({ ...rawTranscript, turns: [{ ...rawTranscript.turns[0], endMs: 99999 }] }, context.lesson.media)).toThrow("outside");
  });
});

// Official parser README encoded mask; mocked events, never attributed to a live response.
const geometry = (frame: number, left: number) => `<${frame}f>1<|box;x1=${left};y1=20;x2=${left + 59};y2=46;w=640;h=480;c=0.99|>` + "<|mask;x=0;y=0;c=0.99;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>\n";
function events(text: string): ResponsesEvent[] { const lane = { item_id: "mock-message", output_index: 0, content_index: 0 }; return [{ type: "response.output_text.delta", ...lane, delta: text }, { type: "response.output_text.done", ...lane, text }, { type: "response.completed" }]; }
async function* iterate(text: string) { yield* events(text); }

describe("server batch pipeline (mock provider)", () => {
  it("decodes frame-indexed masks and preserves missing frames instead of invented states", async () => {
    const result = summarizeTracking(await parseVideoStream(iterate(geometry(1, 200) + geometry(0, 10))).finalResult, context.selections, context.lesson.media);
    expect(result[0].samples.map((s) => s.frame)).toEqual([0, 1]); expect(result[0].samples[0].confidence).toBe(0.99); expect(result[0].missingFrames).toBe(1);
  });
  it("deletes a successful upload if transcription fails", async () => {
    const bytes = await readFile(new URL("./fixtures/teach-synthetic.mp4", import.meta.url));
    const calls: string[] = [];
    vi.mocked(media.transcribeWav).mockRejectedValueOnce(new Error("Invalid transcript"));
    const transport: typeof fetch = async (url, options) => {
      if (url === "data:,") return new Response("");
      const req = new Request(url, options); calls.push(req.method);
      return req.method === "DELETE" ? Response.json({ id: "file-teach", deleted: true }) : Response.json({ id: "file-teach", bytes: bytes.length, purpose: "user_data", expires_at: Math.floor(Date.now() / 1000) + 3600 });
    };
    const client = new OpenAI({ apiKey: "mock-key", baseURL: "https://api.meta.ai/v1", fetch: transport, maxRetries: 0 });
    await expect(uploadLesson(client, new Blob([bytes]), wav(), new AbortController().signal)).rejects.toThrow("Invalid transcript");
    expect(calls).toEqual(["POST", "DELETE"]);
  });
  it.each([false, true])("uploads once, requests expiry, reuses file ID and always deletes; Spark invalid=%s", async (invalid) => {
    const bytes = await readFile(new URL("./fixtures/teach-synthetic.mp4", import.meta.url)); const video = new Blob([bytes]); const calls: string[] = []; let currentId = "";
    const transport: typeof fetch = async (url, options) => {
      if (url === "data:,") return new Response("");
      const req = new Request(url, options); const path = new URL(req.url).pathname; calls.push(`${req.method} ${path}`);
      if (path === "/v1/files") { const form = await req.formData(); expect(form.get("purpose")).toBe("user_data"); expect(form.get("expires_after[seconds]")).toBe("3600"); return Response.json({ id: "file-teach", bytes: video.size, purpose: "user_data", expires_at: Math.floor(Date.now() / 1000) + 3600 }); }
      if (req.method === "DELETE") return Response.json({ id: "file-teach", deleted: true });
      const body = await req.json() as { model: string; input: unknown };
      if (body.model === "sam-3.1") { expect(JSON.stringify(body.input)).toContain('"file_id":"file-teach"'); return new Response(events(geometry(0, 10) + geometry(1, 200)).map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } }); }
      expect(body.model).toBe("muse-spark-1.3");
      return Response.json({ id: "resp-mock", object: "response", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: invalid ? "{}" : JSON.stringify(draftFor(currentId)), annotations: [] }] }] });
    };
    const client = new OpenAI({ apiKey: "mock-key", baseURL: "https://api.meta.ai/v1", fetch: transport, maxRetries: 0 });
    const upload = await uploadLesson(client, video, wav(), new AbortController().signal); currentId = upload.lesson.lessonId;
    expect(vi.mocked(media.transcribeWav)).toHaveBeenCalledWith(expect.any(Blob), "mock-key", fetch, expect.objectContaining({ mode: "ENDPOINTING" }));
    const promise = compileLesson(client, upload, context.selections, () => {}, new AbortController().signal);
    if (invalid) await expect(promise).rejects.toThrow(); else expect((await promise).draft.procedure.approval).toBeNull();
    expect(calls).toEqual(["POST /v1/files", "POST /v1/responses", "POST /v1/responses", "DELETE /v1/files/file-teach"]);
  });
});

describe("Teach HTTP/security boundaries", () => {
  it("encrypts references and rejects tampering, wrong session, wrong stage and expiry", () => {
    const value = seal({ fileId: "file-private" }, "upload", "one", 1000);
    expect(value).not.toContain("file-private"); expect(unseal(value, "upload", "one")).toEqual({ fileId: "file-private" });
    expect(() => unseal(value + "a", "upload", "one")).toThrow(); expect(() => unseal(value, "upload", "two")).toThrow(); expect(() => unseal(value, "review", "one")).toThrow();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 2000); expect(() => unseal(value, "upload", "one")).toThrow();
  });
  it("rejects anonymous and cross-origin paid requests", () => {
    expect(() => authorize(new Request("http://localhost/api/teach/lesson"))).toThrow();
    expect(() => authorize(new Request("http://localhost/api/teach/lesson", { headers: { Authorization: `Bearer ${token}`, Origin: "https://other.example" } }))).toThrow();
  });
  it("accepts a matching browser Host when Next normalizes the URL hostname", () => {
    expect(authorize(new Request("http://localhost:3000/api/teach/lesson", { headers: { Authorization: `Bearer ${token}`, Origin: "http://127.0.0.1:3000", Host: "127.0.0.1:3000" } }))).toBe("owner-cli");
  });
  it("accepts only the configured Codespaces forwarded origin and sets Secure cookies", async () => {
    vi.stubEnv("CODESPACE_NAME", "test-workspace"); vi.stubEnv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "app.github.dev");
    const origin = "https://test-workspace-3000.app.github.dev";
    const headers = { Origin: origin, Host: "localhost:3000", "Content-Type": "application/json" };
    const response = await accessRoute(new Request("http://localhost:3000/api/teach/access", { method: "POST", headers, body: JSON.stringify({ token }) }));
    expect(response.status).toBe(200); expect(response.headers.get("set-cookie")).toContain("; Secure");
    expect(() => authorize(new Request("http://localhost:3000/api/teach/lesson", { headers: { ...headers, Origin: "https://other-3000.app.github.dev", Authorization: `Bearer ${token}`, "X-Forwarded-Host": "other-3000.app.github.dev" } }))).toThrow("Cross-origin");
  });
  it("supports an exact configured public origin without trusting arbitrary forwarded hosts", () => {
    vi.stubEnv("TEACH_PUBLIC_ORIGIN", "https://teach.example.com");
    expect(authorize(new Request("http://localhost:3000", { headers: { Authorization: `Bearer ${token}`, Origin: "https://teach.example.com" } }))).toBe("owner-cli");
    expect(() => authorize(new Request("http://localhost:3000", { headers: { Authorization: `Bearer ${token}`, Origin: "https://attacker.example", "X-Forwarded-Host": "attacker.example" } }))).toThrow();
  });
  it("allows browser-confirmed same-origin fetches after a preview proxy rewrites Host", async () => {
    const headers = { Origin: "https://preview.example.com", Host: "127.0.0.1:3000", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" };
    const response = await accessRoute(new Request("http://localhost:3000/api/teach/access", { method: "POST", headers, body: JSON.stringify({ token }) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("; Secure");
    for (const site of ["cross-site", "same-site", "none", ""]) {
      expect(() => authorize(new Request("http://localhost:3000/api/teach/lesson", { headers: { ...headers, "Sec-Fetch-Site": site, Authorization: `Bearer ${token}` } }))).toThrow("Cross-origin");
    }
    expect(() => authorize(new Request("http://localhost:3000/api/teach/lesson", { headers: { ...headers, Origin: "null", Authorization: `Bearer ${token}` } }))).toThrow("Cross-origin");
  });
  it("rejects browser cross-site metadata even if a proxy Host matches the Origin", () => {
    expect(() => authorize(new Request("http://localhost:3000", { headers: { Origin: "https://other.example", Host: "other.example", "Sec-Fetch-Site": "cross-site", Authorization: `Bearer ${token}` } }))).toThrow("Cross-origin");
  });
  it("preserves safe draft schema diagnostics without returning a model response body", () => {
    expect(() => parseSparkDraft({ status: "completed", output_text: "{}" }, context)).toThrow("Draft schema rejected");
  });
  it("bounds streamed bodies even without content-length", async () => { await expect(boundedBody(new Request("http://localhost", { method: "POST", body: "123456" }), 5)).rejects.toThrow("size limit"); });
  it("rejects malformed/oversize uploads before constructing a Meta client", async () => {
    const factory = vi.spyOn(providerClient, "createMetaClient");
    const response = await lessonRoute(new Request("http://localhost/api/teach/lesson", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data; boundary=x", "Content-Length": "4000001" }, body: "fake" }));
    expect(response.status).toBe(413); expect(factory).not.toHaveBeenCalled();
  });
  it("requires signed context and explicit approval; never trusts approval metadata sent by a client", async () => {
    const ref = seal(context, "review", "owner-cli");
    const request = (body: unknown) => new Request("http://localhost/api/teach/approve", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await approvalRoute(request({ token: ref, draft: draftFor(), review: { ...review, confirmed: false } }))).status).toBe(422);
    const result = await approvalRoute(request({ token: ref, draft: draftFor(), review })); expect(result.status).toBe(200);
    const body: unknown = await result.json(); expect(body).toMatchObject({ procedure: { approval: { reviewer: "Test reviewer" } }, approvalReceipt: expect.any(String) });
    expect((await approvalRoute(request({ token: ref + "bad", draft: draftFor(), review }))).status).toBe(401);
  });
  it("rejects a forged upload reference before processing", async () => {
    const response = await compileRoute(new Request("http://localhost/api/teach/compile", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ token: "forged", selections: context.selections, confirmed: true }) }));
    expect(response.status).toBe(401);
  });
});


describe("automatic lesson discovery and review suggestions", () => {
  const discovery = { components: [{ description: "Blue base", timestampMs: 0, box: { left: 10, top: 10, right: 100, bottom: 100 } }] };
  it("uses documented video file input and bounded structured output for discovery", () => {
    const request = discoveryRequest("file-reused", context.lesson);
    expect(request.model).toBe("muse-spark-1.3"); expect(request.max_output_tokens).toBe(1800);
    expect(request.input[0].content).toContainEqual({ type: "input_file", file_id: "file-reused" });
    expect(request.text.format.strict).toBe(true);
  });
  it("maps proposed timestamps to actual source frames and rejects malformed/out-of-bounds boxes", () => {
    const response = (data: unknown) => ({ status: "completed", output_text: JSON.stringify(data) });
    expect(parseDiscovery(response(discovery), context.lesson)[0].mark.kind).toBe("box");
    expect(parseDiscovery(response({ components: [{ ...discovery.components[0], timestampMs: 920 }] }), context.lesson)[0].frame).toBe(1);
    for (const data of [{ components: [] }, { components: [{ ...discovery.components[0], timestampMs: 20000 }] }, { components: [{ ...discovery.components[0], box: { left: 10, top: 10, right: 9999, bottom: 100 } }] }]) expect(() => parseDiscovery(response(data), context.lesson)).toThrow();
    expect(() => parseDiscovery({ status: "incomplete", output_text: "{}" }, context.lesson)).toThrow("did not complete");
    expect(() => parseDiscovery({ status: "completed", output_text: "not JSON" }, context.lesson)).toThrow("invalid JSON");
  });
  it.each([false, true])("automatic pipeline reuses one file and cleans up, discovery invalid=%s", async (invalid) => {
    const calls: string[] = []; let sparkCalls = 0;
    const transport: typeof fetch = async (url, options) => {
      const req = new Request(url, options);
      if (req.method === "DELETE") { calls.push("delete"); return Response.json({ id: "file-teach", deleted: true }); }
      const body = await req.json() as { model: string; input: unknown };
      calls.push(body.model); if (body.model === "sam-3.1" || sparkCalls === 0) expect(JSON.stringify(body.input)).toContain('"file_id":"file-teach"');
      if (body.model === "sam-3.1") return new Response(events(geometry(0, 10) + geometry(1, 200)).map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
      const text = ++sparkCalls === 1 ? JSON.stringify(invalid ? { components: [] } : discovery) : JSON.stringify(draftFor());
      return Response.json({ id: "resp-mock", object: "response", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }] });
    };
    const client = new OpenAI({ apiKey: "mock-key", baseURL: "https://api.meta.ai/v1", fetch: transport, maxRetries: 0 });
    const result = compileLesson(client, { fileId: "file-teach", lesson: context.lesson }, undefined, () => {}, new AbortController().signal);
    if (invalid) { await expect(result).rejects.toThrow("deletion was confirmed"); expect(calls).toEqual(["muse-spark-1.3", "delete"]); }
    else { expect((await result).draft.procedure.approval).toBeNull(); expect(calls).toEqual(["muse-spark-1.3", "sam-3.1", "muse-spark-1.3", "delete"]); }
  });
  it("prefills supported zones but never marks human review complete", () => {
    const draft = draftFor(), suggestions = suggestReviews(draft, context), check = suggestions["move-base"];
    expect(check.fromFrame).toBe(0); expect(check.toFrame).toBe(1); expect(check.fromRegion).not.toBeNull(); expect(check.toRegion).not.toBeNull();
    expect(check.reviewed).toBe(false); expect(check.conditionConfirmed).toBe(false);
    expect(() => approveDraft(draft, { reviewer: "Test", confirmed: true, steps: [{ stepId: "move-base", ...check }] }, context, 123)).toThrow();
    expect(approveDraft(draft, { reviewer: "Test", confirmed: true, steps: [{ stepId: "move-base", ...check, reviewed: true, conditionConfirmed: true }] }, context, 123).procedure.approval).not.toBeNull();
  });
  it.each(["missing", "uncertain", "stationary"])("does not suggest success or fabricated zones for %s evidence", (kind) => {
    const changed = structuredClone(context);
    if (kind === "missing") changed.tracking[0].samples[1].frame = 2;
    if (kind === "uncertain") changed.tracking[0].samples[1].confidence = null;
    if (kind === "stationary") changed.tracking[0].samples[1].box = changed.tracking[0].samples[0].box;
    expect(suggestReviews(draftFor(), changed)["move-base"].toRegion).toBeNull();
  });
  it("does not propose an overlapping before/after interval for a later step", () => {
    const draft = draftFor(), changed = structuredClone(context);
    const later = structuredClone(draft.procedure.steps[0]); later.id = "later"; later.condition.componentId = "component-2"; later.prerequisites = ["move-base"];
    draft.procedure.steps.push(later); draft.procedure.components.push({ id: "component-2", description: "Second object" });
    changed.tracking.push({ ...structuredClone(changed.tracking[0]), componentId: "component-2" });
    expect(suggestReviews(draft, changed).later.toRegion).toBeNull();
  });
  it("rejects conflicting automatic/manual requests before any provider request", async () => {
    const factory = vi.spyOn(providerClient, "createMetaClient");
    const token = seal({ fileId: "file-teach", lesson: context.lesson }, "upload", "owner-cli");
    const response = await compileRoute(new Request("http://localhost/api/teach/compile", { method: "POST", headers: { Authorization: `Bearer ${process.env.TEACH_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ token, selections: context.selections, automatic: true, confirmed: true }) }));
    expect(response.status).toBe(400); expect(factory).not.toHaveBeenCalled();
  });
  it("shows a bounded set of useful moments and retains selected before/after frames", () => {
    const changed = structuredClone(context); changed.lesson.media.frameTimesMs = Array.from({ length: 223 }, (_, i) => i * 67);
    const result = keyFrames(changed, Array.from({ length: 223 }, (_, i) => i), [0, 222]);
    expect(result.length).toBeLessThanOrEqual(10); expect(result).toContain(0); expect(result).toContain(222);
    const selected = [0, 2, 30, 60, 90, 120, 180, 222];
    const dense = keyFrames(changed, Array.from({ length: 223 }, (_, i) => i), selected);
    expect(dense.length).toBeLessThanOrEqual(10); for (const frame of selected) expect(dense).toContain(frame);
  });
});
