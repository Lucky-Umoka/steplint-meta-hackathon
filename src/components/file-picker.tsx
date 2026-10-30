"use client";
import { useId, useRef, useState } from "react";
export default function FilePicker({ label, buttonLabel, accept, disabled = false, onFile }: { label: string; buttonLabel: string; accept: string; disabled?: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null), id = useId();
  const [name, setName] = useState("");
  return <div className="space-y-2"><p className="text-sm font-medium">{label}</p><button type="button" aria-controls={id} disabled={disabled} className="rounded border border-slate-400 bg-white px-4 py-2 font-semibold shadow-sm hover:bg-slate-100 focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => input.current?.click()}>{buttonLabel}</button>{name && <span className="ml-3 break-all text-sm text-slate-600">{name}</span>}<input ref={input} id={id} hidden type="file" aria-label={label} accept={accept} disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) { setName(file.name); onFile(file); } }} /></div>;
}
