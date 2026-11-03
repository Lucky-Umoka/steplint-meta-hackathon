/**
 * The single authoritative Practice lifecycle (Phase 4). Both the on-screen
 * controls and voice commands drive Practice through the host's
 * `ensurePracticeRunning` / pause / end operations, which only change state
 * through `transition`. Pure: no clock, I/O, camera or worker access.
 *
 * `running` is reached only after the existing pipeline reports that the
 * verifier armed (initial required objects observed at their starting zones),
 * never merely because the camera or worker started.
 */
export type LifecycleState =
  | "idle"
  | "requesting_camera"
  | "acquiring_initial_objects"
  | "arming"
  | "running"
  | "paused"
  | "recovering"
  | "blocked"
  | "ended";
export type LifecycleIntent = "start" | "resume" | "restart";
export type Lifecycle = {
  state: LifecycleState;
  /** Worker/session generation the lifecycle currently trusts. */
  generation: number;
  intent: LifecycleIntent | null;
  automaticWanted: boolean;
  camera: "off" | "requesting" | "on" | "denied";
  worker: "none" | "starting" | "running" | "failed";
  lastReplyAtMs: number | null;
  acquisitionComplete: boolean;
  armed: boolean;
  lastError: string | null;
  lastTransition: {
    from: LifecycleState;
    to: LifecycleState;
    reason: string;
    atMs: number;
  } | null;
};
export type LifecycleEvent =
  | {
      type: "start";
      intent: LifecycleIntent;
      cameraOn: boolean;
      /** Automatic setup lessons retry by themselves; manual ones do not. */
      automatic: boolean;
    }
  | { type: "camera_requested" }
  | { type: "camera_ready" }
  | { type: "camera_denied"; message: string }
  | { type: "camera_stopped" }
  | { type: "worker_started"; generation: number }
  | { type: "setup_complete"; generation: number }
  | { type: "armed"; generation: number }
  | { type: "reply"; generation: number }
  | {
      type: "worker_failed";
      generation: number;
      message: string;
      recoverable: boolean;
    }
  | { type: "worker_timeout"; generation: number; message: string }
  | { type: "recover"; generation: number; reason: string }
  | { type: "pause"; reason: string }
  | { type: "end"; reason: string };

/** Bounded waits so a silent worker cannot leave Practice busy forever. */
export const LIFECYCLE_TIMEOUTS = {
  /** Automatic setup (bootstrap) reply. */
  setupMs: 15_000,
  /** One tracking-frame reply. */
  frameMs: 3_000,
  /** A start/resume/restart request reaching `running` (or failing). */
  startMs: 45_000,
} as const;

export const initialLifecycle = (): Lifecycle => ({
  state: "idle",
  generation: 0,
  intent: null,
  automaticWanted: false,
  camera: "off",
  worker: "none",
  lastReplyAtMs: null,
  acquisitionComplete: false,
  armed: false,
  lastError: null,
  lastTransition: null,
});

const generational = new Set([
  "setup_complete",
  "armed",
  "reply",
  "worker_failed",
  "worker_timeout",
  "recover",
]);

