import "server-only";
import { z } from "zod";
import { boundedBody, responseError } from "../teach/http";
import {
  authorize,
  requireSameOrigin,
  seal,
  unseal,
  TeachError,
} from "../teach/security";
import { createMetaClient } from "../meta/client";
import { ProviderDiagnosticSchema } from "./structured";
import { NativeFramesSchema } from "./discovery";
import { validateJpeg } from "./jpeg";
import { analyseGuide } from "./pipeline";
import { validateSelections, type Selection } from "../../teach/schema";
import { inspectLessonVideo } from "../../teach/media";
import { GuideSchema } from "../../guide/schema";
import { canonical } from "../../guide/versioning";
import {
  stampGuide,
  verifyArtifact,
  structuralContent,
  openPerceptionSession,
} from "./security";
export async function readGuideJson(
  request: Request,
  max = 4_000_000,
): Promise<unknown> {
  try {
    return JSON.parse(
      new TextDecoder().decode(await boundedBody(request, max)),
    );
  } catch (e) {
    if (e instanceof TeachError) throw e;
    throw new TeachError(
      400,
      "The request was incomplete. Keep the guide open and try again.",
    );
  }
}
export async function analyse(request: Request) {
  try {
    const owner = authorize(request);
    if (
      !request.headers.get("content-type")?.startsWith("multipart/form-data;")
    )
      throw new TeachError(415, "Choose a supported lesson video.");
    const bytes = await boundedBody(request, 4_000_000);
    const form = await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type")! },
      body: bytes,
    }).formData();
    if (
      [...form.keys()].some(
        (k) => !["video", "audio", "confirmed", "marks", "frames"].includes(k),
      ) ||
      ["video", "audio", "confirmed"].some((k) => form.getAll(k).length !== 1)
    )
      throw new TeachError(400, "Send one previewed lesson and its audio.");
    const video = form.get("video"),
      audio = form.get("audio");
    if (
      !(video instanceof File) ||
      !(audio instanceof File) ||
      form.get("confirmed") !== "true"
    )
      throw new TeachError(400, "Preview and confirm the lesson first.");
    if (video.size > 2_800_000 || audio.size > 1_100_000)
      throw new TeachError(
        413,
        "Choose a short lesson: video up to 2.8 MB and audio up to 1.1 MB.",
      );
    let manual: Selection[] | undefined;
    const marks = form.get("marks");
    if (marks !== null) {
      if (
        typeof marks !== "string" ||
        marks.length > 10000 ||
        form.getAll("marks").length !== 1
      )
        throw new TeachError(400, "Invalid object marks.");
      manual = validateSelections(
        JSON.parse(marks),
        await inspectLessonVideo(video),
      );
    }
    let nativeFrames: z.infer<typeof NativeFramesSchema> = [];
    const frames = form.get("frames");
    if (frames !== null) {
      if (typeof frames !== "string" || form.getAll("frames").length !== 1)
        throw new TeachError(400, "Invalid native source frames.");
      nativeFrames = NativeFramesSchema.parse(JSON.parse(frames));
      const media = await inspectLessonVideo(video);
      for (const f of nativeFrames) {
        if (f.frame >= media.frameTimesMs.length)
          throw new TeachError(400, "Source frame is outside this clip.");
        validateJpeg(
          f.image,
          media.info.video!.width,
          media.info.video!.height,
        );
      }
    }
    if (!manual && !nativeFrames.length)
      throw new TeachError(
        400,
        "Source reference frames are missing. Choose the clip again before processing.",
      );
    const abort = new AbortController(),
      signal = AbortSignal.any([
        request.signal,
        abort.signal,
        AbortSignal.timeout(280000),
      ]);
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream<Uint8Array>({
        async start(output) {
          const send = (v: unknown) => {
            if (!signal.aborted)
              output.enqueue(encoder.encode(JSON.stringify(v) + "\n"));
          };
          try {
            const result = await analyseGuide(
              createMetaClient(),
              video,
              audio,
              (stage, message, details) =>
                send({
                  type: "progress",
                  stage,
                  message,
                  ...(details ? { details } : {}),
                }),
              signal,
              manual,
              nativeFrames,
            );
            send({
              type: "draft",
              guide: result.guide,
              tracking: result.context.tracking,
              token: seal(
                result.guide,
                "guide-review-v2",
                owner,
                24 * 60 * 60 * 1000,
              ),
              uploadDeleted: true,
            });
          } catch (e) {
            const response = responseError(e);
            const error = (await response.json()) as { error: string };
            const diagnostic =
              e && typeof e === "object" && "diagnostic" in e
                ? ProviderDiagnosticSchema.safeParse(e.diagnostic)
                : null;
            send({
              type: "error",
              message: error.error,
              ...(diagnostic?.success ? { diagnostic: diagnostic.data } : {}),
            });
          } finally {
            try {
              output.close();
            } catch {
              /* Consumer cancelled; pipeline owns upload cleanup. */
            }
          }
        },
        cancel() {
          abort.abort();
        },
      }),
      {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (e) {
    return responseError(e);
  }
}
export async function approveGuide(request: Request) {
  try {
    const owner = authorize(request);
    const data = z
      .strictObject({
        guide: GuideSchema,
        token: z.string().max(1_000_000).optional(),
        previous: z.unknown().optional(),
        reviewer: z.string().trim().min(1).max(100),
        purpose: z.enum(["rehearsal", "published"]),
        testOnly: z.boolean().default(false),
        confirmed: z.literal(true),
        reviewedStepIds: z.array(z.string()).max(12),
        goalReviewed: z.literal(true),
      })
      .parse(await readGuideJson(request));
    const base = data.token
      ? GuideSchema.parse(unseal(data.token, "guide-review-v2", owner))
      : verifyArtifact(data.previous).guide;
    if (
      canonical(structuralContent(base)) !==
      canonical(structuralContent(data.guide))
    )
      throw new TeachError(
        422,
        "The evidence or rules changed. Reanalyse the source before approving new rules.",
      );
    if (
      data.guide.id !== base.id ||
      !(
        data.guide.revision === base.revision ||
        (data.guide.revision === base.revision + 1 &&
          data.guide.parentRevision === base.revision)
      )
    )
      throw new TeachError(422, "Invalid guide revision.");
    if (
      new Set(data.reviewedStepIds).size !== data.guide.steps.length ||
      data.guide.steps.some((s) => !data.reviewedStepIds.includes(s.id))
    )
      throw new TeachError(422, "Review every step before testing or saving.");
    return Response.json(
      stampGuide(
        { ...data.guide, approval: null },
        data.reviewer,
        data.purpose,
        data.testOnly,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return responseError(e);
  }
}
export async function practiceSession(request: Request) {
  try {
    requireSameOrigin(request);
    const artifact = verifyArtifact(await readGuideJson(request));
    if (artifact.guide.approval?.purpose === "rehearsal") authorize(request);
    return Response.json(openPerceptionSession(artifact), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return responseError(e);
  }
}
