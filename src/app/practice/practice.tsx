"use client";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import Workspace from "@/components/workspace";
import GuideFrame from "@/components/guide-frame";
import { type GuideObservation, type ObjectDetection } from "@/guide/schema";
import {
  guideRepository,
  latestPublished,
  type SavedGuide,
} from "@/guide/storage";
import {
  beginGuide,
  createGuideSession,
  feedGuideObservation,
  recoverReturnedObjects,
  shouldAutoStart,
  changeMetric,
  type GuideSession,
  type PracticeEvent,
} from "@/guide/evaluator";
import {
  PerceptionResultSchema,
  PerceptionSessionSchema,
} from "@/guide/perception-contract";
import {
  createObservationQuality,
  recordObservationQuality,
  evidenceAvailability,
} from "@/guide/observation-quality";
import {
  createSessionClock,
  clockPhase,
  timingSummary,
  formatDuration,
  localAverage,
} from "@/guide/timing";
import { needsStartingView } from "@/guide/perception-gates";
import { readAppJson } from "@/teach/api-response";
import {
  groundAppearance,
  groundBackground,
  trackPreparedAppearance,
  prepareTrackingFrame,
  type TrackingFrame,
  frameQuality,
  type AppearanceTrack,
} from "@/practice/appearance";
import type { Pixels } from "@/practice/tracker";
import { cameraNeedsAlignment } from "@/practice/camera-motion";
import { sameWorkbenchView } from "@/practice/resume-alignment";
import { useGuideCamera } from "./use-guide-camera";
type View =
  | "off"
  | "permission"
  | "setup"
  | "finding"
  | "ready"
  | "practice"
  | "paused"
  | "complete";
const fingerprint = (image: Pixels) => {
  const values = [];
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 16; x++) {
      const i =
        (Math.floor(((y + 0.5) * image.height) / 12) * image.width +
          Math.floor(((x + 0.5) * image.width) / 16)) *
        4;
      values.push((image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3);
    }
  return values;
};
const difference = (a: number[], b: number[]) =>
  a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;
