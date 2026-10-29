import { MP4, WEBM, WAVE, BlobSource, Input, Mp4InputFormat } from "mediabunny";
import { z } from "zod";

export const MEDIA_INPUT_FORMATS = [MP4, WEBM, WAVE];
export const MAX_MEDIA_BYTES = 20_000_000;
export const MAX_SECONDS = 20.5;
export const MediaInfoSchema = z.object({
  mime: z.string(), bytes: z.number().int().positive().max(MAX_MEDIA_BYTES),
  durationSeconds: z.number().finite().positive().max(MAX_SECONDS),
  container: z.string(),
  video: z.object({ codec: z.string().nullable(), width: z.number().int().positive(), height: z.number().int().positive(), frames: z.number().int().positive(), fps: z.number().finite().positive() }).nullable(),
  audio: z.object({ codec: z.string().nullable(), channels: z.number().int().positive(), sampleRate: z.number().positive() }).nullable(),
});
export type MediaInfo = z.infer<typeof MediaInfoSchema>;

export async function inspectMedia(blob: Blob): Promise<MediaInfo> {
  if (!blob.size || blob.size > MAX_MEDIA_BYTES) throw new Error("Media must be nonempty and at most 20 MB.");
  const input = new Input({ formats: MEDIA_INPUT_FORMATS, source: new BlobSource(blob) });
  try {
    const format = await input.getFormat();
    const durationSeconds = await input.computeDuration();
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_SECONDS) {
      throw new Error("Media must have a finite duration of at most 20.5 seconds.");
    }
    if ((await input.getVideoTracks()).length > 1 || (await input.getAudioTracks()).length > 1) throw new Error("The spike supports at most one video and one audio track.");
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    const stats = video ? await video.computePacketStats() : null;
    if (video && stats && (stats.packetCount > 600 || (await video.getDisplayWidth()) * (await video.getDisplayHeight()) > 1280 * 720)) throw new Error("Input video exceeds the spike's frame or pixel limit.");
    return MediaInfoSchema.parse({
      mime: await input.getMimeType(), bytes: blob.size, durationSeconds,
      container: format instanceof Mp4InputFormat ? "mp4" : format.name,
      video: video && stats ? { codec: await video.getCodec(), width: await video.getDisplayWidth(), height: await video.getDisplayHeight(), frames: stats.packetCount, fps: stats.averagePacketRate } : null,
      audio: audio ? { codec: await audio.getCodec(), channels: await audio.getNumberOfChannels(), sampleRate: await audio.getSampleRate() } : null,
    });
  } finally { input.dispose(); }
}

export function requireSamVideo(value: unknown): MediaInfo {
  const info = MediaInfoSchema.parse(value);
  if (info.container !== "mp4" || info.video?.codec !== "avc") throw new Error("This spike accepts parsed MP4/H.264 only, never WebM/VP9.");
  if (info.durationSeconds < 10 || info.video.frames > 600 || info.video.width * info.video.height > 1280 * 720) {
    throw new Error("Video must be 10–20.5 seconds, at most 600 frames and 1280×720 pixels.");
  }
  if (info.audio && info.audio.codec !== "aac") throw new Error("MP4 audio must be AAC, or absent (video only).");
  return info;
}

/** Parse RIFF chunks, not a filename or MIME hint. Accept only the ASR PCM contract. */
export function inspectWav(bytes: Uint8Array) {
  if (bytes.byteLength < 44 || bytes.byteLength > 1_100_000) throw new Error("WAV size is invalid for the short spike.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, count: number) => String.fromCharCode(...bytes.subarray(offset, offset + count));
  if (text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE" || view.getUint32(4, true) + 8 !== bytes.byteLength) throw new Error("Invalid RIFF/WAVE header or size.");
  let sampleRate = 0;
  let dataBytes = 0;
  let hasFormat = false;
  let offset = 12;
  for (; offset + 8 <= bytes.length;) {
    const kind = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > bytes.length) throw new Error("Truncated WAV chunk.");
    if (kind === "fmt ") {
      if (hasFormat || size < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 2, true) !== 1 || view.getUint16(start + 14, true) !== 16) throw new Error("WAV must be mono 16-bit integer PCM.");
      sampleRate = view.getUint32(start + 4, true);
      if (![16_000, 24_000].includes(sampleRate) || view.getUint32(start + 8, true) !== sampleRate * 2 || view.getUint16(start + 12, true) !== 2) throw new Error("WAV must be 16/24 kHz with consistent PCM byte rate.");
      hasFormat = true;
    }
    if (kind === "data") {
      if (dataBytes || !size || size % 2) throw new Error("Invalid WAV data chunk.");
      dataBytes = size;
    }
    offset = start + size + (size % 2);
  }
  if (offset !== bytes.length) throw new Error("Invalid WAV chunk alignment or trailing bytes.");
  const durationSeconds = dataBytes / (sampleRate * 2);
  if (!hasFormat || !dataBytes || !Number.isFinite(durationSeconds) || durationSeconds < 10 || durationSeconds > MAX_SECONDS) throw new Error("WAV must contain 10–20.5 seconds of PCM audio.");
  return { mime: "audio/wav", bytes: bytes.length, channels: 1, bitsPerSample: 16, sampleRate, durationSeconds };
}
