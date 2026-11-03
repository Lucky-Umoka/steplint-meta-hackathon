import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  FelicityGate,
  FELICITY_RELEVANCE_MS,
  incidentStillRelevant,
  visibilityRequest,
  type FelicityIncident,
} from "../src/practice/felicity";

vi.mock("server-only", () => ({}));

const incident = (over: Partial<FelicityIncident> = {}): FelicityIncident => ({
  id: "abcd1234:step-1:practice-7",
  kind: "confirmed_mistake",
  stepId: "step-1",
  objectId: "component-1",
  revision: "r1",
  generation: 3,
  createdAtMs: 1000,
  ...over,
});
const now = (over = {}) => ({
  sessionActive: true,
  generation: 3,
  revision: "r1",
  nowMs: 5000,
  stepStatus: "failed",
  objectQuality: "observed",
  ...over,
});

describe("Felicity freshness (stale-response protection)", () => {
  it("delivers only while the same uncorrected incident is current", () => {
    const i = incident();
    expect(incidentStillRelevant(i, i.id, now()).deliver).toBe(true);
    for (const [snapshot, reason] of [
      [now({ stepStatus: "pending" }), "learner already corrected it"],
      [now({ stepStatus: "passed" }), "learner already corrected it"],
      [now({ sessionActive: false }), "practice not active"],
      [now({ generation: 4 }), "practice restarted"],
      [now({ revision: "r2" }), "different procedure revision"],
      [now({ nowMs: 1000 + FELICITY_RELEVANCE_MS + 1 }), "evidence no longer current"],
    ] as const)
      expect(incidentStillRelevant(i, i.id, snapshot)).toEqual({ deliver: false, reason });
    expect(incidentStillRelevant(i, "newer-incident", now())).toEqual({
      deliver: false,
      reason: "replaced by a newer incident",
    });
  });
  it("a visibility incident is corrected when the object is observed again", () => {
    const i = incident({ kind: "occluded" });
    expect(incidentStillRelevant(i, i.id, now({ objectQuality: "obstructed" })).deliver).toBe(true);
    expect(incidentStillRelevant(i, i.id, now({ objectQuality: "observed" })).reason).toBe(
      "learner already corrected it",
    );
  });
  it("a new incident aborts the previous request and one incident is requested once", () => {
    const gate = new FelicityGate();
    const first = gate.start(incident());
    expect(first?.aborted).toBe(false);
    expect(gate.start(incident())).toBeNull(); // duplicate incident
    const second = gate.start(incident({ id: "abcd1234:step-1:practice-9" }));
    expect(first?.aborted).toBe(true); // previous advice can no longer be delivered
    expect(gate.active?.id).toBe("abcd1234:step-1:practice-9");
    gate.clear();
    expect(second?.aborted).toBe(true);
    expect(gate.active).toBeNull();
  });
});

describe("Gideon local visibility requests", () => {
  it("names the object and never calls it a mistake", () => {
    expect(visibilityRequest("red squeeze bottle", "unclear")).toBe(
      "I can't see the red squeeze bottle clearly. Please show it to the camera.",
    );
    expect(visibilityRequest("connector", "obstructed")).toBe(
      "Please move your hand so I can see the connector.",
    );
    expect(visibilityRequest("the tray", "lost")).toBe(
      "I lost track of the tray. Hold it still for a moment.",
    );
    for (const s of ["unclear", "obstructed", "lost"] as const)
      expect(visibilityRequest("phone", s)).not.toMatch(/stop|wrong|mistake|failed/i);
  });
});

