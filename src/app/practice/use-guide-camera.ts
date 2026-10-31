"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Pixels } from "@/practice/tracker";
export function useGuideCamera(
  onFrame: (image: Pixels, now: number) => void,
  onPause: (reason: string) => void,
) {
  const video = useRef<HTMLVideoElement>(null),
    surface = useRef<HTMLCanvasElement | null>(null),
    stream = useRef<MediaStream | null>(null),
    generation = useRef(0),
    callbacks = useRef({ onFrame, onPause });
  const [active, setActive] = useState(false),
    [requesting, setRequesting] = useState(false),
    [size, setSize] = useState({ width: 640, height: 480 });
  useEffect(() => {
    callbacks.current = { onFrame, onPause };
  });
  const stop = useCallback(() => {
    generation.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false);
    setRequesting(false);
  }, []);
  async function start() {
    stop();
    const gen = ++generation.current;
    setRequesting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Camera access needs HTTPS and a supported browser.");
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment",
        },
        audio: false,
      });
      if (gen !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      media.getVideoTracks().forEach(
        (t) =>
          (t.onended = () => {
            callbacks.current.onPause(
              "The camera disconnected. Start it again when ready.",
            );
            stop();
          }),
      );
      const v = video.current;
      if (!v) {
        stop();
        return;
      }
      v.srcObject = media;
      await v.play();
      if (gen !== generation.current) return;
      setSize({ width: v.videoWidth || 640, height: v.videoHeight || 480 });
      setActive(true);
    } catch (e) {
      if (gen === generation.current) {
        callbacks.current.onPause(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Camera access was not allowed. Enable it in Chrome, then try again."
            : e instanceof Error
              ? e.message
              : "The camera could not start.",
        );
        stop();
      }
    } finally {
      if (gen === generation.current) setRequesting(false);
    }
  }
  const capture = useCallback(() => {
    const v = video.current;
    if (!v || v.readyState < 2 || !v.videoWidth)
      throw Error("The camera is warming up. Hold it steady.");
    const c = document.createElement("canvas");
    const scale = Math.min(1, 960 / v.videoWidth, 720 / v.videoHeight);
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    const context = c.getContext("2d");
    if (!context) throw Error("Camera capture is unavailable.");
    context.drawImage(v, 0, 0, c.width, c.height);
    return {
      image: c.toDataURL("image/jpeg", 0.82),
      width: c.width,
      height: c.height,
    };
  }, []);
  const stats = useRef({ frames: 0, lastIntervalMs: 0, avgProcessMs: 0 });
  const getStats = useCallback(() => ({ ...stats.current }), []);
  useEffect(() => {
    if (!active) return;
    let last = -1,
      fresh = performance.now(),
      lastProcess = 0,
      lastStamp = 0,
      processing = false,
      rvfc = 0,
      raf = 0,
      timer = 0,
      stopped = false;
    const tick = () => {
      if (stopped) return;
      const v = video.current,
        now = performance.now();
      if (!v) return schedule();
      if (v.readyState < 2 || v.currentTime === last) {
        if (now - fresh > 1800) {
          callbacks.current.onPause(
            "The camera paused. Keep this tab open and restart when ready.",
          );
          stop();
        }
        return schedule();
      }
      last = v.currentTime;
      fresh = now;
      // Adaptive ~12fps target with an overlap guard: a slow tick never
      // queues behind itself, and duplicate frames are never processed.
      if (processing || now - lastProcess < 66) return schedule();
      processing = true;
      lastProcess = now;
      const started = performance.now();
      try {
        const c = (surface.current ??= document.createElement("canvas"));
        const scale = Math.min(1, 640 / v.videoWidth, 480 / v.videoHeight);
        c.width = Math.max(1, Math.round(v.videoWidth * scale));
        c.height = Math.max(1, Math.round(v.videoHeight * scale));
        const context = c.getContext("2d", { willReadFrequently: true });
        if (!context) return schedule();
        context.drawImage(v, 0, 0, c.width, c.height);
        callbacks.current.onFrame(
          context.getImageData(0, 0, c.width, c.height),
          fresh,
        );
        const elapsed = performance.now() - started,
          s = stats.current;
        s.frames++;
        s.lastIntervalMs = lastStamp ? Math.round(now - lastStamp) : 0;
        lastStamp = now;
        s.avgProcessMs =
          Math.round((s.avgProcessMs * (s.frames - 1) + elapsed) * 10) /
          (s.frames * 10);
      } finally {
        processing = false;
      }
      schedule();
    };
    function schedule() {
      if (stopped) return;
      const v = video.current as
        | (HTMLVideoElement & {
            requestVideoFrameCallback?: (cb: () => void) => number;
            cancelVideoFrameCallback?: (handle: number) => void;
          })
        | null;
      if (v && typeof v.requestVideoFrameCallback === "function") {
        rvfc = v.requestVideoFrameCallback(() => tick());
        return;
      }
      if (typeof requestAnimationFrame === "function") {
        raf = requestAnimationFrame(() => tick());
        return;
      }
      timer = window.setTimeout(() => tick(), 80);
    }
    schedule();
    const hide = () => {
      if (document.hidden) {
        callbacks.current.onPause("Practice paused while this tab was hidden.");
        stop();
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      const v = video.current as
        | (HTMLVideoElement & {
            cancelVideoFrameCallback?: (handle: number) => void;
          })
        | null;
      if (rvfc && typeof v?.cancelVideoFrameCallback === "function")
        v.cancelVideoFrameCallback(rvfc);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [active, stop]);
  useEffect(
    () => () => {
      generation.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  return { video, active, requesting, size, start, stop, capture, getStats };
}
