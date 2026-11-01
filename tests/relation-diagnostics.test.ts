import { expect, it } from "vitest";
import { RelationEvidenceError } from "../src/guide/relation-error";
import { buildStreamErrorEvent, classifyError } from "../src/guide/diagnostics";
it("classifies authored source failures instead of internal unknown", () => {
  const error = new RelationEvidenceError(
    "source_evidence_missing",
    "A required part has no clear source view.",
  );
  expect(classifyError(error, "model_output")).toEqual({
    failureClass: "invalid_model_data",
    code: "source_evidence_missing",
    schemaPaths: [],
  });
  const wrapper = Object.assign(
    new Error("Checking source relationships: " + error.message, {
      cause: error,
    }),
    {
      stage: "Checking source relationships",
      analysis: { cleanup: "expiry_fallback" },
    },
  );
  const result = buildStreamErrorEvent({
    analysisId: "test-1234",
    baseMessage: wrapper.message,
    error: wrapper,
    origin: "model_output",
  });
  expect(result.diagnostic).toMatchObject({
    stage: "draft",
    code: "source_evidence_missing",
    cleanup: "expiry_fallback",
  });
});
