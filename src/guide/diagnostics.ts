import { z } from "zod";

/**
 * Typed Teach failure diagnostics shared by the server stream and the browser.
 * Raw exception text, prompts, provider payloads and credentials never enter
 * a bundle: only authored messages, validation paths (never values) and
 * documented provider status fields.
 */
export const FailureClassSchema = z.enum([
  "invalid_input",
  "auth",
  "configuration",
  "provider_unavailable",
  "provider_rate_limited",
  "provider_error",
  "provider_incomplete",
  "invalid_model_data",
  "cancelled",
  "internal",
]);
export type FailureClass = z.infer<typeof FailureClassSchema>;

export const FailureCodeSchema = z.enum([
  "zod_schema",
  "malformed_json",
  "truncated_output",
  "incomplete_response",
  "connection_failed",
  "request_timeout",
  "rate_limited",
  "http_error",
  "cancelled",
  "missing_credentials",
  "invalid_configuration",
  "unauthorized",
  "forbidden_origin",
  "unknown",
]);
export type FailureCode = z.infer<typeof FailureCodeSchema>;

export const CleanupSchema = z.enum([
  "deleted",
  "expiry_fallback",
  "not_attempted",
]);
export type Cleanup = z.infer<typeof CleanupSchema>;

/** Client-safe mirror of the server provider diagnostic (no prompt/output). */
export const GuideProviderDiagnosticSchema = z.strictObject({
  status: z.string().max(80).nullable(),
  reason: z.string().max(100).nullable(),
  errorCode: z.string().max(100).nullable(),
  outputTokens: z.number().nullable(),
  outputTypes: z.array(z.string().max(80)).max(20),
});
export type GuideProviderDiagnostic = z.infer<
  typeof GuideProviderDiagnosticSchema
>;

export const DiagnosticBundleSchema = z.strictObject({
  analysisId: z.string().min(1).max(80),
  stage: z.string().min(1).max(80),
  stageLabel: z.string().min(1).max(120),
  failureClass: FailureClassSchema,
  code: FailureCodeSchema,
  message: z.string().min(1).max(500),
  schemaPaths: z.array(z.string().max(200)).max(16),
  provider: GuideProviderDiagnosticSchema.optional(),
  frames: z
    .array(
      z.strictObject({
        frame: z.number().int().nonnegative(),
        timestampMs: z.number().int().nonnegative().nullable(),
      }),
    )
    .max(12)
    .optional(),
  objectIds: z.array(z.string().max(80)).max(6).optional(),
  elapsedMs: z.number().int().nonnegative().nullable().optional(),
  cleanup: CleanupSchema,
});
export type DiagnosticBundle = z.infer<typeof DiagnosticBundleSchema>;

export const StreamErrorEventSchema = z.strictObject({
  type: z.literal("error"),
  message: z.string().min(1).max(500),
  diagnostic: DiagnosticBundleSchema,
});
export type StreamErrorEvent = z.infer<typeof StreamErrorEventSchema>;

const ClassificationSchema = z.strictObject({
  failureClass: FailureClassSchema,
  code: FailureCodeSchema,
  schemaPaths: z.array(z.string().max(200)).max(16),
  provider: GuideProviderDiagnosticSchema.optional(),
});
export type Classification = z.infer<typeof ClassificationSchema>;

const AttachedAnalysisSchema = z.object({
  cleanup: CleanupSchema.optional(),
  elapsedMs: z.number().int().nonnegative().nullable().optional(),
  objectIds: z.array(z.string().max(80)).max(6).optional(),
  frames: z
    .array(
      z.strictObject({
        frame: z.number().int().nonnegative(),
        timestampMs: z.number().int().nonnegative().nullable(),
      }),
    )
    .max(12)
    .optional(),
});

export type ErrorOrigin = "model_output" | "request";

const STAGE_KEYS: Record<string, string> = {
  "Finding action moments": "discover",
  "Finding objects": "discover",
  "Tracking objects": "track",
  "Building the visual checklist": "draft",
  "Automatic component analysis": "discover",
  "SAM tracking": "track",
  "Spark request": "draft",
  "Spark draft validation": "draft",
};

