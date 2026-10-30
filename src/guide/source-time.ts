/** Map a proposed video time to a real decoded packet; never assume a model's internal frame rate. */
export function frameAtSourceTime(
  timestampMs: number,
  frameTimesMs: number[],
  durationMs: number,
) {
  if (
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    !Number.isFinite(timestampMs) ||
    timestampMs < 0 ||
    timestampMs > durationMs ||
    !frameTimesMs.length ||
    frameTimesMs.some(
      (time, index) =>
        !Number.isFinite(time) ||
        time < 0 ||
        time > durationMs ||
        (index > 0 && time <= frameTimesMs[index - 1]),
    )
  )
    throw Error(
      `The selected source timestamp ${timestampMs} ms is outside this clip (0–${Math.round(durationMs)} ms).`,
    );
  let best = 0;
  for (let index = 1; index < frameTimesMs.length; index++)
    if (
      Math.abs(frameTimesMs[index] - timestampMs) <
      Math.abs(frameTimesMs[best] - timestampMs)
    )
      best = index;
  if (Math.abs(frameTimesMs[best] - timestampMs) > 250)
    throw Error("The selected timestamp has no nearby actual video frame.");
  return best;
}
