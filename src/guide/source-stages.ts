import { z } from "zod";
export const SourceFrameRequestSchema = z
  .strictObject({
    type: z.literal("source"),
    token: z.string().min(1).max(200000),
    frames: z
      .array(
        z.strictObject({
          frame: z.number().int().nonnegative(),
          timestampMs: z.number().int().nonnegative(),
        }),
      )
      .min(1)
      .max(8),
  })
  .refine(
    (source) =>
      new Set(source.frames.map((frame) => frame.frame)).size ===
      source.frames.length,
    "Source moments must be unique.",
  );
