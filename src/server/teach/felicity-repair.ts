import "server-only";
import { z } from "zod";
import {
  ContextSchema,
  validateSelections,
  type Lesson,
  type Selection,
} from "../../teach/schema";
import {
  sourceEvidenceCatalog,
  TEACH_MAX_SOURCE_GAP_MS,
  trustedTrack,
} from "../../teach/source-evidence";
import { sparkStructured } from "../meta/spark";

/**
 * Felicity tracking repair (owner direction 2026-11-04: Felicity coordinates
 * and fixes errors instead of handing them to the user). When SAM loses an
 * object for long enough that none of its moves can be measured (bowl video:
 * a 9 s gap), Felicity asks Muse Spark Open (Baseten) where that same object
 * is clearly visible during and after the gap. Those views re-anchor ONE more
 * SAM pass. Nothing is invented: the new tracking is still measured by SAM
 * and checked by the same deterministic rules, and it is kept only if it
 * measures more movement. Bounded: one Spark call, one SAM call per lesson.
 */
type Tracking = z.infer<typeof ContextSchema>["tracking"];
const Grid = z.number().int().min(0).max(1000);
const RepairSchema = z.strictObject({
  objects: z
    .array(
      z.strictObject({
        id: z.string().max(40),
        views: z
          .array(
            z.strictObject({
              timestampMs: z.number().int().nonnegative(),
              box: z.strictObject({ left: Grid, top: Grid, right: Grid, bottom: Grid }),
              positive: z.strictObject({ x: Grid, y: Grid }),
            }),
          )
          .max(2),
      }),
    )
    .max(4),
});
export type RepairTarget = {
  id: string;
  description: string;
  gaps: { fromMs: number; toMs: number }[];
};

/** Objects with no measured move whose reliable tracking has long gaps. */
export function repairTargets(
  lesson: Lesson,
  selections: Selection[],
  tracking: Tracking,
): RepairTarget[] {
  const context = ContextSchema.parse({ lesson, selections, tracking });
  const times = lesson.media.frameTimesMs;
  const duration = times.at(-1) ?? 0;
  return sourceEvidenceCatalog(context)
    .filter((entry) => entry.displacementWindows.length === 0)
    .flatMap((entry) => {
      const trusted = trustedTrack(
        tracking.find((t) => t.componentId === entry.componentId)?.samples ?? [],
        times,
      );
      const gaps: { fromMs: number; toMs: number }[] = [];
      const edges = [
        { timestampMs: -1 },
        ...trusted,
        { timestampMs: duration + 1 },
      ];
      for (let i = 1; i < edges.length; i++) {
        const from = Math.max(0, edges[i - 1].timestampMs),
          to = Math.min(duration, edges[i].timestampMs);
        if (to - from > TEACH_MAX_SOURCE_GAP_MS) gaps.push({ fromMs: from, toMs: to });
      }
      const selection = selections.find((s) => s.id === entry.componentId)!;
      return gaps.length
        ? [{ id: entry.componentId, description: selection.description, gaps: gaps.slice(0, 3) }]
        : [];
    });
}

/** Validated pixel views per object id, from Felicity's answer. */
export function parseRepairViews(
  data: unknown,
  lesson: Lesson,
  selections: Selection[],
  targets: RepairTarget[],
): Selection[] {
  const parsed = RepairSchema.parse(data);
  const video = lesson.media.info.video;
  if (!video) return selections;
  const times = lesson.media.frameTimesMs;
  const nearest = (ms: number) =>
    times.reduce((best, t, i) => (Math.abs(t - ms) < Math.abs(times[best] - ms) ? i : best), 0);
  const px = (v: number, size: number) => Math.round((v * (size - 1)) / 1000);
  const next = selections.map((selection) => {
    if (!targets.some((t) => t.id === selection.id)) return selection;
    const answer = parsed.objects.find((o) => o.id === selection.id);
    const views = (answer?.views ?? [])
      .filter(
        (v) =>
          v.timestampMs < lesson.media.info.durationSeconds * 1000 &&
          v.box.right > v.box.left &&
          v.box.bottom > v.box.top &&
          v.positive.x >= v.box.left &&
          v.positive.x <= v.box.right &&
          v.positive.y >= v.box.top &&
          v.positive.y <= v.box.bottom &&
          // not the whole scene
          (v.box.right - v.box.left) * (v.box.bottom - v.box.top) < 600_000,
      )
      .map((v) => ({
        frame: nearest(v.timestampMs),
        x: px(v.positive.x, video.width),
        y: px(v.positive.y, video.height),
        within: {
          left: px(v.box.left, video.width),
          top: px(v.box.top, video.height),
          right: px(v.box.right, video.width),
          bottom: px(v.box.bottom, video.height),
        },
      }))
      .filter((v, i, all) => v.frame !== selection.frame && all.findIndex((w) => w.frame === v.frame) === i);
    return views.length ? { ...selection, views } : selection;
  });
  return validateSelections(next, lesson.media);
}

export function repairInstructions(targets: RepairTarget[], durationMs: number) {
  return `You are Felicity, StepLint's repair coordinator. The video tracker lost these objects for long stretches, so their moves could not be measured. For EACH listed object, find the SAME physical object (not a hand, not another object, not its support surface) and return up to 2 views where it is clearly visible and no hand covers it: preferably one while it rests during or right after each listed gap, and one after it comes to rest at its final place. Each view: an INTEGER timestampMs between 0 and ${durationMs - 1}, a tight box and a positive point on the object's visible solid surface (point inside its box). Coordinates use a NORMALIZED 0-1000 grid independently on each axis (left/top = 0, right/bottom = 1000). Never invent an object; if it is not visible, return no views for it. Return only JSON.\nObjects: ${JSON.stringify(targets)}`;
}

/** Felicity's bounded Spark call; null when there is nothing to repair. */
export async function felicityRepairSelections(
  lesson: Lesson,
  selections: Selection[],
  tracking: Tracking,
  videoBase64: string,
  signal: AbortSignal,
): Promise<{ selections: Selection[]; targets: RepairTarget[] } | null> {
  const targets = repairTargets(lesson, selections, tracking);
  if (!targets.length) return null;
  const durationMs = Math.floor(lesson.media.info.durationSeconds * 1000);
  const result = await sparkStructured({
    instructions: repairInstructions(targets, durationMs),
    text: `Repair the tracking anchors for: ${targets.map((t) => `${t.id} (${t.description})`).join(", ")}. Transcript (timing hint only): ${JSON.stringify(lesson.transcript.text).slice(0, 4000)}`,
    videoBase64,
    schema: RepairSchema,
    name: "FelicityTrackingRepair",
    maxTokens: 8000,
    signal,
  });
  const repaired = parseRepairViews(result.data, lesson, selections, targets);
  return repaired.some((s, i) => s !== selections[i]) ? { selections: repaired, targets } : null;
}

/** Keep the re-tracked result only when it measures more movement. */
export function repairImproves(
  lesson: Lesson,
  before: { selections: Selection[]; tracking: Tracking },
  after: { selections: Selection[]; tracking: Tracking },
) {
  const windows = (s: Selection[], t: Tracking) =>
    sourceEvidenceCatalog(ContextSchema.parse({ lesson, selections: s, tracking: t })).reduce(
      (n, e) => n + e.displacementWindows.length,
      0,
    );
  return windows(after.selections, after.tracking) > windows(before.selections, before.tracking);
}
