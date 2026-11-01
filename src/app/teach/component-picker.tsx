"use client";
import { useEffect, useState } from "react";
import { frameImage } from "@/teach/media";
import type { Lesson, Selection } from "@/teach/schema";
import FrameMark, { type Mark } from "./frame-mark";
export default function ComponentPicker({ lesson, video, busy, onCompile, onAutomatic }: { lesson: Lesson; video: Blob; busy: boolean; onCompile: (selections: Selection[]) => void; onAutomatic: () => void }) {
  const [frame, setFrame] = useState(0), [image, setImage] = useState<{ frame: number; url: string } | null>(null);
  const [mode, setMode] = useState<"point" | "box">("point");
  const [mark, setMark] = useState<Mark | null>(null), [name, setName] = useState("");
  const [selections, setSelections] = useState<Selection[]>([]);
  const [automaticConsent, setAutomaticConsent] = useState(false);
  const [consent, setConsent] = useState(false), [error, setError] = useState("");
  useEffect(() => { let active = true; void frameImage(video, lesson.media.frameTimesMs[frame]).then((url) => { if (active) setImage({ frame, url }); }).catch(() => { if (active) setError("This frame could not be decoded."); }); return () => { active = false; }; }, [video, frame, lesson.media.frameTimesMs]);
  const size = lesson.media.info.video;
  if (!size) return null;
  return <section className="space-y-4 rounded border p-4">
    <h2 className="text-xl font-bold">3. Create your lesson automatically</h2>
    <p>AI will identify up to four task components, propose their marks, track them through the clip and draft steps with suggested starting/target zones. You review, edit and approve the result before Practice can use it.</p>
    <label className="flex gap-2"><input type="checkbox" checked={automaticConsent} disabled={busy} onChange={(e) => setAutomaticConsent(e.target.checked)} />I approve automatic lesson analysis: paid AI analysis identifies components, tracks them through the video, then drafts the procedure. Two analysis requests and one video-tracking request; no automatic retries.</label>
    <p>Estimated video-tracking cost: ${(lesson.media.frameTimesMs.length * .20 / 1000).toFixed(4)}. Analysis adds video understanding, bounded text processing and up to 7,944 output tokens across two calls. Total cost varies; the earlier one-request estimate does not apply. Models: Muse Spark and SAM; details in the project docs.</p>
    <button disabled={busy || !automaticConsent} onClick={onAutomatic}>Automatically create my lesson</button>
    <details><summary>Optional: correct component marks manually</summary>
    <p>Choose up to four physical components. Points and boxes identify objects; they do not prove an action.</p>
    <label>Choose a useful moment <input aria-label="Source time" type="range" min={0} max={lesson.media.frameTimesMs.length - 1} step={Math.max(1, Math.round((lesson.media.info.video?.fps ?? 15)))} value={frame} disabled={busy} onChange={(e) => { setFrame(Number(e.target.value)); setMark(null); }} /></label>
    <p>Source time: {(lesson.media.frameTimesMs[frame] / 1000).toFixed(3)} s</p>
    <label>Mark type <select value={mode} disabled={busy} onChange={(e) => { setMode(e.target.value === "box" ? "box" : "point"); setMark(null); }}><option value="point">Point</option><option value="box">Box</option></select></label>
    {image?.frame === frame && <div className={busy ? "pointer-events-none opacity-60" : ""}><FrameMark image={image.url} width={size.width} height={size.height} mode={mode} mark={mark} onMark={setMark} /></div>}
    <label>Component description <input aria-label="Component description" value={name} maxLength={100} disabled={busy} onChange={(e) => setName(e.target.value)} /></label>
    <button disabled={busy || image?.frame !== frame || !mark || !name.trim() || selections.length >= 4} onClick={() => { if (mark) { const id = [1, 2, 3, 4].map((n) => `component-${n}`).find((id) => !selections.some((s) => s.id === id)); if (id) setSelections([...selections, { id, description: name.trim(), frame, mark }]); setMark(null); setName(""); } }}>Add component</button>
    <ul>{selections.map((s) => <li key={s.id}>{s.id}: {s.description} (frame {s.frame}, {s.mark.kind}) <button disabled={busy} onClick={() => setSelections(selections.filter((item) => item.id !== s.id))}>Remove {s.description}</button></li>)}</ul>
    <label className="flex gap-2"><input type="checkbox" disabled={busy} checked={consent} onChange={(e) => setConsent(e.target.checked)} />Process these selections with paid AI video tracking, then draft rules with paid AI procedure analysis. This makes one request for each; no automatic retries.</label>
    <p>Tracking estimate: ${(lesson.media.frameTimesMs.length * 0.20 / 1000).toFixed(4)}. Analysis adds bounded text processing and up to 6,144 output tokens; normal short-lesson inference is expected below $0.20 combined, not a billing guarantee. Models: SAM and Muse Spark.</p>
    <button disabled={busy || !consent || !selections.length} onClick={() => onCompile(selections)}>Track components and draft procedure</button>
    {error && <p role="alert">{error}</p>}
    </details>
  </section>;
}
