import "server-only";
import type OpenAI from "openai";
import type { LessonMedia, Selection } from "../../teach/schema";
import { conceptCrop, originalBox } from "./crop";
import { localizeGuideAnchors } from "./localization";
import { TeachError } from "../teach/security";
/** A distinct close-up interpretation, still only a proposal until SAM checks it. */
export async function refineSourceView(
  client: OpenAI,
  selection: Selection,
  concept: string,
  image: string,
  media: LessonMedia,
  signal: AbortSignal,
  progress: (details: unknown) => void,
) {
  const video = media.info.video;
  if (!video || selection.mark.kind !== "box")
    throw new TeachError(422, "A source close-up needs valid video geometry.");
  const crop = await conceptCrop(image, selection.mark, video);
  const localized = await localizeGuideAnchors(
    client,
    [{ ...selection, concept }],
    [{ frame: selection.frame, image: crop.image }],
    {
      ...media,
      info: {
        ...media.info,
        video: { ...video, width: crop.width, height: crop.height },
      },
    },
    signal,
    (details) =>
      progress({
        crop: {
          left: crop.left,
          top: crop.top,
          width: crop.width,
          height: crop.height,
        },
        proposal: details,
      }),
  );
  const mark = localized.selections[0].mark;
  if (mark.kind !== "box")
    throw new TeachError(422, "The close-up outline is unavailable.");
  return {
    selection: {
      ...selection,
      mark: { kind: "box" as const, ...originalBox(mark, crop) },
    },
    points: localized.points[0].map((p) => ({
      ...p,
      x: p.x + crop.left,
      y: p.y + crop.top,
    })),
  };
}
