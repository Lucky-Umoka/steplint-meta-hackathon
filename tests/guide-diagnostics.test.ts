import { it, expect, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
import { TeachError, TeachStageError } from "../src/server/teach/security";
import {
  DiagnosticBundleSchema,
  StreamErrorEventSchema,
  buildStreamErrorEvent,
  classifyError,
  stageKeyFor,
} from "../src/guide/diagnostics";

const providerDiagnostic = {
  status: "incomplete",
  reason: "max_output_tokens",
  errorCode: null,
  outputTokens: 12288,
  outputTypes: ["reasoning"],
};

it("classifies model-output schema failures with paths and no user values", () => {
  const parsed = z
    .strictObject({ steps: z.array(z.string()) })
    .safeParse({ steps: [123], leaked: "sk-secret-value" });
  expect(parsed.success).toBe(false);
  const classified = classifyError(
    parsed.success ? null : parsed.error,
    "model_output",
  );
  expect(classified.failureClass).toBe("invalid_model_data");
  expect(classified.code).toBe("zod_schema");
  expect(classified.schemaPaths).toEqual(["steps.0", "(root)"]);
  const event = buildStreamErrorEvent({
    analysisId: "11111111-2222-3333-4444-555555555555",
    baseMessage: "The proposed guide has malformed rules or source evidence.",
    error: parsed.success ? null : parsed.error,
    origin: "model_output",
  });
  expect(JSON.stringify(event)).not.toContain("sk-secret-value");
  expect(event.message).toContain("Reference: 11111111");
});

it("classifies request schema failures as invalid input", () => {
  const parsed = z.strictObject({ frame: z.number() }).safeParse({ frame: "x" });
  const classified = classifyError(
    parsed.success ? null : parsed.error,
    "request",
  );
  expect(classified.failureClass).toBe("invalid_input");
  expect(classified.code).toBe("zod_schema");
  expect(classified.schemaPaths).toEqual(["frame"]);
});

it("distinguishes truncated, incomplete, network, timeout, cancel and rate-limit failures", () => {
  expect(
    classifyError({ diagnostic: providerDiagnostic }, "model_output"),
  ).toMatchObject({
    failureClass: "provider_incomplete",
    code: "truncated_output",
  });
  expect(
    classifyError(
      { diagnostic: { ...providerDiagnostic, reason: "content_filter" } },
      "model_output",
    ).code,
  ).toBe("incomplete_response");
  const connection = new Error("socket hang up");
  connection.name = "APIConnectionError";
  expect(classifyError(connection, "model_output")).toMatchObject({
    failureClass: "provider_unavailable",
    code: "connection_failed",
  });
  const timeout = new Error("timed out");
  timeout.name = "TimeoutError";
  expect(classifyError(timeout, "model_output").code).toBe("request_timeout");
  const abort = new Error("aborted");
  abort.name = "AbortError";
  expect(classifyError(abort, "model_output")).toMatchObject({
    failureClass: "cancelled",
    code: "cancelled",
  });
  expect(
    classifyError({ status: 429, message: "slow down" }, "model_output"),
  ).toMatchObject({
    failureClass: "provider_rate_limited",
    code: "rate_limited",
  });
  expect(
    classifyError({ status: 500, message: "bad gateway" }, "model_output"),
  ).toMatchObject({ failureClass: "provider_error", code: "http_error" });
});

it("maps malformed JSON, auth, configuration and unknown failures to distinct classes", () => {
  expect(
    classifyError(new SyntaxError("Unexpected token"), "request"),
  ).toMatchObject({ failureClass: "invalid_input", code: "malformed_json" });
  expect(classifyError(new TeachError(401, "Unlock first."), "request")).toMatchObject({
    failureClass: "auth",
    code: "unauthorized",
  });
  expect(
    classifyError(new TeachError(403, "Cross-origin."), "request").code,
  ).toBe("forbidden_origin");
  expect(
    classifyError(
      new Error("MODEL_API_KEY is required for model requests."),
      "model_output",
    ),
  ).toMatchObject({
    failureClass: "configuration",
    code: "missing_credentials",
  });
  const unknown = classifyError(new Error("boom sk-live-secret"), "request");
  expect(unknown).toMatchObject({
    failureClass: "internal",
    code: "unknown",
  });
  const event = buildStreamErrorEvent({
    analysisId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    baseMessage: "Lesson processing or validation failed.",
    error: new Error("boom sk-live-secret"),
    origin: "request",
  });
  expect(event.message).not.toContain("boom");
  expect(event.message).not.toContain("sk-live-secret");
  expect(event.diagnostic.failureClass).toBe("internal");
});

it("unwraps stage errors, keeps the stage label and maps it to a progress key", () => {
  const failure = new TeachStageError(
    "Finding objects",
    new TeachError(422, "inner"),
  );
  expect(failure.stage).toBe("Finding objects");
  expect(stageKeyFor("Finding objects")).toBe("discover");
  expect(stageKeyFor("Tracking objects")).toBe("track");
  expect(stageKeyFor("Building the visual checklist")).toBe("draft");
  expect(stageKeyFor("Something unexpected")).toBe("unknown");
  const event = buildStreamErrorEvent({
    analysisId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    baseMessage: failure.message,
    error: failure,
    origin: "model_output",
  });
  expect(event.diagnostic.stage).toBe("discover");
  expect(event.diagnostic.stageLabel).toBe("Finding objects");
  expect(StreamErrorEventSchema.safeParse(event).success).toBe(true);
});

it("carries pipeline-attached classification, cleanup, frames and objects", () => {
  const raw = new TeachError(422, "Finding objects: inner Temporary upload deleted.");
  const classification = classifyError(raw, "model_output");
  const failure = new TeachStageError("Finding objects", raw);
  Object.assign(failure, {
    analysis: {
      classification,
      cleanup: "deleted",
      elapsedMs: 1234,
      objectIds: ["component-1"],
      frames: [{ frame: 7, timestampMs: 700 }],
    },
  });
  const event = buildStreamErrorEvent({
    analysisId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    baseMessage: failure.message,
    error: failure,
    origin: "model_output",
  });
  expect(event.diagnostic.cleanup).toBe("deleted");
  expect(event.diagnostic.elapsedMs).toBe(1234);
  expect(event.diagnostic.objectIds).toEqual(["component-1"]);
  expect(event.diagnostic.frames).toEqual([{ frame: 7, timestampMs: 700 }]);
  expect(DiagnosticBundleSchema.safeParse(event.diagnostic).success).toBe(true);
});

it("never throws from the error path, even for hostile input", () => {
  const event = buildStreamErrorEvent({
    analysisId: "",
    baseMessage: "",
    error: { get diagnostic(): unknown {
      throw new Error("hostile getter");
    } },
    origin: "model_output",
  });
  expect(event.type).toBe("error");
  expect(StreamErrorEventSchema.safeParse(event).success).toBe(true);
});
