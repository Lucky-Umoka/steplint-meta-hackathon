import { actionWindowIssue, trustedTrack } from "./source-evidence";
import {
  validateReviewEvidence,
  type TeachContext,
  type TeachDraft,
  type Region,
} from "./schema";
export type SuggestedCheck = {
  evidenceStatus?: "supported" | "unsupported";
  evidenceReason?: string;
  /** The flag is only about suggested zone regions; editing a zone clears it. */
  zoneConflict?: true;
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
/**
 * Paid run 17: a zone made from one instant (the start frame, where the hand
 * already grips the object) missed the object's own resting position by
 * 0.013-0.03. A zone covers where the object was seen RESTING at that end of
 * the move: the reliable, contiguous measured points next to the endpoint
 * (before the start, after the result) within REST_SPREAD of it, plus the
 * usual radius. Bounded, so a zone never stretches toward the other zone.
 */
const REST_SPREAD = 0.025;
function restRegion(
  trusted: { frame: number; box: Region }[],
  endpoint: { frame: number; box: Region },
  direction: -1 | 1,
  point: "center" | "bottom_center" | undefined,
  radius: number,
): Region {
  const p = centre(endpoint.box, point);
  const points = [p];
  const index = trusted.findIndex((s) => s.frame === endpoint.frame);
  if (index >= 0)
    for (
      let i = index + direction;
      i >= 0 && i < trusted.length;
      i += direction
    ) {
      const q = centre(trusted[i].box, point);
      if (Math.hypot(q.x - p.x, q.y - p.y) > REST_SPREAD) break;
      points.push(q);
    }
  return {
    left: Math.max(0, Math.min(...points.map((q) => q.x)) - radius),
    top: Math.max(0, Math.min(...points.map((q) => q.y)) - radius),
    right: Math.min(1, Math.max(...points.map((q) => q.x)) + radius),
    bottom: Math.min(1, Math.max(...points.map((q) => q.y)) + radius),
  };
}
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
  const endpoints = new Map<
    string,
    {
      from: { x: number; y: number };
      to: { x: number; y: number };
      radius: number;
    }
  >();
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
    // V3 source reliability is the Teach policy (trustedTrack), not the
    // Practice threshold: a steady rest scoring >= 0.5 is a valid start/result.
    const reliableFrames = new Set(
      trustedTrack(
        context.tracking.find(
          (t) => t.componentId === step.condition.componentId,
        )?.samples ?? [],
        context.lesson.media.frameTimesMs,
      ).map((s) => s.frame),
    );
    const validWindow =
      !v3 ||
      (!!window &&
        window.startFrame < window.changeFrame &&
        window.changeFrame < window.resultFrame &&
        [window.startFrame, window.changeFrame, window.resultFrame].every(
          (frame) => ownFrames.includes(frame) && reliableFrames.has(frame),
        ));
    let best: { i: number; j: number; distance: number } | null = null;
    if (v3 && validWindow) {
      // A V3 action is exactly its own window: at-rest start and result with
      // tracking gaps no longer than the policy (same rule as compile/approval).
      const i = samples.findIndex((sample) => sample.frame === start),
        j = samples.findIndex((sample) => sample.frame === end);
      const trusted = trustedTrack(
        context.tracking.find(
          (t) => t.componentId === step.condition.componentId,
        )?.samples ?? [],
        context.lesson.media.frameTimesMs,
      );
      if (
        i >= 0 &&
        j > i &&
        samples[i].timestampMs >= priorEnd &&
        !actionWindowIssue(trusted, start, end)
      ) {
        const a = centre(samples[i].box, step.measurement?.point),
          b = centre(samples[j].box, step.measurement?.point),
          distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance >= 0.05) best = { i, j, distance };
      }
    }
    for (let i = 0; i < samples.length; i++) {
      if (
        v3 ||
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
      const restTrack = trustedTrack(
        context.tracking.find(
          (t) => t.componentId === step.condition.componentId,
        )?.samples ?? [],
        context.lesson.media.frameTimesMs,
      );
      const from = samples[best.i],
        to = samples[best.j],
        // SAM (Teach) and the live tracker disagree on a box edge by 15-18%
        // of the object's height (paid runs 16-17), so the zone tolerance
        // scales with the object: 0.2 x its height, at least 0.04, never more
        // than a quarter of the move (start and target stay apart).
        radius = Math.min(
          best.distance / 4,
          Math.max(
            0.04,
            0.2 *
              Math.max(
                from.box.bottom - from.box.top,
                to.box.bottom - to.box.top,
              ),
          ),
        );
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
          (v3
            ? restRegion(restTrack, from, -1, step.measurement?.point, radius)
            : around(centre(from.box, step.measurement?.point), radius)),
        toRegion:
          sharedRegions.get(step.condition.toZone) ??
          (v3
            ? restRegion(restTrack, to, 1, step.measurement?.point, radius)
            : around(centre(to.box, step.measurement?.point), radius)),
      };
      sharedRegions.set(
        step.condition.fromZone,
        suggestions[step.id].fromRegion!,
      );
      sharedRegions.set(step.condition.toZone, suggestions[step.id].toRegion!);
      endpoints.set(step.id, {
        from: centre(from.box, step.measurement?.point),
        to: centre(to.box, step.measurement?.point),
        radius,
      });
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
  reconcileSharedZones(draft, suggestions, sharedRegions, endpoints);
  return suggestions;
}
const inside = (r: Region, p: { x: number; y: number }) =>
  p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
/**
 * Approval binds one region per zone ID. When a zone ID is used at several
 * observed places (for example two different objects starting from
 * "table centre"), the first suggested region may not
 * contain them all. Only such zones are widened to cover step endpoints; zones that already work keep their exact region. A step
 * whose zones then overlap, or whose start already lies in its target, is
 * marked unsupported with the reason, never silently approved.
 */
