import { z } from "zod";
import { authorize, TeachError, unseal } from "../../../../server/teach/security";
import { boundedBody, responseError } from "../../../../server/teach/http";
import {
  auditTeachDraft,
  TEACH_AUDIT_TIMEOUT_MS,
} from "../../../../server/teach/audit";
import { ContextSchema, DraftSchema } from "../../../../teach/schema";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * Felicity Teach quality audit: one bounded Baseten Muse Spark Open request
 * for the creator's current draft. Advisory findings only — the expert still
 * reviews and approves; nothing is added to the procedure.
 */
export async function POST(request: Request) {
  try {
    const session = authorize(request);
    let raw: unknown;
    try {
      raw = JSON.parse(
        new TextDecoder().decode(await boundedBody(request, 1_500_000)),
      );
    } catch (error) {
      if (error instanceof TeachError) throw error;
      throw new TeachError(400, "Invalid audit request.");
    }
    const input = z
      .strictObject({ token: z.string().max(1_000_000), draft: z.unknown() })
      .safeParse(raw);
    if (!input.success) throw new TeachError(400, "Invalid audit request.");
    const context = ContextSchema.parse(
      unseal(input.data.token, "review", session),
    );
    const draft = DraftSchema.safeParse(input.data.draft);
    if (!draft.success) throw new TeachError(400, "Invalid draft for audit.");
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(TEACH_AUDIT_TIMEOUT_MS),
    ]);
    return Response.json(await auditTeachDraft(draft.data, context, signal));
  } catch (error) {
    return responseError(error);
  }
}
