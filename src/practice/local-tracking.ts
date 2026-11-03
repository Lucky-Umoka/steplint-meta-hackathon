import {
  alignStartingView,
  translateBox,
  alignFixedObjects,
  chooseLiveWorkspace,
} from "./automatic-alignment";
import {
  groundAppearance,
  prepareTrackingFrame,
  trackPreparedAppearance,
  frameQuality,
  type AppearanceTrack,
} from "./appearance";
import type { Box, ObjectDetection } from "../guide/schema";
import {
  groundNativePalette,
  measureNativePalette,
  type NativePalette,
} from "./native-palette";
import type { Pixels } from "./tracker";
import {
  groundOverlay,
  trackOverlay,
  type OverlayTrack,
} from "./appearance-overlay";
import {
  activateIdentity,
  dormantIdentity,
  expireSearch,
  loseIdentity,
  nextSearch,
  recordSearch,
  trackedIdentity,
  type IdentityEvent,
  type IdentityState,
} from "./identity-recovery";
type NativeTrack = { objectId: string; lost: boolean; fixed: boolean } & (
  | { method: "dense_rgb"; track: OverlayTrack }
  | { method: "features"; track: AppearanceTrack }
  | { method: "native_palette"; track: NativePalette }
);
function groundNative(
  image: Pixels,
  id: string,
  box: Box,
  fixed = false,
): NativeTrack {
  if (!fixed) {
    const palette = groundNativePalette(image, id, box);
    if (palette)
      return {
        objectId: id,
        lost: false,
        fixed,
        method: "native_palette",
        track: palette,
      };
  }
  const dense = groundOverlay(image, id, box);
  if (
    trackOverlay(image, dense, {
      multiscale: false,
      retainFraction: 0.8,
    }).quality === "observed"
  )
    return {
      objectId: id,
      lost: false,
      fixed,
      method: "dense_rgb",
      track: dense,
    };
  return {
    objectId: id,
    lost: false,
    fixed,
    method: "features",
    track: groundAppearance(image, id, box),
  };
}
function measureNative(
  image: Pixels,
  frame: ReturnType<typeof prepareTrackingFrame>,
  profile: NativeTrack,
): ObjectDetection {
  if (profile.lost)
    return {
      objectId: profile.objectId,
      quality: "ambiguous",
      box: null,
      score: null,
    };
  if (profile.method === "native_palette") {
    const detection = measureNativePalette(image, profile.track);
    if (detection.quality !== "observed" && !profile.track.partialIdentity)
      profile.lost = true;
    return detection;
  }
  const detection =
    profile.method === "dense_rgb"
      ? trackOverlay(image, profile.track, {
          multiscale: !profile.fixed,
          // Stationary references tolerate the same partial occlusion as
          // movers (an object resting on the plate); position gates unchanged.
          retainFraction: 0.8,
        })
      : trackPreparedAppearance(frame, profile.track);
  if (detection.quality !== "observed") {
    profile.lost = true;
    return detection;
  }
  if (profile.method === "dense_rgb") {
    const raw = profile.track.measurement;
    if (!raw || !Number.isFinite(raw.cost))
      throw Error("Measured appearance cost is required.");
    // Normalised measured RGB similarity, not a probability or fabricated provider confidence.
    // The existing absolute-error and competing-candidate gates must also pass.
    detection.score = 1 - raw.cost / 255;
  }
  return detection;
}

export type LocalCalibration = {
  objects: { id: string; box: Box; fixed?: boolean }[];
  workspace: Box;
};
/** Watch set the host submits with each frame (see watch-set.ts). */
export type TrackingWatch = { required: string[]; optional: string[] };
/** Per-object identity slot, separate from global scene calibration. */
type Slot = {
  identity: IdentityState;
  profile: NativeTrack | null;
  /** Approved appearance template (Teach source pixels) used for searches. */
  template: OverlayTrack | null;
  /** Last reliable live box, or the approved expected location if never seen. */
  lastBox: Box | null;
  /** Candidate box being confirmed during recovery/acquisition. */
  candidateBox?: Box | null;
  fixed: boolean;
};
export type LocalTrackingState = {
  objects: NativeTrack[];
  /** Textured table reference, when one exists. Stationary objects otherwise. */
  workspace: NativeTrack | null;
  reference: Box | null;
  fixed: Record<string, Box>;
  invalid: boolean;
  slots: Record<string, Slot>;
  /** Approved nested pairs ("a|b", sorted) whose boxes may overlap. */
  nested: Set<string>;
  /** When every camera reference became hidden (null while one is seen). */
  referenceHiddenSince?: number | null;
};
const overlaps = (a: Box, b: Box) =>
  Math.max(a.left, b.left) < Math.min(a.right, b.right) &&
  Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom);
