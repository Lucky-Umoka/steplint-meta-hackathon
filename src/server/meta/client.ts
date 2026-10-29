import "server-only";
import OpenAI from "openai";
import { z } from "zod";

export const META_BASE_URL = "https://api.meta.ai/v1";
export const SPARK_MODEL = "muse-spark-1.3";
export const SAM_MODEL = "sam-3.1";

// Validate lazily: pages, health checks, and builds do not require credentials.
export function createMetaClient() {
  const key = z.string().trim().min(1).safeParse(process.env.MODEL_API_KEY);
  if (!key.success) throw new Error("MODEL_API_KEY is required for model requests.");
  return new OpenAI({
    baseURL: META_BASE_URL, apiKey: key.data,
    maxRetries: 0, timeout: 60_000,
  });
}
