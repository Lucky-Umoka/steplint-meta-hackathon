import {
  validateReviewEvidence,
  type TeachContext,
  type TeachDraft,
  type Region,
} from "./schema";
export type SuggestedCheck = {
  evidenceStatus?: "supported" | "unsupported";
  evidenceReason?: string;
  reviewed: boolean;
  conditionConfirmed: boolean;
  fromFrame: number;
  toFrame: number;
  changeFrame?: number;
  fromRegion: Region | null;
  toRegion: Region | null;
};
const centre = (r: Region, point?: "center" | "bottom_center") => ({
  x: (r.left + r.right) / 2,
  y: point === "bottom_center" ? r.bottom : (r.top + r.bottom) / 2,
});
function around(p: { x: number; y: number }, radius: number): Region {
  return {
    left: Math.max(0, p.x - radius),
    top: Math.max(0, p.y - radius),
    right: Math.min(1, p.x + radius),
    bottom: Math.min(1, p.y + radius),
  };
}
/** Suggestions only: every reviewed/confirmed flag stays false. Never patch the rules. */
export function suggestReviews(
  draft: TeachDraft,
  context: TeachContext,
): Record<string, SuggestedCheck> {
  const suggestions = Object.create(null) as Record<string, SuggestedCheck>;
  let priorEnd = -1;
  const sharedRegions = new Map<string, Region>();
  for (const step of draft.procedure.steps) {
    const v3 = draft.procedure.execution?.schemaVersion === 3;
    const window = step.execution?.evidenceWindow;
    const ownFrames =
      draft.notes.find((note) => note.stepId === step.id)?.supportingFrames ??
      [];
    const start =
      window?.startFrame ??
      step.measurement?.sourceFrames?.start ??
      Math.min(...ownFrames);
    const end =
      window?.resultFrame ??
      step.measurement?.sourceFrames?.result ??
      Math.max(...ownFrames);
    const samples =
      context.tracking
        .find((t) => t.componentId === step.condition.componentId)
        ?.samples.filter(
          (sample) => sample.frame >= start && sample.frame <= end,
        ) ?? [];
    const explicitChange =
      window?.changeFrame ?? step.measurement?.sourceFrames?.change;
    const validWindow =
      !v3 ||
      (!!window &&
        window.startFrame < window.changeFrame &&
        window.changeFrame < window.resultFrame &&
        [window.startFrame, window.changeFrame, window.resultFrame].every(
          (frame) =>
            ownFrames.includes(frame) &&
            samples.some(
              (s) =>
                s.frame === frame &&
                s.confidence !== null &&
                s.confidence >= step.condition.minimumConfidence,
            ),
        ));
    let best: { i: number; j: number; distance: number } | null = null;
    for (let i = 0; i < samples.length; i++) {
      if (
        !validWindow ||
        (v3 && samples[i].frame !== start) ||
        (draft.procedure.execution
          ? samples[i].timestampMs < priorEnd
          : samples[i].timestampMs <= priorEnd) ||
        samples[i].confidence === null ||
        samples[i].confidence! < step.condition.minimumConfidence
      )
        continue;
      for (let j = i + 1; j < samples.length; j++) {
        if (
          samples[j].frame !== samples[j - 1].frame + 1 ||
          samples[j].confidence === null ||
          samples[j].confidence! < step.condition.minimumConfidence
        )
          break;
        const a = centre(samples[i].box, step.measurement?.point),
          b = centre(samples[j].box, step.measurement?.point),
          distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (
          (!v3 || samples[j].frame === end) &&
          distance >= 0.05 &&
          (!best || distance > best.distance)
        )
          best = { i, j, distance };
      }
    }
    if (best) {
      const from = samples[best.i],
        to = samples[best.j],
        radius = Math.min(0.04, best.distance / 4);
      suggestions[step.id] = {
        ...(v3 ? { evidenceStatus: "supported" as const } : {}),
        reviewed: false,
        conditionConfirmed: false,
        fromFrame: from.frame,
        toFrame: to.frame,
        ...(draft.procedure.execution
          ? {
              changeFrame:
                explicitChange ?? Math.floor((from.frame + to.frame) / 2),
            }
          : {}),
        fromRegion:
          sharedRegions.get(step.condition.fromZone) ??
          around(centre(from.box, step.measurement?.point), radius),
        toRegion:
          sharedRegions.get(step.condition.toZone) ??
          around(centre(to.box, step.measurement?.point), radius),
      };
      sharedRegions.set(
        step.condition.fromZone,
        suggestions[step.id].fromRegion!,
      );
      sharedRegions.set(step.condition.toZone, suggestions[step.id].toRegion!);
      priorEnd = to.timestampMs;
    } else
      suggestions[step.id] = {
        ...(v3
          ? {
              evidenceStatus: "unsupported" as const,
              evidenceReason:
                "This action has no usable, ordered source evidence within its own window. Correct its evidence or keep its requirement unsupported.",
            }
          : {}),
        reviewed: false,
        conditionConfirmed: false,
        fromFrame: samples[0]?.frame ?? 0,
        toFrame: samples.at(-1)?.frame ?? 0,
        fromRegion: null,
        toRegion: null,
      };
  }
  return suggestions;
}
/**
 * Self-repair for an unverifiable goal: keep the covered requirements and the
 * steps they (and their prerequisites) need, drop the rest, and repair every
 * reference. Throws when nothing verifiable remains — then only a re-record
 * helps. Never invents coverage; callers re-validate the result.
 */