function reconcileSharedZones(
  draft: TeachDraft,
  suggestions: Record<string, SuggestedCheck>,
  regions: Map<string, Region>,
  endpoints: Map<
    string,
    {
      from: { x: number; y: number };
      to: { x: number; y: number };
      radius: number;
    }
  >,
) {
  const uses = new Map<
    string,
    { points: { x: number; y: number }[]; radius: number }
  >();
  const addUse = (
    zone: string,
    point: { x: number; y: number },
    radius: number,
  ) => {
    const entry = uses.get(zone) ?? { points: [], radius };
    entry.points.push(point);
    entry.radius = Math.min(entry.radius, radius);
    uses.set(zone, entry);
  };
  for (const step of draft.procedure.steps) {
    const e = endpoints.get(step.id);
    if (!e) continue;
    addUse(step.condition.fromZone, e.from, e.radius);
    addUse(step.condition.toZone, e.to, e.radius);
  }
  const execution = draft.procedure.execution;
  // Scene predicates validate against endpoint-derived regions; they cannot widen them.
  const widened = new Set<string>();
  for (const [zone, { points, radius }] of uses) {
    const current = regions.get(zone);
    if (current && points.every((p) => inside(current, p))) continue;
    regions.set(zone, {
      left: Math.max(0, Math.min(...points.map((p) => p.x)) - radius),
      top: Math.max(0, Math.min(...points.map((p) => p.y)) - radius),
      right: Math.min(1, Math.max(...points.map((p) => p.x)) + radius),
      bottom: Math.min(1, Math.max(...points.map((p) => p.y)) + radius),
    });
    widened.add(zone);
  }
  if (!widened.size) return;
  for (const step of draft.procedure.steps) {
    const e = endpoints.get(step.id);
    const check = suggestions[step.id];
    if (!e || !check) continue;
    const { fromZone, toZone } = step.condition;
    if (!widened.has(fromZone) && !widened.has(toZone)) continue;
    const fromRegion = regions.get(fromZone)!,
      toRegion = regions.get(toZone)!;
    check.fromRegion = fromRegion;
    check.toRegion = toRegion;
    const overlap =
      Math.max(fromRegion.left, toRegion.left) <
        Math.min(fromRegion.right, toRegion.right) &&
      Math.max(fromRegion.top, toRegion.top) <
        Math.min(fromRegion.bottom, toRegion.bottom);
    if ((overlap || inside(toRegion, e.from)) && check.evidenceStatus) {
      check.evidenceStatus = "unsupported";
      check.zoneConflict = true;
      const zone = widened.has(fromZone) ? fromZone : toZone;
      const users = [
        ...draft.procedure.steps
          .filter(
            (s) => s.condition.fromZone === zone || s.condition.toZone === zone,
          )
          .map(
            (s) =>
              `${s.id} (${s.condition.componentId} ${s.condition.fromZone === zone ? "start" : "target"})`,
          ),
        ...(execution?.schemaVersion === 3
          ? [...execution.initialConditions, ...execution.finalConditions]
              .filter((p) => p.kind === "object_in_zone" && p.zoneId === zone)
              .map((p) => `${p.id} (${p.objectId} scene condition)`)
          : []),
      ];
      check.evidenceReason = `Zone "${zone}" is used at several different places (${users.join(", ")}), so it cannot be one region that keeps this step's start and target apart. Give these places separate zone IDs, or adjust the zones in review.`;
    }
  }
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
/**
 * The human review record for one step. Suggestion-only metadata
 * (evidenceStatus/evidenceReason) is display state and never part of the
 * strict review contract.
 */
export function reviewStepInput(stepId: string, check: SuggestedCheck) {
  return {
    stepId,
    reviewed: check.reviewed,
    conditionConfirmed: check.conditionConfirmed,
    fromFrame: check.fromFrame,
    toFrame: check.toFrame,
    ...(check.changeFrame !== undefined
      ? { changeFrame: check.changeFrame }
      : {}),
    fromRegion: check.fromRegion,
    toRegion: check.toRegion,
  };
}
/**
 * Whether the suggested moments and zones (the same ones the review screen
 * shows) pass approval's evidence checks. Human review flags are not implied.
 * The compiler uses the reason to drive its one correction request; a draft
 * that still fails reaches review with that step flagged, where a reviewer can
 * adjust zones. It is never approved without passing these checks.
 */
export function reviewEvidenceIssue(
  draft: TeachDraft,
  context: TeachContext,
): string | null {
  try {
    assertReviewableEvidence(draft, context);
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Review evidence check failed.";
  }
}
export function assertReviewableEvidence(
  draft: TeachDraft,
  context: TeachContext,
) {
  if (draft.procedure.execution?.schemaVersion !== 3) return;
  const checks = suggestReviews(draft, context);
  const unsupported = draft.procedure.steps
    .filter((step) => checks[step.id]?.evidenceStatus === "unsupported")
    .map((step) => `${step.id}: ${checks[step.id].evidenceReason}`);
  if (unsupported.length)
    throw Error(`Review evidence: ${unsupported.join(" ")}`);
  try {
    validateReviewEvidence(
      draft,
      draft.procedure.steps.map((step) =>
        reviewStepInput(step.id, {
          ...checks[step.id],
          reviewed: true,
          conditionConfirmed: true,
        }),
      ),
      context,
    );
  } catch (error) {
    throw Error(
      `Review evidence: ${error instanceof Error ? error.message : "suggested moments and zones do not pass approval checks"}`,
    );
  }
}
