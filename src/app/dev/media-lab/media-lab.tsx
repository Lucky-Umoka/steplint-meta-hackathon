"use client";
import FeedbackPopup, { useFeedback } from "@/components/feedback";
import FilePicker from "@/components/file-picker";

import { useEffect, useRef, useState } from "react";
import { createMp4, extractWav, probeEncoding, type EncodingSupport } from "@/media/convert";
import { inspectMedia, MAX_MEDIA_BYTES, requireSamVideo } from "@/media/inspect";

type Artifact = { name: string; url: string; info: object };
type Phase = "idle" | "requesting" | "recording" | "processing" | "done";
const errorText = (error: unknown) => error instanceof Error ? error.message : "Unknown media error";
const recorderTypes = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp8,opus", "video/webm"];

export default function MediaLab() {
  const feedback = useFeedback();
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [support, setSupport] = useState<EncodingSupport | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [report, setReport] = useState<object | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const preview = useRef<HTMLVideoElement>(null);
  const resources = useRef({ stream: null as MediaStream | null, recorder: null as MediaRecorder | null, controller: null as AbortController | null, timer: null as ReturnType<typeof setInterval> | null, urls: [] as string[] });
  const busy = phase === "requesting" || phase === "recording" || phase === "processing";

  function releaseCapture() {
    const r = resources.current;
    if (r.timer) clearInterval(r.timer);
    r.timer = null;
    if (r.recorder && r.recorder.state !== "inactive") r.recorder.stop();
    r.stream?.getTracks().forEach((track) => track.stop());
    r.stream = null;
    if (preview.current) preview.current.srcObject = null;
  }
  function discard() {
    resources.current.controller?.abort();
    releaseCapture();
    resources.current.urls.forEach(URL.revokeObjectURL);
    resources.current.urls = [];
    setArtifacts([]); setReport(null); setErrors([]); setElapsed(0); setPhase("idle");
  }
  useEffect(() => {
    void probeEncoding().then(setSupport).catch((error: unknown) => setErrors([errorText(error)]));
    const r = resources.current;
    return () => {
      r.controller?.abort();
      if (r.timer) clearInterval(r.timer);
      if (r.recorder?.state === "recording") r.recorder.stop();
      r.stream?.getTracks().forEach((track) => track.stop());
      r.urls.forEach(URL.revokeObjectURL);
    };
  }, []);

  async function processClip(blob: Blob, existing: boolean, controller: AbortController, captureMime?: string) {
    const started = performance.now();
    setPhase("processing");
    try {
      const inputInfo = await inspectMedia(blob);
      controller.signal.throwIfAborted();
      setReport({ captureMime: captureMime ?? blob.type, actualInput: inputInfo });
      const outputs: Artifact[] = [];
      const failures: string[] = [];
      const add = (name: string, data: Blob, info: object) => {
        controller.signal.throwIfAborted();
        const url = URL.createObjectURL(data);
        resources.current.urls.push(url);
        outputs.push({ name, url, info });
        setArtifacts([...outputs]);
      };
      // Each output can fail independently: retain a valid MP4 when audio is absent.
      try {
        if (existing) {
          const info = requireSamVideo(inputInfo);
          add("steplint.mp4", new Blob([blob], { type: "video/mp4" }), info);
        } else {
          if (!support) throw new Error("Encoding probe has not completed.");
          const mp4 = await createMp4(blob, support, controller.signal);
          add("steplint.mp4", mp4.blob, mp4.info);
          if (!support.aac) failures.push("AAC encoding unavailable: MP4 is video-only; WAV uses the original microphone track.");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        failures.push(`MP4: ${errorText(error)}`);
      }
      try {
        const wav = await extractWav(blob, controller.signal);
        add("steplint.wav", wav.blob, wav.info);
      } catch (error) {
        if (controller.signal.aborted) return;
        failures.push(`WAV: ${errorText(error)}`);
      }
      controller.signal.throwIfAborted();
      setErrors(failures); if (failures.length) feedback.failure(failures[0]); else feedback.success("Media ready", "Preview or download your files.");
      setReport({ captureMime: captureMime ?? blob.type, actualInput: inputInfo, processingMs: Math.round(performance.now() - started), outputs: outputs.map((x) => ({ name: x.name, ...x.info })) });
      setPhase("done");
    } catch (error) {
      if (!controller.signal.aborted) { setErrors([errorText(error)]); feedback.failure(errorText(error)); setPhase("idle"); }
    }
  }

  async function startRecording() {
    discard();
    const controller = new AbortController();
    resources.current.controller = controller;
    setPhase("requesting");
    try {
      if (!consent) throw new Error("Confirm recording consent first.");
      if (!support?.h264) throw new Error("H.264 encoding is unavailable. Use the existing MP4 fallback.");
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Camera/microphone require localhost or HTTPS and a supported browser.");
      if (typeof MediaRecorder === "undefined") throw new Error("MediaRecorder unavailable. Use an existing MP4.");
      const mimeType = recorderTypes.find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("No supported camera recording container. Use an existing MP4.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640, max: 640 }, height: { ideal: 480, max: 480 }, frameRate: { ideal: 15, max: 15 } }, audio: true });
      if (controller.signal.aborted) { stream.getTracks().forEach((track) => track.stop()); return; }
      resources.current.stream = stream;
      if (preview.current) { preview.current.srcObject = stream; await preview.current.play(); }
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_000_000, audioBitsPerSecond: 96_000 });
      resources.current.recorder = recorder;
      const chunks: Blob[] = [];
      let bytes = 0;
      recorder.ondataavailable = (event) => {
        if (controller.signal.aborted) return;
        bytes += event.data.size;
        if (bytes > MAX_MEDIA_BYTES) { controller.abort(); releaseCapture(); setErrors(["Recording exceeded 20 MB and was discarded."]); setPhase("idle"); return; }
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => { controller.abort(); releaseCapture(); setErrors(["MediaRecorder failed; use the MP4 fallback."]); setPhase("idle"); };
      recorder.onstop = () => {
        if (controller.signal.aborted) return;
        releaseCapture();
        void processClip(new Blob(chunks, { type: recorder.mimeType }), false, controller, recorder.mimeType);
      };
      recorder.start(250);
      setPhase("recording");
      const start = performance.now();
      resources.current.timer = setInterval(() => {
        const seconds = (performance.now() - start) / 1000;
        setElapsed(seconds);
        if (seconds >= 15 && recorder.state === "recording") recorder.stop();
      }, 100);
    } catch (error) {
      if (!controller.signal.aborted) { controller.abort(); releaseCapture(); setErrors([errorText(error)]); feedback.failure(errorText(error)); setPhase("idle"); }
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    discard();
    const controller = new AbortController();
    resources.current.controller = controller;
    if (!consent) { setErrors(["Confirm that you have permission to use this recording."]); return; }
    // Validate actual bytes before processing a fallback; never trust accept/type/extension.
    setPhase("processing");
    try {
      requireSamVideo(await inspectMedia(file));
      if (!controller.signal.aborted) await processClip(file, true, controller);
    } catch (error) {
      if (!controller.signal.aborted) { setErrors([errorText(error)]); feedback.failure(errorText(error)); setPhase("idle"); }
    }
  }

  return <main className="mx-auto max-w-3xl space-y-5 p-6 text-slate-950">
    <h1 className="text-3xl font-bold">StepLint media lab — Phase 3 spike</h1>
    <p className="text-sm"><a className="underline" href="/licenses/MEDIABUNNY-NOTICE.txt">Mediabunny source and license notice</a></p>
    <p>Record 10–15 seconds. Files stay local; no model calls.</p>
    <label className="flex gap-2"><input type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />I have permission to record and use everyone visible or audible.</label>
    <p role="status" aria-live="polite" className={phase === "recording" ? "font-bold text-red-700" : "font-bold"}>
      {phase === "recording" ? `● RECORDING CAMERA + MICROPHONE — ${elapsed.toFixed(1)} s` : phase === "requesting" ? "Waiting for camera and microphone permission…" : phase === "processing" ? "Camera off — inspecting/converting locally…" : "Camera and microphone off"}
    </p>
    <details><summary>Encoding details</summary><pre className="overflow-auto rounded bg-slate-100 p-3" aria-label="Encoding capability results">{support ? JSON.stringify({ ...support, videoProbe: "H.264 640×480 15 fps", audioProbe: "AAC mono 48 kHz; PCM mono 24 kHz" }, null, 2) : "Probing codec support…"}</pre></details>
    {support && !support.h264 && <p>H.264 encoding is unsupported in this browser. Upload an existing MP4/H.264 file below; this is a measured capability failure.</p>}
    <div className="flex flex-wrap gap-4">
      <button className="rounded border p-2 disabled:opacity-40" disabled={!consent || !support?.h264 || busy} onClick={() => void startRecording()}>Record 15 seconds</button>
      <button className="rounded border p-2 disabled:opacity-40" disabled={phase !== "recording" || elapsed < 10} onClick={() => resources.current.recorder?.stop()}>Stop after 10 seconds</button>
      <button className="rounded border p-2" onClick={discard}>Cancel / discard all</button>
    </div>
    <video ref={preview} autoPlay muted playsInline aria-label="Live camera preview" className="w-full max-w-lg bg-slate-100" />
    <div className="block">
      <FilePicker label="Existing MP4" buttonLabel="Choose MP4 file" accept="video/mp4,.mp4" disabled={busy || !consent} onFile={(file) => void handleFile(file)} />
    </div>
    <FeedbackPopup notice={feedback.notice} onClose={feedback.close} />
    {errors.length > 0 && <ul role="alert" className="list-disc pl-5 text-red-800">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
    {artifacts.map((artifact) => <section key={artifact.name} className="space-y-2 border p-3">
      <h2 className="text-xl font-bold">{artifact.name}</h2>
      {artifact.name.endsWith(".mp4") ? <video controls src={artifact.url} playsInline className="w-full" /> : <audio controls src={artifact.url} />}
      <details><summary>File details</summary><pre className="overflow-auto text-sm">{JSON.stringify(artifact.info, null, 2)}</pre></details>
      <a href={artifact.url} download={artifact.name} className="underline">Download {artifact.name}</a>
    </section>)}
    {report && <section><h2 className="text-xl font-bold">Measured report</h2><pre className="overflow-auto rounded bg-slate-100 p-3 text-sm">{JSON.stringify(report, null, 2)}</pre></section>}
  </main>;
}
