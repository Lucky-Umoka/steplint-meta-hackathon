import {
  admitRecovery,
  felicityAdvice,
  FELICITY_TIMEOUT_MS,
  RecoveryRequestSchema,
} from "../../../../server/practice/recovery";
import { requireSameOrigin, TeachError } from "../../../../server/teach/security";
import { boundedBody, responseError } from "../../../../server/teach/http";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Felicity recovery advice (one paid Baseten Muse Spark Open request per
 * incident). Same-site pages only, with server-side incident, session and
 * hourly limits. Advisory: never changes a verifier decision.
 */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await boundedBody(request, 160_000);
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(body));
    } catch {
      throw new TeachError(400, "Invalid recovery request.");
    }
    const parsed = RecoveryRequestSchema.safeParse(raw);
    if (!parsed.success)
      throw new TeachError(400, "Invalid recovery request.");
    admitRecovery(parsed.data);
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(FELICITY_TIMEOUT_MS),
    ]);
    const advice = await felicityAdvice(parsed.data, signal);
    return Response.json({ incidentId: parsed.data.incidentId, ...advice });
  } catch (error) {
    return responseError(error);
  }
}
