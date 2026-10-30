"use client";
import FeedbackPopup, { useFeedback } from "@/components/feedback";
import { useEffect, useRef, useState } from "react";
import {
  createMp4,
  extractWav,
  probeEncoding,
  type EncodingSupport,
} from "@/media/convert";
import { inspectLessonVideo } from "@/teach/media";
import { MAX_TEACH_BODY, type LessonMedia } from "@/teach/schema";

export type PreparedLesson = { video: Blob; audio: Blob; media: LessonMedia };
export default function LessonCapture({
  onPrepared,
}: {
  onPrepared: (lesson: PreparedLesson) => void;
}) {
  const feedback = useFeedback();
  function fail(message: string) {
    setError(message);
    feedback.failure(message);
  }
  const [consent, setConsent] = useState(false);
  const [support, setSupport] = useState<EncodingSupport | null>(null);
  const [state, setState] = useState("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const camera = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const resources = useRef({
    stream: null as MediaStream | null,
    recorder: null as MediaRecorder | null,
    abort: new AbortController(),
    timer: null as ReturnType<typeof setInterval> | null,
  });
  function stopTracks() {
    const r = resources.current;
    if (r.timer) clearInterval(r.timer);
    r.timer = null;
    r.stream?.getTracks().forEach((t) => t.stop());
    r.stream = null;
    if (camera.current) camera.current.srcObject = null;
  }
  function cancel() {
    resources.current.abort.abort();
    if (resources.current.recorder?.state === "recording")
      resources.current.recorder.stop();
    stopTracks();
    setState("idle");
    setSeconds(0);
    setError("");
  }
  useEffect(() => {
    void probeEncoding()
      .then(setSupport)
      .catch(() =>
        setError("Codec probe failed. Upload an existing MP4 with audio."),
      );
    const r = resources.current;
    return () => {
      r.abort.abort();
      if (r.timer) clearInterval(r.timer);
      if (r.recorder?.state === "recording") r.recorder.stop();
      r.stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function prepare(
    source: Blob,
    existing: boolean,
    controller: AbortController,
  ) {
    setState("preparing");
    try {
      if (existing && source.size > 2_800_000)
        throw new Error(
          "Existing MP4 exceeds 2.8 MB; choose a shorter or lower-bitrate recording.",
        );
      const audio = await extractWav(source, controller.signal);
      const video = existing
        ? source
        : (
            await createMp4(
              source,
              support ?? { h264: false, aac: false, pcm: true },
              controller.signal,
            )
          ).blob;
      const media = await inspectLessonVideo(video);
      if (video.size + audio.blob.size + 10_000 > MAX_TEACH_BODY)
        throw new Error(
          "This lesson is too large. Use a shorter or lower-bitrate recording.",
        );
      controller.signal.throwIfAborted();
      setState("idle");
      onPrepared({ video, audio: audio.blob, media });
    } catch (e) {
      if (!controller.signal.aborted) {
        setState("idle");
        fail(e instanceof Error ? e.message : "Unable to prepare lesson.");
      }
    }
  }
  async function record() {
    cancel();
    const controller = new AbortController();
    resources.current.abort = controller;
    setState("permission");
    try {
      if (!consent || !support?.h264 || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Consent, camera access and H.264 encoding are required; use the upload option if unavailable.",
        );
      const type = [
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ].find((mime) => MediaRecorder.isTypeSupported(mime));
      if (!type)
        throw new Error(
          "No supported recording format. Upload MP4/H.264 with audio instead.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 640 },
          height: { ideal: 480, max: 480 },
          frameRate: { ideal: 15, max: 15 },
        },
        audio: true,
      });
      if (controller.signal.aborted) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      resources.current.stream = stream;
      if (camera.current) {
        camera.current.srcObject = stream;
        await camera.current.play();
      }
      const recorder = new MediaRecorder(stream, {
        mimeType: type,
        videoBitsPerSecond: 1_000_000,
        audioBitsPerSecond: 96_000,
      });
      resources.current.recorder = recorder;
      const parts: Blob[] = [];
      let bytes = 0;
      recorder.ondataavailable = (event) => {
        if (controller.signal.aborted) return;
        bytes += event.data.size;
        if (bytes > 5_000_000) {
          cancel();
          setError("Recording became too large and was discarded.");
          return;
        }
        if (event.data.size) parts.push(event.data);
      };
      recorder.onerror = () => {
        cancel();
        setError("Camera recording failed. Try an existing MP4 with audio.");
      };
      recorder.onstop = () => {
        if (!controller.signal.aborted) {
          stopTracks();
          void prepare(
            new Blob(parts, { type: recorder.mimeType }),
            false,
            controller,
          );
        }
      };
      recorder.start(250);
      setState("recording");
      const start = performance.now();
      resources.current.timer = setInterval(() => {
        const elapsed = (performance.now() - start) / 1000;
        setSeconds(elapsed);
        if (elapsed >= 20 && recorder.state === "recording") recorder.stop();
      }, 100);
    } catch (e) {
      if (!controller.signal.aborted) {
        stopTracks();
        setState("idle");
        fail(e instanceof Error ? e.message : "Permission or camera error.");
      }
    }
  }
  return (
    <section className="space-y-4 rounded border p-4">
      <h2 className="text-xl font-bold">1. Record or choose a lesson</h2>
      <p>
        Record 10–20 seconds. Name each part, keep it in frame, and pause
        briefly before and after each movement.
      </p>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={consent}
          disabled={state !== "idle"}
          onChange={(e) => setConsent(e.target.checked)}
        />
        Everyone visible or audible has agreed to recording and processing.
      </label>
      <p
        role="status"
        aria-live="polite"
        className={
          state === "recording" ? "font-bold text-red-700" : "font-medium"
        }
      >
        {state === "recording"
          ? `● REC — camera + microphone — ${seconds.toFixed(1)} s`
          : state === "permission"
            ? "Waiting for camera/microphone permission…"
            : state === "preparing"
              ? "Camera off. Preparing MP4 and mono PCM WAV locally…"
              : "Camera and microphone off"}
      </p>
      <video
        ref={camera}
        autoPlay
        muted
        playsInline
        className="w-full max-w-xl bg-slate-100"
        aria-label="Live lesson preview"
      />
      <div className="flex gap-3">
        <button
          disabled={state !== "idle" || !consent || !support?.h264}
          onClick={() => void record()}
        >
          Start recording
        </button>
        <button
          disabled={state !== "recording" || seconds < 10}
          onClick={() => resources.current.recorder?.stop()}
        >
          Done
        </button>
        <button onClick={cancel}>Discard recording</button>
      </div>
      <div className="space-y-2">
        <p>Or choose an existing MP4/H.264 with audio (10–20 s, ≤2.8 MB).</p>
        <button
          type="button"
          disabled={!consent || state !== "idle"}
          onClick={() => fileInput.current?.click()}
          aria-controls="teach-mp4-upload"
        >
          Choose MP4 file
        </button>
        <input
          ref={fileInput}
          id="teach-mp4-upload"
          hidden
          aria-label="Existing lesson MP4"
          type="file"
          accept="video/mp4,.mp4"
          disabled={!consent || state !== "idle"}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              cancel();
              const controller = new AbortController();
              resources.current.abort = controller;
              void prepare(file, true, controller);
            }
          }}
        />
      </div>
      <FeedbackPopup notice={feedback.notice} onClose={feedback.close} />
      {support && !support.h264 && (
        <p>
          H.264 encoding is unavailable here. The existing MP4 option is
          available.
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
