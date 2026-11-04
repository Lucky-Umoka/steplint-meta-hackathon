import type { TeachContext, Tracking } from "./schema";

export const MINIMUM_TEACH_SOURCE_SCORE = 0.9;
/** Normalized box-centre shift a V3 transfer window must show between start and result. */
export const MINIMUM_TEACH_TRANSFER_DISPLACEMENT = 0.05;
type Sample = Tracking[number]["samples"][number];
export function trustedSourceSample(sample: Sample, times: number[]): boolean {
  return (
    times[sample.frame] !== undefined &&
    sample.timestampMs === times[sample.frame] &&
    sample.confidence !== null &&
    sample.confidence >= MINIMUM_TEACH_SOURCE_SCORE
  );
}
/**
 * Owner decision 2026-11-04: on real scenes SAM scores correctly outlined,
 * resting objects 0.5-0.9 (paid run 12: the never-moving plate had 7 frames
 * >= 0.9). A track's reliable observations are those scoring >= 0.9 PLUS
 * those forming a steady rest: >= 3 consecutive observations (within 4
 * frames), each scoring >= 0.5, box centre within TEACH_REST_MAX_DRIFT and
 * outline size within +/-50%. Movement still needs >= 0.9 (or the hidden-
 * carry rule); identity is guarded separately by the outline gates.
 */
export const STEADY_REST_MIN_SCORE = 0.5;
export function trustedTrack(samples: Sample[], times: number[]): Sample[] {
  const valid = samples
    .filter(
      (s) =>
        times[s.frame] !== undefined &&
        s.timestampMs === times[s.frame] &&
        s.confidence !== null,
    )
    .sort((a, b) => a.frame - b.frame);
  const keep = new Set<Sample>(
    valid.filter((s) => s.confidence! >= MINIMUM_TEACH_SOURCE_SCORE),
  );
  for (let i = 0; i + 2 < valid.length; i++) {
    const run = valid.slice(i, i + 3);
    const masks = run.map((s) => s.maskPixels);
    if (
      run.every((s) => s.confidence! >= STEADY_REST_MIN_SCORE) &&
      run[2].frame - run[0].frame <= 4 &&
      run.every((s) => sampleDisplacement(run[0], s) <= TEACH_REST_MAX_DRIFT) &&
      Math.min(...masks) > 0 &&
      Math.max(...masks) <= 1.5 * Math.min(...masks)
    )
      for (const s of run) keep.add(s);
  }
  return valid.filter((s) => keep.has(s));
}
export function sampleDisplacement(first: Sample, last: Sample): number {
  const a = first.box,
    b = last.box;
  return Math.hypot(
    (a.left + a.right - b.left - b.right) / 2,
    (a.top + a.bottom - b.top - b.bottom) / 2,
  );
}
/**
 * Teach source timing policy. The values equal the existing Practice
 * measurement defaults set in local-execution.ts (maximumPositionDrift,
 * stableForMs, maxObservationGapMs), so Teach and Practice use one meaning of
 * "at rest" and "short tracking gap".
 */
export const TEACH_REST_MAX_DRIFT = 0.01;
export const TEACH_REST_MS = 400;
export const TEACH_MAX_SOURCE_GAP_MS = 600;
/**
 * Owner decision 2026-11-04 (paid run 14): one tracking gap of up to 4 s may
 * lie inside a move, but only between a settled start and a settled landing
 * at least the transfer distance away, with a reliable observation between
 * them. Only the carry may be hidden; start and landing must be seen at rest.
 */
export const TEACH_MAX_HIDDEN_CARRY_MS = 4000;
type Window = { startFrame: number; resultFrame: number; displacement: number };
/**
 * Trusted observations split wherever no trusted observation exists for more
 * than TEACH_MAX_SOURCE_GAP_MS (for example a hand covering the object). Owner
 * decision 2026-11-02: short gaps inside an action are allowed; longer ones end
 * the segment.
 */
export function trackedSegments(trusted: Sample[]): Sample[][] {
  const segments: Sample[][] = [];
  for (const sample of trusted) {
    const segment = segments.at(-1);
    if (
      segment &&
      sample.timestampMs - segment.at(-1)!.timestampMs <=
        TEACH_MAX_SOURCE_GAP_MS
    )
      segment.push(sample);
    else segments.push([sample]);
  }
  return segments;
}
/**
 * At rest at segment[index], looking "before" (it was already still for
 * TEACH_REST_MS: a settled start) or "after" (it stays still for TEACH_REST_MS:
 * where it comes to rest). Every observation in that span, including the one
 * that reaches TEACH_REST_MS, must stay within TEACH_REST_MAX_DRIFT; an
 * unobserved span (segment edge) is not evidence of rest.
 */
