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
import { ApprovedArtifactSchema } from "@/teach/approved-artifact";
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
import { readAppJson } from "@/teach/api-response";
import { useVoiceControl, type VoiceEvent } from "@/voice/use-voice-control";
import CommandFeedback from "@/voice/CommandFeedback";
import VoicePanel, { appendVoiceEvent } from "@/voice/VoicePanel";
import GestureControls from "@/gesture/GestureControls";
import { LOCAL_PRACTICE_COMMANDS } from "@/practice/local-commands";
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
    automaticLoading = useRef(false);
  const automaticSource = useRef<{
    scene: Pixels;
    objects: { id: string; box: Region; fixed: boolean; image: Pixels }[];
  } | null>(null);
  const [manualSetupOpen, setManualSetupOpen] = useState(false);
  const [references, setReferences] = useState<ProcedureReferences | null>(
    null,
  );
  const [resumeRequested, setResumeRequested] = useState(false);
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
  const [speaking, setSpeaking] = useState(false);
  const speechGeneration = useRef(0);
  const [guidanceOn, setGuidanceOn] = useState(true);
  const [voiceOn, setVoiceOn] = useState(false),
    [voiceLog, setVoiceLog] = useState<VoiceEvent[]>([]);
  const latest = useRef<Pixels | null>(null),
    worker = useRef<Worker | null>(null),
    busy = useRef(false),
    generation = useRef(0),
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
    if (
      !guidanceOn ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance !== "function"
    )
      return;
    try {
      const gen = ++speechGeneration.current;
      window.speechSynthesis.cancel();
      setSpeaking(false);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => {
        if (gen === speechGeneration.current) {
          setSpeaking(true);
          log({ at: Date.now(), source: "steplint", text });
        }
      };
      utterance.onend = utterance.onerror = () => {
        if (gen === speechGeneration.current) setSpeaking(false);
      };
      window.speechSynthesis.speak(utterance);
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
    reason = "Practice paused. Say ‘Muse, resume practice’ to continue.",
    invalidate = false,
  ) {
    automaticWanted.current = false;
    speechGeneration.current++;
    setSpeaking(false);
    window.speechSynthesis?.cancel();
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    busy.current = false;
    setRunning(false);
    setStarting(false);
    setNotice(reason);
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
        return;
      }
      trackingCounters.current.submitted++;
      busy.current = true;
      const copy = new Uint8ClampedArray(image.data);
      const frameId = `frame-${++sequence.current}`;
      evidence.current.add(frameId, now, image);
      worker.current.postMessage(
        {
          type: "frame",
          generation: generation.current,
          image: { width: image.width, height: image.height, data: copy },
          timestampMs: now,
          frameId,
        },
        [copy.buffer],
      );
    },
    (reason) => halt(reason, true),
    { width: 320, height: 240, intervalMs: 33 },
  );
  const handlers = useRef({
    halt,
    show,
    automaticStart: (image: Pixels) =>
      start({ image, source: automaticSource.current! }),
  });
  useEffect(() => {
    handlers.current = {
      halt,
      show,
      automaticStart: (image: Pixels) =>
        start({ image, source: automaticSource.current! }),
    };
  });
  useEffect(
    () => () => {
      worker.current?.terminate();
      speechGeneration.current++;
      window.speechSynthesis?.cancel();
    },
    [],
  );
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const handoff = sessionStorage.getItem("steplint-approved-handoff");
        if (handoff) {
          await saveApprovedProcedure(handoff);
          sessionStorage.removeItem("steplint-approved-handoff");
        }
        const rows = await listApprovedProcedures();
        if (active) setSaved(rows);
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
  }, []);
  async function load(raw: string) {
    const loading = ++loadGeneration.current;
    halt("Loading approval…");
    setError("");
    try {
      const artifact = ApprovedArtifactSchema.parse(JSON.parse(raw));
      if (!artifact.procedure.execution)
        throw Error(
          "This older approval needs a new executable review in Teach. Its original export is preserved.",
        );
      const response = await fetch("/api/teach/practice-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: raw,
      });
      const validated = PracticeLessonSchema.parse(
        await readAppJson(response, "Approval verification"),
      );
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
        void startCamera(video ? video.width / video.height : undefined);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Approved lesson could not load.",
      );
    }
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
      setStarting(true);
      setAlert(null);
      setDetections([]);
      setStartingVerified(false);
      if (!resuming && !automatic) archiveSession();
      session.current = next;
      setResult(next.result);
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
            );
            return;
          }
          const reply = parsed.data;
          if (reply.generation !== generation.current) return;
          busy.current = false;
          if (reply.type !== "error")
            trackingMeasurements.current = reply.measurements;
          if (reply.type === "error" && automatic && automaticWanted.current) {
            localWorker.terminate();
            worker.current = null;
            busy.current = false;
            session.current = previousSession;
            if (previousSession) previousSession.stopped = true;
            setResult(previousSession?.result ?? null);
            setStarting(false);
            setNotice(reply.message);
            setDetections([]);
            return;
          }
          if (reply.type === "error") {
            setError(reply.message);
            handlers.current.halt(reply.message, true);
            return;
          }
          if (reply.type === "calibrated") {
            if (automatic && reply.translation) {
              if (!resuming && previousSession) {
                session.current = previousSession;
                archiveSession();
                session.current = next;
              }
              const aligned = lesson.zoneBindings.map((binding) => ({
                ...binding,
                region: translateBox(
                  binding.region,
                  reply.translation!.x,
                  reply.translation!.y,
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
            setNotice(
              "Automatic tracking active. Checking starting positions before the first instruction.",
            );
            return;
          }
          trackingCounters.current.processed++;
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
            );
            return;
          }
          setDetections(reply.detections);
          const wasArmed = active.armed;
          const frame = feedTrackingFrame(active, reply);
          const updated = frame.changed ? frame.result : null;
          const warning = frame.warning;
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
                : "Goal verified. Monitoring continues until you stop; reversing a required state triggers correction.",
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
            if (updated.status === "passed")
              setNotice(
                "Goal verified. Monitoring continues until you stop; reversing a required state triggers correction.",
              );
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
        );
      const copy = new Uint8ClampedArray(setupImage.data);
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
    onAction: (id, disposition) => {
      if (disposition !== "executed") {
        if (disposition === "needs-confirmation")
          speak(
            "Say Guide, confirm restart practice to start a new attempt. Verified history will remain in the audit.",
          );
        return;
      }
      if (id === "start-camera" || (id === "start-practice" && !cameraActive)) {
        if (!lesson || cameraRequesting) {
          speak(
            "Choose an approved lesson first, or wait for camera permission.",
          );
          return false;
        }
        latest.current = null;
        setFrameReady(false);
        void startCamera(
          lesson?.sourceLesson?.media.info.video
            ? lesson.sourceLesson.media.info.video.width /
                lesson.sourceLesson.media.info.video.height
            : undefined,
        );
        return;
      }
      if (id === "stop-camera") {
        halt("Camera stopped.");
        stopCamera();
        return;
      }
      if (id === "capture-setup") {
        if (worker.current) {
          speak("Pause practice before changing calibration.");
          return false;
        }
        return prepareSetup(false);
      }
      if (id === "start-practice") {
        if (worker.current) {
          speak("Practice is already running or starting.");
          return false;
        }
        if (
          lesson?.automaticSetup &&
          automaticSource.current &&
          !manualSetupOpen
        ) {
          automaticWanted.current = true;
          automaticAttemptAt.current = -Infinity;
          setNotice("Finding the starting view automatically.");
          return;
        }
        if (!still) return prepareSetup(false);
        if (!calibrationConsent || fields.some((field) => !marks[field.id])) {
          speak(
            "Mark every required object, zone and reference, then confirm calibration first.",
          );
          return false;
        }
        start();
        return;
      }
      if (id === "resume-practice") {
        if (
          lesson?.automaticSetup &&
          automaticSource.current &&
          session.current?.stopped
        ) {
          setResumeRequested(true);
          automaticWanted.current = true;
          automaticAttemptAt.current = -Infinity;
          setNotice("Resuming automatic tracking. Verified work is retained.");
          if (!cameraActive)
            void startCamera(
              lesson?.sourceLesson?.media.info.video
                ? lesson.sourceLesson.media.info.video.width /
                    lesson.sourceLesson.media.info.video.height
                : undefined,
            );
          return;
        }
        return prepareSetup(true);
      }
      if (id === "restart-practice") {
        return prepareSetup(false);
      }
      if (id === "end-practice") {
        halt("Practice ended. The last observed result is retained.");
        stopCamera();
        return;
      }
      if (id === "pause-practice") {
        if (!worker.current) {
          speak("Practice is not running.");
          return false;
        }
        halt();
      } else if (id === "stop-speaking") {
        speechGeneration.current++;
        setSpeaking(false);
        window.speechSynthesis?.cancel();
      } else {
        if (!session.current) {
          speak("Choose an approved lesson and start the camera first.");
          return;
        }
        if (session.current.stopped) {
          speak("Practice is paused. Recalibrate before continuing.");
          return;
        }
        const next = session.current.procedure.steps.find(
          (s) =>
            session.current?.result.steps.find((state) => state.stepId === s.id)
              ?.status !== "passed",
        );
        speak(
          next?.description ?? "Goal verified; monitoring required states.",
        );
      }
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
      <div className="mx-auto max-w-6xl space-y-5">
        <div>
          <h1 className="text-3xl font-bold">Practice a guide</h1>
          <p>
            Choose a guide and allow the camera. Practice recognizes the
            starting view and checks movements automatically.
          </p>
        </div>
        <div
          data-testid="practice-live-row"
          className={`grid items-stretch gap-4 bg-slate-50 py-2 md:grid-cols-2 ${still && !running ? "" : "md:sticky md:top-0 md:z-20"}`}
        >
          <section
            data-testid="practice-camera"
            className={`min-w-0 overflow-hidden rounded-2xl border-2 bg-white ${running && result?.status === "failed" ? "border-red-600 practice-frame-warning" : running && result?.status === "passed" ? "border-green-600" : "border-slate-200"}`}
          >
            <div className="flex items-center justify-between border-b px-4 py-3 text-sm font-semibold">
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
                      : result?.status === "passed"
                        ? "Goal verified"
                        : "Practice active"
                    : "Camera on"
                  : "Camera off"}
              </span>
            </div>
            <div
              className="relative mx-auto w-full bg-slate-950"
              style={{
                maxWidth: `min(100%, ${(cameraSize.width / cameraSize.height) * 30}vh)`,
              }}
            >
              <video
                ref={videoRef}
                muted
                playsInline
                className={`block w-full bg-slate-950 ${cameraActive ? "" : "aspect-[4/3]"}`}
                aria-label="Live work camera"
              />
              {running && (
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
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
            {!cameraActive && (
              <p className="p-4 text-sm text-slate-500">
                Choose a guide and start the camera when you’re ready.
              </p>
            )}
          </section>
          <div data-testid="practice-companion" className="min-w-0">
            <GuideAvatar
              mode={resolveAvatarMode({
                violation: running && result?.status === "failed",
                complete:
                  running &&
                  result?.status === "passed" &&
                  alert?.kind !== "warning",
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
        <p id="local-practice-status" role="status">
          {notice}
        </p>
        <details
          open={!lesson}
          aria-label="Lesson library"
          className="space-y-4 rounded-2xl border bg-white p-5"
        >
          <summary className="text-lg font-bold">
            {lesson
              ? `${lesson.procedure.title} · Change guide`
              : "Your guides"}
          </summary>
          {!lesson && saved.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {saved.map((row) => (
                <button
                  key={row.id}
                  className="!overflow-hidden !rounded-2xl !p-0 text-left"
                  onClick={() => void load(row.raw)}
                >
                  {row.references && (
                    <svg
                      viewBox="0 0 640 480"
                      aria-hidden="true"
                      className="w-full bg-slate-950"
                    >
                      <image
                        href={row.references.goal}
                        width="640"
                        height="480"
                        preserveAspectRatio="xMidYMid meet"
                      />
                    </svg>
                  )}
                  <span className="block p-5">
                    <strong className="block text-lg">{row.title}</strong>
                    <span className="mt-3 block text-sm text-emerald-800">
                      Practice this guide →
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {!saved.length && (
            <p className="text-sm text-slate-600">
              Your first guide starts in Teach. Create and review a lesson, then
              it will appear here.
            </p>
          )}
          <label>
            Approved lessons{" "}
            <select
              disabled={running || starting}
              value={lesson?.procedure.id ?? ""}
              onChange={(e) => {
                const row = saved.find((r) => r.id === e.target.value);
                if (row) void load(row.raw);
              }}
            >
              <option value="">Choose a lesson</option>
              {saved.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Import an unchanged approved export{" "}
            <input
              disabled={running || starting}
              type="file"
              accept="application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void (async () => {
                    try {
                      if (file.size > 1_500_000)
                        throw Error("Export exceeds the size limit.");
                      const raw = await file.text();
                      await saveApprovedProcedure(raw);
                      setSaved(await listApprovedProcedures());
                      await load(raw);
                    } catch (error) {
                      setError(
                        error instanceof Error
                          ? error.message
                          : "Import failed.",
                      );
                    }
                  })();
              }}
            />
          </label>
        </details>
        {lesson && (
          <section
            className="space-y-3 rounded-2xl border bg-white p-5"
            aria-label="Current step and goal"
          >
            <p>Goal: {lesson.procedure.execution?.goal}</p>
            <p className="font-semibold">
              Next:{" "}
              {!running
                ? lesson.automaticSetup
                  ? "Show the demonstrated starting view; automatic tracking is preparing."
                  : "Open a fresh Teach approval for automatic tracking."
                : !startingVerified
                  ? "Checking starting positions before you begin."
                  : (lesson.procedure.steps.find(
                      (step) =>
                        result?.steps.find((state) => state.stepId === step.id)
                          ?.status !== "passed",
                    )?.description ??
                    "Goal verified; keep required states in place.")}
            </p>
          </section>
        )}
        {!cameraActive ? (
          <button
            disabled={!lesson || cameraRequesting}
            onClick={() => {
              latest.current = null;
              setFrameReady(false);
              void startCamera(
                lesson?.sourceLesson?.media.info.video
                  ? lesson.sourceLesson.media.info.video.width /
                      lesson.sourceLesson.media.info.video.height
                  : undefined,
              );
            }}
          >
            Start camera
          </button>
        ) : (
          <>
            <button
              onClick={() => {
                halt("Camera stopped.");
                stopCamera();
              }}
            >
              Stop camera
            </button>
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
        {still && lesson && !running && (
          <section className="space-y-3 rounded-2xl border bg-white p-5">
            <h2 className="text-xl font-bold">Calibrate this view</h2>
            <p>
              Keep the camera fixed. Mark each movable object tightly. For a
              fixed destination, mark a stable visible edge or feature. Then
              mark the starting/destination zones and a separate stationary
              textured reference. Fixed destination objects must remain in the
              marked zones. If a destination moves, stop and recalibrate.
            </p>
            <select value={field} onChange={(e) => setField(e.target.value)}>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {marks[f.id] ? "✓ " : ""}
                  {f.name}
                </option>
              ))}
            </select>
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
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={calibrationConsent}
                onChange={(e) => setCalibrationConsent(e.target.checked)}
              />
              I checked object identities, zone meanings and fixed destinations
              against the approved lesson.{" "}
              {resumeRequested
                ? "Completed states remain in place; unfinished actions are at their starting positions."
                : "The objects are in the demonstrated starting positions."}
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
          </section>
        )}
        {running && <button onClick={() => halt()}>Pause practice</button>}
        {!running && lesson?.automaticSetup && result && (
          <button
            onClick={() => {
              setResumeRequested(true);
              automaticWanted.current = true;
              automaticAttemptAt.current = -Infinity;
              if (!cameraActive)
                void startCamera(
                  lesson?.sourceLesson?.media.info.video
                    ? lesson.sourceLesson.media.info.video.width /
                        lesson.sourceLesson.media.info.video.height
                    : undefined,
                );
            }}
          >
            Resume practice
          </button>
        )}
        {alert && (
          <div
            key={alert.key}
            data-testid="practice-verdict"
            role={alert.kind === "failed" ? "alert" : "status"}
            aria-live="polite"
            className={`rounded-xl border-2 p-4 text-lg font-bold ${alert.kind === "failed" ? "border-red-600 bg-red-50 text-red-800 practice-correction-pulse" : alert.kind === "passed" ? "border-green-600 bg-green-50 text-green-800" : "border-amber-600 bg-amber-50 text-amber-800"}`}
          >
            {alert.text}
          </div>
        )}
        {lesson && (
          <section
            aria-label="Steps"
            className="space-y-3 rounded-2xl border bg-white p-5"
          >
            <h2 className="text-xl font-bold">Steps</h2>
            <p>
              {running
                ? "Live verification"
                : "Last observed result — monitoring is inactive."}
            </p>
            <ol className="space-y-2">
              {lesson.procedure.steps.map((step, index) => {
                const s = result?.steps.find(
                  (state) => state.stepId === step.id,
                ) ?? { stepId: step.id, status: "pending" };
                return (
                  <li
                    key={s.stepId}
                    className="flex gap-3 rounded-xl border border-slate-200 p-4"
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
          </section>
        )}
        {lesson && (
          <section
            aria-label="Before and final goal"
            className="space-y-4 rounded-2xl border bg-white p-5"
          >
            <h2 className="text-xl font-bold">Before and final goal</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <figure className="overflow-hidden rounded-xl border bg-slate-50">
                {references ? (
                  <svg
                    role="img"
                    aria-label="Demonstrated starting state"
                    viewBox={`0 0 ${lesson.sourceLesson?.media.info.video?.width ?? 640} ${lesson.sourceLesson?.media.info.video?.height ?? 480}`}
                    className="w-full bg-slate-950"
                  >
                    <image
                      href={references.before}
                      width="100%"
                      height="100%"
                    />
                  </svg>
                ) : (
                  <p className="p-5 text-sm text-slate-500">
                    No starting image was saved with this export. A fresh Teach
                    save includes it.
                  </p>
                )}
                <figcaption className="p-4">
                  <strong>Before</strong>
                  <p className="mt-1 text-sm text-slate-600">
                    {lesson.procedure.steps[0].description}
                  </p>
                  {references && (
                    <p className="text-xs text-slate-500">
                      Reviewed demonstration ·{" "}
                      {(references.beforeMs / 1000).toFixed(2)}s
                    </p>
                  )}
                </figcaption>
              </figure>
              <figure className="overflow-hidden rounded-xl border bg-slate-50">
                {references ? (
                  <svg
                    role="img"
                    aria-label="Demonstrated final goal"
                    viewBox={`0 0 ${lesson.sourceLesson?.media.info.video?.width ?? 640} ${lesson.sourceLesson?.media.info.video?.height ?? 480}`}
                    className="w-full bg-slate-950"
                  >
                    <image href={references.goal} width="100%" height="100%" />
                  </svg>
                ) : (
                  <p className="p-5 text-sm text-slate-500">
                    No goal image was saved with this export. A fresh Teach save
                    includes it.
                  </p>
                )}
                <figcaption className="p-4">
                  <strong>Final goal</strong>
                  <p className="mt-1 text-sm text-slate-600">
                    {lesson.procedure.execution?.goal}
                  </p>
                  {references && (
                    <p className="text-xs text-slate-500">
                      Reviewed demonstration ·{" "}
                      {(references.goalMs / 1000).toFixed(2)}s
                    </p>
                  )}
                </figcaption>
              </figure>
            </div>
            <p className="text-xs text-slate-500">
              Demonstration references help you compare the setup. Live
              verification uses the approved rules and current camera evidence.
            </p>
          </section>
        )}
        <section
          aria-label="Control settings"
          className="space-y-3 rounded-2xl border bg-white p-5"
        >
          <h2 className="text-xl font-bold">Control settings</h2>
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
              onClick={() => {
                setManualSetupOpen(false);
                setStill(null);
                setError("");
                automaticWanted.current = true;
                automaticAttemptAt.current = -Infinity;
                if (!cameraActive)
                  void startCamera(
                    lesson?.sourceLesson?.media.info.video
                      ? lesson.sourceLesson.media.info.video.width /
                          lesson.sourceLesson.media.info.video.height
                      : undefined,
                  );
              }}
            >
              Retry automatic setup
            </button>
          )}
          <label className="flex gap-2">
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
          <p>
            Say “Muse, pause”, “Muse, repeat” or “Muse, stop speaking”. Voice
            control: {voice.status}. {voice.feedback}
          </p>
          <CommandFeedback
            feedback={voice.feedback}
            commands={voice.availableCommands}
            onRestart={
              voice.status === "error" || voice.status === "denied"
                ? voice.restart
                : undefined
            }
          />
          <details>
            <summary>Available voice controls</summary>
            <p>
              “Muse, start camera” opens the camera. “Muse, capture setup” opens
              calibration. “Muse, start practice” starts a confirmed setup.
              “Guide, resume practice” prepares fresh calibration while
              retaining completed work. “Guide, end practice” stops the camera.
              “Guide, restart practice” requires “Guide, confirm restart
              practice” before preparing a new attempt. Voice cannot verify or
              skip steps.
            </p>
          </details>
          <VoicePanel events={voiceLog} />
          <GestureControls videoRef={videoRef} onPauseRequest={() => halt()} />
        </section>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <button onClick={download}>
          Export diagnostics and recent evidence
        </button>
        <a className="block" href="/practice?legacy=1">
          Open previous lesson library
        </a>
      </div>
    </Workspace>
  );
}
