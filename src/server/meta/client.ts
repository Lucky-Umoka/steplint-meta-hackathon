import "server-only";
import OpenAI from "openai";
import { z } from "zod";

export const META_BASE_URL = "https://api.meta.ai/v1";
export const SAM_MODEL = "sam-3.1";

// Validate lazily: pages, health checks, and builds do not require credentials.
export function createMetaClient() {
  const key = z.string().trim().min(1).safeParse(process.env.MODEL_API_KEY);
  if (!key.success) throw new Error("MODEL_API_KEY is required for model requests.");
  // Owner rule (2026-11-03): MODEL_API_KEY / api.meta.ai serves only SAM 3.1
  // and Muse Voice Transcribe. Muse Spark runs only on Baseten, so any Spark
  // model request through this client is refused at the HTTP boundary, before
  // it leaves the server, whichever SDK method built it.
  const guardedFetch: typeof fetch = (input, init) => {
    const body = init?.body;
    if (typeof body === "string" && /"model"\s*:\s*"muse-spark/i.test(body))
      return Promise.reject(
        new Error(
          "Muse Spark is served only by Baseten; it is never sent to the Meta API.",
        ),
      );
    return globalThis.fetch(input, init);
  };
  return new OpenAI({
    baseURL: META_BASE_URL, apiKey: key.data,
    maxRetries: 0, timeout: 60_000,
    fetch: guardedFetch,
  });
}
