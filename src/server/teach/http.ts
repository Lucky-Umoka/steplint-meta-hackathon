import "server-only";
import { z } from "zod";
import { ContextSchema, LessonSchema, MAX_TEACH_BODY, MAX_TEACH_JSON, MAX_TEACH_VIDEO, SESSION_MS, approveDraft } from "../../teach/schema";
import { createMetaClient } from "../meta/client";
import { authorize, requireSameOrigin, matchesAccessToken, seal, unseal, safeError, TeachError } from "./security";
import { compileLesson, deleteLessonFile, uploadLesson } from "./pipeline";
import { createHash, randomUUID } from "node:crypto";

const UploadReferenceSchema = z.strictObject({ fileId: z.string().regex(/^file-[A-Za-z0-9_-]+$/), lesson: LessonSchema });
const TokenSchema = z.strictObject({ token: z.string().min(1).max(1_000_000) });
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function boundedBody(request: Request, maximum: number): Promise<Uint8Array<ArrayBuffer>> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new TeachError(413, "Request exceeds the Teach size limit.");
  if (!request.body) throw new TeachError(400, "Request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) { await reader.cancel(); throw new TeachError(413, "Request exceeds the Teach size limit."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
async function readJson(request: Request, max = MAX_TEACH_JSON): Promise<unknown> {
  try { return JSON.parse(new TextDecoder().decode(await boundedBody(request, max))); }
  catch (error) { if (error instanceof TeachError) throw error; throw new TeachError(400, "Request must contain valid JSON."); }
}
export function responseError(error: unknown) { const safe = safeError(error); return json({ error: safe.message }, safe.status); }

export async function access(request: Request) {
  try {
    requireSameOrigin(request);
    const body = z.strictObject({ token: z.string().max(256) }).parse(await readJson(request, 1024));
    if (!matchesAccessToken(body.token)) throw new TeachError(401, "Workspace access code is incorrect.");
    const cookie = seal(randomUUID(), "access", "owner", 8 * 60 * 60 * 1000);
    return Response.json({ unlocked: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": `steplint-teach=${cookie}; HttpOnly; SameSite=Strict; Path=/api/teach; Max-Age=28800${(request.headers.get("origin") ?? request.url).startsWith("https:") ? "; Secure" : ""}` } });
  } catch (error) { return responseError(error); }
}
export async function lesson(request: Request) {
  try {
    const session = authorize(request);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new TeachError(415, "Upload the MP4 and WAV as multipart form data.");
    const body = await boundedBody(request, MAX_TEACH_BODY);
    const form = await new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("content-type") ?? "" }, body }).formData();
    if ([...form.keys()].some((key) => !["video", "audio", "confirmed"].includes(key)) || ["video", "audio", "confirmed"].some((key) => form.getAll(key).length !== 1)) throw new TeachError(400, "Expected one video, one audio file and explicit lesson confirmation.");
    const video = form.get("video"), audio = form.get("audio");
    if (!(video instanceof File) || !(audio instanceof File) || form.get("confirmed") !== "true") throw new TeachError(400, "Preview and confirm your lesson before uploading.");
    if (video.size > MAX_TEACH_VIDEO || audio.size > 1_100_000) throw new TeachError(413, "MP4 must be ≤2.8 MB and WAV ≤1.1 MB; record a short lesson.");
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]);
    const upload = await uploadLesson(createMetaClient(), video, audio, signal);
    return json({ lesson: upload.lesson, token: seal(upload, "upload", session), expiresAt: Date.now() + SESSION_MS });
  } catch (error) { return responseError(error); }
}
export async function compile(request: Request) {
  try {
    const session = authorize(request);
    const input = z.strictObject({ token: z.string().max(1_000_000), selections: z.unknown(), confirmed: z.literal(true) }).parse(await readJson(request));
    const upload = UploadReferenceSchema.parse(unseal(input.token, "upload", session));
    // Validate marks before creating a stream or spending on provider requests.
    const { validateSelections } = await import("../../teach/schema");
    validateSelections(input.selections, upload.lesson.media);
    const controller = new AbortController();
    const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(240_000)]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(output) {
        const send = (value: unknown) => { if (!signal.aborted) output.enqueue(encoder.encode(JSON.stringify(value) + "\n")); };
        try {
          const result = await compileLesson(createMetaClient(), upload, input.selections, (message) => send({ type: "progress", message }), signal);
          send({ type: "draft", draft: result.draft, context: result.context, token: seal(result.context, "review", session), uploadDeleted: true });
        } catch (error) { send({ type: "error", ...safeError(error) }); }
        finally { try { output.close(); } catch { /* Consumer already cancelled; provider cleanup ran in compileLesson. */ } }
      },
      cancel() { controller.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return responseError(error); }
}
export async function discard(request: Request) {
  try {
    const session = authorize(request);
    const { token } = TokenSchema.parse(await readJson(request));
    const upload = UploadReferenceSchema.parse(unseal(token, "upload", session, true));
    await deleteLessonFile(createMetaClient(), upload.fileId);
    return json({ discarded: true });
  } catch (error) { return responseError(error); }
}
export async function approve(request: Request) {
  try {
    const session = authorize(request);
    const input = z.strictObject({ token: z.string().max(1_000_000), draft: z.unknown(), review: z.unknown() }).parse(await readJson(request));
    const context = ContextSchema.parse(unseal(input.token, "review", session));
    const approved = approveDraft(input.draft, input.review, context, Date.now());
    const digest = createHash("sha256").update(JSON.stringify(approved)).digest("hex");
    return json({ ...approved, approvalReceipt: seal({ digest, lessonId: approved.lessonId }, "approved", session, 365 * 24 * 60 * 60 * 1000) });
  } catch (error) { return responseError(error); }
}
