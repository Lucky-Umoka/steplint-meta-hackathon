import { it, expect } from "vitest";
import { reportedConfidence } from "../src/server/guide/quality";
it("keeps confidence unknown if none was actually reported", () => {
  expect(reportedConfidence(undefined, undefined)).toBeNull();
  expect(reportedConfidence(NaN, 0.99)).toBeNull();
});
it("uses a reported mask or box field, and the weaker confidence when both exist", () => {
  expect(reportedConfidence(undefined, 0.96)).toBe(0.96);
  expect(reportedConfidence(0.95, undefined)).toBe(0.95);
  expect(reportedConfidence(0.4, 0.99)).toBe(0.4);
  expect(reportedConfidence(0.99, 0.4)).toBe(0.4);
});
