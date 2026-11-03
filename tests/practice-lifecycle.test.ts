import { expect, it } from "vitest";
import {
  initialLifecycle,
  lifecycleDiagnostics,
  requestOutcome,
  transition,
  type Lifecycle,
  type LifecycleEvent,
} from "../src/practice/lifecycle";

const run = (events: LifecycleEvent[], from: Lifecycle = initialLifecycle()) =>
  events.reduce((state, event, i) => transition(state, event, i * 10), from);
const ready = (generation: number): LifecycleEvent[] => [
  { type: "worker_started", generation },
  { type: "setup_complete", generation },
  { type: "armed", generation },
];

it("starts with the camera off and reaches running only after the verifier arms (1, 11)", () => {
  let s = run([
    { type: "start", intent: "start", cameraOn: false, automatic: true },
  ]);
  expect(s.state).toBe("requesting_camera");
  s = run([{ type: "camera_requested" }, { type: "camera_ready" }], s);
  expect(s.state).toBe("acquiring_initial_objects");
  const states: string[] = [];
  for (const event of ready(1)) {
    s = transition(s, event, 1);
    states.push(s.state);
    if (event.type !== "armed") expect(requestOutcome(s).done).toBe(false);
  }
  expect(states).toEqual(["acquiring_initial_objects", "arming", "running"]);
  expect(requestOutcome(s)).toEqual({
    done: true,
    ok: true,
    message: "Practice is running.",
  });
});
it("starts directly into acquisition when the camera is already active (2)", () => {
  expect(
    run([{ type: "start", intent: "start", cameraOn: true, automatic: true }])
      .state,
  ).toBe("acquiring_initial_objects");
});
it("pause stops progression; resume and restart re-arm through the same states (3, 4, 5)", () => {
  let s = run([
    { type: "start", intent: "start", cameraOn: true, automatic: true },
    ...ready(1),
  ]);
  s = transition(s, { type: "pause", reason: "learner paused" }, 100);
  expect(s).toMatchObject({
    state: "paused",
    automaticWanted: false,
    armed: false,
  });
  expect(requestOutcome(s)).toMatchObject({ done: true, ok: false });
  s = run(
    [
      { type: "start", intent: "resume", cameraOn: true, automatic: true },
      ...ready(2),
    ],
    s,
  );
  expect(s).toMatchObject({
    state: "running",
    intent: "resume",
    automaticWanted: true,
  });
  // Restart after a blocking failure, camera still active.
  s = transition(
    s,
    {
      type: "worker_failed",
      generation: 2,
      message: "tracker stopped",
      recoverable: false,
    },
    200,
  );
  expect(s.state).toBe("blocked");
  s = run(
    [
      { type: "start", intent: "restart", cameraOn: true, automatic: true },
      ...ready(3),
    ],
    s,
  );
  expect(s).toMatchObject({
    state: "running",
    intent: "restart",
    automaticWanted: true,
    lastError: null,
  });
});
it("camera permission denied blocks with the reason (6)", () => {
  const s = run([
    { type: "start", intent: "start", cameraOn: false, automatic: true },
    { type: "camera_requested" },
    { type: "camera_denied", message: "Camera access was not allowed." },
  ]);
  expect(s).toMatchObject({
    state: "blocked",
    camera: "denied",
    automaticWanted: false,
  });
  expect(requestOutcome(s)).toEqual({
    done: true,
    ok: false,
    message: "Camera access was not allowed.",
  });
});
it("worker start-up or acquisition failure recovers automatically, then blocks; manual lessons block at once (7, 9)", () => {
  const base = run([
    { type: "start", intent: "start", cameraOn: true, automatic: true },
    { type: "worker_started", generation: 1 },
  ]);
  const retry = transition(
    base,
    {
      type: "worker_failed",
      generation: 1,
      message: "Finding component-1",
      recoverable: true,
    },
    5,
  );
  expect(retry.state).toBe("recovering");
  expect(requestOutcome(retry).done).toBe(false);
  expect(
    transition(
      base,
      {
        type: "worker_failed",
        generation: 1,
        message: "gave up",
        recoverable: false,
      },
      5,
    ).state,
  ).toBe("blocked");
  const manual = run([
    { type: "start", intent: "start", cameraOn: true, automatic: false },
    { type: "worker_started", generation: 1 },
  ]);
  expect(
    transition(
      manual,
      { type: "worker_failed", generation: 1, message: "x", recoverable: true },
      5,
    ).state,
  ).toBe("blocked");
});
it("a worker that stops responding is never left busy (8)", () => {
  const s = run([
    { type: "start", intent: "start", cameraOn: true, automatic: true },
    ...ready(1),
  ]);
  const timedOut = transition(
    s,
    {
      type: "worker_timeout",
      generation: 1,
      message: "The tracker stopped responding.",
    },
    50,
  );
  expect(timedOut).toMatchObject({
    state: "recovering",
    worker: "failed",
    armed: false,
    lastError: "The tracker stopped responding.",
  });
});
it("a verifier that never arms keeps the request pending; the host's bounded timeout ends it (10)", () => {
  const s = run([
    { type: "start", intent: "start", cameraOn: true, automatic: true },
    { type: "worker_started", generation: 1 },
    { type: "setup_complete", generation: 1 },
  ]);
  expect(s.state).toBe("arming");
  expect(requestOutcome(s).done).toBe(false);
});
it("stale replies from an earlier generation cannot revive or change a session (13)", () => {
  let s = run([
    { type: "start", intent: "start", cameraOn: true, automatic: true },
    ...ready(1),
  ]);
  s = transition(s, { type: "pause", reason: "paused" }, 20);
  s = run(
    [
      { type: "start", intent: "resume", cameraOn: true, automatic: true },
      { type: "worker_started", generation: 2 },
    ],
    s,
  );
  for (const stale of [
    { type: "setup_complete", generation: 1 },
    { type: "armed", generation: 1 },
    {
      type: "worker_failed",
      generation: 1,
      message: "old",
      recoverable: false,
    },
    { type: "worker_timeout", generation: 1, message: "old" },
  ] as LifecycleEvent[])
    expect(transition(s, stale, 30)).toBe(s);
});
it("records the last transition and safe diagnostics without image data", () => {
  const s = run([
    { type: "start", intent: "start", cameraOn: false, automatic: true },
  ]);
  expect(s.lastTransition).toMatchObject({
    from: "idle",
    to: "requesting_camera",
    reason: "start requested",
  });
  const diagnostics = lifecycleDiagnostics(s);
  expect(Object.keys(diagnostics).sort()).toEqual(
    [
      "acquisitionComplete",
      "armed",
      "automaticWanted",
      "camera",
      "intent",
      "lastError",
      "lastReplyAtMs",
      "lastTransition",
      "state",
      "worker",
    ].sort(),
  );
});

it("keeps silent retry workers in recovering until setup actually succeeds", () => {
  let state = run([
    { type: "start", intent: "start", cameraOn: true, automatic: true },
  ]);
  for (let generation = 1; generation <= 7; generation++) {
    state = transition(
      state,
      { type: "worker_started", generation },
      generation * 3000,
    );
    if (generation > 1) expect(state.state).toBe("recovering");
    state = transition(
      state,
      {
        type: "worker_failed",
        generation,
        message: "Finding component-1",
        recoverable: true,
      },
      generation * 3000 + 1,
    );
    expect(state.state).toBe("recovering");
    expect(state.automaticWanted).toBe(true);
  }
  state = transition(state, { type: "setup_complete", generation: 7 }, 22000);
  expect(state.state).toBe("arming");
  expect(transition(state, { type: "armed", generation: 7 }, 22001).state).toBe(
    "running",
  );
});
