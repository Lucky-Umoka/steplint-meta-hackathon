"use client";
import { useEffect, useState } from "react";
import { approveDraft, validateDraft, type TeachContext, type TeachDraft, type Region } from "@/teach/schema";
import { frameImage } from "@/teach/media";
import FrameMark from "./frame-mark";

type Check = { reviewed: boolean; conditionConfirmed: boolean; fromFrame: number; toFrame: number; fromRegion: Region | null; toRegion: Region | null };
function RegionEditor({ video, timestamp, width, height, title, region, onRegion }: { video: Blob; timestamp: number; width: number; height: number; title: string; region: Region | null; onRegion: (region: Region) => void }) {
  const [image, setImage] = useState<{ timestamp: number; url: string } | null>(null);
  useEffect(() => { let active = true; void frameImage(video, timestamp).then((image) => { if (active) setImage({ timestamp, url: image }); }).catch(() => { if (active) setImage(null); }); return () => { active = false; }; }, [video, timestamp]);
  return <div><p className="font-medium">{title} — {(timestamp / 1000).toFixed(3)} s. Drag the zone boundary.</p>{image?.timestamp === timestamp ? <FrameMark image={image.url} width={width} height={height} mode="box" mark={region ? { kind: "box", left: region.left * width, top: region.top * height, right: region.right * width, bottom: region.bottom * height } : null} onMark={(mark) => { if (mark.kind === "box") onRegion({ left: mark.left / width, top: mark.top / height, right: mark.right / width, bottom: mark.bottom / height }); }} /> : <p>Frame preview unavailable. Do not approve without checking the source.</p>}</div>;
}
function SupportingFrames({ video, context, frames }: { video: Blob; context: TeachContext; frames: number[] }) {
  const [loaded, setLoaded] = useState<{ key: string; images: string[] } | null>(null);
  const key = JSON.stringify(frames);
  useEffect(() => { let active = true; void Promise.all(frames.map((frame) => frameImage(video, context.lesson.media.frameTimesMs[frame]))).then((images) => { if (active) setLoaded({ key, images }); }).catch(() => { if (active) setLoaded(null); }); return () => { active = false; }; }, [video, context, frames, key]);
  const size = context.lesson.media.info.video;
  if (!size) return null;
  return <div className="grid grid-cols-2 gap-2 md:grid-cols-3">{(loaded?.key === key ? loaded.images : []).map((image, index) => <figure key={frames[index]}><svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label={`Supporting frame ${frames[index]}`}><image href={image} width={size.width} height={size.height} /></svg><figcaption>Frame {frames[index]} — {(context.lesson.media.frameTimesMs[frames[index]] / 1000).toFixed(3)} s</figcaption></figure>)}</div>;
}
export default function Review({ initial, context, token, video }: { initial: TeachDraft; context: TeachContext; token: string; video: Blob }) {
  const [draft, setDraft] = useState(initial), [editor, setEditor] = useState(JSON.stringify(initial, null, 2));
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [reviewer, setReviewer] = useState(""), [confirm, setConfirm] = useState(false);
  const [approved, setApproved] = useState<unknown>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const size = context.lesson.media.info.video;
  if (!size) return null;
  const dirty = editor !== JSON.stringify(draft, null, 2);
  function update(id: string, patch: Partial<Check>, fallback: Check) { setChecks({ ...checks, [id]: { ...(checks[id] ?? fallback), ...patch } }); setApproved(null); }
  async function approve() {
    setError(""); setBusy(true);
    try {
      if (dirty) throw new Error("Apply edited draft changes before approval.");
      const review = { reviewer, confirmed: confirm, steps: draft.procedure.steps.map((step) => ({ stepId: step.id, ...checks[step.id] })) };
      approveDraft(draft, review, context, Date.now()); // helpful local checks; server repeats all validation
      const response = await fetch("/api/teach/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, draft, review }) });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error("Server could not approve this draft. Check evidence, review fields, or session expiration.");
      setApproved(result);
    } catch (e) { setError(e instanceof Error ? e.message : "Approval failed."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5 rounded border p-4">
    <h2 className="text-2xl font-bold">4. Review the draft</h2>
    <p className="font-medium">DRAFT — not executable. Masks and narration do not prove an action. Approve only the zone-entry conditions you can support; edit or remove unsupported actions.</p>
    <p>Each step needs a clear tracked interval with confidence meeting its rule and no missing frames. Draw a starting zone and a target zone: the component center must start outside the target, then enter it. This maps a controlled visible movement; it does not prove mechanical installation or safety.</p>
    <ul className="list-disc pl-5">{context.tracking.map((track) => <li key={track.componentId}>{context.selections.find((s) => s.id === track.componentId)?.description}: {track.samples.length} frames with decoded geometry, {track.missingFrames} without it. Missing geometry remains unverified.</li>)}</ul>
    {draft.procedure.steps.map((step) => {
      const note = draft.notes.find((n) => n.stepId === step.id);
      const track = context.tracking.find((t) => t.componentId === step.condition.componentId);
      const fallback: Check = { reviewed: false, conditionConfirmed: false, fromFrame: track?.samples[0]?.frame ?? 0, toFrame: track?.samples.at(-1)?.frame ?? 0, fromRegion: null, toRegion: null };
      const check = checks[step.id] ?? fallback;
      const frameOptions = track?.samples.map((s) => <option key={s.frame} value={s.frame}>{s.frame} — {(s.timestampMs / 1000).toFixed(3)} s</option>);
      return <article key={step.id} className="space-y-3 rounded border p-4">
        <h3 className="text-xl font-bold">{step.description}</h3>
        <p>{note?.explanation}</p><p>Prerequisites: {step.prerequisites.join(", ") || "None"}. Rule: {step.condition.kind}, {step.condition.fromZone} → {step.condition.toZone}; minimum confidence {step.condition.minimumConfidence}.</p>
        <p>Teaching reference: {(step.source.timestampMs / 1000).toFixed(3)} s. Supporting frames: {note?.supportingFrames.join(", ")}. Missing tracked frames: {track?.missingFrames ?? "unknown"}.</p>
        {note && <SupportingFrames video={video} context={context} frames={note.supportingFrames} />}
        <p>Recovery: {step.recovery.instruction} ({(step.recovery.source.timestampMs / 1000).toFixed(3)} s)</p>
        <p className="font-semibold">Candidate error cases — review these rules</p><ul className="list-disc pl-5">{note?.candidateErrors.map((item, i) => <li key={i}>{item}</li>)}</ul>
        <p className="font-semibold">Uncertainty requiring your review</p><ul className="list-disc pl-5">{note?.uncertainties.map((item, i) => <li key={i}>{item}</li>)}</ul>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label>Before frame <select aria-label={`Before frame ${step.id}`} value={check.fromFrame} onChange={(e) => update(step.id, { fromFrame: Number(e.target.value), fromRegion: null, conditionConfirmed: false }, fallback)}>{frameOptions}</select></label><RegionEditor video={video} timestamp={context.lesson.media.frameTimesMs[check.fromFrame]} width={size.width} height={size.height} title="Starting zone" region={check.fromRegion} onRegion={(region) => update(step.id, { fromRegion: region, conditionConfirmed: false }, fallback)} /></div>
          <div><label>After frame <select aria-label={`After frame ${step.id}`} value={check.toFrame} onChange={(e) => update(step.id, { toFrame: Number(e.target.value), toRegion: null, conditionConfirmed: false }, fallback)}>{frameOptions}</select></label><RegionEditor video={video} timestamp={context.lesson.media.frameTimesMs[check.toFrame]} width={size.width} height={size.height} title="Target zone" region={check.toRegion} onRegion={(region) => update(step.id, { toRegion: region, conditionConfirmed: false }, fallback)} /></div>
        </div>
        <label className="flex gap-2"><input type="checkbox" checked={check.reviewed} onChange={(e) => update(step.id, { reviewed: e.target.checked }, fallback)} />I reviewed this step, its order/prerequisites, error cases, source, and recovery instructions.</label>
        <label className="flex gap-2"><input type="checkbox" disabled={!check.fromRegion || !check.toRegion} checked={check.conditionConfirmed} onChange={(e) => update(step.id, { conditionConfirmed: e.target.checked }, fallback)} />I checked the visual evidence and confirm that the drawn zone entry is observable; uncertainties do not imply success.</label>
      </article>;
    })}
    <details><summary>Edit the draft data (steps, rules, sources and explanations)</summary><p>Changes reset review. Keep approval null; component IDs and source frames must match the lesson.</p><textarea className="h-96 w-full border p-2 font-mono text-sm" aria-label="Draft JSON" value={editor} onChange={(e) => { setEditor(e.target.value); setApproved(null); setChecks({}); setConfirm(false); }} /><button onClick={() => { try { const input: unknown = JSON.parse(editor); const next = validateDraft(input, context); setDraft(next); setEditor(JSON.stringify(next, null, 2)); setChecks({}); setConfirm(false); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Invalid draft JSON."); } }}>Apply edited draft</button></details>
    <label>Your reviewer name <input value={reviewer} maxLength={100} onChange={(e) => { setReviewer(e.target.value); setApproved(null); }} /></label>
    <label className="flex gap-2"><input type="checkbox" checked={confirm} onChange={(e) => { setConfirm(e.target.checked); setApproved(null); }} />I explicitly approve the corrected procedure and every reviewed visual condition.</label>
    <button disabled={busy || dirty || !confirm || !reviewer.trim()} onClick={() => void approve()}>Approve procedure</button>
    {error && <p role="alert" className="whitespace-pre-wrap text-red-800">{error}</p>}
    {approved !== null && <div role="status"><p className="font-bold">Procedure approved. Practice mode is not implemented.</p><a className="underline" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(approved, null, 2))}`} download="steplint-approved-lesson.json">Download approved procedure and zone mappings</a></div>}
  </section>;
}
