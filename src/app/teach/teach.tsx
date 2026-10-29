"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ContextSchema, DraftSchema, LessonSchema, type Lesson, type Selection, type TeachContext, type TeachDraft } from "@/teach/schema";
import LessonCapture, { type PreparedLesson } from "./capture";
import ComponentPicker from "./component-picker";
import Review from "./review";

const DraftEvent = z.object({ type: z.literal("draft"), draft: DraftSchema, context: ContextSchema, token: z.string(), uploadDeleted: z.literal(true) });
export default function Teach() {
  const [access, setAccess] = useState(""), [unlocked, setUnlocked] = useState(false);
  const [prepared, setPrepared] = useState<PreparedLesson | null>(null), [url, setUrl] = useState("");
  const [automatic, setAutomatic] = useState(true);
  const [confirmed, setConfirmed] = useState(false), [lesson, setLesson] = useState<Lesson | null>(null);
  const [uploadToken, setUploadToken] = useState(""), [result, setResult] = useState<{ draft: TeachDraft; context: TeachContext; token: string } | null>(null);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(""), [error, setError] = useState("");
  const request = useRef<AbortController | null>(null), latch = useRef(false);
  const cleanupToken = useRef("");
  const clipUrl = useRef("");
  function acceptPrepared(value: PreparedLesson) {
    if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
    clipUrl.current = URL.createObjectURL(value.video);
    setUrl(clipUrl.current); setPrepared(value);
  }
  useEffect(() => () => {
    request.current?.abort();
    if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
    if (cleanupToken.current) void fetch("/api/teach/discard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: cleanupToken.current }), keepalive: true }).catch(() => {});
  }, []);
  async function discard() {
    request.current?.abort();
    const token = cleanupToken.current;
    cleanupToken.current = "";
    if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
    clipUrl.current = ""; setUrl("");
    setPrepared(null); setLesson(null); setUploadToken(""); setResult(null); setConfirmed(false); setError(""); setStatus(""); setBusy(false); latch.current = false;
    if (token) { try { const response = await fetch("/api/teach/discard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }); if (!response.ok) setError("Immediate upload deletion could not be confirmed. Its requested one-hour expiration remains the fallback."); } catch { setError("Upload deletion could not be confirmed; provider expiration remains the fallback."); } }
  }
  async function unlock() {
    setError("");
    try {
      const response = await fetch("/api/teach/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: access }) });
      const data: unknown = await response.json();
      if (!response.ok) { const parsed = z.object({ error: z.string() }).safeParse(data); throw new Error(parsed.success ? parsed.data.error : "Unable to unlock Teach."); }
      setUnlocked(true); setAccess("");
    } catch (e) { setError(e instanceof Error ? e.message : "Workspace access failed."); }
  }
  async function upload() {
    if (!prepared || !confirmed || latch.current) return;
    latch.current = true; setBusy(true); setError(""); setStatus("Uploading once and transcribing your lesson…");
    const controller = new AbortController(); request.current = controller;
    try {
      const body = new FormData(); body.append("video", prepared.video, "lesson.mp4"); body.append("audio", prepared.audio, "lesson.wav"); body.append("confirmed", "true");
      const response = await fetch("/api/teach/lesson", { method: "POST", body, signal: controller.signal });
      const data: unknown = await response.json();
      if (!response.ok) { const parsed = z.object({ error: z.string() }).safeParse(data); throw new Error(parsed.success ? parsed.data.error : "Lesson upload/transcription failed."); }
      const parsed = z.object({ lesson: LessonSchema, token: z.string() }).parse(data);
      cleanupToken.current = parsed.token;
      setLesson(parsed.lesson); setUploadToken(parsed.token); setStatus("Transcript ready. Let AI build the lesson within 30 minutes; the temporary provider file expires after one hour.");
      if (automatic) await compile(undefined, parsed.token);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { if (!controller.signal.aborted) { latch.current = false; setBusy(false); } }
  }
  async function compile(selections?: Selection[], suppliedToken?: string) {
    if ((!suppliedToken && latch.current) || !(suppliedToken || uploadToken)) return;
    latch.current = true; setBusy(true); setError("");
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch("/api/teach/compile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: suppliedToken ?? uploadToken, ...(selections ? { selections } : { automatic: true }), confirmed: true }), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(response.status === 429 ? "Rate limit reached; no retry was made." : "Tracking could not start. Your reference may have expired.");
      // The compile request owns cleanup once it has started; do not send a competing deletion.
      cleanupToken.current = ""; setUploadToken("");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = "", gotDraft = false;
      const handle = (line: string) => {
        if (!line.trim()) return;
        const value: unknown = JSON.parse(line);
        const header = z.object({ type: z.string(), message: z.string().optional() }).parse(value);
        if (header.type === "progress") setStatus(header.message ?? "Processing…");
        if (header.type === "error") throw new Error(header.message ?? "Lesson processing failed.");
        if (header.type === "draft") { const parsed = DraftEvent.parse(value); gotDraft = true; setResult(parsed); setStatus("Draft ready. Temporary upload deleted. Human review is required."); }
      };
      try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; pending += decoder.decode(chunk.value, { stream: true }); let boundary; while ((boundary = pending.indexOf("\n")) >= 0) { handle(pending.slice(0, boundary)); pending = pending.slice(boundary + 1); } if (pending.length > 1_500_000) throw new Error("Unexpectedly large lesson response."); } pending += decoder.decode(); handle(pending); }
      finally { reader.releaseLock(); }
      if (!gotDraft) throw new Error("Processing ended without a validated draft. No success was assumed.");
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Tracking/compilation failed."); }
    finally { if (!controller.signal.aborted) { setBusy(false); latch.current = false; } }
  }
  return <main className="teach-workspace mx-auto max-w-4xl space-y-6 p-6 text-slate-950">
    <h1 className="text-3xl font-bold">Teach StepLint</h1>
    <p>Record a short lesson, let AI identify and track its components, then review and save the suggested procedure. This is batch processing; it does not check your actions live.</p>
    {!unlocked ? <section className="space-y-3 rounded border p-4"><h2 className="text-xl font-bold">Private teaching workspace</h2><p>Your workspace access code protects paid processing. It is separate from the model API key.</p><label>Access code <input type="password" autoComplete="current-password" value={access} onChange={(e) => setAccess(e.target.value)} /></label><button onClick={() => void unlock()}>Unlock Teach</button></section> : <>
      {!prepared && <LessonCapture onPrepared={acceptPrepared} />}
      {prepared && <section className="space-y-3 rounded border p-4"><h2 className="text-xl font-bold">2. Preview and confirm your lesson</h2><video controls playsInline src={url} className="w-full" /><p>{prepared.media.info.durationSeconds.toFixed(2)} seconds; MP4 {(prepared.video.size / 1_000_000).toFixed(2)} MB; WAV {(prepared.audio.size / 1_000_000).toFixed(2)} MB. Format: {prepared.media.info.mime}.</p>
        {!lesson && <><p>Transcription estimate: ${(prepared.media.info.durationSeconds * 0.18 / 3600).toFixed(4)}. The video uploads once and is deleted after processing/discard, with a requested one-hour expiration as fallback.</p><label className="flex gap-2"><input type="checkbox" disabled={busy} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I previewed this lesson and approve its upload and one Muse Voice transcription request.{automatic ? " I also approve automatic analysis: two Muse Spark requests and one SAM 3.1 tracking request, with no automatic retries." : " I will choose components before approving tracking and drafting."}</label><details><summary>Processing options</summary><label className="flex gap-2"><input type="checkbox" disabled={busy} checked={!automatic} onChange={(e) => { setAutomatic(!e.target.checked); setConfirmed(false); }} />Choose component marks manually instead of automatic analysis</label></details><p>{automatic ? `SAM estimate: $${(prepared.media.frameTimesMs.length * .20 / 1000).toFixed(4)}. Two Spark calls add video/text processing with up to 7,944 output tokens total; total cost varies.` : "Manual marks use one SAM and one Spark request after separate confirmation."}</p><button disabled={!confirmed || busy} onClick={() => void upload()}>Confirm lesson and upload</button></>}
        <p><a className="underline" href={url} download={`steplint-lesson-${lesson?.lessonId ?? "local"}.mp4`}>Save lesson video on this device</a> if you want to retain source evidence after temporary server files are deleted.</p>
        <button onClick={() => void discard()}>Discard lesson</button>
      </section>}
      {lesson && <section className="space-y-3 rounded border p-4"><h2 className="text-xl font-bold">Transcript and source times</h2><p>{lesson.transcript.text}</p><ol className="list-decimal pl-5">{lesson.transcript.turns.map((turn, index) => <li key={index}>{(turn.startMs / 1000).toFixed(2)}–{(turn.endMs / 1000).toFixed(2)} s: {turn.text}</li>)}</ol><p>These are model-provided speech-turn times, not word timestamps or proof of an action.</p></section>}
      {lesson && prepared && !result && uploadToken && <ComponentPicker lesson={lesson} video={prepared.video} busy={busy} onCompile={(selections) => void compile(selections)} onAutomatic={() => void compile()} />}
      {result && prepared && <Review initial={result.draft} context={result.context} token={result.token} video={prepared.video} />}
    </>}
    {status && <p role="status" aria-live="polite">{status}</p>}{error && <p role="alert" className="text-red-800">{error}</p>}
  </main>;
}
