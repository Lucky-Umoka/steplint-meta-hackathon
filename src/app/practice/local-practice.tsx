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
import CommandHelp from "@/voice/CommandHelp";
import {
  bestTimeKey,
  estimateProgress,
  formatDuration,
} from "@/practice/progress";
import {
  FelicityGate,
  incidentStillRelevant,
  visibilityRequest,
  type FelicityIncident,
  type FelicityKind,
} from "@/practice/felicity";
import {
  TrackingReadiness,
  readinessRows,
  type LiveTracking,
} from "./tracking-readiness";

const PRACTICE_GESTURES = [
  {
    gesture: "Enable gesture control",
    action:
      "Tick the box under the camera controls first; it is off by default.",
  },
  {
    gesture:
      "Point your index finger UP inside the dashed strip on the right edge of the camera picture",
    action:
      "A cyan dot follows your fingertip; the strip covers the whole screen. Pointing never clicks.",
  },
  {
    gesture:
      "Pinch: aim the dot at a button, then touch thumb to index finger and hold about half a second",
    action:
      "Clicks exactly like a mouse at the spot you aimed. Open your fingers before the next pinch.",
  },
  {
    gesture: "Open palm held flat in the strip for 1.2 seconds",
    action:
      "Pauses practice, the same as the Pause button. Verified work is kept.",
  },
];
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
  chooseWorkspace,
  liveSetup,
  shortNoun,
  toLive,
  type View,
} from "@/practice/viewpoint";
type LiveSetup = {
  objects: { id: string; box: Region; fixed: boolean }[];
  zones: Record<string, Region>;
  workspace: Region;
};
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
  // Camera locate (one SAM 3.1 step per camera session): Teach -> live
  // mapping when the learner's camera is not where Teach was recorded.
  const cameraView = useRef<View | null>(null);
  const locateState = useRef<"idle" | "pending" | "done">("idle");
  const locateAt = useRef(-Infinity);
  /** Calibrated from SAM boxes on the live frame (no Teach-pixel setup). */
  const liveMode = useRef(false);
  const uiPaintAt = useRef(0);
  /** Felicity's supervised recoveries (bounded): timestamps of attempts. */
  const supervised = useRef<number[]>([]);
  const [manualSetupOpen, setManualSetupOpen] = useState(false);
  const [references, setReferences] = useState<ProcedureReferences | null>(
    null,
  );
  const [resumeRequested, setResumeRequested] = useState(false);
  // Phase 5: final-goal completion gate from the pipeline session.
  const [goal, setGoal] = useState<GoalState | null>(null);
  const [liveTracking, setLiveTracking] = useState<LiveTracking | null>(null);
  const replyTimes = useRef<number[]>([]);
  const staleSince = useRef<number | null>(null);
  // Felicity: background recovery advice (advisory only; never a verdict).
  const felicity = useRef(new FelicityGate());
  const felicitySessionId = useRef("");
  const failureSince = useRef(
    new Map<string, { key: string; since: number }>(),
  );
  const lostSince = useRef(new Map<string, number>());
  const latestDetections = useRef<ObjectDetection[]>([]);
  const cameraActiveRef = useRef(false);
  const setupSince = useRef<number | null>(null);
  const setupHelped = useRef({ gideon: false, felicity: false });
  const [felicityAdvice, setFelicityAdvice] = useState<string | null>(null);
  // Learner timing (display only): starts when Practice first arms.
  const [practiceStartedAt, setPracticeStartedAt] = useState<number | null>(
    null,
  );
  const practiceStartedRef = useRef<number | null>(null);
  const celebratedV2 = useRef(false);
  const [clockMs, setClockMs] = useState(0);
  const [celebration, setCelebration] = useState<{
    elapsedMs: number;
    bestMs: number | null;
    newBest: boolean;
    steps: number;
    pace: number | null;
  } | null>(null);
  /** Demonstrated duration of a step from its reviewed Teach window. */
  function stepDemoMs(
    step: PracticeLesson["procedure"]["steps"][number],
  ): number {
    const times = lesson?.sourceLesson?.media.frameTimesMs;
    const window = step.execution?.evidenceWindow;
    if (!times || !window) return 0;
    const start = times[window.startFrame],
      end = times[window.resultFrame];
    return start !== undefined && end !== undefined
      ? Math.max(0, end - start)
      : 0;
  }
  useEffect(() => {
    if (practiceStartedAt === null) return;
    const id = window.setInterval(() => setClockMs(performance.now()), 500);
    return () => window.clearInterval(id);
  }, [practiceStartedAt]);
  useEffect(() => {
    if (!celebration) return;
    const id = window.setTimeout(() => setCelebration(null), 9000);
    return () => window.clearTimeout(id);
  }, [celebration]);
  const [switchingCamera, setSwitchingCamera] = useState(false);
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
    droppedStale: 0,
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
  /** First completion of this session: finish time, pace and personal best. */
  function celebrate(active: PracticeSession) {
    if (practiceStartedRef.current === null) return;

    const elapsedMs = performance.now() - practiceStartedRef.current;
    let bestMs: number | null = null;
    try {
      const stored = Number(
        window.localStorage.getItem(bestTimeKey(active.procedure.id)),
      );
      bestMs = Number.isFinite(stored) && stored > 0 ? stored : null;
      if (bestMs === null || elapsedMs < bestMs)
        window.localStorage.setItem(
          bestTimeKey(active.procedure.id),
          String(Math.round(elapsedMs)),
        );
    } catch {
      // Storage unavailable: the celebration still shows this time.
    }
    const demoMs = active.procedure.steps.reduce(
      (sum, step) => sum + stepDemoMs(step),
      0,
    );
    setCelebration({
      elapsedMs,
      bestMs,
      newBest: bestMs === null || elapsedMs < bestMs,
      steps: active.procedure.steps.length,
      pace: demoMs > 0 ? elapsedMs / demoMs : null,
    });
  }
  /** Unseen this long (beyond tracking gaps) before Gideon asks to see it. */
  const VISIBILITY_TIMEOUT_MS = 1500;
  /** Snapshot used to decide whether delayed Felicity advice is still current. */
  function felicitySnapshot(incident: FelicityIncident) {
    const active = session.current;
    return {
      sessionActive:
        !!active && !active.stopped && lifecycleRef.current.state === "running",
      generation: generation.current,
      revision: active?.procedure.approval?.revision ?? null,
      nowMs: performance.now(),
      stepStatus: active?.result.steps.find((s) => s.stepId === incident.stepId)
        ?.status,
      objectQuality: latestDetections.current.find(
        (d) => d.objectId === incident.objectId,
      )?.quality,
      practiceRunning: lifecycleRef.current.state === "running",
      cameraOn: cameraActiveRef.current,
    };
  }
  function requestFelicity(
    procedure: PracticeSession["procedure"],
    kind: FelicityKind,
    stepId: string,
    objectId: string,
    reason: string,
    key: string,
  ) {
    felicitySessionId.current ||= crypto.randomUUID();
    const incident: FelicityIncident = {
      id: `${felicitySessionId.current.slice(0, 8)}:${key}`
        .replace(/[^A-Za-z0-9:_-]/g, "-")
        .slice(0, 120),
      kind,
      stepId,
      objectId,
      revision: procedure.approval?.revision ?? null,
      generation: generation.current,
      createdAtMs: performance.now(),
    };
    const signal = felicity.current.start(incident);
    if (!signal) return; // one request per incident
    const step = procedure.steps.find((s) => s.id === stepId);
    const latestFrame = evidence.current.frames().at(-1)?.image;
    let evidenceImage: string | undefined;
    try {
      const url = latestFrame ? imageUrl(latestFrame) : undefined;
      evidenceImage = url && url.length <= 120_000 ? url : undefined;
    } catch {
      evidenceImage = undefined;
    }
    console.info(
      `[felicity] Muse Spark Open (Baseten): advice request for "${kind}"${evidenceImage ? " with the current camera frame" : ""}`,
    );
    void fetch("/api/practice/recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        incidentId: incident.id,
        sessionId: felicitySessionId.current,
        procedureId: procedure.id,
        revision: incident.revision,
        stepId,
        kind,
        instruction: (step?.description ?? "Follow the current step.").slice(
          0,
          400,
        ),
        approvedRecovery: step?.recovery?.instruction?.slice(0, 400) ?? null,
        reason: reason.slice(0, 400) || "Practice incident",
        objects: procedure.components
          .map((c) => c.description.slice(0, 120))
          .slice(0, 6),
        zones: procedure.zones
          .map((z) => (z.description || z.id).slice(0, 160))
          .slice(0, 8),
        ...(evidenceImage ? { evidenceImage } : {}),
      }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        const advice =
          data &&
          typeof data === "object" &&
          "incidentId" in data &&
          data.incidentId === incident.id &&
          "advice" in data &&
          typeof data.advice === "string"
            ? data.advice
            : null;
        if (!advice) return;
        // Delayed answer: deliver only if it is still about the same, still
        // uncorrected incident in the same running session and revision.
        const check = incidentStillRelevant(
          incident,
          felicity.current.active?.id ?? null,
          felicitySnapshot(incident),
        );
        if (!check.deliver) {
          log({
            at: Date.now(),
            source: "control",
            text: `Felicity advice discarded (${check.reason}).`,
          });
          return;
        }
        setFelicityAdvice(advice);
        log({
          at: Date.now(),
          source: "guidance",
          text: `Felicity: ${advice}`,
        });
        speak(`Felicity suggests: ${advice}`, false);
      })
      .catch(() => {
        // A failed or aborted advice request never affects Practice; an
        // abort only means we stopped listening.
      });
  }
  /** Per tracker reply: drop stale incidents and open new difficult ones. */
  function felicityTick(
    active: PracticeSession,
    replyDetections: ObjectDetection[],
  ) {
    latestDetections.current = replyDetections;
    const now = performance.now();
    const current = felicity.current.active;
    if (
      current &&
      !incidentStillRelevant(current, current.id, felicitySnapshot(current))
        .deliver
    ) {
      felicity.current.clear();
      setFelicityAdvice(null);
    }
    if (lifecycleRef.current.state !== "running" || !active.armed) return;
    for (const state of active.result.steps) {
      if (state.status !== "failed") {
        failureSince.current.delete(state.stepId);
        continue;
      }
      const event = active.result.events.findLast(
        (e) => e.stepId === state.stepId && e.status === "failed",
      );
      // One incident per failure episode: the verifier records a failed
      // event on every frame while the mistake persists, so the episode is
      // keyed by its first failed event and resets only when it is corrected.
      const tracked = failureSince.current.get(state.stepId);
      if (!tracked)
        failureSince.current.set(state.stepId, {
          key: `${state.stepId}:${event?.eventId ?? "failed"}`,
          since: now,
        });
      else if (now - tracked.since > 4000) {
        const key = tracked.key;
        const step = active.procedure.steps.find((s) => s.id === state.stepId);
        requestFelicity(
          active.procedure,
          event?.decision === "reversal"
            ? "unresolved_recovery"
            : "confirmed_mistake",
          state.stepId,
          step?.condition.componentId ?? "",
          event?.reason ?? "Confirmed violation is still unresolved.",
          key,
        );
      }
    }
    for (const detection of replyDetections) {
      if (detection.quality === "observed") {
        lostSince.current.delete(detection.objectId);
        continue;
      }
      const since = lostSince.current.get(detection.objectId) ?? now;
      lostSince.current.set(detection.objectId, since);
      // Gideon, locally and at once: unavailable past the visibility timeout
      // means "show me", never a violation (once per unseen episode).
      if (now - since >= VISIBILITY_TIMEOUT_MS) {
        const name =
          active.procedure.components.find((c) => c.id === detection.objectId)
            ?.description ?? detection.objectId;
        show(
          "needs_verification",
          visibilityRequest(
            name,
            detection.quality === "obstructed"
              ? "obstructed"
              : detection.quality === "ambiguous"
                ? "lost"
                : "unclear",
          ),
          null,
          `visibility:${detection.objectId}:${Math.round(since)}`,
        );
      }
      if (now - since < 8000) continue;
      const step =
        active.procedure.steps.find(
          (s) =>
            s.condition.componentId === detection.objectId &&
            active.result.steps.find((r) => r.stepId === s.id)?.status !==
              "passed",
        ) ??
        active.procedure.steps.find(
          (s) => s.condition.componentId === detection.objectId,
        );
      if (!step) continue;
      requestFelicity(
        active.procedure,
        detection.quality === "ambiguous" ? "identity_uncertain" : "occluded",
        step.id,
        detection.objectId,
        `The ${detection.objectId} has been ${detection.quality} for 8 seconds.`,
        `lost:${detection.objectId}:${Math.round(since)}`,
      );
    }
  }
  function show(
    kind: string,
    text: string,
    stepId: string | null,
    key: string,
    /** Spoken after `text` in the same utterance (speech is latest-wins). */
    alsoSay: string | null = null,
  ): boolean {
    if (lastAlert.current === key) return false;
    lastAlert.current = key;
    setAlert({ kind, text, stepId, key });
    log({
      at: Date.now(),
      source: kind === "instruction" ? "guidance" : "verdict",
      text,
    });
    speak(alsoSay ? `${text} ${alsoSay}` : text, false);
    return true;
  }
  function halt(
    reason = "Practice paused. Say “Guide, resume practice” to continue.",
    invalidate = false,
    kind: "pause" | "failure" | "camera" = "pause",
  ) {
    const haltedGeneration = generation.current;
    felicity.current.clear();
    setFelicityAdvice(null);
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
    facing: cameraFacing,
    chooseFacing: chooseCameraFacing,
    cameraCount,
  } = useGuideCamera(
    (image, now) => {
      if (!latest.current) setFrameReady(true);
      latest.current = image;
      if (
        !worker.current &&
        automaticWanted.current &&
        automaticSource.current &&
        // Local setup retry (no model call): once per second, so a starting
        // view shown only briefly is not missed between attempts.
        now - automaticAttemptAt.current > 1000
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
    felicityTick,
    requestFelicity,
    automaticStart: (image: Pixels) => {
      locateCamera(image);
      // Live setup is primary; the Teach-pixel setup only until SAM answers.
      if (!liveMode.current)
        start({ image, source: automaticSource.current! });
    },
    liveStart: (image: Pixels, live: LiveSetup) => start(undefined, { image, ...live }),
    supervise,
    workerTimeout,
  });
  useEffect(() => {
    handlers.current = {
      halt,
      show,
      felicityTick,
      requestFelicity,
      automaticStart: (image: Pixels) => {
        locateCamera(image);
        // Live setup is primary; the Teach-pixel setup only until SAM answers.
        if (!liveMode.current)
          start({ image, source: automaticSource.current! });
      },
      liveStart: (image: Pixels, live: LiveSetup) => start(undefined, { image, ...live }),
    supervise,
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
      cameraView.current = null;
      locateState.current = "idle";
      locateAt.current = -Infinity;
      liveMode.current = false;
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
        "Practice paused. Verified work is kept; say “Guide, resume practice” to continue.",
    };
  }
  /**
   * One locate step per camera session (no per-frame model calls): SAM finds
   * the approved objects in this camera; if they agree on a camera mapping
   * different from the Teach recording, setup restarts in that mapping.
   * Runs in parallel with the normal setup, so a camera already at the Teach
   * viewpoint starts without waiting.
   */
  function locateCamera(image: Pixels) {
    const source = automaticSource.current;
    if (locateState.current === "pending") return;
    // Re-locate (objects may have moved) at most every 20 s per session.
    if (performance.now() - locateAt.current < 20_000) return;
    if (!source || !lesson) {
      console.info("[practice] camera locate skipped: lesson has no automatic setup");
      return;
    }
    const objects = source.objects.map((object) => ({
      id: object.id,
      fixed: object.fixed,
      noun: shortNoun(
        lesson.procedure.components.find((c) => c.id === object.id)
          ?.description ?? "",
      ),
      teach: object.box,
    }));
    if (objects.some((object) => object.noun.length < 2)) {
      console.info("[practice] camera locate skipped: an approved object has no usable name");
      return;
    }
    locateState.current = "pending";
    locateAt.current = performance.now();
    console.info(
      `[practice] SAM 3.1 camera locate: asking for ${objects.map((o) => `"${o.noun}"`).join(", ")}`,
    );
    if (!felicitySessionId.current)
      felicitySessionId.current = `practice-${crypto.randomUUID()}`;
    const frame = {
      width: image.width,
      height: image.height,
      data: new Uint8ClampedArray(image.data),
    };
    void fetch("/api/practice/locate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: felicitySessionId.current,
        image: imageUrl(frame),
        width: frame.width,
        height: frame.height,
        objects: objects.map(({ id, noun }) => ({ id, noun })),
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          // Respect the server's per-session interval before asking again.
          if (response.status === 429) locateAt.current = performance.now();
          console.warn(
            `[practice] camera locate unavailable (HTTP ${response.status}); setup continues without it`,
          );
          return;
        }
        const body = (await response.json()) as {
          objects?: { id: string; box: Region | null }[];
          provenance?: { model: string; provider: string; requests: number; ms: number };
        };
        if (body.provenance)
          console.info(
            `[practice] ${body.provenance.model} (${body.provenance.provider}): ${body.provenance.requests} requests in ${body.provenance.ms} ms`,
          );
        const live = Object.fromEntries(
          (body.objects ?? []).map((o) => [o.id, o.box]),
        );
        const found = objects.filter((o) => live[o.id]).length;
        // Primary: calibrate on THIS live frame from SAM's boxes (any camera
        // position, aspect ratio or object arrangement).
        const setup = liveSetup({
          objects,
          live,
          zones: lesson.zoneBindings.map((b) => ({
            zoneId: b.zoneId,
            region: b.region,
          })),
        });
        const workspace = setup
          ? chooseWorkspace(frame, setup.objects.map((o) => o.box))
          : null;
        console.info(
          `[practice] camera locate: ${found}/${objects.length} objects found; ${setup && workspace ? "starting live setup from this camera view" : "live setup not possible (missing object or no stable background)"}`,
        );
        if (!setup || !workspace) return;
        if (worker.current && session.current?.armed) return; // already tracking
        if (worker.current) {
          worker.current.onerror = null;
          worker.current.onmessage = null;
          worker.current.terminate();
          worker.current = null;
          busy.current = false;
          if (session.current) session.current.stopped = true;
          setRunning(false);
          setStarting(false);
          setDetections([]);
        }
        liveMode.current = true;
        handlers.current.liveStart(frame, { ...setup, workspace });
      })
      .catch((error) => {
        // Locate is an aid; the unchanged setup keeps retrying.
        console.warn(
          `[practice] camera locate failed: ${error instanceof Error ? error.message : "network error"}`,
        );
      })
      .finally(() => {
        locateState.current = "done";
      });
  }
  /**
   * Felicity supervisor (bounded repair loop): when tracking stops because
   * evidence arrives too late, the tracker crashes or calibration is lost,
   * Practice does not stay stopped. It re-locates the approved objects with
   * SAM and restarts live setup, at most 4 times per 5 minutes; Felicity's
   * advice request explains the incident. Never marks anything passed.
   */
  function supervise(reason: string) {
    if (!lesson?.automaticSetup || !cameraActive) return;
    const now = performance.now();
    supervised.current = supervised.current.filter((at) => now - at < 300_000);
    if (supervised.current.length >= 4) {
      console.warn(`[felicity] supervisor: stopping after 4 recoveries in 5 min (${reason})`);
      setNotice("I keep losing the objects. Check the light and keep them in view, then say “Guide, resume practice”.");
      return;
    }
    supervised.current.push(now);
    console.info(
      `[felicity] supervisor: ${reason} -> re-locating objects with SAM and restarting live setup (attempt ${supervised.current.length}/4)`,
    );
    setNotice("Give me a moment, I'm finding your objects again…");
    speak("Give me a moment, I'm finding your objects again.");
    // Re-locate as soon as the server's 20 s per-session interval allows.
    window.setTimeout(() => {
      automaticWanted.current = true;
      automaticAttemptAt.current = -Infinity;
    }, 1500);
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
  function start(
    automatic?: {
      image: Pixels;
      source: NonNullable<typeof automaticSource.current>;
    },
    live?: LiveSetup & { image: Pixels },
  ) {
    const setupImage = automatic?.image ?? live?.image ?? still?.image;
    if (
      !lesson ||
      !setupImage ||
      (!automatic && !live && !calibrationConsent) ||
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
        region: automatic
          ? b.region
          : live
            ? live.zones[b.zoneId]
            : marks[`zone:${b.zoneId}`],
      }));
      const resuming =
        resumeRequested &&
        session.current?.procedure.id === lesson.procedure.id &&
        session.current?.procedure.version === lesson.procedure.version;
      const objects = automatic
        ? automatic.source.objects
        : live
          ? live.objects
          : lesson.procedure.components.map((c) => ({
            id: c.id,
            fixed: !lesson.procedure.steps.some(
              (s) => s.condition.componentId === c.id,
            ),
            box: marks[`object:${c.id}`],
          }));
      if (
        (!automatic && !live && !marks.workspace) ||
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
      if (!resuming) {
        celebratedV2.current = false;
        practiceStartedRef.current = null;
        setPracticeStartedAt(null);
        setCelebration(null);
      }
      if ((automatic || live) && !resuming) {
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
      if (!resuming && !automatic && !live) archiveSession();
      session.current = next;
      setResult(next.result);
      // Announce only learner-initiated starts: automatic retries must stay
      // silent, or repeated setup failures would stutter speech and suppress
      // voice commands while the engine is always speaking.
      if (!automatic && !live) {
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
      trackingCounters.current = {
        submitted: 0,
        processed: 0,
        droppedBusy: 0,
        droppedStale: 0,
      };
      staleSince.current = null;
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
          if (
            reply.type === "error" &&
            (automatic || live) &&
            automaticWanted.current
          ) {
            localWorker.terminate();
            worker.current = null;
            busy.current = false;
            session.current = previousSession;
            if (previousSession) previousSession.stopped = true;
            setResult(previousSession?.result ?? null);
            setStarting(false);
            setDetections([]);
            // A missing starting view is normal while objects are positioned.
            // Retry it silently; bound actual setup errors separately.
            const finding = /^Finding\b/i.test(reply.message);
            const exhausted = !finding && ++autoFailures.current >= 5;
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
              // Name objects plainly ("blue towel"), never by internal ID or
              // the long reviewed description; keep the learner message short.
              const named = (lesson?.procedure.components ?? []).reduce(
                (text, component) =>
                  text.replaceAll(
                    component.id,
                    `the ${shortNoun(component.description) || "object"}`,
                  ),
                reply.message,
              );
              setNotice(
                /^Finding the work area/i.test(named)
                  ? `Looking for ${named.replace(/^Finding the work area[^:]*:\s*show\s*/i, "").replace(/\s+clearly in the demonstrated position\..*$/i, "")} in your camera view…`
                  : named,
              );
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
          // Evidence older than the approved observation gap is never applied.
          // One late reply (a busy browser main thread) is discarded and the
          // verifier sees an observation gap (uncertainty); only replies that
          // stay late for 3 s mean the device cannot verify in time.
          const replyAt = performance.now();
          if (
            replyAt - reply.timestampMs >
            Math.min(
              ...active.procedure.steps.map(
                (step) => step.measurement?.maxObservationGapMs ?? 600,
              ),
            )
          ) {
            trackingCounters.current.droppedStale++;
            staleSince.current ??= replyAt;
            if (replyAt - staleSince.current > 3000) {
              handlers.current.halt(
                "Tracking evidence keeps arriving too late on this device. Verification stopped; close other tabs or apps, then resume.",
                true,
                "failure",
              );
              handlers.current.supervise("tracking evidence arrived too late");
            }
            return;
          }
          staleSince.current = null;
          // A reply measured for an earlier watch-set revision is never applied.
          if (
            reply.watchRevision !== undefined &&
            reply.watchRevision !== watchRevision.current
          )
            return;
          // Screen-only updates at most 10/s: every reply is still verified,
          // but re-rendering the whole page per reply made replies arrive
          // after the 600 ms evidence limit on slower (dev-mode) browsers.
          const paint = performance.now() - uiPaintAt.current >= 100;
          if (paint) {
            uiPaintAt.current = performance.now();
            setDetections(
              reply.detections.map((d) => ({
                ...d,
                box: d.box && toLive(d.box, cameraView.current),
              })),
            );
          }
          const wasArmed = active.armed;
          const frame = feedTrackingFrame(active, {
            ...reply,
            watchKey: watchKey.current,
          });
          if (frame.stale) return;
          const repliedAt = performance.now();
          replyTimes.current = [
            ...replyTimes.current.filter((at) => repliedAt - at < 1000),
            repliedAt,
          ];
          if (paint || active.armed !== wasArmed)
          setLiveTracking({
            rows: readinessRows(active, reply.detections),
            calibrationValid: reply.calibrationValid,
            armed: active.armed,
            lastReplyAtMs: repliedAt,
            fps: replyTimes.current.length,
          });
          // speak() is latest-wins: a step verdict spoken later in this same
          // reply would silently cancel a separate goal announcement, so the
          // goal transition is spoken together with that verdict (or alone).
          let goalSpeech: string | null = null;
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
              goalSpeech = "Final goal verified.";
            if (frame.goal.status === "complete" && before !== "complete")
              celebrate(active);
            if (frame.goal.status === "invalidated" && before === "complete")
              goalSpeech = "Completion invalidated. Restore the final state.";
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
            handlers.current.show(
              "needs_verification",
              visibilityRequest(name, "lost"),
              null,
              `lost:${unseen.objectId}`,
            );
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
          if (!reply.calibrationValid)
            console.warn(`[practice] calibration lost: ${reply.reason ?? "unknown"}`);
          for (const event of reply.identityEvents)
            if (event.status !== "tracked")
              console.info(`[practice] ${event.objectId}: ${event.status} (${event.reason})`);
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
              goalSpeech,
            );
            setNotice(
              "Finding the work area again automatically. Keep the required objects visible.",
            );
            return;
          }
          if (active.armed && !wasArmed)
            lc({ type: "armed", generation: reply.generation });
          if (active.armed && !wasArmed) {
            if (practiceStartedRef.current === null) {
              practiceStartedRef.current = performance.now();
              setPracticeStartedAt(practiceStartedRef.current);
            }
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
            const decisions = feedbackEvents(updated, significant);
            for (const [index, decision] of decisions.entries()) {
              const step = active.procedure.steps.find(
                (s) => s.id === decision.stepId,
              );
              const objectId = step?.condition.componentId;
              const objectName =
                active.procedure.components.find((c) => c.id === objectId)
                  ?.description ??
                objectId ??
                "object";
              const text =
                decision.status === "passed"
                  ? `${step?.description ?? "Step"} Verified.`
                  : decision.status === "failed"
                    ? `Stop. ${decision.recovery?.instruction ?? decision.reason}`
                    : // Missing visibility is uncertainty, not a violation:
                      // Gideon asks for a clearer view, naming the object.
                      visibilityRequest(
                        objectName,
                        reply.detections.find((d) => d.objectId === objectId)
                          ?.quality === "obstructed"
                          ? "obstructed"
                          : "unclear",
                      );
              const last = index === decisions.length - 1;
              if (
                handlers.current.show(
                  decision.status,
                  text,
                  decision.stepId,
                  `${decision.stepId}:${decision.status}:${decision.decision ?? decision.reason}`,
                  last ? goalSpeech : null,
                ) &&
                last
              )
                goalSpeech = null;
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
            // Older (V2) lessons complete when every step passes.
            if (
              !goalGatedV3 &&
              updated.status === "passed" &&
              !celebratedV2.current
            ) {
              celebratedV2.current = true;
              celebrate(active);
            }
          }
          if (goalSpeech) speak(goalSpeech);
          handlers.current.felicityTick(active, reply.detections);
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
      localWorker.onerror = (event) => {
        // A worker that was already replaced (e.g. the Teach-based setup
        // worker terminated when live setup starts) must never halt the
        // current one: its late load error used to kill the live tracker.
        if (worker.current !== localWorker) return;
        console.error(
          `[practice] local tracker crashed: ${event.message || "unknown error"}${event.filename ? ` (${event.filename}:${event.lineno})` : ""}`,
        );
        handlers.current.halt(
          "The local tracker stopped. Recalibrate before continuing.",
          true,
          "failure",
        );
        handlers.current.supervise("the local tracker crashed");
      };
      const copy = new Uint8ClampedArray(setupImage.data);
      const startWatch = watchSet(next.procedure, next.result);
      localWorker.postMessage(
        {
          ...(automatic
            ? {
                type: "bootstrap",
                view: cameraView.current,
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
                calibration: {
                  objects,
                  workspace: live ? live.workspace : marks.workspace,
                },
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
  useEffect(() => {
    cameraActiveRef.current = cameraActive;
  }, [cameraActive]);
  // Automatic Practice not starting: Gideon gives a local hint at 12 s, then
  // Felicity diagnoses once (at 20 s) from the real setup state. Advice only;
  // it never starts, arms or verifies anything.
  useEffect(() => {
    const id = window.setInterval(() => {
      const state = lifecycleRef.current.state;
      const settingUp =
        !!lesson &&
        cameraActiveRef.current &&
        ["acquiring_initial_objects", "arming", "recovering"].includes(state);
      if (!settingUp) {
        setupSince.current = null;
        setupHelped.current = { gideon: false, felicity: false };
        if (
          felicity.current.active?.kind === "setup_blocked" &&
          state === "running"
        ) {
          felicity.current.clear();
          setFelicityAdvice(null);
        }
        return;
      }
      const now = performance.now();
      setupSince.current ??= now;
      const waited = now - setupSince.current;
      const first = lesson.procedure.steps[0];
      const object = lesson.procedure.components.find(
        (c) => c.id === first?.condition.componentId,
      );
      const zone = lesson.procedure.zones.find(
        (z) => z.id === first?.condition.fromZone,
      );
      if (waited > 12_000 && !setupHelped.current.gideon) {
        setupHelped.current.gideon = true;
        handlers.current.show(
          "needs_verification",
          `I'm still getting ready. Put the ${object?.description ?? "first object"}${zone ? ` at ${zone.description || zone.id}` : " where you started in Teach"}, keep it fully in view and hold the camera still.`,
          null,
          `setup-hint:${Math.round(setupSince.current)}`,
        );
      }
      if (waited > 20_000 && !setupHelped.current.felicity && first) {
        setupHelped.current.felicity = true;
        const d = lifecycleDiagnostics(lifecycleRef.current);
        const rows = latestDetections.current
          .map((det) => {
            const name =
              lesson.procedure.components.find((c) => c.id === det.objectId)
                ?.description ?? det.objectId;
            return `${name}: ${det.quality}`;
          })
          .join("; ");
        handlers.current.requestFelicity(
          lesson.procedure,
          "setup_blocked",
          first.id,
          first.condition.componentId,
          `Automatic Practice has not started after ${Math.round(waited / 1000)} s. State: ${d.state}; camera ${d.camera}; tracker ${d.worker}; starting objects ${d.acquisitionComplete ? "found" : "not yet found"}; armed ${d.armed}.${d.lastError ? ` Last problem: ${d.lastError}.` : ""}${rows ? ` Objects: ${rows}.` : ""}`,
          `setup:${Math.round(setupSince.current)}`,
        );
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [lesson]);
  // Restart on the newly chosen camera once the old stream has stopped.
  useEffect(() => {
    if (!switchingCamera || cameraActive || cameraRequesting) return;
    const id = window.setTimeout(() => {
      setSwitchingCamera(false);
      if (lesson?.automaticSetup) void ensurePracticeRunning("resume");
      else void openCamera();
    }, 0);
    return () => window.clearTimeout(id);
    // ensurePracticeRunning/openCamera read current refs and state at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [switchingCamera, cameraActive, cameraRequesting]);
  const voice = useVoiceControl({
    commands: LOCAL_PRACTICE_COMMANDS,
    enabled: voiceOn,
    // Half-duplex turn-taking: a valid command stops our speech and runs;
    // our own recent words are never treated as commands.
    halfDuplex: true,
    recentSpeech: () =>
      spoken.current
        .filter((item) => Date.now() - item.at < 5_000)
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
        speak("Practice is paused. Say “Guide, resume practice” to continue.");
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
    <Workspace mode="practice" fitScreen>
      <div className="practice-compact flex w-full flex-col gap-2 md:min-h-0 md:flex-1">
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-lg font-bold">Practice</h1>
          <span
            className="max-w-xs truncate text-sm text-slate-600"
            title={lesson?.procedure.title}
          >
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
              {cameraCount > 1 && (
                <button
                  onClick={() => {
                    // A different camera is a different view: stop through
                    // the canonical path, then start Practice again, which
                    // re-finds the work area from the reviewed references.
                    chooseCameraFacing(
                      cameraFacing === "environment" ? "user" : "environment",
                    );
                    closeCamera("Switching camera.");
                    setSwitchingCamera(true);
                  }}
                >
                  {cameraFacing === "environment"
                    ? "Use front camera"
                    : "Use back camera"}
                </button>
              )}
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
            className="min-w-0 basis-full truncate text-sm text-slate-600 md:basis-0 md:flex-1"
            title={notice}
          >
            {notice}
          </p>
          {lifecycle.state !== "idle" && (
            <TrackingReadiness live={liveTracking} state={lifecycle.state} />
          )}
        </div>
        <div className={calibrating ? "hidden" : "contents"}>
          <div className="flex shrink-0 flex-wrap items-stretch gap-2 text-xs">
            {lesson && (
              <section
                aria-label="Current step and goal"
                className="min-w-52 flex-1 space-y-0.5 rounded-2xl border bg-white p-2"
              >
                <p
                  className="truncate font-semibold"
                  title={lesson.procedure.execution?.goal}
                >
                  Goal: {lesson.procedure.execution?.goal}
                </p>
                <p className="line-clamp-2">
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
              <div className="flex flex-wrap items-center gap-x-2">
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
                <CommandHelp
                  commands={LOCAL_PRACTICE_COMMANDS}
                  gestures={PRACTICE_GESTURES}
                />
              </div>
              <p
                className="truncate text-slate-600"
                title={`Voice control: ${voice.status}. ${voice.feedback}`}
              >
                Voice control: {voice.status}. {voice.feedback}
              </p>
              <p
                className="truncate text-slate-600"
                data-testid="voice-transcript"
                title={`${lastHeard ? `You said: “${lastHeard}”` : ""}${lastHeard && lastGuide ? " · " : ""}${lastGuide ? `Guide said: “${lastGuide}”` : ""}`}
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
                onPauseRequest={() => setNotice(pausePractice().message)}
              />
            </div>
          </div>
          <div
            data-testid="practice-live-row"
            className="relative grid items-stretch gap-2 md:min-h-[320px] md:flex-1 md:grid-cols-[3fr_2fr] md:grid-rows-[minmax(0,1fr)]"
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
              <div className="flex shrink-0 items-center justify-between border-b px-3 py-1 text-sm font-semibold">
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
                {celebration && (
                  <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
                    <section
                      role="dialog"
                      aria-label="Goal complete"
                      data-testid="practice-celebration"
                      className="practice-celebrate pointer-events-auto w-full max-w-xs rounded-2xl border-2 border-emerald-500 bg-white p-4 text-center shadow-2xl"
                    >
                      <p className="text-3xl" aria-hidden="true">
                        🏆🎉
                      </p>
                      <h2 className="text-xl font-extrabold text-emerald-700">
                        Goal complete!
                      </h2>
                      <p className="mt-1 text-sm text-slate-800">
                        All {celebration.steps} step
                        {celebration.steps === 1 ? "" : "s"} verified in{" "}
                        <strong>{formatDuration(celebration.elapsedMs)}</strong>
                        .
                      </p>
                      {celebration.pace !== null && (
                        <p className="text-xs text-slate-600">
                          {celebration.pace <= 1
                            ? "As fast as the demonstration or faster."
                            : `${celebration.pace.toFixed(1)}× the demonstration time.`}
                        </p>
                      )}
                      <p className="mt-1 text-sm font-bold text-amber-600">
                        {celebration.newBest
                          ? "New personal best!"
                          : `Personal best: ${formatDuration(celebration.bestMs ?? celebration.elapsedMs)}`}
                      </p>
                      <button
                        type="button"
                        className="mt-2"
                        onClick={() => setCelebration(null)}
                      >
                        Close
                      </button>
                    </section>
                  </div>
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
              {alert && (
                <div className="shrink-0 px-2 pt-1">
                  <div
                    key={alert.key}
                    data-testid="practice-verdict"
                    role={alert.kind === "failed" ? "alert" : "status"}
                    aria-live="polite"
                    title={alert.text}
                    className={`line-clamp-2 rounded-xl border-2 px-2 py-1 text-sm font-bold ${alert.kind === "failed" ? "border-red-600 bg-red-50 text-red-800 practice-correction-pulse" : alert.kind === "passed" ? "border-green-600 bg-green-50 text-green-800" : "border-amber-600 bg-amber-50 text-amber-800"}`}
                  >
                    {alert.text}
                  </div>
                </div>
              )}
              {lesson && (
                <div className="flex shrink-0 flex-wrap items-start gap-2 border-t p-2 text-xs md:flex-nowrap">
                  {!running && references && (
                    <div
                      className="shrink-0"
                      aria-label="Before and after goal"
                    >
                      <p className="sr-only">Before and after goal</p>
                      <div className="flex justify-start gap-1">
                        <figure className="w-16 overflow-hidden rounded border bg-slate-50">
                          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
                          <img
                            src={references.before}
                            alt="Demonstrated starting state"
                            className="block h-10 w-full object-cover"
                          />
                          <figcaption className="px-1 text-[10px] font-bold">
                            Before
                          </figcaption>
                        </figure>
                        <figure className="w-16 overflow-hidden rounded border bg-slate-50">
                          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
                          <img
                            src={references.goal}
                            alt="Demonstrated final goal"
                            className="block h-10 w-full object-cover"
                          />
                          <figcaption className="px-1 text-[10px] font-bold">
                            After
                          </figcaption>
                        </figure>
                      </div>
                    </div>
                  )}
                  {/* Live goal panel, kept outside the camera image:
                      before/after pictures and the approved step checklist
                      (display only; the verifier's step states drive the
                      marks). */}
                  <aside
                    aria-label="Goal checklist"
                    data-testid="goal-checklist"
                    className="flex min-w-0 flex-1 flex-wrap items-start gap-2 text-slate-900 md:flex-nowrap"
                  >
                    {running && references && (
                      <div className="flex shrink-0 gap-1">
                        <figure className="w-16 overflow-hidden rounded border">
                          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
                          <img
                            src={references.before}
                            alt="Starting state"
                            className="block h-10 w-full object-cover"
                          />
                          <figcaption className="px-1 text-[10px] font-bold">
                            Before
                          </figcaption>
                        </figure>
                        <figure className="w-16 overflow-hidden rounded border">
                          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
                          <img
                            src={references.goal}
                            alt="Final goal"
                            className="block h-10 w-full object-cover"
                          />
                          <figcaption className="px-1 text-[10px] font-bold">
                            Goal
                          </figcaption>
                        </figure>
                      </div>
                    )}
                    <div className="min-w-0 basis-full md:w-60 md:shrink-0 md:basis-auto">
                      <p
                        className="line-clamp-2 font-bold"
                        title={
                          lesson.procedure.execution?.goal ??
                          lesson.procedure.title
                        }
                      >
                        {lesson.procedure.execution?.goal ??
                          lesson.procedure.title}
                      </p>
                      {(() => {
                        const statuses = Object.fromEntries(
                          (result?.steps ?? []).map((st) => [
                            st.stepId,
                            st.status,
                          ]),
                        );
                        const p = estimateProgress({
                          steps: lesson.procedure.steps.map((step) => ({
                            id: step.id,
                            demoMs: stepDemoMs(step),
                          })),
                          status: statuses,
                          startedAtMs: practiceStartedAt,
                          nowMs: Math.max(clockMs, practiceStartedAt ?? 0),
                          goalComplete: !!complete,
                        });
                        return (
                          <div data-testid="practice-progress" className="my-1">
                            <div
                              role="progressbar"
                              aria-label="Progress to the final goal"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(p.fraction * 100)}
                              className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
                            >
                              <div
                                className={`h-full rounded-full ${result?.status === "failed" ? "bg-red-500" : "bg-emerald-500"} transition-all`}
                                style={{
                                  width: `${Math.round(p.fraction * 100)}%`,
                                }}
                              />
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-700">
                              {p.done}/{p.total} steps
                              {practiceStartedAt !== null &&
                                ` · ${formatDuration(p.elapsedMs)}`}
                              {p.remainingMs !== null &&
                                ` · ≈ ${formatDuration(p.remainingMs)} left`}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                    <ul className="max-h-16 min-w-0 flex-1 space-y-0.5 overflow-y-auto">
                      {(() => {
                        const firstOpen = lesson.procedure.steps.findIndex(
                          (step) =>
                            result?.steps.find(
                              (state) => state.stepId === step.id,
                            )?.status !== "passed",
                        );
                        return lesson.procedure.steps.map((step, index) => {
                          const status =
                            result?.steps.find(
                              (state) => state.stepId === step.id,
                            )?.status ?? "pending";
                          const mark =
                            status === "passed"
                              ? "✓"
                              : status === "failed"
                                ? "✗"
                                : index === firstOpen
                                  ? "●"
                                  : "○";
                          return (
                            <li
                              key={step.id}
                              data-step-status={status}
                              className={`flex gap-1 ${status === "passed" ? "text-emerald-800" : status === "failed" ? "font-bold text-red-700" : index === firstOpen ? "font-semibold" : "text-slate-600"}`}
                            >
                              <span aria-hidden="true">{mark}</span>
                              <span>
                                {index + 1}. {step.description}
                              </span>
                            </li>
                          );
                        });
                      })()}
                    </ul>
                  </aside>
                </div>
              )}
            </section>
            <div className="flex min-w-0 flex-col gap-2 md:min-h-0 md:overflow-y-auto">
              <div data-testid="practice-companion" className="min-w-0 flex-1">
                <GuideAvatar
                  artClassName="mx-auto h-52 w-48 [@media(min-height:880px)]:h-64 [@media(min-height:880px)]:w-60"
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
                {felicityAdvice && (
                  <p
                    data-testid="felicity-advice"
                    role="status"
                    className="mt-2 rounded-xl border border-violet-300 bg-violet-50 p-2 text-sm text-violet-900"
                  >
                    <strong>Felicity:</strong> {felicityAdvice}
                  </p>
                )}
              </div>
              {lesson && (
                <section
                  aria-label="Steps"
                  className="shrink-0 rounded-2xl border bg-white px-2 py-1 text-xs"
                >
                  <details open={running ? true : undefined}>
                    <summary className="cursor-pointer py-0.5 font-bold">
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
