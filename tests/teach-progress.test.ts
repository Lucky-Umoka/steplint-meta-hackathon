import { it, expect } from "vitest";
import { nextProcessingStage } from "../src/teach/progress";

it("keeps the Teach build stage on unknown messages and advances on known ones", () => {
  expect(nextProcessingStage("upload", "Uploading the reviewed recording…")).toBe(
    "upload",
  );
  expect(
    nextProcessingStage("upload", "Finding task components automatically…"),
  ).toBe("discover");
  expect(
    nextProcessingStage("discover", "Tracking received 120 geometry records…"),
  ).toBe("track");
  expect(
    nextProcessingStage("track", "Drafting candidate steps and review questions…"),
  ).toBe("draft");
  expect(nextProcessingStage("draft", "Something else")).toBe("draft");
});
