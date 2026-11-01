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
      retainFraction: fixed ? 1 : 0.8,
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
          retainFraction: profile.fixed ? 1 : 0.8,
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
export type LocalTrackingState = {
  objects: NativeTrack[];
  workspace: NativeTrack;
  reference: Box;
  fixed: Record<string, Box>;
  invalid: boolean;
};
const overlaps = (a: Box, b: Box) =>
  Math.max(a.left, b.left) < Math.min(a.right, b.right) &&
  Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom);
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
/** Explicit native-object feature calibration; no colour assumptions or identity reacquisition. */
export function calibrateLocal(
  image: Pixels,
  calibration: LocalCalibration,
): LocalTrackingState {
  if (
    image.width > 320 ||
    image.height > 240 ||
    !calibration.objects.length ||
    calibration.objects.length > 4
  )
    throw Error("Use a bounded frame and one to four visible objects.");
  if (
    new Set(calibration.objects.map((o) => o.id)).size !==
    calibration.objects.length
  )
    throw Error("Object identities must be distinct.");
  const all = [calibration.workspace, ...calibration.objects.map((o) => o.box)];
  if (all.some((b) => !validBox(b)))
    throw Error("Draw a clear region inside the camera view.");
  if (calibration.objects.some((o) => overlaps(o.box, calibration.workspace)))
    throw Error(
      "Choose a fixed workspace reference separate from the objects.",
    );
  for (let i = 0; i < calibration.objects.length; i++)
    if (
      calibration.objects
        .slice(i + 1)
        .some((o) => overlaps(o.box, calibration.objects[i].box))
    )
      throw Error("Object regions must be separate to establish identity.");
  const frame = prepareTrackingFrame(image);
  if (!frameQuality(image, frame).usable)
    throw Error(
      "The view is too dark, overexposed or unclear for verification.",
    );
  const objects = calibration.objects.map((o) =>
    groundNative(image, o.id, o.box, !!o.fixed),
  );
  const workspace = groundNative(
    image,
    "workspace-reference",
    calibration.workspace,
    true,
  );
  const fixed = Object.create(null) as Record<string, Box>;
  for (const profile of objects.filter((o) => o.fixed)) {
    const measured = measureNative(image, frame, profile);
    if (!measured.box || measured.quality !== "observed")
      throw Error(
        "A fixed destination needs a clearer stable visible feature.",
      );
    fixed[profile.objectId] = { ...measured.box };
  }
  const reference = measureNative(image, frame, workspace);
  if (!reference.box || reference.quality !== "observed")
    throw Error("Choose a clearer fixed workspace reference.");
  return {
    objects,
    workspace,
    reference: { ...reference.box },
    fixed,
    invalid: false,
  };
}
export function trackLocal(
  image: Pixels,
  state: LocalTrackingState,
): {
  detections: ObjectDetection[];
  calibrationValid: boolean;
  reason: string | null;
  partialIdentities: {
    objectId: string;
    score: number;
    visibleFraction: number;
  }[];
} {
  const fail = (reason: string) => {
    state.invalid = true;
    return {
      detections: state.objects.map((o) => ({
        objectId: o.objectId,
        quality: "ambiguous" as const,
        box: null,
        score: null,
      })),
      partialIdentities: [],
      calibrationValid: false,
      reason,
    };
  };
  if (state.invalid)
    return fail("Recalibrate the workspace and objects before continuing.");
  const frame = prepareTrackingFrame(image);
  if (!frameQuality(image, frame).usable)
    return fail("Camera evidence is unclear; verification suspended.");
  const anchor = measureNative(image, frame, state.workspace),
    ref = state.reference;
  if (
    !anchor.box ||
    anchor.quality !== "observed" ||
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
  const detections = state.objects.map((o) => measureNative(image, frame, o));
  for (const [id, reference] of Object.entries(state.fixed)) {
    const observed = detections.find((d) => d.objectId === id);
    if (
      !observed?.box ||
      observed.quality !== "observed" ||
      Math.max(
        Math.abs(observed.box.left - reference.left),
        Math.abs(observed.box.top - reference.top),
        Math.abs(observed.box.right - reference.right),
        Math.abs(observed.box.bottom - reference.bottom),
      ) > 0.025
    )
      return fail(
        "A fixed destination or reference moved or became uncertain. Recalibrate the setup.",
      );
  }
  // Colliding identities cannot both be authoritative observations.
  for (let i = 0; i < detections.length; i++)
    for (let j = i + 1; j < detections.length; j++) {
      const a = detections[i],
        b = detections[j];
      if (state.fixed[a.objectId] || state.fixed[b.objectId]) continue;
      if (a.box && b.box && overlaps(a.box, b.box)) {
        const intersection =
          (Math.min(a.box.right, b.box.right) -
            Math.max(a.box.left, b.box.left)) *
          (Math.min(a.box.bottom, b.box.bottom) -
            Math.max(a.box.top, b.box.top));
        const smaller = Math.min(
          (a.box.right - a.box.left) * (a.box.bottom - a.box.top),
          (b.box.right - b.box.left) * (b.box.bottom - b.box.top),
        );
        if (intersection / smaller > 0.5) {
          state.objects[i].lost = true;
          state.objects[j].lost = true;
          a.quality = "ambiguous";
          a.box = null;
          a.score = null;
          b.quality = "ambiguous";
          b.box = null;
          b.score = null;
        }
      }
    }
  return {
    detections,
    calibrationValid: true,
    reason: null,
    partialIdentities: state.objects.flatMap((profile) =>
      profile.method === "native_palette" &&
      !profile.lost &&
      profile.track.partialIdentity
        ? [{ objectId: profile.objectId, ...profile.track.partialIdentity }]
        : [],
    ),
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
