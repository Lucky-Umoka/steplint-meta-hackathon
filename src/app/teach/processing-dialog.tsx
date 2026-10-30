"use client";
import { useEffect, useRef } from "react";
import { PROCESSING_STAGES, type ProcessingStage } from "@/teach/progress";
export default function ProcessingDialog({ open, stage, busy, ready, automatic, message, error, onClose, onCancel }: { open: boolean; stage: ProcessingStage; busy: boolean; ready: boolean; automatic: boolean; message: string; error: string; onClose: () => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; if (!element) return; if (open && !element.open) element.showModal(); if (!open && element.open) element.close(); }, [open]);
  const index = PROCESSING_STAGES.findIndex((item) => item.id === stage);
  return <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="processing-title" className="m-auto max-h-[90dvh] w-[min(92vw,36rem)] overflow-auto rounded-2xl border-0 p-0 shadow-2xl backdrop:bg-slate-950/60">
    <div className="space-y-5 p-6"><h2 id="processing-title" className="text-2xl font-bold">{error ? "Processing stopped" : ready ? "Your draft is ready" : "Building your lesson"}</h2>
      <p role={error ? "alert" : "status"} aria-live="polite" className={error ? "rounded bg-red-50 p-3 text-red-900" : "text-slate-600"}>{error || message || "Starting…"}</p>
      <ol className="space-y-0" aria-label="Lesson processing stages">{PROCESSING_STAGES.map((item, i) => {
        const skipped = item.id === "discover" && !automatic;
        const done = !skipped && (i < index || ready), active = !skipped && i === index && !ready;
        const state = skipped ? "Not requested" : done ? "Complete" : active ? error ? "Failed" : busy ? "In progress" : "Waiting" : "Waiting";
        return <li key={item.id} className="flex gap-4 pb-4"><div className="flex flex-col items-center"><span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${done ? "border-emerald-600 bg-emerald-50 text-emerald-800" : active ? error ? "border-red-600 text-red-800" : "border-blue-600 text-blue-800" : "border-slate-300 text-slate-500"}`}>{done ? "✓" : active && busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent motion-reduce:animate-none" /> : skipped ? "–" : error && active ? "!" : i + 1}</span>{i < PROCESSING_STAGES.length - 1 && <span aria-hidden="true" className={`min-h-6 w-0 flex-1 border-l-2 ${done ? "border-emerald-400" : "border-slate-200"}`} />}</div><div><p className="font-semibold">{item.title} <span className="text-sm font-normal">— {state}</span></p><p className="text-sm text-slate-600">{item.detail}</p></div></li>;
      })}</ol>
      <p className="text-sm text-slate-600">Stages update from actual processing messages. No automatic retries.</p><div className="flex flex-wrap gap-3"><button onClick={onClose} autoFocus>{ready ? "Review my draft" : busy ? "Continue in background" : "Close and review"}</button>{busy && <button onClick={onCancel}>Cancel processing and discard lesson</button>}</div>
    </div>
  </dialog>;
}
