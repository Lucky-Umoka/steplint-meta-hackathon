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
function eventStream(text: string) {
  async function* events(): AsyncIterable<ResponsesEvent> {
    const lane = { item_id: "mock", output_index: 0, content_index: 0 };
    yield { type: "response.output_text.delta", ...lane, delta: text };
    yield { type: "response.output_text.done", ...lane, text };
    yield { type: "response.completed" };
  }
  return events();
}
function clientFor(text: string) {
  const post = vi.fn(async () => eventStream(text));
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
  expect(body).toContain("box;x1=210;y1=227;x2=271;y2=255");
  expect(request.metadata.include_confidence).toBe("true");
});

it("keeps positive and negative points tied to their actual source frame", async () => {
  const { multiFrameVideoRequest } = await import(
    "../src/server/guide/ground-seeds"
  );
  const request = multiFrameVideoRequest(
    "file-one-upload",
    [[proposal, { ...proposal, frame: 1 }]],
    media,
    [
      [
        [{ x: 100, y: 100 }],
        [
          { x: 120, y: 110 },
          { x: 130, y: 120, label: "negative" },
        ],
      ],
    ],
  );
  const text = request.input[0].content[0].text;
  if (typeof text !== "string") throw Error("Missing SAM object prompt.");
  expect(text).toContain("<0f>1");
  expect(text).toContain("<1f>1");
  const [before, after] = text.split("<1f>");
  expect(before).toContain("point;x=100;y=100");
  expect(before).not.toContain("point;x=120");
  expect(after).toContain("point;x=120;y=110");
  expect(after).toContain("-<|point;x=130;y=120");
});

it("encodes six manually corrected V2 parts with official prompts without changing the legacy four-part contract", async () => {
  const { guideSelectionRequest } = await import(
    "../src/server/guide/ground-seeds"
  );
  const parts = Array.from({ length: 6 }, (_, i) => ({
    ...proposal,
    id: `component-${i + 1}`,
    mark: { kind: "point" as const, x: 100 + i, y: 120 },
  }));
  const request = guideSelectionRequest("file-one-upload", parts, media);
  expect(request.input[0].content[0].text).toContain("6<|point;x=105;y=120");
  expect(() =>
    guideSelectionRequest(
      "file-one-upload",
      [...parts, { ...parts[0], id: "component-7" }],
      media,
    ),
  ).toThrow();
});

it("uses a single noun concept to get an independent SAM mask instead of reusing a proposed hand point", async () => {
  const { client, post } = clientFor(
    "<0f>0<|box;x1=65;y1=65;x2=124;y2=91;w=190;h=157;c=0.99|>" + mask,
  );
  const seeds = await groundGuideSeeds(
    client,
    [proposal],
    ["phone"],
    [{ frame: 0, image: fixture().images[0].image }],
    media,
    new AbortController().signal,
    undefined,
    [[{ x: 1, y: 1 }]],
    "concept",
  );
  expect(post).toHaveBeenCalledTimes(1);
  const wire = JSON.stringify(post.mock.calls);
  expect(wire).toContain('"text":"phone"');
  expect(wire).not.toContain("point;x=1;y=1");
  expect(seeds[0].point.x).toBeGreaterThanOrEqual(211);
  const invalid = clientFor("");
  await expect(
    groundGuideSeeds(
      invalid.client,
      [proposal],
      ["phone, screwdriver"],
      [{ frame: 0, image: fixture().images[0].image }],
      media,
      new AbortController().signal,
      undefined,
      undefined,
      "concept",
    ),
  ).rejects.toThrow("one short object concept");
  expect(invalid.post).not.toHaveBeenCalled();
});

it("requires a unique semantic match inside the coarse crop even when extents differ", async () => {
  const token = (id: number, box: string) =>
    `<0f>${id}<|box;${box};w=190;h=157;c=0.99|>${mask}`;
  const narrow = "x1=90;y1=61;x2=99;y2=96";
  const run = (client: OpenAI) =>
    groundGuideSeeds(
      client,
      [proposal],
      ["screwdriver"],
      [{ frame: 0, image: fixture().images[0].image }],
      media,
      new AbortController().signal,
      undefined,
      undefined,
      "concept",
    );
  const single = clientFor(token(0, narrow));
  const seed = await run(single.client);
  expect(seed[0].selection.mark).toMatchObject({
    left: 236,
    top: 224,
    right: 246,
    bottom: 260,
  });
  expect(seed[0].point.x).toBeGreaterThanOrEqual(236);
  expect(seed[0].point.x).toBeLessThan(246);
  const competing = clientFor(
    token(0, narrow) + token(1, "x1=65;y1=65;x2=124;y2=91"),
  );
  await expect(run(competing.client)).rejects.toThrow("Several similar");
  expect(competing.post).toHaveBeenCalledTimes(1);
  const outside = clientFor(token(0, "x1=154;y1=67;x2=173;y2=81"));
  await expect(run(outside.client)).rejects.toThrow("does not match");
});

it("runs each predetermined view once and retains only actual reliable masks", async () => {
  const { groundPlannedGuideViews } = await import(
    "../src/server/guide/ground-seeds"
  );
  const token = (score: number) =>
    `<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=640;h=480;c=${score}|>${mask}`;
  const plan = [0, 1].map((frame) => ({
    selection: { ...proposal, frame },
    concept: "object",
    mode: "box" as const,
  }));
  const frames = [0, 1].map((frame) => ({
    frame,
    image: fixture().images[0].image,
  }));
  const provider = clientFor(token(0.3));
  provider.post
    .mockResolvedValueOnce(eventStream(token(0.3)))
    .mockResolvedValueOnce(eventStream(token(0.99)));
  const report = vi.fn();
  const result = await groundPlannedGuideViews(
    provider.client,
    plan,
    frames,
    media,
    new AbortController().signal,
    report,
  );
  expect(provider.post).toHaveBeenCalledTimes(2);
  expect(result[0].views.map((view) => view.selection.frame)).toEqual([1]);
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({ frame: 0, available: false }),
  );
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({ frame: 1, available: true }),
  );
  const bad = clientFor(token(0.3));
  await expect(
    groundPlannedGuideViews(
      bad.client,
      plan,
      frames,
      media,
      new AbortController().signal,
    ),
  ).rejects.toThrow("planned views");
  expect(bad.post).toHaveBeenCalledTimes(2);
  const unconfirmed = clientFor(token(0.3));
  const optional = await groundPlannedGuideViews(
    unconfirmed.client,
    plan,
    frames,
    media,
    new AbortController().signal,
    undefined,
    { requireEveryObject: false },
  );
  expect(optional).toEqual([]); // No invented mask, box, point, or observation from rejected checks.
  expect(unconfirmed.post).toHaveBeenCalledTimes(2);
  const broken = clientFor("");
  broken.post.mockRejectedValueOnce(Error("connection failed"));
  await expect(
    groundPlannedGuideViews(
      broken.client,
      plan,
      frames,
      media,
      new AbortController().signal,
    ),
  ).rejects.toThrow("connection failed");
  expect(broken.post).toHaveBeenCalledTimes(1);
  const duplicate = clientFor("");
  await expect(
    groundPlannedGuideViews(
      duplicate.client,
      [plan[0], plan[0]],
      frames,
      media,
      new AbortController().signal,
    ),
  ).rejects.toThrow("bounded");
  expect(duplicate.post).not.toHaveBeenCalled();
});
