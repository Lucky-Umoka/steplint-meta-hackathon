"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import Workspace from "@/components/workspace";
import GuideFrame from "@/components/guide-frame";
import { type SavedGuide, guideRepository } from "@/guide/storage";
import {
  createRelationSession,
  evaluateRelationWindow,
  recoverRelation,
  RelationWindowSchema,
  type RelationSession,
} from "@/guide/relation-evaluator";
import { type RelationReading } from "@/guide/relations";
import { readAppJson } from "@/teach/api-response";
import { type Pixels } from "@/practice/tracker";
import { PerceptionResultSchema } from "@/guide/perception-contract";
import { type ObjectDetection } from "@/guide/schema";
import {
  groundOverlay,
  trackOverlay,
  type OverlayTrack,
} from "@/practice/appearance-overlay";
import { outsidePlacementTarget } from "@/practice/target-feedback";
import { createSessionClock, clockPhase, timingSummary } from "@/guide/timing";
import { useGuideCamera } from "./use-guide-camera";
import PracticeAlert from "./PracticeAlert";
import GuideAvatar, { resolveAvatarMode } from "@/components/GuideAvatar";
import GestureControls from "@/gesture/GestureControls";
import { type VoiceCommand, type CommandDisposition } from "@/voice/commands";
import { useVoiceControl, type VoiceEvent } from "@/voice/use-voice-control";
import CommandFeedback from "@/voice/CommandFeedback";
import VoicePanel, { appendVoiceEvent } from "@/voice/VoicePanel";

const RELATION_COMMANDS: VoiceCommand[] = [
  {
    id: "start-practice",
    phrases: ["start practice", "start", "begin practice", "start camera"],
  },
  { id: "pause-practice", phrases: ["pause practice", "pause"] },
  {
    id: "resume-practice",
    phrases: ["resume practice", "continue practice", "resume", "continue"],
  },
  {
    id: "end-practice",
    phrases: [
      "end practice",
      "end",
      "stop practice",
      "finish",
      "stop",
      "stop camera",
    ],
  },
  {
    id: "repeat-instruction",
    phrases: [
      "repeat instruction",
      "repeat",
      "say again",
      "next step",
      "what is next",
    ],
  },
  { id: "current-step", phrases: ["what is the current step", "current step"] },
  {
    id: "read-progress",
    phrases: ["read my progress", "read progress", "my progress"],
  },
  { id: "stop-speaking", phrases: ["stop speaking", "be quiet", "quiet"] },
  { id: "help", phrases: ["help", "what can i say"] },
];
import { overlayFrame, OVERLAY_REPLAY_FRAMES } from "@/practice/overlay-frame";
import { browserClock } from "@/practice/browser-clock";
import { percentile } from "@/practice/detections";

