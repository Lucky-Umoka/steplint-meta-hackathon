import { z } from "zod";
import { GuideSchema, type Guide, type GuideObservation } from "./schema";
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
export function compileGuide(input: unknown, context: TeachContext): Guide {
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
  const objects = output.objects
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
      if (!sample)
        throw Error(
          `No reliable geometry for ${o.label}. Correct the proposed mark or use a clearer view.`,
        );
      return {
        ...o,
        initiallyVisible: observation(output.steps[0].startFrame).objects.some(
          (detection) =>
            detection.objectId === o.id && detection.quality === "observed",
        ),
        sourceFrame: sample.frame,
        sourceBox: sample.box,
        appearance: null,
      };
    });
  const steps = output.steps.map((s, i) => {
    if (s.endFrame >= media.frameTimesMs.length || s.startFrame >= s.endFrame)
      throw Error("A proposed step has invalid source times.");
    const step = {
      id: s.id,
      instruction: s.instruction,
      explanation: s.explanation,
      correction: s.correction,
      prerequisites: i ? [output.steps[i - 1].id] : [],
      condition: {
        kind: s.kind,
        objectId: s.objectId,
        anchorId: s.anchorId,
        minimumChange: 0.15,
        requiredVisibleAfter: s.requiredVisibleAfter,
      },
      evidence: {
        startFrame: s.startFrame,
        changeFrame: s.changeFrame,
        endFrame: s.endFrame,
        startMs: media.frameTimesMs[s.startFrame],
        endMs: media.frameTimesMs[s.endFrame],
        turnIds: s.turnIds,
      },
      uncertainties: s.uncertainties,
      supported: false,
    };
    const change = changeMetric(
      step,
      observation(s.startFrame),
      observation(s.endFrame),
    );
    const involved = [s.objectId, ...(s.anchorId ? [s.anchorId] : [])];
    const continuous = involved.every((id) => {
      const samples =
        context.tracking
          .find((t) => t.componentId === id)
          ?.samples.filter(
            (sample) =>
              sample.frame >= s.startFrame && sample.frame <= s.endFrame,
          ) ?? [];
      return (
        samples.length === s.endFrame - s.startFrame + 1 &&
        samples.every(
          (sample) => sample.confidence !== null && sample.confidence >= 0.9,
        )
      );
    });
    const visible = s.requiredVisibleAfter.every((id) =>
      observation(s.endFrame).objects.some(
        (o) => o.objectId === id && o.quality === "observed",
      ),
    );
    step.supported =
      change !== null &&
      change >= 0.15 &&
      change <= 12 &&
      continuous &&
      visible;
    if (step.supported)
      step.condition.minimumChange = Math.max(
        0.15,
        Math.min(12, change! * 0.65),
      );
    else
      step.uncertainties = [
        ...step.uncertainties,
        "This proposed action does not yet have continuous reliable geometry and a measurable state change; it cannot be approved.",
      ].slice(0, 8);
    return step;
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
    objects,
    steps,
    coverage: output.coverage,
    goalFrame: output.goalFrame,
    goalStepIds: output.goalStepIds,
    goalSupported: output.goalStepIds.every((id) => {
      const step = steps.find((s) => s.id === id);
      if (!step) return false;
      const change = changeMetric(
        step,
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
    }),
    source: {
      durationMs: media.info.durationSeconds * 1000,
      width: size.width,
      height: size.height,
      frameTimesMs: media.frameTimesMs,
      transcript: context.lesson.transcript,
    },
    images: [],
    geometry,
    approval: null,
  });
}
