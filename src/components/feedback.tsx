"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
export type Feedback = { kind: "success" | "error"; title: string; message: string };
export function useFeedback() {
  const [notice, setNotice] = useState<Feedback | null>(null);
  const success = useCallback((title: string, message = "") => setNotice({ kind: "success", title, message }), []);
  const failure = useCallback((message: string) => setNotice({ kind: "error", title: "Action needs attention", message }), []);
  const close = useCallback(() => setNotice(null), []);
  return { notice, success, failure, close };
}
export default function FeedbackPopup({ notice, onClose }: { notice: Feedback | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  const isError = notice?.kind === "error";
  useEffect(() => { const el = dialog.current; if (!el) return; if (isError && !el.open) el.showModal(); if (!isError && el.open) el.close(); }, [isError]);
  useEffect(() => { if (!notice || isError) return; const timer = setTimeout(onClose, 2400); return () => clearTimeout(timer); }, [notice, isError, onClose]);
  return <><dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} className="m-auto w-[min(92vw,28rem)] rounded-2xl border-0 p-6 shadow-2xl backdrop:bg-slate-950/60"><h2 id={titleId} className="text-xl font-bold text-red-800">{isError ? notice?.title : ""}</h2><p className="my-4">{isError ? notice?.message : ""}</p><button type="button" className="rounded border px-4 py-2" onClick={onClose} autoFocus>Got it</button></dialog>{notice && !isError && <div role="status" aria-live="polite" className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-4"><div className="max-w-sm rounded-2xl border border-emerald-300 bg-white p-5 text-center shadow-2xl"><p aria-hidden="true" className="mb-2 text-3xl text-emerald-700">✓</p><p className="font-bold text-emerald-900">{notice.title}</p>{notice.message && <p className="mt-1 text-sm text-slate-600">{notice.message}</p>}</div></div>}</>;
}