export function narrowToVerifiableScope(draft: TeachDraft): TeachDraft {
  const next = structuredClone(draft);
  const procedure = next.procedure;
  if (!procedure.execution) throw Error("No executable goal to narrow.");
  const keptRequirements = procedure.execution.requirements.filter(
    (requirement) => requirement.status !== "unsupported",
  );
  const keep = new Set(
    keptRequirements.flatMap((requirement) => requirement.stepIds),
  );
  const byId = new Map(procedure.steps.map((step) => [step.id, step]));
  const stack = [...keep];
  while (stack.length) {
    const step = byId.get(stack.pop()!);
    for (const prerequisite of step?.prerequisites ?? [])
      if (!keep.has(prerequisite) && byId.has(prerequisite)) {
        keep.add(prerequisite);
        stack.push(prerequisite);
      }
  }
  procedure.steps = procedure.steps.filter((step) => keep.has(step.id));
  if (!procedure.steps.length)
    throw Error(
      "Nothing verifiable to keep. Re-record showing only the visible movement.",
    );
  for (const step of procedure.steps) {
    step.prerequisites = step.prerequisites.filter((id) => keep.has(id));
    step.forbiddenTransitions = step.forbiddenTransitions.filter((rule) =>
      rule.unlessVerified.every((id) => keep.has(id)),
    );
  }
  procedure.execution.requirements = keptRequirements
    .map((requirement) => ({
      ...requirement,
      stepIds: requirement.stepIds.filter((id) => keep.has(id)),
    }))
    .filter(
      (requirement) =>
        requirement.status !== "covered" || requirement.stepIds.length > 0,
    );
  if (
    !procedure.execution.requirements.some(
      (requirement) => requirement.status === "covered",
    )
  )
    throw Error(
      "Nothing verifiable to keep. Re-record showing only the visible movement.",
    );
  procedure.execution.goalStepIds = procedure.execution.goalStepIds.filter(
    (id) => keep.has(id),
  );
  if (!procedure.execution.goalStepIds.length)
    procedure.execution.goalStepIds = [
      procedure.steps[procedure.steps.length - 1].id,
    ];
  next.notes = next.notes.filter((note) => keep.has(note.stepId));
  return next;
}
/** A small set of distinct source moments, not hundreds of nearly-identical frames. */
export function keyFrames(
  context: TeachContext,
  frames: number[],
  extras: number[] = [],
) {
  const actual = [...new Set([...extras, ...frames])]
    .filter(
      (f) =>
        Number.isInteger(f) &&
        f >= 0 &&
        f < context.lesson.media.frameTimesMs.length,
    )
    .sort((a, b) => a - b);
  const picked: number[] = [];
  for (const frame of actual)
    if (
      extras.includes(frame) ||
      !picked.some(
        (f) =>
          Math.abs(
            context.lesson.media.frameTimesMs[f] -
              context.lesson.media.frameTimesMs[frame],
          ) < 1000,
      )
    )
      picked.push(frame);
  if (picked.length <= 8) return picked;
  const important = [...new Set(extras)]
    .filter((f) => actual.includes(f))
    .slice(0, 10);
  const others = picked.filter((f) => !important.includes(f));
  const slots = 10 - important.length;
  const filler =
    slots > 0
      ? others
          .filter(
            (_, i) => i % Math.max(1, Math.ceil(others.length / slots)) === 0,
          )
          .slice(0, slots)
      : [];
  return [...important, ...filler].sort((a, b) => a - b);
}

export function reviewBlockers(
  draft: TeachDraft,
  context: TeachContext,
  checks: Record<string, SuggestedCheck>,
): string[] {
  const issues: string[] = [];
  for (const requirement of draft.procedure.execution?.requirements ?? [])
    if (requirement.status === "unsupported")
      issues.push(`Unsupported required work: ${requirement.description}`);
  if (draft.procedure.execution?.schemaVersion === 3)
    issues.push(
      "V3 approval and Practice execution are deferred to Phase 2; this procedure remains a reviewable draft.",
    );
  for (const [index, step] of draft.procedure.steps.entries()) {
    const check = checks[step.id],
      label = `Step ${index + 1}`;
    if (check?.evidenceStatus === "unsupported")
      issues.push(`${label} — ${check.evidenceReason}`);
    if (!check?.fromRegion || !check.toRegion)
      issues.push(
        `${label} — starting/target zones are missing. Recheck suggestions or choose clear moments.`,
      );
    if (!check?.reviewed)
      issues.push(`${label} — check “I reviewed this step”.`);
    if (!check?.conditionConfirmed)
      issues.push(`${label} — confirm the visible zone entry.`);
  }
  if (
    draft.procedure.steps.every(
      (s) => checks[s.id]?.fromRegion && checks[s.id]?.toRegion,
    )
  ) {
    try {
      validateReviewEvidence(
        draft,
        draft.procedure.steps.map((s) => ({ stepId: s.id, ...checks[s.id] })),
        context,
      );
    } catch (error) {
      issues.push(
        error instanceof Error && error.name !== "ZodError"
          ? error.message
          : "The selected moments or zones are invalid. Check each before/after selection and zone boundary.",
      );
    }
  }
  return issues;
}
export function reviewErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "ZodError") {
    // Never swallow the cause: name the first failing field so the creator
    // (and diagnostics) can see what is actually invalid.
    const issues = (
      error as unknown as {
        issues?: Array<{ path: Array<string | number>; message: string }>;
      }
    ).issues;
    const first = issues?.[0];
    const where = [...(first?.path ?? [])].join(".");
    const detail = first
      ? ` Problem: ${where ? `${where} — ` : ""}${first.message}.`
      : "";
    return `The review is incomplete or contains invalid fields.${detail} Check the approval checklist and each step's starting/target zones.`;
  }
  return error instanceof Error
    ? error.message
    : "Approval failed. Check the review and try again.";
}
