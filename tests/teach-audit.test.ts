import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { teachV3Fixture } from "./fixtures/teach-v3";
import { parseSparkDraft } from "../src/server/teach/pipeline";
import { auditTeachDraft, auditEvidence, sanitizeAudit } from "../src/server/teach/audit";
import { validateDraft } from "../src/teach/schema";

vi.mock("server-only", () => ({}));

const parsed = () => {
  const { context, draft } = teachV3Fixture();
  const compiled = parseSparkDraft(
    { status: "completed", output_text: JSON.stringify(draft) },
    context,
    { goal: "Transfer" },
  );
  return { context, draft: compiled };
};
const baseten = (reply: unknown, status = 200) => {
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "data:,") return new Response("");
      const req = new Request(url, init);
      bodies.push(await req.text());
      expect(req.url).toBe("https://inference.baseten.co/v1/chat/completions");
      if (status !== 200) return Response.json({ error: { message: "down" } }, { status });
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reply) } }] });
    }),
  );
  return bodies;
};
beforeEach(() => vi.stubEnv("BASETEN_API_KEY", "mock-baseten-key"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("a complete draft receives an audit grounded in the transcript, SAM windows and the draft", async () => {
  const { context, draft } = parsed();
  const bodies = baseten({ summary: "The draft matches the demonstration.", findings: [] });
  const audit = await auditTeachDraft(draft, context, new AbortController().signal);
  expect(audit).toEqual({ summary: "The draft matches the demonstration.", findings: [] });
  const sent = JSON.parse(bodies[0]);
  expect(sent.model).toBe("meta-models/muse-spark-open-1026");
  const evidence = JSON.parse(auditEvidence(draft, context));
  expect(evidence.transcript.length).toBeGreaterThan(0);
  expect(evidence.objects[0].measuredMovementWindows.length).toBeGreaterThan(0);
  expect(evidence.draft.steps.map((s: { id: string }) => s.id)).toEqual(draft.procedure.steps.map((s) => s.id));
  expect(JSON.stringify(sent)).toContain(JSON.stringify(evidence.draft.steps[0].instruction).slice(1, -1));
});

it("flags missing actions and unsupported claims, keeping only real references", async () => {
  const { context, draft } = parsed();
  const stepId = draft.procedure.steps[0].id;
  baseten({
    summary: "Two issues.",
    findings: [
      { category: "missing_action", attention: "requires_expert", message: "The narration says to close the lid, but no step does.", suggestion: "Add a step for closing the lid if it is required.", stepId: null, transcriptMs: 1200, frame: null },
      { category: "unsupported_claim", attention: "requires_expert", message: "The step claims the object is secured.", suggestion: "Describe only the visible transfer.", stepId, transcriptMs: null, frame: 4 },
      // Invented references are removed, duplicates dropped.
      { category: "unsupported_claim", attention: "requires_expert", message: "The step claims the object is secured.", suggestion: "x", stepId: "invented-step", transcriptMs: 99_999_999, frame: 99_999 },
    ],
  });
  const audit = await auditTeachDraft(draft, context, new AbortController().signal);
  expect(audit.findings.map((f) => f.category)).toEqual(["missing_action", "unsupported_claim"]);
  expect(audit.findings[1]).toMatchObject({ stepId, frame: 4 });
  const invented = sanitizeAudit(
    { summary: "s", findings: [{ category: "unclear_goal", attention: "suggestion", message: "m", suggestion: "s", stepId: "nope", transcriptMs: 99_999_999, frame: 99_999 }] },
    draft,
    context,
  );
  expect(invented.findings[0]).toMatchObject({ stepId: null, transcriptMs: null, frame: null });
});

it("the audit never changes the draft, and the V3 contract still validates", async () => {
  const { context, draft } = parsed();
  const before = JSON.stringify(draft);
  baseten({ summary: "One suggestion.", findings: [{ category: "unclear_instruction", attention: "suggestion", message: "Say which plate.", suggestion: "Name the white plate.", stepId: null, transcriptMs: null, frame: null }] });
  await auditTeachDraft(draft, context, new AbortController().signal);
  expect(JSON.stringify(draft)).toBe(before);
  expect(() => validateDraft(draft, context)).not.toThrow();
});

it("a failed audit is reported as an error the page shows as unavailable", async () => {
  const { context, draft } = parsed();
  baseten(null, 500);
  await expect(auditTeachDraft(draft, context, new AbortController().signal)).rejects.toThrow();
});

it("the audit route requires the creator's Teach session", async () => {
  vi.stubEnv("TEACH_ACCESS_TOKEN", "creator-secret-token");
  const { POST } = await import("../src/app/api/teach/audit/route");
  const response = await POST(
    new Request("http://localhost/api/teach/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ token: "x", draft: {} }),
    }),
  );
  expect(response.status).toBe(401);
});
