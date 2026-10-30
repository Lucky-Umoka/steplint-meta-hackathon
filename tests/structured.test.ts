import { it, expect, vi } from "vitest";
import {
  structuredJson,
  StructuredResponseError,
} from "../src/server/guide/structured";
vi.mock("server-only", () => ({}));
it("accepts documented output_text content when SDK convenience text is absent", () => {
  expect(
    structuredJson(
      {
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: '{"objects":[]}' }],
          },
        ],
      },
      "Discovery",
    ),
  ).toEqual({ objects: [] });
});
it("reports token exhaustion without exposing prompt, output or arbitrary error details", () => {
  try {
    structuredJson(
      {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        usage: { output_tokens: 1800 },
        output: [{ type: "reasoning", summary: "private" }],
        secret: "never shown",
      },
      "Discovery",
    );
    throw Error("Expected rejection");
  } catch (e) {
    expect(e).toBeInstanceOf(StructuredResponseError);
    const error = e as StructuredResponseError;
    expect(error.diagnostic).toEqual({
      status: "incomplete",
      reason: "max_output_tokens",
      errorCode: null,
      outputTokens: 1800,
      outputTypes: ["reasoning"],
    });
    expect(JSON.stringify(error)).not.toContain("private");
  }
});
it("rejects empty, malformed and refused results rather than claiming success", () => {
  expect(() =>
    structuredJson({ status: "completed", output_text: "" }, "Draft"),
  ).toThrow("usable");
  expect(() =>
    structuredJson({ status: "completed", output_text: "{" }, "Draft"),
  ).toThrow("JSON");
  expect(() =>
    structuredJson(
      {
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal" }] }],
      },
      "Draft",
    ),
  ).toThrow("usable");
});
