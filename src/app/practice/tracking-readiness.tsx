"use client";
import { useEffect, useState } from "react";
import type { ObjectDetection } from "@/guide/schema";
import type { PracticeSession } from "@/practice/pipeline";

type Status = "searching" | "seen" | "in_start" | "tracked" | "hidden" | "unclear";
export type LiveTracking = {
  rows: {
    objectId: string;
    name: string;
    zoneName: string | null;
    status: Status;
  }[];
  calibrationValid: boolean;
  armed: boolean;
  lastReplyAtMs: number;
  fps: number;
};
const LABEL: Record<Status, string> = {
  searching: "looking for it…",
  seen: "found, not yet in its starting place",
  in_start: "in its starting place ✓",
  tracked: "tracked ✓",
  hidden: "partly hidden (hand) — still followed",
  unclear: "view unclear",
};

/**
 * Per-object readiness from the tracker reply the page already receives.
 * Display only: it never changes verification, arming or evidence.
 */
export function readinessRows(
  session: PracticeSession,
  detections: ObjectDetection[],
): LiveTracking["rows"] {
  return detections.map((detection) => {
    const step = session.procedure.steps.find(
      (s) => s.condition.componentId === detection.objectId,
    );
    const start = step
      ? (session.initialZones[detection.objectId] ?? step.condition.fromZone)
      : null;
    const status: Status =
      detection.quality === "observed"
        ? session.armed
          ? "tracked"
          : session.stable[detection.objectId]?.zone === start
            ? "in_start"
            : "seen"
        : detection.quality === "missing"
          ? "searching"
          : detection.quality === "obstructed"
            ? "hidden"
            : "unclear";
    return {
      objectId: detection.objectId,
      status,
      name:
        session.procedure.components.find((c) => c.id === detection.objectId)
          ?.description ?? detection.objectId,
      zoneName:
        session.procedure.zones.find((z) => z.id === start)?.description ??
        null,
    };
  });
}

export function TrackingReadiness({
  live,
  state,
}: {
  live: LiveTracking | null;
  state: string;
}) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  const age = live ? Math.max(0, now - live.lastReplyAtMs) / 1000 : null;
  const fresh = !!live && age !== null && age < 1 && live.calibrationValid;
  return (
    <section
      aria-label="Tracking readiness"
      data-testid="tracking-readiness"
      data-live={fresh ? "yes" : "no"}
      className="rounded-2xl border bg-white p-2 text-xs"
    >
      <p
        className={`font-semibold ${fresh ? "text-emerald-700" : "text-amber-700"}`}
      >
        {!live
          ? `○ Not tracking yet (${state.replaceAll("_", " ")})`
          : fresh
            ? `● Tracking live · ${live.fps} frames/s`
            : `○ Tracking ${live.calibrationValid ? "paused or stalled" : "is finding the work area"} · last update ${age!.toFixed(1)} s ago`}
        {live &&
          (live.armed
            ? " · Practice started"
            : " · Waiting for the starting position")}
      </p>
      {live && (
        <ul className="mt-0.5 space-y-0.5">
          <li>Work area: {live.calibrationValid ? "aligned ✓" : "searching…"}</li>
          {live.rows.map((row) => (
            <li
              key={row.objectId}
              data-object={row.objectId}
              data-status={row.status}
            >
              {row.name}: {LABEL[row.status]}
              {!live.armed && row.status !== "in_start" && row.zoneName
                ? ` (place it at: ${row.zoneName})`
                : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
