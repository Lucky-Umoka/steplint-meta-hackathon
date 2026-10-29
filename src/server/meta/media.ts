import "server-only";
import { z } from "zod";
import OpenAI, { toFile } from "openai";
import type { Stream } from "openai/core/streaming";
import { buildObjectPrompt, decodeMaskToRaster, frameIndexOf, recordsOfKind, parseVideoStream, type ResponsesEvent, type VideoSegmentationResult } from "@meta-sam/parser";
import { inspectWav, type MediaInfo } from "../../media/inspect";

export const VOICE_MODEL = "muse-voice-transcribe-1.0";
const coordinate = z.number().int().nonnegative();
export const FramePromptSchema = z.object({
  frame: coordinate,
  points: z.array(z.object({ x: coordinate, y: coordinate, label: z.enum(["positive", "negative"]).optional() })).min(1).max(8),
});
export const VideoPromptSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("concept"), text: z.string().trim().min(1).max(100) }),
  z.object({ kind: z.literal("frames"), prompts: z.array(FramePromptSchema).min(1).max(8) }),
]);
export type VideoPrompt = z.infer<typeof VideoPromptSchema>;

export function buildSamVideoRequest(fileId: string, media: MediaInfo, promptInput: unknown) {
  const video = media.video;
  if (!video) throw new Error("Video metadata required.");
  const prompt = VideoPromptSchema.parse(promptInput);
  let text: string;
  if (prompt.kind === "concept") text = prompt.text;
  else {
    for (const frame of prompt.prompts) {
      if (frame.frame >= video.frames || frame.points.some((p) => p.x >= video.width || p.y >= video.height)) throw new Error("Frame prompt must use actual source frame indices and display-pixel coordinates.");
    }
    text = buildObjectPrompt({ size: { width: video.width, height: video.height }, objects: [{ id: 1, prompts: prompt.prompts }] });
  }
  return {
    model: "sam-3.1", stream: true, store: false,
    input: [{ type: "message", role: "user", content: [
      { type: "input_text", text }, { type: "input_video", file_id: z.string().regex(/^file-[A-Za-z0-9_-]+$/).parse(fileId) },
    ] }],
    metadata: { mask_encoding: "one_bit", ...(prompt.kind === "frames" ? { propagation_direction: "forward" } : {}) },
  };
}

export function summarizeSamVideo(result: VideoSegmentationResult, frameCount: number) {
  if (result.outcome.status !== "completed" || result.diagnostics.length) throw new Error("SAM video stream incomplete or reported parser diagnostics.");
  const masks = recordsOfKind(result.records, "mask");
  const boxes = recordsOfKind(result.records, "box");
  if (!masks.length || !boxes.length) throw new Error("SAM completed without usable geometry; no video segmentation success claimed.");
  const frames = new Set<number>();
  for (const mask of masks) {
    const frame = frameIndexOf(mask);
    if (frame === undefined || frame < 0 || frame >= frameCount) throw new Error("SAM geometry has an invalid source frame index.");
    if (!boxes.some((box) => box.objectId === mask.objectId && frameIndexOf(box) === frame)) throw new Error("SAM video mask has no box for the same object and frame.");
    if (mask.mask.width * mask.mask.height > 1280 * 720) throw new Error("SAM mask exceeds the spike decode bound.");
    const raster = decodeMaskToRaster(mask.mask);
    if (!raster.some((pixel) => pixel === 1)) throw new Error("SAM video returned an empty mask.");
    frames.add(frame);
  }
  return { boxes: boxes.length, masks: masks.length, frameIndices: [...frames].sort((a, b) => a - b) };
}

export const TranscriptionSchema = z.object({
  sessionId: z.string().min(1), transcript: z.string().trim().min(1),
  audioDurationMs: z.number().finite().positive().max(20_500),
  turns: z.array(z.object({
    turnId: z.number().int(), startMs: z.number().nonnegative(), endMs: z.number().nonnegative(),
    transcript: z.string(), speaker: z.string().optional(),
  }).refine((turn) => turn.endMs >= turn.startMs, "Turn times are reversed.")).max(100),
});

/** Native fetch because Meta's ASR endpoint is not OpenAI's /audio/transcriptions. */
export async function transcribeWav(audio: Blob, apiKey: string, transport: typeof fetch = fetch, options: { mode?: "PUSH_TO_TALK" | "ENDPOINTING"; signal?: AbortSignal } = {}) {
  if (audio.size > 1_100_000) throw new Error("WAV exceeds the spike size limit.");
  inspectWav(new Uint8Array(await audio.arrayBuffer()));
  // Keep request as a JSON *field* without a filename, matching Meta's curl contract.
  // FormData.append(Blob) would instead mark it as a file part.
  const boundary = `steplint-${crypto.randomUUID()}`;
  const requestJson = JSON.stringify({ model: VOICE_MODEL, mode: options.mode ?? "PUSH_TO_TALK", audioEncoding: "WAV" });
  const body = new Blob([
    `--${boundary}\r\nContent-Disposition: form-data; name="request"\r\nContent-Type: application/json\r\n\r\n${requestJson}\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="steplint.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
    audio, `\r\n--${boundary}--\r\n`,
  ], { type: `multipart/form-data; boundary=${boundary}` });
  const response = await transport("https://api.meta.ai/v1/asr/transcribe", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "Content-Type": body.type },
    body, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000), redirect: "error",
  });
  if (!response.ok) throw new Error(`Voice Transcribe failed: HTTP ${response.status}. No retry attempted.`);
  const result = TranscriptionSchema.safeParse(await response.json());
  if (!result.success) throw new Error("Voice Transcribe response failed validation or contained no transcript.");
  return result.data;
}


export async function segmentVideoFile(client: OpenAI, mp4: Blob, media: MediaInfo, prompt: unknown) {
  buildSamVideoRequest("file-local-validation", media, prompt);
  let fileId: string | undefined;
  const started = performance.now();
  try {
    const uploaded = await client.files.create({ purpose: "user_data", file: await toFile(mp4, "steplint.mp4", { type: "video/mp4" }) });
    fileId = z.string().regex(/^file-[A-Za-z0-9_-]+$/).parse(uploaded.id);
    if (uploaded.purpose !== "user_data" || uploaded.bytes !== mp4.size) throw new Error("Uploaded file response metadata did not match the request.");
    const uploadMs = Math.round(performance.now() - started);
    const samStarted = performance.now();
    const request = buildSamVideoRequest(fileId, media, prompt);
    // Public SDK escape hatch for Meta's documented input_video extension.
    const events = await client.post<Stream<ResponsesEvent>>("/responses", { body: request, stream: true, timeout: 120_000, signal: AbortSignal.timeout(120_000), maxRetries: 0 });
    const result = await parseVideoStream(events).finalResult;
    if (!media.video) throw new Error("Video metadata required.");
    return { ...summarizeSamVideo(result, media.video.frames), uploadMs, segmentationMs: Math.round(performance.now() - samStarted) };
  } finally {
    if (fileId) {
      try {
        const deletion = await client.files.delete(fileId);
        if (!deletion.deleted) throw new Error("Deletion unconfirmed.");
      } catch {
        throw new Error(`Uploaded MP4 cleanup failed for ${fileId}; remove it from Meta storage manually. No retry attempted.`);
      }
    }
  }
}
