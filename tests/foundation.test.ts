import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/health/route";
import { createMetaClient, META_BASE_URL } from "../src/server/meta/client";
import { validateSparkResponse, validateSamResult } from "../src/server/meta/validation";
import { parseImageStream, type ResponsesEvent } from "@meta-sam/parser";

// Vitest is not the Next.js compiler: neutralize only its module marker.
// Next.js still enforces the server-only import in actual application builds.
vi.mock("server-only", () => ({}));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in unit tests"); }));
});
afterEach(() => {
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("foundation (no network)", () => {
  it("returns only application health even without credentials", async () => {
    vi.stubEnv("MODEL_API_KEY", "");
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok", application: "steplint" });
  });
  it("rejects missing credentials without leaking them", () => {
    vi.stubEnv("MODEL_API_KEY", " ");
    expect(() => createMetaClient()).toThrow("MODEL_API_KEY is required");
  });
  it("configures Meta transport without making a request", () => {
    vi.stubEnv("MODEL_API_KEY", "unit-test-placeholder");
    const client = createMetaClient();
    expect(client.baseURL).toBe(META_BASE_URL);
    expect(client.maxRetries).toBe(0);
    expect(client.timeout).toBe(60_000);
  });
  it("accepts only completed Spark responses with the expected marker", () => {
    expect(validateSparkResponse({ status: "completed", output_text: "STEPLINT_OK" }).output_text).toBe("STEPLINT_OK");
    for (const value of [null, {}, { status: "incomplete", output_text: "STEPLINT_OK" }, { status: "completed", output_text: "" }, { status: "completed", output_text: "unexpected" }]) {
      expect(() => validateSparkResponse(value)).toThrow();
    }
  });
});

// Official parser README sample, mocked locally; this is not a Meta API result.
const text = '<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>' +
  "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>\n";
async function* events(output: string, completed = true): AsyncIterable<ResponsesEvent> {
  const lane = { item_id: "mock-message", output_index: 0, content_index: 0 };
  for (let i = 0; i < output.length; i += 7) {
    yield { type: "response.output_text.delta", ...lane, delta: output.slice(i, i + 7) };
  }
  yield { type: "response.output_text.done", ...lane, text: output };
  if (completed) yield { type: "response.completed" };
}

describe("SAM parser boundary (mocked events)", () => {
  it("parses arbitrary chunk boundaries and decodes a real mask format", async () => {
    const result = await parseImageStream(events(text)).finalResult;
    expect(validateSamResult(result)).toEqual({ boxes: 1, masks: 1 });
  });
  it("rejects truncated streams even with valid geometry", async () => {
    const result = await parseImageStream(events(text, false)).finalResult;
    expect(() => validateSamResult(result)).toThrow("did not complete");
  });
  it("rejects empty completed output", async () => {
    const result = await parseImageStream(events("")).finalResult;
    expect(() => validateSamResult(result)).toThrow("no usable");
  });
  it("rejects diagnostics instead of calling partial output a success", async () => {
    const result = await parseImageStream(events(text + "<0f>bad-record\n")).finalResult;
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(() => validateSamResult(result)).toThrow("diagnostics");
  });
  it("rejects API failure events", async () => {
    async function* failed(): AsyncIterable<ResponsesEvent> {
      yield { type: "response.failed", response: { error: { message: "mock failure" } } };
    }
    await expect(parseImageStream(failed()).finalResult).rejects.toThrow();
  });
});
