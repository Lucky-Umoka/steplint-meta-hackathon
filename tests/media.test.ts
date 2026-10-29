import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { parseVideoStream, type ResponsesEvent } from "@meta-sam/parser";
import { inspectMedia, inspectWav, requireSamVideo, type MediaInfo } from "../src/media/inspect";
import { extractWav, createMp4 } from "../src/media/convert";
import { buildSamVideoRequest, segmentVideoFile, summarizeSamVideo, transcribeWav } from "../src/server/meta/media";

vi.mock("server-only", () => ({}));
beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Live network forbidden"); })));
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

function makeWav(rate = 48_000, channels = 2, seconds = 10) {
  const dataSize = rate * channels * seconds * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) => [...value].forEach((c, i) => { bytes[offset + i] = c.charCodeAt(0); });
  ascii(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); ascii(36, "data"); view.setUint32(40, dataSize, true);
  for (let sample = 0; sample < dataSize / 2; sample++) view.setInt16(44 + sample * 2, Math.round(1000 * Math.sin(sample / channels / rate * 440 * Math.PI * 2)), true);
  return bytes;
}
const media: MediaInfo = {
  mime: "video/mp4; codecs=avc1.42001e,mp4a.40.2", container: "mp4", bytes: 100,
  durationSeconds: 10, video: { codec: "avc", width: 640, height: 480, frames: 150, fps: 15 },
  audio: { codec: "aac", channels: 1, sampleRate: 48000 },
};

describe("media bytes and format bounds", () => {
  it.each([16_000, 24_000])("accepts mono signed PCM16 WAV at %i Hz", (rate) => {
    expect(inspectWav(makeWav(rate, 1))).toMatchObject({ sampleRate: rate, channels: 1, bitsPerSample: 16, durationSeconds: 10 });
  });
  it("rejects stereo, wrong sample rate, too short, too long, empty and forged WAV", () => {
    for (const data of [makeWav(), makeWav(48000, 1), makeWav(16000, 1, 1), makeWav(24000, 1, 21), new Uint8Array(), new Uint8Array(100)]) {
      expect(() => inspectWav(data)).toThrow();
    }
  });
  it("rejects broken RIFF sizes, truncated chunks, floats, and inconsistent byte rates", () => {
    for (const [offset, value] of [[4, 1], [16, 999999], [20, 3], [28, 42], [32, 4], [34, 32]]) {
      const bytes = makeWav(24000, 1); new DataView(bytes.buffer).setUint32(offset, value, true);
      expect(() => inspectWav(bytes)).toThrow();
    }
  });
  it("converts actual stereo 48 kHz PCM bytes to mono 24 kHz PCM16 using Mediabunny", async () => {
    const result = await extractWav(new Blob([makeWav()]), new AbortController().signal);
    expect(result.info).toMatchObject({ channels: 1, sampleRate: 24000, bitsPerSample: 16 });
    expect(result.info.durationSeconds).toBeCloseTo(10, 1);
    const parsed = await inspectMedia(result.blob);
    expect(parsed.audio).toMatchObject({ codec: "pcm-s16", channels: 1, sampleRate: 24000 });
  });
  it("honors cancellation without producing an artifact", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(extractWav(new Blob([makeWav()]), controller.signal)).rejects.toThrow();
  });
  it("rejects fake MP4 bytes regardless of the browser MIME hint", async () => {
    await expect(inspectMedia(new Blob(["not an MP4"], { type: "video/mp4" }))).rejects.toThrow();
  });
  it("rejects failed H.264 probe before conversion", async () => {
    await expect(createMp4(new Blob(["fake"]), { h264: false, aac: false, pcm: true }, new AbortController().signal)).rejects.toThrow("H.264 encoding probe failed");
  });
  it("accepts validated MP4/H.264 metadata with optional AAC", () => {
    expect(requireSamVideo(media).video?.codec).toBe("avc");
    expect(requireSamVideo({ ...media, audio: null }).audio).toBeNull();
  });
  it.each([
    { container: "webm" }, { bytes: 20_000_001 }, { durationSeconds: 9 }, { durationSeconds: 21 },
    { video: { ...media.video, codec: "vp9" } }, { video: { ...media.video, frames: 601 } },
    { video: { ...media.video, width: 1920, height: 1080 } }, { audio: { ...media.audio, codec: "opus" } },
  ])("rejects out-of-contract video %j", (patch) => { expect(() => requireSamVideo({ ...media, ...patch })).toThrow(); });
});

// Official parser README example; the SAM License is retained under docs/licenses.
const geometry = (frame: number) => `<${frame}f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>` +
  "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>\n";
function eventsFor(text: string, complete = true): ResponsesEvent[] {
  const lane = { item_id: "mock-message", output_index: 0, content_index: 0 };
  return [
    { type: "response.output_text.delta", ...lane, delta: text.slice(0, 15) },
    { type: "response.output_text.delta", ...lane, delta: text.slice(15) },
    { type: "response.output_text.done", ...lane, text },
    ...(complete ? [{ type: "response.completed" as const }] : []),
  ];
}
async function* iterable(events: ResponsesEvent[]) { yield* events; }

