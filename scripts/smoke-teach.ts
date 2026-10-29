import { parseArgs } from "node:util";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { prepareMediaSmoke, readMedia, sha256 } from "./media-common";
import { reportFailure } from "./smoke-common";
import { inspectLessonVideo, validateLessonAudio } from "../src/teach/media";
import { ContextSchema, DraftSchema, LessonSchema, validateDraft, validateSelections, MAX_TEACH_BODY } from "../src/teach/schema";

async function main() {
  const { values } = parseArgs({ options: { approved: { type: "boolean" }, automatic: { type: "boolean" }, mp4: { type: "string" }, wav: { type: "string" }, "mp4-sha256": { type: "string" }, "wav-sha256": { type: "string" }, selections: { type: "string" }, "base-url": { type: "string", default: "http://127.0.0.1:3000" } } });
  prepareMediaSmoke(values.approved);
  if (!values.mp4 || !values.wav || !values["mp4-sha256"] || !values["wav-sha256"] || (!values.automatic && !values.selections) || (values.automatic && values.selections)) throw new Error("Require approved MP4/WAV paths and hashes, plus either --automatic or --selections JSON_PATH.");
  const base = new URL(values["base-url"]);
  if (!["localhost", "127.0.0.1"].includes(base.hostname) || !["http:", "https:"].includes(base.protocol)) throw new Error("This Phase 4 smoke script only targets a local StepLint server.");
  const mp4 = await readMedia(values.mp4, 2_800_000), wav = await readMedia(values.wav, 1_100_000);
  if (sha256(mp4) !== values["mp4-sha256"] || sha256(wav) !== values["wav-sha256"]) throw new Error("Media hashes differ from the approved recording.");
  const media = await inspectLessonVideo(new Blob([mp4])); validateLessonAudio(wav, media);
  const selections = values.selections ? validateSelections(JSON.parse((await readMedia(values.selections, 16_000)).toString()), media) : undefined;
  if (mp4.length + wav.length + 10_000 > MAX_TEACH_BODY) throw new Error("Combined upload too large.");
  const access = z.string().min(32).parse(process.env.TEACH_ACCESS_TOKEN);
  const headers = { Authorization: `Bearer ${access}` };
  console.log(`Teach live smoke: one MP4 upload, one Muse Voice ENDPOINTING request, one SAM video request (${selections?.length ?? "up to 4 automatically proposed"} selected components, ${media.frameTimesMs.length} frames), ${values.automatic ? "one Muse Spark video-discovery request (max 1800 output tokens), " : ""}one Muse Spark draft request (max 6144 output tokens), and cleanup deletion; no retries. No human approval will be fabricated.`);
  const started = performance.now();
  let draftingStartedMs: number | null = null;
  const body = new FormData(); body.append("video", new Blob([mp4], { type: "video/mp4" }), "lesson.mp4"); body.append("audio", new Blob([wav], { type: "audio/wav" }), "lesson.wav"); body.append("confirmed", "true");
  let pendingToken = "";
  try {
    const uploaded = await fetch(new URL("/api/teach/lesson", base), { method: "POST", headers, body, redirect: "error", signal: AbortSignal.timeout(200_000) });
    if (!uploaded.ok) throw new Error(`Teach upload/transcription endpoint failed: HTTP ${uploaded.status}. No retry attempted.`);
    const first = z.object({ lesson: LessonSchema, token: z.string() }).parse(await uploaded.json());
    pendingToken = first.token;
    const uploadAndTranscriptionMs = Math.round(performance.now() - started);
    const compiled = await fetch(new URL("/api/teach/compile", base), { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ token: first.token, ...(values.automatic ? { automatic: true } : { selections }), confirmed: true }), redirect: "error", signal: AbortSignal.timeout(values.automatic ? 300_000 : 260_000) });
    if (!compiled.ok || !compiled.body) throw new Error(`Teach compile endpoint failed: HTTP ${compiled.status}. No retry attempted.`);
    pendingToken = ""; // server now owns deletion, including processing failures
    const reader = compiled.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
    let result: unknown;
    const event = (line: string) => {
      if (!line.trim()) return;
      const value: unknown = JSON.parse(line);
      const header = z.object({ type: z.string(), message: z.string().optional() }).parse(value);
      if (header.type === "error") throw new Error(header.message ?? "Teach processing failed.");
      if (header.type === "progress") {
        const elapsedMs = Math.round(performance.now() - started);
        if (header.message?.startsWith("Drafting candidate")) draftingStartedMs = elapsedMs;
        console.log(`[${elapsedMs} ms] ${header.message}`);
      }
      if (header.type === "draft") result = value;
    };
    try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true }); let index; while ((index = buffer.indexOf("\n")) >= 0) { event(buffer.slice(0, index)); buffer = buffer.slice(index + 1); } if (buffer.length > 1_500_000) throw new Error("Teach response exceeds the bounded result size."); } buffer += decoder.decode(); event(buffer); }
    finally { reader.releaseLock(); }
    const final = z.object({ type: z.literal("draft"), draft: DraftSchema, context: ContextSchema, uploadDeleted: z.literal(true) }).parse(result);
    validateDraft(final.draft, final.context);
    const trackingMs = draftingStartedMs === null ? null : draftingStartedMs - uploadAndTranscriptionMs;
    const draftAndCleanupMs = draftingStartedMs === null ? null : Math.round(performance.now() - started) - draftingStartedMs;
    await writeFile(".media-lab/teach-live-result.json", JSON.stringify({ ...final, uploadAndTranscriptionMs, trackingMs, draftAndCleanupMs, totalMs: Math.round(performance.now() - started) }, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ result: "Teach live end-to-end batch smoke passed", transcriptTurns: final.context.lesson.transcript.turns.length, components: final.context.selections.length, trackedFrames: final.context.tracking.map((t) => ({ component: t.componentId, samples: t.samples.length, missing: t.missingFrames })), draftSteps: final.draft.procedure.steps.length, approval: final.draft.procedure.approval, uploadDeleted: final.uploadDeleted, uploadAndTranscriptionMs, trackingMs, draftAndCleanupMs, totalMs: Math.round(performance.now() - started) }, null, 2));
  } finally {
    if (pendingToken) {
      const response = await fetch(new URL("/api/teach/discard", base), { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ token: pendingToken }), redirect: "error" });
      if (!response.ok) console.error("Immediate cleanup was not confirmed; provider one-hour expiration is the fallback.");
    }
  }
}
main().catch(reportFailure);
