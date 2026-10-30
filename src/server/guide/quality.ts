/** Use actual same-record provider confidence only; unknown never becomes 1. */
export function reportedConfidence(
  ...values: (number | undefined)[]
): number | null {
  if (
    values.some(
      (v) => v !== undefined && (!Number.isFinite(v) || v < 0 || v > 1),
    )
  )
    return null;
  const known = values.filter((v): v is number => v !== undefined);
  return known.length ? Math.min(...known) : null;
}
