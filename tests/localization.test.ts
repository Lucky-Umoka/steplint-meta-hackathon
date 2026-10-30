import { expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { localizeGuideAnchors } from "../src/server/guide/localization";
import { fixture } from "./fixtures/guide";
import type { LessonMedia } from "../src/teach/schema";
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
const proposal = {
  id: "component-1",
  description: "Exposed white tray rim",
  frame: 1,
};
const image = fixture().images[0].image;
function provider(output: unknown) {
  const create = vi.fn(async () => ({
    status: "completed",
    output_text: JSON.stringify({
      objects: Array.isArray(output)
        ? output
        : [{ id: "component-1", ...(output as object) }],
    }),
  }));
  return { create, client: { responses: { create } } as unknown as OpenAI };
}
it("localizes one exact still on the documented normalized grid, then converts to SAM media pixels", async () => {
  const { client, create } = provider({
    visible: true,
    box: { left: 200, top: 100, right: 700, bottom: 600 },
    positive: [{ x: 250, y: 500 }],
    negative: [{ x: 900, y: 900 }],
  });
  const result = await localizeGuideAnchors(
    client,
    [proposal],
    [{ frame: 1, image }],
    media,
    new AbortController().signal,
    () => {},
  );
  expect(result.selections[0].mark).toEqual({
    kind: "box",
    left: 128,
    top: 48,
    right: 448,
    bottom: 288,
  });
  expect(result.points[0]).toEqual([
    { x: 160, y: 240 },
    { x: 576, y: 432, label: "negative" },
  ]);
  expect(create).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      input: [
        expect.objectContaining({
          content: [
            expect.objectContaining({ type: "input_text" }),
            expect.objectContaining({ type: "input_image", detail: "high" }),
          ],
        }),
      ],
    }),
    expect.anything(),
  );
});
it("does not retry hidden or contradictory object grounding", async () => {
  for (const output of [
    { visible: false, box: null, positive: [], negative: [] },
    {
      visible: true,
      box: { left: 200, top: 100, right: 700, bottom: 600 },
      positive: [{ x: 900, y: 900 }],
      negative: [],
    },
  ]) {
    const { client, create } = provider(output);
    await expect(
      localizeGuideAnchors(
        client,
        [proposal],
        [{ frame: 1, image }],
        media,
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
  }
});
it("rejects missing source frames before a paid localization request", async () => {
  const { client, create } = provider({});
  await expect(
    localizeGuideAnchors(
      client,
      [proposal],
      [],
      media,
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow("source frame");
  expect(create).not.toHaveBeenCalled();
});

it("groups parts in one image into one paid request and preserves identity despite reversed output order", async () => {
  const outline = {
    visible: true,
    box: { left: 200, top: 100, right: 700, bottom: 600 },
    positive: [{ x: 250, y: 500 }],
    negative: [],
  };
  const { client, create } = provider([
    { id: "component-2", ...outline },
    { id: "component-1", ...outline },
  ]);
  const result = await localizeGuideAnchors(
    client,
    [proposal, { ...proposal, id: "component-2", description: "Other part" }],
    [{ frame: 1, image }],
    media,
    new AbortController().signal,
    () => {},
  );
  expect(create).toHaveBeenCalledTimes(1);
  expect(result.selections.map((part) => part.id)).toEqual([
    "component-1",
    "component-2",
  ]);
});

it("reuses bounded image calls for frame-specific before/after anchors without copying points across frames", async () => {
  const outline = {
    visible: true,
    box: { left: 200, top: 100, right: 700, bottom: 600 },
    positive: [{ x: 250, y: 500 }],
    negative: [],
  };
  const { client, create } = provider([
    { id: "component-1", ...outline },
    { id: "component-2", ...outline },
  ]);
  const result = await localizeGuideAnchors(
    client,
    [
      { ...proposal, anchors: [{ frame: 0, appearance: "In container" }] },
      {
        ...proposal,
        id: "component-2",
        frame: 0,
        anchors: [{ frame: 1, appearance: "Empty container" }],
      },
    ],
    [0, 1].map((frame) => ({ frame, image })),
    media,
    new AbortController().signal,
    () => {},
  );
  expect(create).toHaveBeenCalledTimes(2);
  expect(
    result.anchors.map((views) => views.map((v) => v.selection.frame)),
  ).toEqual([
    [0, 1],
    [0, 1],
  ]);
  expect(result.selections.map((s) => s.frame)).toEqual([1, 0]);
});

it("can use a valid already-planned alternate when the primary view is hidden, with each image requested once", async () => {
  const visible = {
    visible: true,
    box: { left: 200, top: 100, right: 700, bottom: 600 },
    positive: [{ x: 250, y: 500 }],
    negative: [],
  };
  const { client, create } = provider([]);
  create.mockResolvedValueOnce({
    status: "completed",
    output_text: JSON.stringify({
      objects: [
        {
          id: "component-1",
          visible: false,
          box: null,
          positive: [],
          negative: [],
        },
      ],
    }),
  });
  create.mockResolvedValueOnce({
    status: "completed",
    output_text: JSON.stringify({
      objects: [
        { id: "component-1", ...visible },
        { id: "component-2", ...visible },
      ],
    }),
  });
  const result = await localizeGuideAnchors(
    client,
    [
      {
        ...proposal,
        frame: 0,
        anchors: [{ frame: 1, appearance: "Exposed lid" }],
      },
      { ...proposal, id: "component-2", frame: 1 },
    ],
    [0, 1].map((frame) => ({ frame, image })),
    media,
    new AbortController().signal,
    () => {},
  );
  expect(create).toHaveBeenCalledTimes(2);
  expect(result.selections.map((part) => part.frame)).toEqual([1, 1]);
  expect(result.anchors[0].map((view) => view.selection.frame)).toEqual([1]);
});
