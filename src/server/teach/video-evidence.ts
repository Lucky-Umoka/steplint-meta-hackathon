import "server-only";
import { createHash } from "node:crypto";
import { MAX_TEACH_VIDEO_BYTES } from "../../media/limits";
import { TeachError } from "./security";

export function decodeTeachVideo(dataUrl: string): Buffer {
  const prefix = "data:video/mp4;base64,";
  if (
    dataUrl.length > prefix.length + Math.ceil(MAX_TEACH_VIDEO_BYTES / 3) * 4 ||
    !dataUrl.startsWith(prefix)
  )
    throw new TeachError(
      413,
      "Video evidence exceeds this host's existing Teach video budget or is not an MP4 data URL.",
    );
  const encoded = dataUrl.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new TeachError(
      400,
      "Video evidence must contain canonical base64 MP4 bytes.",
    );
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.length > MAX_TEACH_VIDEO_BYTES ||
    bytes.toString("base64") !== encoded ||
    bytes.length < 12 ||
    bytes.toString("ascii", 4, 8) !== "ftyp"
  )
    throw new TeachError(
      400,
      "Video evidence is not a bounded, compatible MP4.",
    );
  return bytes;
}

export function bindTeachVideo(
  dataUrl: string,
  source: {
    videoSha256?: string;
    lesson: { media: { info: { bytes: number } } };
  },
): void {
  const bytes = decodeTeachVideo(dataUrl);
  if (!source.videoSha256)
    throw new TeachError(
      422,
      "This upload predates video evidence binding. Upload the reviewed clip again before visual drafting.",
    );
  if (
    bytes.length !== source.lesson.media.info.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== source.videoSha256
  )
    throw new TeachError(
      422,
      "Video evidence differs from the reviewed upload. No model request was made.",
    );
}
