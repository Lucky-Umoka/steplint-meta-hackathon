import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { SourceFrameRequestSchema } from "../src/guide/source-stages";
import {
  PendingGuideSourceSchema,
  sourceFrames,
  analyseGuide,
} from "../src/server/guide/pipeline";
import { analyse } from "../src/server/guide/http";
import { seal } from "../src/server/teach/security";
import { deleteLessonFile } from "../src/server/teach/pipeline";
import { fixture } from "./fixtures/guide";
vi.mock("server-only", () => ({}));
vi.mock("../src/server/meta/client", () => ({
  createMetaClient: vi.fn(() => ({})),
}));
vi.mock("../src/server/teach/pipeline", async (original) => ({
  ...(await original<typeof import("../src/server/teach/pipeline")>()),
  deleteLessonFile: vi.fn(async () => {}),
}));
vi.mock("../src/server/guide/pipeline", async (original) => ({
  ...(await original<typeof import("../src/server/guide/pipeline")>()),
  analyseGuide: vi.fn(),
}));
const secret = "source-stage-tests-private-token-32-characters";
beforeEach(() => {
  vi.stubEnv("TEACH_ACCESS_TOKEN", secret);
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("Paid network forbidden");
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function source() {
  const g = fixture();
  return PendingGuideSourceSchema.parse({
    fileId: "file-one-upload",
    intent: "Full demonstrated sequence",
    lesson: {
      lessonId: g.id,
      media: {
        info: {
          mime: "video/mp4",
          container: "mp4",
          bytes: 100,
          durationSeconds: 2,
          video: { codec: "avc", width: 640, height: 480, frames: 11, fps: 5 },
          audio: null,
        },
        frameTimesMs: Array.from({ length: 11 }, (_, i) => i * 100),
      },
      transcript: g.source.transcript,
    },
    proposals: {
      selections: [
        {
          id: "component-1",
          frame: 3,
          description: "Package",
          concept: "box",
          initiallyVisible: true,
        },
      ],
      profiles: [
        {
          objectId: "component-1",
          role: "task_part",
          namesHeard: [],
          appearances: [
            { frame: 3, description: "Before" },
            { frame: 7, description: "After" },
          ],
        },
      ],
    },
  });
}
function request(form: FormData) {
  return new Request("http://localhost:3000/api/teach/guide/analyse", {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      Authorization: `Bearer ${secret}`,
    },
    body: form,
  });
}
function body(session = "owner-cli") {
  const form = new FormData();
  form.append("source", seal(source(), "guide-source-v3", session));
  return form;
}
it("requests exact nonuniform source moments without duplicate, empty or out-of-bounds indices", () => {
  expect(sourceFrames(source())).toEqual([3, 7]);
  expect(
    SourceFrameRequestSchema.safeParse({
      type: "source",
      token: "opaque",
      frames: [
        { frame: 3, timestampMs: 300 },
        { frame: 3, timestampMs: 300 },
      ],
    }).success,
  ).toBe(false);
  const malformed = source();
  malformed.proposals.profiles[0].appearances[1].frame = 99;
  expect(() => PendingGuideSourceSchema.parse(malformed)).toThrow(
    "source moment",
  );
});
it("rejects cross-session, malformed and substituted source frames before paid work", async () => {
  const other = body("someone-else");
  other.append("frames", "[]");
  expect((await analyse(request(other))).status).toBe(401);
  const missing = body();
  missing.append("frames", "[]");
  expect((await analyse(request(missing))).status).toBe(400);
  const extra = body();
  extra.append(
    "frames",
    JSON.stringify([
      { frame: 3, image: fixture().images[0].image },
      { frame: 8, image: fixture().images[0].image },
    ]),
  );
  expect((await analyse(request(extra))).status).toBe(400);
  expect(analyseGuide).not.toHaveBeenCalled();
  expect(deleteLessonFile).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("deletes a cancelled prepared upload once without re-uploading or invoking models", async () => {
  const form = body();
  form.append("discard", "true");
  const response = await analyse(request(form));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ deleted: true });
  expect(deleteLessonFile).toHaveBeenCalledExactlyOnceWith(
    {},
    "file-one-upload",
  );
  expect(analyseGuide).not.toHaveBeenCalled();
});
it("rejects a source image with incorrect dimensions before model processing", async () => {
  const form = new FormData(),
    wrong = source();
  wrong.lesson.media.info.video!.width = 320;
  wrong.lesson.media.info.video!.height = 240;
  form.append("source", seal(wrong, "guide-source-v3", "owner-cli"));
  form.append(
    "frames",
    JSON.stringify(
      [3, 7].map((frame) => ({ frame, image: fixture().images[0].image })),
    ),
  );
  expect((await analyse(request(form))).status).toBe(415);
  expect(analyseGuide).not.toHaveBeenCalled();
});

it("continues from the signed source upload rather than uploading or transcribing it again", async () => {
  const prepared = source(),
    form = body();
  form.append(
    "frames",
    JSON.stringify(
      [3, 7].map((frame) => ({ frame, image: fixture().images[0].image })),
    ),
  );
  vi.mocked(analyseGuide).mockResolvedValue({
    guide: { ...fixture(), approval: null },
    context: { lesson: prepared.lesson, selections: [], tracking: [] },
  });
  const response = await analyse(request(form));
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(events.at(-1)?.type).toBe("draft");
  expect(analyseGuide).toHaveBeenCalledTimes(1);
  expect(vi.mocked(analyseGuide).mock.calls[0][8]?.fileId).toBe(
    "file-one-upload",
  );
  expect(fetch).not.toHaveBeenCalled();
});
