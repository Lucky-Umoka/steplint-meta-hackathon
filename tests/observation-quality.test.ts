import { expect, it } from "vitest";
import {
  createObservationQuality,
  recordObservationQuality,
  evidenceAvailability,
} from "../src/guide/observation-quality";
import type { GuideObservation } from "../src/guide/schema";
it("reports measured missing/ambiguous evidence without manufacturing accuracy or duplicate samples", () => {
  const quality = createObservationQuality();
  expect(evidenceAvailability(quality).usableFraction).toBeNull();
  const frame: GuideObservation = {
    id: "one",
    timestampMs: 100,
    cameraEpoch: "camera",
    objects: [
      {
        objectId: "part",
        quality: "observed",
        box: { left: 0.1, top: 0.1, right: 0.2, bottom: 0.2 },
        score: 0.99,
      },
    ],
  };
  recordObservationQuality(quality, frame, ["part", "part"]);
  recordObservationQuality(quality, frame, ["part"]);
  recordObservationQuality(
    quality,
    {
      ...frame,
      id: "two",
      timestampMs: 200,
      objects: [
        { ...frame.objects[0], quality: "ambiguous", score: null, box: null },
      ],
    },
    ["part"],
  );
  recordObservationQuality(
    quality,
    { ...frame, id: "three", timestampMs: 300, objects: [] },
    ["part"],
  );
  expect(evidenceAvailability(quality)).toMatchObject({
    checked: 3,
    usable: 1,
    ambiguous: 1,
    missing: 1,
    usableFraction: 1 / 3,
    uncertainFraction: 2 / 3,
  });
});
