"use client";
import { useEffect, useState } from "react";
import { frameImage } from "@/teach/media";
import { primaryIssue, type AnalysisDraft } from "@/guide/draft";

function seconds(draft: AnalysisDraft, frame: number | null): string {
  if (frame === null || frame >= draft.source.frameTimesMs.length)
    return "an unknown moment";
  return `${(draft.source.frameTimesMs[frame] / 1000).toFixed(1)}s`;
}

export default function DraftRepair({
  draft,
  busy,
  onRetry,
  onDiscard,
  video,
}: {
  draft: AnalysisDraft;
  busy: boolean;
  onRetry: () => void;
  onDiscard: () => void;
  video?: Blob;
}) {
  const [images,setImages]=useState<Record<number,string>>({});
  const [imageError,setImageError]=useState("");
  useEffect(()=>{
    let current=true;
    if(!video)return;
    const frames=[...new Set(draft.steps.flatMap(s=>s.evidence?[s.evidence.startFrame,s.evidence.changeFrame,s.evidence.endFrame]:[]))].filter(f=>f<draft.source.frameTimesMs.length);
    void(async()=>{
      const next:Record<number,string>={};
      for(const frame of frames){if(!current)return;next[frame]=await frameImage(video,draft.source.frameTimesMs[frame]);}
      if(current){setImages(next);setImageError("");}
    })().catch(()=>{if(current)setImageError("Some reference images could not be decoded. Use the retained video preview to inspect those moments.");});
    return()=>{current=false;};
  },[video,draft]);
  const issue = primaryIssue(draft);
  const labels = new Map(draft.objects.map((o) => [o.id, o.label] as const));
  const labelOf = (id: string) => labels.get(id) ?? id;
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <h2 className="text-xl font-bold">One thing needs fixing first</h2>
      <p role="status" className="mt-2 text-amber-900">
        {issue.message}
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Nothing was approved. Your recording is kept below, so you can fix the
        view and run the analysis again.
      </p>
      <h3 className="mt-4 font-semibold">Objects in this lesson</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {draft.objects.map((object) =>
          object.unresolved ? (
            <li key={object.id}>
              <strong>{object.label}</strong>: {object.unresolved.message}{" "}
              (checked near {seconds(draft, object.unresolved.candidateFrame)})
            </li>
          ) : (
            <li key={object.id}>
              <strong>{object.label}</strong>: outlined at{" "}
              {seconds(draft, object.sourceFrame)}.
            </li>
          ),
        )}
      </ul>
      <h3 className="mt-4 font-semibold">Steps in this lesson</h3>
      {imageError&&<p role="status">{imageError}</p>}
      <ol className="mt-1 list-decimal space-y-2 pl-5 text-sm">
        {draft.steps.map((step) => (
          <li key={step.id}>
            <strong>{step.instruction}</strong>{" "}
            {step.evidence ? (
              <span className="text-slate-600">
                (frames {step.evidence.startFrame}→{step.evidence.changeFrame}→
                {step.evidence.endFrame},{" "}
                {(step.evidence.startMs / 1000).toFixed(1)}s→
                {(
                  draft.source.frameTimesMs[step.evidence.changeFrame] / 1000
                ).toFixed(1)}
                s→{(step.evidence.endMs / 1000).toFixed(1)}s)
              </span>
            ) : (
              <span className="text-slate-600">(no usable interval)</span>
            )}{" "}
            {step.supported
              ? "is supported."
              : step.unresolved.map((u) => (
                  <span key={u.code} className="block">
                    {u.message}{" "}
                    {u.failedFrames !== undefined && (
                      <span className="text-slate-600">
                        ({u.failedFrames} frame{u.failedFrames === 1 ? "" : "s"}
                        {u.frames?.length
                          ? `, first at ${(u.frames[0].timestampMs / 1000).toFixed(1)}s`
                          : ""}
                        {u.frames?.length
                          ? `, mostly ${u.frames.filter((f) => f.reason === "missing").length >= u.frames.filter((f) => f.reason === "low_score").length ? "not tracked" : "low-scored"}`
                          : ""}
                        )
                      </span>
                    )}
                    {u.objectIds?.length ? (
                      <span className="text-slate-600">
                        {" "}
                        Missing from the result:{" "}
                        {u.objectIds.map(labelOf).join(", ")}.
                      </span>
                    ) : null}
                    {u.measuredChange !== undefined &&
                    u.measuredChange !== null ? (
                      <span className="text-slate-600">
                        {" "}
                        (measured {u.measuredChange.toFixed(2)}, needs 0.15–12
                        to count)
                      </span>
                    ) : null}
                  </span>
                ))}
            {step.evidence&&<details className="my-3"><summary>Review the starting view, change and result</summary><div className="mt-2 grid gap-2 sm:grid-cols-3">{[step.evidence.startFrame,step.evidence.changeFrame,step.evidence.endFrame].map((frame,i)=><figure key={`${frame}-${i}`} className="overflow-hidden rounded border bg-white"><figcaption className="p-2">{["Before","Change","Result"][i]} · {seconds(draft,frame)}</figcaption>{images[frame]?<svg viewBox={`0 0 ${draft.source.width} ${draft.source.height}`} role="img" aria-label={`${step.instruction}: ${["before","change","result"][i]}`}><image href={images[frame]} width={draft.source.width} height={draft.source.height}/></svg>:<p className="p-3">Preparing reference…</p>}</figure>)}</div></details>}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="primary"
          disabled={busy}
          onClick={onRetry}
          title="Runs the paid analysis again on the same recording"
        >
          {busy ? "Analysing…" : "Run analysis again"}
        </button>
        <button disabled={busy} onClick={onDiscard}>
          Discard and start over
        </button>
      </div>
      <details className="mt-3 text-sm text-slate-600">
        <summary>Technical details</summary>
        <pre className="mt-2 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
          {JSON.stringify(
            {
              title: draft.title,
              objects: draft.objects.map((o) => ({
                id: o.id,
                label: o.label,
                unresolved: o.unresolved,
              })),
              steps: draft.steps.map((s) => ({
                id: s.id,
                supported: s.supported,
                evidence: s.evidence,
                unresolved: s.unresolved,
              })),
            },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}
