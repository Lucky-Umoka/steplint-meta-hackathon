import { expect, it } from "vitest";
import { bootstrapLocal, trackLocal } from "../src/practice/local-tracking";
import { smoothTable, at } from "./fixtures/practice-scene";

// Mover (bottle-like), a stationary plate/packaging base, and a later object
// (phone) that is hidden at the start. Smooth, untextured table throughout.
const M = { left: 0.1, top: 0.35, right: 0.3, bottom: 0.65 },
  P = { left: 0.6, top: 0.6, right: 0.85, bottom: 0.9 },
  F = { left: 0.4, top: 0.1, right: 0.55, bottom: 0.3 };
const source = smoothTable([
  { box: M, seed: 1 },
  { box: P, seed: 2 },
  { box: F, seed: 3 },
]);
const objects = (phoneActive = false) => [
  {
    id: "mover",
    box: M,
    fixed: false,
    image: source,
    required: true,
    active: true,
  },
  {
    id: "plate",
    box: P,
    fixed: true,
    image: source,
    required: true,
    active: true,
  },
  {
    id: "phone",
    box: F,
    fixed: false,
    image: source,
    required: phoneActive,
    active: phoneActive,
  },
];
const startView = (extra: { box: typeof M; seed: number }[] = []) =>
  smoothTable([{ box: M, seed: 1 }, { box: P, seed: 2 }, ...extra]);
const watch = { required: ["mover", "plate"], optional: [] as string[] };
let clock = 0;
const tick = (ms = 70) => ({ nowMs: (clock += ms), frameId: `f${clock}` });

