"use client";
import { useEffect, useState } from "react";
import { DEFAULT_ZONE } from "./engine";
import { useGestureControl } from "./use-gesture-control";

/**
 * Opt-in gesture control panel. OFF by default; everything loads lazily on
 * enable and tears down on disable/unmount. Pinch clicks land on ordinary
 * DOM buttons (manual-equivalent); palm requests a pause through the host's
 * normal pause path. Nothing here can verify, skip, or approve anything.
 */
export default function GestureControls({
  videoRef,
  onPauseRequest,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onPauseRequest: () => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const { status, pointer, notice, clearNotice, getStats } = useGestureControl({
    videoRef,
    enabled,
    onPauseRequest,
  });
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const update = () =>
      setRect(videoRef.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [videoRef, pointer, status]);
  const stats = getStats();
  const statusText =
    status === "off"
      ? "Gesture control off"
      : status === "loading"
        ? "Loading hand tracking…"
        : status === "listening"
          ? "Gesture control on — point in the right-edge zone, pinch to click"
          : status === "unsupported"
            ? "Background hand tracking is unavailable in this browser"
            : "Gesture control error — use the buttons";
  return (
    <div className="rounded-xl border bg-white p-3 text-sm">
      <label className="flex items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            clearNotice();
          }}
        />
        Enable gesture control
      </label>
      <p role="status" className="mt-1 text-slate-600">
        {statusText}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Hands stay on screen only: tracking runs in this browser, no hand images
        are uploaded. Pinch clicks ordinary buttons; an open palm held in the
        zone pauses practice.
      </p>
      <p role="status" className="mt-1 min-h-10 text-amber-800">
        {notice || "\u00a0"}
      </p>
      {enabled && rect && pointer && (
        <div
          aria-hidden="true"
          data-testid="gesture-pointer"
          className="pointer-events-none fixed z-50 h-4 w-4 rounded-full border-2 border-cyan-500 bg-cyan-200"
          style={{
            left: `${pointer.x * 100}vw`,
            top: `${pointer.y * 100}vh`,
          }}
        />
      )}
      {enabled && rect && status === "listening" && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-40 border-2 border-dashed border-cyan-400"
          style={{
            left: rect.left + DEFAULT_ZONE.left * rect.width,
            top: rect.top + DEFAULT_ZONE.top * rect.height,
            width: (DEFAULT_ZONE.right - DEFAULT_ZONE.left) * rect.width,
            height: (DEFAULT_ZONE.bottom - DEFAULT_ZONE.top) * rect.height,
          }}
        />
      )}
      {enabled && (
        <details className="mt-1 text-xs text-slate-500">
          <summary>Gesture diagnostics</summary>
          <p>
            {stats.samples} samples · avg {stats.avgMs} ms per check at ~5
            checks/second.
          </p>
        </details>
      )}
    </div>
  );
}
