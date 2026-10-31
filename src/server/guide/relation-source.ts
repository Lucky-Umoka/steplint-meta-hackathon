import "server-only";
import { z } from "zod";
import type OpenAI from "openai";
import { LessonSchema } from "../../teach/schema";
import {
  RelationPlanSchema,
  clearRelation,
  matchesRelation,
  type RelationPlan,
  type RelationReading,
} from "../../guide/relations";
import { GuideSchema, type Guide } from "../../guide/schema";
import { frameAtSourceTime } from "../../guide/source-time";
import { inspectRelationEvidence, planRelations } from "./relations";
import { uploadLesson, deleteLessonFile } from "../teach/pipeline";

export const RelationSourceSchema = z.strictObject({
  relationSource: z.literal(true),
  fileId: z.string().regex(/^file-[A-Za-z0-9_-]+$/),
  lesson: LessonSchema,
  plan: RelationPlanSchema,
});
export type RelationSource = z.infer<typeof RelationSourceSchema>;
export function relationStepFrames(source: RelationSource, index: number) {
  const s = source.plan.steps[index],
    times = source.lesson.media.frameTimesMs;
  const at = (ms: number) =>
    frameAtSourceTime(
      ms,
      times,
      source.lesson.media.info.durationSeconds * 1000,
    );
  const lo = index ? source.plan.steps[index - 1].endMs : 0;
  const hi =
    source.plan.steps[index + 1]?.startMs ??
    source.lesson.media.info.durationSeconds * 1000;
  return [
    ...new Set([
      at(s.startMs),
      at(s.changeMs),
      at(s.endMs),
      at(Math.max(lo, s.startMs - 400)),
      at(Math.min(hi, s.endMs + 267)),
      at(Math.max(s.changeMs, s.endMs - 267)),
      ...((source.plan.goalStepIds??[source.plan.steps.at(-1)!.id]).includes(s.id)
        ? [at(source.plan.steps.at(-1)!.endMs)] : []),
    ]),
  ];
}
export function relationFrames(source: RelationSource) {
  const base = source.plan.steps.flatMap((_, i) =>
    relationStepFrames(source, i).slice(0, 3),
  );
  const selected = new Set(base);
  for (let offset = 3; offset < 6; offset++)
    for (let i = 0; i < source.plan.steps.length; i++) {
      if (selected.size >= 24) break;
      const frame = relationStepFrames(source, i)[offset];
      if (frame !== undefined) selected.add(frame);
    }
  return [...selected].sort((a, b) => a - b);
}
export async function prepareRelations(
  client: OpenAI,
  video: Blob,
  audio: Blob,
  intent: string,
  signal: AbortSignal,
) {
  const upload = await uploadLesson(client, video, audio, signal);
  try {
    return RelationSourceSchema.parse({
      ...upload,
      relationSource: true,
      plan: await planRelations(
        client,
        upload.fileId,
        upload.lesson,
        intent,
        signal,
      ),
    });
  } catch (error) {
    await deleteLessonFile(client, upload.fileId);
    throw error;
  }
}