import {
  MotionWindows,
  motionSignature,
  signatureDifference,
  type CameraSnapshot as Snapshot,
  type CapturedWindow,
} from "@/practice/motion-windows";
export default function RelationPractice({
  row,
  onBack,
}: {
  row: SavedGuide;
  onBack: () => void;
}) {
  const guide = row.artifact.guide,
    plan = {
      ...guide.relationPlan!,
      goal: guide.goal,
      steps: guide.relationPlan!.steps.map((s) => {
        const reviewed = guide.steps.find((g) => g.id === s.id)!;
        return {
          ...s,
          instruction: reviewed.instruction,
          correction: reviewed.correction,
        };
      }),
    };
  const [message, setMessage] = useState(
      "Show the demonstrated starting arrangement. Keep the camera still and the relevant parts visible.",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [remaining, setRemaining] = useState(12),
    [states, setStates] = useState<Record<string, string>>({}),
    [readings, setReadings] = useState<RelationReading[]>([]),
    [finished, setFinished] = useState(false),
    [armed, setArmed] = useState(false),
    [voice, setVoice] = useState(true),
    [motion, setMotion] = useState(false),
    [localObjects, setLocalObjects] = useState<ObjectDetection[]>([]),
    [localWarning, setLocalWarning] = useState(false),
    [locating, setLocating] = useState(false),
    [queued, setQueued] = useState(0),
    [trackingNotice, setTrackingNotice] = useState(""),
    [latencyMs, setLatencyMs] = useState<number | null>(null),
    [checkHistory, setCheckHistory] = useState<number[]>([]),
    [speaking, setSpeaking] = useState(false),
    [lastSpoken, setLastSpoken] = useState(""),
    [voiceOn, setVoiceOn] = useState(false),
    [voiceLog, setVoiceLog] = useState<VoiceEvent[]>([]);
  const session = useRef<RelationSession | null>(null),
    token = useRef(""),
    request = useRef<AbortController | null>(null),
    running = useRef(false),
    checking = useRef(false),
    collector = useRef(new MotionWindows()),
    pixels = useRef<Pixels | null>(null),
    tracks = useRef<OverlayTrack[]>([]),
    localBaseline = useRef<ObjectDetection[]>([]),
    localHistory = useRef<{ at: number; frame: Pixels }[]>([]),
    grounding = useRef(false),
    grounded = useRef(false),
    warningSince = useRef<number | null>(null),
    warningSpoken = useRef(false),
    pending = useRef<CapturedWindow[]>([]),
    previous = useRef<number[]>([]),
    checkedSignature = useRef<number[]>([]),
    changedWhileChecking = useRef(false),
    generation = useRef(0),
    clock = useRef(createSessionClock()),
    events = useRef<
      { at: number; stepId: string; state: string; message: string }[]
    >([]),
    saved = useRef(false),
    voiceRef = useRef(voice);
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);
  const lastSaid = useRef("");
  function say(text: string) {
    // Speech queues asynchronously and never blocks paint; identical
    // repeats are dropped so a held state speaks once.
    if (!voiceRef.current || !("speechSynthesis" in window)) return;
    if (
      lastSaid.current === text &&
      (window.speechSynthesis.speaking || window.speechSynthesis.pending)
    )
      return;
    lastSaid.current = text;
    setVoiceLog((log) =>
      appendVoiceEvent(log, {
        at: browserClock.wall(),
        source: "steplint",
        text,
      }),
    );
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setLastSpoken(text);
    window.speechSynthesis.speak(utterance);
  }
  function pause(reason: string) {
    generation.current++;
    request.current?.abort();
    checking.current = false;
    grounding.current = false;
    setLocating(false);
    setBusy(false);
    clockPhase(clock.current, browserClock.monotonic(), "paused");
    running.current = false;
    setArmed(false);
    collector.current.reset();
    pending.current = [];
    setQueued(0);
    setMotion(false);
    setReadings([]);
    tracks.current = [];
    localHistory.current = [];
    setLocalObjects([]);
    setLocalWarning(false);
    setMessage(reason);
  }
  const {
    video,
    active: cameraActive,
    requesting: cameraRequesting,
    start: startCamera,
    stop: stopCamera,
    capture,
    getStats: getCameraStats,
  } = useGuideCamera(onFrame, pause);
  function snapshot(now: number): Snapshot {
    return { frame: Math.round(now), ...capture() };
  }
  function seedCapture() {
    collector.current.reset();
    const p = pixels.current;
    if (!p) return;
    const signature = motionSignature(p);
    const now = browserClock.monotonic();
    previous.current = signature;
    collector.current.observe(signature, now, () => snapshot(now));
  }
  function onFrame(cameraPixels: Pixels, now: number) {
    const p = overlayFrame(cameraPixels);
    pixels.current = p;
    if (grounding.current) {
      localHistory.current.push({ at: now, frame: p });
      if (localHistory.current.length > OVERLAY_REPLAY_FRAMES)
        localHistory.current.shift();
    }
    if (running.current && tracks.current.length) {
      const found = tracks.current.map((t) => trackOverlay(p, t));
      // Advisory feedback uses the two tracked parts as its reference.
      // Physical correctness still requires the independent scene witness.
      setLocalObjects(found);
      const step = plan.steps.find(
        (s) => session.current?.states[s.id] !== "verified",
      );
      const wrong =
        !!step && outsidePlacementTarget(step, localBaseline.current, found);
      if (wrong && !collector.current.moving) warningSince.current ??= now;
      else warningSince.current = null;
      const warn =
        warningSince.current !== null && now - warningSince.current >= 400;
      setLocalWarning(warn);
      if (warn && !warningSpoken.current) {
        say(
          "The part appears outside the target. Check its position before continuing.",
        );
        warningSpoken.current = true;
      }
      if (!warn) warningSpoken.current = false;
    }
    const current = motionSignature(p);
    previous.current = current;
    if (!running.current || session.current?.finished) return;
    if (remaining <= 0) {
      pause(
        "Verification allowance reached. No more automatic checks will run in this session. Stop the camera and start a new session to continue; this action has not been verified.",
      );
      return;
    }
    if (!grounded.current && !grounding.current) {
      void locate();
      return;
    }
    if (grounding.current) return;
    if (
      checking.current &&
      signatureDifference(checkedSignature.current, current) > 3
    ) {
      changedWhileChecking.current = true;
      setReadings([]);
    }
    try {
      const window = collector.current.observe(current, now, () =>
        snapshot(now),
      );
      setMotion(collector.current.moving);
      if (collector.current.moving) {
        setReadings([]);
        clockPhase(
          clock.current,
          now,
          "active",
          plan.steps.find((s) => session.current?.states[s.id] !== "verified")
            ?.id ?? null,
        );
      } else if (checking.current) clockPhase(clock.current, now, "verifying");
      if (window) {
        if (pending.current.length >= 2) {
          pause(
            "Verification is behind your actions. Pause work, then restore the current starting view to continue.",
          );
          return;
        }
        pending.current.push(window);
        setQueued(pending.current.length);
      }
      if (!checking.current && pending.current.length && remaining > 0) {
        const next = pending.current.shift()!;
        setQueued(pending.current.length);
        void check(next.frames, next.contextFrames);
      }
    } catch (e) {
      pause(
        e instanceof Error
          ? e.message
          : "Camera evidence could not be captured.",
      );
    }
  }
  async function locate() {
    if (
      !pixels.current ||
      !session.current ||
      checking.current ||
      remaining < 3
    )
      return;
    grounding.current = true;
    grounded.current = true;
    checking.current = true;
    setLocating(true);
    setBusy(true);
    setMessage(
      "Locating the starting items once for continuous camera tracking…",
    );
    const gen = generation.current,
      image = pixels.current,
      at = browserClock.monotonic();
    localHistory.current = [];
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/teach/guide/perceive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          token: token.current,
          ...capture(),
          stepIndex: Math.max(
            0,
            plan.steps.findIndex(
              (s) => session.current?.states[s.id] !== "verified",
            ),
          ),
        }),
      });
      const data = PerceptionResultSchema.parse(
        await readAppJson(response, "Starting object locations"),
      );
      if (gen !== generation.current) return;
      setRemaining(data.remainingModelRequests);
      tracks.current = data.objects.flatMap((d) => {
        const foreground = data.foregrounds.find(
          (f) => f.objectId === d.objectId,
        )?.foreground;
        if (d.quality !== "observed" || !d.box || !foreground) return [];
        try {
          return [groundOverlay(image, d.objectId, d.box, foreground)];
        } catch {
          return [];
        }
      });
      const replay = localHistory.current.filter((f) => f.at > at);
      if (replay.length && replay[0].at - at > 700) {
        tracks.current = [];
      }
      for (const [index, frame] of replay.entries()) {
        if (gen !== generation.current || controller.signal.aborted) return;
        // Delayed setup must not freeze microphone controls and gesture input.
        if (index % 4 === 0)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        tracks.current.forEach((t) => trackOverlay(frame.frame, t));
      }
      localBaseline.current = pixels.current
        ? tracks.current.map((t) => trackOverlay(pixels.current!, t))
        : [];
      setTrackingNotice(
        tracks.current.length === 0
          ? "Local circles are unavailable in this view. Camera change checks are active; a missing circle is not a verified result."
          : `Local tracking ready for ${tracks.current.length} item${tracks.current.length === 1 ? "" : "s"}.`,
      );
      setMessage(
        "Watching automatically. Follow the instruction; hold each result briefly for verification.",
      );
      say(
        plan.steps.find((s) => session.current?.states[s.id] !== "verified")
          ?.instruction ?? plan.goal,
      );
    } catch (e) {
      if (gen === generation.current && !controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Local tracking is unavailable; AI change checks remain available.",
        );
    } finally {
      if (gen === generation.current) {
        grounding.current = false;
        checking.current = false;
        setBusy(false);
        setLocating(false);
        localHistory.current = [];
        try {
          seedCapture();
        } catch {
          pause(
            "The starting frame was unavailable. Restore the starting view and continue.",
          );
        }
      }
    }
  }
  async function start() {
    const gen = ++generation.current;
    setError("");
    setBusy(true);
    try {
      const opened = z
        .object({
          token: z.string(),
          maximumModelRequests: z.number().int().max(12),
        })
        .parse(
          await readAppJson(
            await fetch("/api/teach/guide/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(row.artifact),
            }),
            "Practice session",
          ),
        );
      if (gen !== generation.current) return;
      token.current = opened.token;
      setRemaining(opened.maximumModelRequests);
      session.current = createRelationSession(
        plan,
        crypto.randomUUID(),
        guide.goalStepIds,
      );
      setStates({ ...session.current.states });
      setFinished(false);
      saved.current = false;
      events.current = [];
      clock.current = createSessionClock(browserClock.monotonic());
      await startCamera();
      if (gen !== generation.current) return;
      grounded.current = false;
      collector.current.reset();
      pending.current = [];
      setQueued(0);
      previous.current = [];
      running.current = true;
      setArmed(true);
      setMessage(
        "Camera ready. Keep the starting arrangement still while the items are located. Begin when watching automatically appears.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Camera setup failed.");
    } finally {
      setBusy(false);
    }
  }
  async function check(frames: Snapshot[], contextFrames: Snapshot[] = []) {
    if (checking.current || !session.current || remaining <= 0) return;
    clockPhase(clock.current, browserClock.monotonic(), "verifying");
    checking.current = true;
    checkedSignature.current = previous.current;
    changedWhileChecking.current = false;
    setBusy(true);
    setError("");
    setMessage("Checking the visible change. Hold the result still…");
    const startedAt = browserClock.monotonic();
    const gen = generation.current,
      s = session.current,
      controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/teach/guide/relations/perceive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          token: token.current,
          id: crypto.randomUUID(),
          epoch: s.epoch,
          width: frames[0].width,
          height: frames[0].height,
          frames: frames.map(({ frame, image }) => ({ frame, image })),
          contextFrames: (plan.steps.every((s) => s.after === "supported_by")
            ? []
            : contextFrames
          ).map(({ frame, image }) => ({
            frame,
            image,
          })),
        }),
      });
      const data = z
        .object({
          window: RelationWindowSchema,
          remainingModelRequests: z.number().int().min(0).max(12),
        })
        .parse(await readAppJson(response, "Camera observation"));
      if (gen !== generation.current) return;
      const checkMs = browserClock.monotonic() - startedAt;
      setLatencyMs(checkMs);
      setCheckHistory((h) => [...h.slice(-19), Math.round(checkMs)]);
      setRemaining(data.remainingModelRequests);
      setReadings(
        changedWhileChecking.current ? [] : data.window.frames[2].readings,
      );
      const recovered = recoverRelation(s, data.window);
      const emitted = evaluateRelationWindow(s, data.window);
      if (changedWhileChecking.current || pending.current.length)
        s.finished = false;
      events.current.push(
        ...emitted.map((e) => ({ ...e, at: browserClock.wall() })),
      );
      setStates({ ...s.states });
      const active = plan.steps.find(
        (step) => s.states[step.id] !== "verified",
      );
      const violation = emitted.find((e) => e.state === "violation");
      const verified = emitted.find((e) => e.state === "verified");
      const text = s.finished
        ? "Goal reached. Every step and the final visible relationships were verified."
        : violation
          ? violation.message
          : recovered
            ? "Starting relationship restored. Follow the current instruction."
            : verified
              ? `Step verified. ${active ? active.instruction : "Keep the final result visible for confirmation."}`
              : (emitted.find((e) => e.state === "needs_verification")
                  ?.message ??
                (active
                  ? active.instruction
                  : "Keep the final objects visible so the goal can be checked."));
      setMessage(text);
      say(text);
      setFinished(s.finished);
      if (s.finished && !saved.current) {
        clockPhase(clock.current, browserClock.monotonic(), "complete");
        saved.current = true;
        running.current = false;
        setArmed(false);
        const measured = timingSummary(
          clock.current,
          guide,
          s.states,
          browserClock.monotonic(),
        );
        await guideRepository.recordAttempt(row.key, {
          at: browserClock.wall(),
          completed: true,
          activeMs: measured.activeMs,
          pausedMs: measured.pausedMs,
          verificationMs: measured.verificationMs,
          elapsedMs: measured.elapsedMs,
          corrections: events.current.filter((e) => e.state === "violation")
            .length,
          stepMs: measured.stepMs,
        });
        if (guide.approval?.purpose === "rehearsal")
          await guideRepository.recordRehearsal(
            row.key,
            true,
            events.current.length,
            events.current.some((e) => e.state === "violation"),
          );
      }
      if (data.remainingModelRequests === 0 && !s.finished)
        pause(
          "This session reached its 12-check limit. Stop and start a new session to continue with a fresh observed starting state.",
        );
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : "The camera check failed.");
        pause(
          "The check did not finish. No automatic retry was made. Restore the current starting view before continuing.",
        );
      }
    } finally {
      if (gen === generation.current) {
        checking.current = false;
        setBusy(false);
        // Capture continues during this request; do not erase the next action.
        if (!s.finished && running.current)
          clockPhase(clock.current, browserClock.monotonic(), "active");
      }
    }
  }
  async function checkCurrentView() {
    if (checking.current || !cameraActive || !session.current || remaining <= 0)
      return;
    const gen = generation.current;
    checking.current = true;
    setBusy(true);
    const frames = [snapshot(browserClock.monotonic())];
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (gen !== generation.current) return;
      frames.push(snapshot(browserClock.monotonic()));
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (gen !== generation.current) return;
      frames.push(snapshot(browserClock.monotonic()));
    } catch (e) {
      if (gen === generation.current)
        setError(
          e instanceof Error ? e.message : "The camera frame was unavailable.",
        );
      return;
    } finally {
      if (gen === generation.current) {
        checking.current = false;
        setBusy(false);
      }
    }
    if (gen === generation.current) await check(frames);
  }
  function stop() {
    generation.current++;
    request.current?.abort();
    stopCamera();
    pause("Camera stopped.");
  }
  useEffect(
    () => () => {
      generation.current++;
      request.current?.abort();
      running.current = false;
    },
    [],
  );
  const active =
    plan.steps.find((step) => states[step.id] !== "verified") ??
    plan.steps.at(-1)!;
  const evidence = guide.steps.find((s) => s.id === active.id)!;
  const highlightId =
    plan.steps.find((s) => states[s.id] === "violation")?.id ?? active.id;
  const highlightStep = plan.steps.find((s) => s.id === highlightId) ?? active;
  const highlighted = readings.find(
    (r) => r.stepId === highlightId && r.visibility === "clear",
  );
  const wrong = Object.values(states).includes("violation");
  const localHighlight = localObjects.filter(
    (d) =>
      d.quality === "observed" &&
      d.box &&
      (d.objectId === highlightStep.objectId ||
        d.objectId === highlightStep.anchorId),
  );
  const hasLocalPrimary = localHighlight.some(
    (d) => d.objectId === highlightStep.objectId,
  );
  function downloadDiagnostics() {
    const report = {
      version: "practice-capture-repair-2",
      at: new Date().toISOString(),
      method: guide.methodId,
      guideId: guide.id,
      browser: navigator.userAgent,
      camera: {
        active: cameraActive,
        requesting: cameraRequesting,
        ...getCameraStats(),
      },
      flow: { armed, busy, locating, motion, queued, remaining, finished },
      tracking: {
        tracks: tracks.current.length,
        replayFrames: localHistory.current.length,
        notice: trackingNotice,
      },
      verification: {
        states,
        checkHistoryMs: checkHistory,
        error,
        events: events.current.slice(-40),
      },
      voice: {
        status: voiceControl.status,
        feedback: voiceControl.feedback,
        disposition: voiceControl.lastDisposition,
      },
    };
    const href = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = href;
    link.download = "steplint-practice-diagnostics.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  function continuePractice() {
    if (
      !cameraActive ||
      checking.current ||
      !session.current ||
      session.current.finished ||
      remaining <= 0
    )
      return false;
    running.current = true;
    setArmed(true);
    seedCapture();
    pending.current = [];
    setQueued(0);
    setMessage(
      "Starting view reset. Perform the current instruction and hold the result still.",
    );
    return true;
  }
  function runRelationVoice(id: string, disposition: CommandDisposition) {
    void disposition;
    const active = plan.steps.find((s) => states[s.id] !== "verified");
    const verified = plan.steps.filter(
      (s) => states[s.id] === "verified",
    ).length;
    const refuse = (text: string) => say(text);
    switch (id) {
      case "start-practice":
        if (!cameraActive && !busy && !cameraRequesting) void start();
        else if (remaining <= 0)
          refuse(
            "Verification allowance reached. Stop the camera and start a new session before continuing.",
          );
        else if (!armed && !busy) continuePractice();
        else refuse("Practice is already running.");
        break;
      case "pause-practice":
        if (cameraActive)
          pause("Practice paused. Your verified steps are kept.");
        else refuse("Nothing is running right now.");
        break;
      case "resume-practice":
        if (!cameraActive)
          refuse("Start the camera to begin a fresh observed session.");
        else if (remaining <= 0)
          refuse(
            "Verification allowance reached. Stop the camera and start a new session before continuing.",
          );
        else if (armed) refuse("Practice is already running.");
        else if (!continuePractice())
          refuse("Wait for the current check to finish before continuing.");
        break;
      case "end-practice":
        stop();
        break;
      case "repeat-instruction":
        if (active) say(active.instruction);
        else say("All steps are verified. Well done.");
        break;
      case "current-step":
        if (active)
          say(
            `Step ${plan.steps.indexOf(active) + 1} of ${plan.steps.length}. ${active.instruction} State: ${states[active.id] ?? "waiting"}.`,
          );
        else say("All steps are verified. Well done.");
        break;
      case "read-progress":
        say(`${verified} of ${plan.steps.length} steps verified.`);
        break;
      case "stop-speaking":
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
        break;
      case "help":
        say(
          "Say StepLint, start practice. Pause or end practice. Repeat the instruction. Ask the current step or your progress. Say stop speaking to silence me.",
        );
        break;
    }
  }
  const voiceControl = useVoiceControl({
    commands: RELATION_COMMANDS,
    enabled: voiceOn,
    onAction: runRelationVoice,
    onEvent: (event) => setVoiceLog((log) => appendVoiceEvent(log, event)),
  });
  return (
    <Workspace mode="practice">
      <div className="mb-5 flex justify-between gap-4">
        <div>
          <p className="text-sm text-emerald-800">
            {guide.approval?.purpose === "rehearsal"
              ? "Private creator rehearsal"
              : "Practice"}
          </p>
          <h1 className="text-3xl font-bold">{guide.title}</h1>
        </div>
        <div className="flex gap-3">
          <Link href="/teach">Return to review</Link>
          <button
            onClick={() => {
              stop();
              onBack();
            }}
          >
            Choose another guide
          </button>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section>
          <div className="relative overflow-hidden rounded-2xl bg-slate-950">
            <video ref={video} muted playsInline className="block w-full" />
            {cameraActive && hasLocalPrimary && (
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                aria-label="Locally tracked relevant parts"
              >
                <g
                  fill="none"
                  stroke={
                    wrong || localWarning
                      ? "#fb7185"
                      : finished
                        ? "#34d399"
                        : "#facc15"
                  }
                  strokeWidth="5"
                  className={
                    wrong || localWarning
                      ? "practice-correction-pulse"
                      : undefined
                  }
                >
                  {localHighlight.map((d) => (
                    <ellipse
                      key={d.objectId}
                      cx={(d.box!.left + d.box!.right) * 500}
                      cy={(d.box!.top + d.box!.bottom) * 500}
                      rx={(d.box!.right - d.box!.left) * 500 + 10}
                      ry={(d.box!.bottom - d.box!.top) * 500 + 10}
                    />
                  ))}
                </g>
              </svg>
            )}
            {cameraActive && highlighted && !hasLocalPrimary && (
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                aria-label="Relevant observed parts"
              >
                <g
                  fill="none"
                  stroke={wrong ? "#fb7185" : finished ? "#34d399" : "#facc15"}
                  strokeWidth="5"
                  className={wrong ? "practice-correction-pulse" : undefined}
                >
                  {[highlighted.objectBox, highlighted.anchorBox].map(
                    (b, i) =>
                      b && (
                        <ellipse
                          key={i}
                          cx={(b.left + b.right) * 500}
                          cy={(b.top + b.bottom) * 500}
                          rx={(b.right - b.left) * 500 + 12}
                          ry={(b.bottom - b.top) * 500 + 12}
                        />
                      ),
                  )}
                </g>
              </svg>
            )}
          </div>
          <div
            role="status"
            aria-live="polite"
            className={`mt-4 rounded-xl border p-4 ${wrong ? "border-rose-300 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}
          >
            <strong>
              {finished
                ? "Goal reached"
                : wrong
                  ? "Correction needed"
                  : busy
                    ? "Checking…"
                    : active.instruction}
            </strong>
            <p className="mt-2">{message}</p>
          </div>
          {localWarning && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-rose-400 bg-rose-50 p-3 text-rose-900"
            >
              The tracked part appears outside the target. Check its position.
              AI verification is still required.
            </p>
          )}
          {error && (
            <p role="alert" className="my-3 text-red-800">
              {error}
            </p>
          )}
          <div className="my-4 flex flex-wrap gap-3">
            {!cameraActive ? (
              <button
                className="primary"
                disabled={busy || cameraRequesting}
                onClick={() => void start()}
              >
                Start camera
              </button>
            ) : (
              <>
                {!armed && !finished && (
                  <button
                    disabled={busy || remaining <= 0}
                    onClick={() => {
                      continuePractice();
                    }}
                  >
                    Continue from this starting view
                  </button>
                )}
                <button onClick={stop}>Stop camera</button>
                <GestureControls
                  videoRef={video}
                  onPauseRequest={() =>
                    pause("Practice paused. Your verified steps are kept.")
                  }
                />
                <button
                  disabled={busy || remaining < 3}
                  onClick={() => void locate()}
                >
                  Locate items again
                </button>
                <details>
                  <summary>Troubleshoot</summary>
                  <p className="mt-2 text-sm text-slate-600">
                    Watching and verification run automatically. Use this only
                    when the view looks settled but nothing is happening.
                  </p>
                  <button
                    className="mt-2"
                    disabled={busy || remaining <= 0}
                    onClick={() => void checkCurrentView()}
                  >
                    Check current view
                  </button>
                </details>
                <button
                  onClick={() =>
                    pause(
                      "Paused. Restore the current starting view before continuing.",
                    )
                  }
                >
                  Pause
                </button>
              </>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={voice}
                onChange={(e) => setVoice(e.target.checked)}
              />
              Spoken guidance
            </label>
          </div>
          <p role="status" className="mb-2 text-sm font-medium">
            {cameraActive
              ? armed
                ? locating
                  ? "Locating starting objects…"
                  : motion
                    ? "Watching movement — correctness not yet verified"
                    : busy
                      ? "Camera watching · verification pending"
                      : "Watching automatically"
                : "Paused"
              : "Camera off"}
            {queued > 0
              ? ` · ${queued} captured action${queued > 1 ? "s" : ""} waiting`
              : ""}
            {latencyMs !== null
              ? ` · Last verification check: ${(latencyMs / 1000).toFixed(1)}s`
              : ""}
          </p>
          <p className="text-sm text-slate-600">
            StepLint locates the starting objects, then checks each visible
            change automatically. Circles show the last observed locations; an
            unclear view never counts as success. Verification takes a moment;
            wait for confirmation before a dependent or irreversible action.
          </p>
          <details className="text-sm text-slate-600">
            <summary>Developer details</summary>
            <button type="button" onClick={downloadDiagnostics}>
              Download Practice diagnostics
            </button>
            <p>{trackingNotice}</p>
            <p>
              {remaining} verification requests remain for this session (median{" "}
              {(percentile(checkHistory, 50) / 1000).toFixed(1)}s over{" "}
              {checkHistory.length} checks).
            </p>
          </details>
        </section>
        <aside className="space-y-4">
          <GuideAvatar
            mode={resolveAvatarMode({
              violation: plan.steps.some((s) => states[s.id] === "violation"),
              complete: finished,
              uncertain: plan.steps.some(
                (s) => states[s.id] === "needs_verification",
              ),
              busy: busy || locating,
            })}
            speech={speaking ? "speaking" : "silent"}
            caption={lastSpoken || undefined}
          />
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
              <p role="status" className="mt-1 text-slate-600">
                {voiceControl.status === "listening"
                  ? "Listening for StepLint commands"
                  : voiceControl.status === "requesting"
                    ? "Requesting microphone permission…"
                    : voiceControl.status === "unsupported"
                      ? "Voice control is not supported in this browser — use the buttons"
                      : voiceControl.status === "denied"
                        ? "Microphone unavailable — use the buttons"
                        : voiceControl.status === "error"
                          ? "Voice recognition error — use the buttons"
                          : "Voice control off"}
                {voiceControl.lastHeard &&
                  ` · Last heard: “${voiceControl.lastHeard}”`}
              </p>
            )}
          </div>
          {voiceOn && (
            <>
              <CommandFeedback
                feedback={voiceControl.feedback}
                commands={voiceControl.availableCommands}
                onRestart={
                  voiceControl.status === "error" ||
                  voiceControl.status === "denied"
                    ? voiceControl.restart
                    : undefined
                }
              />
              <VoicePanel events={voiceLog} />
            </>
          )}
          {(() => {
            const failed = plan.steps.find((s) => states[s.id] === "violation");
            if (finished)
              return (
                <PracticeAlert
                  tone="complete"
                  title="Goal reached"
                  body="Every step and the final visible relationships were verified."
                />
              );
            if (!failed) return null;
            return (
              <PracticeAlert
                tone="violation"
                title="Pause and correct"
                step={failed.instruction}
                body={failed.correction}
              />
            );
          })()}
          <ol className="space-y-3">
            {guide.steps.map((s, i) => (
              <li key={s.id} className="rounded-xl border bg-white p-3">
                <strong>
                  {states[s.id] === "verified" ? "✓" : `${i + 1}.`}{" "}
                  {s.instruction}
                </strong>
                {states[s.id] === "violation" && (
                  <p className="mt-2 text-rose-800">{s.correction}</p>
                )}
                {states[s.id] === "needs_verification" && (
                  <p className="text-amber-800">
                    Needs a clearer observed attempt
                  </p>
                )}
              </li>
            ))}
          </ol>
          <GuideFrame
            guide={guide}
            frame={evidence.evidence.startFrame}
            title="Starting relationship"
          />
          <GuideFrame
            guide={guide}
            frame={evidence.evidence.endFrame}
            title="Expected result"
          />
        </aside>
      </div>
    </Workspace>
  );
}
