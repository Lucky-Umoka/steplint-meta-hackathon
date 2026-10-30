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
  useEffect(() => {
    if (!active) return;
    let last = -1,
      fresh = performance.now();
    const timer = setInterval(() => {
      const v = video.current;
      if (!v) return;
      if (v.readyState < 2 || v.currentTime === last) {
        if (performance.now() - fresh > 1800) {
          callbacks.current.onPause(
            "The camera paused. Keep this tab open and restart when ready.",
          );
          stop();
        }
        return;
      }
      last = v.currentTime;
      fresh = performance.now();
      const c = (surface.current ??= document.createElement("canvas"));
      c.width = 320;
      c.height = Math.max(80, Math.round((320 * v.videoHeight) / v.videoWidth));
      const context = c.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(v, 0, 0, c.width, c.height);
      callbacks.current.onFrame(
        context.getImageData(0, 0, c.width, c.height),
        fresh,
      );
    }, 120);
    const hide = () => {
      if (document.hidden) {
        callbacks.current.onPause("Practice paused while this tab was hidden.");
        stop();
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      clearInterval(timer);
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
  return { video, active, requesting, size, start, stop, capture };
}
