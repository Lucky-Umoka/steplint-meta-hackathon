"use client";
import { useEffect, useState } from "react";
import { frameImage } from "@/teach/media";
import type { Lesson, Selection } from "@/teach/schema";
import FrameMark, { type Mark } from "./frame-mark";
export default function ComponentPicker({ lesson, video, busy, onCompile }: { lesson: Lesson; video: Blob; busy: boolean; onCompile: (selections: Selection[]) => void }) {
  const [frame, setFrame] = useState(0), [image, setImage] = useState<{ frame: number; url: string } | null>(null);
  const [mode, setMode] = useState<"point" | "box">("point");
  const [mark, setMark] = useState<Mark | null>(null), [name, setName] = useState("");
  const [selections, setSelections] = useState<Selection[]>([]);
  const [consent, setConsent] = useState(false), [error, setError] = useState("");
  useEffect(() => { let active = true; void frameImage(video, lesson.media.frameTimesMs[frame]).then((url) => { if (active) setImage({ frame, url }); }).catch(() => { if (active) setError("This frame could not be decoded."); }); return () => { active = false; }; }, [video, frame, lesson.media.frameTimesMs]);
  const size = lesson.media.info.video;
  if (!size) return null;
  return <section className="space-y-4 rounded border p-4">
    <h2 className="text-xl font-bold">3. Mark the components</h2>
    <p>Choose up to four physical components. Points and boxes identify objects; they do not prove an action.</p>
    <label>Source frame <input aria-label="Source frame" type="number" min={0} max={lesson.media.frameTimesMs.length - 1} value={frame} disabled={busy} onChange={(e) => { setFrame(Math.max(0, Math.min(lesson.media.frameTimesMs.length - 1, Math.floor(Number(e.target.value))))); setMark(null); }} /></label>
    <p>Source time: {(lesson.media.frameTimesMs[frame] / 1000).toFixed(3)} s</p>
    <label>Mark type <select value={mode} disabled={busy} onChange={(e) => { setMode(e.target.value === "box" ? "box" : "point"); setMark(null); }}><option value="point">Point</option><option value="box">Box</option></select></label>
    {image?.frame === frame && <div className={busy ? "pointer-events-none opacity-60" : ""}><FrameMark image={image.url} width={size.width} height={size.height} mode={mode} mark={mark} onMark={setMark} /></div>}
    <label>Component description <input aria-label="Component description" value={name} maxLength={100} disabled={busy} onChange={(e) => setName(e.target.value)} /></label>
    <button disabled={busy || image?.frame !== frame || !mark || !name.trim() || selections.length >= 4} onClick={() => { if (mark) { const id = [1, 2, 3, 4].map((n) => `component-${n}`).find((id) => !selections.some((s) => s.id === id)); if (id) setSelections([...selections, { id, description: name.trim(), frame, mark }]); setMark(null); setName(""); } }}>Add component</button>
    <ul>{selections.map((s) => <li key={s.id}>{s.id}: {s.description} (frame {s.frame}, {s.mark.kind}) <button disabled={busy} onClick={() => setSelections(selections.filter((item) => item.id !== s.id))}>Remove {s.description}</button></li>)}</ul>
    <label className="flex gap-2"><input type="checkbox" disabled={busy} checked={consent} onChange={(e) => setConsent(e.target.checked)} />Process these selections with SAM 3.1, then draft rules with Muse Spark 1.3. This makes one request to each model; no automatic retries.</label>
    <p>SAM estimate: ${(lesson.media.frameTimesMs.length * 0.20 / 1000).toFixed(4)}. Spark adds bounded text processing and up to 6,144 output tokens; normal short-lesson inference is expected below $0.20 combined, not a billing guarantee.</p>
    <button disabled={busy || !consent || !selections.length} onClick={() => onCompile(selections)}>Track components and draft procedure</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
