"use client";
import { activateGestureControl } from "./activate-control";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_ZONE,
  controlPointer,
  inZone,
  GestureEngine,
  type GestureReading,
  type GestureZone,
} from "./engine";
export type GestureStatus =
  | "off"
  | "loading"
  | "listening"
  | "unsupported"
  | "error";
type WorkerReply =
  | { type: "ready" }
  | { type: "result"; reading: GestureReading; elapsedMs: number }
  | { type: "error"; message: string };
/** Local inference runs in a dedicated worker, with one transferable frame in
 * flight. Hand recognition cannot block the camera, speech or evaluator UI. */
export function useGestureControl({
  videoRef,
  enabled,
  zone = DEFAULT_ZONE,
  onPauseRequest,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  zone?: GestureZone;
  onPauseRequest: () => void;
}) {
  const [status, setStatus] = useState<GestureStatus>("off");
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [activations, setActivations] = useState(0);
  const [diagnostics, setDiagnostics] = useState({ samples: 0, avgMs: 0 });
  const callbacks = useRef({ onPauseRequest });
  useEffect(() => {
    callbacks.current = { onPauseRequest };
  });
  const getStats = useCallback(() => diagnostics, [diagnostics]);
  useEffect(() => {
    if (!enabled) return;
    let live = true,
      busy = false,
      ready = false,
      samples = 0,
      totalMs = 0;
    const engine = new GestureEngine(zone);
    let worker: Worker | null = null;
    const boot = setTimeout(() => {
      if (
        typeof Worker === "undefined" ||
        typeof createImageBitmap === "undefined"
      ) {
        setStatus("unsupported");
        setNotice(
          "This browser cannot run background hand tracking. Use the buttons.",
        );
        return;
      }
      setStatus("loading");
      setNotice("");
      setDiagnostics({ samples: 0, avgMs: 0 });
      try {
        worker = new Worker(new URL("./gesture-worker.ts", import.meta.url));
        worker.onerror = () => {
          if (!live) return;
          ready = false;
          busy = false;
          setStatus("error");
          setPointer(null);
          setNotice(
            "Background hand tracking failed. Use the buttons or disable and re-enable gesture control.",
          );
        };
        worker.onmessage = (event: MessageEvent<WorkerReply>) => {
          if (!live) return;
          const reply = event.data;
          if (reply.type === "ready") {
            ready = true;
            setStatus("listening");
            return;
          }
          busy = false;
          if (reply.type === "error") {
            ready = false;
            setStatus("error");
            setNotice(reply.message);
            setPointer(null);
            return;
          }
          samples++;
          totalMs += reply.elapsedMs;
          if (samples === 1 || samples % 5 === 0)
            setDiagnostics({
              samples,
              avgMs: Math.round((totalMs / samples) * 10) / 10,
            });
          const action = engine.observe(reply.reading);
          const { x, y } = reply.reading;
          // Show the fingertip before pinch dwell completes, including a
          // tracked hand with no built-in pose label. This never clicks.
          setPointer(
            x !== undefined && y !== undefined && inZone(zone, x, y)
              ? controlPointer(zone, x, y)
              : null,
          );
          if (action.kind === "move" || action.kind === "click") {
            const point = controlPointer(zone, action.x, action.y);
            setPointer(point);
            if (action.kind === "click") {
              const element = document.elementFromPoint(
                point.x * innerWidth,
                point.y * innerHeight,
              );
              const message = activateGestureControl(element);
              setNotice(message);
              if (message.startsWith("Activated:"))
                setActivations((count) => count + 1);
            }
          } else if (action.kind === "pause")
            callbacks.current.onPauseRequest();
          else if (engine.lastIgnored === "outside-zone")
            setNotice(
              "Move your fingertip into the dashed right-edge control zone.",
            );
          else if (engine.lastIgnored === "low-confidence")
            setNotice("Hand unclear — hold it steady in the zone.");
        };
        worker.postMessage({ type: "init", origin: location.origin });
      } catch {
        setStatus("error");
        setNotice("Background hand tracking could not start. Use the buttons.");
      }
    }, 0);
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (
        !live ||
        !ready ||
        busy ||
        !worker ||
        !video ||
        video.readyState < 2 ||
        !video.videoWidth
      )
        return;
      busy = true;
      const activeWorker = worker,
        at = performance.now();
      void createImageBitmap(video, {
        resizeWidth: 320,
        resizeHeight: Math.max(
          1,
          Math.round((320 * video.videoHeight) / video.videoWidth),
        ),
      })
        .then((image) => {
          if (!live || !ready) {
            image.close();
            busy = false;
            return;
          }
          activeWorker.postMessage({ type: "frame", image, at }, [image]);
        })
        .catch(() => {
          busy = false;
          if (live)
            setNotice(
              "Camera frame unavailable for hand tracking. Keep the camera running.",
            );
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(boot);
      clearInterval(timer);
      worker?.terminate();
    };
  }, [enabled, videoRef, zone]);
  const clearNotice = useCallback(() => setNotice(""), []);
  return {
    status: enabled ? status : "off",
    pointer: enabled ? pointer : null,
    notice,
    clearNotice,
    getStats,
    activations,
  };
}