export default function Practice() {
  const [rows, setRows] = useState<SavedGuide[]>([]),
    [selected, setSelected] = useState<SavedGuide | null>(null),
    [loading, setLoading] = useState(true),
    [view, setView] = useState<View>("off"),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [detections, setDetections] = useState<ObjectDetection[]>([]),
    [states, setStates] = useState<Record<string, string>>({}),
    [voice, setVoice] = useState(true),
    [showGoal, setShowGoal] = useState(false),
    [testMode, setTestMode] = useState(false),
    [autoStart, setAutoStart] = useState(true),
    [remaining, setRemaining] = useState(8),
    [latestEvent, setLatestEvent] = useState<PracticeEvent | null>(null);
  const [perceptionHelp, setPerceptionHelp] = useState("");
  const resumeContext = useRef<{
    background: AppearanceTrack | null;
    baseline: Record<string, GuideObservation>;
  } | null>(null);
  const restartRequired = useRef(false);
  const clock = useRef(createSessionClock());
  const observationQuality = useRef(createObservationQuality());
  const [, refreshClock] = useState(0);
  const recordedCompletion = useRef(false);
  const timingSessionId = useRef("");
  useEffect(() => {
    const id = window.setInterval(() => refreshClock((tick) => tick + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const background = useRef<AppearanceTrack | null>(null);
  const session = useRef<GuideSession | null>(null),
    pixels = useRef<Pixels | null>(null),
    tracks = useRef<AppearanceTrack[]>([]),
    epoch = useRef(""),
    token = useRef(""),
    request = useRef<AbortController | null>(null),
    remote = useRef(false),
    lastCheck = useRef(-Infinity),
    lastFingerprint = useRef<number[]>([]),
    lastChecked = useRef<number[]>([]),
    stableSince = useRef(0),
    blocked = useRef(false),
    phase = useRef("uncertain"),
    readyBefore = useRef<GuideObservation | null>(null),
    pendingReady = useRef(false),
    stepChecked = useRef(-1),
    history = useRef<{ at: number; prepared: TrackingFrame }[]>([]),
    sequence = useRef(0),
    latencies = useRef<{ eventId: string; ms: number }[]>([]),
    currentView = useRef<View>("off"),
    voiceRef = useRef(true),
    lastSaid = useRef(""),
    runGeneration = useRef(0);
  useEffect(() => {
    currentView.current = view;
    voiceRef.current = voice;
  }, [view, voice]);
  function speak(text: string) {
    if (
      !voiceRef.current ||
      lastSaid.current === text ||
      !("speechSynthesis" in window)
    )
      return;
    lastSaid.current = text;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }
  function saveTimingResult(completed: boolean) {
    const current = session.current;
    if (!selected || !current || clock.current.startedAt === null) return;
    const measured = timingSummary(
      clock.current,
      current.guide,
      current.steps,
      performance.now(),
    );
    void guideRepository
      .recordAttempt(selected.key, {
        sessionId: timingSessionId.current,
        at: Date.now(),
        completed,
        activeMs: measured.activeMs,
        pausedMs: measured.pausedMs,
        verificationMs: measured.verificationMs,
        elapsedMs: measured.elapsedMs,
        stepMs: measured.stepMs,
        corrections: current.events.filter(
          (event) => event.kind === "violation",
        ).length,
        evidence: {
          checked: observationQuality.current.checked,
          usable: observationQuality.current.usable,
          missing: observationQuality.current.missing,
          ambiguous: observationQuality.current.ambiguous,
          obstructed: observationQuality.current.obstructed,
        },
      })
      .then(async () => {
        const updated = (await guideRepository.list()).find(
          (row) => row.key === selected.key,
        );
        if (updated)
          setSelected((current) =>
            current?.key === updated.key ? updated : current,
          );
      })
      .catch((error) =>
        setError(
          error instanceof Error
            ? error.message
            : "The timing result could not be saved.",
        ),
      );
  }
  function pause(reason: string) {
    const current = session.current;
    if (
      current &&
      !current.finished &&
      !resumeContext.current &&
      current.guide.goalStepIds.some((id) => current.steps[id] === "verified")
    )
      resumeContext.current = {
        background: background.current
          ? structuredClone(background.current)
          : null,
        baseline: { ...current.baseline },
      };
    clockPhase(clock.current, performance.now(), "paused");
    if (!current?.finished) saveTimingResult(false);
    runGeneration.current++;
    request.current?.abort();
    remote.current = false;
    tracks.current = [];
    history.current = [];
    pixels.current = null;
    setDetections([]);
    readyBefore.current = null;
    pendingReady.current = false;
    if (session.current) {
      session.current.running = false;
      session.current.baseline = {};
      session.current.candidates = {};
    }
    setBusy(false);
    setView("paused");
    setMessage(reason);
    setError("");
  }
  function currentIndex(s: GuideSession) {
    const i = s.guide.steps.findIndex(
      (step) => s.steps[step.id] !== "verified",
    );
    return i < 0 ? s.guide.steps.length - 1 : i;
  }
  function applyEvents(events: PracticeEvent[]) {
    const s = session.current;
    if (!s || !events.length) return;
    setStates({ ...s.steps });
    const event = events.at(-1)!;
    setLatestEvent(event);
    if (event.kind === "violation") {
      if (selected?.artifact.guide.approval?.purpose === "rehearsal")
        void guideRepository
          .recordRehearsal(selected.key, false, s.events.length, true)
          .catch((e) =>
            setError(
              e instanceof Error
                ? e.message
                : "Test result could not be saved.",
            ),
          );
      setMessage(event.message);
      speak(event.message);
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          latencies.current.push({
            eventId: event.id,
            ms: Math.round(performance.now() - event.at),
          }),
        ),
      );
    }
    if (event.kind === "uncertain")
      speak(
        "Keep the part in view. If the action was hidden, return to the starting view.",
      );
    if (event.kind === "verified" || event.kind === "retry") {
      const next = s.guide.steps.find(
        (step) => s.steps[step.id] !== "verified",
      );
      if (next) {
        setMessage(next.instruction);
        speak(next.instruction);
      } else if (!s.finished) {
        setMessage(s.guide.goal);
        speak(`Match the reviewed final result. ${s.guide.goal}`);
      }
    }
    if (s.finished) {
      history.current = [];
      pixels.current = null;
      setDetections([]);
      clockPhase(clock.current, performance.now(), "complete");
      if (!recordedCompletion.current && selected) {
        recordedCompletion.current = true;
        saveTimingResult(true);
      }
      setView("complete");
      setMessage(s.guide.goal);
      speak("Guide complete. All reviewed visible steps were verified.");
      const row = selected;
      if (row?.artifact.guide.approval?.purpose === "rehearsal")
        void guideRepository
          .recordRehearsal(
            row.key,
            true,
            s.events.length,
            s.events.some((e) => e.kind === "violation"),
          )
          .catch((e) =>
            setError(
              e instanceof Error
                ? e.message
                : "Test result could not be saved.",
            ),
          );
    }
  }
  async function checkScene() {
    const s = session.current,
      image = pixels.current;
    if (!s || !image || remote.current || blocked.current || !token.current)
      return;
    const index = currentIndex(s),
      generation = runGeneration.current,
      captured = image,
      capturedAt = performance.now();
    remote.current = true;
    setBusy(true);
    lastCheck.current = capturedAt;
    lastChecked.current = fingerprint(captured);
    const controller = new AbortController();
    request.current = controller;
    if (!s.running) setView("finding");
    else speak("Hold the next part still while I locate it.");
    try {
      const snap = camera.capture();
      const response = await fetch("/api/teach/guide/perceive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.current,
          ...snap,
          stepIndex: index,
        }),
        signal: controller.signal,
      });
      const data = PerceptionResultSchema.parse(
        await readAppJson(response, "Camera check"),
      );
      if (generation !== runGeneration.current) return;
      setRemaining(data.remainingModelRequests);
      phase.current = data.phase;
      const capturedPrepared = prepareTrackingFrame(captured);
      const next: AppearanceTrack[] = [];
      const found: ObjectDetection[] = [];
      for (const detection of data.objects) {
        if (detection.quality !== "observed" || !detection.box) {
          found.push(detection);
          continue;
        }
        try {
          const track = groundAppearance(
            captured,
            detection.objectId,
            detection.box,
            data.foregrounds.find((f) => f.objectId === detection.objectId)
              ?.foreground,
            capturedPrepared,
          );
          let updated: ObjectDetection = detection;
          const frames = history.current.filter((f) => f.at > capturedAt);
          if (
            frames.length &&
            frames[0].at - capturedAt > 700 &&
            difference(
              lastChecked.current,
              fingerprint(pixels.current ?? captured),
            ) > 3
          )
            throw Error("The camera moved during setup.");
          for (const f of frames) {
            updated = trackPreparedAppearance(f.prepared, track);
            if (updated.quality !== "observed") break;
          }
          if (updated.quality === "observed") {
            next.push(track);
            found.push(updated);
          } else found.push(updated);
        } catch {
          found.push({
            ...detection,
            quality: "ambiguous",
            box: null,
            score: null,
          });
        }
      }
      const activeStep = s.guide.steps[index];
      if (
        s.running &&
        needsStartingView(data.phase, !!s.baseline[activeStep.id])
      ) {
        const activeIndex = found.findIndex(
          (object) => object.objectId === activeStep.condition.objectId,
        );
        if (activeIndex >= 0)
          found[activeIndex] = {
            objectId: activeStep.condition.objectId,
            quality: "ambiguous",
            box: null,
            score: null,
          };
        tracks.current = next.filter(
          (track) => track.objectId !== activeStep.condition.objectId,
        );
        setPerceptionHelp(activeStep.correction);
        speak(activeStep.correction);
      } else {
        tracks.current = next;
        setPerceptionHelp("");
        if (
          s.running &&
          found.some(
            (object) =>
              object.objectId === activeStep.condition.objectId &&
              object.quality === "observed",
          )
        )
          speak(activeStep.instruction);
      }
      const currentImage = pixels.current ?? captured;
      if (data.phase === "no_work_area") {
        background.current = null;
        tracks.current = [];
        readyBefore.current = null;
        setDetections([]);
        setView("setup");
        setMessage(
          "Point the camera at your work area and put the starting items in view.",
        );
        speak("Point the camera at your work area.");
        return;
      }
      if (resumeContext.current) {
        const goalMotions = s.guide.steps
          .filter(
            (step) =>
              s.guide.goalStepIds.includes(step.id) &&
              s.steps[step.id] === "verified",
          )
          .map((step) => {
            const box = resumeContext.current?.baseline[step.id]?.objects.find(
              (object) => object.objectId === step.condition.objectId,
            )?.box;
            return box
              ? Math.hypot(box.right - box.left, box.bottom - box.top) *
                  step.condition.minimumChange *
                  0.25
              : 0;
          });
        if (
          sameWorkbenchView(
            resumeContext.current.background,
            currentImage,
            Math.min(0.012, ...goalMotions),
          )
        ) {
          for (const step of s.guide.steps)
            if (
              s.steps[step.id] === "verified" &&
              resumeContext.current.baseline[step.id]
            )
              s.baseline[step.id] = {
                ...resumeContext.current.baseline[step.id],
                cameraEpoch: s.epoch,
              };
          resumeContext.current = null;
        } else {
          restartRequired.current = true;
          setView("setup");
          setMessage(
            "The camera view changed during the break. Restart to verify the guide from its starting view.",
          );
          return;
        }
      }
      background.current = groundBackground(
        currentImage,
        found.filter((d) => d.box).map((d) => d.box!),
      );
      setDetections(found);
      stepChecked.current = index;
      readyBefore.current = null;
      if (data.phase === "goal" && !s.running) {
        setView("setup");
        setMessage(
          "This looks partly or fully completed. Restore the shown starting view to practice.",
        );
      } else if (!s.running) {
        setView("setup");
        setMessage(
          data.phase === "starting"
            ? "Hold the camera steady while I check the starting view."
            : "Match the starting view shown beside the camera.",
        );
      }
    } catch (e) {
      if (!controller.signal.aborted && generation === runGeneration.current) {
        blocked.current = true;
        setView(s.running ? "practice" : "setup");
        setError(
          e instanceof Error && e.name !== "ZodError"
            ? e.message
            : "The camera response was invalid. No step was verified.",
        );
        setMessage("The AI check stopped. Your progress is kept.");
      }
    } finally {
      if (generation === runGeneration.current) {
        remote.current = false;
        setBusy(false);
      }
    }
  }
  function frame(image: Pixels, now: number) {
    const s = session.current;
    if (
      !s ||
      restartRequired.current ||
      s.finished ||
      currentView.current === "paused" ||
      currentView.current === "off"
    )
      return;
    pixels.current = image;
    const prepared = prepareTrackingFrame(image);
    history.current.push({ at: now, prepared });
    if (history.current.length > 70) history.current.shift();
    const fp = fingerprint(image);
    if (
      lastFingerprint.current.length &&
      difference(lastFingerprint.current, fp) > 5
    )
      stableSince.current = now;
    lastFingerprint.current = fp;
    const quality = frameQuality(image, prepared);
    if (background.current && !remote.current) {
      const tracked = trackPreparedAppearance(prepared, background.current);
      const b = tracked.box;
      const translation = b
        ? Math.hypot((b.left + b.right) / 2 - 0.5, (b.top + b.bottom) / 2 - 0.5)
        : 0;
      const smallestAction = Math.min(
        Infinity,
        ...s.guide.steps
          .filter(
            (step) =>
              s.steps[step.id] !== "verified" ||
              s.guide.goalStepIds.includes(step.id),
          )
          .flatMap((step) => {
            const track = tracks.current.find(
              (track) => track.objectId === step.condition.objectId,
            );
            return track
              ? [
                  Math.hypot(
                    track.box.right - track.box.left,
                    track.box.bottom - track.box.top,
                  ) * step.condition.minimumChange,
                ]
              : [];
          }),
      );
      if (
        cameraNeedsAlignment(
          translation,
          background.current.rotation ?? 0,
          background.current.scale ?? 1,
          smallestAction,
        )
      ) {
        if (s.guide.goalStepIds.some((id) => s.steps[id] === "verified")) {
          restartRequired.current = true;
          setMessage(
            "The camera view changed. Restart to verify the guide from its starting view.",
          );
        }
        s.running = false;
        s.baseline = {};
        s.candidates = {};
        readyBefore.current = null;
        phase.current = "uncertain";
        tracks.current = [];
        background.current = null;
        stepChecked.current = -1;
        lastCheck.current = now - 6001;
        setView("setup");
        if (!restartRequired.current)
          setMessage(
            "The camera moved. Hold it steady while I align your view again.",
          );
      } else if (tracked.quality !== "observed") {
        if (s.guide.goalStepIds.some((id) => s.steps[id] === "verified")) {
          // Once scene alignment is lost, old pixel coordinates cannot prove the final goal.
          restartRequired.current = true;
          s.running = false;
          s.baseline = {};
          s.candidates = {};
          setView("setup");
        }
        background.current = null;
        readyBefore.current = null;
        setMessage(
          restartRequired.current
            ? "The work area could no longer be aligned. Restart from the shown starting view."
            : "Keep the work surface visible and hold the camera steady while I realign.",
        );
      }
    }
    if (restartRequired.current) {
      clockPhase(clock.current, performance.now(), "verifying");
      setDetections([]);
      return;
    }
    const aligned = !!background.current && quality.usable && !remote.current;
    const found = tracks.current.map((track) => {
      const result = trackPreparedAppearance(prepared, track);
      return aligned
        ? result
        : {
            objectId: track.objectId,
            quality: "ambiguous" as const,
            box: null,
            score: null,
          };
    });
    for (const obj of s.guide.objects)
      if (!found.some((d) => d.objectId === obj.id))
        found.push({
          objectId: obj.id,
          quality: "missing",
          box: null,
          score: null,
        });
    setDetections(found);
    const observation: GuideObservation = {
      id: `camera-${++sequence.current}`,
      timestampMs: Math.floor(now),
      cameraEpoch: epoch.current,
      objects: found,
    };
    const index = currentIndex(s),
      step = s.guide.steps[index],
      needed =
        index === 0
          ? s.guide.objects
              .filter(
                (o) =>
                  o.initiallyVisible &&
                  s.guide.steps.some(
                    (st) =>
                      st.condition.objectId === o.id ||
                      st.condition.anchorId === o.id ||
                      st.condition.requiredVisibleAfter.includes(o.id),
                  ),
              )
              .map((o) => o.id)
          : [
              step.condition.objectId,
              ...(step.condition.anchorId ? [step.condition.anchorId] : []),
            ];
    const clear =
      aligned &&
      needed.every((id) =>
        found.some((d) => d.objectId === id && d.quality === "observed"),
      );
    const stable = quality.usable && now - stableSince.current >= 650;
    clockPhase(
      clock.current,
      performance.now(),
      s.running
        ? aligned && clear && !remote.current
          ? "active"
          : "verifying"
        : clock.current.startedAt !== null
          ? "verifying"
          : "setup",
      step.id,
    );
    if (s.running) {
      recordObservationQuality(observationQuality.current, observation, [
        step.condition.objectId,
        ...(step.condition.anchorId ? [step.condition.anchorId] : []),
      ]);
      applyEvents(recoverReturnedObjects(s, observation));
      applyEvents(feedGuideObservation(s, observation));
      if (s.finished) return;
      const active = s.guide.steps[currentIndex(s)];
      const needsNewStep = stepChecked.current !== currentIndex(s);
      const before = s.baseline[active.id];
      const changed = before ? changeMetric(active, before, observation) : null;
      const needsGrounding = [
        active.condition.objectId,
        ...(active.condition.anchorId ? [active.condition.anchorId] : []),
        ...(changed !== null && changed >= active.condition.minimumChange
          ? active.condition.requiredVisibleAfter
          : []),
      ].some(
        (id) =>
          !found.some((d) => d.objectId === id && d.quality === "observed"),
      );
      if (
        needsGrounding &&
        stable &&
        !remote.current &&
        !blocked.current &&
        now - lastCheck.current > 6000 &&
        (needsNewStep || difference(lastChecked.current, fp) > 3)
      )
        void checkScene();
      return;
    }
    if (
      !s.running &&
      phase.current === "starting" &&
      !clear &&
      !remote.current
    ) {
      const missingLabels = needed
        .filter(
          (id) =>
            !found.some((d) => d.objectId === id && d.quality === "observed"),
        )
        .map((id) => s.guide.objects.find((o) => o.id === id)?.label)
        .filter(Boolean);
      setMessage(
        !aligned
          ? "Show the surrounding work surface and hold the camera steady so I can align the scene."
          : `Bring ${missingLabels.join(" and ")} clearly into view. Hold the camera steady.`,
      );
    }
    if (
      clear &&
      phase.current === "starting" &&
      quality.usable &&
      !remote.current
    ) {
      if (!readyBefore.current && stable) {
        readyBefore.current = observation;
        setView("ready");
        setMessage(
          "Your starting view is ready. Click Ready or begin the first action.",
        );
        speak("Your starting view is ready. Click Ready or begin.");
      }
      const baseline = readyBefore.current;
      if (baseline) {
        const changed = s.guide.steps.some((st) => {
          const n = changeMetric(st, baseline, observation);
          return n !== null && n > 0.08;
        });
        if (!changed) readyBefore.current = { ...observation };
        const automatic =
          autoStart &&
          shouldAutoStart(s.guide, readyBefore.current!, observation);
        if (pendingReady.current || automatic) {
          try {
            beginGuide(s, readyBefore.current!, automatic);
            clockPhase(clock.current, performance.now(), "active", step.id);
            setView("practice");
            setMessage(step.instruction);
            speak(step.instruction);
            pendingReady.current = false;
            applyEvents(feedGuideObservation(s, observation));
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Restore a clear starting view.",
            );
          }
        }
      }
    }
    const sceneChanged =
      !lastChecked.current.length || difference(lastChecked.current, fp) > 9;
    const missing = !clear;
    const needsCheck =
      !tracks.current.length || missing || phase.current !== "starting";
    if (
      stable &&
      !remote.current &&
      !blocked.current &&
      now - lastCheck.current > 6000 &&
      needsCheck &&
      sceneChanged
    )
      void checkScene();
  }
  const camera = useGuideCamera(frame, pause);
  const selectInitial = useEffectEvent((row: SavedGuide) => select(row));
  const disposeSession = useEffectEvent(() => {
    if (session.current && !session.current.finished) saveTimingResult(false);
    runGeneration.current++;
    request.current?.abort();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  });
  useEffect(() => {
    let live = true;
    const params = new URLSearchParams(window.location.search);
    const test = params.get("test"),
      choice = params.get("guide");
    void guideRepository
      .list()
      .then((items) => {
        if (!live) return;
        setTestMode(!!test);
        const visible = test
          ? items.filter((r) => r.key === test)
          : latestPublished(items);
        setRows(visible);
        const row = visible.find((r) => r.key === (test ?? choice));
        if (row) selectInitial(row);
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error
              ? e.message
              : "The guide library is unavailable.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      disposeSession();
    };
  }, []);
  function select(row: SavedGuide) {
    if (session.current && !session.current.finished) saveTimingResult(false);
    camera.stop();
    request.current?.abort();
    runGeneration.current++;
    session.current = null;
    token.current = "";
    tracks.current = [];
    setSelected(row);
    clock.current = createSessionClock();
    timingSessionId.current = crypto.randomUUID();
    resumeContext.current = null;
    restartRequired.current = false;
    observationQuality.current = createObservationQuality();
    recordedCompletion.current = false;
    setStates({});
    setPerceptionHelp("");
    setView("off");
    setError("");
    setMessage("");
    setDetections([]);
    setLatestEvent(null);
    setShowGoal(false);
  }
  async function start() {
    if (!selected || camera.requesting || camera.active) return;
    const generation = ++runGeneration.current;
    epoch.current = crypto.randomUUID();
    const previous = session.current;
    if (
      previous &&
      !previous.finished &&
      previous.guide.id === selected.artifact.guide.id &&
      previous.guide.revision === selected.artifact.guide.revision
    ) {
      previous.epoch = epoch.current;
      previous.running = false;
      previous.baseline = {};
      previous.candidates = {};
      previous.lastTime = -1;
      previous.lastObservation = null;
      session.current = previous;
    } else
      session.current = createGuideSession(
        selected.artifact.guide,
        epoch.current,
      );
    if (!previous || previous.finished) {
      clock.current = createSessionClock();
      timingSessionId.current = crypto.randomUUID();
      observationQuality.current = createObservationQuality();
      recordedCompletion.current = false;
    } else clockPhase(clock.current, performance.now(), "verifying");
    setStates({ ...session.current.steps });
    tracks.current = [];
    background.current = null;
    phase.current = "uncertain";
    token.current = "";
    blocked.current = false;
    remote.current = false;
    lastCheck.current = -Infinity;
    lastChecked.current = [];
    lastFingerprint.current = [];
    history.current = [];
    stableSince.current = performance.now();
    readyBefore.current = null;
    pendingReady.current = false;
    stepChecked.current = -1;
    latencies.current = [];
    setRemaining(6);
    setError("");
    setView("permission");
    setMessage("Allow camera access, then show your work area.");
    await camera.start();
    if (
      generation !== runGeneration.current ||
      !camera.video.current?.srcObject
    )
      return;
    setView("setup");
    setMessage(selected.artifact.guide.initialInstruction);
    try {
      const data = PerceptionSessionSchema.parse(
        await readAppJson(
          await fetch("/api/teach/guide/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(selected.artifact),
          }),
          "Practice session",
        ),
      );
      if (generation === runGeneration.current) {
        token.current = data.token;
        speak(selected.artifact.guide.initialInstruction);
      }
    } catch (e) {
      if (generation === runGeneration.current) {
        setError(e instanceof Error ? e.message : "Practice setup failed.");
        blocked.current = true;
      }
    }
  }
  const s = session.current,
    g = selected?.artifact.guide,
    index = s ? currentIndex(s) : 0,
    step = g?.steps[index],
    violation = s?.guide.steps.find((step) => s.steps[step.id] === "violation"),
    correction = violation?.correction;
  const needsClearView =
    view === "practice" && s?.steps[step?.id ?? ""] === "uncertain";
  const referenceStep = violation ?? step;
  const referenceFrame = violation
    ? violation.evidence.startFrame
    : needsClearView
      ? (step?.evidence.startFrame ?? 0)
      : allVerifiedFrame();
  function allVerifiedFrame() {
    if (s && s.guide.steps.every((item) => s.steps[item.id] === "verified"))
      return g?.goalFrame ?? 0;
    return ["off", "setup", "ready", "finding"].includes(view)
      ? (step?.evidence.startFrame ?? 0)
      : (step?.evidence.endFrame ?? 0);
  }
  const referenceTitle = violation
    ? "Correction reference"
    : needsClearView
      ? "Restore this starting view"
      : view === "complete"
        ? "Expected result"
        : view === "practice"
          ? "This step’s result"
          : "Starting view";
  const allActionsVerified =
    !!s && s.guide.steps.every((item) => s.steps[item.id] === "verified");
  const timing = s
    ? timingSummary(
        clock.current,
        s.guide,
        s.steps,
        typeof window === "undefined" ? 0 : performance.now(),
      )
    : null;
  const previousAverage = localAverage(
    (selected?.attempts ?? []).filter(
      (attempt) => attempt.sessionId !== timingSessionId.current,
    ),
  );
  const debug =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1";
  useEffect(() => {
    if (!debug) return;
    const probe = window as Window & { stepLintProbe?: () => unknown };
    probe.stepLintProbe = () => ({
      view,
      states: { ...session.current?.steps },
      events: session.current?.events,
      latencies: latencies.current,
      evidenceAvailability: evidenceAvailability(observationQuality.current),
      timing: session.current
        ? timingSummary(
            clock.current,
            session.current.guide,
            session.current.steps,
            performance.now(),
          )
        : null,
      remaining,
      objects: detections,
    });
    return () => {
      delete probe.stepLintProbe;
    };
  }, [debug, view, states, remaining, detections]);
  function download() {
    if (!s) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              guideId: s.guide.id,
              revision: s.guide.revision,
              methodId: s.guide.methodId,
              steps: s.steps,
              events: s.events,
              evidenceAvailability: evidenceAvailability(
                observationQuality.current,
              ),
              timing: timingSummary(
                clock.current,
                s.guide,
                s.steps,
                performance.now(),
              ),
              latencies: latencies.current,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "steplint-practice-result.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Workspace mode="practice">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-800">
            {testMode ? "Private creator rehearsal" : "Your guide library"}
          </p>
          <h1 className="mt-1 text-3xl font-bold">
            {g ? g.title : "What would you like to practice?"}
          </h1>
        </div>
        {testMode ? (
          <Link className="rounded-lg border bg-white px-4 py-2" href="/teach">
            Return to review
          </Link>
        ) : (
          selected && (
            <button
              onClick={() => {
                camera.stop();
                pause("Camera stopped.");
                setSelected(null);
                setView("off");
              }}
            >
              Choose another guide
            </button>
          )
        )}
      </div>
      {!selected ? (
        <>
          {loading ? (
            <p role="status">Opening your guides…</p>
          ) : rows.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => {
                const guide = row.artifact.guide,
                  cover = guide.images.find(
                    (i) => i.frame === guide.goalFrame,
                  )?.image;
                return (
                  <button
                    key={row.key}
                    className="!overflow-hidden !rounded-2xl !p-0 text-left"
                    onClick={() => select(row)}
                  >
                    {cover && (
                      <svg
                        viewBox={`0 0 ${guide.source.width} ${guide.source.height}`}
                        role="img"
                        aria-label={`Goal for ${guide.title}`}
                      >
                        <image
                          href={cover}
                          width={guide.source.width}
                          height={guide.source.height}
                        />
                      </svg>
                    )}
                    <span className="block p-5">
                      <strong className="block text-lg">{guide.title}</strong>
                      <span className="mt-2 block text-sm font-normal text-slate-500">
                        {guide.steps.length} steps · Revision {guide.revision}
                      </span>
                      <span className="mt-4 block text-emerald-800">
                        Practice this guide →
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <section className="mx-auto mt-10 max-w-lg rounded-2xl border bg-white p-8 text-center">
              <h2 className="text-xl font-bold">
                Your first guide starts in Teach
              </h2>
              <p className="my-4 text-slate-600">
                Create and review a lesson, then it will appear here.
              </p>
              <Link className="primary" href="/teach">
                Create a guide
              </Link>
            </section>
          )}
        </>
      ) : (
        g && (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2.4fr)_minmax(280px,1fr)]">
            <section className="overflow-hidden rounded-2xl border bg-white">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <span role="status" className="text-sm font-semibold">
                  {camera.active
                    ? "Camera on"
                    : camera.requesting
                      ? "Waiting for camera permission"
                      : "Camera off"}
                  {testMode ? " · Private test" : ""}
                </span>
                <button
                  aria-pressed={voice}
                  onClick={() => {
                    setVoice(!voice);
                    voiceRef.current = !voice;
                    if (voice && "speechSynthesis" in window)
                      window.speechSynthesis.cancel();
                  }}
                >
                  Voice {voice ? "on" : "off"}
                </button>
              </div>
              <div className="space-y-3 border-b p-4">
                <div
                  aria-live="polite"
                  className={`rounded-xl p-4 ${correction ? "bg-red-50 text-red-900" : view === "complete" ? "bg-emerald-50 text-emerald-900" : "bg-slate-50"}`}
                >
                  <p className="text-sm font-semibold">
                    {correction
                      ? "Pause and correct"
                      : view === "complete"
                        ? "Goal reached"
                        : busy
                          ? "Finding your objects"
                          : needsClearView
                            ? "Need a clear view"
                            : view === "practice"
                              ? allActionsVerified
                                ? "Check the final result"
                                : `Step ${index + 1} of ${g.steps.length}`
                              : view === "ready"
                                ? "Ready when you are"
                                : view === "off"
                                  ? "Start with your camera"
                                  : "Getting ready"}
                  </p>
                  <p className="mt-1 text-lg font-medium">
                    {correction ??
                      (busy
                        ? "Hold the part still and keep it in view while I locate it."
                        : perceptionHelp ||
                          (view === "practice"
                            ? step?.instruction
                            : message || g.initialInstruction))}
                  </p>
                  {view === "practice" &&
                    s?.steps[step?.id ?? ""] === "uncertain" &&
                    !correction && (
                      <p className="mt-2 text-sm text-amber-800">
                        Keep the object in view. Restore this step’s starting
                        view if the action was hidden.
                      </p>
                    )}
                </div>
                <div className="flex flex-wrap gap-3">
                  {restartRequired.current && (
                    <button
                      className="primary"
                      onClick={() => {
                        camera.stop();
                        select(selected);
                      }}
                    >
                      Restart practice
                    </button>
                  )}
                  {view === "ready" && !restartRequired.current && (
                    <button
                      className="primary"
                      onClick={() => {
                        pendingReady.current = true;
                        setMessage("Starting from the observed view…");
                      }}
                    >
                      Ready — start practice
                    </button>
                  )}
                  {camera.active && (
                    <button
                      onClick={() => {
                        if (!session.current?.finished)
                          pause(
                            "Practice paused. Your verified steps are kept.",
                          );
                        camera.stop();
                      }}
                    >
                      Stop camera
                    </button>
                  )}
                  {view === "paused" && (
                    <button className="primary" onClick={() => void start()}>
                      Start camera again
                    </button>
                  )}
                  {view === "complete" && (
                    <>
                      <button onClick={download}>Download result</button>
                      <button
                        onClick={() => {
                          camera.stop();
                          select(selected);
                        }}
                      >
                        Practice again
                      </button>
                    </>
                  )}
                  {blocked.current && camera.active && remaining >= 2 && (
                    <button
                      onClick={() => {
                        blocked.current = false;
                        setError("");
                        void checkScene();
                      }}
                    >
                      Try camera check again
                    </button>
                  )}
                </div>
                {error && (
                  <p
                    role="alert"
                    className="rounded-lg bg-red-50 p-3 text-red-900"
                  >
                    {error}
                  </p>
                )}
              </div>
              <div
                className="relative mx-auto bg-slate-950"
                style={{
                  aspectRatio: `${camera.size.width}/${camera.size.height}`,
                  maxWidth: `${(52 * camera.size.width) / camera.size.height}vh`,
                }}
              >
                <video
                  ref={camera.video}
                  muted
                  playsInline
                  className="h-full w-full object-contain"
                  aria-label="Live practice camera"
                />
                {!camera.active && (
                  <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-white">
                    <div>
                      <p className="mb-5 text-lg">
                        {camera.requesting
                          ? "Allow camera access in Chrome."
                          : "Show your work area to get started."}
                      </p>
                      <button
                        className="primary"
                        disabled={camera.requesting}
                        onClick={() => void start()}
                      >
                        {camera.requesting ? "Waiting…" : "Start camera"}
                      </button>
                      <p className="mt-3 text-sm text-slate-300">
                        Selected camera images help AI locate the objects.
                      </p>
                    </div>
                  </div>
                )}
                {camera.active && (
                  <svg
                    viewBox="0 0 1000 1000"
                    preserveAspectRatio="none"
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    role="img"
                    aria-label="Automatically tracked objects"
                  >
                    {detections
                      .filter((d) => d.quality === "observed" && d.box)
                      .map((d) => {
                        const b = d.box!,
                          label = g.objects.find(
                            (o) => o.id === d.objectId,
                          )?.label;
                        return (
                          <g key={d.objectId}>
                            <rect
                              x={b.left * 1000}
                              y={b.top * 1000}
                              width={(b.right - b.left) * 1000}
                              height={(b.bottom - b.top) * 1000}
                              rx="5"
                              fill="#10b981"
                              fillOpacity=".07"
                              stroke="#34d399"
                              strokeWidth="3"
                            />
                            <text
                              x={b.left * 1000 + 6}
                              y={Math.max(28, b.top * 1000 - 8)}
                              fill="white"
                              stroke="#0f172a"
                              strokeWidth=".8"
                              fontSize="23"
                              fontWeight="bold"
                            >
                              {label}
                            </text>
                          </g>
                        );
                      })}
                  </svg>
                )}
              </div>
            </section>
            <aside className="space-y-4">
              <section className="rounded-2xl border bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold">Your progress</h2>
                  <span className="text-sm text-slate-500">
                    {
                      Object.values(states).filter((v) => v === "verified")
                        .length
                    }
                    /{g.steps.length}
                  </span>
                </div>
                <ol className="mt-4 space-y-4">
                  {g.steps.map((st, i) => (
                    <li
                      key={st.id}
                      data-step-status={states[st.id] ?? "waiting"}
                      className={`flex gap-3 ${i === index ? "font-semibold" : "text-slate-500"}`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${states[st.id] === "verified" ? "bg-emerald-100 text-emerald-900" : states[st.id] === "violation" ? "bg-red-100 text-red-900" : "bg-slate-100"}`}
                      >
                        {states[st.id] === "verified" ? "✓" : i + 1}
                      </span>
                      <span>{st.instruction}</span>
                    </li>
                  ))}
                </ol>
              </section>
              {referenceStep && (
                <GuideFrame
                  guide={g}
                  frame={referenceFrame}
                  title={referenceTitle}
                  objectIds={
                    allActionsVerified && !violation
                      ? undefined
                      : [
                          referenceStep.condition.objectId,
                          ...(referenceStep.condition.anchorId
                            ? [referenceStep.condition.anchorId]
                            : []),
                        ]
                  }
                />
              )}
              {timing && (
                <section className="rounded-2xl border bg-white p-4">
                  <h2 className="font-semibold">
                    {view === "complete" ? "Your session" : "Time estimate"}
                  </h2>
                  {view !== "complete" && (
                    <p className="mt-2 text-sm">
                      {timing.remainingMs === null
                        ? "Estimate updating — finish the current visible action."
                        : `About ${formatDuration(timing.remainingMs)} remaining`}
                      <span className="block text-xs text-slate-500">
                        Based on{" "}
                        {timing.estimateBasis === "demonstration"
                          ? "the demonstration, not a learner average"
                          : "your completed steps"}
                        .
                      </span>
                    </p>
                  )}
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <dt>Active session</dt>
                    <dd>{formatDuration(timing.activeMs)}</dd>
                    <dt>Breaks</dt>
                    <dd>{formatDuration(timing.pausedMs)}</dd>
                    <dt>Verification wait</dt>
                    <dd>{formatDuration(timing.verificationMs)}</dd>
                    <dt>Total elapsed</dt>
                    <dd>{formatDuration(timing.elapsedMs)}</dd>
                  </dl>
                  {view === "complete" && (
                    <p className="mt-3 text-sm">
                      {timing.completed}/{timing.totalSteps} steps verified ·{" "}
                      {s?.events.filter((event) => event.kind === "violation")
                        .length ?? 0}{" "}
                      corrections.
                    </p>
                  )}
                  {previousAverage && (
                    <p className="mt-2 text-xs text-slate-500">
                      Your average active time:{" "}
                      {formatDuration(previousAverage.activeMs)} from{" "}
                      {previousAverage.samples} previous completed runs on this
                      device.
                    </p>
                  )}
                  <details className="mt-2 text-xs text-slate-500">
                    <summary>Timing and evidence details</summary>
                    <p className="mb-2">
                      Usable observations: {observationQuality.current.usable}/
                      {observationQuality.current.checked}
                      {observationQuality.current.checked
                        ? ` (${Math.round((100 * observationQuality.current.usable) / observationQuality.current.checked)}%)`
                        : ""}
                      . This measures evidence availability, not accuracy or a
                      success probability.
                    </p>
                    Active session includes unpaused thinking time. Breaks are
                    explicit pauses; stillness alone is not a break. Uncertain
                    tracking and AI checks count as verification waits.
                    Estimates are guidance, not speed targets.
                    <ul>
                      {g.steps.map((item, i) => (
                        <li key={item.id}>
                          Step {i + 1}:{" "}
                          {formatDuration(timing.stepMs[item.id] ?? 0)} active ·
                          demonstration{" "}
                          {formatDuration(
                            item.evidence.endMs - item.evidence.startMs,
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                </section>
              )}
              <section className="rounded-2xl border bg-white p-4">
                <button
                  className="!border-0 !p-0"
                  aria-expanded={showGoal}
                  onClick={() => setShowGoal(!showGoal)}
                >
                  {showGoal ? "Hide goal" : "See the final goal"}
                </button>
                {showGoal && (
                  <div className="mt-3">
                    <p className="mb-3 text-sm text-slate-600">{g.goal}</p>
                    <GuideFrame
                      guide={g}
                      frame={g.goalFrame}
                      title="Expected goal"
                    />
                  </div>
                )}
              </section>
              <details className="rounded-xl border bg-white p-4 text-sm">
                <summary>Practice preferences</summary>
                <label className="my-3 flex gap-2">
                  <input
                    type="checkbox"
                    checked={autoStart}
                    onChange={(e) => setAutoStart(e.target.checked)}
                  />
                  Start automatically when a clear task action begins after
                  setup.
                </label>
                <p className="text-slate-500">
                  AI receives selected camera images to locate objects. Frequent
                  tracking stays in this browser. Scoring requires clear
                  observed changes.
                </p>
              </details>
              {debug && (
                <details className="rounded-xl border p-4 text-xs">
                  <summary>Developer evidence</summary>
                  <p>AI requests remaining: {remaining}</p>
                  <p>Latest event: {latestEvent?.kind ?? "none"}</p>
                  <button onClick={download}>Download evidence log</button>
                </details>
              )}
            </aside>
          </div>
        )
      )}
      {!selected && error && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-900">
          {error}
        </p>
      )}
    </Workspace>
  );
}
