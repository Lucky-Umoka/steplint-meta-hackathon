import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { TeachError } from "../teach/security";
import { decodeTeachVideo } from "../teach/video-evidence";
import { sparkCompletionLimit } from "./spark-limits";

/**
 * JSON Schema for provider structured output. Zod emits a discriminated union
 * as `oneOf`; strict structured-output formats document `anyOf` only. The
 * branches are told apart by a constant `kind`, so at most one can match and
 * `anyOf` is equivalent. The exact Zod union still validates every reply.
 */
export function providerJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const rename = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(rename)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value).map(([key, inner]) => [
              key === "oneOf" ? "anyOf" : key,
              rename(inner),
            ]),
          )
        : value;
  const json = rename(z.toJSONSchema(schema)) as Record<string, unknown>;
  // Metadata only; models copy it into answers when it is shown.
  delete json["$schema"];
  return json;
}
/** Provider's own rejection reason, bounded; never request bodies or keys. */
function providerReason(error: unknown): string {
  const message =
    error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : "";
  const safe = message.replace(/(sk|key|token)[-_A-Za-z0-9]{8,}/gi, "[redacted]");
  return safe ? ` Provider said: ${safe.slice(0, 300)}` : "";
}
export class SparkError extends TeachError {
  /** Server-only candidate for the bounded correction path; never serialized. */
  readonly candidateText?: string;
  readonly issues?: string[];
  constructor(
    public readonly code: string,
    message: string,
    status = 502,
    public readonly tokenUsage?: {
      outputTokens: number | null;
      reasoningTokens: number | null;
      answerCharacters: number;
    },
    candidateText?: string,
    /** Schema issue paths/messages for the one bounded correction; server-only. */
    issues?: string[],
  ) {
    super(status, message);
    if (issues)
      Object.defineProperty(this, "issues", { value: issues, enumerable: false });
    if (candidateText !== undefined)
      Object.defineProperty(this, "candidateText", {
        value: candidateText,
        enumerable: false,
      });
  }
}
export async function sparkStructured<T>({
  instructions,
  text,
  images = [],
  videoBase64,
  schema,
  name,
  maxTokens,
  signal,
}: {
  instructions: string;
  text: string;
  images?: string[];
  videoBase64?: string;
  schema: z.ZodType<T>;
  name: string;
  maxTokens: number;
  signal?: AbortSignal;
}) {
  // Owner rule: Muse Spark runs only on Baseten (BASETEN_API_KEY,
  // inference.baseten.co); never on Meta's API.
  const provider = "baseten";
  if (
    text.length > 28000 ||
    instructions.length > 20000 ||
    !Number.isInteger(maxTokens) ||
    maxTokens < 1 ||
    maxTokens > sparkCompletionLimit(provider) ||
    images.length > 8 ||
    images.some(
      (image) =>
        image.length > 350000 ||
        !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(image),
    )
  )
    throw new SparkError(
      "invalid_input",
      "Spark input exceeds supported bounds.",
      400,
    );
  if (videoBase64) decodeTeachVideo(videoBase64);
  const modelId = "meta-models/muse-spark-open-1026";
  let output: string;
  let outputTokens: number | null = null;
  try {
    {
      const key = process.env.BASETEN_API_KEY?.trim();
      if (!key)
        throw new SparkError(
          "missing_api_key",
          "BASETEN_API_KEY is required for Baseten Spark drafting.",
          503,
        );
      const client = new OpenAI({
        apiKey: key,
        baseURL: "https://inference.baseten.co/v1",
        maxRetries: 0,
        timeout: 120000,
      });
      // Baseten documents video_url; OpenAI's generated Chat types omit that
      // provider extension. Use the SDK's typed raw POST, without type casts.
      const response =
        await client.post<OpenAI.Chat.Completions.ChatCompletion>(
          "/chat/completions",
          {
            body: {
              model: modelId,
              max_tokens: maxTokens,
              messages: [
                {
                  role: "system",
                  content: `${instructions}\nReturn ONLY the JSON data object itself (no markdown or commentary): an instance that satisfies the JSON Schema below. Never return the schema, its "type"/"properties" keys or a description of it. JSON Schema: ${JSON.stringify(providerJsonSchema(schema))}`,
                },
                {
                  role: "user",
                  content: [
                    { type: "text", text },
                    ...images.map((url) => ({
                      type: "image_url" as const,
                      image_url: { url },
                    })),
                    ...(videoBase64
                      ? [{ type: "video_url", video_url: { url: videoBase64 } }]
                      : []),
                  ],
                },
              ],
              // Muse Spark Open always reasons; Baseten documents no depth control.
            },
            signal,
          },
        );
      const choice = response.choices[0];
      if (choice?.finish_reason === "length")
        throw new SparkError(
          "truncated_output",
          "Spark output exhausted its token budget. No JSON was parsed.",
          502,
          {
            outputTokens: response.usage?.completion_tokens ?? null,
            reasoningTokens:
              response.usage?.completion_tokens_details?.reasoning_tokens ??
              null,
            answerCharacters: choice.message.content?.length ?? 0,
          },
        );
      if (choice?.finish_reason !== "stop" || !choice.message.content)
        throw new SparkError(
          "invalid_model_data",
          "Spark did not return a completed JSON answer.",
        );
      output = choice.message.content;
      outputTokens = response.usage?.completion_tokens ?? null;
    }
  } catch (error) {
    if (error instanceof SparkError) throw error;
    if (error instanceof OpenAI.APIConnectionTimeoutError)
      throw new SparkError(
        "timeout",
        `${provider} Spark request timed out. No retry was attempted.`,
      );
    if (error instanceof OpenAI.APIUserAbortError)
      throw new SparkError(
        "request_cancelled",
        `${provider} Spark request was cancelled. No retry was attempted.`,
      );
    if (error instanceof OpenAI.APIConnectionError)
      throw new SparkError(
        "connection_error",
        `${provider} Spark could not connect. No retry was attempted.`,
      );
    if (
      error instanceof OpenAI.APIError &&
      (error.status === 401 || error.status === 403)
    )
      throw new SparkError(
        "auth_failure",
        `${provider} Spark authentication failed. Check server credentials.`,
      );
    if (error instanceof OpenAI.APIError && error.status !== undefined) {
      const status = error.status;
      if (status === 429)
        throw new SparkError(
          "rate_limited",
          `${provider} Spark rate limit reached (HTTP 429). No retry was attempted.`,
          429,
        );
      if (status === 400 || status === 422) {
        // Diagnosable in server logs only; provider bodies never reach clients.
        console.warn(
          `[spark] ${provider} rejected ${name} (HTTP ${status}).${providerReason(error)}`,
        );
        throw new SparkError(
          "request_rejected",
          `${provider} Spark rejected the request (HTTP ${status}). Check the selected provider and its supported request/schema format. No retry or fallback was attempted.`,
        );
      }
      throw new SparkError(
        "provider_error",
        `${provider} Spark request failed (HTTP ${status}). No retry or provider fallback was attempted.`,
      );
    }
    throw new SparkError(
      "provider_error",
      `${provider} Spark request failed. No retry or provider fallback was attempted.`,
    );
  }
  if (output.length > 100000)
    throw new SparkError(
      "invalid_model_data",
      "Spark JSON exceeds the response bound.",
    );
  // A single whole-response JSON fence is presentation, not a JSON repair.
  // Prose, multiple payloads and malformed/truncated JSON remain rejected.
  const fenced = /^\s*```json\s*\r?\n([\s\S]*?)\r?\n```\s*$/i.exec(output);
  const jsonText = fenced ? fenced[1] : output;
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (parseError) {
    // Diagnostics only (no secrets, no media): why the model text is not
    // JSON (paid run 20: the rejected draft was never visible).
    console.warn(
      `[spark] ${name} invalid JSON: ${parseError instanceof Error ? parseError.message.slice(0, 160) : "parse error"}; ${jsonText.length} chars; head=${JSON.stringify(jsonText.slice(0, 300))}; tail=${JSON.stringify(jsonText.slice(-300))}`,
    );
    throw new SparkError(
      "invalid_model_data",
      "Spark returned invalid JSON.",
      502,
      undefined,
      output,
    );
  }
  // The schema is sent as text on Baseten; models sometimes echo its
  // top-level "$schema" metadata key (live runs 12: audit and Felicity both
  // rejected). It carries no data, so it is removed before strict validation.
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "$schema" in raw)
    delete (raw as Record<string, unknown>)["$schema"];
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // Field paths and rule messages only (no model content), so a provider
    // without enforced schemas can be diagnosed from server logs.
    const issues = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    console.warn(`[spark] ${name} schema issues: ${issues.join(" | ")}`);
    throw new SparkError(
      "schema_validation_failed",
      "Spark JSON failed procedure schema validation.",
      502,
      undefined,
      output,
      issues,
    );
  }
  return {
    data: parsed.data,
    diagnostic: {
      provider,
      modelId,
      outputTokens,
      visualInput: videoBase64 ? "video" : images.length ? "images" : "none",
    },
  };
}
