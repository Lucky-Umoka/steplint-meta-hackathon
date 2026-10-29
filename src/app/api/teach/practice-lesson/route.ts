import { createHash } from "node:crypto";
import { z } from "zod";
import { authorize, unseal, TeachError } from "../../../../server/teach/security";
import { boundedBody, responseError } from "../../../../server/teach/http";
import { PracticeLessonSchema } from "../../../../practice/lesson";
export const runtime = "nodejs";
/** Verifies an unchanged Teach export in its approving owner session. No paid calls. */
export async function POST(request: Request) {
  try {
    const session = authorize(request);
    const input = z.record(z.string(), z.unknown()).parse(JSON.parse(new TextDecoder().decode(await boundedBody(request, 1_500_000))));
    const { approvalReceipt, ...artifact } = input;
    const receipt = z.object({ digest: z.string(), lessonId: z.string() }).parse(unseal(z.string().parse(approvalReceipt), "approved", session));
    const digest = createHash("sha256").update(JSON.stringify(artifact)).digest("hex");
    if (digest !== receipt.digest) throw new TeachError(422, "Approved export was changed. Return to Teach and approve the corrected lesson.");
    const lesson = PracticeLessonSchema.parse({ procedure: artifact.procedure, zoneBindings: artifact.zoneBindings, sourceLesson: artifact.sourceLesson, origin: "teach" });
    if (receipt.lessonId !== lesson.procedure.id) throw new TeachError(422, "Approval does not match the lesson.");
    return Response.json(lesson, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return responseError(error); }
}
