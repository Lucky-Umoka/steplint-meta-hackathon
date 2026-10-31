import { expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { refineSourceView } from "../src/server/guide/refine-source";
import { fixture } from "./fixtures/guide";
import type { LessonMedia, Selection } from "../src/teach/schema";
vi.mock("server-only", () => ({}));
const media: LessonMedia = {
  info: {
    mime: "video/mp4",
    container: "mp4",
    bytes: 100,
    durationSeconds: 2,
    video: { codec: "avc", width: 640, height: 480, frames: 2, fps: 1 },
    audio: null,
  },
  frameTimesMs: [0, 1000],
};
const selection: Selection = {
  id: "component-1",
  description: "small screwdriver",
  frame: 1,
  mark: { kind: "box", left: 210, top: 227, right: 272, bottom: 256 },
};
it("projects a distinct cropped outline and signed points back into the source image", async () => {
  const create = vi.fn(async () => ({
    status: "completed",
    output_text: JSON.stringify({
      objects: [
        {
          id: selection.id,
          visible: true,
          box: { left: 200, top: 200, right: 800, bottom: 800 },
          positive: [{ x: 500, y: 500 }],
          negative: [{ x: 0, y: 0 }],
        },
      ],
    }),
  }));
  const out = await refineSourceView(
    { responses: { create } } as unknown as OpenAI,
    selection,
    "screwdriver",
    fixture().images[0].image,
    media,
    new AbortController().signal,
    () => {},
  );
  expect(out.selection.frame).toBe(1);
  expect(out.selection.mark).toEqual({
    kind: "box",
    left: 184,
    top: 194,
    right: 298,
    bottom: 289,
  });
  expect(out.points).toEqual([
    { x: 241, y: 242 },
    { x: 146, y: 163, label: "negative" },
  ]);
  expect(create).toHaveBeenCalledTimes(1);
});
it("does not fall back or retry when the close-up cannot identify the object", async () => {
  const create = vi.fn(async () => ({
    status: "completed",
    output_text: JSON.stringify({
      objects: [
        {
          id: selection.id,
          visible: false,
          box: null,
          positive: [],
          negative: [],
        },
      ],
    }),
  }));
  await expect(
    refineSourceView(
      { responses: { create } } as unknown as OpenAI,
      selection,
      "screwdriver",
      fixture().images[0].image,
      media,
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow("clear outline");
  expect(create).toHaveBeenCalledTimes(1);
});
