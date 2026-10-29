"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Pixels } from "@/practice/tracker";
export function useCamera(onFrame: (pixels: Pixels, now: number) => void, onLost: (reason: string) => void) {
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null), generation = useRef(0);
  const callbacks = useRef({ onFrame, onLost });
  useEffect(() => { callbacks.current = { onFrame, onLost }; });
  const [active, setActive] = useState(false), [requesting, setRequesting] = useState(false), [error, setError] = useState("");
  const stop = useCallback(() => {
    generation.current++; stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false); setRequesting(false);
  }, []);
  async function start() {
    stop(); setError(""); setRequesting(true); const attempt = ++generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera requires HTTPS or localhost and a supported browser.");
      const media = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "environment" }, audio: false });
      if (attempt !== generation.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      for (const track of media.getVideoTracks()) track.onended = () => { callbacks.current.onLost("Camera disconnected. Start again and recalibrate."); stop(); };
      if (!video.current) { stop(); return; }
      video.current.srcObject = media; await video.current.play();
      if (attempt !== generation.current) return;
      setActive(true);
    } catch (e) { if (attempt === generation.current) { setError(e instanceof Error ? e.message : "Camera failed."); callbacks.current.onLost("Camera unavailable. Cannot verify."); stop(); } }
    finally { if (attempt === generation.current) setRequesting(false); }
  }
  useEffect(() => {
    if (!active) return;
    let previousTime = -1, lastFresh = performance.now(), warned = false;
    const timer = window.setInterval(() => {
      const element = video.current, surface = canvas.current, now = performance.now();
      if (!element || !surface) return;
      if (element.readyState < 2 || element.currentTime === previousTime) {
        if (now - lastFresh > 600 && !warned) { warned = true; callbacks.current.onLost("Camera frames stalled. Stop and recalibrate before resuming."); stop(); }
        return;
      }
      previousTime = element.currentTime; lastFresh = now; warned = false;
      try {
        const ctx = surface.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas unavailable.");
        ctx.drawImage(element, 0, 0, 160, 120);
        callbacks.current.onFrame(ctx.getImageData(0, 0, 160, 120), now);
      } catch { callbacks.current.onLost("Tracking frame unavailable. Stop and recalibrate."); stop(); }
    }, 100);
    const visibility = () => { if (document.hidden) { callbacks.current.onLost("Tab hidden. Practice paused; restart and recalibrate."); stop(); } };
    document.addEventListener("visibilitychange", visibility);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [active, stop]);
  useEffect(() => () => { generation.current++; stream.current?.getTracks().forEach((track) => track.stop()); }, []);
  return { video, canvas, active, requesting, error, start, stop };
}
