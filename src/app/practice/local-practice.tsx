"use client";
import { useEffect, useRef, useState } from "react";
import {
  LocalWorkerReplySchema,
  type TrackingMeasurement,
} from "@/practice/local-tracking-protocol";
import {
  summarizeLocalLatency,
  type LocalLatencyRecord,
} from "@/practice/local-latency";
import { EvidenceBuffer } from "@/practice/evidence-buffer";
import GuideAvatar, { resolveAvatarMode } from "@/components/GuideAvatar";
import { translateBox } from "@/practice/automatic-alignment";
import { feedbackEvents } from "@/practice/feedback";
import Workspace from "@/components/workspace";
import FrameMark from "../teach/frame-mark";
import { useGuideCamera } from "./use-guide-camera";
import type { ObjectDetection } from "@/guide/schema";
import { loadApprovedLesson } from "@/practice/load-approved-lesson";
import {
  listApprovedProcedures,
  saveApprovedProcedure,
  type SavedProcedure,
  type ProcedureReferences,
} from "@/teach/approved-storage";
import { PracticeLessonSchema, type PracticeLesson } from "@/practice/lesson";
import {
  createSession,
  resumeSession,
  feedDetection,
  feedTrackingFrame,
  type PracticeSession,
  type ZoneBinding,
} from "@/practice/pipeline";
import type { Region } from "@/teach/schema";
import type { Pixels } from "@/practice/tracker";
import type { VerificationResult } from "@/procedure/schema";
import { useVoiceControl, type VoiceEvent } from "@/voice/use-voice-control";
import CommandFeedback from "@/voice/CommandFeedback";
import VoicePanel, { appendVoiceEvent } from "@/voice/VoicePanel";
import GestureControls from "@/gesture/GestureControls";
import { LOCAL_PRACTICE_COMMANDS } from "@/practice/local-commands";
import { watchSet } from "@/practice/watch-set";
import {
  LIFECYCLE_TIMEOUTS,
  initialLifecycle,
  lifecycleDiagnostics,
  requestOutcome,
  transition,
  type Lifecycle,
  type LifecycleEvent,
  type LifecycleIntent,
} from "@/practice/lifecycle";
import type { ActionOutcome } from "@/voice/use-voice-control";
import { isProcedureComplete, type GoalState } from "@/procedure/goal";
import {
  RehearsalSchema,
  RevisionSchema,
  nextRehearsal,
  rehearsalKey,
} from "@/teach/rehearsal";
function imageUrl(image: Pixels) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Camera preview unavailable.");
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
    0,
    0,
  );
  return canvas.toDataURL("image/jpeg", 0.8);
}
export default function LocalPractice() {
  const [saved, setSaved] = useState<SavedProcedure[]>([]),
    [lesson, setLesson] = useState<PracticeLesson | null>(null),
    [error, setError] = useState("");
  const [still, setStill] = useState<{ image: Pixels; url: string } | null>(
      null,
    ),
    [marks, setMarks] = useState<Record<string, Region>>({}),
    [field, setField] = useState("workspace"),
    [calibrationConsent, setCalibrationConsent] = useState(false);
  const loadGeneration = useRef(0);
  const automaticWanted = useRef(false),
    automaticAttemptAt = useRef(-Infinity),
    automaticLoading = useRef(false),
    autoFailures = useRef(0);
  const automaticSource = useRef<{
    scene: Pixels;
    objects: { id: string; box: Region; fixed: boolean; image: Pixels }[];
  } | null>(null);
  const [manualSetupOpen, setManualSetupOpen] = useState(false);
  const [references, setReferences] = useState<ProcedureReferences | null>(
    null,
  );
  const [resumeRequested, setResumeRequested] = useState(false);
  // Phase 5: final-goal completion gate from the pipeline session.
  const [goal, setGoal] = useState<GoalState | null>(null);
  const goalRef = useRef<GoalState | null>(null);
  // Phase 4: the single authoritative lifecycle, shared by UI and voice.
  const [lifecycle, setLifecycle] = useState<Lifecycle>(initialLifecycle);
  const lifecycleRef = useRef<Lifecycle>(initialLifecycle());
  const lifecycleHistory = useRef<NonNullable<Lifecycle["lastTransition"]>[]>(
    [],
  );
  const waiters = useRef<((outcome: ActionOutcome) => void)[]>([]);
  const busySince = useRef(0),
    awaiting = useRef<"setup" | "frame" | null>(null),
    cameraFailed = useRef(false);
  const spoken = useRef<{ at: number; text: string }[]>([]);
  function lc(event: LifecycleEvent) {
    const previous = lifecycleRef.current;
    const next = transition(previous, event, performance.now());
    if (next === previous) return;
    lifecycleRef.current = next;
    // Reply timestamps update the record without re-rendering every frame.
    if (event.type === "reply") return;
    if (
      next.lastTransition &&
      next.lastTransition !== previous.lastTransition
    ) {
      lifecycleHistory.current.push(next.lastTransition);
      if (lifecycleHistory.current.length > 50)
        lifecycleHistory.current.shift();
    }
    setLifecycle(next);
    const outcome = requestOutcome(next);
    if (outcome.done) {
      const pending = waiters.current;
      waiters.current = [];
      for (const resolve of pending)
        resolve({ ok: outcome.ok, message: outcome.message });
    }
  }
  /** Resolves only when the lifecycle reaches running, or fails/stops/times out. */
  function waitForOutcome(): Promise<ActionOutcome> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        waiters.current = waiters.current.filter((w) => w !== settle);
        resolve({
          ok: false,
          message:
            "Practice did not become ready in time. Check the camera view and the lesson objects, then try again.",
        });
      }, LIFECYCLE_TIMEOUTS.startMs);
      const settle = (outcome: ActionOutcome) => {
        window.clearTimeout(timer);
        resolve(outcome);
      };
      waiters.current.push(settle);
    });
  }
  const [startingVerified, setStartingVerified] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [running, setRunning] = useState(false),
    [starting, setStarting] = useState(false),
    [result, setResult] = useState<VerificationResult | null>(null),
    [detections, setDetections] = useState<ObjectDetection[]>([]),
    [notice, setNotice] = useState("Choose an approved lesson to practice."),
    [alert, setAlert] = useState<{
      kind: string;
      text: string;
      stepId: string | null;
      key: string;
    } | null>(null);
  const goalGatedV3 = lesson?.procedure.execution?.schemaVersion === 3;
  /** "Complete" only when every gate passes (V3) or all steps pass (V2). */
  const complete =
    lifecycle.state === "running" &&
    (goalGatedV3
      ? !!goal && isProcedureComplete(lesson!.procedure, goal, true)
      : result?.status === "passed");
  const goalMessage = (state: GoalState | null) =>
    !goalGatedV3
      ? "Goal verified. Monitoring continues until you stop; reversing a required state triggers correction."
      : state?.status === "complete"
        ? state.uncertain
          ? `Final goal verified earlier; the current view is unclear (${state.reason}). Not counted as a reversal.`
          : "Final goal verified. Monitoring continues; reversing it invalidates completion."
        : state?.status === "invalidated"
          ? `Completion invalidated: ${state.reason} Restore the final state.`
          : `All steps passed. Verifying the final goal: ${state?.reason ?? "waiting for fresh evidence"}`;
  const [speaking, setSpeaking] = useState(false);
  const speechGeneration = useRef(0);
  const speechWatchdog = useRef(0);
  const [guidanceOn, setGuidanceOn] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true),
    [voiceLog, setVoiceLog] = useState<VoiceEvent[]>([]);
  const latest = useRef<Pixels | null>(null),
    worker = useRef<Worker | null>(null),
    busy = useRef(false),
    generation = useRef(0),
    watchRevision = useRef(0),
    watchKey = useRef(""),
    sequence = useRef(0),
    session = useRef<PracticeSession | null>(null),
    lastAlert = useRef(""),
    lastEvent = useRef(0);
  const previousAttempts = useRef<
    {
      id: string;
      events: PracticeSession["events"];
      result: VerificationResult;
    }[]
  >([]);
  const metrics = useRef<LocalLatencyRecord[]>([]);
  const trackingCounters = useRef({
    submitted: 0,
    processed: 0,
    droppedBusy: 0,
  });
  const evidence = useRef(new EvidenceBuffer());
  const trackingMeasurements = useRef<TrackingMeasurement[]>([]);
  const lastProgressAt = useRef(0),
    stallNoticed = useRef(false),
    stallTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  function markProgress() {
    lastProgressAt.current = performance.now();
    stallNoticed.current = false;
  }
  function startStallWatch() {
    if (stallTimer.current) clearInterval(stallTimer.current);
    lastProgressAt.current = performance.now();
    stallNoticed.current = false;
    stallTimer.current = setInterval(() => {
      if (
        !stallNoticed.current &&
        worker.current &&
        session.current &&
        !session.current.stopped &&
        session.current.armed &&
        performance.now() - lastProgressAt.current > 4000
      ) {
        stallNoticed.current = true;
        setNotice(
          "Waiting for trackable movement. Hold the work steady in frame with clear light.",
        );
      }
    }, 2000);
  }
  function archiveSession() {
    const previous = session.current;
    if (
      previous?.events.length &&
      !previousAttempts.current.some((attempt) => attempt.id === previous.id)
    )
      previousAttempts.current.push({
        id: previous.id,
        events: [...previous.events],
        result: previous.result,
      });
    while (previousAttempts.current.length > 10)
      previousAttempts.current.shift();
  }
  function log(event: VoiceEvent) {
    setVoiceLog((old) => appendVoiceEvent(old, event));
  }
  function speak(text: string, recordGuidance = true) {
    if (recordGuidance) log({ at: Date.now(), source: "guidance", text });
    // Remember our own words so the microphone never treats them as commands.
    const at = Date.now();
    spoken.current = [
      ...spoken.current.filter((item) => at - item.at < 15_000),
      { at, text },
    ];
    if (
      !guidanceOn ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance !== "function"
    )
      return;
    try {
      const gen = ++speechGeneration.current;
      // Chrome drops a speak() issued in the same task as cancel(): defer
      // past it, resume a suspended engine (mobile), and pick an explicit
      // voice so platforms without a default still sound.
      window.speechSynthesis.cancel();
      setSpeaking(false);
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices?.() ?? [];
      const english = voices.find((voice) =>
        voice.lang?.toLowerCase().startsWith("en"),
      );
      if (english) {
        utterance.voice = english;
        utterance.lang = english.lang;
      }
      utterance.onstart = () => {
        if (gen === speechGeneration.current) {
          setSpeaking(true);
          log({ at: Date.now(), source: "steplint", text });
        }
      };
      utterance.onend = () => {
        if (gen === speechGeneration.current) setSpeaking(false);
      };
      utterance.onerror = () => {
        if (gen === speechGeneration.current) setSpeaking(false);
        log({
          at: Date.now(),
          source: "control",
          text: "Speech failed; visual verification continues.",
        });
      };
      window.setTimeout(() => {
        if (gen !== speechGeneration.current) return;
        try {
          window.speechSynthesis.resume?.();
          window.speechSynthesis.speak(utterance);
          // A stuck engine reports speaking forever, which suppresses every
          // voice command. Reset it past a generous per-word budget.
          const budget = Math.min(
            30000,
            Math.max(8000, text.split(/\s+/).length * 700 + 6000),
          );
          window.clearTimeout(speechWatchdog.current);
          speechWatchdog.current = window.setTimeout(() => {
            if (gen !== speechGeneration.current) return;
            try {
              if (window.speechSynthesis?.speaking) {
                window.speechSynthesis.cancel();
                setSpeaking(false);
                log({
                  at: Date.now(),
                  source: "control",
                  text: "Speech engine stuck; reset so voice commands work.",
                });
              }
            } catch {
              /* Engine reset is best effort. */
            }
          }, budget);
        } catch {
          setSpeaking(false);
          log({
            at: Date.now(),
            source: "control",
            text: "Speech is unavailable; visual verification continues.",
          });
        }
      }, 60);
    } catch {
      setSpeaking(false);
      log({
        at: Date.now(),
        source: "control",
        text: "Speech is unavailable; visual verification continues.",
      });
    }
  }
  function show(
    kind: string,
    text: string,
    stepId: string | null,
    key: string,
  ) {
    if (lastAlert.current === key) return;
    lastAlert.current = key;
    setAlert({ kind, text, stepId, key });
    log({
      at: Date.now(),
      source: kind === "instruction" ? "guidance" : "verdict",
      text,
    });
    speak(text, false);
  }
  function halt(
    reason = "Practice paused. Say resume practice to continue.",
    invalidate = false,
    kind: "pause" | "failure" | "camera" = "pause",
  ) {
    const haltedGeneration = generation.current;
    awaiting.current = null;
    automaticWanted.current = false;
    speechGeneration.current++;
    window.clearTimeout(speechWatchdog.current);
    setSpeaking(false);
    window.speechSynthesis?.cancel();
    if (stallTimer.current) {
      clearInterval(stallTimer.current);
      stallTimer.current = null;
    }
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    busy.current = false;
    setRunning(false);
    setStarting(false);
    setNotice(reason);
    if (kind === "camera") {
      cameraFailed.current = true;
      lc({ type: "camera_denied", message: reason });
    } else if (kind === "failure")
      lc({
        type: "worker_failed",
        generation: haltedGeneration,
        message: reason,
        recoverable: false,
      });
    else lc({ type: "pause", reason });
    if (session.current && invalidate && !session.current.stopped) {
      const now = performance.now();
      for (const component of session.current.procedure.components.filter((c) =>
        session.current!.procedure.steps.some(
          (s) => s.condition.componentId === c.id,
        ),
      )) {
        const outcome = feedDetection(
          session.current,
          {
            componentId: component.id,
            quality: "missing",
            center: null,
            score: null,
            reason,
          },
          now,
        );
        if (outcome.result) setResult(outcome.result);
      }
    }
    if (session.current) session.current.stopped = true;
  }
  const {
    video: videoRef,
    active: cameraActive,
    size: cameraSize,
    requesting: cameraRequesting,
    start: startCamera,
    stop: stopCamera,
    getStats: cameraStats,
  } = useGuideCamera(
    (image, now) => {
      if (!latest.current) setFrameReady(true);
      latest.current = image;
      if (
        !worker.current &&
        automaticWanted.current &&
        automaticSource.current &&
        now - automaticAttemptAt.current > 1200
      ) {
        automaticAttemptAt.current = now;
        handlers.current.automaticStart(image);
      }
      if (!worker.current || !session.current) return;
      if (busy.current) {
        trackingCounters.current.droppedBusy++;
        const limit =
          awaiting.current === "setup"
            ? LIFECYCLE_TIMEOUTS.setupMs
            : LIFECYCLE_TIMEOUTS.frameMs;
        if (awaiting.current && performance.now() - busySince.current > limit)
          handlers.current.workerTimeout(awaiting.current);
        return;
      }
      trackingCounters.current.submitted++;
      busy.current = true;
      busySince.current = performance.now();
      awaiting.current = "frame";
      const copy = new Uint8ClampedArray(image.data);
      const frameId = `frame-${++sequence.current}`;
      evidence.current.add(frameId, now, image);
      // Role-aware watch set; a new revision whenever membership changes.
      const watch = watchSet(session.current.procedure, session.current.result);
      if (watch.key !== watchKey.current) {
        watchKey.current = watch.key;
        watchRevision.current++;
      }
      worker.current.postMessage(
        {
          type: "frame",
          generation: generation.current,
          image: { width: image.width, height: image.height, data: copy },
          timestampMs: now,
          frameId,
          watchRevision: watchRevision.current,
          watch: { required: watch.required, optional: watch.optional },
        },
        [copy.buffer],
      );
    },
    (reason) => halt(reason, true, "camera"),
    { width: 320, height: 240, intervalMs: 33 },
  );
  const handlers = useRef({
    halt,
    show,
    automaticStart: (image: Pixels) =>
      start({ image, source: automaticSource.current! }),
    workerTimeout,
  });
  useEffect(() => {
    handlers.current = {
      halt,
      show,
      automaticStart: (image: Pixels) =>
        start({ image, source: automaticSource.current! }),
      workerTimeout,
    };
  });
  useEffect(
    () => () => {
      worker.current?.terminate();
      if (stallTimer.current) clearInterval(stallTimer.current);
      speechGeneration.current++;
      window.clearTimeout(speechWatchdog.current);
      window.speechSynthesis?.cancel();
    },
    [],
  );
  const speakRef = useRef(speak);
  speakRef.current = speak;
  const announcedCamera = useRef(false);
  useEffect(() => {
    if (cameraActive && !announcedCamera.current) {
      announcedCamera.current = true;
      speakRef.current(
        lesson?.automaticSetup
          ? "Camera on. Show the starting view; automatic tracking begins when it is recognized."
          : "Camera on. Show the demonstrated starting view, then capture the setup for calibration.",
      );
    }
    if (!cameraActive) announcedCamera.current = false;
    // Spoken through the ref so the announcement always uses fresh state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive, lesson?.automaticSetup]);
  const [rehearsal, setRehearsal] = useState(false);
  const rehearsalRevision = useRef<string | null>(null);
  useEffect(() => {
    // Rehearsal status comes only from the canonical verifier's terminal
    // status for the exact revision Teach handed over; loading or rendering
    // never records a result.
    const revision = rehearsalRevision.current;
    if (!rehearsal || !lesson || !revision) return;
    const key = rehearsalKey(lesson.procedure.id);
    try {
      const raw = localStorage.getItem(key);
      const previous = raw ? RehearsalSchema.safeParse(JSON.parse(raw)) : null;
      const next = nextRehearsal(
        previous?.success ? previous.data : null,
        // A rehearsal passes only when the full completion gate passes.
        result?.status === "passed" && !complete ? "verifying" : result?.status,
        revision,
        Date.now(),
      );
      if (next) localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Storage blocked: nothing is recorded, so Teach truthfully shows this
      // revision's rehearsal as not run. A result is never assumed.
    }
  }, [rehearsal, lesson, result?.status, complete]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const handoff = sessionStorage.getItem("steplint-approved-handoff");
        if (handoff) {
          await saveApprovedProcedure(handoff);
          sessionStorage.removeItem("steplint-approved-handoff");
        }
        // Rehearsal drafts arrive via localStorage (new tabs do not share
        // sessionStorage). They load in memory only and are never saved.
        if (
          new URLSearchParams(window.location.search).get("rehearsal") === "1"
        ) {
          const draft = localStorage.getItem("steplint-rehearsal-handoff");
          localStorage.removeItem("steplint-rehearsal-handoff");
          if (!draft)
            throw Error(
              "Rehearsal data is missing. Start the test from Teach review.",
            );
          const revision = RevisionSchema.safeParse(
            (JSON.parse(draft) as { rehearsalRevision?: unknown })
              .rehearsalRevision,
          );
          rehearsalRevision.current = revision.success ? revision.data : null;
          if (active) setRehearsal(true);
          await load(draft, true);
          return;
        }
        const rows = await listApprovedProcedures();
        const ordered = [...rows].sort((a, b) => b.savedAt - a.savedAt);
        if (!active) return;
        setSaved(ordered);
        const selectedId = new URLSearchParams(window.location.search).get(
          "lesson",
        );
        const selected = selectedId
          ? ordered.find((row) => row.id === selectedId)
          : undefined;
        if (selectedId && !selected)
          throw Error(
            "This lesson is not saved in this browser. Import the approved lesson or choose another lesson.",
          );
        if (selected) await load(selected.raw);
        else if (handoff) await load(handoff);
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Approved lesson storage failed.",
          );
      }
    })();
    return () => {
      active = false;
    };
    // Mount-once intake: load identity is intentionally excluded so a
    // consumed rehearsal is never re-loaded on re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function load(raw: string, rehearsalRun = false) {
    const loading = ++loadGeneration.current;
    halt(rehearsalRun ? "Loading rehearsal…" : "Loading approval…");
    setError("");
    try {
      const validated = rehearsalRun
        ? PracticeLessonSchema.parse({
            ...JSON.parse(raw),
            origin: "teach" as const,
          })
        : loadApprovedLesson(raw);
      if (loading !== loadGeneration.current) return;
      setLesson(validated);
      setManualSetupOpen(false);
      automaticSource.current = null;
      if (validated.automaticSetup) {
        const setup = validated.automaticSetup;
        automaticLoading.current = true;
        try {
          const frames = await Promise.all(
            setup.frames.map(async (frame) => {
              const blob = await (await fetch(frame.image)).blob();
              const bitmap = await createImageBitmap(blob);
              try {
                const canvas = document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const context = canvas.getContext("2d");
                if (!context || canvas.width > 320 || canvas.height > 240)
                  throw Error("Invalid automatic source image.");
                context.drawImage(bitmap, 0, 0);
                const image = context.getImageData(
                  0,
                  0,
                  canvas.width,
                  canvas.height,
                );
                return {
                  frame: frame.frame,
                  image: {
                    width: image.width,
                    height: image.height,
                    data: image.data,
                  },
                };
              } finally {
                bitmap.close();
              }
            }),
          );
          if (loading !== loadGeneration.current) return;
          automaticSource.current = {
            scene: frames.find((frame) => frame.frame === setup.sceneFrame)!
              .image,
            objects: setup.objects.map((object) => ({
              id: object.id,
              box: object.box,
              fixed: object.fixed,
              image: frames.find((frame) => frame.frame === object.frame)!
                .image,
            })),
          };
        } finally {
          automaticLoading.current = false;
        }
      }
      if (loading !== loadGeneration.current) return;
      const setup = validated.automaticSetup;
      const goalFrame = Math.max(
        -1,
        ...validated.procedure.steps.map(
          (step) => step.measurement?.sourceFrames?.result ?? -1,
        ),
      );
      const beforeImage = setup?.frames.find(
        (frame) => frame.frame === setup.sceneFrame,
      )?.image;
      const goalImage = setup?.frames.find(
        (frame) => frame.frame === goalFrame,
      )?.image;
      const portableReferences =
        beforeImage && goalImage && validated.sourceLesson
          ? {
              before: beforeImage,
              goal: goalImage,
              beforeMs:
                validated.sourceLesson.media.frameTimesMs[setup!.sceneFrame],
              goalMs: validated.sourceLesson.media.frameTimesMs[goalFrame],
            }
          : null;
      setReferences(
        portableReferences ??
          saved.find((row) => row.raw === raw)?.references ??
          null,
      );
      setResumeRequested(false);
      archiveSession();
      session.current = null;
      setStartingVerified(false);
      setAlert(null);
      lastAlert.current = "";
      setDetections([]);
      setResult(null);
      setMarks({});
      setStill(null);
      setCalibrationConsent(false);
      setNotice(
        validated.automaticSetup
          ? "Opening the camera. Automatic tracking will begin when the starting view is recognized."
          : "This older export has no automatic visual references. Create a fresh Teach approval for automatic Practice; manual setup is available under settings.",
      );
      if (validated.automaticSetup) {
        automaticWanted.current = true;
        automaticAttemptAt.current = -Infinity;
        latest.current = null;
        const video = validated.sourceLesson?.media.info.video;
        lc({
          type: "start",
          intent: "start",
          cameraOn: false,
          automatic: true,
        });
        void openCamera(video ? video.width / video.height : undefined);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Approved lesson could not load.",
      );
    }
  }
  /** A worker that stops replying must never leave Practice busy forever. */
  function workerTimeout(stage: "setup" | "frame") {
    const timedOut = generation.current;
    generation.current++; // any late reply from the silent worker is stale
    worker.current?.terminate();
    worker.current = null;
    busy.current = false;
    awaiting.current = null;
    setRunning(false);
    setStarting(false);
    if (session.current) {
      session.current.stopped = true;
      setResumeRequested(true);
    }
    const exhausted = ++autoFailures.current >= 5;
    // automaticWanted is only the "attempt setup" flag and is cleared once
    // setup succeeds; automatic lessons must re-enable it to retry (as the
    // calibration-lost path does), or recovery would never start.
    automaticWanted.current = !exhausted && !!lesson?.automaticSetup;
    automaticAttemptAt.current = performance.now();
    const message =
      stage === "setup"
        ? "The tracker did not finish setting up in time."
        : "The tracker stopped responding.";
    lc({ type: "worker_timeout", generation: timedOut, message });
    if (exhausted)
      lc({
        type: "worker_failed",
        generation: timedOut,
        message: `${message} Automatic retries stopped; restart Practice.`,
        recoverable: false,
      });
    setNotice(
      automaticWanted.current
        ? `${message} Retrying automatically; verified work is kept.`
        : `${message} Restart Practice to try again.`,
    );
  }
  const cameraAspect = () =>
    lesson?.sourceLesson?.media.info.video
      ? lesson.sourceLesson.media.info.video.width /
        lesson.sourceLesson.media.info.video.height
      : undefined;
  /** Open the camera through the lifecycle (permission → stream). */
  async function openCamera(aspect = cameraAspect()) {
    cameraFailed.current = false;
    lc({ type: "camera_requested" });
    latest.current = null;
    setFrameReady(false);
    await startCamera(aspect);
    if (!cameraFailed.current) lc({ type: "camera_ready" });
  }
  function closeCamera(reason = "Camera stopped.") {
    halt(reason);
    stopCamera();
    lc({ type: "camera_stopped" });
  }
  /**
   * The ONE start/resume/restart operation used by on-screen controls and
   * voice commands alike. Resolves only when the lifecycle reports running
   * (verifier armed) or a definite failure/timeout.
   */
  function ensurePracticeRunning(
    intent: LifecycleIntent,
  ): Promise<ActionOutcome> {
    if (!lesson)
      return Promise.resolve({
        ok: false,
        message: "Choose an approved lesson first.",
      });
    if (!lesson.automaticSetup) {
      // Older exports without automatic references keep the existing manual
      // calibration rules (optional recovery, not the default workflow).
      if (!cameraActive) {
        void openCamera();
        return Promise.resolve({
          ok: false,
          message:
            "This lesson needs manual calibration. Camera starting: capture the setup, mark the objects and confirm.",
        });
      }
      if (worker.current)
        return Promise.resolve(
          lifecycleRef.current.state === "running"
            ? { ok: true, message: "Practice is already running." }
            : { ok: false, message: "Practice is already starting." },
        );
      if (!still) {
        const opened = prepareSetup(intent === "resume");
        return Promise.resolve({
          ok: false,
          message: opened
            ? "Setup captured. Mark every object, zone and reference, then confirm calibration."
            : "Wait for a camera frame, then try again.",
        });
      }
      if (!calibrationConsent || fields.some((field) => !marks[field.id]))
        return Promise.resolve({
          ok: false,
          message:
            "Mark every required object, zone and reference, then confirm calibration first.",
        });
      lc({ type: "start", intent, cameraOn: true, automatic: false });
      const outcome = waitForOutcome();
      start();
      return outcome;
    }
    const state = lifecycleRef.current.state;
    if (
      intent !== "restart" &&
      worker.current &&
      ["acquiring_initial_objects", "arming", "running", "recovering"].includes(
        state,
      )
    )
      // Repeated start requests never create a second worker or session.
      return state === "running"
        ? Promise.resolve({ ok: true, message: "Practice is already running." })
        : waitForOutcome();
    const sameLesson =
      session.current?.procedure.id === lesson.procedure.id &&
      session.current?.procedure.version === lesson.procedure.version;
    if (intent === "restart") {
      // A new attempt: the current one is archived by start() and stays in
      // the downloaded audit. No stale worker or observations carry over.
      if (worker.current)
        halt("Restart requested. The previous attempt is kept in the audit.");
      setResumeRequested(false);
    } else
      setResumeRequested(
        !!session.current && sameLesson && !!session.current.stopped,
      );
    setManualSetupOpen(false);
    setStill(null);
    setError("");
    autoFailures.current = 0;
    automaticWanted.current = true;
    automaticAttemptAt.current = -Infinity;
    lc({ type: "start", intent, cameraOn: cameraActive, automatic: true });
    setNotice(
      intent === "restart"
        ? "Starting a new attempt automatically."
        : session.current?.stopped
          ? "Resuming automatic tracking. Verified work is retained."
          : "Finding the starting view automatically.",
    );
    const outcome = waitForOutcome();
    if (!cameraActive) void openCamera();
    return outcome;
  }
  function pausePractice(): ActionOutcome {
    if (!worker.current && lifecycleRef.current.state !== "recovering")
      return { ok: false, message: "Practice is not running." };
    halt();
    return {
      ok: true,
      message:
        "Practice paused. Verified work is kept; say resume practice to continue.",
    };
  }
  function prepareSetup(resume = false) {
    if (!latest.current || !cameraActive) {
      setError("Start the camera and wait for a fresh frame first.");
      return false;
    }
    if (resume && (!session.current || !session.current.stopped)) {
      setError(
        "Pause the current session before resuming with fresh calibration.",
      );
      return false;
    }
    if (!resume && worker.current)
      halt("New attempt requested. Prior audit is retained.");
    const image = {
      width: latest.current.width,
      height: latest.current.height,
      data: new Uint8ClampedArray(latest.current.data),
    };
    setStill({ image, url: imageUrl(image) });
    setMarks({});
    setCalibrationConsent(false);
    setResumeRequested(resume);
    setNotice(
      resume
        ? "Resume setup: completed actions are retained. Recheck identities/zones; restore the starting view only for unfinished actions."
        : "Confirm the new setup. Objects must be in the demonstrated starting positions.",
    );
    return true;
  }
  function start(automatic?: {
    image: Pixels;
    source: NonNullable<typeof automaticSource.current>;
  }) {
    const setupImage = automatic?.image ?? still?.image;
    if (
      !lesson ||
      !setupImage ||
      (!automatic && !calibrationConsent) ||
      !cameraActive ||
      worker.current
    )
      return;
    setError("");
    try {
      // Unlock the speech engine on the starting gesture: later verdicts
      // speak from async callbacks where mobile browsers may stay muted.
      window.speechSynthesis?.getVoices?.();
      window.speechSynthesis?.resume?.();
    } catch {
      /* Speech warm-up is best effort; verification continues. */
    }
    startStallWatch();
    try {
      const bindings: ZoneBinding[] = lesson.zoneBindings.map((b) => ({
        zoneId: b.zoneId,
        region: automatic ? b.region : marks[`zone:${b.zoneId}`],
      }));
      const resuming =
        resumeRequested &&
        session.current?.procedure.id === lesson.procedure.id &&
        session.current?.procedure.version === lesson.procedure.version;
      const objects = automatic
        ? automatic.source.objects
        : lesson.procedure.components.map((c) => ({
            id: c.id,
            fixed: !lesson.procedure.steps.some(
              (s) => s.condition.componentId === c.id,
            ),
            box: marks[`object:${c.id}`],
          }));
      if (
        (!automatic && !marks.workspace) ||
        objects.some((o) => !o.box) ||
        bindings.some((b) => !b.region)
      )
        throw Error("Mark every object, zone and fixed workspace reference.");
      if (resumeRequested && !resuming)
        throw Error(
          "Resume requires the same approved procedure. Start a new attempt explicitly instead.",
        );
      const previousSession = session.current;
      let next =
        automatic && resuming && session.current
          ? session.current
          : resuming && session.current
            ? resumeSession(session.current, bindings, performance.now())
            : createSession(lesson.procedure, bindings, performance.now());
      if (automatic && !resuming) {
        next.calibrations[0].humanConfirmed = false;
        next.calibrations[0].method = "source_alignment";
      }
      const gen = ++generation.current;
      const localWorker = new Worker(
        new URL("../../practice/local-tracking-worker.ts", import.meta.url),
      );
      worker.current = localWorker;
      busy.current = true;
      busySince.current = performance.now();
      awaiting.current = "setup";
      lc({ type: "worker_started", generation: gen });
      setStarting(true);
      setAlert(null);
      setDetections([]);
      setStartingVerified(false);
      if (!resuming && !automatic) archiveSession();
      session.current = next;
      setResult(next.result);
      // Announce only learner-initiated starts: automatic retries must stay
      // silent, or repeated setup failures would stutter speech and suppress
      // voice commands while the engine is always speaking.
      if (!automatic) {
        const firstPending = next.procedure.steps.find(
          (step) =>
            next.result.steps.find((state) => state.stepId === step.id)
              ?.status !== "passed",
        );
        speak(
          firstPending
            ? `Practice started. ${firstPending.description}`
            : "Practice started. Goal verified; keep required states in place.",
        );
      }
      lastEvent.current = resuming ? next.result.events.length : 0;
      lastAlert.current = "";
      if (!resuming) metrics.current = [];
      trackingCounters.current = { submitted: 0, processed: 0, droppedBusy: 0 };
      if (!resuming) evidence.current = new EvidenceBuffer();
      localWorker.onmessage = (event: MessageEvent<unknown>) => {
        try {
          const parsed = LocalWorkerReplySchema.safeParse(event.data);
          if (!parsed.success) {
            handlers.current.halt(
              "Invalid tracking response; verification stopped.",
              true,
              "failure",
            );
            return;
          }
          const reply = parsed.data;
          // Stale generation: a reply from an earlier worker never revives it.
          if (reply.generation !== generation.current) return;
          busy.current = false;
          awaiting.current = null;
          if (reply.type !== "error") {
            trackingMeasurements.current = reply.measurements;
            autoFailures.current = 0;
          }
          if (reply.type === "error" && automatic && automaticWanted.current) {
            localWorker.terminate();
            worker.current = null;
            busy.current = false;
            session.current = previousSession;
            if (previousSession) previousSession.stopped = true;
            setResult(previousSession?.result ?? null);
            setStarting(false);
            setDetections([]);
            // Repeated setup failures must not retry forever: each attempt
            // re-announces and re-chokes speech while suppressing voice
            // commands, so stop asking after a short bounded run.
            const exhausted = ++autoFailures.current >= 5;
            lc({
              type: "worker_failed",
              generation: reply.generation,
              message: reply.message,
              recoverable: !exhausted,
            });
            if (exhausted) {
              automaticWanted.current = false;
              setNotice(
                "Automatic setup keeps failing. Adjust the view or set up manually.",
              );
              speak(
                "Automatic setup keeps failing. Adjust the view, or capture the setup for manual calibration.",
              );
            } else {
              setNotice(reply.message);
            }
            return;
          }
          if (reply.type === "error") {
            setError(reply.message);
            handlers.current.halt(reply.message, true, "failure");
            return;
          }
          if (reply.type === "calibrated") {
            if (automatic && reply.translation) {
              if (!resuming && previousSession) {
                session.current = previousSession;
                archiveSession();
                session.current = next;
              }
              // Each zone follows its own stationary reference when given.
              const aligned = lesson.zoneBindings.map((binding, index) => ({
                ...binding,
                region: translateBox(
                  binding.region,
                  reply.zoneTranslations?.[index]?.x ?? reply.translation!.x,
                  reply.zoneTranslations?.[index]?.y ?? reply.translation!.y,
                ),
              }));
              if (resuming && previousSession)
                next = resumeSession(
                  previousSession,
                  aligned,
                  performance.now(),
                  "source_alignment",
                );
              else next.bindings = aligned;
              session.current = next;
              setResult(next.result);
              lastEvent.current = resuming ? next.result.events.length : 0;
              const epoch = next.calibrations.at(-1)!;
              epoch.bindings = structuredClone(aligned);
              epoch.humanConfirmed = false;
              epoch.method = "source_alignment";
            }
            automaticWanted.current = false;
            setStarting(false);
            setRunning(true);
            setStill(null);
            lc({ type: "setup_complete", generation: reply.generation });
            if (session.current?.armed)
              lc({ type: "armed", generation: reply.generation });
            setNotice(
              "Automatic tracking active. Checking starting positions before the first instruction.",
            );
            return;
          }
          trackingCounters.current.processed++;
          lc({ type: "reply", generation: reply.generation });
          const active = session.current;
          if (!active) return;
          if (
            performance.now() - reply.timestampMs >
            Math.min(
              ...active.procedure.steps.map(
                (step) => step.measurement?.maxObservationGapMs ?? 600,
              ),
            )
          ) {
            handlers.current.halt(
              "Tracking evidence arrived too late. Verification stopped; recalibrate before continuing.",
              true,
              "failure",
            );
            return;
          }
          // A reply measured for an earlier watch-set revision is never applied.
          if (
            reply.watchRevision !== undefined &&
            reply.watchRevision !== watchRevision.current
          )
            return;
          setDetections(reply.detections);
          const wasArmed = active.armed;
          const frame = feedTrackingFrame(active, {
            ...reply,
            watchKey: watchKey.current,
          });
          if (frame.stale) return;
          if (
            goalGatedV3 &&
            (frame.goal.status !== goalRef.current?.status ||
              frame.goal.uncertain !== goalRef.current?.uncertain)
          ) {
            const before = goalRef.current?.status;
            goalRef.current = frame.goal;
            setGoal(frame.goal);
            if (frame.goal.status !== "incomplete")
              setNotice(goalMessage(frame.goal));
            if (frame.goal.status === "complete" && before !== "complete")
              speak("Final goal verified.");
            if (frame.goal.status === "invalidated" && before === "complete")
              speak("Completion invalidated. Restore the final state.");
          }
          const unseen = reply.identityEvents.find(
            (event) => event.status === "needs_user_view",
          );
          if (unseen) {
            const name =
              active.procedure.components.find(
                (component) => component.id === unseen.objectId,
              )?.description ?? unseen.objectId;
            setNotice(`${name}: ${unseen.reason}`);
          }
          const updated = frame.changed ? frame.result : null;
          const warning = frame.warning;
          if (updated || warning) markProgress();
          for (const { objectId, outcome } of frame.observations) {
            if (outcome.evidenceFrames?.[0])
              evidence.current.hold(
                `${objectId}:origin`,
                outcome.evidenceFrames[0],
              );
            if (outcome.evidenceFrames?.[1])
              evidence.current.hold(
                `${objectId}:onset`,
                outcome.evidenceFrames[1],
              );
            if (
              outcome.result?.events.at(-1)?.status === "passed" ||
              outcome.result?.events.at(-1)?.status === "failed"
            )
              evidence.current.commit(outcome.evidenceFrames ?? []);
          }
          if (
            !reply.calibrationValid &&
            lesson.automaticSetup &&
            !manualSetupOpen
          ) {
            active.stopped = true;
            localWorker.terminate();
            worker.current = null;
            busy.current = false;
            setRunning(false);
            setStarting(false);
            setResumeRequested(true);
            automaticWanted.current = true;
            automaticAttemptAt.current = performance.now();
            lc({
              type: "recover",
              generation: reply.generation,
              reason: "View unclear; finding the work area again.",
            });
            handlers.current.show(
              "needs_verification",
              "View unclear. Finding the work area again automatically; no step was verified from missing evidence.",
              null,
              "automatic-realignment",
            );
            setNotice(
              "Finding the work area again automatically. Keep the required objects visible.",
            );
            return;
          }
          if (active.armed && !wasArmed)
            lc({ type: "armed", generation: reply.generation });
          if (active.armed && !wasArmed) {
            setStartingVerified(true);
            const next = active.procedure.steps.find(
              (step) =>
                active.result.steps.find((state) => state.stepId === step.id)
                  ?.status !== "passed",
            );
            if (next)
              handlers.current.show(
                "instruction",
                next.description,
                next.id,
                `start:${active.id}:${active.calibrations.length}`,
              );
            setNotice(
              next
                ? "Automatic tracking active. Starting positions verified. Follow the current instruction."
                : goalMessage(frame.goal),
            );
          }
          if (updated) {
            setResult(updated);
            const newEvents = updated.events.slice(lastEvent.current);
            lastEvent.current = updated.events.length;
            const significant = newEvents.filter((e) => e.status !== "ignored");
            for (const decision of feedbackEvents(updated, significant)) {
              const step = active.procedure.steps.find(
                (s) => s.id === decision.stepId,
              );
              const text =
                decision.status === "passed"
                  ? `${step?.description ?? "Step"} Verified.`
                  : decision.status === "failed"
                    ? `Stop. ${decision.recovery?.instruction ?? decision.reason}`
                    : decision.reason;
              handlers.current.show(
                decision.status,
                text,
                decision.stepId,
                `${decision.stepId}:${decision.status}:${decision.decision ?? decision.reason}`,
              );
            }
            const record = {
              frameId: reply.frameId,
              frameCallbackAtMs: reply.timestampMs,
              observedAtMs: significant.at(-1)?.observedAtMs,
              decision: significant.length > 0,
              confirmedAtMs: performance.now(),
              workerMs: reply.processingMs,
              status: updated.status,
            };
            metrics.current.push(record);
            if (metrics.current.length > 1000) metrics.current.shift();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                Object.assign(record, { paintAtMs: performance.now() });
              }),
            );
            if (updated.status === "needs_verification")
              setNotice(
                "Monitoring active. Some required evidence is unclear; restore a clear view before continuing.",
              );
            if (updated.status === "passed") setNotice(goalMessage(frame.goal));
          }
          if (
            warning &&
            !active.result.steps.some((step) => step.status === "failed") &&
            !updated?.events
              .slice(-reply.detections.length)
              .some((e) => e.status === "failed")
          )
            handlers.current.show(
              "warning",
              `Careful. ${warning.instruction}`,
              warning.stepId,
              `warning:${warning.stepId}`,
            );
          if (!warning && lastAlert.current.startsWith("warning:")) {
            lastAlert.current = "";
            setAlert(null);
          }
          if (!reply.calibrationValid)
            handlers.current.halt(reply.reason ?? "Calibration lost.", true);
        } catch (error) {
          handlers.current.halt(
            error instanceof Error
              ? error.message
              : "Invalid local evidence; verification stopped.",
            true,
          );
        }
      };
      localWorker.onerror = () =>
        handlers.current.halt(
          "The local tracker stopped. Recalibrate before continuing.",
          true,
          "failure",
        );
      const copy = new Uint8ClampedArray(setupImage.data);
      const startWatch = watchSet(next.procedure, next.result);
      localWorker.postMessage(
        {
          ...(automatic
            ? {
                type: "bootstrap",
                source: {
                  ...automatic.source,
                  zones: lesson.zoneBindings.map((binding) => binding.region),
                  objects: automatic.source.objects.map((object) => ({
                    ...object,
                    // Only active required identities must be found now;
                    // dormant later objects and supporting objects are not.
                    required: startWatch.required.includes(object.id),
                    active:
                      startWatch.required.includes(object.id) ||
                      startWatch.optional.includes(object.id),
                    expectedBox: resuming
                      ? lesson.zoneBindings.find(
                          (binding) =>
                            binding.zoneId ===
                            next.verifier.expectedResumeZones()[object.id],
                        )?.region
                      : undefined,
                  })),
                },
              }
            : {
                type: "calibrate",
                calibration: { objects, workspace: marks.workspace },
              }),
          generation: gen,
          image: {
            width: setupImage.width,
            height: setupImage.height,
            data: copy,
          },
        },
        [copy.buffer],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start tracking.");
      if (session.current) setResult(session.current.result);
      halt();
    }
  }
  const voice = useVoiceControl({
    commands: LOCAL_PRACTICE_COMMANDS,
    enabled: voiceOn,
    // Half-duplex turn-taking: a valid command stops our speech and runs;
    // our own recent words are never treated as commands.
    halfDuplex: true,
    recentSpeech: () =>
      spoken.current
        .filter((item) => Date.now() - item.at < 15_000)
        .map((item) => item.text),
    onInterruptSpeech: () => {
      speechGeneration.current++;
      setSpeaking(false);
      window.speechSynthesis?.cancel();
    },
    onAction: (id, disposition) => {
      if (disposition !== "executed") {
        if (disposition === "needs-confirmation")
          speak(
            "To start a new attempt, say the wake word and then confirm restart practice. Verified history will remain in the audit.",
          );
        return;
      }
      // Start, resume and restart go through the same lifecycle operation
      // as the on-screen controls; success is reported only when it runs.
      if (id === "start-practice" || id === "start-camera")
        return ensurePracticeRunning(
          session.current?.stopped ? "resume" : "start",
        ).then((outcome) => {
          speak(outcome.message);
          return outcome;
        });
      if (id === "resume-practice")
        return ensurePracticeRunning("resume").then((outcome) => {
          speak(outcome.message);
          return outcome;
        });
      if (id === "restart-practice")
        return ensurePracticeRunning("restart").then((outcome) => {
          speak(outcome.message);
          return outcome;
        });
      if (id === "stop-camera") {
        closeCamera();
        return Promise.resolve({ ok: true, message: "Camera stopped." });
      }
      if (id === "capture-setup") {
        if (worker.current) {
          speak("Pause practice before changing calibration.");
          return false;
        }
        return prepareSetup(false);
      }
      if (id === "end-practice") {
        closeCamera("Practice ended. The last observed result is retained.");
        lc({
          type: "end",
          reason: "Practice ended. The last observed result is retained.",
        });
        return Promise.resolve({
          ok: true,
          message: "Practice ended. The last observed result is retained.",
        });
      }
      if (id === "pause-practice") {
        const outcome = pausePractice();
        if (!outcome.ok) speak(outcome.message);
        return Promise.resolve(outcome);
      }
      if (id === "stop-speaking") {
        speechGeneration.current++;
        setSpeaking(false);
        window.speechSynthesis?.cancel();
        return;
      }
      // repeat / what next
      if (!session.current) {
        speak("Choose an approved lesson and start practice first.");
        return false;
      }
      if (session.current.stopped) {
        speak("Practice is paused. Say resume practice to continue.");
        return false;
      }
      const next = session.current.procedure.steps.find(
        (s) =>
          session.current?.result.steps.find((state) => state.stepId === s.id)
            ?.status !== "passed",
      );
      speak(next?.description ?? goalMessage(goalRef.current));
    },
    onEvent: log,
  });
  function download() {
    const data = {
      schemaVersion: 2,
      method: "local-zone-v2",
      camera: cameraStats(),
      procedureId: lesson?.procedure.id,
      events: session.current?.events ?? [],
      result: session.current?.result,
      latency: metrics.current,
      latencySummary: summarizeLocalLatency(metrics.current),
      trackingCounters: trackingCounters.current,
      lifecycle: lifecycleDiagnostics(lifecycleRef.current),
      lifecycleHistory: lifecycleHistory.current,
      identityAudit: session.current?.identityAudit ?? [],
      calibrations: session.current?.calibrations ?? [],
      evidence: evidence.current.frames().map((frame) => ({
        id: frame.id,
        atMs: frame.atMs,
        url: imageUrl(frame.image),
      })),
      trackingMeasurements: trackingMeasurements.current,
      previousAttempts: previousAttempts.current,
      voiceLog,
      physicalAcceptance: false,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "steplint-local-practice-diagnostics.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  const fields = lesson
    ? [
        {
          id: "workspace",
          name: "Fixed workspace reference (separate textured area)",
        },
        ...lesson.procedure.components.map((c) => ({
          id: `object:${c.id}`,
          name: `Object: ${c.description}`,
        })),
        ...lesson.zoneBindings.map((b) => ({
          id: `zone:${b.zoneId}`,
          name: `Zone: ${lesson.procedure.zones.find((z) => z.id === b.zoneId)?.description ?? b.zoneId}`,
        })),
      ]
    : [];
  let lastHeard = "",
    lastGuide = "";
  for (const event of voiceLog) {
    if (event.source === "you") lastHeard = event.text;
    else lastGuide = event.text;
  }
  // Live tracking boxes must sit on the rendered video pixels, not the panel:
  // measure the fitted video rect inside its area every render (cheap reads,
  // refreshed by each tracking frame while running).
  const trackingOverlay = (() => {
    const v = videoRef.current;
    const vw = v?.videoWidth || cameraSize.width;
    const vh = v?.videoHeight || cameraSize.height;
    const box = v?.getBoundingClientRect();
    const area = v?.parentElement?.getBoundingClientRect();
    if (
      !vw ||
      !vh ||
      !box?.width ||
      !box?.height ||
      !area?.width ||
      !area?.height
    )
      return null;
    const ratio = vw / vh;
    let cw = box.width,
      ch = box.width / ratio;
    if (ch > box.height) {
      ch = box.height;
      cw = box.height * ratio;
    }
    return {
      left: ((box.left - area.left + (box.width - cw) / 2) / area.width) * 100,
      top: ((box.top - area.top + (box.height - ch) / 2) / area.height) * 100,
      width: (cw / area.width) * 100,
      height: (ch / area.height) * 100,
    };
  })();
  const calibrating = still && lesson && !running;
  function objectColour(id: string) {
    const matching =
      lesson?.procedure.steps.filter(
        (step) => step.condition.componentId === id,
      ) ?? [];
    if (
      alert &&
      matching.some((step) => step.id === alert.stepId) &&
      ["failed", "needs_verification", "warning"].includes(alert.kind)
    )
      return alert.kind === "failed" ? "#dc2626" : "#d97706";
    const current =
      matching.find(
        (step) =>
          result?.steps.find((state) => state.stepId === step.id)?.status !==
          "passed",
      ) ?? matching.at(-1);
    const status = result?.steps.find(
      (state) => state.stepId === current?.id,
    )?.status;
    return status === "passed"
      ? "#16a34a"
      : status === "failed"
        ? "#dc2626"
        : status === "needs_verification"
          ? "#d97706"
          : "#0891b2";
  }
  return (
    <Workspace mode="practice">
      <div className="w-full space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-lg font-bold">Practice</h1>
          <span className="text-sm text-slate-600">
            {lesson?.procedure.title}
          </span>
          {!cameraActive ? (
            <button
              disabled={!lesson || cameraRequesting}
              onClick={() => {
                if (lesson?.automaticSetup)
                  void ensurePracticeRunning(
                    session.current?.stopped ? "resume" : "start",
                  );
                else void openCamera();
              }}
            >
              Start camera
            </button>
          ) : (
            <>
              <button onClick={() => closeCamera()}>Stop camera</button>
              {!running &&
                !starting &&
                (!lesson?.automaticSetup || manualSetupOpen) && (
                  <button
                    disabled={!frameReady}
                    onClick={() => prepareSetup(false)}
                  >
                    Capture setup for calibration
                  </button>
                )}
            </>
          )}
          {!running &&
            !starting &&
            cameraActive &&
            result &&
            (!lesson?.automaticSetup || manualSetupOpen) && (
              <button onClick={() => prepareSetup(true)}>
                Resume with fresh calibration
              </button>
            )}
          {running && (
            <button onClick={() => pausePractice()}>Pause practice</button>
          )}
          {!running && lesson?.automaticSetup && result && (
            <button onClick={() => void ensurePracticeRunning("resume")}>
              Resume practice
            </button>
          )}
          <p
            id="local-practice-status"
            role="status"
            data-lifecycle-state={lifecycle.state}
            className="text-sm text-slate-600"
          >
            {notice}
          </p>
        </div>
        <div className={calibrating ? "hidden" : "contents space-y-2"}>
          <div className="flex flex-wrap items-stretch gap-2 text-xs">
            {lesson && (
              <section
                aria-label="Current step and goal"
                className="min-w-52 flex-1 space-y-0.5 rounded-2xl border bg-white p-2"
              >
                <p className="truncate font-semibold">
                  Goal: {lesson.procedure.execution?.goal}
                </p>
                <p>
                  Next:{" "}
                  {!running
                    ? lesson.automaticSetup
                      ? "Show the starting view; automatic tracking is preparing."
                      : "Open a fresh Teach approval for automatic tracking."
                    : !startingVerified
                      ? "Checking starting positions."
                      : (lesson.procedure.steps.find(
                          (step) =>
                            result?.steps.find(
                              (state) => state.stepId === step.id,
                            )?.status !== "passed",
                        )?.description ??
                        (complete
                          ? "Final goal verified; keep it in place."
                          : goalGatedV3
                            ? "All steps passed; verifying the final goal."
                            : "Goal verified; keep required states in place."))}
                </p>
              </section>
            )}
            <div className="min-w-52 flex-1 space-y-0.5 rounded-2xl border bg-white p-2">
              <label className="flex gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={voiceOn}
                  onChange={(e) => {
                    setVoiceOn(e.target.checked);
                    if (!e.target.checked) {
                      speechGeneration.current++;
                      setSpeaking(false);
                      window.speechSynthesis?.cancel();
                    }
                  }}
                />
                Enable microphone voice controls
              </label>
              <p
                className="truncate text-slate-600"
                title={`Voice control: ${voice.status}. ${voice.feedback}`}
              >
                Voice control: {voice.status}. {voice.feedback}
              </p>
              <p
                className="truncate text-slate-600"
                data-testid="voice-transcript"
              >
                {lastHeard ? `You said: “${lastHeard}”` : " "}
                {lastHeard && lastGuide ? " · " : ""}
                {lastGuide ? `Guide said: “${lastGuide}”` : ""}
              </p>
            </div>
            <div className="min-w-52 flex-1 text-xs">
              <GestureControls
                compact
                videoRef={videoRef}
                onPauseRequest={() => halt()}
              />
            </div>
          </div>
          <div
            data-testid="practice-live-row"
            className="relative grid items-stretch gap-2 md:h-[calc(100dvh-300px)] md:min-h-[360px] md:grid-cols-[3fr_2fr]"
          >
            {running && (complete || result?.status === "failed") && (
              <div
                key={alert?.key ?? result?.status}
                data-testid="practice-glow"
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 z-10 rounded-2xl ${result?.status === "failed" ? "practice-glow-fail" : "practice-glow-pass"}`}
              />
            )}
            <section
              data-testid="practice-camera"
              className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border-2 bg-white ${running && result?.status === "failed" ? "border-red-600 practice-frame-warning" : running && complete ? "border-green-600" : "border-slate-200"}`}
            >
              <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-semibold">
                <span>Live work camera</span>
                <button
                  type="button"
                  aria-pressed={guidanceOn}
                  onClick={() => {
                    setGuidanceOn(!guidanceOn);
                    if (guidanceOn) {
                      speechGeneration.current++;
                      setSpeaking(false);
                      window.speechSynthesis?.cancel();
                    }
                  }}
                >
                  {guidanceOn ? "Voice on" : "Voice off"}
                </button>
                <span
                  className={
                    running && result?.status === "failed"
                      ? "text-red-700"
                      : "text-emerald-800"
                  }
                >
                  {cameraActive
                    ? running
                      ? result?.status === "failed"
                        ? "Wrong move — stop"
                        : complete
                          ? "Goal verified"
                          : result?.status === "passed"
                            ? "Verifying final goal"
                            : "Practice active"
                      : "Camera on"
                    : "Camera off"}
                </span>
              </div>
              <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-slate-950">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="block h-full w-full bg-slate-950 object-contain"
                  aria-label="Live work camera"
                />
                {!cameraActive && (
                  <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-slate-400">
                    Choose a guide and start the camera when you’re ready.
                  </p>
                )}
                {running && trackingOverlay && (
                  <svg
                    className="pointer-events-none absolute"
                    style={{
                      left: `${trackingOverlay.left}%`,
                      top: `${trackingOverlay.top}%`,
                      width: `${trackingOverlay.width}%`,
                      height: `${trackingOverlay.height}%`,
                    }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-label="Live object tracking"
                  >
                    {detections.map(
                      (d) =>
                        d.box && (
                          <g key={d.objectId}>
                            <rect
                              x={d.box.left * 100}
                              y={d.box.top * 100}
                              width={(d.box.right - d.box.left) * 100}
                              height={(d.box.bottom - d.box.top) * 100}
                              fill="none"
                              stroke={objectColour(d.objectId)}
                              strokeWidth=".7"
                            />
                            <circle
                              cx={(d.box.left + d.box.right) * 50}
                              cy={
                                lesson?.procedure.steps.find(
                                  (step) =>
                                    step.condition.componentId === d.objectId,
                                )?.measurement?.point === "bottom_center"
                                  ? d.box.bottom * 100
                                  : (d.box.top + d.box.bottom) * 50
                              }
                              r="1.8"
                              fill={objectColour(d.objectId)}
                              className={
                                alert?.kind === "failed" &&
                                lesson?.procedure.steps.find(
                                  (s) => s.id === alert.stepId,
                                )?.condition.componentId === d.objectId
                                  ? "practice-correction-pulse"
                                  : ""
                              }
                            />
                          </g>
                        ),
                    )}
                  </svg>
                )}
              </div>
              {lesson && !running && references && (
                <div className="p-2" aria-label="Before and after goal">
                  <p className="mb-1 text-xs font-bold">
                    Before and after goal
                  </p>
                  <div className="flex justify-start gap-2">
                    <figure className="w-20 overflow-hidden rounded-lg border bg-slate-50">
                      <img
                        src={references.before}
                        alt="Demonstrated starting state"
                        className="block h-12 w-full object-cover"
                      />
                      <figcaption className="px-1 py-0.5 text-xs font-bold">
                        Before
                      </figcaption>
                    </figure>
                    <figure className="w-20 overflow-hidden rounded-lg border bg-slate-50">
                      <img
                        src={references.goal}
                        alt="Demonstrated final goal"
                        className="block h-12 w-full object-cover"
                      />
                      <figcaption className="px-1 py-0.5 text-xs font-bold">
                        After
                      </figcaption>
                    </figure>
                  </div>
                </div>
              )}
              {lesson && (
                <section aria-label="Steps" className="px-2 py-1 text-xs">
                  <details open={running ? true : undefined}>
                    <summary className="cursor-pointer font-bold">
                      Steps ·{" "}
                      {running ? "live verification" : "last observed result"}
                    </summary>
                    <ol className="mt-1 max-h-20 space-y-1 overflow-y-auto">
                      {lesson.procedure.steps.map((step, index) => {
                        const s = result?.steps.find(
                          (state) => state.stepId === step.id,
                        ) ?? { stepId: step.id, status: "pending" };
                        return (
                          <li
                            key={s.stepId}
                            className="flex gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1"
                          >
                            <span className="font-bold text-emerald-800">
                              {index + 1}.
                            </span>
                            <span>
                              {
                                lesson?.procedure.steps.find(
                                  (step) => step.id === s.stepId,
                                )?.description
                              }
                              : <strong>{s.status.replaceAll("_", " ")}</strong>
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </details>
                </section>
              )}
              {alert && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 to-transparent px-3 pb-2 pt-8">
                  <div
                    key={alert.key}
                    data-testid="practice-verdict"
                    role={alert.kind === "failed" ? "alert" : "status"}
                    aria-live="polite"
                    className={`rounded-xl border-2 p-2 text-base font-bold ${alert.kind === "failed" ? "border-red-600 bg-red-50 text-red-800 practice-correction-pulse" : alert.kind === "passed" ? "border-green-600 bg-green-50 text-green-800" : "border-amber-600 bg-amber-50 text-amber-800"}`}
                  >
                    {alert.text}
                  </div>
                </div>
              )}
              {running && references && (
                <div className="pointer-events-none absolute right-2 top-14 w-24 overflow-hidden rounded-lg border-2 border-white bg-slate-950 shadow-lg">
                  <img src={references.goal} alt="" className="block w-full" />
                  <p className="bg-slate-950 px-1 py-0.5 text-center text-[10px] font-bold text-white">
                    Goal
                  </p>
                </div>
              )}
            </section>
            <div className="flex min-w-0 flex-col">
              <div data-testid="practice-companion" className="min-w-0 flex-1">
                <GuideAvatar
                  artClassName="mx-auto h-72 w-64 sm:h-80 sm:w-72"
                  mode={resolveAvatarMode({
                    violation: running && result?.status === "failed",
                    complete: running && complete && alert?.kind !== "warning",
                    uncertain:
                      (!running && cameraActive) ||
                      result?.status === "needs_verification" ||
                      alert?.kind === "warning",
                    busy: starting,
                  })}
                  speech={
                    speaking
                      ? "speaking"
                      : voice.status === "listening"
                        ? "listening"
                        : "silent"
                  }
                  caption={alert?.text ?? notice}
                />
              </div>
            </div>
          </div>
        </div>
        {!saved.length && !lesson && (
          <p className="text-sm text-slate-600">
            Your first guide starts in Teach. Create and review a lesson, then
            it will open here automatically.
          </p>
        )}
        {still && lesson && !running && (
          <section className="space-y-2 rounded-2xl border bg-white p-3">
            <h2 className="text-base font-bold">Calibrate this view</h2>
            <p className="text-sm font-semibold">
              Goal: {lesson.procedure.execution?.goal}
            </p>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_300px]">
              <div className="mx-auto w-full max-w-xl">
                <FrameMark
                  image={still.url}
                  width={still.image.width}
                  height={still.image.height}
                  mode="box"
                  mark={
                    marks[field]
                      ? {
                          kind: "box",
                          left: marks[field].left * still.image.width,
                          top: marks[field].top * still.image.height,
                          right: marks[field].right * still.image.width,
                          bottom: marks[field].bottom * still.image.height,
                        }
                      : null
                  }
                  onMark={(mark) => {
                    if (mark.kind !== "box") return;
                    setMarks((old) => ({
                      ...old,
                      [field]: {
                        left: mark.left / still.image.width,
                        top: mark.top / still.image.height,
                        right: mark.right / still.image.width,
                        bottom: mark.bottom / still.image.height,
                      },
                    }));
                    setCalibrationConsent(false);
                  }}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <select
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                >
                  {fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {marks[f.id] ? "✓ " : ""}
                      {f.name}
                    </option>
                  ))}
                </select>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={calibrationConsent}
                    onChange={(e) => setCalibrationConsent(e.target.checked)}
                  />
                  <span>
                    I checked object identities, zone meanings and fixed
                    destinations against the approved lesson.{" "}
                    {resumeRequested
                      ? "Completed states remain in place; unfinished actions are at their starting positions."
                      : "The objects are in the demonstrated starting positions."}
                  </span>
                </label>
                <button
                  disabled={
                    starting ||
                    !calibrationConsent ||
                    fields.some((f) => !marks[f.id])
                  }
                  onClick={() => start()}
                >
                  {resumeRequested
                    ? "Resume automatic practice"
                    : "Start automatic practice"}
                </button>
                <details className="text-sm text-slate-600">
                  <summary className="cursor-pointer font-medium">
                    How to mark this view
                  </summary>
                  Keep the camera fixed. Mark each movable object tightly. For a
                  fixed destination, mark a stable visible edge or feature. Then
                  mark the starting/destination zones and a separate stationary
                  textured reference. Fixed destination objects must remain in
                  the marked zones. If a destination moves, stop and
                  recalibrate.
                </details>
              </div>
            </div>
          </section>
        )}
        {rehearsal && lesson && (
          <p
            role="status"
            className="rounded-2xl border-2 border-dashed border-amber-600 bg-amber-50 p-4 font-bold text-amber-900"
          >
            Rehearsal — testing an unapproved draft. Nothing is saved. Approve
            it in Teach to keep it.
          </p>
        )}
        <details className="rounded-2xl border bg-white px-4 py-2">
          <summary className="cursor-pointer text-sm font-bold">
            Control settings
          </summary>
          <div className="space-y-3 py-2">
            <p
              data-testid="practice-lifecycle"
              className="text-xs text-slate-600"
            >
              Practice state: {lifecycle.state.replaceAll("_", " ")}
              {lifecycle.lastTransition &&
                ` (last change: ${lifecycle.lastTransition.reason})`}
              . Camera {lifecycle.camera}; tracker {lifecycle.worker}; starting
              objects{" "}
              {lifecycle.acquisitionComplete ? "found" : "not yet found"};
              verifier {lifecycle.armed ? "armed" : "not armed"}
              {lifecycle.lastError && `. Last problem: ${lifecycle.lastError}`}
            </p>
            <button
              onClick={() => {
                setManualSetupOpen(true);
                automaticWanted.current = false;
                halt("Manual tracking adjustment selected.");
              }}
            >
              Adjust tracking manually (optional)
            </button>
            {lesson?.automaticSetup && !running && (
              <button
                onClick={() =>
                  void ensurePracticeRunning(
                    session.current?.stopped ? "resume" : "start",
                  )
                }
              >
                Retry automatic setup
              </button>
            )}
            <CommandFeedback
              feedback={voice.feedback}
              commands={voice.availableCommands}
              onRestart={
                voice.status === "error" || voice.status === "denied"
                  ? voice.restart
                  : undefined
              }
            />
            <VoicePanel events={voiceLog} />
            <button onClick={download}>
              Export diagnostics and recent evidence
            </button>
          </div>
        </details>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </div>
    </Workspace>
  );
}
