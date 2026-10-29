import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { demoProcedure } from "../src/procedure/demo";
import { verifyEvents } from "../src/procedure/verifier";
import { createSession, feedDetection, controlSession, type PracticeSession, type ZoneBinding } from "../src/practice/pipeline";
import { groundColour, trackColour, hueDistance, type Detection, type Pixels } from "../src/practice/tracker";
import { PracticeLessonSchema } from "../src/practice/lesson";
import { seal } from "../src/server/teach/security";
import { POST } from "../src/app/api/teach/practice-lesson/route";
vi.mock("server-only", () => ({}));
const token = "practice-tests-owner-token-at-least-32-characters";
beforeEach(() => { vi.stubEnv("TEACH_ACCESS_TOKEN", token); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Live network forbidden"); })); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const bindings: ZoneBinding[] = [
  { zoneId: "staging", region: { left: .02, top: .02, right: .45, bottom: .98 } },
  { zoneId: "base-target", region: { left: .55, top: .02, right: .98, bottom: .3 } },
  { zoneId: "support-target", region: { left: .55, top: .35, right: .98, bottom: .65 } },
  { zoneId: "latch-closed", region: { left: .55, top: .7, right: .98, bottom: .98 } },
];
const componentIds = ["blue-base", "yellow-support", "red-latch"];
function detection(index: number, target = false): Detection { return { componentId: componentIds[index], quality: "observed", center: { x: target ? .75 : .2, y: [.17, .5, .83][index] }, score: .99, reason: "Synthetic test geometry" }; }
function frames(s: PracticeSession, start: number, end: number, positions: boolean[], uncertain = -1) {
  for (let t = start; t <= end; t += 100) componentIds.forEach((_, index) => feedDetection(s, index === uncertain ? { ...detection(index), quality: "missing", center: null, score: null } : detection(index, positions[index]), t));
  return verifyEvents(s.procedure, s.events);
}
function image(boxes: { x: number; y: number; colour: number[]; size?: number }[]): Pixels {
  const width = 160, height = 120, data = new Uint8ClampedArray(width * height * 4);
  for (const { x, y, colour, size = 12 } of boxes) for (let yy = y; yy < y + size; yy++) for (let xx = x; xx < x + size; xx++) data.set([...colour, 255], (yy * width + xx) * 4);
  return { data, width, height };
}
const colours = [[0, 0, 255], [255, 255, 0], [255, 0, 0]];
function pixelFrame(targets: boolean[]) { return image(colours.map((colour, i) => ({ colour, x: targets[i] ? 110 : 25, y: [14, 54, 94][i] }))); }
describe("local tracker and event-to-evaluator pipeline", () => {
  it("requires actual human approval and complete, non-overlapping zone mappings", () => {
    expect(() => createSession({ ...demoProcedure, approval: null }, bindings)).toThrow("approved");
    expect(() => createSession(demoProcedure, bindings.slice(1))).toThrow();
    expect(() => createSession(demoProcedure, bindings.map((b) => ({ ...b, region: bindings[0].region })))).toThrow("overlap");
  });
  it("supports approved procedures with unused declared zones", () => {
    const procedure = { ...demoProcedure, zones: [...demoProcedure.zones, { id: "unused", description: "Unused lesson region" }] };
    expect(createSession(procedure, bindings).procedure.zones).toHaveLength(5);
  });
  it("verifies the correct sequence from pixel frames, not presence alone", () => {
    const s = createSession(demoProcedure, bindings), initial = pixelFrame([false, false, false]);
    const profiles = componentIds.map((id, i) => groundColour(initial, id, { x: 31 / 160, y: [20, 60, 100][i] / 120 }, []));
    for (let t = 0; t <= 2200; t += 100) {
      const pixels = pixelFrame([t >= 600, t >= 1200, t >= 1800]);
      for (const p of profiles) feedDetection(s, trackColour(pixels, p), t);
    }
    expect(verifyEvents(s.procedure, s.events).steps.map((x) => x.status)).toEqual(["passed", "passed", "passed"]);
  });
  it("never infers an action from initially present targets", () => {
    const s = createSession(demoProcedure, bindings);
    const result = frames(s, 0, 800, [true, true, true]);
    expect(result.steps.every((x) => x.status !== "passed")).toBe(true);
  });
  it("rejects the premature latch and names the support prerequisite and recovery", () => {
    const s = createSession(demoProcedure, bindings); frames(s, 0, 500, [false, false, false]);
    const result = frames(s, 600, 1100, [false, false, true]);
    const failure = result.events.find((x) => x.status === "failed");
    expect(failure?.missingPrerequisites).toContain("install-support");
    expect(failure?.recovery?.instruction).toContain("Reopen the latch");
    expect(result.steps[2].status).toBe("failed");
  });
  it("rejects support before base and a missing base cannot satisfy prerequisites", () => {
    const s = createSession(demoProcedure, bindings); frames(s, 0, 500, [false, false, false], 0);
    const result = frames(s, 600, 1100, [false, true, false], 0);
    expect(result.steps[0].status).not.toBe("passed"); expect(result.steps[1].status).toBe("failed");
  });
  it("debounces transient target noise and ignores duplicate/stale camera timestamps", () => {
    const s = createSession(demoProcedure, bindings); frames(s, 0, 500, [false, false, false]);
    feedDetection(s, detection(0, true), 600);
    for (let i = 0; i < 20; i++) feedDetection(s, detection(0, true), 600);
    frames(s, 700, 1200, [false, false, false]);
    expect(verifyEvents(s.procedure, s.events).steps[0].status).not.toBe("passed");
    const ids = s.events.map((e) => e.id); expect(new Set(ids).size).toBe(ids.length);
  });
  it.each(["missing", "ambiguous", "obstructed"] as const)("%s invalidates the before state; target reacquisition alone cannot pass", (quality) => {
    const s = createSession(demoProcedure, bindings); frames(s, 0, 500, [false, false, false]);
    feedDetection(s, { ...detection(0), quality, score: null, center: null }, 600);
    const result = frames(s, 700, 1300, [true, false, false]);
    expect(result.steps[0].status).not.toBe("passed");
  });
  it("low quality and zone boundaries remain uncertain", () => {
    const s = createSession(demoProcedure, bindings);
    feedDetection(s, { ...detection(0), score: .4 }, 0);
    expect(verifyEvents(s.procedure, s.events).steps[0].status).toBe("needs_verification");
    feedDetection(s, { ...detection(0), center: { x: .55, y: .17 } }, 100);
    expect(verifyEvents(s.procedure, s.events).steps[0].status).not.toBe("passed");
  });
  it("allows short continuously visible transit, but long tracking gaps invalidate it", () => {
    const s = createSession(demoProcedure, bindings); frames(s, 0, 500, [false, false, false]);
    feedDetection(s, { ...detection(0), center: { x: .5, y: .17 } }, 600);
    expect(frames(s, 700, 1200, [true, false, false]).steps[0].status).toBe("passed");
    const other = createSession(demoProcedure, bindings); frames(other, 0, 500, [false, false, false]);
    expect(frames(other, 2000, 2600, [true, false, false]).steps[0].status).not.toBe("passed");
  });
  it("retry requires reopening and a fresh transition; reset clears all progress", () => {
    const s = createSession(demoProcedure, bindings); frames(s, 0, 500, [false, false, false]); frames(s, 600, 1100, [false, false, true]);
    controlSession(s, "retry", 1200, "close-latch");
    expect(frames(s, 1300, 1800, [false, false, true]).steps[2].status).not.toBe("passed");
    frames(s, 1900, 2400, [false, false, false]); frames(s, 2500, 3000, [true, false, false]); frames(s, 3100, 3600, [true, true, false]);
    expect(frames(s, 3700, 4200, [true, true, true]).status).toBe("passed");
    expect(controlSession(s, "reset", 4300).steps.every((x) => x.status !== "passed")).toBe(true);
    expect(frames(s, 4400, 4900, [true, true, true]).steps.every((x) => x.status !== "passed")).toBe(true);
  });
  it("loss of a verified component invalidates downstream steps", () => {
    const s = createSession(demoProcedure, bindings); frames(s, 0, 500, [false, false, false]); frames(s, 600, 1100, [true, false, false]); frames(s, 1200, 1700, [true, true, false]);
    const result = frames(s, 1800, 1900, [true, true, false], 0);
    expect(result.steps[0].status).not.toBe("passed"); expect(result.steps[1].status).not.toBe("passed");
  });
  it("identifies colour components and rejects occlusion, duplicate colours and low saturation", () => {
    const initial = pixelFrame([false, false, false]), profile = groundColour(initial, "blue-base", { x: 31 / 160, y: 20 / 120 }, []);
    expect(trackColour(initial, profile).quality).toBe("observed");
    expect(trackColour(image([]), profile).quality).toBe("missing");
    expect(trackColour(image([{ x: 25, y: 14, colour: colours[0], size: 8 }]), profile).quality).toBe("obstructed");
    expect(trackColour(image([{ x: 25, y: 14, colour: colours[0] }, { x: 100, y: 14, colour: colours[0] }]), profile).quality).toBe("ambiguous");
    expect(() => groundColour(initial, "duplicate", { x: 31 / 160, y: 20 / 120 }, [profile])).toThrow("different colours");
    expect(() => groundColour(initial, "background", { x: .5, y: .5 }, [])).toThrow("saturated");
    expect(hueDistance(359, 1)).toBe(2);
  });
  it("pauses on event capacity without advancing", () => {
    const s = createSession(demoProcedure, bindings); s.events.length = 9500;
    feedDetection(s, detection(0), 0); feedDetection(s, detection(0), 200);
    expect(() => feedDetection(s, detection(0), 400)).toThrow("limit"); expect(s.stopped).toBe(true);
  });
});
function exportArtifact() {
  const id = "00000000-0000-4000-8000-000000000001";
  return { procedure: { ...demoProcedure, id }, zoneBindings: bindings, review: {}, lessonId: id, notes: [], sourceLesson: { lessonId: id, media: { info: { container: "mp4", mime: "video/mp4", bytes: 100, durationSeconds: 15, video: { codec: "avc", width: 640, height: 480, frames: 3, fps: 15 }, audio: { codec: "aac", sampleRate: 24000, channels: 1 } }, frameTimesMs: [0, 1000, 2000] }, transcript: { text: "test", turns: [], durationMs: 15000 } } };
}
describe("approved lesson import", () => {
  it("accepts an unchanged signed Teach export without provider requests", async () => {
    const artifact = exportArtifact(), digest = createHash("sha256").update(JSON.stringify(artifact)).digest("hex");
    const approvalReceipt = seal({ digest, lessonId: artifact.lessonId }, "approved", "owner-cli");
    const req = new Request("http://localhost/api/teach/practice-lesson", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...artifact, approvalReceipt }) });
    const response = await POST(req); expect(response.status).toBe(200); expect(PracticeLessonSchema.parse(await response.json()).origin).toBe("teach"); expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects modified exports, fabricated receipts, unapproved specs and missing auth", async () => {
    const artifact = exportArtifact(), digest = createHash("sha256").update(JSON.stringify(artifact)).digest("hex");
    const approvalReceipt = seal({ digest, lessonId: artifact.lessonId }, "approved", "owner-cli");
    artifact.procedure.title = "changed";
    const req = (body: unknown, auth = true) => new Request("http://localhost/api/teach/practice-lesson", { method: "POST", headers: auth ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
    expect((await POST(req({ ...artifact, approvalReceipt }))).status).toBe(422);
    expect((await POST(req({ ...artifact, approvalReceipt: "fake" }))).status).toBe(401);
    expect((await POST(req({ ...artifact, approvalReceipt }, false))).status).toBe(401);
    expect(() => PracticeLessonSchema.parse({ procedure: { ...demoProcedure, approval: null }, zoneBindings: bindings, sourceLesson: null, origin: "controlled-fixture" })).toThrow();
  });
});
