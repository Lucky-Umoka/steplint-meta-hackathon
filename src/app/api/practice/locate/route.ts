import {
  admitLocate,
  LocateRequestSchema,
  LOCATE_TIMEOUT_MS,
  locateObjects,
} from "../../../../server/practice/locate";
import { requireSameOrigin, TeachError } from "../../../../server/teach/security";
import { boundedBody, responseError } from "../../../../server/teach/http";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Practice camera locate: one bounded SAM 3.1 step at Practice start (one
 * concept request per approved object, in parallel). Same-site pages only,
 * one per camera session per 20 s and an hourly server limit.
 */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await boundedBody(request, 200_000);
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(body));
    } catch {
      throw new TeachError(400, "Invalid locate request.");
    }
    const parsed = LocateRequestSchema.safeParse(raw);
    if (!parsed.success) throw new TeachError(400, "Invalid locate request.");
    admitLocate(parsed.data);
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(LOCATE_TIMEOUT_MS),
    ]);
    const started = Date.now();
    const objects = await locateObjects(parsed.data, signal);
    // Provenance for judges/devtools: which real model calls were made (no
    // keys or private configuration).
    return Response.json({
      objects,
      provenance: {
        model: "sam-3.1",
        provider: "Meta API",
        requests: parsed.data.objects.length,
        ms: Date.now() - started,
      },
    });
  } catch (error) {
    return responseError(error);
  }
}
