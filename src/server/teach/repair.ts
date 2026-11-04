import "server-only";
import { z } from "zod";
import type { TeachContext, TeachDraft } from "../../teach/schema";
import { sourceEvidenceCatalog } from "../../teach/source-evidence";
import { sparkStructured } from "../meta/spark";

/**
 * Felicity draft repair (owner override 2026-11-04, docs/new_final_phases).
 * When drafting is rejected or leaves review issues, Felicity makes ONE
 * bounded Muse Spark Open request for a tiny plan: ordered steps that each
 * name an object and the INDEX of one of that object's measured movement
 * windows, plus the goal. Deterministic code builds the full V3 draft from
 * the plan, so every frame comes from the measured catalog; the existing
 * validators then accept or reject it. The model proposes; code validates.
 */
const id = z.string().min(1).max(40);
export const RepairPlanSchema = z.strictObject({
  title: z.string().min(1).max(100),
  goal: z.string().min(1).max(300),
  steps: z
    .array(
      z.strictObject({
        objectId: id,
        window: z.number().int().min(0).max(19),
        instruction: z.string().min(1).max(200),
      }),
    )
    .min(1)
    .max(8),
  /** Narrated work with no measured window: kept as unsupported, never invented. */
  unsupported: z.array(z.string().min(1).max(200)).max(6),
});
export type RepairPlan = z.infer<typeof RepairPlanSchema>;

export function repairEvidence(
  context: TeachContext,
  issues: string,
  priorDraft: unknown,
) {
  const catalog = sourceEvidenceCatalog(context);
  const times = context.lesson.media.frameTimesMs;
  return {
    transcript: context.lesson.transcript.turns.slice(0, 60),
    objects: catalog.map((entry) => ({
      objectId: entry.componentId,
      description:
        context.selections.find((s) => s.id === entry.componentId)?.description ?? entry.componentId,
      measuredMovementWindows: entry.displacementWindows.map((w, index) => ({
        window: index,
        startMs: times[w.startFrame],
        resultMs: times[w.resultFrame],
        displacement: w.displacement,
      })),
      whyNoMovementWindow: entry.movementDiagnosis,
    })),
    validatorIssues: issues.slice(0, 2000),
    priorGoal:
      priorDraft && typeof priorDraft === "object" && "procedure" in priorDraft
        ? JSON.stringify(
            (priorDraft as { procedure?: { execution?: { goal?: unknown } } }).procedure?.execution
              ?.goal ?? null,
          ).slice(0, 300)
        : null,
  };
}

export const REPAIR_INSTRUCTIONS =
  "You are Felicity, StepLint's repair coordinator. The first procedure draft failed deterministic validation. Rebuild the procedure as a SHORT plan from the measured evidence only. Cross-check the narration (what the expert said and in what order) with each object's measuredMovementWindows (when the object measurably moved). Return ordered steps in time order; each step names objectId and the index `window` of ONE of that object's measuredMovementWindows that matches a narrated or clearly intended action, and a short learner instruction. Use each window at most once. Ignore windows that are only small adjustments unrelated to the narration. The goal must describe where the moved objects END UP after the last step. If narrated required work has no measured window, list it in `unsupported` (never assign it a window). Never invent objects, windows or frames. Return only JSON.";

