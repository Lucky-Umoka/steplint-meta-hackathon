import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { sparkStructured } from "../src/server/meta/spark";
vi.mock("server-only", () => ({}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const args = {
  instructions: "Draft",
  text: "Evidence",
  schema: z.object({ ok: z.boolean() }),
  name: "Test",
  maxTokens: 128,
};
function mock(content = '{"ok":true}', finish_reason = "stop", status = 200) {
  vi.stubEnv("SPARK_PROVIDER", "baseten");
  vi.stubEnv("BASETEN_API_KEY", "mock-private-key");
  const transport = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "data:,") return new Response("");
      const request = new Request(input, init);
      expect(request.url).toBe(
        "https://inference.baseten.co/v1/chat/completions",
      );
      const body = await request.json();
      expect(body.model).toBe("meta-models/muse-spark-open-1026");
      expect(body.response_format).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain("file_id");
      return Response.json(
        status === 200
          ? { choices: [{ finish_reason, message: { content } }] }
          : { error: { message: "sensitive upstream body" } },
        { status },
      );
    },
  );
  vi.stubGlobal("fetch", transport);
  return transport;
}
it("routes valid JSON to Baseten and validates schema", async () => {
  mock();
  const result = await sparkStructured({
    ...args,
    images: ["data:image/jpeg;base64,YQ=="],
  });
  expect(result.data.ok).toBe(true);
  expect(result.diagnostic).toMatchObject({
    provider: "baseten",
    modelId: "meta-models/muse-spark-open-1026",
  });
});
it.each([
  ["{", "length", "truncated_output"],
  ["{", "stop", "invalid_model_data"],
  ['{"ok":42}', "stop", "schema_validation_failed"],
])("rejects %s with %s", async (content, reason, code) => {
  mock(content, reason);
  await expect(sparkStructured(args)).rejects.toMatchObject({ code });
});
it("requires the Baseten key without a network call", async () => {
  vi.stubEnv("SPARK_PROVIDER", "baseten");
  vi.stubEnv("BASETEN_API_KEY", "");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(sparkStructured(args)).rejects.toMatchObject({
    code: "missing_api_key",
  });
  expect(fetch).not.toHaveBeenCalled();
});
it.each([401, 403, 500])(
  "maps HTTP %i without retries or exposing responses",
  async (status) => {
    const transport = mock("", "stop", status);
    await expect(sparkStructured(args)).rejects.toMatchObject({
      code: status === 500 ? "provider_error" : "auth_failure",
    });
    expect(
      transport.mock.calls.filter(([url]) => String(url) !== "data:,"),
    ).toHaveLength(1);
  },
);
it("defaults to Meta and uses its existing Responses transport", async () => {
  vi.stubEnv("SPARK_PROVIDER", "");
  const { createMetaClient } = await import("../src/server/meta/client");
  vi.stubEnv("MODEL_API_KEY", "meta-mock");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "data:,") return new Response("");
      const request = new Request(input, init);
      expect(request.url).toBe("https://api.meta.ai/v1/responses");
      expect((await request.json()).model).toBe("muse-spark-1.3");
      return Response.json({
        status: "completed",
        output_text: '{"ok":true}',
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: '{"ok":true}' }],
          },
        ],
      });
    }),
  );
  expect(
    (await sparkStructured({ ...args, metaClient: createMetaClient() }))
      .diagnostic.provider,
  ).toBe("meta");
});

it("keeps the SAM client and Voice endpoint on Meta when Baseten is selected", async () => {
  vi.stubEnv("SPARK_PROVIDER", "baseten");
  vi.stubEnv("MODEL_API_KEY", "meta-only-key");
  const { createMetaClient, SAM_MODEL } = await import(
    "../src/server/meta/client"
  );
  const { VOICE_MODEL } = await import("../src/server/meta/media");
  expect(VOICE_MODEL).toBe("muse-voice-transcribe-1.0");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "data:,") return new Response("");
      const request = new Request(input, init);
      expect(request.url).toBe("https://api.meta.ai/v1/responses");
      expect(request.headers.get("authorization")).toBe("Bearer meta-only-key");
      expect((await request.json()).model).toBe("sam-3.1");
      return Response.json({ status: "completed", output: [] });
    }),
  );
  await createMetaClient().responses.create({
    model: SAM_MODEL,
    input: "mock",
  });
});
