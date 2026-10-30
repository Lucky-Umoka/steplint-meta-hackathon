import { it, expect, vi } from "vitest";
import type OpenAI from "openai";
import type { ResponsesEvent } from "@meta-sam/parser";
import {
  groundGuideSeeds,
  groundedVideoRequest,
} from "../src/server/guide/ground-seeds";
import { fixture } from "./fixtures/guide";
import type { LessonMedia, Selection } from "../src/teach/schema";
vi.mock("server-only", () => ({}));
const mask =
  "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>\n";
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
const proposal: Selection = {
  id: "component-1",
  description: "Foil-wrapped phone",
  frame: 0,
  mark: { kind: "box", left: 210, top: 227, right: 272, bottom: 256 },
};
function clientFor(text: string) {
  const post = vi.fn(async () => {
    async function* events(): AsyncIterable<ResponsesEvent> {
      const lane = { item_id: "mock", output_index: 0, content_index: 0 };
      yield { type: "response.output_text.delta", ...lane, delta: text };
      yield { type: "response.output_text.done", ...lane, text };
      yield { type: "response.completed" };
    }
    return events();
  });
  return { client: { post } as unknown as OpenAI, post };
}
it("refines a proposed image region once and derives a valid foreground point for the video prompt", async () => {
  const { client, post } = clientFor(
    "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=640;h=480;c=0.99|>" + mask,
  );
  const seeds = await groundGuideSeeds(
    client,
    [proposal],
    ["foil-wrapped rectangular object"],
    [{ frame: 0, image: fixture().images[0].image }],
    media,
    new AbortController().signal,
  );
  expect(post).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(post.mock.calls)).toContain("box");
  expect(seeds[0].point.x).toBeGreaterThanOrEqual(211);
  expect(seeds[0].point.x).toBeLessThan(271);
  expect(seeds[0].point.y).toBeGreaterThanOrEqual(228);
  const request = groundedVideoRequest("file-reused", seeds, media);
  expect(JSON.stringify(request)).toContain("file-reused");
  expect(JSON.stringify(request)).toContain("point");
  expect(request.metadata.propagation_direction).toBe("both");
});
it("does not retry an empty or low-confidence segmentation", async () => {
  for (const output of [
    "",
    "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=640;h=480;c=0.3|>" + mask,
  ]) {
    const { client, post } = clientFor(output);
    await expect(
      groundGuideSeeds(
        client,
        [proposal],
        ["wrapped object"],
        [{ frame: 0, image: fixture().images[0].image }],
        media,
        new AbortController().signal,
      ),
    ).rejects.toThrow("reliably locate");
    expect(post).toHaveBeenCalledTimes(1);
  }
});
it("rejects competing instances rather than making up an identity", async () => {
  const token = (id: number) =>
    `<0f>${id}<|box;x1=211;y1=228;x2=270;y2=254;w=640;h=480;c=0.99|>${mask}`;
  const { client, post } = clientFor(token(0) + token(1));
  await expect(
    groundGuideSeeds(
      client,
      [proposal],
      ["wrapped object"],
      [{ frame: 0, image: fixture().images[0].image }],
      media,
      new AbortController().signal,
    ),
  ).rejects.toThrow("Several similar");
  expect(post).toHaveBeenCalledTimes(1);
});
it("refuses missing native references before spending on segmentation", async () => {
  const { client, post } = clientFor("");
  await expect(
    groundGuideSeeds(
      client,
      [proposal],
      ["wrapped object"],
      [],
      media,
      new AbortController().signal,
    ),
  ).rejects.toThrow("reference");
  expect(post).not.toHaveBeenCalled();
});

it("uses documented mask confidence when box confidence is absent", async () => {
  const { client } = clientFor(
    "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=640;h=480|>" +
      mask.replace("<|mask;x=0;y=0;", "<|mask;x=0;y=0;c=0.99;"),
  );
  await expect(
    groundGuideSeeds(
      client,
      [proposal],
      ["wrapped object"],
      [{ frame: 0, image: fixture().images[0].image }],
      media,
      new AbortController().signal,
    ),
  ).resolves.toHaveLength(1);
});

it("rejects a confident outline far outside the proposed object instead of accepting a different part", async () => {
  const { client, post } = clientFor(
    "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=640;h=480;c=0.99|>" + mask,
  );
  await expect(
    groundGuideSeeds(
      client,
      [
        {
          ...proposal,
          mark: { kind: "box", left: 10, top: 10, right: 60, bottom: 60 },
        },
      ],
      ["part"],
      [{ frame: 0, image: fixture().images[0].image }],
      media,
      new AbortController().signal,
    ),
  ).rejects.toThrow("does not match");
  expect(post).toHaveBeenCalledTimes(1);
});

it("encodes multiple source views as one video request without treating proposals as verified masks", async () => {
  const { multiFrameVideoRequest } = await import(
    "../src/server/guide/ground-seeds"
  );
  const request = multiFrameVideoRequest(
    "file-one-upload",
    [[proposal, { ...proposal, frame: 1 }]],
    media,
  );
  const body = JSON.stringify(request);
  expect(body).toContain("<0f>1");
  expect(body).toContain("<1f>1");
  expect(body).toContain("file-one-upload");
  expect(body).not.toContain("point;");
  expect(request.metadata.include_confidence).toBe("true");
});
