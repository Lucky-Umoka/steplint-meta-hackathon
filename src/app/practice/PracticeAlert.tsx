"use client";
/**
 * Shared Practice alert: one visual language for violation, uncertainty,
 * provisional, verified and complete states. Violation alerts are assertive
 * and persistent; only the deterministic evaluator clears them. No animation,
 * so reduced-motion needs no special case. Visuals are the primary alert;
 * speech is dispatched separately and never blocks paint.
 */
export type PracticeAlertTone =
  | "violation"
  | "uncertain"
  | "watching"
  | "verified"
  | "complete"
  | "info";
function WarningIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="mt-0.5 h-5 w-5 shrink-0"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M10 1.5 19 17.5H1L10 1.5Zm0 4.2 5.8 9.8H4.2L10 5.7ZM9 9v4h2V9H9Zm0 5v2h2v-2H9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="mt-0.5 h-5 w-5 shrink-0"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm3.8 6.1-4.6 4.6-2-2 1.4-1.4.6.6 3.2-3.2 1.4 1.4Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
export default function PracticeAlert({
  tone,
  title,
  body,
  step,
}: {
  tone: PracticeAlertTone;
  title: string;
  body?: string;
  step?: string;
}) {
  const critical = tone === "violation";
  const affirmed = tone === "verified" || tone === "complete";
  return (
    <div
      role={critical ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-xl p-4 ${
        critical
          ? "bg-red-50 text-red-900"
          : affirmed
            ? "bg-emerald-50 text-emerald-900"
            : tone === "info"
              ? "bg-slate-50 text-slate-800"
              : "bg-amber-50 text-amber-900"
      }`}
    >
      {critical ? <WarningIcon /> : affirmed ? <CheckIcon /> : null}
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {step && <p className="mt-0.5 text-sm font-medium">Step: {step}</p>}
        {body && <p className="mt-1 text-lg font-medium">{body}</p>}
      </div>
    </div>
  );
}
