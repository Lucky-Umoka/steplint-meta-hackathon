"use client";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { demoProcedure } from "@/procedure/demo";
import { ProcedureSpecSchema, type VerificationResult } from "@/procedure/schema";
import { verifyEvents } from "@/procedure/verifier";
import { PracticeLessonSchema, type PracticeLesson } from "@/practice/lesson";
import { controlSession, createSession, feedDetection, type PracticeSession, type ZoneBinding } from "@/practice/pipeline";
import { groundColour, trackColour, type ColourProfile, type Detection, type Pixels, type Point } from "@/practice/tracker";
import { inspectLessonVideo } from "@/teach/media";
import { useCamera } from "./use-camera";
import Reference from "./reference";
const fixtureZones: ZoneBinding[] = [
  { zoneId: "staging", region: { left: .02, top: .05, right: .44, bottom: .95 } },
  { zoneId: "base-target", region: { left: .55, top: .05, right: .95, bottom: .3 } },
  { zoneId: "support-target", region: { left: .55, top: .36, right: .95, bottom: .62 } },
  { zoneId: "latch-closed", region: { left: .55, top: .69, right: .95, bottom: .95 } },
];
export default function Practice() {
  const [lesson, setLesson] = useState<PracticeLesson | null>(null), [reviewer, setReviewer] = useState(""), [fixtureReviewed, setFixtureReviewed] = useState(false);
  const [bindings, setBindings] = useState<ZoneBinding[]>([]), [profiles, setProfiles] = useState<ColourProfile[]>([]);
  const [selection, setSelection] = useState(""), [mode, setMode] = useState<"component" | "zone">("component");
  const [result, setResult] = useState<VerificationResult | null>(null), [running, setRunning] = useState(false), [error, setError] = useState("");
  const [detections, setDetections] = useState<Detection[]>([]), [speech, setSpeech] = useState(false), [speechError, setSpeechError] = useState("");
  const [reference, setReference] = useState<File | null>(null), [sourceConfirmed, setSourceConfirmed] = useState(false), [sourceCandidate, setSourceCandidate] = useState<File | null>(null);
  const [latencies, setLatencies] = useState<{ eventId: string; milliseconds: number }[]>([]), [workbenchConfirmed, setWorkbenchConfirmed] = useState(false);
  const session = useRef<PracticeSession | null>(null), latestPixels = useRef<Pixels | null>(null), drag = useRef<Point | null>(null);
  const lastWarningId = useRef("");
  const pendingWarning = useRef<{ id: string; at: number } | null>(null), lastSpoken = useRef("");
  function speak(text: string) {
    if (!speech) return;
    if (!("speechSynthesis" in window)) { setSpeechError("Speech is unsupported; follow the displayed instructions."); return; }
    window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text);
    utterance.onerror = () => setSpeechError("Speech could not play. Follow the displayed instructions.");
    window.speechSynthesis.speak(utterance);
  }
  function updateResult(next: VerificationResult, detectedAt: number) {
    const failure = next.events.findLast((e) => e.status === "failed");
    if (failure && failure.eventId !== lastWarningId.current) { pendingWarning.current = { id: failure.eventId, at: detectedAt }; lastWarningId.current = failure.eventId; }
    setResult(next);
    const last = next.events.at(-1);
    if (last?.status === "failed" && last.recovery && last.eventId !== lastSpoken.current) { lastSpoken.current = last.eventId; speak(last.recovery.instruction); }
  }
  function lost(reason: string) {
    if (session.current && running && !session.current.stopped) {
      for (const component of session.current.procedure.steps) {
        const next = feedDetection(session.current, { componentId: component.condition.componentId, quality: "missing", center: null, score: null, reason }, performance.now());
        if (next.result) setResult(next.result);
      }
    }
    latestPixels.current = null;
    setRunning(false); setProfiles([]); setWorkbenchConfirmed(false); setError(reason); if (session.current) session.current.stopped = true;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }
  function frame(pixels: Pixels, now: number) {
    latestPixels.current = pixels;
    const found = profiles.map((p) => trackColour(pixels, p)); setDetections(found);
    if (!running || !session.current) return;
    try {
      for (const detection of found) {
        const next = feedDetection(session.current, detection, now);
        if (next.result) updateResult(next.result, next.detectedAtMs);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Tracking failed."); setRunning(false); }
  }
  const { video: cameraVideo, canvas: cameraCanvas, active: cameraActive, requesting: cameraRequesting, error: cameraError, start: startCamera, stop: stopCamera } = useCamera(frame, lost);
  useEffect(() => {
    const pending = pendingWarning.current;
    if (!pending || !result) return;
    // Two animation callbacks measure through a rendered warning, not just inference time.
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => { setLatencies((items) => items.some((i) => i.eventId === pending.id) ? items : [...items, { eventId: pending.id, milliseconds: Math.round(performance.now() - pending.at) }]); if (pendingWarning.current?.id === pending.id) pendingWarning.current = null; }); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [result]);
  useEffect(() => () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);
  function choose(next: PracticeLesson) {
    lastWarningId.current = ""; pendingWarning.current = null; lastSpoken.current = "";
    stopCamera(); session.current = null; setRunning(false); setLesson(next); setBindings(next.zoneBindings); setProfiles([]); setDetections([]); setResult(verifyEvents(next.procedure, [])); setSelection(next.procedure.steps[0].condition.componentId); setMode("component"); setError(""); setReference(null); setSourceCandidate(null); setSourceConfirmed(false); setWorkbenchConfirmed(false); setLatencies([]);
  }
  async function importLesson(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1_500_000) throw new Error("Lesson export exceeds 1.5 MB.");
      const body = await file.text(); JSON.parse(body);
      const response = await fetch("/api/teach/practice-lesson", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!response.ok) throw new Error(response.status === 401 ? "Unlock Teach in this browser first. Approval receipts require the original approving session; reopen and approve in Teach if expired." : "Export could not be validated. Use an unchanged approved Teach export in its approving session.");
      choose(PracticeLessonSchema.parse(await response.json()));
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid lesson."); }
  }
  const loadSavedLesson = useEffectEvent(async () => {
    try {
      const saved = sessionStorage.getItem("steplint-approved-handoff");
      if (!saved) return;
      sessionStorage.removeItem("steplint-approved-handoff");
      await importLesson(new File([saved], "steplint-approved-lesson.json", { type: "application/json" }));
    } catch { setError("Saved lesson could not be opened. Import your downloaded approved export."); }
  });
  useEffect(() => { const frame = requestAnimationFrame(() => { void loadSavedLesson(); }); return () => cancelAnimationFrame(frame); }, []);
  function position(event: React.PointerEvent<SVGSVGElement>): Point { const r = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(.999, (event.clientX - r.left) / r.width)), y: Math.max(0, Math.min(.999, (event.clientY - r.top) / r.height)) }; }
  function mark(event: React.PointerEvent<SVGSVGElement>) {
    const first = drag.current, last = position(event); drag.current = null;
    if (running || !cameraActive || !selection) return;
    try {
      if (mode === "component" && latestPixels.current) {
        const profile = groundColour(latestPixels.current, selection, last, profiles); setProfiles([...profiles.filter((p) => p.componentId !== selection), profile]);
      } else if (mode === "zone" && first && Math.abs(first.x - last.x) > .03 && Math.abs(first.y - last.y) > .03) {
        setBindings([...bindings.filter((b) => b.zoneId !== selection), { zoneId: selection, region: { left: Math.min(first.x, last.x), top: Math.min(first.y, last.y), right: Math.max(first.x, last.x), bottom: Math.max(first.y, last.y) } }]);
      }
      setWorkbenchConfirmed(false); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Calibration failed."); }
  }
  function begin() {
    try {
      if (!lesson || !cameraActive || !workbenchConfirmed || profiles.length !== lesson.procedure.steps.length) throw new Error("Start the camera, ground all components and confirm calibration first.");
      const found = profiles.map((p) => trackColour(latestPixels.current!, p));
      if (found.some((d) => d.quality !== "observed")) throw new Error("Cannot verify: restore every component before beginning.");
      lastWarningId.current = ""; pendingWarning.current = null; lastSpoken.current = "";
      session.current = createSession(lesson.procedure, bindings); setResult(verifyEvents(lesson.procedure, [])); setRunning(true); setError(""); setLatencies([]); speak(lesson.procedure.steps[0].description);
    } catch (e) { setError(e instanceof Error ? e.message : "Cannot begin."); }
  }
  const failure = result?.steps.some((s) => s.status === "failed") ? result.events.findLast((e) => e.status === "failed") : null;
  const current = lesson?.procedure.steps.find((_, i) => result?.steps[i]?.status !== "passed");
  const cannotVerify = !running || result?.status === "needs_verification" || detections.some((d) => d.quality !== "observed");
  const referenceSource = failure?.recovery?.source ?? current?.source ?? lesson?.procedure.steps.at(-1)?.source ?? null;
  const canRetry = running;
  return <main className="teach-workspace mx-auto max-w-6xl space-y-6 p-5 text-slate-900">
    <Link href="/">← StepLint</Link><h1 className="text-3xl font-bold">Practice a reviewed procedure</h1>
    <p>Controlled, distinctive colour markers and visible zone entry only. Keep the camera fixed. This does not detect hidden latch states, torque, force, soldering quality or arbitrary hand gestures. Camera frames stay on this device; no remote inference runs in Practice.</p>
    <section className="space-y-3 rounded border p-4"><h2 className="text-xl font-bold">1. Select an approved procedure</h2>
      <label className="block">Import approved Teach export <input type="file" accept="application/json,.json" disabled={running} onChange={(e) => void importLesson(e.target.files?.[0])} /></label><p>Unlock <a href="/teach" className="underline">Teach</a> in this browser first. Imported approval receipts are checked server-side; edited exports must be reviewed again.</p>
      <details><summary>Review the hand-authored blue / yellow / red fixture</summary><p>This is a controlled test fixture, not a Meta-generated or previously approved real lesson.</p><ol className="list-decimal pl-6">{demoProcedure.steps.map((s) => <li key={s.id}>{s.description} Observable condition: {s.condition.fromZone} → {s.condition.toZone}. Prerequisites: {s.prerequisites.join(", ") || "none"}. Recovery: {s.recovery.instruction}</li>)}</ol><p>The red latch transition is forbidden until install-support is verified. Use a visible red marker moving between open and closed zones; its colour alone proves no mechanical state.</p>
      <label>Reviewer name <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} maxLength={100} /></label><label className="flex gap-2"><input type="checkbox" checked={fixtureReviewed} onChange={(e) => setFixtureReviewed(e.target.checked)} />I reviewed the fixture rules and approve them for my controlled demonstration.</label><button disabled={running || !reviewer.trim() || !fixtureReviewed} onClick={() => choose({ procedure: ProcedureSpecSchema.parse({ ...demoProcedure, approval: { reviewer: reviewer.trim(), timestampMs: Date.now() } }), zoneBindings: fixtureZones, sourceLesson: null, origin: "controlled-fixture" })}>Use reviewed controlled fixture</button></details>
      {lesson && <p className="font-semibold">Selected: {lesson.procedure.title} — approved by {lesson.procedure.approval?.reviewer}. Source: {lesson.origin}.</p>}
    </section>
    <section className="space-y-3 rounded border p-4"><h2 className="text-xl font-bold">2. Camera and calibration</h2>
      <button disabled={!lesson || cameraActive || cameraRequesting} onClick={() => void startCamera()}>Start camera</button> <button disabled={!cameraActive && !cameraRequesting} onClick={() => { lost("Camera stopped. Recalibrate before a new session."); stopCamera(); }}>Stop camera</button>
      <p role="status" className="font-bold">{cameraActive ? "● CAMERA ON — local preview" : cameraRequesting ? "Waiting for camera permission — Cancel with Stop camera" : "Camera off"} · {running ? "PRACTICE ACTIVE" : "Calibration / paused"}</p>
      {cameraError && <p role="alert">{cameraError}</p>}
      <video ref={cameraVideo} muted playsInline className="hidden" />
      <div className="relative max-w-3xl bg-slate-950"><canvas ref={cameraCanvas} width={160} height={120} className="block w-full" aria-label="Live local workbench preview" /><svg viewBox="0 0 160 120" role="img" aria-label="Practice workbench calibration" className="absolute inset-0 h-full w-full touch-none" onPointerDown={(e) => { if (!running) { e.currentTarget.setPointerCapture(e.pointerId); drag.current = position(e); } }} onPointerUp={mark}>
        {bindings.map(({ zoneId, region: r }) => <g key={zoneId}><rect x={r.left * 160} y={r.top * 120} width={(r.right - r.left) * 160} height={(r.bottom - r.top) * 120} fill="#38bdf8" fillOpacity={.06} stroke="#fff" strokeWidth={.5} /><text x={r.left * 160 + 1} y={r.top * 120 + 4} fill="white" stroke="black" strokeWidth={.15} fontSize={3.5}>{zoneId}</text></g>)}
        {detections.map((d) => d.center && <circle key={d.componentId} cx={d.center.x * 160} cy={d.center.y * 120} r={2} fill="#22c55e" stroke="black" strokeWidth={.5} />)}
      </svg></div>
      {lesson && <><label>Calibration tool <select disabled={running} value={mode} onChange={(e) => { const next = e.target.value as "component" | "zone"; setMode(next); setSelection(next === "component" ? lesson.procedure.steps[0].condition.componentId : lesson.procedure.zones[0].id); }}><option value="component">Ground component colour</option><option value="zone">Draw workbench zone</option></select></label><label>{mode === "component" ? "Component" : "Zone"}<select aria-label={mode === "component" ? "Component" : "Zone"} disabled={running} value={selection} onChange={(e) => setSelection(e.target.value)}>{(mode === "component" ? lesson.procedure.components.filter((c) => lesson.procedure.steps.some((s) => s.condition.componentId === c.id)) : lesson.procedure.zones).map((x) => <option key={x.id} value={x.id}>{x.id} — {x.description}</option>)}</select></label>
      <p>{mode === "component" ? "Click the solid colour centre of each stationary component. Keep all parts fully visible; avoid similarly coloured tools or clothes." : "Drag to map the selected approved zone into this fixed workbench. Rule IDs and ordering stay unchanged."} Calibration changes require a new session.</p>
      <ul>{lesson.procedure.steps.map((s) => <li key={s.id}>{s.condition.componentId}: {profiles.some((p) => p.componentId === s.condition.componentId) ? "grounded" : "not grounded"} — {detections.find((d) => d.componentId === s.condition.componentId)?.quality ?? "unknown"}</li>)}</ul>
      <label className="flex gap-2"><input type="checkbox" disabled={running} checked={workbenchConfirmed} onChange={(e) => setWorkbenchConfirmed(e.target.checked)} />I checked all component identities and zone labels, fixed the camera, and will begin with components in their starting zones.</label><button disabled={running || !cameraActive || !workbenchConfirmed} onClick={begin}>Begin verification</button></>}
    </section>
    {error && <p role="alert" className="rounded border border-red-600 bg-red-50 p-4 text-red-900">{error}</p>}
    {failure && <section role="alert" aria-label="Rule violation" className="rounded border-2 border-red-700 bg-red-100 p-4 text-red-950"><h2 className="text-2xl font-bold">Rule violation</h2><p>{failure.reason}</p><p>Missing prerequisites: {failure.missingPrerequisites.join(", ")}</p><p className="font-bold">{failure.recovery?.instruction}</p><button disabled={!canRetry} onClick={() => { if (session.current && failure.stepId) updateResult(controlSession(session.current, "retry", performance.now(), failure.stepId), performance.now()); }}>Retry failed step — fresh start evidence required</button></section>}
    <section className="grid gap-4 md:grid-cols-2"><div className="space-y-4 rounded border p-4"><h2 className="text-xl font-bold">Current step</h2><p role="status" className="text-xl font-bold">{failure ? "STOP — correct the rule violation" : cannotVerify ? "Cannot Verify" : result?.status === "passed" ? "All observable steps verified" : "Observing — hold each position steady"}</p><p>{current?.description ?? (lesson ? "Procedure complete for supported visible conditions." : "Select a procedure.")}</p>{cannotVerify && <p>Restore visibility, resolve ambiguity or return the part to its starting zone and repeat. Presence in a target alone will not pass.</p>}<ul>{detections.filter((d) => d.quality !== "observed").map((d) => <li key={d.componentId}>{d.componentId}: {d.reason}</li>)}</ul>
      <label className="flex gap-2"><input type="checkbox" checked={speech} onChange={(e) => { setSpeech(e.target.checked); if (!e.target.checked && "speechSynthesis" in window) window.speechSynthesis.cancel(); }} />Speak approved instructions and corrections</label><button disabled={!current || !speech} onClick={() => current && speak(current.description)}>Read current instruction</button>{speechError && <p role="status">{speechError}</p>}
      <button disabled={!lesson || !cameraActive} onClick={() => { if (session.current) setResult(controlSession(session.current, "reset", performance.now())); setRunning(false); if (session.current) session.current.stopped = true; setWorkbenchConfirmed(false); setLatencies([]); if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }}>Reset progress and pause</button><p>Download the session log before beginning another session. Reset requires starting positions and calibration confirmation again. Retry clears the failed step and downstream progress; it cannot mark a step passed.</p>
      <h2 className="text-xl font-bold">Checklist</h2><ol className="list-decimal pl-5">{lesson?.procedure.steps.map((s, i) => <li key={s.id}>{s.description} — <strong>{result?.steps[i]?.status ?? "pending"}</strong></li>)}</ol></div>
      <div className="space-y-4"><label className="block">Original teaching MP4 (stays local)<input type="file" accept="video/mp4,.mp4" disabled={!lesson?.sourceLesson} onChange={(e) => { const file = e.target.files?.[0]; setReference(null); setSourceConfirmed(false); setSourceCandidate(null); if (!file || !lesson?.sourceLesson) return; const source = lesson.sourceLesson; void inspectLessonVideo(file).then((media) => { if (file.size !== source.media.info.bytes || Math.abs(media.info.durationSeconds - source.media.info.durationSeconds) > .1) throw new Error("Source video does not match approved lesson size/duration."); setSourceCandidate(file); }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Invalid reference video")); }} /></label><label className="flex gap-2"><input type="checkbox" disabled={!sourceCandidate} checked={sourceConfirmed} onChange={(e) => { setSourceConfirmed(e.target.checked); setReference(e.target.checked ? sourceCandidate : null); }} />I confirm this is the unchanged original teaching video for this lesson.</label><Reference file={reference} source={referenceSource} /></div>
    </section>
    <section className="rounded border p-4"><h2 className="text-xl font-bold">Warning latency</h2><p>Measured from first target-zone candidate detection through debounce, evaluator and a rendered warning (two animation callbacks). Not physical-action onset or a remote-model benchmark.</p>{latencies.length ? <ul>{latencies.map((l) => <li key={l.eventId}>{l.eventId}: {l.milliseconds} ms detected change → displayed warning</li>)}</ul> : <p>No warning latency measured yet.</p>}</section>
    <section className="rounded border p-4"><h2 className="text-xl font-bold">Timestamped event timeline</h2><p>Times use the browser monotonic clock. Only local structured events are retained; camera frames are not stored. Session limit: 9,500 observations, then pause/reset.</p><button disabled={!result} onClick={() => {
      if (!session.current) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify({ procedure: lesson?.procedure, bindings, inputs: session.current.events, result, latencies }, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "steplint-practice-events.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>Download session log and latency</button><ol className="max-h-80 overflow-auto">{result?.events.slice(-100).reverse().map((e, i) => <li key={`${e.eventId}-${i}`} className="border-b py-2">{(e.timestampMs / 1000).toFixed(3)}s · {e.stepId ?? "session"} · {e.status}: {e.reason}</li>)}</ol></section>
  </main>;
}
