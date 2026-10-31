import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authorize, seal, unseal, TeachError } from "../teach/security";
import { boundedBody, responseError } from "../teach/http";
import { createMetaClient } from "../meta/client";
import { sourceStream } from "./http";
import { ImageSchema } from "../../guide/schema";
import { validateJpeg } from "./jpeg";
import {
  prepareRelations,
  compileRelations,
  RelationSourceSchema,
  relationFrames,
} from "./relation-source";
import { deleteLessonFile } from "../teach/pipeline";

export async function analyseRelations(request: Request) {
  try {
    const owner = authorize(request);
    const content = request.headers.get("content-type");
    if (!content?.startsWith("multipart/form-data;"))
      throw new TeachError(415, "Choose a supported lesson recording.");
    const bytes = await boundedBody(request, 4_000_000);
    const form = await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": content },
      body: bytes,
    }).formData();
    const client = createMetaClient();
    if (form.has("source")) {
      if (
        [...form.keys()].some(
          (k) => !["source", "frames", "discard"].includes(k),
        ) ||
        form.getAll("source").length !== 1
      )
        throw new TeachError(400, "Invalid source continuation.");
      const token = z.string().max(200000).parse(form.get("source"));
      const source = RelationSourceSchema.parse(
        unseal(token, "relation-source-v1", owner),
      );
      if (form.has("discard")) {
        if (form.get("discard") !== "true" || form.has("frames"))
          throw new TeachError(400, "Invalid cleanup request.");
        await deleteLessonFile(client, source.fileId);
        return Response.json({ deleted: true });
      }
      if (form.getAll("frames").length !== 1)
        throw new TeachError(400, "Send the requested source images once.");
      const frames = z
        .array(
          z.strictObject({
            frame: z.number().int().nonnegative(),
            image: ImageSchema,
          }),
        )
        .min(1)
        .max(24)
        .parse(JSON.parse(z.string().parse(form.get("frames"))));
      const expected = relationFrames(source),
        size = source.lesson.media.info.video!;
      if (
        frames.length !== expected.length ||
        new Set(frames.map((f) => f.frame)).size !== frames.length ||
        frames.some((f) => !expected.includes(f.frame))
      )
        throw new TeachError(400, "Source images do not match this lesson.");
      frames.forEach((f) => validateJpeg(f.image, size.width, size.height));
      return sourceStream(request, randomUUID(), async (signal, send) => {
        try {
          const guide = await compileRelations(
            client,
            source,
            frames,
            signal,
            (message) => send({ type: "progress", stage: "draft", message }),
          );
          await deleteLessonFile(client, source.fileId);
          send({
            type: "draft",
            guide,
            token: seal(guide, "guide-review-v2", owner, 24 * 60 * 60 * 1000),
            uploadDeleted: true,
          });
        } catch (e) {
          await deleteLessonFile(client, source.fileId);
          throw e;
        }
      });
    }
    if (
      [...form.keys()].some(
        (k) =>
          !["video", "audio", "confirmed", "intent", "prepare"].includes(k),
      ) ||
      ["video", "audio", "confirmed"].some((k) => form.getAll(k).length !== 1)
    )
      throw new TeachError(400, "Send one confirmed lesson.");
    const video = form.get("video"),
      audio = form.get("audio");
    if (
      !(video instanceof File) ||
      !(audio instanceof File) ||
      form.get("confirmed") !== "true"
    )
      throw new TeachError(400, "Preview and confirm the lesson first.");
    if (video.size > 2_800_000 || audio.size > 1_100_000)
      throw new TeachError(413, "The lesson exceeds its media limit.");
    const intent = z
      .string()
      .max(400)
      .parse(form.get("intent") ?? "");
    return sourceStream(request, randomUUID(), async (signal, send) => {
      send({
        type: "progress",
        stage: "discover",
        message: "Finding the complete visible sequence…",
      });
      const source = await prepareRelations(
        client,
        video,
        audio,
        intent,
        signal,
      );
      if (signal.aborted) {
        await deleteLessonFile(client, source.fileId);
        signal.throwIfAborted();
      }
      send({
        type: "source",
        token: seal(source, "relation-source-v1", owner, 20 * 60 * 1000),
        frames: relationFrames(source).map((frame) => ({
          frame,
          timestampMs: source.lesson.media.frameTimesMs[frame],
        })),
      });
    });
  } catch (e) {
    return responseError(e);
  }
}
