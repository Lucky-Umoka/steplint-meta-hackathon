/** Provider boundary simulation only; no real recording/model result is fabricated. */
import { expect, it, vi } from "vitest";
import type OpenAI from "openai";
import type { ResponsesEvent } from "@meta-sam/parser";
import {
  analyseGuide,
  PendingGuideSourceSchema,
} from "../src/server/guide/pipeline";
import { fixture } from "./fixtures/guide";
vi.mock("server-only", () => ({}));
it.each([0.99, 0.3])(
  "uses boxed proposals without treating rejected image masks as video evidence (score %s)",
  async (score) => {
    const image = fixture().images[0].image;
    const source = PendingGuideSourceSchema.parse({
      fileId: "file-reused",
      intent: "Visible phone removal",
      lesson: {
        lessonId: fixture().id,
        media: {
          info: {
            mime: "video/mp4",
            container: "mp4",
            bytes: 100,
            durationSeconds: 2,
            video: { codec: "avc", width: 640, height: 480, frames: 2, fps: 1 },
            audio: null,
          },
          frameTimesMs: [0, 1000],
        },
        transcript: fixture().source.transcript,
      },
      proposals: {
        selections: [
          {
            id: "component-1",
            frame: 0,
            description: "Wrapped phone",
            concept: "phone",
            initiallyVisible: true,
          },
        ],
        profiles: [
          {
            objectId: "component-1",
            role: "task_part",
            material: "reflective",
            namesHeard: [],
            appearances: [{ frame: 0, description: "Reflective wrapper" }],
          },
        ],
      },
    });
    const create = vi.fn(async () => ({
      status: "completed",
      output_text: JSON.stringify({
        objects: [
          {
            id: "component-1",
            visible: true,
            box: { left: 328, top: 473, right: 425, bottom: 534 },
            positive: [{ x: 375, y: 500 }],
            negative: [],
          },
        ],
      }),
    }));
    const post = vi.fn(
      async (
        _path: string,
        options: {
          body: { input: { content: { type: string; text?: string }[] }[] };
        },
      ) => {
        if (
          !options.body.input[0].content.some((c) => c.type === "input_image")
        )
          throw Error("STOP BEFORE LIVE VIDEO");
        async function* stream(): AsyncIterable<ResponsesEvent> {
          const text =
            "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=640;h=480;c=" +
            score +
            "|><|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>\n";
          const lane = { item_id: "test", output_index: 0, content_index: 0 };
          yield { type: "response.output_text.delta", ...lane, delta: text };
          yield { type: "response.output_text.done", ...lane, text };
          yield { type: "response.completed" };
        }
        return stream();
      },
    );
    const remove = vi.fn(async () => ({ deleted: true }));
    const client = {
      responses: { create },
      post,
      files: { delete: remove },
    } as unknown as OpenAI;
    await expect(
      analyseGuide(
        client,
        new Blob(),
        new Blob(),
        () => {},
        new AbortController().signal,
        undefined,
        [{ frame: 0, image }],
        source.intent,
        source,
      ),
    ).rejects.toThrow("Tracking objects");
    expect(post).toHaveBeenCalledTimes(2);
    const prompt = post.mock.calls[0][1].body.input[0].content[0].text;
    expect(prompt).toContain("<|box;");
    expect(prompt).not.toContain("point;");
    expect(create).toHaveBeenCalledTimes(1);
    expect(prompt).not.toBe("phone");
    expect(remove).toHaveBeenCalledExactlyOnceWith("file-reused");
  },
);
