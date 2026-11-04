import { MAX_LESSON_FRAMES } from "../media/limits";
import {
  BlobSource,
  CanvasSink,
  EncodedPacketSink,
  Input,
  MP4,
} from "mediabunny";
import { inspectMedia, requireSamVideo, inspectWav } from "../media/inspect";
import { LessonMediaSchema, MAX_TEACH_VIDEO, type LessonMedia } from "./schema";

export async function inspectLessonVideo(video: Blob): Promise<LessonMedia> {
  if (video.size > MAX_TEACH_VIDEO)
    throw new Error(
      `Lesson MP4 exceeds the Teach video budget (${MAX_TEACH_VIDEO} bytes). Record a shorter clip or lower its bitrate.`,
    );
  const info = requireSamVideo(await inspectMedia(video));
  const input = new Input({ formats: [MP4], source: new BlobSource(video) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No video track.");
    const timestamps: number[] = [];
    for await (const packet of new EncodedPacketSink(track).packets(
      undefined,
      undefined,
      { metadataOnly: true },
    )) {
      if (timestamps.length >= MAX_LESSON_FRAMES)
        throw new Error("Too many video frames.");
      timestamps.push(Math.round(packet.timestamp * 1000));
    }
    timestamps.sort((a, b) => a - b);
    if (timestamps.some((t, i) => t < 0 || (i > 0 && t <= timestamps[i - 1])))
      throw new Error("Video frame timeline is ambiguous.");
    return LessonMediaSchema.parse({ info, frameTimesMs: timestamps });
  } finally {
    input.dispose();
  }
}
/** Reuse the exact reviewed, bounded clip; audio is already transcribed separately. */
export function teachVideoDataUrl(video: Blob): Promise<string> {
  if (video.size > MAX_TEACH_VIDEO)
    return Promise.reject(
      Error(
        "Visual drafting requires the reviewed compatible MP4 within the Teach video budget.",
      ),
    );
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(Error("Could not read reviewed video evidence."));
    reader.onerror = () =>
      reject(Error("Could not read reviewed video evidence."));
    // Prepared media has already passed byte/codec inspection. File MIME metadata
    // can be empty or generic; label the same bytes without re-encoding them.
    reader.readAsDataURL(new Blob([video], { type: "video/mp4" }));
  });
}
export function validateLessonAudio(wav: Uint8Array, media: LessonMedia) {
  const info = inspectWav(wav);
  if (Math.abs(info.durationSeconds - media.info.durationSeconds) > 0.5)
    throw new Error("Audio/video durations differ by more than 0.5 seconds.");
  return info;
}
export async function frameImage(
  video: Blob,
  timestampMs: number,
  maximumWidth?: number,
): Promise<string> {
  const input = new Input({ formats: [MP4], source: new BlobSource(video) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode()))
      throw new Error(
        "This browser cannot decode representative video frames.",
      );
    const wrapped = await new CanvasSink(track).getCanvas(
      (timestampMs + 1) / 1000,
    );
    if (!wrapped) throw new Error("No representative frame at this timestamp.");
    const canvas = document.createElement("canvas");
    const width = await track.getDisplayWidth(),
      height = await track.getDisplayHeight();
    const scale = maximumWidth
      ? Math.min(1, maximumWidth / width, 240 / height)
      : 1;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.drawImage(wrapped.canvas, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    input.dispose();
  }
}

/**
 * True when frame spacing is irregular (variable-frame-rate phone video).
 * Such clips are re-encoded to the steady lesson rate before upload, so SAM's
 * frame indices and the lesson's frame timeline describe the same frames.
 */
export async function frameTimingIrregular(video: Blob): Promise<boolean> {
  const input = new Input({ formats: [MP4], source: new BlobSource(video) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return true;
    const times: number[] = [];
    for await (const packet of new EncodedPacketSink(track).packets(
      undefined,
      undefined,
      { metadataOnly: true },
    )) {
      times.push(packet.timestamp * 1000);
      if (times.length > MAX_LESSON_FRAMES * 6) return true;
    }
    times.sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    if (gaps.length < 2) return true;
    const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    return (
      median <= 0 ||
      gaps.some((gap) => Math.abs(gap - median) > median * 0.25)
    );
  } finally {
    input.dispose();
  }
}