export function stageKeyFor(label: string): string {
  return STAGE_KEYS[label] ?? "unknown";
}

function readRecord(error: unknown): Record<string, unknown> | null {
  if (!error || (typeof error !== "object" && typeof error !== "function"))
    return null;
  try {
    return error as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readProviderDiagnostic(
  error: unknown,
): GuideProviderDiagnostic | null {
  try {
    const record = readRecord(error);
    if (!record || !("diagnostic" in record)) return null;
    const parsed = GuideProviderDiagnosticSchema.safeParse(record.diagnostic);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function readModelIssues(error: unknown): string[] | null {
  try {
    const record = readRecord(error);
    const raw = record?.modelIssues;
    if (!Array.isArray(raw)) return null;
    return raw
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.slice(0, 200));
  } catch {
    return null;
  }
}

function readStatus(error: unknown): number | null {
  try {
    const record = readRecord(error);
    const status = record?.status;
    return typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 100 &&
      status <= 599
      ? status
      : null;
  } catch {
    return null;
  }
}

function readStageLabel(error: unknown): string | null {
  try {
    const record = readRecord(error);
    const stage = record?.stage;
    return typeof stage === "string" && stage.length >= 1 && stage.length <= 120
      ? stage
      : null;
  } catch {
    return null;
  }
}

/** Unwrap a stage wrapper to the error it carries, when present. */
function unwrapStage(error: unknown): unknown {
  try {
    const record = readRecord(error);
    if (
      record &&
      typeof record.stage === "string" &&
      "cause" in record &&
      record.cause !== undefined
    )
      return record.cause;
    return error;
  } catch {
    return error;
  }
}

// Substring checks below match only authored in-repo TeachError literals;
// raw provider/user text never becomes a TeachError message.
const GENERIC_MESSAGE = "Lesson processing or validation failed.";
const CREDENTIAL_MESSAGES = [
  "MODEL_API_KEY is required for model requests.",
  "Model credentials are not configured on this server.",
  "Teach is not configured.",
];

export function classifyError(
  error: unknown,
  origin: ErrorOrigin,
): Classification {
  try {
    const inner = unwrapStage(error);
    if (inner !== error) return classifyError(inner, origin);
    const provider = readProviderDiagnostic(error);
    if (provider)
      return {
        failureClass: "provider_incomplete",
        code:
          provider.reason === "max_output_tokens"
            ? "truncated_output"
            : "incomplete_response",
        schemaPaths: [],
        provider,
      };
    if (error instanceof z.ZodError)
      return {
        failureClass:
          origin === "request" ? "invalid_input" : "invalid_model_data",
        code: "zod_schema",
        schemaPaths: error.issues
          .slice(0, 16)
          .map((issue) => (issue.path.join(".") || "(root)").slice(0, 200)),
      };
    const modelIssues = readModelIssues(error);
    if (modelIssues)
      return {
        failureClass: "invalid_model_data",
        code: modelIssues.length ? "zod_schema" : "unknown",
        schemaPaths: modelIssues.slice(0, 16),
      };
    if (error instanceof SyntaxError)
      return {
        failureClass:
          origin === "request" ? "invalid_input" : "invalid_model_data",
        code: "malformed_json",
        schemaPaths: [],
      };
    if (error instanceof Error) {
      if (CREDENTIAL_MESSAGES.some((text) => error.message.includes(text)))
        return {
          failureClass: "configuration",
          code: "missing_credentials",
          schemaPaths: [],
        };
      if (error.message.includes("TEACH_PUBLIC_ORIGIN"))
        return {
          failureClass: "configuration",
          code: "invalid_configuration",
          schemaPaths: [],
        };
      if (error.name === "APIConnectionError")
        return {
          failureClass: "provider_unavailable",
          code: "connection_failed",
          schemaPaths: [],
        };
      if (
        error.name === "APIConnectionTimeoutError" ||
        error.name === "TimeoutError"
      )
        return {
          failureClass: "provider_unavailable",
          code: "request_timeout",
          schemaPaths: [],
        };
      if (error.name === "AbortError")
        return {
          failureClass: "cancelled",
          code: "cancelled",
          schemaPaths: [],
        };
    }
    const status = readStatus(error);
    if (status !== null) {
      if (status === 401)
        return { failureClass: "auth", code: "unauthorized", schemaPaths: [] };
      if (status === 403)
        return {
          failureClass: "auth",
          code: "forbidden_origin",
          schemaPaths: [],
        };
      if (status === 429)
        return {
          failureClass: "provider_rate_limited",
          code: "rate_limited",
          schemaPaths: [],
        };
      if (status === 400 || status === 413 || status === 415)
        return {
          failureClass: "invalid_input",
          code: "unknown",
          schemaPaths: [],
        };
      if (status === 422) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes(GENERIC_MESSAGE))
          return {
            failureClass: "internal",
            code: "unknown",
            schemaPaths: [],
          };
        return {
          failureClass: "invalid_input",
          code: "unknown",
          schemaPaths: [],
        };
      }
      return {
        failureClass: "provider_error",
        code: "http_error",
        schemaPaths: [],
      };
    }
    return { failureClass: "internal", code: "unknown", schemaPaths: [] };
  } catch {
    return { failureClass: "internal", code: "unknown", schemaPaths: [] };
  }
}

export function buildStreamErrorEvent(input: {
  analysisId: unknown;
  baseMessage: unknown;
  error: unknown;
  origin: ErrorOrigin;
  cleanupFallback?: Cleanup;
}): StreamErrorEvent {
  const fallback = (): StreamErrorEvent => ({
    type: "error",
    message: "Lesson analysis stopped before a guide could be built.",
    diagnostic: {
      analysisId: "unknown",
      stage: "unknown",
      stageLabel: "Lesson analysis",
      failureClass: "internal",
      code: "unknown",
      message: "Lesson analysis stopped before a guide could be built.",
      schemaPaths: [],
      cleanup: input.cleanupFallback ?? "not_attempted",
    },
  });
  try {
    const rawId = String(input.analysisId ?? "").slice(0, 80);
    const analysisId = rawId ? rawId : "unknown";
    const reference =
      analysisId === "unknown" ? "unavailable" : analysisId.slice(0, 8);
    const base =
      String(input.baseMessage ?? "")
        .slice(0, 400)
        .trim() || "Lesson analysis stopped before a guide could be built.";
    const message = `${base} (Reference: ${reference})`;
    const record = readRecord(input.error);
    const attached =
      record && record.analysis && typeof record.analysis === "object"
        ? (record.analysis as Record<string, unknown>)
        : null;
    let classification: Classification | null = null;
    if (attached) {
      const parsed = ClassificationSchema.safeParse(attached.classification);
      if (parsed.success) classification = parsed.data;
    }
    classification ??= classifyError(unwrapStage(input.error), input.origin);
    const extras = attached ? AttachedAnalysisSchema.safeParse(attached) : null;
    const stageLabel = readStageLabel(input.error) ?? "Lesson analysis";
    const event = {
      type: "error" as const,
      message,
      diagnostic: {
        analysisId,
        stage: stageKeyFor(stageLabel),
        stageLabel,
        failureClass: classification.failureClass,
        code: classification.code,
        message,
        schemaPaths: classification.schemaPaths,
        ...(classification.provider
          ? { provider: classification.provider }
          : {}),
        ...(extras && extras.success ? extras.data : {}),
        cleanup:
          (extras && extras.success ? extras.data.cleanup : undefined) ??
          input.cleanupFallback ??
          "not_attempted",
      },
    };
    const parsed = StreamErrorEventSchema.safeParse(event);
    if (parsed.success) return parsed.data;
    return fallback();
  } catch {
    return fallback();
  }
}