export function transition(
  current: Lifecycle,
  event: LifecycleEvent,
  nowMs: number,
): Lifecycle {
  // Replies from an earlier worker/session generation never revive it.
  if (
    generational.has(event.type) &&
    "generation" in event &&
    event.generation !== current.generation
  )
    return current;
  const next: Lifecycle = { ...current };
  let reason: string = event.type;
  switch (event.type) {
    case "start":
      next.intent = event.intent;
      next.automaticWanted = event.automatic;
      next.lastError = null;
      next.armed = false;
      next.acquisitionComplete = false;
      next.state = event.cameraOn
        ? "acquiring_initial_objects"
        : "requesting_camera";
      reason = `${event.intent} requested`;
      break;
    case "camera_requested":
      next.camera = "requesting";
      if (next.automaticWanted) next.state = "requesting_camera";
      break;
    case "camera_ready":
      next.camera = "on";
      if (next.state === "requesting_camera")
        next.state = next.automaticWanted
          ? "acquiring_initial_objects"
          : "idle";
      break;
    case "camera_denied":
      next.camera = "denied";
      next.automaticWanted = false;
      next.lastError = event.message;
      next.state = "blocked";
      reason = event.message;
      break;
    case "camera_stopped":
      next.camera = "off";
      next.automaticWanted = false;
      next.worker = "none";
      next.armed = false;
      next.acquisitionComplete = false;
      if (next.state !== "ended" && next.state !== "idle")
        next.state = "paused";
      reason = "camera stopped";
      break;
    case "worker_started":
      next.generation = event.generation;
      next.worker = "starting";
      next.armed = false;
      next.acquisitionComplete = false;
      // Retry workers belong to the same recovery episode until setup succeeds.
      next.state =
        current.state === "recovering"
          ? "recovering"
          : "acquiring_initial_objects";
      break;
    case "setup_complete":
      next.worker = "running";
      next.acquisitionComplete = true;
      next.lastReplyAtMs = nowMs;
      next.state = "arming";
      break;
    case "armed":
      next.armed = true;
      next.lastReplyAtMs = nowMs;
      next.state = "running";
      break;
    case "reply":
      next.lastReplyAtMs = nowMs;
      return next; // not a state transition
    case "worker_failed":
      next.worker = "failed";
      next.armed = false;
      next.acquisitionComplete = false;
      next.lastError = event.message;
      next.state =
        event.recoverable && next.automaticWanted ? "recovering" : "blocked";
      if (next.state === "blocked") next.automaticWanted = false;
      reason = event.message;
      break;
    case "worker_timeout":
      next.worker = "failed";
      next.armed = false;
      next.acquisitionComplete = false;
      next.lastError = event.message;
      next.state = next.automaticWanted ? "recovering" : "blocked";
      reason = event.message;
      break;
    case "recover":
      next.worker = "none";
      next.armed = false;
      next.acquisitionComplete = false;
      next.state = "recovering";
      reason = event.reason;
      break;
    case "pause":
      next.automaticWanted = false;
      next.worker = "none";
      next.armed = false;
      next.acquisitionComplete = false;
      next.state = "paused";
      reason = event.reason;
      break;
    case "end":
      next.automaticWanted = false;
      next.worker = "none";
      next.armed = false;
      next.acquisitionComplete = false;
      next.state = "ended";
      reason = event.reason;
      break;
  }
  if (next.state !== current.state)
    next.lastTransition = {
      from: current.state,
      to: next.state,
      reason,
      atMs: nowMs,
    };
  return next;
}

/** Outcome of a start/resume/restart request, decided only by the lifecycle. */
export function requestOutcome(
  lifecycle: Lifecycle,
): { done: true; ok: boolean; message: string } | { done: false } {
  if (lifecycle.state === "running")
    return { done: true, ok: true, message: "Practice is running." };
  if (lifecycle.state === "blocked")
    return {
      done: true,
      ok: false,
      message: lifecycle.lastError ?? "Practice could not start.",
    };
  if (lifecycle.state === "paused" || lifecycle.state === "ended")
    return {
      done: true,
      ok: false,
      message:
        lifecycle.lastTransition?.reason ??
        "Practice stopped before it was ready.",
    };
  return { done: false };
}

/** Safe, image-free diagnostics for the existing diagnostics export/panel. */
export function lifecycleDiagnostics(lifecycle: Lifecycle) {
  return {
    state: lifecycle.state,
    lastTransition: lifecycle.lastTransition,
    camera: lifecycle.camera,
    worker: lifecycle.worker,
    lastReplyAtMs: lifecycle.lastReplyAtMs,
    automaticWanted: lifecycle.automaticWanted,
    acquisitionComplete: lifecycle.acquisitionComplete,
    armed: lifecycle.armed,
    lastError: lifecycle.lastError,
    intent: lifecycle.intent,
  };
}