it("starts on a smooth table from one stationary reference, with a hidden later object dormant (scenarios 4, 6)", () => {
  const { state, translation } = bootstrapLocal(startView(), {
    scene: source,
    objects: objects(),
  });
  expect(translation.x).toBeCloseTo(0, 3);
  expect(state.workspace).toBeNull(); // no table texture needed
  expect(state.slots.phone.identity.status).toBe("dormant");
  const result = trackLocal(startView(), state, { ...tick(), watch });
  expect(result.calibrationValid).toBe(true);
  expect(result.detections.map((d) => [d.objectId, d.quality])).toEqual([
    ["mover", "observed"],
    ["plate", "observed"],
  ]);
});
it("finds a shifted camera from the stationary reference alone and never treats camera movement as object movement (scenario 8)", () => {
  const shifted = smoothTable(
    [
      { box: M, seed: 1 },
      { box: P, seed: 2 },
    ],
    { shiftX: 0.05 },
  );
  const { state, translation } = bootstrapLocal(shifted, {
    scene: source,
    objects: objects(),
  });
  expect(translation.x).toBeCloseTo(0.05, 2);
  expect(
    trackLocal(shifted, state, { ...tick(), watch }).calibrationValid,
  ).toBe(true);
  // Camera bumped after startup: the stationary reference moves with everything.
  const bumped = smoothTable(
    [
      { box: M, seed: 1 },
      { box: P, seed: 2 },
    ],
    { shiftX: 0.09 },
  );
  const after = trackLocal(bumped, state, { ...tick(), watch });
  expect(after.calibrationValid).toBe(false);
  expect(after.detections.every((d) => d.quality !== "observed")).toBe(true);
});
it("blocks startup with an actionable message when a required stationary reference is missing (scenario 3)", () => {
  expect(() =>
    bootstrapLocal(smoothTable([{ box: M, seed: 1 }]), {
      scene: source,
      objects: objects(),
    }),
  ).toThrow(/show plate clearly in the demonstrated position/);
});
it("does not block startup when a supporting object is absent, and reports it separately (scenario 2)", () => {
  const { state } = bootstrapLocal(startView(), {
    scene: source,
    objects: [
      ...objects().slice(0, 2),
      {
        id: "phone",
        box: F,
        fixed: false,
        image: source,
        required: false,
        active: true,
      },
    ],
  });
  const result = trackLocal(startView(), state, {
    ...tick(),
    watch: { required: ["mover", "plate"], optional: ["phone"] },
  });
  expect(result.calibrationValid).toBe(true);
  expect(result.detections.map((d) => d.objectId)).toEqual(["mover", "plate"]);
  expect(result.optionalDetections).toEqual([
    expect.objectContaining({
      objectId: "phone",
      quality: "ambiguous",
      box: null,
    }),
  ]);
});
it("acquires the later object only after activation and three consistent matches of its approved appearance (scenario 5)", () => {
  const { state } = bootstrapLocal(startView(), {
    scene: source,
    objects: objects(),
  });
  // Revealed but not yet activated: not part of the watch set, not reported.
  const revealed = startView([{ box: F, seed: 3 }]);
  expect(
    trackLocal(revealed, state, { ...tick(), watch }).detections.map(
      (d) => d.objectId,
    ),
  ).toEqual(["mover", "plate"]);
  expect(state.slots.phone.identity.status).toBe("dormant");
  const active = { required: ["mover", "plate", "phone"], optional: [] };
  const qualities: string[] = [];
  for (let i = 0; i < 4; i++)
    qualities.push(
      trackLocal(revealed, state, { ...tick(), watch: active }).detections[2]
        .quality,
    );
  // Never claimed observed merely because its expected location is known.
  expect(qualities.slice(0, 3)).toEqual([
    "ambiguous",
    "ambiguous",
    "ambiguous",
  ]);
  expect(qualities[3]).toBe("observed");
  expect(state.slots.phone.identity.status).toBe("tracked");
});
it("brief occlusion is uncertain, and the same object is reacquired only after three consistent matches (scenarios 9, 10)", () => {
  const { state } = bootstrapLocal(startView(), {
    scene: source,
    objects: objects(),
  });
  const hidden = smoothTable([{ box: P, seed: 2 }]);
  const lost = trackLocal(hidden, state, { ...tick(), watch });
  expect(lost.calibrationValid).toBe(true);
  expect(lost.detections[0]).toMatchObject({
    objectId: "mover",
    quality: "ambiguous",
    box: null,
  });
  expect(lost.identityEvents).toEqual([
    expect.objectContaining({ objectId: "mover", status: "occluded" }),
  ]);
  const back = startView();
  const statuses: string[] = [];
  const events: string[] = [];
  for (let i = 0; i < 4; i++) {
    const r = trackLocal(back, state, { ...tick(), watch });
    statuses.push(r.detections[0].quality);
    events.push(...r.identityEvents.map((e) => e.status));
  }
  expect(statuses).toEqual(["ambiguous", "ambiguous", "ambiguous", "observed"]);
  expect(events).toEqual(["tracked"]); // one auditable reacquisition
  expect(state.slots.mover.identity.status).toBe("tracked");
});
it("a lookalike replacement or two indistinguishable candidates are never assigned the approved identity (scenarios 7, 11)", () => {
  for (const scene of [
    // A different object put where the original was.
    smoothTable([
      { box: M, seed: 9 },
      { box: P, seed: 2 },
    ]),
    // Two copies of the original appearance close together: no unique match.
    smoothTable([
      { box: M, seed: 1 },
      { box: at(M, 0.22), seed: 1 },
      { box: P, seed: 2 },
    ]),
  ]) {
    const { state } = bootstrapLocal(startView(), {
      scene: source,
      objects: objects(),
    });
    trackLocal(smoothTable([{ box: P, seed: 2 }]), state, { ...tick(), watch });
    const qualities: string[] = [];
    let needsView = false;
    // Attempts are spread across the 2 s window; sample over 2.4 s.
    for (let i = 0; i < 8; i++) {
      const r = trackLocal(scene, state, { ...tick(300), watch });
      qualities.push(r.detections[0].quality);
      needsView ||= r.identityEvents.some(
        (e) => e.status === "needs_user_view",
      );
    }
    expect(qualities.every((q) => q !== "observed")).toBe(true);
    expect(needsView).toBe(true);
    expect(state.slots.mover.identity.status).toBe("needs_user_view");
  }
});
it("continues rate-limited recovery after the bounded initial attempts", () => {
  const { state } = bootstrapLocal(startView(), {
    scene: source,
    objects: objects(),
  });
  const hidden = smoothTable([{ box: P, seed: 2 }]);
  let attempts = 0;
  for (let i = 0; i < 8; i++) {
    trackLocal(hidden, state, { ...tick(300), watch });
    attempts = Math.max(attempts, state.slots.mover.identity.attempts);
  }
  expect(attempts).toBe(3); // never more than three searches per loss episode
  expect(state.slots.mover.identity.status).toBe("needs_user_view");
  // A later clear view recovers automatically, with three fresh matches.
  for (let i = 0; i < 6; i++)
    trackLocal(startView(), state, { ...tick(300), watch });
  expect(state.slots.mover.identity.status).toBe("tracked");
});
it("one frame never runs more than one search per object, and a repeated frame id does not count twice", () => {
  const { state } = bootstrapLocal(startView(), {
    scene: source,
    objects: objects(),
  });
  trackLocal(smoothTable([{ box: P, seed: 2 }]), state, { ...tick(), watch });
  const same = { nowMs: (clock += 70), frameId: "repeat" };
  for (let i = 0; i < 5; i++)
    trackLocal(startView(), state, { ...same, watch });
  expect(state.slots.mover.identity.status).not.toBe("tracked");
  expect(state.slots.mover.identity.candidates.length).toBeLessThanOrEqual(1);
});
it("allows an approved nested pair (object inside its packaging) while distinguishable", () => {
  const box = { left: 0.35, top: 0.05, right: 0.75, bottom: 0.45 },
    inner = { left: 0.45, top: 0.15, right: 0.6, bottom: 0.33 };
  const nestedSource = smoothTable([
    { box: M, seed: 1 },
    { box: P, seed: 2 },
    { box, seed: 5 },
    { box: inner, seed: 3 },
  ]);
  const { state } = bootstrapLocal(nestedSource, {
    scene: nestedSource,
    objects: [
      { id: "mover", box: M, fixed: false, image: nestedSource },
      { id: "plate", box: P, fixed: true, image: nestedSource },
      { id: "packaging", box, fixed: true, image: nestedSource },
      { id: "phone", box: inner, fixed: false, image: nestedSource },
    ],
  });
  const result = trackLocal(nestedSource, state, {
    ...tick(),
    watch: { required: ["mover", "plate", "packaging", "phone"], optional: [] },
  });
  expect(result.calibrationValid).toBe(true);
  expect(result.detections.find((d) => d.objectId === "phone")!.quality).toBe(
    "observed",
  );
});

