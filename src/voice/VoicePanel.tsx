"use client";
import { useEffect, useRef } from "react";
import type { VoiceEvent } from "./use-voice-control";

export const MAX_VOICE_EVENTS = 100;
/** Bounded in-memory transcript: user speech, StepLint speech, verdicts. */
export function appendVoiceEvent(
  log: VoiceEvent[],
  event: VoiceEvent,
): VoiceEvent[] {
  return [...log.slice(-(MAX_VOICE_EVENTS - 1)), event];
}
/**
 * Visible voice transcript. Three sources, three treatments: what the user
 * said, the exact text StepLint spoke (the SpeechSynthesis input, never a
 * re-transcription), and what the evaluator decided.
 */
export default function VoicePanel({ events }: { events: VoiceEvent[] }) {
  const list = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [events]);
  if (!events.length) return null;
  return (
    <section
      aria-label="Voice transcript"
      className="rounded-xl border bg-white p-3 text-sm"
    >
      <h2 className="font-semibold">Voice transcript</h2>
      <ol ref={list} className="mt-2 max-h-44 space-y-1 overflow-y-auto">
        {events.map((event, i) => (
          <li
            key={`${event.at}-${i}`}
            className={
              event.source === "you"
                ? "text-slate-700"
                : event.source === "steplint"
                  ? "text-cyan-900"
                  : "font-medium text-slate-900"
            }
          >
            <span className="text-xs text-slate-400">
              {new Date(event.at).toLocaleTimeString()} ·{" "}
              {event.source === "you"
                ? "You said"
                : event.source === "steplint"
                  ? "StepLint said"
                  : event.source === "verdict"
                    ? "Verification"
                    : event.source === "control"
                      ? "Control"
                      : "Guidance"}
              :{" "}
            </span>
            {event.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
