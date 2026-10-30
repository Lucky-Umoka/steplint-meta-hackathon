/** Upper bound of scene displacement in normalized image coordinates. Scale/rotation affect edge objects most. */
export function cameraMotionMagnitude(
  translation: number,
  rotation: number,
  scale: number,
) {
  return (
    translation + Math.SQRT1_2 * (Math.abs(rotation) + Math.abs(scale - 1))
  );
}
export function cameraNeedsAlignment(
  translation: number,
  rotation: number,
  scale: number,
  smallestAction: number,
) {
  const allowed = Math.min(
    0.012,
    Number.isFinite(smallestAction) ? smallestAction * 0.25 : 0.012,
  );
  return (
    !Number.isFinite(translation + rotation + scale) ||
    cameraMotionMagnitude(translation, rotation, scale) > allowed
  );
}
