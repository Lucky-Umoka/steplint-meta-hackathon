import type { TeachContext, TeachDraft } from "../../src/teach/schema";
export function localFixture() {
  const id = "00000000-0000-4000-8000-000000000042";
  const context: TeachContext = {
    lesson: {
      lessonId: id,
      media: {
        info: {
          container: "mp4",
          mime: "video/mp4",
          bytes: 100,
          durationSeconds: 2,
          video: { codec: "avc", width: 320, height: 240, frames: 3, fps: 15 },
          audio: { codec: "aac", sampleRate: 48000, channels: 1 },
        },
        frameTimesMs: [0, 100, 200],
      },
      transcript: {
        text: "Move the neutral object into the destination.",
        durationMs: 2000,
        turns: [{ startMs: 0, endMs: 200, text: "Move the object." }],
      },
    },
    selections: [
      {
        id: "component-1",
        description: "Neutral textured object",
        frame: 0,
        mark: { kind: "box", left: 48, top: 72, right: 112, bottom: 156 },
      },
    ],
    tracking: [
      {
        componentId: "component-1",
        missingFrames: 0,
        samples: [0.15, 0.4, 0.65].map((left, frame) => ({
          frame,
          timestampMs: frame * 100,
          box: { left, top: 0.3, right: left + 0.2, bottom: 0.65 },
          confidence: 0.99,
          maskPixels: 100,
        })),
      },
    ],
  };
  const source = {
    sourceId: id,
    timestampMs: 0,
    description: "Synthetic source reference",
  };
  const draft: TeachDraft = {
    procedure: {
      id,
      version: 1,
      title: "Synthetic neutral object transfer",
      approval: null,
      components: [{ id: "component-1", description: "Neutral textured object" }],
      zones: [
        { id: "origin", description: "Starting position" },
        { id: "destination", description: "Final position" },
      ],
      steps: [
        {
          id: "transfer",
          description: "Transfer the object to its destination",
          prerequisites: [],
          condition: {
            kind: "enters_zone",
            componentId: "component-1",
            fromZone: "origin",
            toZone: "destination",
            minimumConfidence: 0.9,
          },
          forbiddenTransitions: [],
          source,
          recovery: {
            instruction: "Return the object to its destination.",
            source,
          },
        },
      ],
    },
    notes: [
      {
        stepId: "transfer",
        explanation: "Synthetic measured transfer",
        candidateErrors: [],
        uncertainties: ["Human must review this synthetic test."],
        supportingFrames: [0, 1, 2],
      },
    ],
  };
  return { context, draft };
}
