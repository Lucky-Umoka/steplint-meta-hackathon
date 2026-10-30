import { trackAppearance, type AppearanceTrack } from "./appearance";
import { cameraMotionMagnitude } from "./camera-motion";
import type { Pixels } from "./tracker";
/** Preserve old pixel-space goal references only when fresh background evidence establishes the same view. */
export function sameWorkbenchView(
  background: AppearanceTrack | null,
  image: Pixels,
  allowedMotion = 0.012,
) {
  if (!background) return false;
  const copy = {
    ...background,
    box: { ...background.box },
    features: background.features.map((feature) => ({ ...feature })),
    corners: background.corners?.map((point) => ({ ...point })),
  };
  const observed = trackAppearance(image, copy);
  if (observed.quality !== "observed" || !observed.box) return false;
  const old = background.box,
    b = observed.box;
  return (
    cameraMotionMagnitude(
      Math.hypot(
        (b.left + b.right - old.left - old.right) / 2,
        (b.top + b.bottom - old.top - old.bottom) / 2,
      ),
      (copy.rotation ?? 0) - (background.rotation ?? 0),
      (copy.scale ?? 1) / (background.scale ?? 1),
    ) < allowedMotion
  );
}