describe("Meta video contracts (mocked events)", () => {
  it("builds uploaded input_video requests with a single concept", () => {
    const body = buildSamVideoRequest("file-test", media, { kind: "concept", text: "red latch" });
    expect(body).toMatchObject({ model: "sam-3.1", stream: true, metadata: { mask_encoding: "one_bit" } });
    expect(body.input[0].content).toEqual([{ type: "input_text", text: "red latch" }, { type: "input_video", file_id: "file-test" }]);
  });
  it("uses official buildObjectPrompt with source-frame indices and pixel coordinates", () => {
    const body = buildSamVideoRequest("file-test", media, { kind: "frames", prompts: [{ frame: 7, points: [{ x: 10, y: 20 }] }] });
    expect(body.input[0].content[0].text).toContain("<7f>1<|point;x=10;y=20;w=640;h=480|>");
    expect(body.metadata.propagation_direction).toBe("forward");
  });
  it.each([{ frame: 150, points: [{ x: 10, y: 20 }] }, { frame: 0, points: [{ x: 640, y: 20 }] }])("rejects out-of-range frame prompts %j", (prompt) => {
    expect(() => buildSamVideoRequest("file-test", media, { kind: "frames", prompts: [prompt] })).toThrow();
  });
  it("keys parsed geometry by actual frame markers, including out-of-order frames", async () => {
    const parsed = await parseVideoStream(iterable(eventsFor(geometry(7) + geometry(2)))).finalResult;
    expect(summarizeSamVideo(parsed, 150)).toEqual({ boxes: 2, masks: 2, frameIndices: [2, 7] });
  });
  it("does not accept incomplete streams, out-of-range geometry, or zero matches as smoke success", async () => {
    for (const events of [eventsFor(geometry(0), false), eventsFor(geometry(150)), eventsFor("")]) {
      const result = await parseVideoStream(iterable(events)).finalResult;
      expect(() => summarizeSamVideo(result, 150)).toThrow();
    }
  });
  it.each([false, true])("uploads once, uses SDK SSE parsing, and deletes even on SAM failure=%s", async (fail) => {
    const calls: string[] = [];
    const mp4 = new Blob(["bounded fixture bytes"], { type: "video/mp4" });
    const transport: typeof fetch = async (input, init) => {
      // SDK probes its fetch adapter with a data URL; this is not a network request.
      if (input === "data:,") return new Response("");
      const request = new Request(input, init);
      const route = `${request.method} ${new URL(request.url).pathname}`;
      calls.push(route);
      if (route === "POST /v1/files") {
        const form = await request.formData();
        expect(form.get("purpose")).toBe("user_data");
        expect(form.get("file")).toBeInstanceOf(File);
        return Response.json({ id: "file-test", object: "file", bytes: mp4.size, purpose: "user_data", status: "uploaded" });
      }
      if (route === "DELETE /v1/files/file-test") return Response.json({ id: "file-test", deleted: true });
      if (route === "POST /v1/responses") {
        const body: unknown = await request.json();
        expect(body).toMatchObject({ input: [{ content: [{ type: "input_text" }, { type: "input_video", file_id: "file-test" }] }], stream: true });
        if (fail) return Response.json({ error: { message: "mock failure" } }, { status: 500 });
        return new Response(eventsFor(geometry(0)).map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
      }
      throw new Error("Unexpected mocked route");
    };
    const client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: "mock-only", fetch: transport, maxRetries: 0 });
    const promise = segmentVideoFile(client, mp4, media, { kind: "concept", text: "red latch" });
    if (fail) await expect(promise).rejects.toThrow();
    else expect((await promise).frameIndices).toEqual([0]);
    expect(calls).toEqual(["POST /v1/files", "POST /v1/responses", "DELETE /v1/files/file-test"]);
  });
});

describe("Muse Voice Transcribe contract (mocked transport)", () => {
  it("posts request JSON and audio multipart fields to the exact ASR endpoint", async () => {
    const transport: typeof fetch = async (url, options) => {
      expect(url).toBe("https://api.meta.ai/v1/asr/transcribe");
      expect(options?.method).toBe("POST");
      expect(options?.headers).toMatchObject({ Authorization: "Bearer mock-only", Accept: "application/json" });
      const requestBody = new Request(url, options);
      const raw = await requestBody.clone().text();
      expect(raw).toContain('name="request"\r\nContent-Type: application/json');
      const form = await requestBody.formData();
      const request = form.get("request");
      if (typeof request !== "string") throw new Error("Expected a JSON field, not a file part");
      expect(JSON.parse(request)).toEqual({ model: "muse-voice-transcribe-1.0", mode: "PUSH_TO_TALK", audioEncoding: "WAV" });
      expect(form.get("audio")).toBeInstanceOf(File);
      return Response.json({ sessionId: "mock-session", transcript: "Place the blue base.", audioDurationMs: 10000, turns: [] });
    };
    expect((await transcribeWav(new Blob([makeWav(24000, 1)]), "mock-only", transport)).transcript).toBe("Place the blue base.");
  });
  it("rejects invalid WAV bytes before any transport request", async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(transcribeWav(new Blob(["fake WAV"]), "mock-only", transport)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it("rejects HTTP failure without echoing provider secrets, with no retry", async () => {
    let calls = 0;
    const transport: typeof fetch = async () => { calls++; return new Response("private upstream body", { status: 401 }); };
    await expect(transcribeWav(new Blob([makeWav(24000, 1)]), "mock-only", transport)).rejects.toThrow("HTTP 401");
    expect(calls).toBe(1);
  });
  it("rejects malformed or empty transcription responses", async () => {
    for (const data of [{}, { sessionId: "x", transcript: "", audioDurationMs: 10000, turns: [] }]) {
      const transport: typeof fetch = async () => Response.json(data);
      await expect(transcribeWav(new Blob([makeWav(24000, 1)]), "mock-only", transport)).rejects.toThrow("validation");
    }
  });
});
