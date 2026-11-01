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
import { type VoiceCommand, type CommandDisposition } from "@/voice/commands";
import { useVoiceControl, type VoiceEvent } from "@/voice/use-voice-control";
import GestureControls from "@/gesture/GestureControls";
import { useVoicePreference } from "@/voice/voice-preference";
import CommandFeedback from "@/voice/CommandFeedback";
import VoicePanel, { appendVoiceEvent } from "@/voice/VoicePanel";

export type PreparedLesson = { video: Blob; audio: Blob; media: LessonMedia };
export type ControlMark = {
  at: number;
  recordingMs: number | null;
  text: string;
};
const TEACH_COMMANDS: VoiceCommand[] = [
  {
    id: "start-recording",
    phrases: ["start recording", "start", "begin recording"],
  },
  { id: "pause-recording", phrases: ["pause recording", "pause"] },
  { id: "resume-recording", phrases: ["resume recording", "resume"] },
  {
    id: "stop-recording",
    phrases: ["stop recording", "stop", "done", "finish recording"],
  },
  {
    id: "preview-recording",
    phrases: [
      "preview recording",
      "preview",
      "show preview",
      "start camera",
      "preview camera",
      "open camera",
    ],
  },
  {
    id: "discard-recording",
    phrases: ["discard recording", "discard", "start over"],
    destructive: true,
    confirmPhrase: "confirm discard",
  },
  {
    id: "restart-recording",
    phrases: ["restart recording", "restart"],
    destructive: true,
    confirmPhrase: "confirm restart",
  },
];
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
      if (elapsed >= 20 && recorder && recorder.state === "recording")
        recorder.stop();
    }, 100);
  }
  const [voiceOn, setVoiceOn] = useVoicePreference();
  const [voiceLog, setVoiceLog] = useState<VoiceEvent[]>([]);
  function logVoice(event: VoiceEvent) {
    setVoiceLog((log) => appendVoiceEvent(log, event));
  }
  function say(text: string) {
    logVoice({ at: Date.now(), source: "steplint", text });
    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      }
    } catch {
      // Speech is a convenience; the on-screen log is authoritative.
    }
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
    const recorderState = resources.current.recorder?.state;
    if (recorderState === "recording" || recorderState === "paused")
      resources.current.recorder?.stop();
    stopTracks();
    setState("idle");
    setSeconds(0);
    setError("");
  }
  function runVoiceAction(id: string, disposition: CommandDisposition) {
    if (disposition === "rejected") {
      say("That confirmation has expired. Please say the command again.");
      return;
    }
    if (disposition === "needs-confirmation") {
      say(
        id === "discard-recording"
          ? "Say StepLint, confirm discard to delete this recording."
          : "Say StepLint, confirm restart to replace this recording.",
      );
      return;
    }
    const refuse = (text: string) => {
      say(text);
      return false;
    };
    switch (id) {
      case "start-recording":
        markControl("start recording");
        if (!consent)
          return refuse("Confirm recording consent before starting.");
        else if (!support)
          return refuse(
            "Recording support is still being checked. Try again when the camera controls are ready.",
          );
        else if (!support.h264)
          return refuse(
            "Recording is unavailable in this browser. Use an existing MP4 instead.",
          );
        else if (state !== "idle" && state !== "preview")
          return refuse(
            "A recording is already active. Pause, stop or discard it before starting another.",
          );
        else void record();
        break;
      case "pause-recording":
        markControl("pause recording");
        if (!pauseRecording()) return refuse("Nothing is recording right now.");
        break;
      case "resume-recording":
        markControl("resume recording");
        if (!resumeRecording()) return refuse("Nothing is paused right now.");
        break;
      case "stop-recording":
        markControl("stop recording");
        if (state !== "recording" && state !== "paused")
          return refuse("Nothing is recording right now.");
        else if (seconds < 10)
          return refuse(
            "Keep going a little longer; lessons need ten seconds.",
          );
        else resources.current.recorder?.stop();
        break;
      case "preview-recording":
        markControl("preview recording");
        if (state !== "idle" && state !== "preview")
          return refuse("Finish recording first.");
        else
          void preview().catch(() => refuse("There is no preview available."));
        break;
      case "discard-recording":
        markControl("discard recording");
        cancel();
        say("Recording discarded.");
        break;
      case "restart-recording":
        markControl("restart recording");
        cancel();
        void record();
        break;
    }
    return true;
  }
  const voice = useVoiceControl({
    commands: TEACH_COMMANDS,
    enabled: voiceOn,
    onAction: runVoiceAction,
    onEvent: (event) => logVoice(event),
  });
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
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold">1. Record or choose a lesson</h2>
      <p>
        Record 10–20 seconds. Name each part and keep the complete movement,
        starting state and final result visible. Continuous movements are
        welcome.
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
        className="max-h-[55vh] w-full rounded-xl bg-slate-950"
        aria-label="Live lesson preview"
      />
      <div className="flex flex-wrap gap-3">
        <button
          disabled={
            (state !== "idle" && state !== "preview") || !consent || !support
          }
          onClick={() => void preview()}
        >
          Preview camera
        </button>
        <button
          disabled={
            (state !== "idle" && state !== "preview") ||
            !consent ||
            !support?.h264
          }
          onClick={() => void record()}
        >
          Start recording
        </button>
        <button
          disabled={
            (state !== "recording" && state !== "paused") || seconds < 10
          }
          onClick={() => resources.current.recorder?.stop()}
        >
          Done
        </button>
        {state === "recording" && (
          <button onClick={pauseRecording}>Pause recording</button>
        )}
        {state === "paused" && (
          <button onClick={resumeRecording}>Resume recording</button>
        )}
        <button onClick={cancel}>Discard recording</button>
      </div>
      <div className="rounded-xl border bg-white p-3 text-sm">
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={voiceOn}
            onChange={(e) => setVoiceOn(e.target.checked)}
          />
          Enable voice control
        </label>
        {voiceOn && (
          <>
            <p role="status" className="mt-1 text-slate-600">
              {voice.status === "listening"
                ? "Listening for StepLint commands"
                : voice.status === "requesting"
                  ? "Requesting microphone permission…"
                  : voice.status === "unsupported"
                    ? "Voice control is not supported in this browser — use the buttons"
                    : voice.status === "denied"
                      ? "Microphone unavailable — use the buttons"
                      : voice.status === "error"
                        ? "Voice recognition error — use the buttons"
                        : "Voice control off"}
              {voice.lastHeard && ` · Last heard: “${voice.lastHeard}”`}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Browser speech recognition runs while enabled; commands need the
              Muse, Guide or StepLint prefix. Recognition is provided by your
              browser and may use its online service — no audio is stored or
              sent anywhere by StepLint. Say “StepLint, stop recording” to
              finish hands-free.
            </p>
            {voice.pending && (
              <p role="alert" className="mt-1 font-medium text-amber-800">
                Say “StepLint,{" "}
                {voice.pending.actionId === "discard-recording"
                  ? "confirm discard"
                  : "confirm restart"}{" "}
                within {voice.confirmWindowSec}s, or it expires.
              </p>
            )}
          </>
        )}
      </div>
      {voiceOn && (
        <CommandFeedback
          feedback={voice.feedback}
          commands={voice.availableCommands}
          onRestart={
            voice.status === "error" || voice.status === "denied"
              ? voice.restart
              : undefined
          }
        />
      )}
      <VoicePanel events={voiceLog} />
      <GestureControls
        videoRef={camera}
        pauseLabel="pauses recording"
        onPauseRequest={() => {
          if (pauseRecording()) say("Recording paused.");
          else say("Nothing is recording right now.");
        }}
      />
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