it("a hand covering the object for half a second still allows safe reacquisition (attempts are not burned while hidden)", () => {
  const { state } = bootstrapLocal(startView(), {
    scene: source,
    objects: objects(),
  });
  const hidden = smoothTable([{ box: P, seed: 2 }]);
  for (let i = 0; i < 7; i++) trackLocal(hidden, state, { ...tick(70), watch }); // ~490 ms hidden
  expect(state.slots.mover.identity.attempts).toBeLessThanOrEqual(1);
  const qualities: string[] = [];
  for (let i = 0; i < 9; i++)
    qualities.push(
      trackLocal(startView(), state, { ...tick(70), watch }).detections[0]
        .quality,
    );
  // Never observed before three consistent matches.
  expect(qualities.slice(0, 3)).toEqual([
    "ambiguous",
    "ambiguous",
    "ambiguous",
  ]);
  expect(qualities).toContain("observed");
  expect(state.slots.mover.identity.status).toBe("tracked");
});
it("a lost mover landing on a fixed reference inside an approved zone is occlusion, not camera motion; without that zone it still invalidates", () => {
  const onPlate = { left: 0.62, top: 0.55, right: 0.82, bottom: 0.85 };
  const landing = smoothTable([
    { box: P, seed: 2 },
    { box: onPlate, seed: 1 },
  ]);
  const hidden = smoothTable([{ box: P, seed: 2 }]);
  for (const [zones, valid] of [
    [[M, { left: 0.58, top: 0.5, right: 0.88, bottom: 0.92 }], true],
    [[M], false],
  ] as const) {
    const { state } = bootstrapLocal(startView(), {
      scene: source,
      objects: objects(),
      zones: [...zones],
    });
    // The hand takes the mover: its identity is lost, lastBox stays at M.
    expect(trackLocal(hidden, state, { ...tick(), watch }).calibrationValid).toBe(true);
    const landed = trackLocal(landing, state, { ...tick(), watch });
    expect(landed.calibrationValid).toBe(valid);
    if (valid)
      // Uncertain plate is never reported as an observed box; nothing passes.
      expect(landed.detections.find((d) => d.objectId === "plate")?.quality).not.toBe("observed");
  }
});
it("resume finds a mover resting on the stationary reference at its verified zone; without that expectation it is not found", () => {
  const onPlate = { left: 0.7, top: 0.45, right: 0.9, bottom: 0.75 }; // ~30% of the plate
  const resting = smoothTable([
    { box: P, seed: 2 },
    { box: onPlate, seed: 1 },
  ]);
  const zone = { left: 0.76, top: 0.56, right: 0.84, bottom: 0.64 };
  const resumed = bootstrapLocal(resting, {
    scene: source,
    objects: objects().map((o) => (o.id === "mover" ? { ...o, expectedBox: zone } : o)),
  });
  const reply = trackLocal(resting, resumed.state, { ...tick(), watch });
  expect(reply.calibrationValid).toBe(true);
  expect(reply.detections.find((d) => d.objectId === "mover")?.quality).toBe("observed");
  // Expected at its demonstrated start instead: it is not there.
  expect(() =>
    bootstrapLocal(resting, { scene: source, objects: objects() }),
  ).toThrow(/Finding mover|stationary reference/);
});
it("an optional support surface the mover rests on (a whole tabletop) is never a camera reference (live run 8)", () => {
  const table = { left: 0, top: 0.3, right: 1, bottom: 0.98 };
  const { state } = bootstrapLocal(startView(), {
    scene: source,
    objects: [
      ...objects(),
      { id: "table", box: table, fixed: true, image: source, required: false, active: true },
    ],
  });
  expect(Object.keys(state.fixed)).not.toContain("table");
  expect(Object.keys(state.fixed)).toContain("plate");
  expect(trackLocal(startView(), state, { ...tick(), watch }).calibrationValid).toBe(true);
});
