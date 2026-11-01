import type { GestureReading } from "./engine";
export type Landmark = { x: number; y: number };
export type RecognizedHands = {
  gestures: { categoryName: string; score: number }[][];
  landmarks: Landmark[][];
};
/** Pinch is landmark geometry, not a built-in gesture category. Its classifier
 * score can legitimately be low/None; do not use that score as hand confidence. */
export function gestureReading(
  result: RecognizedHands,
  at: number,
): GestureReading {
  const marks = result.landmarks[0],
    top = result.gestures[0]?.[0];
  if (
    !marks ||
    marks.length < 21 ||
    marks.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x > 1 ||
        p.y < 0 ||
        p.y > 1,
    )
  )
    return { kind: "none", confidence: 0, at };
  const thumb = marks[4],
    tip = marks[8];
  const span = Math.hypot(marks[5].x - marks[17].x, marks[5].y - marks[17].y);
  const classScore = top && Number.isFinite(top.score) ? top.score : 0;
  if (top?.categoryName === "Open_Palm" && classScore >= 0.5)
    return {
      kind: "open_palm",
      confidence: classScore,
      x: tip.x,
      y: tip.y,
      at,
    };
  // Express gap in hand-relative units, mapped to the engine's hysteresis.
  // Null explicitly means no gesture-classifier confidence is available.
  const gap = Math.hypot(thumb.x - tip.x, thumb.y - tip.y);
  if (span >= 0.015 && gap / span <= 0.45)
    return {
      kind: "pinch",
      confidence: null,
      geometry: "hand-relative-pinch",
      x: tip.x,
      y: tip.y,
      pinchGap: (gap / span) * 0.2,
      at,
    };
  return {
    kind: top?.categoryName === "Pointing_Up" ? "point" : "none",
    confidence: classScore,
    x: tip.x,
    y: tip.y,
    at,
  };
}
