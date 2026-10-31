import { z } from "zod";
import {
  clearRelation,
  matchesRelation,
  RelationFrameSchema,
  RelationPlanSchema,
  type RelationPlan,
} from "./relations";

export const RelationWitnessSchema = z.strictObject({
  stepId: z.string(),
  objectIdentity: z.enum(["same", "ambiguous"]),
  anchorIdentity: z.enum(["same", "ambiguous"]),
  sceneAlignment: z.enum(["stable", "changed", "unknown"]),
  contradictingEvidence: z.boolean(),
  description: z.string().min(1).max(400),
});
export const RelationWindowSchema = z
  .strictObject({
    id: z.string().min(1).max(100),
    epoch: z.string().min(1).max(100),
    frames: z.array(RelationFrameSchema).length(3),
    witnesses: z.array(RelationWitnessSchema).min(1).max(12),
  })
  .superRefine((w, ctx) => {
    if (
      w.frames.some((f, i) => i > 0 && f.frame <= w.frames[i - 1].frame) ||
      w.frames[2].frame - w.frames[0].frame > 8000
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Evidence must contain three ordered observations within eight seconds.",
      });
    if (new Set(w.witnesses.map((w) => w.stepId)).size !== w.witnesses.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate correspondence witnesses.",
      });
  });
export type RelationWindow = z.infer<typeof RelationWindowSchema>;
export type RelationOutcome =
  | "waiting"
  | "verified"
  | "violation"
  | "needs_verification";
export type RelationSession = {
  goalStepIds: string[];
  plan: RelationPlan;
  epoch: string;
  states: Record<string, RelationOutcome>;
  verifiedAt: Record<string, number>;
  seen: Set<string>;
  lastEnd: number;
  finished: boolean;
};
export function createRelationSession(
  input: unknown,
  epoch: string,
  goalStepIds?: string[],
): RelationSession {
  const plan = RelationPlanSchema.parse(input);
  const goals=goalStepIds??plan.goalStepIds??plan.steps.map(s=>s.id);
  if(!goals.length||goals.some(id=>!plan.steps.some(s=>s.id===id)))throw Error("Unknown final goal relationship.");
  return {
    goalStepIds:goals,
    plan,
    epoch,
    states: Object.fromEntries(plan.steps.map((s) => [s.id, "waiting"])),
    verifiedAt: {},
    seen: new Set(),
    lastEnd: -1,
    finished: false,
  };
}
export function relationTransition(
  step: RelationPlan["steps"][number],
  window: RelationWindow,
) {
  const reads = window.frames.map((f) =>
    f.readings.find((r) => r.stepId === step.id),
  );
  const witness = window.witnesses.find((w) => w.stepId === step.id);
  if (
    !witness ||
    witness.objectIdentity !== "same" ||
    (witness.anchorIdentity !== "same" && step.before !== "closed") ||
    witness.sceneAlignment !== "stable" ||
    witness.contradictingEvidence
  )
    return "uncertain" as const;
  const [before, , after] = reads;
  if (!clearRelation(before) || !clearRelation(after))
    return "uncertain" as const;
  // Require repeated visible result evidence, not an isolated matching pose.
  if (!clearRelation(reads[1]) || !((matchesRelation(step,reads[1]!,"after")&&matchesRelation(step,after!,"after"))||(matchesRelation(step,reads[1]!,"before")&&matchesRelation(step,after!,"before"))))
    return "uncertain" as const;
  if (!matchesRelation(step,before!,"before")) return "no_before" as const;
  if (matchesRelation(step,after!,"before")) return "unchanged" as const;
  if (!matchesRelation(step,after!,"after")) return "wrong_relation" as const;
  if (window.frames[2].frame - window.frames[1].frame < 400)
    return "uncertain" as const;
  return "transition" as const;
}
/** Rules, temporal prerequisites, duplicate handling and outcomes stay deterministic. */
export function evaluateRelationWindow(
  session: RelationSession,
  input: unknown,
) {
  const window = RelationWindowSchema.parse(input);
  if (
    window.epoch !== session.epoch ||
    session.seen.has(window.id) ||
    window.frames[2].frame <= session.lastEnd ||
    session.finished
  )
    return [];
  if (session.seen.size >= 1000)
    throw Error("Start a new bounded practice session.");
  session.seen.add(window.id);
  session.lastEnd = window.frames[2].frame;
  const events: { stepId: string; state: RelationOutcome; message: string }[] =
    [];
  // Evaluate against prerequisite state at the beginning of the window. One
  // window cannot invent the chronology of two concurrent/unseen transitions.
  const prior = { ...session.verifiedAt };
  const activeAtStart=session.plan.steps.find(s=>session.states[s.id]!=="verified")?.id;
  for (const [i, step] of session.plan.steps.entries()) {
    if (
      session.states[step.id] === "verified" ||
      session.states[step.id] === "violation"
    )
      continue;
    const outcome = relationTransition(step, window);
    if (outcome === "transition") {
      const ordered = session.plan.steps
        .slice(0, i)
        .every(
          (s) =>
            prior[s.id] !== undefined && prior[s.id] <= window.frames[0].frame,
        );
      const state = ordered ? "verified" : "violation";
      session.states[step.id] = state;
      if (ordered) session.verifiedAt[step.id] = window.frames[2].frame;
      events.push({
        stepId: step.id,
        state,
        message: ordered ? step.instruction : step.correction,
      });
    } else if (
      activeAtStart === step.id
    ) {
      const state =
        outcome === "wrong_relation"
          ? "violation"
          : outcome === "unchanged"
            ? "waiting"
            : "needs_verification";
      session.states[step.id] = state;
      events.push({
        stepId: step.id,
        state,
        message:
          state === "violation"
            ? step.correction
            : state === "waiting"
              ? step.instruction
              : "Show a clear starting state and keep the result visible. This action has not been verified.",
      });
    }
  }
  const finalRelations = new Map<string, RelationPlan["steps"][number]>();
  session.plan.steps.filter(s=>session.goalStepIds.includes(s.id)).forEach((s) =>
    finalRelations.set(`${s.objectId}:${s.anchorId}`, s),
  );
  session.finished =
    session.plan.steps.every((s) => session.states[s.id] === "verified") &&
    [...finalRelations.values()].every((s) => {
      const r = window.frames[2].readings.find((r) => r.stepId === s.id);
      return clearRelation(r) && matchesRelation(s,r!,"after");
    });
  return events;
}

/** A correction must visibly restore the failed rule's before relation. */
export function recoverRelation(
  session: RelationSession,
  window: RelationWindow,
) {
  if (window.epoch !== session.epoch) return false;
  const index = session.plan.steps.findIndex(
    (s) => session.states[s.id] === "violation",
  );
  if (index < 0) return false;
  const step = session.plan.steps[index];
  const reads = window.frames
    .slice(1)
    .map((f) => f.readings.find((r) => r.stepId === step.id));
  if (!reads.every((r) => clearRelation(r) && matchesRelation(step,r!,"before")))
    return false;
  const witness = window.witnesses.find((w) => w.stepId === step.id);
  if (
    !witness ||
    witness.objectIdentity !== "same" ||
    (witness.anchorIdentity !== "same" && step.before !== "closed") ||
    witness.sceneAlignment !== "stable" ||
    witness.contradictingEvidence
  )
    return false;
  for (const s of session.plan.steps.slice(index)) {
    session.states[s.id] = "waiting";
    delete session.verifiedAt[s.id];
  }
  session.finished = false;
  return true;
}
