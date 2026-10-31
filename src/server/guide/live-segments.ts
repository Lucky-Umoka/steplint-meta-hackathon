import "server-only";
import type OpenAI from "openai";
import type { Stream } from "openai/core/streaming";
import {
  parseImageStream,
  recordsOfKind,
  decodeMaskToRaster,
  type ResponsesEvent,
} from "@meta-sam/parser";
import { BoxSchema, type Box, type ObjectDetection } from "../../guide/schema";
import type { Foreground } from "../../guide/foreground";
import { conceptCrop, originalBox } from "./crop";
import { reportedConfidence } from "./quality";
/** One predeclared concept request per relevant part. Crops retain native pixels;
 * competing masks or weak evidence produce no local identity. Never retries. */
export async function segmentNamedPart(
  client: OpenAI,
  image: string,
  size: { width: number; height: number },
  part: { id: string; concept: string; box: Box },
  signal: AbortSignal,
) {
  const proposal = {
    left: Math.floor(part.box.left * size.width),
    top: Math.floor(part.box.top * size.height),
    right: Math.ceil(part.box.right * size.width),
    bottom: Math.ceil(part.box.bottom * size.height),
  };
  const view = await conceptCrop(image, proposal, size);
  const stream = await client.post<Stream<ResponsesEvent>>("/responses", {
    body: {
      model: "sam-3.1",
      stream: true,
      store: false,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: part.concept },
            { type: "input_image", image_url: view.image },
          ],
        },
      ],
      metadata: { mask_encoding: "one_bit", include_confidence: "true" },
    },
    stream: true,
    signal,
    timeout: 60000,
  });
  const parser = parseImageStream(stream);
  for await (const snapshot of parser) {
    if (snapshot.records.length > 200)
      throw Error("Too many competing object outlines.");
  }
  const result = await parser.finalResult;
  if (result.outcome.status !== "completed" || result.diagnostics.length)
    throw Error("Object segmentation did not complete.");
  const masks = recordsOfKind(result.records, "mask");
  const candidates = recordsOfKind(result.records, "box").flatMap((b) => {
    const m = masks.find((m) => m.objectId === b.objectId),
      score = reportedConfidence(b.confidence, m?.confidence);
    if (
      !m ||
      score === null ||
      score < 0.9 ||
      m.mask.width * m.mask.height > 1280 * 720
    )
      return [];
    const pixel = originalBox(b, view),
      box = BoxSchema.safeParse({
        left: pixel.left / size.width,
        top: pixel.top / size.height,
        right: pixel.right / size.width,
        bottom: pixel.bottom / size.height,
      });
    if (!box.success) return [];
    // Require substantial intersection with the proposed identity region, but
    // allow SAM to repair an offset edge. More than one match stays ambiguous.
    const intersection =
      Math.max(
        0,
        Math.min(pixel.right, proposal.right) -
          Math.max(pixel.left, proposal.left),
      ) *
      Math.max(
        0,
        Math.min(pixel.bottom, proposal.bottom) -
          Math.max(pixel.top, proposal.top),
      );
    if (
      intersection / ((pixel.right - pixel.left) * (pixel.bottom - pixel.top)) <
      0.35
    )
      return [];
    const raster = decodeMaskToRaster(m.mask);
    if (!raster.some((v) => v > 0)) return [];
    const bytes = new Uint8Array(Math.ceil(raster.length / 8));
    for (let i = 0; i < raster.length; i++)
      if (raster[i]) bytes[i >> 3] |= 1 << (7 - (i & 7));
    const bounds = originalBox(m.bounds, view);
    return [
      {
        detection: {
          objectId: part.id,
          quality: "observed" as const,
          box: box.data,
          score,
        },
        foreground: {
          width: m.mask.width,
          height: m.mask.height,
          bounds: BoxSchema.parse({
            left: bounds.left / size.width,
            top: bounds.top / size.height,
            right: bounds.right / size.width,
            bottom: bounds.bottom / size.height,
          }),
          bits: Buffer.from(bytes).toString("base64"),
        } satisfies Foreground,
      },
    ];
  });
  const missing: ObjectDetection = {
    objectId: part.id,
    quality: candidates.length ? "ambiguous" : "missing",
    box: null,
    score: null,
  };
  return candidates.length === 1
    ? candidates[0]
    : { detection: missing, foreground: null };
}
