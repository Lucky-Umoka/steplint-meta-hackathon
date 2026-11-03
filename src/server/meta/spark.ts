import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { createMetaClient, SPARK_MODEL } from "./client";
import { TeachError } from "../teach/security";
import { decodeTeachVideo } from "../teach/video-evidence";
import { sparkCompletionLimit } from "./spark-limits";

export class SparkError extends TeachError {
  constructor(
    public readonly code: string,
    message: string,
    status = 502,
    public readonly tokenUsage?: {
      outputTokens: number | null;
      reasoningTokens: number | null;
      answerCharacters: number;
    },
  ) {
    super(status, message);
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
  metaClient,
  metaVideoFileId,
}: {
  instructions: string;
  text: string;
  images?: string[];
  videoBase64?: string;
  schema: z.ZodType<T>;
  name: string;
  maxTokens: number;
  signal?: AbortSignal;
  /** Existing server transport injection, used by the compiler and offline tests. */
  metaClient?: OpenAI;
  metaVideoFileId?: string;
}) {
  const provider = process.env.SPARK_PROVIDER || "meta";
  if (provider !== "meta" && provider !== "baseten")
    throw new SparkError(
      "invalid_provider",
      "SPARK_PROVIDER must be meta or baseten.",
      503,
    );
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
  if (videoBase64) {
    decodeTeachVideo(videoBase64);
    if (
      provider === "meta" &&
      !/^file-[A-Za-z0-9_-]+$/.test(metaVideoFileId ?? "")
    )
      throw new SparkError(
        "invalid_input",
        "Meta video drafting requires the matching uploaded file reference.",
        400,
      );
  }
  const modelId =
    provider === "baseten" ? "meta-models/muse-spark-open-1026" : SPARK_MODEL;
  let output: string;
  let outputTokens: number | null = null;
  try {
    if (provider === "baseten") {
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
                  content: `${instructions}\nReturn ONLY raw JSON, with no markdown or commentary, matching this schema: ${JSON.stringify(z.toJSONSchema(schema))}`,
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
    } else {
      const response = await (
        metaClient ?? createMetaClient()
      ).responses.create(
        {
          model: modelId,
          store: false,
          instructions,
          max_output_tokens: maxTokens,
          reasoning: { effort: "low" },
          input:
            images.length || videoBase64
              ? [
                  {
                    role: "user",
                    content: [
                      { type: "input_text", text },
                      ...images.map((image_url) => ({
                        type: "input_image" as const,
                        image_url,
                        detail: "auto" as const,
                      })),
                      ...(videoBase64
                        ? [
                            {
                              type: "input_file" as const,
                              file_id: metaVideoFileId!,
                            },
                          ]
                        : []),
                    ],
                  },
                ]
              : text,
          text: {
            format: {
              type: "json_schema",
              name,
              strict: true,
              schema: z.toJSONSchema(schema),
            },
          },
        },
        { signal, timeout: 120000 },
      );
      if (
        response.status === "incomplete" &&
        response.incomplete_details?.reason === "max_output_tokens"
      )
        throw new SparkError(
          "truncated_output",
          "Spark output exhausted its token budget. No JSON was parsed.",
        );
      if (response.status !== "completed" || !response.output_text)
        throw new SparkError(
          "invalid_model_data",
          "Spark did not return a completed JSON answer.",
        );
      output = response.output_text;
      outputTokens = response.usage?.output_tokens ?? null;
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
      if (status === 400 || status === 422)
        throw new SparkError(
          "request_rejected",
          `${provider} Spark rejected the request (HTTP ${status}). Check the selected provider and its supported request/schema format. No retry or fallback was attempted.`,
        );
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
  let raw: unknown;
  try {
    raw = JSON.parse(output);
  } catch {
    throw new SparkError("invalid_model_data", "Spark returned invalid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new SparkError(
      "schema_validation_failed",
      "Spark JSON failed procedure schema validation.",
    );
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
