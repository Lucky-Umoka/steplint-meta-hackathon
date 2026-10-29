import "server-only";
import { decodeMaskToRaster, recordsOfKind, type ImageSegmentationResult } from "@meta-sam/parser";
import { z } from "zod";

const sparkResponse = z.object({
  status: z.literal("completed"),
  output_text: z.string().trim().min(1),
});

export function validateSparkResponse(value: unknown) {
  const parsed = sparkResponse.safeParse(value);
  if (!parsed.success) throw new Error("Spark response must be completed and contain nonempty output_text.");
  if (parsed.data.output_text !== "STEPLINT_OK") {
    throw new Error("Spark response did not match the requested STEPLINT_OK marker.");
  }
  return parsed.data;
}

export function validateSamResult(result: ImageSegmentationResult) {
  if (result.outcome.status !== "completed") throw new Error("SAM stream did not complete.");
  if (result.diagnostics.length) throw new Error("SAM parser reported format diagnostics.");
  const boxes = recordsOfKind(result.records, "box");
  const masks = recordsOfKind(result.records, "mask");
  if (!boxes.length || !masks.length) throw new Error("SAM returned no usable boxes and masks.");
  for (const record of masks) {
    if (!boxes.some((box) => box.objectId === record.objectId)) {
      throw new Error("SAM mask has no matching box.");
    }
    const raster = decodeMaskToRaster(record.mask);
    if (!raster.length || !raster.some((pixel) => pixel === 1)) {
      throw new Error("SAM mask is empty.");
    }
  }
  return { boxes: boxes.length, masks: masks.length };
}
