import "server-only";
import nextEnv from "@next/env";
import OpenAI from "openai";
import { ResponsesStreamError } from "@meta-sam/parser";

export function prepareSmoke() {
  // Explicit flag prevents an accidental invocation from making a paid request.
  if (process.argv.slice(2).join(" ") !== "--approved") {
    throw new Error("Live request blocked. Obtain owner approval, then pass --approved.");
  }
  nextEnv.loadEnvConfig(process.cwd());
}

export function reportFailure(error: unknown) {
  // Never print error objects, headers, request bodies, or provider-echoed secrets.
  if (error instanceof OpenAI.APIError) {
    console.error(`Meta API request failed: HTTP ${error.status ?? "unavailable"}; ${error.name}. No retry attempted.`);
  } else if (error instanceof ResponsesStreamError) {
    console.error(`SAM stream failed: ${error.code}. No retry attempted.`);
  } else if (error instanceof Error) {
    const key = process.env.MODEL_API_KEY;
    console.error(key ? error.message.split(key).join("[REDACTED]") : error.message);
  } else {
    console.error("Smoke test failed with an unknown error.");
  }
  process.exitCode = 1;
}
