"use client";
import {
  MAX_LESSON_SECONDS,
  MIN_LESSON_SECONDS,
  LESSON_FRAME_RATE,
  LESSON_VIDEO_BITRATE,
  MULTIPART_RESERVE_BYTES,
} from "@/media/limits";
import FeedbackPopup, { useFeedback } from "@/components/feedback";
import { useEffect, useRef, useState } from "react";
import {
  createMp4,
  extractWav,
  probeEncoding,
  type EncodingSupport,
} from "@/media/convert";
import { MAX_TEACH_VIDEO_BYTES, MAX_LESSON_FRAMES } from "@/media/limits";
import { inspectMedia } from "@/media/inspect";
import { inspectLessonVideo } from "@/teach/media";
import { MAX_TEACH_BODY, type LessonMedia } from "@/teach/schema";

export type PreparedLesson = { video: Blob; audio: Blob; media: LessonMedia };
export type ControlMark = {
  at: number;
  recordingMs: number | null;
  text: string;
};
export default function LessonCapture({
  onPrepared,
  onControlMark,
}: {
  onPrepared: (lesson: PreparedLesson) => void;
  onControlMark?: (mark: ControlMark) => void;
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
  const pauseMarks = useRef({ pausedMs: 0, pauseStart: 0 });
  const recordingStartWall = useRef(0);
  const recordStart = useRef(0);
  function startTimer() {
    const resourcesRef = resources.current;
    if (resourcesRef.timer) clearInterval(resourcesRef.timer);
    resourcesRef.timer = setInterval(() => {
      const recorder = resourcesRef.recorder;
      const elapsed =
        (performance.now() -
          recordStart.current -
          pauseMarks.current.pausedMs) /
        1000;
      setSeconds(elapsed);
      if (
        elapsed >= MAX_LESSON_SECONDS - 0.2 &&
        recorder &&
        recorder.state === "recording"
      )
        recorder.stop();
    }, 100);
  }
  function stopTracks() {
    const r = resources.current;
    if (r.timer) clearInterval(r.timer);
    r.timer = null;
    r.stream?.getTracks().forEach((t) => t.stop());
    r.stream = null;
    if (camera.current) camera.current.srcObject = null;
  }
  function markControl(text: string) {
    const at = Date.now();
    onControlMark?.({
      at,
      text,
      recordingMs:
        state === "recording" || state === "paused"
          ? at - recordingStartWall.current
          : null,
    });
  }
  function cancel() {
    resources.current.abort.abort();
    const recorderState = resources.current.recorder?.state;
    if (recorderState === "recording" || recorderState === "paused")
      resources.current.recorder?.stop();
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
      const audio = await extractWav(source, controller.signal);
      const video =
        existing &&
        source.size <= MAX_TEACH_VIDEO_BYTES &&
        (await inspectMedia(source)).video!.frames <= MAX_LESSON_FRAMES
          ? source
          : (
              await createMp4(
                source,
                support ?? { h264: false, aac: false, pcm: true },
                controller.signal,
              )
            ).blob;
      const media = await inspectLessonVideo(video);
      if (
        video.size + audio.blob.size + MULTIPART_RESERVE_BYTES >
        MAX_TEACH_BODY
      )
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
  function pauseRecording() {
    const recorder = resources.current.recorder;
    if (!recorder || recorder.state !== "recording") return false;
    try {
      recorder.pause();
    } catch {
      return false;
    }
    if (resources.current.timer) clearInterval(resources.current.timer);
    resources.current.timer = null;
    pauseMarks.current.pauseStart = performance.now();
    setState("paused");
    return true;
  }
  function resumeRecording() {
    const recorder = resources.current.recorder;
    if (!recorder || recorder.state !== "paused") return false;
    try {
      recorder.resume();
    } catch {
      return false;
    }
    pauseMarks.current.pausedMs +=
      performance.now() - pauseMarks.current.pauseStart;
    startTimer();
    setState("recording");
    return true;
  }
  async function preview() {
    cancel();
    const controller = new AbortController();
    resources.current.abort = controller;
    setState("permission");
    try {
      if (!consent || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Consent and camera access are required; use the upload option if unavailable.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 640 },
          height: { ideal: 480, max: 480 },
          frameRate: { ideal: LESSON_FRAME_RATE, max: LESSON_FRAME_RATE },
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
      setState("preview");
    } catch (e) {
      if (!controller.signal.aborted) {
        stopTracks();
        setState("idle");
        fail(e instanceof Error ? e.message : "Permission or camera error.");
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
          frameRate: { ideal: LESSON_FRAME_RATE, max: LESSON_FRAME_RATE },
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
        videoBitsPerSecond: LESSON_VIDEO_BITRATE,
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
      pauseMarks.current = { pausedMs: 0, pauseStart: 0 };
      recordingStartWall.current = Date.now();
      recordStart.current = performance.now();
      startTimer();
    } catch (e) {
      if (!controller.signal.aborted) {
        stopTracks();
        setState("idle");
        fail(e instanceof Error ? e.message : "Permission or camera error.");
      }
    }
  }
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold">1. Record or choose a lesson</h2>
      <p className="text-sm">
        Record up to 60 seconds with the full movement visible, or upload a
        recording.
      </p>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={consent}
          disabled={state !== "idle" && state !== "preview"}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (!e.target.checked) cancel();
          }}
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
          : state === "paused"
            ? `❚❚ Paused — ${seconds.toFixed(1)} s recorded. Resume or stop.`
            : state === "permission"
              ? "Waiting for camera/microphone permission…"
              : state === "preparing"
                ? "Camera off. Preparing MP4 and mono PCM WAV locally…"
                : state === "preview"
                  ? "Camera preview — not recording. Frame your shot, then start recording."
                  : "Camera and microphone off"}
      </p>
      <video
        ref={camera}
        autoPlay
        muted
        playsInline
        className="max-h-[30vh] w-full rounded-xl bg-slate-950"
        aria-label="Live lesson preview"
      />
      <div className="flex flex-wrap gap-3">
        <button
          disabled={
            (state !== "idle" && state !== "preview") || !consent || !support
          }
          onClick={() => {
            markControl("preview recording");
            void preview();
          }}
        >
          Preview camera
        </button>
        <button
          disabled={
            (state !== "idle" && state !== "preview") ||
            !consent ||
            !support?.h264
          }
          onClick={() => {
            markControl("start recording");
            void record();
          }}
        >
          Start recording
        </button>
        <button
          type="button"
          disabled={state !== "idle"}
          onClick={() => fileInput.current?.click()}
          aria-controls="teach-mp4-upload"
          title="MP4/H.264 with audio, 10–60 s; compressed before upload. No consent checkbox needed."
        >
          Upload video recording
        </button>
        <button
          disabled={
            (state !== "recording" && state !== "paused") || seconds < MIN_LESSON_SECONDS + 2 / LESSON_FRAME_RATE
          }
          onClick={() => resources.current.recorder?.stop()}
        >
          Done
        </button>
        {state === "recording" && (
          <button
            onClick={() => {
              markControl("pause recording");
              pauseRecording();
            }}
          >
            Pause recording
          </button>
        )}
        {state === "paused" && (
          <button
            onClick={() => {
              markControl("resume recording");
              resumeRecording();
            }}
          >
            Resume recording
          </button>
        )}
        <button
          onClick={() => {
            markControl("discard recording");
            cancel();
          }}
        >
          Discard recording
        </button>
      </div>
      <div className="space-y-2">
        <p className="text-sm text-slate-500">
          Upload: MP4/H.264 with audio, 10–60 s; compressed before upload.
        </p>
        <input
          ref={fileInput}
          id="teach-mp4-upload"
          hidden
          aria-label="Existing lesson MP4"
          type="file"
          accept="video/mp4,.mp4"
          disabled={state !== "idle"}
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
