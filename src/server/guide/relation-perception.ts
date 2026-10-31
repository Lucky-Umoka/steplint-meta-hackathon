import "server-only";
import { z } from "zod";
import { requireSameOrigin, TeachError } from "../teach/security";
import { responseError } from "../teach/http";
import { readGuideJson } from "./http";
import { acquirePerception } from "./security";
import { createMetaClient } from "../meta/client";
import { ImageSchema } from "../../guide/schema";
import { RelationWindowSchema } from "../../guide/relation-evaluator";
import { validateJpeg } from "./jpeg";
import { inspectRelationEvidence } from "./relations";
export async function perceiveRelations(request: Request) {
  let lease: ReturnType<typeof acquirePerception> | null = null;
  try {
    requireSameOrigin(request);
    const input = z
      .strictObject({
        token: z.string().max(2000),
        id: z.string().min(1).max(100),
        epoch: z.string().min(1).max(100),
        width: z.number().int().min(80).max(1280),
        height: z.number().int().min(80).max(720),
        frames: z
          .array(
            z.strictObject({
              frame: z.number().int().nonnegative(),
              image: ImageSchema,
            }),
          )
          .length(3),
        contextFrames:z.array(z.strictObject({frame:z.number().int().nonnegative(),image:ImageSchema})).max(8).default([]),
      })
      .parse(await readGuideJson(request, 4_000_000));
    if (
      input.frames.some(
        (f, i) => i > 0 && f.frame <= input.frames[i - 1].frame,
      ) ||
      input.frames[2].frame - input.frames[0].frame > 8000
    )
      throw new TeachError(
        400,
        "Use three fresh ordered camera observations within eight seconds.",
      );
    const all=[...input.frames,...input.contextFrames].sort((a,b)=>a.frame-b.frame);
    if(new Set(all.map(f=>f.frame)).size!==all.length||input.contextFrames.some(f=>f.frame<=input.frames[0].frame||f.frame>=input.frames[2].frame))throw new TeachError(400,"Motion context must lie inside this observation window.");
    all.forEach((f) =>
      validateJpeg(f.image, input.width, input.height),
    );
    lease = acquirePerception(input.token, 1);
    const plan = lease.guide.relationPlan;
    if (!plan)
      throw new TeachError(400, "This guide uses a different evidence policy.");
    lease.charge();
    const observation = await inspectRelationEvidence(
      createMetaClient(),
      plan,
      all,
      AbortSignal.any([request.signal, AbortSignal.timeout(120000)]),
    );
    return Response.json(
      {
        window: RelationWindowSchema.parse({
          id: input.id,
          epoch: input.epoch,
          witnesses:observation.witnesses,
          frames:input.frames.map(f=>observation.frames.find(o=>o.frame===f.frame)),
        }),
        remainingModelRequests: lease.remaining(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return responseError(e);
  } finally {
    lease?.release();
  }
}
