"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
/** Native modal provides keyboard focus containment and restores focus on close. */
export default function FlowDialog({
  title,
  children,
  onDismiss,
}: {
  title: string;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss?.();
      }}
      className="flow-workspace fixed inset-0 m-auto max-h-[90dvh] w-[min(92vw,48rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"
    >
      <h2 id={titleId} className="text-xl font-bold">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
