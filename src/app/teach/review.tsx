"use client";
import { readAppJson } from "@/teach/api-response";
import { ApprovedArtifactSchema } from "@/teach/approved-artifact";
import FeedbackPopup, { useFeedback } from "@/components/feedback";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { approveDraft, validateDraft, type TeachContext, type TeachDraft, type Region } from "@/teach/schema";
import { suggestReviews, keyFrames, reviewBlockers, reviewErrorMessage, type SuggestedCheck } from "@/teach/review-suggestions";
import { frameImage } from "@/teach/media";
import FrameMark from "./frame-mark";

type Check = SuggestedCheck;
function RegionEditor({ video, timestamp, width, height, title, region, onRegion }: { video: Blob; timestamp: number; width: number; height: number; title: string; region: Region | null; onRegion: (region: Region) => void }) {
  const [image, setImage] = useState<{ timestamp: number; url: string } | null>(null);
  useEffect(() => { let active = true; void frameImage(video, timestamp).then((image) => { if (active) setImage({ timestamp, url: image }); }).catch(() => { if (active) setImage(null); }); return () => { active = false; }; }, [video, timestamp]);
  return <div><p className="font-medium">{title} — {(timestamp / 1000).toFixed(3)} s. Drag to adjust or replace the zone.</p>{image?.timestamp === timestamp ? <FrameMark image={image.url} width={width} height={height} mode="box" mark={region ? { kind: "box", left: region.left * width, top: region.top * height, right: region.right * width, bottom: region.bottom * height } : null} onMark={(mark) => { if (mark.kind === "box") onRegion({ left: mark.left / width, top: mark.top / height, right: mark.right / width, bottom: mark.bottom / height }); }} /> : <p>Frame preview unavailable. Do not approve without checking the source.</p>}</div>;
}
function SupportingFrames({ video, context, frames, componentId, componentName }: { video: Blob; context: TeachContext; frames: number[]; componentId: string; componentName?: string }) {
  const [loaded, setLoaded] = useState<{ key: string; images: string[] } | null>(null);
  const key = JSON.stringify(frames);
  useEffect(() => { let active = true; void Promise.all(frames.map((frame) => frameImage(video, context.lesson.media.frameTimesMs[frame]))).then((images) => { if (active) setLoaded({ key, images }); }).catch(() => { if (active) setLoaded(null); }); return () => { active = false; }; }, [video, context, frames, key]);
  const size = context.lesson.media.info.video;
  if (!size) return null;
  return <div className="grid grid-cols-2 gap-2 md:grid-cols-3">{(loaded?.key === key ? loaded.images : []).map((image, index) => <figure key={frames[index]}><svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label={`Supporting frame ${frames[index]}`}><image href={image} width={size.width} height={size.height} />{context.tracking.filter((track) => track.componentId === componentId).map((track) => { const sample = track.samples.find((s) => s.frame === frames[index]); return sample && <g key={track.componentId}><rect x={sample.box.left * size.width} y={sample.box.top * size.height} width={(sample.box.right - sample.box.left) * size.width} height={(sample.box.bottom - sample.box.top) * size.height} fill="none" stroke="#facc15" strokeWidth={3} /><text x={sample.box.left * size.width + 3} y={Math.max(16, sample.box.top * size.height)} fill="#facc15" stroke="#000" strokeWidth={.3} fontSize={16}>{componentName ?? context.selections.find((s) => s.id === track.componentId)?.description}</text></g>; })}</svg><figcaption>{(context.lesson.media.frameTimesMs[frames[index]] / 1000).toFixed(2)} s — marked component</figcaption></figure>)}</div>;
}
export default function Review({ initial, context, token, video }: { initial: TeachDraft; context: TeachContext; token: string; video: Blob }) {
  const router = useRouter();
  const feedback = useFeedback();
  const [draft, setDraft] = useState(initial), [editor, setEditor] = useState(JSON.stringify(initial, null, 2));
  const [checks, setChecks] = useState<Record<string, Check>>(() => suggestReviews(initial, context));
  const [reviewer, setReviewer] = useState(""), [confirm, setConfirm] = useState(false);
  const [approved, setApproved] = useState<unknown>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const suggestions = useMemo(() => suggestReviews(draft, context), [draft, context]);
  const blockers = useMemo(() => reviewBlockers(draft, context, checks), [draft, context, checks]);
  const size = context.lesson.media.info.video;
  if (!size) return null;
  const dirty = editor !== JSON.stringify(draft, null, 2);
  function update(id: string, patch: Partial<Check>, fallback: Check) { setChecks({ ...checks, [id]: { ...(checks[id] ?? fallback), ...patch } }); setApproved(null); }
  function editWording(stepId: string, field: "instruction" | "component" | "recovery", value: string) {
    const next = structuredClone(draft), step = next.procedure.steps.find((s) => s.id === stepId);
    if (!step) return;
    if (field === "instruction") step.description = value;
    if (field === "recovery") step.recovery.instruction = value;
    if (field === "component") { const component = next.procedure.components.find((c) => c.id === step.condition.componentId); if (component) component.description = value; }
    setDraft(next); setEditor(JSON.stringify(next, null, 2)); setChecks(suggestReviews(next, context)); setConfirm(false); setApproved(null); setError("");
  }
  async function approve() {
    setError(""); setBusy(true);
    try {
      if (dirty) throw new Error("Apply edited draft changes before approval.");
      if (blockers.length) throw new Error(blockers[0]);
      const review = { reviewer, confirmed: confirm, steps: draft.procedure.steps.map((step) => ({ stepId: step.id, ...checks[step.id] })) };
      approveDraft(draft, review, context, Date.now()); // helpful local checks; server repeats all validation
      const response = await fetch("/api/teach/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, draft, review }) });
      const result = await readAppJson(response, "Approval");
      if (!ApprovedArtifactSchema.safeParse(result).success) throw new Error("Approval could not be confirmed: the server returned an incomplete lesson. Keep this draft open and try again.");
      setApproved(result); feedback.success("Lesson approved", "Save it to start Practice.");
    } catch (e) { const message = reviewErrorMessage(e); setError(message); feedback.failure(message); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5 rounded border p-4">
    <h2 className="text-2xl font-bold">4. Review the draft</h2>
    <p>Check the marked movements, confirm each step, then approve.</p><details><summary>What can be approved?</summary><p>Only clear, tracked start-to-target movement. Missing or uncertain evidence stays blocked. A mask alone does not prove an action.</p></details>
    <details><summary>Tracking details</summary><ul className="list-disc pl-5">{context.tracking.map((track) => <li key={track.componentId}>{context.selections.find((s) => s.id === track.componentId)?.description}: {track.samples.length} frames with decoded geometry, {track.missingFrames} without it. Missing geometry remains unverified.</li>)}</ul></details>
    {draft.procedure.steps.map((step) => {
      const note = draft.notes.find((n) => n.stepId === step.id);
      const track = context.tracking.find((t) => t.componentId === step.condition.componentId);
      const fallback: Check = suggestions[step.id];
      const check = checks[step.id] ?? fallback;
      const moments = keyFrames(context, track?.samples.map((s) => s.frame) ?? [], [check.fromFrame, check.toFrame, ...(note?.supportingFrames ?? [])]);
      const frameOptions = moments.map((frame) => <option key={frame} value={frame}>{(context.lesson.media.frameTimesMs[frame] / 1000).toFixed(2)} s{frame === check.fromFrame ? " — before" : frame === check.toFrame ? " — after" : " — reference"}</option>);
      return <article key={step.id} className="space-y-3 rounded border p-4">
        <h3 className="text-xl font-bold">{step.description}</h3>
        <details><summary>Edit wording</summary><div className="space-y-2 py-2"><label className="block">Component name <input aria-label={`Component name ${step.id}`} value={draft.procedure.components.find((c) => c.id === step.condition.componentId)?.description ?? ""} maxLength={100} onChange={(e) => editWording(step.id, "component", e.target.value)} /></label><label className="block">Step instruction <input aria-label={`Step instruction ${step.id}`} value={step.description} maxLength={2000} onChange={(e) => editWording(step.id, "instruction", e.target.value)} /></label><label className="block">Recovery message <input aria-label={`Recovery message ${step.id}`} value={step.recovery.instruction} maxLength={2000} onChange={(e) => editWording(step.id, "recovery", e.target.value)} /></label><p className="text-sm">Changes reset review.</p></div></details>
        <details><summary>Step details</summary><p>{note?.explanation}</p><p>Prerequisites: {step.prerequisites.join(", ") || "None"}. Rule: {step.condition.kind}, {step.condition.fromZone} → {step.condition.toZone}; minimum confidence {step.condition.minimumConfidence}.</p></details>
        <p className="text-sm">Reference: {(step.source.timestampMs / 1000).toFixed(2)} s</p>
        {note && <SupportingFrames video={video} context={context} componentId={step.condition.componentId} componentName={draft.procedure.components.find((c) => c.id === step.condition.componentId)?.description} frames={keyFrames(context, note.supportingFrames, [check.fromFrame, check.toFrame])} />}
        <p>Recovery: {step.recovery.instruction} ({(step.recovery.source.timestampMs / 1000).toFixed(3)} s)</p>
        <details><summary>Error cases and uncertainty</summary><p className="font-semibold">Candidate error cases</p><ul className="list-disc pl-5">{note?.candidateErrors.map((item, i) => <li key={i}>{item}</li>)}</ul>
        <p className="font-semibold">Uncertainty requiring your review</p><ul className="list-disc pl-5">{note?.uncertainties.map((item, i) => <li key={i}>{item}</li>)}</ul></details>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label>Before moment <select aria-label={`Before frame ${step.id}`} value={check.fromFrame} onChange={(e) => update(step.id, { fromFrame: Number(e.target.value), fromRegion: null, conditionConfirmed: false }, fallback)}>{frameOptions}</select></label><RegionEditor video={video} timestamp={context.lesson.media.frameTimesMs[check.fromFrame]} width={size.width} height={size.height} title="Starting zone" region={check.fromRegion} onRegion={(region) => update(step.id, { fromRegion: region, conditionConfirmed: false }, fallback)} /></div>
          <div><label>After moment <select aria-label={`After frame ${step.id}`} value={check.toFrame} onChange={(e) => update(step.id, { toFrame: Number(e.target.value), toRegion: null, conditionConfirmed: false }, fallback)}>{frameOptions}</select></label><RegionEditor video={video} timestamp={context.lesson.media.frameTimesMs[check.toFrame]} width={size.width} height={size.height} title="Target zone" region={check.toRegion} onRegion={(region) => update(step.id, { toRegion: region, conditionConfirmed: false }, fallback)} /></div>
        </div>
        {(!check.fromRegion || !check.toRegion) && <div role="status" className="space-y-2 rounded border border-amber-400 bg-amber-50 p-3"><p>Needs clearer movement evidence. Select two tracked moments and draw separate zones, or revise the step. Uncertain tracking cannot be approved.</p><button onClick={() => { const next = suggestReviews(draft, context)[step.id]; update(step.id, next, fallback); setError(next.fromRegion && next.toRegion ? "" : "No clear, continuously tracked movement meets this step's rule. Choose a supported interval, revise the step, or record a clearer demonstration; no extra model request was made."); }}>Recheck suggested zones for step {draft.procedure.steps.indexOf(step) + 1}</button></div>}
        <label className="flex gap-2"><input type="checkbox" checked={check.reviewed} onChange={(e) => update(step.id, { reviewed: e.target.checked }, fallback)} />I reviewed this step and its rules.</label>
        <label className="flex gap-2"><input type="checkbox" disabled={!check.fromRegion || !check.toRegion} checked={check.conditionConfirmed} onChange={(e) => update(step.id, { conditionConfirmed: e.target.checked }, fallback)} />I checked the marks and can see this zone entry.</label>
      </article>;
    })}
    <details><summary>Advanced rule editor</summary><p>Changes reset review. Keep approval null; component IDs and source frames must match the lesson.</p><textarea className="h-96 w-full border p-2 font-mono text-sm" aria-label="Draft JSON" value={editor} onChange={(e) => { setEditor(e.target.value); setApproved(null); setChecks({}); setConfirm(false); }} /><button onClick={() => { try { const input: unknown = JSON.parse(editor); const next = validateDraft(input, context); setDraft(next); setEditor(JSON.stringify(next, null, 2)); setChecks(suggestReviews(next, context)); setConfirm(false); setError(""); } catch (e) { const message = reviewErrorMessage(e); setError(message); feedback.failure(message); } }}>Apply edited draft</button></details>
    <label>Your reviewer name <input value={reviewer} maxLength={100} onChange={(e) => { setReviewer(e.target.value); setApproved(null); }} /></label>
    <label className="flex gap-2"><input type="checkbox" checked={confirm} onChange={(e) => { setConfirm(e.target.checked); setApproved(null); }} />I approve this procedure and its visible conditions.</label>
    {blockers.length > 0 && <div id="approval-readiness" role="status" className="rounded border border-amber-400 bg-amber-50 p-4"><h3 className="font-bold">Finish these checks to enable approval</h3><ul className="list-disc pl-5">{blockers.map((message, index) => <li key={index}>{message}</li>)}</ul></div>}
    <button aria-describedby={blockers.length ? "approval-readiness" : undefined} disabled={busy || dirty || !confirm || !reviewer.trim() || blockers.length > 0} onClick={() => void approve()}>Approve procedure</button>
    {error && <p role="alert" className="whitespace-pre-wrap text-red-800">{error}</p>}
    <FeedbackPopup notice={feedback.notice} onClose={feedback.close} />
    {approved !== null && <div role="status"><p className="font-bold">Procedure approved. Save and open Practice, or download a copy.</p><button onClick={() => { try { const text = JSON.stringify(approved); if (text.length > 1_500_000) throw new Error("Use the downloaded export: this lesson is too large for quick handoff."); sessionStorage.setItem("steplint-approved-handoff", text); router.push("/practice"); } catch (e) { setError(e instanceof Error ? e.message : "Save failed. Download the approved export instead."); } }}>Save and open Practice</button><a className="underline" onClick={() => feedback.success("Download requested")} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(approved, null, 2))}`} download="steplint-approved-lesson.json">Download approved procedure and zone mappings</a></div>}
  </section>;
}
