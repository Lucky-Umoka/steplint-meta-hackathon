import { z } from "zod";
import { ProcedureSpecSchema, type InputEvent, type ProcedureSpec } from "../procedure/schema";
import { verifyEvents } from "../procedure/verifier";
import { RegionSchema, type Region } from "../teach/schema";
import type { Detection } from "./tracker";
export const ZoneBindingsSchema = z.array(z.strictObject({ zoneId: z.string().min(1), region: RegionSchema })).min(2).max(100);
export type ZoneBinding = z.infer<typeof ZoneBindingsSchema>[number];
export function validateSetup(procedure: ProcedureSpec, bindings: ZoneBinding[]) {
  ZoneBindingsSchema.parse(bindings);
  const required = new Set(procedure.steps.flatMap((s) => [s.condition, ...s.forbiddenTransitions.map((r) => r.condition)]).flatMap((c) => [c.fromZone, c.toZone]));
  if (new Set(bindings.map((b) => b.zoneId)).size !== bindings.length || [...required].some((id) => !bindings.some((b) => b.zoneId === id)) || bindings.some((b) => !procedure.zones.some((z) => z.id === b.zoneId))) throw new Error("Draw every rule's approved zone exactly once.");
  for (const condition of procedure.steps.flatMap((s) => [s.condition, ...s.forbiddenTransitions.map((r) => r.condition)])) {
    const from = bindings.find((b) => b.zoneId === condition.fromZone)?.region;
    const to = bindings.find((b) => b.zoneId === condition.toZone)?.region;
    if (!from || !to || Math.max(from.left, to.left) < Math.min(from.right, to.right) && Math.max(from.top, to.top) < Math.min(from.bottom, to.bottom)) throw new Error("A step's start and target regions must not overlap.");
  }
}
type Stable = { zone: string | null; quality: string; candidateSince: number; count: number; lastEmit: number; lastSeen: number; emittedKey: string };
export type PracticeSession = { procedure: ProcedureSpec; bindings: ZoneBinding[]; events: InputEvent[]; stable: Record<string, Stable>; sequence: number; lastTimestamp: number; stopped: boolean };
export function createSession(input: unknown, bindings: ZoneBinding[]): PracticeSession {
  const procedure = ProcedureSpecSchema.parse(input);
  if (!procedure.approval) throw new Error("Human-approved procedure required.");
  validateSetup(procedure, bindings);
  return { procedure, bindings: structuredClone(bindings), events: [], stable: {}, sequence: 0, lastTimestamp: -1, stopped: false };
}
const contains = (r: Region, x: number, y: number) => x > r.left + 0.01 && x < r.right - 0.01 && y > r.top + 0.01 && y < r.bottom - 0.01;
/** Minimum three fresh frames spanning 400ms. Uncertainty invalidates immediately. */
export function feedDetection(session: PracticeSession, detection: Detection, nowMs: number) {
  if (session.stopped) throw new Error("Session paused; reset and recalibrate before continuing.");
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new Error("Invalid observation time.");
  const step = session.procedure.steps.find((s) => s.condition.componentId === detection.componentId);
  if (!step) throw new Error("Unknown tracked component.");
  const priorFrame = session.stable[detection.componentId];
  if (priorFrame && nowMs - priorFrame.lastSeen > 600) detection = { componentId: detection.componentId, quality: "missing", center: null, score: null, reason: "Tracking frame gap; a fresh starting state must be observed." };
  let quality = detection.quality;
  let zone: string | null = null;
  if (quality === "observed") {
    if (!detection.center || detection.score === null || !Number.isFinite(detection.score) || detection.score < step.condition.minimumConfidence) quality = "ambiguous";
    else {
      // Shared/overlapping targets for OTHER components do not determine this object's zone.
      const relevant = new Set([step.condition.fromZone, step.condition.toZone, ...step.forbiddenTransitions.flatMap((r) => [r.condition.fromZone, r.condition.toZone])]);
      const matches = session.bindings.filter((b) => relevant.has(b.zoneId) && contains(b.region, detection.center!.x, detection.center!.y));
      if (matches.length === 1) zone = matches[0].zoneId;
      else {
        const prior = session.stable[detection.componentId];
        // Brief, continuously visible travel through unassigned space is not an action.
        // Only preserve a known starting observation; target loss never gets this grace.
        if (matches.length === 0 && prior?.emittedKey === `observed:${step.condition.fromZone}` && nowMs - prior.lastEmit < 1200 && nowMs > prior.lastSeen) {
          prior.lastSeen = nowMs; prior.count = 0; prior.candidateSince = nowMs;
          return { result: null, emitted: false, detectedAtMs: nowMs };
        }
        quality = "ambiguous";
      }
    }
  }
  const key = `${quality}:${zone}`;
  let stable = session.stable[detection.componentId];
  if (stable && nowMs <= stable.lastSeen) return { result: null, emitted: false, detectedAtMs: nowMs }; // stale frame
  if (!stable || stable.quality !== quality || stable.zone !== zone) {
    stable = { zone, quality, candidateSince: nowMs, count: 0, lastEmit: stable?.lastEmit ?? -1, lastSeen: nowMs, emittedKey: stable?.emittedKey ?? "" };
    session.stable[detection.componentId] = stable;
  }
  stable.lastSeen = nowMs;
  stable.count++;
  const uncertain = quality !== "observed";
  const ready = uncertain || stable.count >= 3 && nowMs - stable.candidateSince >= 400;
  const emit = ready && (stable.emittedKey !== key || nowMs - stable.lastEmit >= (uncertain ? 1500 : 250));
  if (emit) {
    if (session.events.length >= 9500) { session.stopped = true; throw new Error("Session event limit reached. Export the log and reset."); }
    const timestampMs = Math.max(Math.floor(nowMs), session.lastTimestamp + 1);
    session.lastTimestamp = timestampMs;
    const id = `practice-${++session.sequence}`;
    session.events.push({ type: "observation", id, timestampMs, observation: { id, objectId: detection.componentId, timestampMs, quality, zone, confidence: detection.score, location: detection.center, evidence: { sourceId: "local-camera-session", timestampMs, description: detection.reason } } });
    stable.lastEmit = nowMs; stable.emittedKey = key;
  }
  return { result: emit ? verifyEvents(session.procedure, session.events) : null, emitted: emit, detectedAtMs: stable.candidateSince };
}
export function controlSession(session: PracticeSession, action: "reset" | "retry", nowMs: number, stepId?: string) {
  if (action === "retry" && !session.procedure.steps.some((s) => s.id === stepId)) throw new Error("Unknown retry step.");
  const timestampMs = Math.max(Math.floor(nowMs), session.lastTimestamp + 1), id = `practice-${++session.sequence}`;
  session.events.push(action === "reset" ? { type: "reset", id, timestampMs } : { type: "retry", id, timestampMs, stepId: stepId! });
  session.lastTimestamp = timestampMs; session.stable = {};
  if (action === "reset") session.stopped = false;
  return verifyEvents(session.procedure, session.events);
}