export function atRest(
  segment: Sample[],
  index: number,
  direction: "before" | "after",
): boolean {
  const origin = segment[index];
  const step = direction === "after" ? 1 : -1;
  for (
    let next = index + step;
    next >= 0 && next < segment.length;
    next += step
  ) {
    const sample = segment[next];
    if (sampleDisplacement(origin, sample) > TEACH_REST_MAX_DRIFT) return false;
    if (Math.abs(sample.timestampMs - origin.timestampMs) >= TEACH_REST_MS)
      return true;
  }
  return false;
}
/**
 * Rest-to-rest movement windows: the start is the latest observation that was
 * settled before the object leaves; the result is the FIRST observation where
 * it comes to rest (owner decision: the "after" moment and final-goal picture
 * show where the object settles, not a mid-air position). Start and result
 * differ by at least the transfer policy, have a trusted change frame between
 * them, and lie in one tracked segment (gaps <= TEACH_MAX_SOURCE_GAP_MS). This
 * is a catalog of satisfying windows for the model; the validator still checks
 * whichever window the draft chooses. A mask that never moves (for example a
 * whole-scene mask) or never settles has no windows.
 */
/** Rest-to-rest move whose carry is hidden by one gap (<= 4 s), or null. */
function hiddenCarry(
  before: Sample[],
  after: Sample[],
  startIndex: number,
  resultIndex: number,
): Window | null {
  const start = before[startIndex],
    result = after[resultIndex];
  if (!start || !result) return null;
  const gap = after[0].timestampMs - before.at(-1)!.timestampMs;
  if (gap <= TEACH_MAX_SOURCE_GAP_MS || gap > TEACH_MAX_HIDDEN_CARRY_MS)
    return null;
  if (
    !atRest(before, startIndex, "before") ||
    !atRest(after, resultIndex, "after") ||
    sampleDisplacement(start, result) < MINIMUM_TEACH_TRANSFER_DISPLACEMENT
  )
    return null;
  // A reliable observation strictly between start and landing (the change).
  if (startIndex === before.length - 1 && resultIndex === 0) return null;
  return {
    startFrame: start.frame,
    resultFrame: result.frame,
    displacement: Math.round(sampleDisplacement(start, result) * 1000) / 1000,
  };
}
export function measuredDisplacementWindows(trusted: Sample[]): Window[] {
  const segments = trackedSegments(trusted);
  const hidden: Window[] = [];
  for (let k = 1; k < segments.length; k++) {
    const before = segments[k - 1],
      after = segments[k];
    // Latest settled start before the gap; first settled landing after it.
    let s = -1;
    for (let i = before.length - 1; i >= 0 && s < 0; i--)
      if (atRest(before, i, "before")) s = i;
    let r = -1;
    for (let j = 0; j < after.length && r < 0; j++)
      if (atRest(after, j, "after")) r = j;
    const window = s >= 0 && r >= 0 ? hiddenCarry(before, after, s, r) : null;
    if (window) hidden.push(window);
  }
  return [...segments.flatMap((segment) => {
    const windows: Window[] = [];
    let start = -1;
    for (let index = 0; index < segment.length; index++) {
      if (
        start >= 0 &&
        index - start >= 2 &&
        sampleDisplacement(segment[start], segment[index]) >=
          MINIMUM_TEACH_TRANSFER_DISPLACEMENT &&
        atRest(segment, index, "after")
      ) {
        windows.push({
          startFrame: segment[start].frame,
          resultFrame: segment[index].frame,
          displacement:
            Math.round(
              sampleDisplacement(segment[start], segment[index]) * 1000,
            ) / 1000,
        });
        start = -1;
      }
      if (atRest(segment, index, "before")) start = index;
    }
    return windows;
  }), ...hidden].sort((a, b) => a.startFrame - b.startFrame);
}
/** Why a mover's start/result window is not acceptable source evidence, or null. */
export function actionWindowIssue(
  trustedMover: Sample[],
  startFrame: number,
  resultFrame: number,
): string | null {
  const segments = trackedSegments(trustedMover);
  const at = segments.findIndex((candidate) =>
    candidate.some((sample) => sample.frame === startFrame),
  );
  const segment = segments[at];
  const startIndex = segment?.findIndex((s) => s.frame === startFrame) ?? -1;
  const resultIndex = segment?.findIndex((s) => s.frame === resultFrame) ?? -1;
  if (segment && startIndex >= 0 && resultIndex < 0) {
    // Hidden carry: the landing is in the next tracked stretch.
    const after = segments[at + 1];
    const landing = after?.findIndex((s) => s.frame === resultFrame) ?? -1;
    if (after && landing >= 0) {
      const gap = after[0].timestampMs - segment.at(-1)!.timestampMs;
      if (gap > TEACH_MAX_HIDDEN_CARRY_MS)
        return `tracking is missing for ${gap} ms between frames ${segment.at(-1)!.frame} and ${after[0].frame}, longer than the ${TEACH_MAX_HIDDEN_CARRY_MS} ms a carry may be hidden`;
      if (!atRest(segment, startIndex, "before"))
        return `the start frame ${startFrame} is not a settled position (the object was not still for ${TEACH_REST_MS} ms before it)`;
      if (!atRest(after, landing, "after"))
        return `the result frame ${resultFrame} is not where the object comes to rest (it still moves within ${TEACH_REST_MS} ms), so the after moment would show it mid-motion`;
      if (!hiddenCarry(segment, after, startIndex, landing))
        return `the hidden carry between frames ${startFrame} and ${resultFrame} has no reliable observation between start and landing, or moves less than ${MINIMUM_TEACH_TRANSFER_DISPLACEMENT}`;
      return null;
    }
  }
  if (!segment || startIndex < 0 || resultIndex <= startIndex)
    return `tracking is missing for more than ${TEACH_MAX_HIDDEN_CARRY_MS} ms between frames ${startFrame} and ${resultFrame}`;
  if (!atRest(segment, startIndex, "before"))
    return `the start frame ${startFrame} is not a settled position (the object was not still for ${TEACH_REST_MS} ms before it)`;
  if (!atRest(segment, resultIndex, "after"))
    return `the result frame ${resultFrame} is not where the object comes to rest (it still moves within ${TEACH_REST_MS} ms), so the after moment would show it mid-motion`;
  return null;
}
/**
 * Why an object has no measured movement window, from its trusted tracking
 * only (null when it has one). Diagnostic, never used to create evidence.
 */