const pairKey = (a: string, b: string) => [a, b].sort().join("|");
const area = (b: Box) => (b.right - b.left) * (b.bottom - b.top);
function intersection(a: Box, b: Box) {
  return overlaps(a, b)
    ? (Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
        (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
    : 0;
}
/** Nested approved boxes stay distinguishable only while their boxes differ. */
function indistinct(a: Box, b: Box) {
  const shared = intersection(a, b);
  return shared / (area(a) + area(b) - shared) >= 0.8;
}
function validBox(box: Box) {
  return (
    [box.left, box.top, box.right, box.bottom].every(Number.isFinite) &&
    box.left >= 0 &&
    box.top >= 0 &&
    box.right <= 1 &&
    box.bottom <= 1 &&
    box.right - box.left >= 0.02 &&
    box.bottom - box.top >= 0.02
  );
}
/** Source (Teach) pixels are matched against a live camera's own exposure. */
function fromSource(profile: NativeTrack): NativeTrack {
  if (profile.method === "dense_rgb") profile.track.illumination = true;
  return profile;
}
/** Approved appearance template, or null when the source view has too little detail. */
function identityTemplate(image: Pixels, id: string, box: Box) {
  try {
    const template = groundOverlay(image, id, box);
    template.illumination = true;
    return trackOverlay(image, structuredClone(template), {
      multiscale: false,
      retainFraction: 0.8,
    }).quality === "observed"
      ? template
      : null;
  } catch {
    return null;
  }
}
/**
 * One bounded identity search: the approved template, near the last reliable
 * (or expected) location, with the existing absolute-error and
 * competing-candidate separation gates plus the 0.9 score gate. Appearance
 * pattern matching, never colour alone, narration or nearest object.
 */
function searchIdentity(image: Pixels, template: OverlayTrack, near: Box) {
  const probe = structuredClone(template);
  probe.last = {
    x: ((near.left + near.right) / 2) * image.width,
    y: ((near.top + near.bottom) / 2) * image.height,
  };
  probe.scale = undefined;
  const found = trackOverlay(image, probe, {
    multiscale: false,
    retainFraction: 0.8,
    exhaustiveTranslation: true,
  });
  if (found.quality !== "observed" || !found.box || !probe.measurement)
    return null;
  return 1 - probe.measurement.cost / 255 >= 0.9 ? found.box : null;
}
function buildState(
  image: Pixels,
  objects: { id: string; box: Box; fixed?: boolean }[],
  workspaceBox: Box | null,
  nested: Set<string>,
): LocalTrackingState {
  if (
    image.width > 320 ||
    image.height > 240 ||
    !objects.length ||
    objects.length > 4
  )
    throw Error("Use a bounded frame and one to four visible objects.");
  if (new Set(objects.map((o) => o.id)).size !== objects.length)
    throw Error("Object identities must be distinct.");
  const all = [
    ...(workspaceBox ? [workspaceBox] : []),
    ...objects.map((o) => o.box),
  ];
  if (all.some((b) => !validBox(b)))
    throw Error("Draw a clear region inside the camera view.");
  if (workspaceBox && objects.some((o) => overlaps(o.box, workspaceBox)))
    throw Error(
      "Choose a fixed workspace reference separate from the objects.",
    );
  for (let i = 0; i < objects.length; i++)
    for (const other of objects.slice(i + 1))
      if (
        overlaps(other.box, objects[i].box) &&
        (!nested.has(pairKey(other.id, objects[i].id)) ||
          indistinct(other.box, objects[i].box))
      )
        throw Error("Object regions must be separate to establish identity.");
  const frame = prepareTrackingFrame(image);
  if (!frameQuality(image, frame).usable)
    throw Error(
      "The view is too dark, overexposed or unclear for verification.",
    );
  const profiles = objects.map((o) =>
    groundNative(image, o.id, o.box, !!o.fixed),
  );
  const workspace = workspaceBox
    ? groundNative(image, "workspace-reference", workspaceBox, true)
    : null;
  const fixed = Object.create(null) as Record<string, Box>;
  for (const profile of profiles.filter((o) => o.fixed)) {
    const measured = measureNative(image, frame, profile);
    if (!measured.box || measured.quality !== "observed")
      throw Error(
        "A fixed destination needs a clearer stable visible feature.",
      );
    fixed[profile.objectId] = { ...measured.box };
  }
  let reference: Box | null = null;
  if (workspace) {
    const measured = measureNative(image, frame, workspace);
    if (!measured.box || measured.quality !== "observed")
      throw Error("Choose a clearer fixed workspace reference.");
    reference = { ...measured.box };
  } else if (!Object.keys(fixed).length)
    throw Error(
      "Show a clear stationary reference so camera movement can be told apart from object movement.",
    );
  const slots = Object.create(null) as Record<string, Slot>;
  profiles.forEach((profile, index) => {
    slots[profile.objectId] = {
      identity: trackedIdentity(),
      profile,
      template: identityTemplate(image, profile.objectId, objects[index].box),
      lastBox: { ...objects[index].box },
      fixed: profile.fixed,
    };
  });
  return {
    objects: profiles,
    workspace,
    reference,
    fixed,
    invalid: false,
    slots,
    nested,
  };
}
/** Explicit native-object feature calibration; no colour assumptions. */
export function calibrateLocal(
  image: Pixels,
  calibration: LocalCalibration,
): LocalTrackingState {
  return buildState(
    image,
    calibration.objects,
    calibration.workspace,
    new Set(),
  );
}
export function trackLocal(
  image: Pixels,
  state: LocalTrackingState,
  context?: { nowMs: number; frameId: string; watch?: TrackingWatch },
): {
  detections: ObjectDetection[];
  optionalDetections: ObjectDetection[];
  calibrationValid: boolean;
  reason: string | null;
  partialIdentities: {
    objectId: string;
    score: number;
    visibleFraction: number;
  }[];
  identityEvents: IdentityEvent[];
} {
  const allIds = Object.keys(state.slots);
  const required = context?.watch?.required ?? allIds;
  const optional = context?.watch?.optional ?? [];
  const unknown = (objectId: string): ObjectDetection => ({
    objectId,
    quality: "ambiguous",
    box: null,
    score: null,
  });
  const fail = (reason: string) => {
    state.invalid = true;
    return {
      detections: required.map(unknown),
      optionalDetections: optional.map(unknown),
      partialIdentities: [],
      calibrationValid: false,
      reason,
      identityEvents: [],
    };
  };
  if (state.invalid)
    return fail("Recalibrate the workspace and objects before continuing.");
  if ([...required, ...optional].some((id) => !state.slots[id]))
    return fail("The tracker was not set up for this lesson's objects.");
  const frame = prepareTrackingFrame(image);
  if (!frameQuality(image, frame).usable)
    return fail("Camera evidence is unclear; verification suspended.");
  // Camera-motion reference (live E2E run 2 root cause): a reference seen
  // reliably displaced means the camera or a reference moved. A reference that
  // is merely hidden (a hand passing) is uncertainty, not motion.
  let referenceSeen = false;
  if (state.workspace && state.reference) {
    state.workspace.lost = false; // stationary: re-measure every frame
    const anchor = measureNative(image, frame, state.workspace),
      ref = state.reference;
    if (anchor.box && anchor.quality === "observed") {
      if (
        Math.max(
          Math.abs(anchor.box.left - ref.left),
          Math.abs(anchor.box.top - ref.top),
          Math.abs(anchor.box.right - ref.right),
          Math.abs(anchor.box.bottom - ref.bottom),
        ) > 0.015
      )
        return fail(
          "The camera or workspace reference moved. Recalibrate before continuing.",
        );
      referenceSeen = true;
    }
  }
  const nowMs = context?.nowMs ?? 0;
  const events: IdentityEvent[] = [];
  const measured = new Map<string, ObjectDetection>();
  for (const id of [...required, ...optional]) {
    const slot = state.slots[id];
    if (slot.identity.status === "dormant")
      slot.identity = activateIdentity(slot.identity);
    // Stationary references are re-measured every frame at their reference
    // position; one occluded frame must not disable them permanently.
    if (state.fixed[id] && slot.profile) {
      slot.profile.lost = false;
      slot.identity = trackedIdentity();
    }
    if (slot.identity.status === "tracked" && slot.profile) {
      const detection = measureNative(image, frame, slot.profile);
      if (detection.quality === "observed" && detection.box) {
        slot.lastBox = { ...detection.box };
        measured.set(id, detection);
        continue;
      }
      if (!state.fixed[id]) {
        slot.identity = loseIdentity(slot.identity, nowMs);
        events.push({
          objectId: id,
          status: slot.identity.status,
          reason:
            "Lost a reliable observation; the object is uncertain, not moved.",
        });
      }
      measured.set(id, detection);
      continue;
    }
    measured.set(id, unknown(id));
  }
  for (const [id, reference] of Object.entries(state.fixed)) {
    const observed = measured.get(id);
    if (!observed?.box || observed.quality !== "observed") continue; // hidden
    if (
      Math.max(
        Math.abs(observed.box.left - reference.left),
        Math.abs(observed.box.top - reference.top),
        Math.abs(observed.box.right - reference.right),
        Math.abs(observed.box.bottom - reference.bottom),
      ) > 0.025
    )
      return fail(
        "A fixed destination or reference moved. Recalibrate the setup.",
      );
    referenceSeen = true;
  }
  if (!referenceSeen) {
    state.referenceHiddenSince ??= nowMs;
    if (nowMs - state.referenceHiddenSince > 2000)
      return fail(
        "No stationary reference has been visible for 2 seconds, so camera movement cannot be told apart from object movement. Show the stationary reference.",
      );
    // Until a reference is seen again, nothing from this frame is evidence.
    return {
      detections: required.map(unknown),
      optionalDetections: optional.map(unknown),
      calibrationValid: true,
      reason: "A stationary reference is hidden; this frame is not evidence.",
      partialIdentities: [],
      identityEvents: events,
    };
  }
  state.referenceHiddenSince = null;
  // Colliding identities cannot both be authoritative observations, unless
  // they are an approved nested pair whose boxes remain distinguishable.
  const live = [...measured.values()];
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i],
        b = live[j];
      if (state.fixed[a.objectId] || state.fixed[b.objectId]) continue;
      if (!a.box || !b.box || !overlaps(a.box, b.box)) continue;
      const nestedPair = state.nested.has(pairKey(a.objectId, b.objectId));
      if (
        nestedPair
          ? !indistinct(a.box, b.box)
          : intersection(a.box, b.box) / Math.min(area(a.box), area(b.box)) <=
            0.5
      )
        continue;
      for (const d of [a, b]) {
        const slot = state.slots[d.objectId];
        if (slot.profile) slot.profile.lost = true;
        slot.identity = loseIdentity(slot.identity, nowMs);
        d.quality = "ambiguous";
        d.box = null;
        d.score = null;
      }
      events.push({
        objectId: a.objectId,
        status: "occluded",
        reason: `Identity collides with ${b.objectId}; neither is assigned.`,
      });
    }
  // Bounded searches for lost or newly activated identities (one per fresh frame).
  if (context)
    for (const id of [...required, ...optional]) {
      const slot = state.slots[id];
      const before = slot.identity.status;
      const action = nextSearch(slot.identity, nowMs, context.frameId);
      if (action === "none" || !slot.template || !slot.lastBox) {
        slot.identity = expireSearch(slot.identity, nowMs);
        if (
          slot.identity.status === "needs_user_view" &&
          before !== "needs_user_view"
        )
          events.push({
            objectId: id,
            status: "needs_user_view",
            reason: slot.template
              ? "Not found again within the bounded search. Show it clearly, then restart tracking."
              : "Its approved appearance has too little detail to search for it again. Show it clearly, then restart tracking.",
          });
        continue;
      }
      let candidate = searchIdentity(
        image,
        slot.template,
        action === "confirm" && slot.candidateBox
          ? slot.candidateBox
          : slot.lastBox,
      );
      // Two approved identities never silently share one live detection.
      if (
        candidate &&
        [...measured.values()].some(
          (other) =>
            other.objectId !== id &&
            other.quality === "observed" &&
            other.box &&
            !state.nested.has(pairKey(id, other.objectId)) &&
            intersection(candidate!, other.box) /
              Math.min(area(candidate!), area(other.box)) >
              0.5,
        )
      )
        candidate = null;
      const step = recordSearch(
        slot.identity,
        nowMs,
        context.frameId,
        candidate
          ? {
              x: (candidate.left + candidate.right) / 2,
              y: (candidate.top + candidate.bottom) / 2,
            }
          : null,
      );
      slot.identity = step.state;
      slot.candidateBox = step.state.candidates.length ? candidate : null;
      if (step.accepted && candidate) {
        const profile = groundNative(image, id, candidate, slot.fixed);
        slot.profile = profile;
        const index = state.objects.findIndex((o) => o.objectId === id);
        if (index >= 0) state.objects[index] = profile;
        else state.objects.push(profile);
        slot.lastBox = { ...candidate };
        events.push({
          objectId: id,
          status: "tracked",
          reason:
            before === "acquiring"
              ? "Found from its approved appearance after three consistent matches."
              : "Reacquired the same approved identity after three consistent matches; no movement is inferred across the unseen interval.",
        });
      } else if (
        slot.identity.status === "needs_user_view" &&
        before !== "needs_user_view"
      )
        events.push({
          objectId: id,
          status: "needs_user_view",
          reason:
            "Not found again within the bounded search. Show it clearly, then restart tracking.",
        });
    }
  return {
    detections: required.map((id) => measured.get(id) ?? unknown(id)),
    optionalDetections: optional.map((id) => measured.get(id) ?? unknown(id)),
    calibrationValid: true,
    reason: null,
    partialIdentities: required.flatMap((id) => {
      const profile = state.slots[id].profile;
      return profile &&
        profile.method === "native_palette" &&
        !profile.lost &&
        state.slots[id].identity.status === "tracked" &&
        profile.track.partialIdentity
        ? [{ objectId: id, ...profile.track.partialIdentity }]
        : [];
    }),
    identityEvents: events,
  };
}

