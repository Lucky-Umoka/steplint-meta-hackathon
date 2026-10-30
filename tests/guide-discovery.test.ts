import { expect, it, vi } from "vitest";
import type OpenAI from "openai";
import {
  discoverGuideComponents,
  NativeFramesSchema,
} from "../src/server/guide/discovery";
import { fixture } from "./fixtures/guide";
import type { Lesson } from "../src/teach/schema";
vi.mock("server-only", () => ({}));
const image = fixture().images[0].image;
const media: Lesson["media"] = {
  info: {
    mime: "video/mp4",
    container: "mp4",
    bytes: 100,
    durationSeconds: 2,
    video: { codec: "avc", width: 640, height: 480, frames: 4, fps: 2 },
    audio: null,
  },
  frameTimesMs: [0, 500, 1000, 1500],
};
const lesson: Lesson = {
  lessonId: fixture().id,
  media,
  transcript: fixture().source.transcript,
};
function provider(point: { x: number; y: number }, frame = 2) {
  const create = vi.fn(async () => ({
    status: "completed",
    output_text: JSON.stringify({
      objects: [
        {
          description: "White tray rim",
          concept: "white open tray",
          frame,
          box: { left: 100, top: 200, right: 700, bottom: 800 },
          solidCenter: false,
          role: "task_part",
          namesHeard: [],
          anchors: [],
          foregroundPoints: [point],
        },
      ],
    }),
  }));
  return { create, client: { responses: { create } } as unknown as OpenAI };
}
it("accepts four bounded native frames and maps exposed foreground points to actual media pixels", async () => {
  const frames = NativeFramesSchema.parse(
    [0, 1, 2, 3].map((frame) => ({ frame, image })),
  );
  const { client, create } = provider({ x: 200, y: 700 });
  const result = await discoverGuideComponents(
    client,
    "file-reused",
    lesson,
    frames,
    new AbortController().signal,
  );
  expect(result.foregroundPoints).toEqual([[{ x: 128, y: 335 }]]);
  expect(result.selections[0].frame).toBe(2);
  expect(create).toHaveBeenCalledTimes(1);
});
it("rejects a proposed point outside the object rather than seeding background", async () => {
  const { client, create } = provider({ x: 900, y: 900 });
  await expect(
    discoverGuideComponents(
      client,
      "file-reused",
      lesson,
      [{ frame: 2, image }],
      new AbortController().signal,
    ),
  ).rejects.toThrow("outside its object");
  expect(create).toHaveBeenCalledTimes(1);
});
it("rejects a source frame the server was not supplied", async () => {
  const { client } = provider({ x: 200, y: 700 }, 1);
  await expect(
    discoverGuideComponents(
      client,
      "file-reused",
      lesson,
      [{ frame: 2, image }],
      new AbortController().signal,
    ),
  ).rejects.toThrow("source preview");
});
