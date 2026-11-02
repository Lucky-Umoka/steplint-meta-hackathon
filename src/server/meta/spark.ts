import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { createMetaClient, SPARK_MODEL } from "./client";
import { TeachError } from "../teach/security";

export class SparkError extends TeachError {
  constructor(
    public readonly code: string,
    message: string,
    status = 502,
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
    maxTokens > 12000 ||
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
  if (videoBase64)
    throw new SparkError(
      "unsupported_video",
      "Use bounded image frames; video input is not enabled for this adapter.",
      400,
    );
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
      const response = await client.chat.completions.create(
        {
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
              ],
            },
          ],
          // reasoning_effort omitted until this hackathon deployment is live-tested.
        },
        { signal },
      );
      const choice = response.choices[0];
      if (choice?.finish_reason === "length")
        throw new SparkError(
          "truncated_output",
          "Spark output exhausted its token budget. No JSON was parsed.",
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
          input: images.length
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
    if (
      error instanceof OpenAI.APIError &&
      (error.status === 401 || error.status === 403)
    )
      throw new SparkError(
        "auth_failure",
        `${provider} Spark authentication failed. Check server credentials.`,
      );
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
  return { data: parsed.data, diagnostic: { provider, modelId, outputTokens } };
}
