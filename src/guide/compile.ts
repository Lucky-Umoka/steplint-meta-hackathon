import { z } from "zod";
import {
  ConditionSchema,
  GuideSchema,
  type Guide,
  type GuideObservation,
  type GuideStep,
} from "./schema";
import {
  AnalysisDraftSchema,
  type AnalysisDraft,
  type DraftObject,
  type DraftStep,
  type StepFailureFrame,
  type UnresolvedStep,
} from "./draft";
import { changeMetric } from "./evaluator";
import type { TeachContext } from "../teach/schema";
const short = z.string().min(1).max(1600);
export const CompilerOutputSchema = z.strictObject({
  title: z.string().min(1).max(180),
  goal: short,
  initialInstruction: short,
  methodName: short,
  objects: z
    .array(
      z.strictObject({
        id: z.string(),
        label: z.string().min(1).max(100),
        description: short,
        initiallyVisible: z.boolean(),
      }),
    )
    .min(1)
    .max(6),
  steps: z
    .array(
      z.strictObject({
        id: z.string(),
        instruction: short,
        explanation: short,
        correction: short,
        objectId: z.string(),
        anchorId: z.string().nullable(),
        kind: z.enum(["movement", "separation"]),
        requiredVisibleAfter: z.array(z.string()).max(6),
        startFrame: z.number().int().nonnegative(),
        changeFrame: z.number().int().nonnegative(),
        endFrame: z.number().int().nonnegative(),
        turnIds: z.array(z.number().int().nonnegative()).max(100),
        uncertainties: z.array(short).max(8),
      }),
    )
    .min(1)
    .max(12),
  coverage: z
    .array(
      z.strictObject({
        instruction: short,
        status: z.enum(["included", "outside_goal", "unresolved"]),
        reason: short,
      }),
    )
    .min(1)
    .max(24),
  goalFrame: z.number().int().nonnegative(),
  goalStepIds: z.array(z.string()).min(1).max(12),
});
export function compileGuide(
  input: unknown,
  context: TeachContext,
): Guide | AnalysisDraft {
  const output = CompilerOutputSchema.parse(input),
    media = context.lesson.media;
  const size = media.info.video;
  if (!size) throw Error("Missing source video.");
  const known = new Set(context.selections.map((s) => s.id));
  if (output.objects.some((o) => !known.has(o.id)))
    throw Error("The draft invented an untracked object.");
  const observation = (frame: number): GuideObservation => ({
    id: `source-${frame}`,
    timestampMs: media.frameTimesMs[frame],
    cameraEpoch: "source",
    objects: context.tracking.map((t) => {
      const s = t.samples.find((s) => s.frame === frame);
      return {
        objectId: t.componentId,
        quality:
          s && s.confidence !== null && s.confidence >= 0.9
            ? "observed"
            : "missing",
        box: s?.box ?? null,
        score: s?.confidence ?? null,
      };
    }),
  });
  const used = new Set(
    output.steps.flatMap((step) => [
      step.objectId,
      ...(step.anchorId ? [step.anchorId] : []),
      ...step.requiredVisibleAfter,
    ]),
  );
  const proposedIds = new Set(output.objects.map((o) => o.id));
  const frameCount = media.frameTimesMs.length;
  const objects: DraftObject[] = output.objects
    .filter((object) => used.has(object.id))
    .map((o) => {
      const selection = context.selections.find((s) => s.id === o.id);
      const track = context.tracking.find((t) => t.componentId === o.id);
      const sample =
        track?.samples.find(
          (s) =>
            s.frame === selection?.frame &&
            s.confidence !== null &&
            s.confidence >= 0.9,
        ) ??
        track?.samples.find(
          (s) => s.confidence !== null && s.confidence >= 0.9,
        );
      const initiallyVisible = observation(
        output.steps[0].startFrame,
      ).objects.some(
        (detection) =>
          detection.objectId === o.id && detection.quality === "observed",
      );
      if (!sample) {
        const scores = (track?.samples ?? [])
          .map((s) => s.confidence)
          .filter((c): c is number => c !== null);
        const best = scores.length ? Math.max(...scores) : null;
        return {
          ...o,
          initiallyVisible,
          sourceFrame: null,
          sourceBox: null,
          appearance: null,
          unresolved: {
            objectId: o.id,
            label: o.label,
            code: "no_reliable_geometry" as const,
            message: `No reliable outline for ${o.label}: best provider score ${best === null ? "none" : best.toFixed(3)} across ${track?.samples.length ?? 0} tracked samples; 0.90 is required. Correct the proposed mark or use a clearer view.`,
            candidateFrame: selection?.frame ?? null,
            checkedSamples: track?.samples.length ?? 0,
            bestScore: best,
          },
        };
      }
      return {
        ...o,
        initiallyVisible,
        sourceFrame: sample.frame,
        sourceBox: sample.box,
        appearance: null,
        unresolved: null,
      };
    });
  const steps: DraftStep[] = output.steps.map((s, i) => {
    const base = {
      id: s.id,
      instruction: s.instruction,
      explanation: s.explanation,
      correction: s.correction,
      prerequisites: i ? [output.steps[i - 1].id] : [],
      uncertainties: [...s.uncertainties],
    };
    const issue = (
      code: UnresolvedStep["code"],
      message: string,
      extra?: Pick<
        UnresolvedStep,
        "frames" | "failedFrames" | "objectIds" | "measuredChange"
      >,
    ): UnresolvedStep => ({ stepId: s.id, code, message, ...extra });
    if (
      s.endFrame >= frameCount ||
      s.startFrame >= s.endFrame ||
      s.changeFrame < s.startFrame ||
      s.changeFrame > s.endFrame
    )
      return {
        ...base,
        condition: null,
        evidence: null,
        supported: false,
        unresolved: [
          issue(
            "invalid_interval",
            `Step ${s.id} needs ordered start, change and result frames inside this ${frameCount}-frame clip.`,
          ),
        ],
      };
    const evidence = {
      startFrame: s.startFrame,
      changeFrame: s.changeFrame,
      endFrame: s.endFrame,
      startMs: media.frameTimesMs[s.startFrame],
      endMs: media.frameTimesMs[s.endFrame],
      turnIds: s.turnIds,
    };
    const refs = [
      s.objectId,
      ...(s.anchorId ? [s.anchorId] : []),
      ...s.requiredVisibleAfter,
    ];
    if (refs.some((r) => !proposedIds.has(r)))
      return {
        ...base,
        condition: null,
        evidence,
        supported: false,
        unresolved: [
          issue(
            "unknown_object",
            `Step ${s.id} names an object that was not tracked in this lesson.`,
          ),
        ],
      };
    const condition = {
      kind: s.kind,
      objectId: s.objectId,
      anchorId: s.anchorId,
      minimumChange: 0.15,
      requiredVisibleAfter: s.requiredVisibleAfter,
    };
    if (!ConditionSchema.safeParse(condition).success)
      return {
        ...base,
        condition: null,
        evidence,
        supported: false,
        unresolved: [
          issue(
            "invalid_condition",
            `Step ${s.id} has an unusable verification rule.`,
          ),
        ],
      };
    const step: DraftStep = {
      ...base,
      condition,
      evidence,
      supported: false,
      unresolved: [],
    };
    const change = changeMetric(
      step as GuideStep,
      observation(s.startFrame),
      observation(s.endFrame),
    );
    const involved = [s.objectId, ...(s.anchorId ? [s.anchorId] : [])];
    const seenBad = new Set<number>();
    let badTotal = 0;
    const badFrames: StepFailureFrame[] = [];
    const continuous = involved
      .map((id) => {
        const byFrame = new Map(
          (
            context.tracking.find((t) => t.componentId === id)?.samples ?? []
          ).map((sample) => [sample.frame, sample] as const),
        );
        let ok = true;
        for (let frame = s.startFrame; frame <= s.endFrame; frame++) {
          const sample = byFrame.get(frame);
          if (sample && sample.confidence !== null && sample.confidence >= 0.9)
            continue;
          ok = false;
          if (!seenBad.has(frame)) {
            seenBad.add(frame);
            badTotal++;
            badFrames.push({
              frame,
              timestampMs: media.frameTimesMs[frame],
              reason: sample ? "low_score" : "missing",
            });
          }
        }
        return ok;
      })
      .every(Boolean);
    const missingIds = s.requiredVisibleAfter.filter(
      (id) =>
        !observation(s.endFrame).objects.some(
          (o) => o.objectId === id && o.quality === "observed",
        ),
    );
    const visible = missingIds.length === 0;
    const failures: UnresolvedStep[] = [];
    if (change === null) {
      const deps = [s.objectId, ...(s.anchorId ? [s.anchorId] : [])];
      const endpoints: StepFailureFrame[] = [s.startFrame, s.endFrame].flatMap(
        (frame) =>
          deps.flatMap((id) => {
            const sample = context.tracking
              .find((t) => t.componentId === id)
              ?.samples.find((entry) => entry.frame === frame);
            if (
              sample &&
              sample.confidence !== null &&
              sample.confidence >= 0.9
            )
              return [];
            return [
              {
                frame,
                timestampMs: media.frameTimesMs[frame],
                reason: (sample
                  ? "low_score"
                  : "missing") as StepFailureFrame["reason"],
                objectId: id,
              },
            ];
          }),
      );
      failures.push(
        issue(
          "metric_unavailable",
          `Step ${s.id} has no usable measurement between its start and result.`,
          endpoints.length
            ? { frames: endpoints, failedFrames: endpoints.length }
            : {},
        ),
      );
    } else if (change < condition.minimumChange)
      failures.push(
        issue(
          "insufficient_change",
          `Step ${s.id} shows no measurable state change between its start and result.`,
          { measuredChange: change },
        ),
      );
    else if (change > 12)
      failures.push(
        issue(
          "implausible_change",
          `Step ${s.id} shows an unphysically large state change between its start and result; its tracking may have snapped to something else.`,
          { measuredChange: change },
        ),
      );
    badFrames.sort((a, b) => a.frame - b.frame);
    if (!continuous)
      failures.push(
        issue(
          "discontinuous_tracking",
          `Step ${s.id} is missing reliable tracking on some frames between its start and result.`,
          { frames: badFrames.slice(0, 60), failedFrames: badTotal },
        ),
      );
    if (!visible)
      failures.push(
        issue(
          "missing_required_visibility",
          `Step ${s.id} does not show a required object in its demonstrated result.`,
          { objectIds: missingIds.slice(0, 6) },
        ),
      );
    if (!failures.length) {
      condition.minimumChange = Math.max(0.15, Math.min(12, change! * 0.65));
      step.supported = true;
    } else {
      step.unresolved = failures;
      step.uncertainties = [
        ...step.uncertainties,
        "This proposed action does not yet have continuous reliable geometry and a measurable state change; it cannot be approved.",
      ].slice(0, 8);
    }
    return step;
  });
  steps.forEach((step, i) => {
    if (i === 0 || !step.evidence) return;
    const prev = steps[i - 1].evidence;
    if (prev && step.evidence.startMs < prev.endMs) {
      step.supported = false;
      step.unresolved.push({
        stepId: step.id,
        code: "invalid_order",
        message: `Step ${step.id} starts before the previous step ends; the demonstrated order cannot be verified as proposed.`,
      });
    }
  });
  const geometry = context.tracking
    .filter((track) => used.has(track.componentId))
    .flatMap((t) =>
      t.samples
        .filter((s) => s.confidence !== null && s.confidence >= 0.9)
        .map((s) => ({
          frame: s.frame,
          objectId: t.componentId,
          box: s.box,
          confidence: s.confidence!,
        })),
    );
  const goalSupported = output.goalStepIds.every((id) => {
    const step = steps.find((s) => s.id === id);
    if (!step?.condition || !step.evidence) return false;
    const change = changeMetric(
      step as GuideStep,
      observation(step.evidence.startFrame),
      observation(output.goalFrame),
    );
    return (
      change !== null &&
      change >= step.condition.minimumChange &&
      step.condition.requiredVisibleAfter.every((id) =>
        observation(output.goalFrame).objects.some(
          (o) => o.objectId === id && o.quality === "observed",
        ),
      )
    );
  });
  const source = {
    durationMs: media.info.durationSeconds * 1000,
    width: size.width,
    height: size.height,
    frameTimesMs: media.frameTimesMs,
    transcript: context.lesson.transcript,
  };
  // Missing structure becomes a reviewable draft; weak-but-complete evidence
  // stays a guide with unsupported steps, exactly as before.
  const structuralGap =
    objects.some((o) => o.unresolved) ||
    steps.some(
      (s) =>
        s.condition === null ||
        s.evidence === null ||
        s.unresolved.some((u) => u.code === "invalid_order"),
    );
  if (structuralGap)
    return AnalysisDraftSchema.parse({
      draftVersion: 1,
      lessonId: context.lesson.lessonId,
      title: output.title,
      goal: output.goal,
      initialInstruction: output.initialInstruction,
      methodName: output.methodName,
      objects,
      steps,
      coverage: output.coverage,
      goalFrame: output.goalFrame,
      goalStepIds: output.goalStepIds,
      goalSupported,
      source,
      images: [],
      geometry,
      approval: null,
    });
  return GuideSchema.parse({
    schemaVersion: 2,
    id: context.lesson.lessonId,
    revision: 1,
    parentRevision: null,
    methodId: "demonstrated",
    methodName: output.methodName,
    title: output.title,
    goal: output.goal,
    initialInstruction: output.initialInstruction,
    objects: objects.map((o) => ({
      id: o.id,
      label: o.label,
      description: o.description,
      initiallyVisible: o.initiallyVisible,
      sourceFrame: o.sourceFrame,
      sourceBox: o.sourceBox,
      appearance: o.appearance,
      ...(o.profile ? { profile: o.profile } : {}),
    })),
    steps: steps.map((s) => ({
      id: s.id,
      instruction: s.instruction,
      explanation: s.explanation,
      correction: s.correction,
      prerequisites: s.prerequisites,
      condition: s.condition,
      evidence: s.evidence,
      uncertainties: s.uncertainties,
      supported: s.supported,
    })),
    coverage: output.coverage,
    goalFrame: output.goalFrame,
    goalStepIds: output.goalStepIds,
    goalSupported,
    source,
    images: [],
    geometry,
    approval: null,
  });
}
