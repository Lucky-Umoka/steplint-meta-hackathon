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
 * one per camera session per 2 minutes and an hourly server limit.
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
    return Response.json({ objects: await locateObjects(parsed.data, signal) });
  } catch (error) {
    return responseError(error);
  }
}
