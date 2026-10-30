import { GuideSchema, type Guide } from "./schema";
/** Canonical JSON makes receipts independent of property order. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`)
    .join(",")}}`;
}
export function guideContent(guide: Guide) {
  return { ...guide, approval: null };
}
export function newRevision(guide: Guide): Guide {
  return GuideSchema.parse({
    ...guide,
    revision: guide.revision + 1,
    parentRevision: guide.revision,
    approval: null,
  });
}
export function evidenceFrames(guide: Guide) {
  return [
    ...new Set([
      guide.steps[0].evidence.startFrame,
      guide.goalFrame,
      ...guide.objects.map((o) => o.sourceFrame),
      ...guide.steps.flatMap((s) => [
        s.evidence.startFrame,
        s.evidence.changeFrame,
        s.evidence.endFrame,
      ]),
    ]),
  ].sort((a, b) => a - b);
}
