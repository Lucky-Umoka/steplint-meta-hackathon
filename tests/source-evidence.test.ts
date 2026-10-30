import { expect, it } from "vitest";
import { sourceEvidence } from "../src/guide/evidence";
import { GuideSchema } from "../src/guide/schema";
import { fixture } from "./fixtures/guide";
it("measures real coverage and never bridges a low-confidence or missing source frame", () => {
  const quality = sourceEvidence([
    {
      componentId: "part",
      missingFrames: 1,
      samples: [0, 1, 2, 3, 4, 6, 7, 8, 9].map((frame) => ({
        frame,
        timestampMs: frame * 100,
        confidence: frame === 3 ? 0.4 : 0.99,
        maskPixels: 20,
        box: {
          left: 0.1 + frame * 0.01,
          top: 0.1,
          right: 0.3 + frame * 0.01,
          bottom: 0.3,
        },
      })),
    },
  ])[0];
  expect(quality.observedFrames).toBe(9);
  expect(quality.trustedFrames).toBe(8);
  expect(quality.longestTrustedRun).toBe(4);
  expect(quality.windows).toHaveLength(1);
  expect(quality.windows[0]).toMatchObject({ startFrame: 6, endFrame: 9 });
});
it("keeps literal spoken names and actual appearance frames, rejecting invented source attribution", () => {
  const guide = fixture();
  guide.objects[0].profile = {
    role: "task_part",
    namesHeard: [{ name: guide.source.transcript.turns[0].text, turnId: 0 }],
    appearances: [{ frame: 0, description: "Cover in the starting scene" }],
  };
  expect(GuideSchema.safeParse(guide).success).toBe(true);
  guide.objects[0].profile.namesHeard = [
    { name: "an invented brand never spoken", turnId: 0 },
  ];
  expect(GuideSchema.safeParse(guide).success).toBe(false);
});