export function trackingMeasurements(state: LocalTrackingState) {
  return state.objects.map((profile) => ({
    objectId: profile.objectId,
    method: profile.method,
    error:
      profile.method === "dense_rgb"
        ? (profile.track.measurement?.cost ?? null)
        : profile.method === "native_palette"
          ? (profile.track.measurement?.error ?? null)
          : null,
    alternativeGap:
      profile.method === "dense_rgb"
        ? (profile.track.measurement?.alternativeGap ?? null)
        : null,
    pixels:
      profile.method === "native_palette"
        ? (profile.track.measurement?.pixels ?? null)
        : null,
  }));
}

/** Ground identity from signed, human-reviewed Teach pixels, then match the live
 * view. Automatic setup never learns an arbitrary live object as the target.
 * Only objects marked `required` (active required identities) must be found
 * now; dormant later objects and optional supporting objects that are not
 * visible are kept with their approved template for later acquisition. */
export function bootstrapLocal(
  image: Pixels,
  source: {
    scene: Pixels;
    zones?: Box[];
    objects: {
      id: string;
      box: Box;
      fixed: boolean;
      image: Pixels;
      expectedBox?: Box;
      required?: boolean;
      active?: boolean;
    }[];
  },
) {
  const frame = prepareTrackingFrame(image);
  const sameSize = (object: { image: Pixels }) =>
    object.image.width === image.width && object.image.height === image.height;
  // A stationary reference whose approved box mostly overlaps a mover (e.g.
  // a lid track dominated by the bottle resting on it) moves with that mover,
  // so it cannot be a camera reference (live E2E run 2 root cause).
  const movers = source.objects.filter((object) => !object.fixed);
  const contaminated = new Set(
    source.objects
      .filter(
        (object) =>
          object.fixed &&
          (object.required ?? true) === false &&
          movers.some(
            (mover) => intersection(object.box, mover.box) / area(object.box) > 0.2,
          ),
      )
      .map((object) => object.id),
  );
  const anchors = source.objects
    .filter(
      (object) =>
        object.fixed && sameSize(object) && !contaminated.has(object.id),
    )
    .flatMap((object) => {
      const profile = fromSource(
        groundNative(object.image, object.id, object.box, true),
      );
      const detection = measureNative(image, frame, profile);
      return detection.quality === "observed" &&
        detection.box &&
        detection.score !== null &&
        detection.score >= 0.9
        ? [{ id: object.id, source: object.box, observed: detection.box }]
        : [];
    });
  const anchored = alignFixedObjects(anchors);
  const stationary = source.objects.filter((object) => object.fixed);
  let alignment: { x: number; y: number; workspace: Box | null };
  if (anchored) alignment = { ...anchored, workspace: null };
  else
    try {
      // Table texture is only a fallback when no approved stationary
      // reference was matched.
      alignment = alignStartingView(
        source.scene,
        image,
        source.objects.map((object) => object.box),
      );
    } catch (error) {
      if (!stationary.length) throw error;
      throw Error(
        `Finding the work area: show ${stationary.map((object) => object.id).join(", ")} clearly in the demonstrated position. A textured table is not required when the stationary reference is visible.`,
      );
    }
  const shiftFor = (box: Box, ownId?: string) => {
    const index = anchors.findIndex((anchor) =>
      ownId ? anchor.id === ownId : overlaps(anchor.source, box),
    );
    return anchored && index >= 0
      ? { x: anchored.shifts[index].dx, y: anchored.shifts[index].dy }
      : { x: alignment.x, y: alignment.y };
  };
  const found: { id: string; profile: NativeTrack; box: Box }[] = [];
  const pending: {
    id: string;
    fixed: boolean;
    expected: Box;
    dormant: boolean;
    template: OverlayTrack | null;
  }[] = [];
  for (const object of source.objects) {
    if (contaminated.has(object.id)) continue; // optional and unreliable
    const required = object.required ?? true,
      active = object.active ?? true;
    const profile = fromSource(
      groundNative(object.image, object.id, object.box, object.fixed),
    );
    const expected = object.expectedBox ?? object.box;
    // Stationary objects follow their own match; a mover follows the reference
    // it sits on (object-relative placement), else the shared camera shift.
    const shift = object.fixed
      ? shiftFor(object.box, object.id)
      : object.expectedBox
        ? { x: alignment.x, y: alignment.y }
        : shiftFor(object.box);
    const dx =
      ((expected.left + expected.right - object.box.left - object.box.right) /
        2 +
        shift.x) *
      image.width;
    const dy =
      ((expected.top + expected.bottom - object.box.top - object.box.bottom) /
        2 +
        shift.y) *
      image.height;
    if (profile.method !== "features") {
      profile.track.last.x += dx;
      profile.track.last.y += dy;
    } else if (dx || dy) {
      profile.track.box = translateBox(
        profile.track.box,
        dx / image.width,
        dy / image.height,
      );
      profile.track.features = profile.track.features.map((feature) => ({
        ...feature,
        x: feature.x + dx,
        y: feature.y + dy,
      }));
      profile.track.corners = profile.track.corners?.map((point) => ({
        x: point.x + dx,
        y: point.y + dy,
      }));
    }
    const detection = measureNative(image, frame, profile);
    const observed =
      detection.quality === "observed" &&
      !!detection.box &&
      detection.score !== null &&
      detection.score >= 0.9;
    if (observed && object.fixed) {
      const shifted = translateBox(object.box, shift.x, shift.y);
      if (
        Math.max(
          ...(["left", "top", "right", "bottom"] as const).map((key) =>
            Math.abs(shifted[key] - detection.box![key]),
          ),
        ) > 0.015
      )
        throw Error(
          "A fixed destination does not match the demonstrated work area. Restore its starting position.",
        );
    }
    if (observed) {
      found.push({ id: object.id, profile, box: detection.box! });
      continue;
    }
    if (required && active)
      throw Error(
        `Finding ${object.id}. Show its demonstrated starting position clearly.`,
      );
    pending.push({
      id: object.id,
      fixed: object.fixed,
      expected: translateBox(expected, shift.x, shift.y),
      dormant: !active,
      template: sameSize(object)
        ? identityTemplate(object.image, object.id, object.box)
        : null,
    });
  }
  if (!found.length)
    throw Error(
      "Show at least one approved object in its demonstrated position.",
    );
  // Approved nesting: objects whose reviewed source boxes overlap (for
  // example a phone inside its box) may overlap live while distinguishable.
  const nested = new Set<string>();
  for (let i = 0; i < source.objects.length; i++)
    for (const other of source.objects.slice(i + 1))
      if (overlaps(source.objects[i].box, other.box))
        nested.add(pairKey(source.objects[i].id, other.id));
  let workspace: Box | null = alignment.workspace;
  // With matched stationary references, they are the camera reference; a
  // table patch is chosen only when none matched (a scanned patch can land on
  // the demonstrator's body and read every movement as camera motion).
  if (!workspace && !anchored)
    try {
      workspace = chooseLiveWorkspace(image, [
        ...found.map((item) => item.box),
        ...pending.map((item) => item.expected),
        ...(source.zones ?? []).map((box) =>
          translateBox(box, alignment.x, alignment.y),
        ),
      ]);
    } catch (error) {
      // Owner decision: on a smooth table, approved stationary objects are the
      // camera-motion reference. Without any, the original instruction stands.
      if (!found.some((item) => item.profile.fixed)) throw error;
      workspace = null;
    }
  const state = buildState(
    image,
    found.map(({ profile, box }) => ({
      id: profile.objectId,
      box,
      fixed: profile.fixed,
    })),
    workspace,
    nested,
  );
  // Identity was established above by matching approved Teach pixels
  // (exposure-compensated). Frame-to-frame tracking then uses profiles that
  // buildState grounded from the live view at exactly those matched boxes:
  // already in the live camera's lighting and as fast as before. The
  // approved source templates are kept for bounded identity recovery.
  for (const item of found) {
    const object = source.objects.find((o) => o.id === item.id)!;
    if (sameSize(object))
      state.slots[item.id].template = identityTemplate(
        object.image,
        object.id,
        object.box,
      );
  }
  // Unreliable (contaminated) references are reported as unknown, never used.
  for (const id of contaminated)
    state.slots[id] = {
      identity: dormantIdentity(),
      profile: null,
      template: null,
      lastBox: null,
      fixed: true,
    };
  for (const item of pending)
    state.slots[item.id] = {
      identity: item.dormant
        ? dormantIdentity()
        : activateIdentity(dormantIdentity()),
      profile: null,
      template: item.template,
      lastBox: item.expected,
      fixed: item.fixed,
    };
  // Each approved zone follows the stationary reference it belongs to: the
  // reference containing its centre, else the one it overlaps most.
  const zoneTranslations = (source.zones ?? []).map((zone) => {
    if (!anchored) return { x: alignment.x, y: alignment.y };
    const c = {
      x: (zone.left + zone.right) / 2,
      y: (zone.top + zone.bottom) / 2,
    };
    let best = -1,
      bestScore = 0;
    anchors.forEach((anchor, index) => {
      const a = anchor.source;
      const containsCentre =
        c.x >= a.left && c.x <= a.right && c.y >= a.top && c.y <= a.bottom;
      const score = (containsCentre ? 1 : 0) + intersection(a, zone);
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });
    return best >= 0
      ? { x: anchored.shifts[best].dx, y: anchored.shifts[best].dy }
      : { x: alignment.x, y: alignment.y };
  });
  return {
    state,
    translation: { x: alignment.x, y: alignment.y },
    zoneTranslations,
  };
}