describe("Felicity server: Baseten only, bounded, advisory", () => {
  const valid = {
    incidentId: "abcd1234:step-1:practice-7",
    sessionId: "session-123456",
    procedureId: "59882a57-32e4-4632-ad85-05d2f17767b0",
    revision: "a".repeat(64),
    stepId: "step-1",
    kind: "confirmed_mistake",
    instruction: "Move red squeeze bottle from blue lid to white plate.",
    approvedRecovery: "Return bottle to blue lid and retry.",
    reason: "Previously verified target state was lost.",
    objects: ["red squeeze bottle", "white plate"],
    zones: ["blue lid", "white plate"],
  };
  beforeEach(async () => {
    (await import("../src/server/practice/recovery")).resetRecoveryLimits();
    vi.stubEnv("BASETEN_API_KEY", "mock-baseten-key");
    vi.stubEnv("FELICITY_ENABLED", "");
    vi.stubEnv("FELICITY_MAX_PER_HOUR", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const baseten = (advice: unknown, status = 200) => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url) === "data:,") return new Response("");
        const req = new Request(url, init);
        calls.push({ url: req.url, body: await req.text() });
        if (status !== 200) return Response.json({ error: { message: "down" } }, { status });
        return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(advice) } }] });
      }),
    );
    return calls;
  };
  it("returns one grounded sentence from Muse Spark Open on Baseten", async () => {
    const { felicityAdvice, RecoveryRequestSchema } = await import("../src/server/practice/recovery");
    const calls = baseten({
      category: "confirmed_mistake",
      needsClarification: false,
      advice: "Put the red squeeze bottle back on the blue lid, then move it to the white plate. Extra text.",
    });
    const result = await felicityAdvice(RecoveryRequestSchema.parse(valid), new AbortController().signal);
    expect(result.advice).toBe(
      "Put the red squeeze bottle back on the blue lid, then move it to the white plate.",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://inference.baseten.co/v1/chat/completions");
    expect(JSON.parse(calls[0].body).model).toBe("meta-models/muse-spark-open-1026");
  });
  it("rejects advice that claims a verdict (the verifier is the only authority)", async () => {
    const { sanitizeAdvice } = await import("../src/server/practice/recovery");
    expect(sanitizeAdvice("Great, the step is verified.")).toBeNull();
    expect(sanitizeAdvice("You passed this step.")).toBeNull();
    expect(sanitizeAdvice("Hold the bottle still over the plate.")).toBe(
      "Hold the bottle still over the plate.",
    );
  });
  it("one request per incident, per-session and global caps, and an off switch", async () => {
    const { admitRecovery, RecoveryRequestSchema } = await import("../src/server/practice/recovery");
    const input = RecoveryRequestSchema.parse(valid);
    admitRecovery(input, 0);
    expect(() => admitRecovery(input, 1)).toThrow(/already requested/);
    for (let i = 0; i < 5; i++)
      admitRecovery({ ...input, incidentId: `abcd1234:other-${i}` }, 2 + i);
    expect(() => admitRecovery({ ...input, incidentId: "abcd1234:seventh" }, 10)).toThrow(/limit/);
    vi.stubEnv("FELICITY_ENABLED", "0");
    expect(() => admitRecovery({ ...input, incidentId: "abcd1234:off-x" }, 11)).toThrow(/switched off/);
  });
  it("the route refuses cross-site requests and reports provider failures without breaking", async () => {
    const { POST } = await import("../src/app/api/practice/recovery/route");
    const post = (headers: Record<string, string>, body = valid) =>
      POST(
        new Request("http://localhost/api/practice/recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify(body),
        }),
      );
    expect((await post({ Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    baseten(null, 500);
    const failed = await post({ Origin: "http://localhost", "Sec-Fetch-Site": "same-origin" });
    expect(failed.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await failed.json())).not.toContain("mock-baseten-key");
    baseten({ category: "occluded", needsClarification: true, advice: "Please show the white plate to the camera." });
    const ok = await post(
      { Origin: "http://localhost", "Sec-Fetch-Site": "same-origin" },
      { ...valid, incidentId: "abcd1234:second-incident", kind: "occluded" },
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ incidentId: "abcd1234:second-incident", needsClarification: true });
    expect((await post({ Origin: "http://localhost", "Sec-Fetch-Site": "same-origin" }, { ...valid, objects: [] })).status).toBe(400);
  });
  it("Felicity code never imports or feeds the deterministic verifier", () => {
    for (const file of ["src/practice/felicity.ts", "src/server/practice/recovery.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/procedure\/verifier|practice\/pipeline|feedTrackingFrame|feedDetection/);
    }
  });
});

describe("Felicity setup help (automatic Practice not started)", () => {
  const setup = incident({ kind: "setup_blocked", generation: 1 });
  it("is current while Practice has not started, across setup retries", () => {
    expect(
      incidentStillRelevant(setup, setup.id, now({ generation: 7, practiceRunning: false, cameraOn: true, sessionActive: false })).deliver,
    ).toBe(true);
  });
  it("is discarded once Practice runs, the camera stops, or a newer incident replaces it", () => {
    expect(incidentStillRelevant(setup, setup.id, now({ practiceRunning: true, cameraOn: true })).reason).toBe("learner already corrected it");
    expect(incidentStillRelevant(setup, setup.id, now({ practiceRunning: false, cameraOn: false })).reason).toBe("practice not active");
    expect(incidentStillRelevant(setup, "other", now({ practiceRunning: false, cameraOn: true })).reason).toBe("replaced by a newer incident");
  });
});
