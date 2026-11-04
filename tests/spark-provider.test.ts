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
it("reports only safe token counts for truncation without parsing incomplete output", async () => {
  mock("{", "length");
  await expect(sparkStructured(args)).rejects.toMatchObject({
    code: "truncated_output",
    tokenUsage: {
      outputTokens: null,
      reasoningTokens: null,
      answerCharacters: 1,
    },
  });
});
it("accepts the bounded Baseten reasoning-plus-answer budget and rejects exceeding it before dispatch", async () => {
  const transport = mock();
  await expect(
    sparkStructured({ ...args, maxTokens: 24_576 }),
  ).resolves.toMatchObject({ data: { ok: true } });
  const [input, init] = transport.mock.calls.find(
    ([url]) => String(url) !== "data:,",
  )!;
  expect((await new Request(input, init).json()).max_tokens).toBe(24_576);
  const before = transport.mock.calls.length;
  await expect(
    sparkStructured({ ...args, maxTokens: 24_577 }),
  ).rejects.toMatchObject({ code: "invalid_input" });
  expect(transport.mock.calls).toHaveLength(before);
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
it.each([400, 422, 429, 503])(
  "preserves safe HTTP %i diagnostics without exposing upstream data",
  async (status) => {
    const transport = mock("", "stop", status);
    const error = await sparkStructured(args).catch(
      (failure: unknown) => failure,
    );
    expect(error).toMatchObject({
      code:
        status === 429
          ? "rate_limited"
          : status < 500
            ? "request_rejected"
            : "provider_error",
    });
    expect(error).toBeInstanceOf(Error);
    if (error instanceof Error) {
      expect(error.message).toContain(`HTTP ${status}`);
      expect(error.message).not.toContain("sensitive upstream body");
      expect(error.message).not.toContain("mock-private-key");
    }
    expect(
      transport.mock.calls.filter(([url]) => String(url) !== "data:,"),
    ).toHaveLength(1);
  },
);

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

it("retains a malformed completed candidate only for server-side correction, without serializing it", async () => {
  const malformed = '{"ok":true,}';
  const transport = mock(malformed, "stop");
  const error: unknown = await sparkStructured(args).catch(
    (failure: unknown) => failure,
  );
  const { SparkError } = await import("../src/server/meta/spark");
  expect(error).toBeInstanceOf(SparkError);
  if (!(error instanceof SparkError)) throw Error("Expected SparkError");
  expect(error.candidateText).toBe(malformed);
  expect(error.message).not.toContain(malformed);
  expect(JSON.stringify(error)).not.toContain(malformed);
  expect(
    transport.mock.calls.filter(([url]) => String(url) !== "data:,"),
  ).toHaveLength(1);
});

it("accepts a single complete JSON fence while retaining schema validation", async () => {
  mock('```json\n{"ok":true}\n```');
  await expect(sparkStructured(args)).resolves.toMatchObject({
    data: { ok: true },
  });
  mock('```json\n{"ok":42}\n```');
  await expect(sparkStructured(args)).rejects.toMatchObject({
    code: "schema_validation_failed",
  });
});
it.each([
  'Here is JSON: ```json\n{"ok":true}\n```',
  '```json\n{"ok":true}\n``` trailing text',
  '```json\n{"ok":true}\n```\n```json\n{"ok":false}\n```',
  '```json\n{"ok":true,}\n```',
])(
  "rejects commentary, extra payloads or invalid syntax: %s",
  async (content) => {
    mock(content);
    await expect(sparkStructured(args)).rejects.toMatchObject({
      code: "invalid_model_data",
    });
  },
);

it("the real Teach drafting and discovery schemas contain no oneOf", async () => {
  const { sparkRequest } = await import("../src/server/teach/pipeline");
  const { discoveryRequest } = await import("../src/server/teach/discovery");
  const { teachV3Fixture } = await import("./fixtures/teach-v3");
  const { context } = teachV3Fixture();
  expect(JSON.stringify(sparkRequest(context, { goal: "Transfer" }))).not.toContain("oneOf");
  expect(JSON.stringify(discoveryRequest("file-abc", context.lesson, "Transfer"))).not.toContain("oneOf");
});


it("never sends oneOf to the provider; the Zod union still validates (HTTP 400 root cause)", async () => {
  const transport = mock('{"items":[{"kind":"a","x":1}]}');
  const { providerJsonSchema } = await import("../src/server/meta/spark");
  const union = z.object({
    items: z.array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("a"), x: z.number() }),
        z.object({ kind: z.literal("b"), y: z.string() }),
      ]),
    ),
  });
  expect(JSON.stringify(z.toJSONSchema(union))).toContain("oneOf");
  expect(JSON.stringify(providerJsonSchema(union))).not.toContain("oneOf");
  const result = await sparkStructured({ ...args, schema: union });
  expect(result.data.items[0]).toEqual({ kind: "a", x: 1 });
  const call = transport.mock.calls.find(([url]) => String(url) !== "data:,")!;
  const sent = await new Request(call[0], call[1]).text();
  expect(sent).not.toContain("oneOf");
  expect(sent).toContain("anyOf");
});

it.each(["", "meta", "baseten"])(
  "Muse Spark always goes to Baseten, never Meta (SPARK_PROVIDER=%j)",
  async (value) => {
    vi.stubEnv("SPARK_PROVIDER", value);
    vi.stubEnv("STEPLINT_ALLOW_META_SPARK", "1");
    vi.stubEnv("BASETEN_API_KEY", "mock-private-key");
    vi.stubEnv("MODEL_API_KEY", "meta-mock");
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "data:,") return new Response("");
        urls.push(new Request(input).url);
        return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }] });
      }),
    );
    expect((await sparkStructured(args)).diagnostic.provider).toBe("baseten");
    expect(urls).toEqual(["https://inference.baseten.co/v1/chat/completions"]);
  },
);

it("the Meta client (MODEL_API_KEY) refuses any Muse Spark model before the network, but serves SAM", async () => {
  vi.stubEnv("MODEL_API_KEY", "meta-mock");
  const fetchMock = vi.fn(async () => Response.json({ id: "resp", status: "completed", output: [] }));
  vi.stubGlobal("fetch", fetchMock);
  const { createMetaClient, SAM_MODEL } = await import("../src/server/meta/client");
  const client = createMetaClient();
  const refused = await client.responses
    .create({ model: "muse-spark-1.3", input: "x" })
    .then(() => null, (error: unknown) => error as { cause?: Error });
  expect(refused?.cause?.message).toMatch(/only by Baseten/);
  expect(fetchMock).not.toHaveBeenCalled();
  await client.post("/responses", { body: { model: SAM_MODEL, input: "x" } });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("https://api.meta.ai/v1/responses");
});

it("a top-level $schema key echoed by the model is ignored, and $schema is not sent (live run 12: audit and Felicity failed)", async () => {
  const transport = mock('{"$schema":"https://json-schema.org/draft/2020-12/schema","ok":true}');
  const result = await sparkStructured({ ...args, schema: z.strictObject({ ok: z.boolean() }) });
  expect(result.data).toEqual({ ok: true });
  const call = transport.mock.calls.find(([url]) => String(url) !== "data:,")!;
  expect(await new Request(call[0], call[1]).text()).not.toContain("$schema");
});