export function movementDiagnosis(trusted: Sample[]): string | null {
  if (measuredDisplacementWindows(trusted).length) return null;
  if (trusted.length < 3)
    return `only ${trusted.length} reliable tracked frame(s) (score 0.90 or higher)`;
  let largest = 0;
  for (let i = 0; i < trusted.length; i++)
    for (let j = i + 1; j < trusted.length; j++)
      largest = Math.max(largest, sampleDisplacement(trusted[i], trusted[j]));
  if (largest < MINIMUM_TEACH_TRANSFER_DISPLACEMENT)
    return `its reliable tracking never moved ${MINIMUM_TEACH_TRANSFER_DISPLACEMENT} (largest shift ${largest.toFixed(3)})`;
  let gap = { ms: 0, from: 0, to: 0 };
  for (let i = 1; i < trusted.length; i++) {
    const ms = trusted[i].timestampMs - trusted[i - 1].timestampMs;
    if (ms > gap.ms)
      gap = { ms, from: trusted[i - 1].frame, to: trusted[i].frame };
  }
  const segments = trackedSegments(trusted);
  // Did the move of at least the policy distance happen within one tracked
  // stretch, or only across a gap longer than the limit?
  const moved = segments.some((segment) =>
    segment.some((a, i) =>
      segment
        .slice(i + 1)
        .some(
          (b) =>
            sampleDisplacement(a, b) >= MINIMUM_TEACH_TRANSFER_DISPLACEMENT,
        ),
    ),
  );
  if (gap.ms > TEACH_MAX_HIDDEN_CARRY_MS && !moved)
    return `it moved, but reliable tracking is missing for ${gap.ms} ms (frames ${gap.from}-${gap.to}), longer than the ${TEACH_MAX_HIDDEN_CARRY_MS} ms a carry may be hidden`;
  const settledBefore = segments.some((segment) =>
    segment.some((_, i) => atRest(segment, i, "before")),
  );
  const settledAfter = segments.some((segment) =>
    segment.some((_, i) => atRest(segment, i, "after")),
  );
  if (!settledBefore)
    return `it is never still for ${TEACH_REST_MS} ms (within ${TEACH_REST_MAX_DRIFT}) before moving`;
  if (!settledAfter)
    return `it is never still for ${TEACH_REST_MS} ms (within ${TEACH_REST_MAX_DRIFT}) after moving`;
  return `no tracked stretch contains a still start, a move of ${MINIMUM_TEACH_TRANSFER_DISPLACEMENT} and a still landing${gap.ms > TEACH_MAX_SOURCE_GAP_MS ? ` (longest tracking gap ${gap.ms} ms, frames ${gap.from}-${gap.to})` : ""}`;
}
export function sourceEvidenceCatalog(context: TeachContext) {
  return context.selections.map((selection) => {
    const samples =
      context.tracking.find((track) => track.componentId === selection.id)
        ?.samples ?? [];
    const trusted = trustedTrack(samples, context.lesson.media.frameTimesMs);
    const frames = trusted.map((sample) => sample.frame);
    const ranges: [number, number][] = [];
    for (const frame of frames) {
      const last = ranges.at(-1);
      if (last && last[1] + 1 === frame) last[1] = frame;
      else if (!last || last[1] !== frame) ranges.push([frame, frame]);
    }
    return {
      componentId: selection.id,
      trustedFrames: frames,
      inclusiveFrameRanges: ranges,
      displacementWindows: measuredDisplacementWindows(trusted),
      movementDiagnosis: movementDiagnosis(trusted),
    };
  });
}
