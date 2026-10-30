import { z } from "zod";
import { ForegroundSchema } from "./foreground";
import { DetectionSchema } from "./schema";
export const PerceptionResultSchema = z
  .strictObject({
    phase: z.enum([
      "starting",
      "in_progress",
      "goal",
      "no_work_area",
      "uncertain",
    ]),
    objects: z.array(DetectionSchema).max(6),
    foregrounds: z
      .array(
        z.strictObject({ objectId: z.string(), foreground: ForegroundSchema }),
      )
      .max(6),
    remainingModelRequests: z.number().int().min(0).max(6),
  })
  .superRefine((value, ctx) => {
    const ids = value.foregrounds.map((f) => f.objectId);
    if (
      new Set(ids).size !== ids.length ||
      value.foregrounds.some(
        (f) =>
          !value.objects.some(
            (o) => o.objectId === f.objectId && o.quality === "observed",
          ),
      ) ||
      value.objects.some(
        (o) => o.quality === "observed" && !ids.includes(o.objectId),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Observed objects need unique matching foreground evidence.",
      });
  });
export const PerceptionSessionSchema = z.strictObject({
  token: z.string().min(1).max(2000),
  maximumModelRequests: z.literal(6),
});
