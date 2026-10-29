import { BlobSource, CanvasSink, EncodedPacketSink, Input, MP4 } from "mediabunny";
import { inspectMedia, requireSamVideo, inspectWav } from "../media/inspect";
import { LessonMediaSchema, MAX_TEACH_VIDEO, type LessonMedia } from "./schema";

export async function inspectLessonVideo(video: Blob): Promise<LessonMedia> {
  if (video.size > MAX_TEACH_VIDEO) throw new Error("Lesson MP4 exceeds 2.8 MB. Record a shorter clip or lower its bitrate.");
  const info = requireSamVideo(await inspectMedia(video));
  const input = new Input({ formats: [MP4], source: new BlobSource(video) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No video track.");
    const timestamps: number[] = [];
    for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true })) {
      if (timestamps.length >= 600) throw new Error("Too many video frames.");
      timestamps.push(Math.round(packet.timestamp * 1000));
    }
    timestamps.sort((a, b) => a - b);
    if (timestamps.some((t, i) => t < 0 || (i > 0 && t <= timestamps[i - 1]))) throw new Error("Video frame timeline is ambiguous.");
    return LessonMediaSchema.parse({ info, frameTimesMs: timestamps });
  } finally { input.dispose(); }
}
export function validateLessonAudio(wav: Uint8Array, media: LessonMedia) {
  const info = inspectWav(wav);
  if (Math.abs(info.durationSeconds - media.info.durationSeconds) > 0.5) throw new Error("Audio/video durations differ by more than 0.5 seconds.");
  return info;
}
export async function frameImage(video: Blob, timestampMs: number): Promise<string> {
  const input = new Input({ formats: [MP4], source: new BlobSource(video) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !await track.canDecode()) throw new Error("This browser cannot decode representative video frames.");
    const wrapped = await new CanvasSink(track).getCanvas((timestampMs + 1) / 1000);
    if (!wrapped) throw new Error("No representative frame at this timestamp.");
    const canvas = document.createElement("canvas");
    canvas.width = await track.getDisplayWidth(); canvas.height = await track.getDisplayHeight();
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.drawImage(wrapped.canvas, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally { input.dispose(); }
}