export async function compileRelations(
  client: OpenAI,
  source: RelationSource,
  frames: { frame: number; image: string }[],
  signal: AbortSignal,
  progress: (message: string, details?: unknown) => void,
): Promise<Guide> {
  const { plan, lesson } = source,
    media = lesson.media,
    size = media.info.video!;
  const at = (ms: number) =>
    frameAtSourceTime(
      ms,
      media.frameTimesMs,
      media.info.durationSeconds * 1000,
    );
  const observed = new Map<
    string,
    { frame: number; reading: RelationReading }[]
  >();
  const correspondence = new Map<string, boolean>();
  for (const [index, step] of plan.steps.entries()) {
    progress(
      `Checking the visible starting state and result: ${step.instruction}`,
    );
    const needed = relationStepFrames(source, index).filter((frame) =>
      frames.some((f) => f.frame === frame),
    ).sort((a,b)=>a-b);
    const images = needed.map((frame) => {
      const image = frames.find((f) => f.frame === frame);
      if (!image) throw Error("A requested source image is missing.");
      return image;
    });
    const result = await inspectRelationEvidence(
      client,
      { objects: plan.objects, steps: [step] },
      images,
      signal,
      source.fileId,
    );
    const witness = result.witnesses.find((w) => w.stepId === step.id);
    correspondence.set(
      step.id,
      !!witness &&
        witness.objectIdentity === "same" &&
        (witness.anchorIdentity === "same" || step.before === "closed") &&
        witness.sceneAlignment === "stable" &&
        !witness.contradictingEvidence,
    );
    observed.set(
      step.id,
      result.frames.map((f) => ({ frame: f.frame, reading: f.readings[0] })),
    );
    progress("Checked the source relationship.", {
      stepId: step.id,
      ...result,
    });
  }
  const samples = [...observed].flatMap(([stepId, frames]) =>
    frames.map((f) => ({
      ...f,
      step: plan.steps.find((s) => s.id === stepId)!,
    })),
  );
  const objects = plan.objects.map((o) => {
    const sample = samples.find(
      (s) =>
        clearRelation(s.reading) &&
        ((s.step.objectId === o.id && s.reading.objectBox) ||
          (s.step.anchorId === o.id && s.reading.anchorBox)),
    );
    if (!sample)
      throw Error(
        `No identifiable source view for ${o.label}. The source remains unapproved.`,
      );
    return {
      ...o,
      initiallyVisible: samples.some(
        (s) =>
          s.frame === at(plan.steps[0].startMs) &&
          clearRelation(s.reading) &&
          (s.step.objectId === o.id || s.step.anchorId === o.id),
      ),
      sourceFrame: sample.frame,
      sourceBox:
        sample.step.objectId === o.id
          ? sample.reading.objectBox
          : sample.reading.anchorBox,
      appearance: null,
    };
  });
  const steps = plan.steps.map((s, i) => {
    const readings = observed.get(s.id)!;
    const preferredBefore = readings.find((f) => f.frame === at(s.startMs))!,
      preferredAfter = readings.find((f) => f.frame === at(s.endMs))!;
    const beforeSample =
      (clearRelation(preferredBefore.reading) &&
      matchesRelation(s,preferredBefore.reading,"before")
        ? preferredBefore
        : readings.find(
            (f) =>
              f.frame < at(s.changeMs) &&
              clearRelation(f.reading) &&
              matchesRelation(s,f.reading,"before"),
          )) ?? preferredBefore;
    const afterSample =
      (clearRelation(preferredAfter.reading) &&
      matchesRelation(s,preferredAfter.reading,"after")
        ? preferredAfter
        : readings.find(
            (f) =>
              f.frame > at(s.changeMs) &&
              clearRelation(f.reading) &&
              matchesRelation(s,f.reading,"after"),
          )) ?? preferredAfter;
    const before = beforeSample.reading,
      after = afterSample.reading;
    const supported =
      correspondence.get(s.id) === true &&
      clearRelation(before) &&
      clearRelation(after) &&
      matchesRelation(s,before,"before") &&
      matchesRelation(s,after,"after");
    return {
      id: s.id,
      instruction: s.instruction,
      explanation: s.explanation,
      correction: s.correction,
      prerequisites: i ? [plan.steps[i - 1].id] : [],
      condition: {
        kind: "visual_relation" as const,
        objectId: s.objectId,
        anchorId: s.anchorId,
        minimumChange: 0.15,
        requiredVisibleAfter: [s.objectId, s.anchorId],
        relation: { before: s.before, after: s.after },
      },
      evidence: {
        startFrame: beforeSample.frame,
        changeFrame: at(s.changeMs),
        endFrame: afterSample.frame,
        startMs: media.frameTimesMs[beforeSample.frame],
        endMs: media.frameTimesMs[afterSample.frame],
        turnIds: [],
      },
      uncertainties: supported
        ? []
        : [`Before: ${before.description} Result: ${after.description}`],
      supported,
    };
  });
  const goalFrame=Math.max(at(plan.steps.at(-1)!.endMs),steps.at(-1)!.evidence.endFrame);
  const goalStepIds=plan.goalStepIds??[steps.at(-1)!.id];
  const goalSupported=steps.every(s=>s.supported)&&goalStepIds.every(id=>{
    const rule=plan.steps.find(s=>s.id===id);
    const reading=observed.get(id)?.find(r=>r.frame===goalFrame)?.reading;
    return !!rule&&!!reading&&clearRelation(reading)&&matchesRelation(rule,reading,"after");
  });
  return GuideSchema.parse({
    schemaVersion: 2,
    relationPlan: plan,
    relationEvidence: [...observed.values()].flatMap((entries) =>
      entries.map(({ frame, reading }) => ({ frame, readings: [reading] })),
    ),
    id: lesson.lessonId,
    revision: 1,
    parentRevision: null,
    methodId: "visual-relations-v1",
    methodName: "Reviewed visible relationships",
    title: plan.title,
    goal: plan.goal,
    initialInstruction: plan.initialInstruction,
    objects,
    steps,
    coverage: plan.coverage,
    goalFrame,
    goalStepIds,
    goalSupported,
    source: {
      durationMs: media.info.durationSeconds * 1000,
      width: size.width,
      height: size.height,
      frameTimesMs: media.frameTimesMs,
      transcript: lesson.transcript,
    },
    images: [],
    geometry: [],
    approval: null,
  });
}

export function relationshipPlanForGuide(guide: Guide): RelationPlan {
  if (!guide.relationPlan)
    throw Error("This guide does not use visual relationship rules.");
  return guide.relationPlan;
}
