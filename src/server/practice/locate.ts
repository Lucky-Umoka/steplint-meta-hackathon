import "server-only";
import { parseImageStream, recordsOfKind } from "@meta-sam/parser";
import { z } from "zod";
import { createMetaClient, SAM_MODEL } from "../meta/client";
import { TeachError } from "../teach/security";

/**
 * Practice camera locate (owner decision 2026-11-04): ONE bounded step at
 * Practice start finds the approved objects in the learner's own camera view,
 * wherever the camera is, so automatic tracking does not depend on matching
 * the Teach recording viewpoint. SAM 3.1 (Meta API, MODEL_API_KEY) with a short
 * noun-phrase concept prompt per object on one small JPEG, in parallel; never
 * per frame. Returns boxes only; the page derives one camera mapping and all
 * tracking and verification stay local and deterministic.
 */
const noun = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[\p{L}\p{N} '\-]+$/u);
export const LocateRequestSchema = z.strictObject({
  sessionId: z.string().regex(/^[A-Za-z0-9:_-]{8,120}$/),
  image: z
    .string()
    .max(160_000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
  width: z.number().int().min(64).max(1280),
  height: z.number().int().min(64).max(1280),
  objects: z
    .array(z.strictObject({ id: z.string().min(1).max(100), noun }))
    .min(1)
    .max(4),
});
export type LocateRequest = z.infer<typeof LocateRequestSchema>;
export type Located = {
  id: string;
  box: { left: number; top: number; right: number; bottom: number } | null;
  confidence: number | null;
  instances: number;
};
export const LOCATE_TIMEOUT_MS = 20_000;
/** One locate per camera session per 2 minutes; 30 per hour per server. */
const sessions = new Map<string, number>();
let hour: { start: number; count: number } = { start: 0, count: 0 };
export function resetLocateLimits() {
  sessions.clear();
  hour = { start: 0, count: 0 };
}
export function admitLocate(input: LocateRequest, now = Date.now()) {
  if (process.env.PRACTICE_LOCATE_ENABLED === "0")
    throw new TeachError(503, "Camera locate is disabled.");
  const last = sessions.get(input.sessionId);
  if (last !== undefined && now - last < 120_000)
    throw new TeachError(429, "Camera locate already ran for this session.");
  if (now - hour.start > 3_600_000) hour = { start: now, count: 0 };
  if (hour.count >= Number(process.env.PRACTICE_LOCATE_MAX_PER_HOUR ?? 30))
    throw new TeachError(429, "Camera locate hourly limit reached.");
  sessions.set(input.sessionId, now);
  hour.count++;
}

type Client = ReturnType<typeof createMetaClient>;
async function locateOne(
  client: Client,
  input: LocateRequest,
  object: LocateRequest["objects"][number],
  signal: AbortSignal,
): Promise<Located> {
  const events = await client.responses.create(
    {
      model: SAM_MODEL,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: object.noun },
            { type: "input_image", image_url: input.image, detail: "auto" },
          ],
        },
      ],
      stream: true,
      metadata: { mask_encoding: "one_bit", include_confidence: "true" },
      store: false,
    },
    { signal, timeout: LOCATE_TIMEOUT_MS },
  );
  const result = await parseImageStream(events).finalResult;
  if (result.outcome.status !== "completed")
    return { id: object.id, box: null, confidence: null, instances: 0 };
  const boxes = [...recordsOfKind(result.records, "box")].sort(
    (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0),
  );
  const best = boxes[0];
  if (!best) return { id: object.id, box: null, confidence: null, instances: 0 };
  return {
    id: object.id,
    instances: boxes.length,
    confidence: best.confidence ?? null,
    box: {
      left: Math.max(0, best.left / input.width),
      top: Math.max(0, best.top / input.height),
      right: Math.min(1, best.right / input.width),
      bottom: Math.min(1, best.bottom / input.height),
    },
  };
}
export async function locateObjects(
  input: LocateRequest,
  signal: AbortSignal,
  client: Client = createMetaClient(),
): Promise<Located[]> {
  return Promise.all(
    input.objects.map((object) =>
      locateOne(client, input, object, signal).catch(() => ({
        id: object.id,
        box: null,
        confidence: null,
        instances: 0,
      })),
    ),
  );
}
