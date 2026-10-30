import { validateReviewEvidence, type TeachContext, type TeachDraft, type Region } from "./schema";
export type SuggestedCheck = { reviewed: boolean; conditionConfirmed: boolean; fromFrame: number; toFrame: number; fromRegion: Region | null; toRegion: Region | null };
const centre = (r: Region) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
function around(p: { x: number; y: number }, radius: number): Region { return { left: Math.max(0, p.x - radius), top: Math.max(0, p.y - radius), right: Math.min(1, p.x + radius), bottom: Math.min(1, p.y + radius) }; }
/** Suggestions only: every reviewed/confirmed flag stays false. Never patch the rules. */
export function suggestReviews(draft: TeachDraft, context: TeachContext): Record<string, SuggestedCheck> {
  const suggestions: Record<string, SuggestedCheck> = {}; let priorEnd = -1;
  for (const step of draft.procedure.steps) {
    const samples = context.tracking.find((t) => t.componentId === step.condition.componentId)?.samples ?? [];
    let best: { i: number; j: number; distance: number } | null = null;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].timestampMs <= priorEnd || samples[i].confidence === null || samples[i].confidence! < step.condition.minimumConfidence) continue;
      for (let j = i + 1; j < samples.length; j++) {
        if (samples[j].frame !== samples[j - 1].frame + 1 || samples[j].confidence === null || samples[j].confidence! < step.condition.minimumConfidence) break;
        const a = centre(samples[i].box), b = centre(samples[j].box), distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance >= .05 && (!best || distance > best.distance)) best = { i, j, distance };
      }
    }
    if (best) {
      const from = samples[best.i], to = samples[best.j], radius = Math.min(.04, best.distance / 4);
      suggestions[step.id] = { reviewed: false, conditionConfirmed: false, fromFrame: from.frame, toFrame: to.frame, fromRegion: around(centre(from.box), radius), toRegion: around(centre(to.box), radius) };
      priorEnd = to.timestampMs;
    } else suggestions[step.id] = { reviewed: false, conditionConfirmed: false, fromFrame: samples[0]?.frame ?? 0, toFrame: samples.at(-1)?.frame ?? 0, fromRegion: null, toRegion: null };
  }
  return suggestions;
}
/** A small set of distinct source moments, not hundreds of nearly-identical frames. */
export function keyFrames(context: TeachContext, frames: number[], extras: number[] = []) {
  const actual = [...new Set([...extras, ...frames])].filter((f) => Number.isInteger(f) && f >= 0 && f < context.lesson.media.frameTimesMs.length).sort((a, b) => a - b);
  const picked: number[] = [];
  for (const frame of actual) if (extras.includes(frame) || !picked.some((f) => Math.abs(context.lesson.media.frameTimesMs[f] - context.lesson.media.frameTimesMs[frame]) < 1000)) picked.push(frame);
  if (picked.length <= 8) return picked;
  const important = [...new Set(extras)].filter((f) => actual.includes(f)).slice(0, 10);
  const others = picked.filter((f) => !important.includes(f));
  const slots = 10 - important.length;
  const filler = slots > 0 ? others.filter((_, i) => i % Math.max(1, Math.ceil(others.length / slots)) === 0).slice(0, slots) : [];
  return [...important, ...filler].sort((a, b) => a - b);
}

export function reviewBlockers(draft: TeachDraft, context: TeachContext, checks: Record<string, SuggestedCheck>): string[] {
  const issues: string[] = [];
  for (const [index, step] of draft.procedure.steps.entries()) {
    const check = checks[step.id], label = `Step ${index + 1}`;
    if (!check?.fromRegion || !check.toRegion) issues.push(`${label} — starting/target zones are missing. Recheck suggestions or choose clear moments.`);
    if (!check?.reviewed) issues.push(`${label} — check “I reviewed this step”.`);
    if (!check?.conditionConfirmed) issues.push(`${label} — confirm the visible zone entry.`);
  }
  if (draft.procedure.steps.every((s) => checks[s.id]?.fromRegion && checks[s.id]?.toRegion)) {
    try { validateReviewEvidence(draft, draft.procedure.steps.map((s) => ({ stepId: s.id, ...checks[s.id] })), context); }
    catch (error) { issues.push(error instanceof Error && error.name !== "ZodError" ? error.message : "The selected moments or zones are invalid. Check each before/after selection and zone boundary."); }
  }
  return issues;
}
export function reviewErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "ZodError") return "The review is incomplete or contains invalid fields. Check the approval checklist and each step's starting/target zones.";
  return error instanceof Error ? error.message : "Approval failed. Check the review and try again.";
}
