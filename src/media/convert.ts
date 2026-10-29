import {
  BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat,
  Output, Quality, WavOutputFormat, canEncodeAudio, canEncodeVideo,
} from "mediabunny";
import { MEDIA_INPUT_FORMATS, inspectMedia, inspectWav, requireSamVideo } from "./inspect";

const videoQuality = new Quality({ bitrate: 1_000_000 });
const audioQuality = new Quality({ bitrate: 96_000 });
export async function probeEncoding() {
  const [h264, aac, pcm] = await Promise.all([
    canEncodeVideo("avc", { width: 640, height: 480, frameRate: 15, quality: videoQuality }),
    canEncodeAudio("aac", { numberOfChannels: 1, sampleRate: 48_000, quality: audioQuality }),
    canEncodeAudio("pcm-s16", { numberOfChannels: 1, sampleRate: 24_000 }),
  ]);
  return { h264, aac, pcm };
}
export type EncodingSupport = Awaited<ReturnType<typeof probeEncoding>>;

export async function extractWav(blob: Blob, signal: AbortSignal) {
  signal.throwIfAborted();
  await inspectMedia(blob);
  const input = new Input({ formats: MEDIA_INPUT_FORMATS, source: new BlobSource(blob) });
  const target = new BufferTarget();
  const output = new Output({ format: new WavOutputFormat(), target });
  let conversion: Conversion | undefined;
  const cancel = () => { void conversion?.cancel(); };
  signal.addEventListener("abort", cancel);
  try {
    signal.throwIfAborted();
    const audio = await input.getPrimaryAudioTrack();
    if (!audio) throw new Error("No audio track: no WAV was invented. Supply a clip with speech.");
    if (!await audio.canDecode()) throw new Error("Browser cannot decode this clip's audio; WAV conversion is unavailable.");
    conversion = await Conversion.init({ input, output, tracks: "primary", video: { discard: true }, audio: { codec: "pcm-s16", sampleFormat: "s16", numberOfChannels: 1, sampleRate: 24_000, forceTranscode: true }, tags: {} });
    if (!conversion.isValid || conversion.discardedTracks.some((t) => t.track.type === "audio")) throw new Error("Mediabunny could not retain the audio track for WAV conversion.");
    signal.throwIfAborted();
    await conversion.execute();
    signal.throwIfAborted();
    if (!target.buffer) throw new Error("WAV conversion produced no bytes.");
    const info = inspectWav(new Uint8Array(target.buffer));
    return { blob: new Blob([target.buffer], { type: "audio/wav" }), info };
  } finally {
    signal.removeEventListener("abort", cancel);
    if (conversion && conversion.state !== "done") await conversion.cancel();
    input.dispose();
  }
}

export async function createMp4(blob: Blob, support: EncodingSupport, signal: AbortSignal) {
  if (!support.h264) throw new Error("H.264 encoding probe failed. Use an existing MP4/H.264 file instead.");
  await inspectMedia(blob); // bound duration/bytes before decoding
  const input = new Input({ formats: MEDIA_INPUT_FORMATS, source: new BlobSource(blob) });
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  let conversion: Conversion | undefined;
  const cancel = () => { void conversion?.cancel(); };
  signal.addEventListener("abort", cancel);
  try {
    signal.throwIfAborted();
    const video = await input.getPrimaryVideoTrack();
    if (!video || !await video.canDecode()) throw new Error("Browser cannot decode the recorded video for conversion.");
    conversion = await Conversion.init({
      input, output, tracks: "primary",
      video: { codec: "avc", width: 640, height: 480, fit: "contain", frameRate: 15, quality: videoQuality, forceTranscode: true, keyFrameInterval: 1 },
      audio: support.aac ? { codec: "aac", numberOfChannels: 1, sampleRate: 48_000, quality: audioQuality, forceTranscode: true } : { discard: true },
      tags: {},
    });
    if (!conversion.isValid || conversion.discardedTracks.some((t) => t.track.type === "video" || (support.aac && t.track.type === "audio"))) throw new Error("Conversion discarded a required track; no compatible MP4 was produced.");
    signal.throwIfAborted();
    await conversion.execute();
    signal.throwIfAborted();
    if (!target.buffer) throw new Error("MP4 conversion produced no bytes.");
    const result = new Blob([target.buffer], { type: "video/mp4" });
    const info = requireSamVideo(await inspectMedia(result));
    return { blob: result, info };
  } finally {
    signal.removeEventListener("abort", cancel);
    if (conversion && conversion.state !== "done") await conversion.cancel();
    input.dispose();
  }
}
