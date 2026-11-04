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
  allowPalette = true,
): NativeTrack {
  if (!fixed && allowPalette) {
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
  retainFraction = 0.8,
  occluders: Box[] = [],
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
  let detection: ObjectDetection;
  if (profile.method === "dense_rgb") {
    // The mover covers a known part of a stationary reference. Exclude those
    // approved sample indices from BOTH illumination fitting and scoring, so
    // a red bottle does not change the plate's estimated exposure. Compare
    // the same visible indices for every competing translation hypothesis.
    const visible = profile.track.samples.filter(
      (sample) =>
        !occluders.some((box) => {
          const x = sample.x / image.width,
            y = sample.y / image.height;
          return (
            x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
          );
        }),
    );
    const probe = {
      ...profile.track,
      samples: visible.length >= 32 ? visible : profile.track.samples,
    };
    detection = trackOverlay(image, probe, {
      multiscale: !profile.fixed,
      retainFraction,
    });
    profile.track.measurement = probe.measurement;
    if (detection.quality === "observed") {
      profile.track.last = probe.last;
      profile.track.scale = probe.scale;
    }
  } else detection = trackPreparedAppearance(frame, profile.track);
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
  /**
   * Colour profile grounded from the approved Teach view, when that view
   * supports one. Kept so a live re-grounding whose palette test misses by a
   * pixel margin does not silently downgrade a mover to a tracker that loses
   * identity under a grasp (browser root cause, 2026-11-03).
   */
  sourcePalette?: NativePalette | null;
  /** Observed frames since the last approved-palette upgrade attempt. */
  upgradeTick?: number;
  /** Last reliable live box, or the approved expected location if never seen. */
  lastBox: Box | null;
  /** Approved start box in live coordinates (colour grounding while there). */
  startBox?: Box;
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
  zones: Box[];
  invalid: boolean;
  slots: Record<string, Slot>;
  /** Approved nested pairs ("a|b", sorted) whose boxes may overlap. */
  nested: Set<string>;
  /** When every camera reference became hidden (null while one is seen). */
  referenceHiddenSince?: number | null;
  /** Fixed references a mover starts on (see startSupports). */
  startSupports?: Set<string>;
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
/**
 * Fixed references a mover starts on (its starting box overlaps the
 * reference). Their approved appearance includes that mover, so when the mover
 * is lifted away the reference looks different although nothing moved (paid
 * run 16: the empty blue lid after the bottle left). Removal by the procedure,
 * like placement onto a reference, is not camera motion: such a reference is
 * then uncertain, never proof that the camera moved. Other references, the
 * table anchor and the 2 s no-reference guard still detect camera motion.
 */
function startSupports(state: LocalTrackingState): Set<string> {
  return new Set(
    Object.keys(state.fixed).filter((id) =>
      Object.values(state.slots).some(
        (slot) =>
          !slot.fixed &&
          !!slot.lastBox &&
          intersection(slot.lastBox, state.fixed[id]) > 0,
      ),
    ),
  );
}
/** A mover's last known box is over or next to this box (within 0.1). */
function coveredByMover(state: LocalTrackingState, box: Box) {
  const near = {
    left: box.left - 0.1,
    top: box.top - 0.1,
    right: box.right + 0.1,
    bottom: box.bottom + 0.1,
  };
  return Object.values(state.slots).some(
    (slot) => !slot.fixed && slot.lastBox && overlaps(slot.lastBox, near),
  );
}
/**
 * Fixed-reference check only: a mover not clearly observed this frame (lost,
 * or kept only by partial identity during a grasp) has a stale lastBox (where it was last seen), yet it may already rest on any approved
 * zone, covering a reference there (bottle landing on the plate while its
 * identity is still being reacquired). That reference is then uncertain, not
 * proof of camera motion. The 2 s no-reference-seen guard still applies, a
 * tracked mover far away still fails, and nothing here observes the mover.
 */
function possiblyCovered(
  state: LocalTrackingState,
  box: Box,
  measured: Map<string, ObjectDetection>,
) {
  if (coveredByMover(state, box)) return true;
  const near = {
    left: box.left - 0.1,
    top: box.top - 0.1,
    right: box.right + 0.1,
    bottom: box.bottom + 0.1,
  };
  return Object.entries(state.slots).some(
    ([id, slot]) =>
      !slot.fixed &&
      slot.identity.status !== "dormant" &&
      // Lost, or tracked only by partial identity with no box this frame.
      (slot.identity.status !== "tracked" ||
        measured.get(id)?.quality !== "observed") &&
      state.zones.some((zone) => overlaps(zone, near)),
  );
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
/**
 * Live grounding decides the tracking method from one frame. When it does not
 * yield a colour profile but the approved Teach view did, place that approved
 * profile at the live box and keep it only if it measures the object as
 * observed with the unchanged 0.9 score; otherwise keep the live profile.
 */
/**
 * Live colour profile for a mover: grounded at its tracked box, or, while it
 * is still within 0.05 of its approved start, at the approved start box (a
 * texture tracker's box can be offset enough to break colour grounding; paid
 * run 17). The result must still pass preferApprovedPalette's 0.9 gate.
 */
function liveMoverPalette(image: Pixels, id: string, slot: Slot, box: Box) {
  const atStart =
    slot.startBox &&
    Math.hypot(
      (box.left + box.right - slot.startBox.left - slot.startBox.right) / 2,
      (box.top + box.bottom - slot.startBox.top - slot.startBox.bottom) / 2,
    ) <= 0.05;
  return (
    groundNativePalette(image, id, box) ??
    (atStart ? groundNativePalette(image, id, slot.startBox!) : null)
  );
}
function preferApprovedPalette(
  image: Pixels,
  frame: ReturnType<typeof prepareTrackingFrame>,
  live: NativeTrack,
  source: NativePalette | null | undefined,
  box: Box,
): NativeTrack {
  if (live.method === "native_palette" || live.fixed || !source) return live;
  const track = structuredClone(source);
  track.lost = false;
  track.partialIdentity = undefined;
  track.measurement = undefined;
  track.seedBox = { ...box };
  track.last = {
    x: ((box.left + box.right) / 2) * image.width,
    y: ((box.top + box.bottom) / 2) * image.height,
  };
  const candidate: NativeTrack = {
    objectId: live.objectId,
    lost: false,
    fixed: live.fixed,
    method: "native_palette",
    track,
  };
  const detection = measureNative(image, frame, candidate);
  return detection.quality === "observed" &&
    detection.score !== null &&
    detection.score >= 0.9
    ? candidate
    : live;
}
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
  const profiles = objects.map((o) => {
    const profile = groundNative(image, o.id, o.box, !!o.fixed);
    // Stationary references are the camera-motion reference: compensate the
    // camera's continuous auto-exposure, or a still plate "moves" (live run 2).
    if (o.fixed && profile.method === "dense_rgb")
      profile.track.illumination = true;
    return profile;
  });
  const workspace = workspaceBox
    ? groundNative(image, "workspace-reference", workspaceBox, true)
    : null;
  if (workspace?.method === "dense_rgb") workspace.track.illumination = true;
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
  const state: LocalTrackingState = {
    objects: profiles,
    workspace,
    reference,
    fixed,
    invalid: false,
    slots,
    nested,
    zones: [],
  };
  state.startSupports = startSupports(state);
  return state;
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
    if (!anchor.box || anchor.quality !== "observed") {
      // Not found and nothing of the procedure near it: the camera or the
      // reference moved (the original safety rule). Near a mover: occlusion.
      if (!coveredByMover(state, ref))
        return fail(
          "The camera or workspace reference moved. Recalibrate before continuing.",
        );
    } else {
      const displaced =
        Math.max(
          Math.abs(anchor.box.left - ref.left),
          Math.abs(anchor.box.top - ref.top),
          Math.abs(anchor.box.right - ref.right),
          Math.abs(anchor.box.bottom - ref.bottom),
        ) > 0.015;
      if (displaced && !coveredByMover(state, ref))
        return fail(
          "The camera or workspace reference moved. Recalibrate before continuing.",
        );
      if (!displaced) referenceSeen = true;
    }
  }
  const nowMs = context?.nowMs ?? 0;
  const events: IdentityEvent[] = [];
  const measured = new Map<string, ObjectDetection>();
  // Fixed references are camera evidence, measured whatever the step watch
  // says (zone anchors are not watched objects; paid run 17).
  const references = Object.keys(state.fixed).filter(
    (id) => !required.includes(id) && !optional.includes(id),
  );
  for (const id of [...required, ...optional, ...references]) {
    const slot = state.slots[id];
    if (slot.identity.status === "dormant")
      slot.identity = activateIdentity(slot.identity);
    // Stationary references are re-measured every frame at their reference
    // position; one occluded frame must not disable them permanently.
    if (state.fixed[id] && slot.profile) {
      slot.profile.lost = false;
      slot.identity = trackedIdentity();
      if (slot.profile.method === "dense_rgb") {
        const reference = state.fixed[id];
        slot.profile.track.last = {
          x: ((reference.left + reference.right) * image.width) / 2,
          y: ((reference.top + reference.bottom) * image.height) / 2,
        };
        slot.profile.track.scale = 1;
      }
    }
    if (slot.identity.status === "tracked" && slot.profile) {
      const detection = measureNative(
        image,
        frame,
        slot.profile,
        0.8,
        state.fixed[id]
          ? Object.values(state.slots)
              .filter((other) => !other.fixed && other.lastBox)
              .map((other) => other.lastBox!)
          : [],
      );
      if (detection.quality === "observed" && detection.box) {
        slot.lastBox = { ...detection.box };
        measured.set(id, detection);
        // A mover set up on a frame where its colour profile could not be
        // confirmed (hand in view) upgrades to the approved colour profile
        // once a clear frame confirms it; bounded to every 10th observation.
        if (
          !slot.fixed &&
          slot.profile.method !== "native_palette" &&
          (slot.upgradeTick = (slot.upgradeTick ?? 0) + 1) % 10 === 0
        ) {
          // The identity is confirmed this frame, so the live view's own
          // colour (current exposure) is tried first; the approved Teach
          // colour (one compressed source frame) second. Either must measure
          // the object observed at the unchanged 0.9 gate.
          const chosen = preferApprovedPalette(
            image,
            frame,
            preferApprovedPalette(
              image,
              frame,
              slot.profile,
              liveMoverPalette(image, id, slot, detection.box),
              detection.box,
            ),
            slot.sourcePalette,
            detection.box,
          );
          if (chosen !== slot.profile) {
            const index = state.objects.indexOf(slot.profile);
            if (index >= 0) state.objects[index] = chosen;
            slot.profile = chosen;
          }
        }
        continue;
      }
      const identityStillVisible =
        slot.profile.method === "native_palette" &&
        !!slot.profile.track.partialIdentity;
      if (!state.fixed[id] && !identityStillVisible) {
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
  // A start-support reference (see startSupports) seen displaced may be its
  // template following the departing mover; it proves motion only when no
  // other reference confirms the camera is still on this frame.
  let supportDisplaced = false;
  for (const [id, reference] of Object.entries(state.fixed)) {
    const observed = measured.get(id);
    const covered = possiblyCovered(state, reference, measured);
    const startSupport = !!state.startSupports?.has(id);
    if (!observed?.box || observed.quality !== "observed") {
      // Unrecognised: covered by a mover, or uncovered by the mover that
      // started on it. Never proof of camera motion by itself; the 2 s
      // no-reference guard below still applies.
      if (!covered && !startSupport)
        return fail(
          "A fixed destination or reference moved or became uncertain. Recalibrate the setup.",
        );
      continue;
    }
    const displaced =
      Math.max(
        Math.abs(observed.box.left - reference.left),
        Math.abs(observed.box.top - reference.top),
        Math.abs(observed.box.right - reference.right),
        Math.abs(observed.box.bottom - reference.bottom),
      ) > 0.025;
    // An object being placed on (or a hand passing over) a stationary
    // reference changes how it looks: occlusion by the procedure, not motion.
    if (displaced && !covered && !startSupport)
      return fail(
        "A fixed destination or reference moved. Recalibrate the setup.",
      );
    if (displaced) {
      if (!covered) supportDisplaced = true;
      measured.set(id, unknown(id)); // never report a disturbed reference box
      continue;
    }
    referenceSeen = true;
  }
  if (supportDisplaced && !referenceSeen)
    return fail(
      "A fixed destination or reference moved. Recalibrate the setup.",
    );
  if (!referenceSeen) {
    state.referenceHiddenSince ??= nowMs;
    if (nowMs - state.referenceHiddenSince > 2000)
      return fail(
        "No stationary reference has been visible for 2 seconds, so camera movement cannot be told apart from object movement. Show the stationary reference.",
      );
    // References hidden by the procedure's own objects for under 2 s: the
    // objects' evidence keeps flowing (the camera was confirmed still just
    // before); a longer absence invalidates above.
  } else state.referenceHiddenSince = null;
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
              ? "Not found again within the bounded search. Show it clearly; tracking will keep looking."
              : "Its approved appearance has too little detail to search for it again. Review the Teach reference before restarting tracking.",
          });
        continue;
      }
      const distance = (box: Box) =>
        Math.hypot(
          box.left + box.right - slot.lastBox!.left - slot.lastBox!.right,
          box.top + box.bottom - slot.lastBox!.top - slot.lastBox!.bottom,
        );
      const regions =
        action === "confirm" && slot.candidateBox
          ? [slot.candidateBox]
          : [
              slot.lastBox,
              ...[...state.zones].sort((a, b) => distance(a) - distance(b)),
            ];
      // Two approved identities never silently share one live detection.
      let candidate: Box | null = null;
      for (const region of regions) {
        const found = searchIdentity(image, slot.template, region);
        if (
          found &&
          ![...measured.values()].some(
            (other) =>
              other.objectId !== id &&
              other.quality === "observed" &&
              other.box &&
              !state.nested.has(pairKey(id, other.objectId)) &&
              intersection(found, other.box) /
                Math.min(area(found), area(other.box)) >
                0.5,
          )
        ) {
          candidate = found;
          break;
        }
      }
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
        const profile = preferApprovedPalette(
          image,
          frame,
          groundNative(image, id, candidate, slot.fixed),
          slot.sourcePalette,
          candidate,
        );
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
            "Not found again within the bounded search. Show it clearly; tracking will keep looking.",
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
            (mover) =>
              intersection(object.box, mover.box) / area(object.box) > 0.2 ||
              // A surface the mover rests on or crosses (a whole tabletop
              // proposed as "support", live run 8) moves under the mover.
              intersection(object.box, mover.box) / area(mover.box) > 0.2,
          ),
      )
      .map((object) => object.id),
  );
  // On resume, movers are expected at their last verified zones, which may
  // rest on a stationary reference (bottle on the plate after the goal). Those
  // regions are excluded from reference matching, as during normal tracking.
  // The mask is the mover's own approved box centred on its expected zone
  // (a zone is smaller than the object resting in it).
  const expectedMask = new Map<string, Box>();
  for (const object of movers)
    if (object.expectedBox)
      expectedMask.set(
        object.id,
        translateBox(
          object.box,
          (object.expectedBox.left +
            object.expectedBox.right -
            object.box.left -
            object.box.right) /
            2,
          (object.expectedBox.top +
            object.expectedBox.bottom -
            object.box.top -
            object.box.bottom) /
            2,
        ),
      );
  const expectedMovers = [...expectedMask.values()];
  const anchors = source.objects
    .filter(
      (object) =>
        object.fixed && sameSize(object) && !contaminated.has(object.id),
    )
    .flatMap((object) => {
      const profile = fromSource(
        groundNative(object.image, object.id, object.box, true),
      );
      const detection = measureNative(
        image,
        frame,
        profile,
        0.8,
        expectedMovers,
      );
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
  const found: {
    id: string;
    profile: NativeTrack;
    box: Box;
    start: Box;
  }[] = [];
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
    let profile = fromSource(
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
    let detection = measureNative(
      image,
      frame,
      profile,
      0.8,
      object.fixed ? expectedMovers : [],
    );
    // The approved colour profile can miss on a given live frame (exposure,
    // blur); the approved dense template is then tried under the same gate.
    if (
      profile.method === "native_palette" &&
      !(detection.quality === "observed" && (detection.score ?? 0) >= 0.9)
    ) {
      const dense = fromSource(
        groundNative(object.image, object.id, object.box, object.fixed, false),
      );
      if (dense.method !== "features") {
        dense.track.last.x += dx;
        dense.track.last.y += dy;
      }
      const retry = measureNative(image, frame, dense);
      if (retry.quality === "observed" && (retry.score ?? 0) >= 0.9) {
        profile = dense;
        detection = retry;
      }
    }
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
      found.push({
        id: object.id,
        profile,
        box: detection.box!,
        start: translateBox(expected, shift.x, shift.y),
      });
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
  // Resume: a mover verified at a zone on a stationary object (bottle on the
  // plate) rests on it by the approved procedure; distinctness is still checked.
  for (const mover of movers)
    for (const object of source.objects)
      if (
        object.fixed &&
        expectedMask.has(mover.id) &&
        overlaps(expectedMask.get(mover.id)!, object.box)
      )
        nested.add(pairKey(mover.id, object.id));
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
    if (object.fixed) continue;
    const slot = state.slots[item.id];
    slot.startBox = item.start;
    slot.sourcePalette = groundNativePalette(
      object.image,
      object.id,
      object.box,
    );
    if (slot.profile && slot.lastBox) {
      // The identity is confirmed at setup, so the live camera's own colour
      // is tried first (paid run 17: Teach saw the bottle as dark red, live
      // as bright red, so the approved colour never matched and the mover
      // fell back to a texture tracker that loses it under every grasp).
      // Either colour must still measure the object observed at the 0.9 gate.
      const chosen = preferApprovedPalette(
        image,
        frame,
        preferApprovedPalette(
          image,
          frame,
          slot.profile,
          liveMoverPalette(image, item.id, slot, slot.lastBox),
          slot.lastBox,
        ),
        slot.sourcePalette,
        slot.lastBox,
      );
      if (chosen !== slot.profile) {
        const index = state.objects.indexOf(slot.profile);
        if (index >= 0) state.objects[index] = chosen;
        slot.profile = chosen;
      }
    }
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
      sourcePalette: (() => {
        const object = source.objects.find((o) => o.id === item.id)!;
        return item.fixed || !sameSize(object)
          ? null
          : groundNativePalette(object.image, object.id, object.box);
      })(),
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
  // Movers set up later (pending) also start on their references.
  state.startSupports = startSupports(state);
  state.zones = (source.zones ?? []).map((zone, index) => ({
    left: zone.left + zoneTranslations[index].x,
    right: zone.right + zoneTranslations[index].x,
    top: zone.top + zoneTranslations[index].y,
    bottom: zone.bottom + zoneTranslations[index].y,
  }));
  return {
    state,
    translation: { x: alignment.x, y: alignment.y },
    zoneTranslations,
  };
}
