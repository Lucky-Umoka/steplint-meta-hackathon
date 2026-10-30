import { expect, it } from "vitest";
import {
  GuideContextSchema,
  validateGuideSelections,
} from "../src/guide/source-context";
import { ContextSchema, type LessonMedia } from "../src/teach/schema";
import { fixture } from "./fixtures/guide";
it("retains six relevant parts without weakening the historical four-part contract or admitting a seventh", () => {
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
  const parts = Array.from({ length: 6 }, (_, i) => ({
    id: `component-${i + 1}`,
    description: "Needed part",
    frame: 0,
    mark: { kind: "point", x: i + 1, y: 10 },
  }));
  expect(validateGuideSelections(parts, media)).toHaveLength(6);
  const context = {
    lesson: {
      lessonId: fixture().id,
      media,
      transcript: fixture().source.transcript,
    },
    selections: parts,
    tracking: parts.map((part) => ({
      componentId: part.id,
      samples: [],
      missingFrames: 2,
    })),
  };
  expect(GuideContextSchema.safeParse(context).success).toBe(true);
  expect(ContextSchema.safeParse(context).success).toBe(false);
  expect(() =>
    validateGuideSelections(
      [...parts, { ...parts[0], id: "component-7" }],
      media,
    ),
  ).toThrow();
});
