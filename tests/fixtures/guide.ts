import { GuideSchema, type Guide } from "../../src/guide/schema";
import { readFileSync } from "node:fs";
const image = `data:image/jpeg;base64,${readFileSync(new URL("./guide-reference.jpg", import.meta.url)).toString("base64")}`;
export function fixture(): Guide {
  return GuideSchema.parse({
    schemaVersion: 2,
    id: "ab86b72d-935c-4bbf-8363-71553ed1893a",
    revision: 1,
    parentRevision: null,
    methodId: "one",
    methodName: "Demonstrated method",
    title: "Remove the cover and phone",
    goal: "Phone outside its tray",
    initialInstruction: "Show the package on your work surface.",
    objects: [
      {
        id: "cover",
        label: "Package cover",
        description: "Visible package cover",
        initiallyVisible: true,
        sourceFrame: 0,
        sourceBox: { left: 0.1, top: 0.1, right: 0.3, bottom: 0.3 },
        appearance: null,
      },
      {
        id: "phone",
        label: "Phone",
        description: "Phone inside the tray",
        initiallyVisible: false,
        sourceFrame: 10,
        sourceBox: { left: 0.1, top: 0.5, right: 0.3, bottom: 0.7 },
        appearance: null,
      },
    ],
    steps: [
      {
        id: "remove-cover",
        instruction: "Move the cover aside",
        explanation: "Observed cover movement",
        correction: "Return the cover, then remove it first.",
        prerequisites: [],
        condition: {
          kind: "movement",
          objectId: "cover",
          anchorId: null,
          minimumChange: 0.5,
          requiredVisibleAfter: ["cover"],
        },
        evidence: {
          startFrame: 0,
          changeFrame: 5,
          endFrame: 10,
          startMs: 0,
          endMs: 1000,
          turnIds: [0],
        },
        uncertainties: [],
        supported: true,
      },
      {
        id: "remove-phone",
        instruction: "Lift out the phone",
        explanation: "Phone leaves its start position",
        correction: "Return the phone. Remove the cover before lifting it.",
        prerequisites: ["remove-cover"],
        condition: {
          kind: "movement",
          objectId: "phone",
          anchorId: null,
          minimumChange: 0.5,
          requiredVisibleAfter: ["phone"],
        },
        evidence: {
          startFrame: 11,
          changeFrame: 15,
          endFrame: 20,
          startMs: 1100,
          endMs: 2000,
          turnIds: [0],
        },
        uncertainties: [],
        supported: true,
      },
    ],
    coverage: [
      {
        instruction: "Unbox the phone",
        status: "included",
        reason: "Shown in the clip",
      },
    ],
    goalFrame: 20,
    goalStepIds: ["remove-phone"],
    goalSupported: true,
    source: {
      durationMs: 2100,
      width: 640,
      height: 480,
      frameTimesMs: Array.from({ length: 21 }, (_, i) => i * 100),
      transcript: {
        text: "Move the cover. Lift the phone.",
        durationMs: 2100,
        turns: [
          { startMs: 0, endMs: 2000, text: "Move the cover. Lift the phone." },
        ],
      },
    },
    images: [0, 5, 10, 11, 15, 20].map((frame) => ({ frame, image })),
    geometry: [],
    approval: {
      reviewer: "EXPLICIT SYNTHETIC TEST",
      at: 1,
      purpose: "rehearsal",
      testOnly: true,
      contentHash: "0".repeat(64),
    },
  });
}
