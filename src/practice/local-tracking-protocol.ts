import { z } from "zod";
import { BoxSchema, DetectionSchema } from "../guide/schema";
const generation = z.number().int().nonnegative();
const image = z
  .strictObject({
    width: z.number().int().min(1).max(320),
    height: z.number().int().min(1).max(240),
    data: z.instanceof(Uint8ClampedArray),
  })
  .refine(
    (p) => p.data.length === p.width * p.height * 4,
    "Invalid frame byte count.",
  );
export const LocalWorkerInputSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("calibrate"),
    image,
    generation,
    calibration: z.strictObject({
      objects: z
        .array(
          z.strictObject({
            id: z.string().min(1).max(100),
            box: BoxSchema,
            fixed: z.boolean().optional(),
          }),
        )
        .min(1)
        .max(4),
      workspace: BoxSchema,
    }),
  }),
  z.strictObject({
    type: z.literal("frame"),
    image,
    generation,
    timestampMs: z.number().finite().nonnegative(),
    frameId: z.string().min(1).max(100),
  }),
]);
export const TrackingMeasurementSchema = z.strictObject({
  objectId: z.string(),
  method: z.enum(["native_palette", "dense_rgb", "features"]),
  error: z.number().finite().nonnegative().nullable(),
  alternativeGap: z.number().finite().nullable(),
  pixels: z.number().int().nonnegative().nullable(),
});
export const LocalWorkerReplySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("calibrated"),
    generation,
    measurements: z.array(TrackingMeasurementSchema).max(4),
  }),
  z.object({ type: z.literal("error"), generation, message: z.string() }),
  z.object({
    type: z.literal("tracked"),
    generation,
    timestampMs: z.number().finite().nonnegative(),
    frameId: z.string(),
    processingMs: z.number().finite().nonnegative(),
    detections: z.array(DetectionSchema).max(4),
    calibrationValid: z.boolean(),
    partialIdentities: z
      .array(
        z.strictObject({
          objectId: z.string(),
          score: z.number().min(0.9).max(1),
          visibleFraction: z.number().min(0.45).max(1),
        }),
      )
      .max(4),
    reason: z.string().nullable(),
    measurements: z.array(TrackingMeasurementSchema).max(4),
  }),
]);
export type TrackingMeasurement = z.infer<typeof TrackingMeasurementSchema>;

export type LocalWorkerReply = z.infer<typeof LocalWorkerReplySchema>;
