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
const objectId = z.string().min(1).max(100);
const WatchSchema = z
  .strictObject({
    required: z.array(objectId).max(4),
    optional: z.array(objectId).max(4),
  })
  .refine(
    (w) =>
      new Set([...w.required, ...w.optional]).size ===
      w.required.length + w.optional.length,
    "Watch-set identities must be distinct.",
  );
export const IdentityEventSchema = z.strictObject({
  objectId: z.string(),
  status: z.enum([
    "tracked",
    "occluded",
    "reacquiring",
    "needs_user_view",
    "dormant",
    "acquiring",
  ]),
  reason: z.string().max(300),
});
export const LocalWorkerInputSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("bootstrap"),
    generation,
    image,
    /** Teach -> live camera mapping from the Practice locate step. */
    view: z
      .strictObject({
        scale: z.number().min(0.35).max(2.5),
        dx: z.number().min(-2).max(2),
        dy: z.number().min(-2).max(2),
      })
      .nullable()
      .optional(),
    source: z.strictObject({
      scene: image,
      zones: z.array(BoxSchema).max(100).optional(),
      objects: z
        .array(
          z.strictObject({
            id: z.string().min(1).max(100),
            box: BoxSchema,
            fixed: z.boolean(),
            expectedBox: BoxSchema.optional(),
            image,
            /** Must be found now (an active required identity). Default true. */
            required: z.boolean().optional(),
            /** In the current watch set; false = dormant later object. Default true. */
            active: z.boolean().optional(),
          }),
        )
        .min(1)
        .max(4),
    }),
  }),
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
    /** Watch-set revision; replies carrying an older revision are stale. */
    watchRevision: z.number().int().nonnegative().optional(),
    watch: WatchSchema.optional(),
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
    translation: z
      .strictObject({ x: z.number().finite(), y: z.number().finite() })
      .optional(),
    /** Per approved zone (bindings order): each follows its own reference. */
    zoneTranslations: z
      .array(z.strictObject({ x: z.number().finite(), y: z.number().finite() }))
      .max(100)
      .optional(),
  }),
  z.object({ type: z.literal("error"), generation, message: z.string() }),
  z.object({
    type: z.literal("tracked"),
    generation,
    timestampMs: z.number().finite().nonnegative(),
    frameId: z.string(),
    processingMs: z.number().finite().nonnegative(),
    detections: z.array(DetectionSchema).max(4),
    /** Supporting identities, reported separately from required evidence. */
    optionalDetections: z.array(DetectionSchema).max(4).default([]),
    watchRevision: z.number().int().nonnegative().optional(),
    identityEvents: z.array(IdentityEventSchema).max(16).default([]),
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
