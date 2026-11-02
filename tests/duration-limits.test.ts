import { expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { MediaInfoSchema, requireSamVideo } from "../src/media/inspect";
import { inspectLessonVideo } from "../src/teach/media";
import {
  mediaBudget,
  MAX_TEACH_BODY,
  MAX_WAV_BYTES,
  MAX_TEACH_VIDEO_BYTES,
  LESSON_VIDEO_BITRATE,
} from "../src/media/limits";
vi.mock("server-only", () => ({}));
const info = {
  container: "mp4",
  mime: "video/mp4",
  bytes: 100,
  durationSeconds: 60,
  video: { codec: "avc", width: 640, height: 480, frames: 600, fps: 10 },
  audio: null,
};
it.each([59, 60])("accepts %is of bounded SAM video", (seconds) => {
  expect(
    requireSamVideo({ ...info, durationSeconds: seconds }).durationSeconds,
  ).toBe(seconds);
});
it("rejects 61s and invalid/missing duration metadata", () => {
  for (const durationSeconds of [61, undefined, null, NaN, Infinity, -1])
    expect(
      MediaInfoSchema.safeParse({ ...info, durationSeconds }).success,
    ).toBe(false);
});
it("parses a real 60s/600-frame H264 fixture", async () => {
  const bytes = await readFile(
    new URL("./fixtures/teach-60s.mp4", import.meta.url),
  );
  const parsed = await inspectLessonVideo(new Blob([bytes]));
  expect(parsed.info.durationSeconds).toBe(60);
  expect(parsed.frameTimesMs).toHaveLength(600);
});
it("fits the WAV/video transport budget and rejects oversized streamed bodies", async () => {
  expect(60 * 16000 * 2 + 44).toBeLessThanOrEqual(MAX_WAV_BYTES);
  expect((LESSON_VIDEO_BITRATE * 60) / 8).toBeLessThan(MAX_TEACH_VIDEO_BYTES);
  expect(MAX_TEACH_VIDEO_BYTES + MAX_WAV_BYTES + 10000).toBeLessThan(
    MAX_TEACH_BODY,
  );
  const { boundedBody } = await import("../src/server/teach/http");
  const request = new Request("http://localhost/upload", {
    method: "POST",
    body: new Uint8Array(mediaBudget("vercel").bodyBytes + 1),
  });
  await expect(
    boundedBody(request, mediaBudget("vercel").bodyBytes),
  ).rejects.toMatchObject({ status: 413 });
});

it("reserves Vercel transport headroom without imposing that cap on other hosts", () => {
  const v = mediaBudget("vercel"),
    local = mediaBudget("standard");
  expect(v.videoBytes + MAX_WAV_BYTES + 10000).toBeLessThan(v.bodyBytes);
  expect(v.bodyBytes).toBe(4000000);
  expect(local.bodyBytes).toBeGreaterThan(v.bodyBytes);
  expect(local.videoBitrate).toBe(1000000);
});