/** Build a complete V3 wire draft from a plan; frames come only from the catalog. */
export function buildRepairedWire(
  context: TeachContext,
  plan: RepairPlan,
  video: boolean,
) {
  const catalog = sourceEvidenceCatalog(context);
  const times = context.lesson.media.frameTimesMs;
  const lessonId = context.lesson.lessonId;
  const name = (objectId: string) =>
    context.selections.find((s) => s.id === objectId)?.description ?? objectId;
  const chosen = plan.steps.map((step) => {
    const entry = catalog.find((e) => e.componentId === step.objectId);
    const w = entry?.displacementWindows[step.window];
    if (!entry || !w)
      throw Error(`Repair named no measured window ${step.window} for ${step.objectId}.`);
    const between = entry.trustedFrames.filter((f) => f > w.startFrame && f < w.resultFrame);
    if (!between.length) throw Error(`No reliable change frame inside window ${step.window} of ${step.objectId}.`);
    const changeFrame = between[Math.floor(between.length / 2)];
    return { ...step, startFrame: w.startFrame, changeFrame, resultFrame: w.resultFrame };
  });
  chosen.sort((a, b) => a.startFrame - b.startFrame);
  const seen = new Set<string>();
  for (const step of chosen) {
    const key = `${step.objectId}:${step.window}`;
    if (seen.has(key)) throw Error("Repair used one measured window twice.");
    seen.add(key);
  }
  for (let i = 1; i < chosen.length; i++)
    if (chosen[i].startFrame < chosen[i - 1].resultFrame)
      throw Error("Repair steps overlap in time.");
  // Each object's positions chain through its own zones: start, after step 1, ...
  const zoneOf = new Map<string, number>();
  const zones: { id: string; description: string }[] = [];
  const zoneId = (objectId: string, k: number) => `zone-${objectId}-${k}`;
  const steps = chosen.map((step, i) => {
    const k = zoneOf.get(step.objectId) ?? 0;
    if (k === 0)
      zones.push({ id: zoneId(step.objectId, 0), description: `Where ${name(step.objectId)} starts` });
    zones.push({
      id: zoneId(step.objectId, k + 1),
      description: `Where ${name(step.objectId)} rests after step ${i + 1}`,
    });
    zoneOf.set(step.objectId, k + 1);
    const source = {
      sourceId: lessonId,
      timestampMs: times[step.startFrame],
      description: `Measured start of step ${i + 1}`,
    };
    return {
      id: `step-${i + 1}`,
      description: step.instruction,
      prerequisites: i ? [`step-${i}`] : [],
      condition: {
        kind: "enters_zone" as const,
        componentId: step.objectId,
        fromZone: zoneId(step.objectId, k),
        toZone: zoneId(step.objectId, k + 1),
        minimumConfidence: 0.9,
      },
      forbiddenTransitions: [],
      source,
      recovery: {
        instruction: `Put ${name(step.objectId)} back where this step starts, then repeat it.`,
        source,
      },
      execution: {
        requiredObjectIds: [step.objectId],
        capability: "zone_transition" as const,
        supportedClaim: `${name(step.objectId)} moves between the measured positions`,
        evidenceWindow: {
          startFrame: step.startFrame,
          changeFrame: step.changeFrame,
          resultFrame: step.resultFrame,
        },
      },
    };
  });
  const movers = [...new Set(chosen.map((s) => s.objectId))];
  const lastStepOf = (objectId: string) =>
    steps.filter((s) => s.condition.componentId === objectId).at(-1)!;
  const finalConditions = movers.map((objectId) => ({
    id: `final-${objectId}`,
    kind: "object_in_zone" as const,
    objectId,
    zoneId: lastStepOf(objectId).condition.toZone,
    evidenceFrames: [lastStepOf(objectId).execution.evidenceWindow.resultFrame],
  }));
  const initialConditions = movers.map((objectId) => {
    const first = steps.find((s) => s.condition.componentId === objectId)!;
    return {
      id: `initial-${objectId}`,
      kind: "object_in_zone" as const,
      objectId,
      zoneId: first.condition.fromZone,
      evidenceFrames: [first.execution.evidenceWindow.startFrame],
    };
  });
  const requirements = [
    {
      id: "req-goal",
      description: plan.goal,
      status: "covered" as const,
      capability: "zone_transition" as const,
      stepIds: steps.map((s) => s.id),
      goalPredicateIds: finalConditions.map((f) => f.id),
      reason: "Measured movement windows chosen by Felicity and validated by code",
    },
    ...plan.unsupported.map((description, i) => ({
      id: `req-unsupported-${i + 1}`,
      description,
      status: "unsupported" as const,
      capability: "unsupported" as const,
      stepIds: [],
      goalPredicateIds: [],
      reason: "Narrated, but no measured movement window exists for it",
    })),
  ];
  const pick = (frames: number[]) =>
    frames.length <= 6
      ? frames
      : Array.from({ length: 6 }, (_, i) => frames[Math.round((i * (frames.length - 1)) / 5)]);
  const components = context.selections.map((selection) => {
    const entry = catalog.find((e) => e.componentId === selection.id)!;
    const moves = movers.includes(selection.id);
    return {
      id: selection.id,
      description: selection.description,
      execution: {
        role: moves ? ("required" as const) : ("supporting" as const),
        roleReason: moves
          ? "Moved in a measured step"
          : "Visible reference; not moved in any measured step",
        motion: moves ? ("movable" as const) : ("stationary" as const),
        firstRequiredAt: moves ? ("initial" as const) : ("never" as const),
        referenceFrames: pick(entry.trustedFrames),
      },
    };
  });
  const lastResult = Math.max(...steps.map((s) => s.execution.evidenceWindow.resultFrame));
  return {
    ...(video
      ? {
          videoReview: {
            actions: [
              ...steps.map((s, i) => ({
                id: `action-${i + 1}`,
                description: s.description,
                objectIds: [s.condition.componentId],
                requirementIds: ["req-goal"],
                stepIds: [s.id],
                evidenceWindow: s.execution.evidenceWindow,
                visualSupport: "visible" as const,
                coverage: "represented" as const,
                reason: "Measured movement window",
              })),
              ...plan.unsupported.map((description, i) => ({
                id: `action-unsupported-${i + 1}`,
                description,
                objectIds: [],
                requirementIds: [`req-unsupported-${i + 1}`],
                stepIds: [],
                evidenceWindow: null,
                visualSupport: "unclear" as const,
                coverage: "unsupported" as const,
                reason: "No measured movement window",
              })),
            ],
            goal: {
              description: plan.goal,
              requirementIds: requirements.map((r) => r.id),
              evidenceFrames: [lastResult],
              limitations: ["Built from measured movement windows only."],
            },
          },
        }
      : {}),
    procedure: {
      id: lessonId,
      version: 1,
      title: plan.title,
      approval: null,
      components,
      zones,
      steps,
      execution: {
        schemaVersion: 3 as const,
        goal: plan.goal,
        goalStepIds: movers.map((m) => lastStepOf(m).id),
        requirements,
        initialConditions,
        finalConditions,
      },
    },
    notes: steps.map((s) => ({
      stepId: s.id,
      explanation: "Measured movement window chosen by Felicity and validated by code.",
      candidateErrors: [],
      uncertainties: ["Reviewer confirms the measured moments match the demonstration."],
      supportingFrames: [
        s.execution.evidenceWindow.startFrame,
        s.execution.evidenceWindow.changeFrame,
        s.execution.evidenceWindow.resultFrame,
      ],
    })),
  };
}

/** The one bounded repair request. */
export async function requestRepairPlan(
  context: TeachContext,
  issues: string,
  priorDraft: unknown,
  videoBase64: string | undefined,
  signal: AbortSignal,
): Promise<RepairPlan> {
  const result = await sparkStructured({
    instructions: REPAIR_INSTRUCTIONS,
    text: JSON.stringify(repairEvidence(context, issues, priorDraft)).slice(0, 27_000),
    videoBase64,
    schema: RepairPlanSchema,
    name: "FelicityDraftRepair",
    maxTokens: 8000,
    signal,
  });
  return RepairPlanSchema.parse(result.data);
}
export type RepairedDraft = TeachDraft;
