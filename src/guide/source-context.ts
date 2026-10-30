import { z } from "zod";
import {
  SelectionSchema,
  TrackingSchema,
  LessonSchema,
  type LessonMedia,
} from "../teach/schema";
export const GuideSelectionSchema = SelectionSchema.extend({
  id: z.string().regex(/^component-[1-6]$/),
});
export const GuideSelectionsSchema = z
  .array(GuideSelectionSchema)
  .min(1)
  .max(6)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    "Component IDs must be unique.",
  );
export const GuideTrackingSchema = z.array(TrackingSchema.element).max(6);
export const GuideContextSchema = z.strictObject({
  lesson: LessonSchema,
  selections: GuideSelectionsSchema,
  tracking: GuideTrackingSchema,
});
export function validateGuideSelections(input: unknown, media: LessonMedia) {
  const parts = GuideSelectionsSchema.parse(input),
    size = media.info.video;
  if (!size) throw Error("No source video.");
  for (const part of parts) {
    const b = part.mark;
    if (
      part.frame >= media.frameTimesMs.length ||
      (b.kind === "point"
        ? b.x >= size.width || b.y >= size.height
        : b.left >= b.right ||
          b.top >= b.bottom ||
          b.right > size.width ||
          b.bottom > size.height)
    )
      throw Error("A source mark is outside this clip.");
  }
  return parts;
}
