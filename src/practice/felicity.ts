/**
 * Client-side incident tracking for Felicity's asynchronous advice.
 * Pure state + freshness rules (no DOM, no network) so they are unit-tested.
 * Felicity advice is advisory text only; nothing here feeds the verifier.
 */
export type FelicityKind =
  | "confirmed_mistake"
  | "occluded"
  | "identity_uncertain"
  | "insufficient_evidence"
  | "tracking_problem"
  | "unresolved_recovery"
  /** Automatic Practice has not started (setup, view or objects). */
  | "setup_blocked";
export type FelicityIncident = {
  id: string;
  kind: FelicityKind;
  stepId: string;
  objectId: string;
  revision: string | null;
  /** Practice worker generation the incident belongs to. */
  generation: number;
  createdAtMs: number;
};
/** What the page knows when a delayed answer arrives. */
export type FelicitySnapshot = {
  sessionActive: boolean;
  generation: number;
  revision: string | null;
  nowMs: number;
  /** Current verifier status of the incident's step. */
  stepStatus: string | undefined;
  /** Current tracker quality of the incident's object. */
  objectQuality: string | undefined;
  /** Practice is running (armed) right now. */
  practiceRunning?: boolean;
  /** The camera is on (setup can still be helped). */
  cameraOn?: boolean;
};
/** Advice older than this no longer matches what the learner is doing. */
export const FELICITY_RELEVANCE_MS = 30_000;

export function incidentStillRelevant(
  incident: FelicityIncident,
  activeIncidentId: string | null,
  now: FelicitySnapshot,
): { deliver: boolean; reason: string } {
  if (incident.kind === "setup_blocked") {
    // Setup help is current only while Practice is still not running; setup
    // retries start new workers, so it is not tied to one generation.
    if (now.practiceRunning)
      return { deliver: false, reason: "learner already corrected it" };
    if (!now.cameraOn) return { deliver: false, reason: "practice not active" };
    if (now.revision !== incident.revision)
      return { deliver: false, reason: "different procedure revision" };
    if (activeIncidentId !== incident.id)
      return { deliver: false, reason: "replaced by a newer incident" };
    if (now.nowMs - incident.createdAtMs > FELICITY_RELEVANCE_MS)
      return { deliver: false, reason: "evidence no longer current" };
    return { deliver: true, reason: "current" };
  }
  if (!now.sessionActive) return { deliver: false, reason: "practice not active" };
  if (now.generation !== incident.generation)
    return { deliver: false, reason: "practice restarted" };
  if (now.revision !== incident.revision)
    return { deliver: false, reason: "different procedure revision" };
  if (activeIncidentId !== incident.id)
    return { deliver: false, reason: "replaced by a newer incident" };
  if (now.nowMs - incident.createdAtMs > FELICITY_RELEVANCE_MS)
    return { deliver: false, reason: "evidence no longer current" };
  const corrected =
    incident.kind === "confirmed_mistake" ||
    incident.kind === "unresolved_recovery"
      ? now.stepStatus !== "failed"
      : now.objectQuality === "observed";
  if (corrected) return { deliver: false, reason: "learner already corrected it" };
  return { deliver: true, reason: "current" };
}

/**
 * One active incident at a time. Starting a new incident aborts the previous
 * request locally; an abort only stops us listening — it is never treated as
 * proof that the provider stopped processing, and late answers are still
 * filtered by `incidentStillRelevant`.
 */
export class FelicityGate {
  active: FelicityIncident | null = null;
  private controller: AbortController | null = null;
  private requested = new Set<string>();
  start(incident: FelicityIncident): AbortSignal | null {
    if (this.requested.has(incident.id)) return null; // one request per incident
    this.requested.add(incident.id);
    this.controller?.abort();
    this.active = incident;
    this.controller = new AbortController();
    return this.controller.signal;
  }
  /** The learner corrected the problem or Practice stopped: drop it. */
  clear(reason?: (incident: FelicityIncident) => boolean) {
    if (this.active && (!reason || reason(this.active))) {
      this.controller?.abort();
      this.controller = null;
      this.active = null;
    }
  }
}

/**
 * Gideon's immediate, local visibility request (no model call). Missing
 * visibility is uncertainty, never a procedural violation.
 */
export function visibilityRequest(
  name: string,
  situation: "obstructed" | "lost" | "unclear",
): string {
  const object = /^the\b/i.test(name) ? name : `the ${name}`;
  return situation === "obstructed"
    ? `Please move your hand so I can see ${object}.`
    : situation === "lost"
      ? `I lost track of ${object}. Hold it still for a moment.`
      : `I can't see ${object} clearly. Please show it to the camera.`;
}
