import { expect, it, vi } from "vitest";
import type OpenAI from "openai";
import {
  discoverGuideComponents,
  NativeFramesSchema,
} from "../src/server/guide/discovery";
import { fixture } from "./fixtures/guide";
import type { Lesson } from "../src/teach/schema";
vi.mock("server-only", () => ({}));
const image = fixture().images[0].image,
  lesson: Lesson = {
    lessonId: fixture().id,
    media: {
      info: {
        mime: "video/mp4",
        container: "mp4",
        bytes: 100,
        durationSeconds: 2,
        video: { codec: "avc", width: 640, height: 480, frames: 4, fps: 2 },
        audio: null,
      },
      frameTimesMs: [0, 500, 1000, 1500],
    },
    transcript: fixture().source.transcript,
  };
function provider(frame = 2, initiallyVisible = false, timed = false) {
  const create = vi.fn(async () => ({
    status: "completed",
    output_text: JSON.stringify({
      ...(timed
        ? {
            actions: [
              {
                instruction: "Move the tray",
                kind: "movement",
                objectIndex: 1,
                anchorIndex: null,
                visibleAfterIndices: [1],
              },
            ],
          }
        : {}),
      objects: [
        {
          description: "White tray",
          concept: "white tray",
          ...(timed ? { timestampMs: frame } : { frame }),
          role: "reference",
          material: "opaque",
          initiallyVisible,
          namesHeard: [],
          anchors: [
            timed
              ? { timestampMs: 1500, appearance: "Exposed white rim" }
              : { frame: 3, appearance: "Exposed white rim" },
          ],
        },
      ],
    }),
  }));
  return { create, client: { responses: { create } } as unknown as OpenAI };
}
it("discovers identities/appearance moments separately from coordinate grounding", async () => {
  const frames = NativeFramesSchema.parse(
      [0, 1, 2, 3].map((frame) => ({ frame, image })),
    ),
    { client, create } = provider();
  const result = await discoverGuideComponents(
    client,
    "file-reused",
    lesson,
    frames,
    new AbortController().signal,
  );
  expect(result.selections[0].frame).toBe(2);
  expect(result.profiles[0].appearances).toHaveLength(2);
  expect(create).toHaveBeenCalledTimes(1);
});
it("rejects an unsupplied source moment before another model stage", async () => {
  const { client } = provider(1);
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

it("does not replace a clear selected frame with frame zero based on an initial-visibility claim", async () => {
  const { client } = provider(2, true);
  const result = await discoverGuideComponents(
    client,
    "file-reused",
    lesson,
    [0, 2, 3].map((frame) => ({ frame, image })),
    new AbortController().signal,
  );
  expect(result.selections[0].frame).toBe(2);
});

it("can select the actual action frame between initial preview samples for staged decoding", async () => {
  const { client, create } = provider(650, false, true);
  const result = await discoverGuideComponents(
    client,
    "file-reused",
    lesson,
    [
      { frame: 0, image },
      { frame: 3, image },
    ],
    new AbortController().signal,
    "Full sequence",
    true,
  );
  expect(result.selections[0].frame).toBe(1);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      input: [
        expect.objectContaining({
          content: [
            expect.objectContaining({ type: "input_text" }),
            expect.objectContaining({ type: "input_file" }),
          ],
        }),
      ],
    }),
    expect.anything(),
  );
  const invalid = provider(9000, false, true);
  await expect(
    discoverGuideComponents(
      invalid.client,
      "file-reused",
      lesson,
      [{ frame: 0, image }],
      new AbortController().signal,
      "Full sequence",
      true,
    ),
  ).rejects.toThrow("timestamp");
});
