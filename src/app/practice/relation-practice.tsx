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
import { createSessionClock, clockPhase, timingSummary } from "@/guide/timing";
import { useGuideCamera } from "./use-guide-camera";

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
    plan = guide.relationPlan!;
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
    [queued, setQueued] = useState(0),
    [latencyMs, setLatencyMs] = useState<number | null>(null);
  const session = useRef<RelationSession | null>(null),
    token = useRef(""),
    request = useRef<AbortController | null>(null),
    running = useRef(false),
    checking = useRef(false),
    collector = useRef(new MotionWindows()),
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
  function say(text: string) {
    if (voiceRef.current && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
  }
  function pause(reason: string) {
    generation.current++;
    request.current?.abort();
    checking.current = false;
    setBusy(false);
    clockPhase(clock.current, performance.now(), "paused");
    running.current = false;
    setArmed(false);
    collector.current.reset();
    pending.current = [];
    setQueued(0);
    setMotion(false);
    setReadings([]);
    setMessage(reason);
  }
  const {
    video,
    active: cameraActive,
    requesting: cameraRequesting,
    start: startCamera,
    stop: stopCamera,
    capture,
  } = useGuideCamera(onFrame, pause);
  function snapshot(now: number): Snapshot {
    return { frame: Math.round(now), ...capture() };
  }
  function onFrame(p: Pixels, now: number) {
    const current = motionSignature(p);
    previous.current = current;
    if (!running.current || session.current?.finished) return;
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
      if (collector.current.moving) setReadings([]);
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
      clock.current = createSessionClock(performance.now());
      await startCamera();
      if (gen !== generation.current) return;
      collector.current.reset();
      pending.current = [];
      setQueued(0);
      previous.current = [];
      running.current = true;
      setArmed(true);
      setMessage(
        "Camera ready. Show the starting arrangement, then perform the first instruction and hold the result still.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Camera setup failed.");
    } finally {
      setBusy(false);
    }
  }
  async function check(frames: Snapshot[], contextFrames: Snapshot[] = []) {
    if (checking.current || !session.current || remaining <= 0) return;
    clockPhase(clock.current, performance.now(), "verifying");
    checking.current = true;
    checkedSignature.current = previous.current;
    changedWhileChecking.current = false;
    setBusy(true);
    setError("");
    setMessage("Checking the visible change. Hold the result still…");
    const startedAt = performance.now();
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
          contextFrames: contextFrames.map(({ frame, image }) => ({
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
      setLatencyMs(performance.now() - startedAt);
      setRemaining(data.remainingModelRequests);
      setReadings(
        changedWhileChecking.current ? [] : data.window.frames[2].readings,
      );
      const recovered = recoverRelation(s, data.window);
      const emitted = evaluateRelationWindow(s, data.window);
      if (changedWhileChecking.current || pending.current.length)
        s.finished = false;
      events.current.push(...emitted.map((e) => ({ ...e, at: Date.now() })));
      setStates({ ...s.states });
      const active = plan.steps.find(
        (step) => s.states[step.id] !== "verified",
      );
      const violation = emitted.find((e) => e.state === "violation");
      const text = s.finished
        ? "Goal reached. Every step and the final visible relationships were verified."
        : violation
          ? violation.message
          : recovered
            ? "Starting relationship restored. Follow the current instruction."
            : (emitted.find((e) => e.state === "needs_verification")?.message ??
              (active
                ? active.instruction
                : "Keep the final objects visible so the goal can be checked."));
      setMessage(text);
      say(text);
      setFinished(s.finished);
      if (s.finished && !saved.current) {
        clockPhase(clock.current, performance.now(), "complete");
        saved.current = true;
        running.current = false;
        setArmed(false);
        const measured = timingSummary(
          clock.current,
          guide,
          s.states,
          performance.now(),
        );
        await guideRepository.recordAttempt(row.key, {
          at: Date.now(),
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
          clockPhase(clock.current, performance.now(), "active");
      }
    }
  }
  async function checkCurrentView() {
    if (checking.current || !cameraActive || !session.current || remaining <= 0)
      return;
    const gen = generation.current;
    checking.current = true;
    setBusy(true);
    const frames = [snapshot(performance.now())];
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (gen !== generation.current) return;
      frames.push(snapshot(performance.now()));
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (gen !== generation.current) return;
      frames.push(snapshot(performance.now()));
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
  const highlighted = readings.find(
    (r) => r.stepId === highlightId && r.visibility === "clear",
  );
  const wrong = Object.values(states).includes("violation");
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
            {cameraActive && highlighted && (
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                aria-label="Relevant observed parts"
              >
                <g
                  fill="none"
                  stroke={wrong ? "#fb7185" : "#facc15"}
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
                    disabled={busy}
                    onClick={() => {
                      running.current = true;
                      setArmed(true);
                      collector.current.reset();
                      pending.current = [];
                      setQueued(0);
                      setMessage(
                        "Starting view reset. Perform the current instruction and hold the result still.",
                      );
                    }}
                  >
                    Continue from this starting view
                  </button>
                )}
                <button onClick={stop}>Stop camera</button>
                <button
                  disabled={busy || remaining <= 0}
                  onClick={() => void checkCurrentView()}
                >
                  Check current view
                </button>
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
                ? motion
                  ? "Watching movement — correctness not yet verified"
                  : busy
                    ? "Camera watching · AI verification pending"
                    : "Watching automatically"
                : "Paused"
              : "Camera off"}
            {queued > 0
              ? ` · ${queued} captured action${queued > 1 ? "s" : ""} waiting`
              : ""}
            {latencyMs !== null
              ? ` · Last AI check: ${(latencyMs / 1000).toFixed(1)}s`
              : ""}
          </p>
          <p className="text-sm text-slate-600">
            Camera images are sent to Muse Spark only for bounded change checks.{" "}
            {remaining} checks remain. Circles show the last observed locations;
            an unclear view never counts as success. AI feedback is delayed;
            wait for verification before a dependent or irreversible action.
          </p>
        </section>
        <aside className="space-y-4">
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
