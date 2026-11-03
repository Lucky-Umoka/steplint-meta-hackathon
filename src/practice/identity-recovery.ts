/**
 * Per-object identity lifecycle, kept separate from global scene calibration:
 *
 *   tracked → occluded → reacquiring → tracked | needs_user_view
 *
 * plus `dormant` (an approved later object not yet activated) and `acquiring`
 * (an activated object being found for the first time from its approved
 * template). A reacquisition is accepted only after RECOVERY.freshObservations
 * consecutive, mutually consistent template matches (one search hit plus fresh
 * confirmations); losses are bounded to RECOVERY.maxAttempts searches spread
 * across RECOVERY.windowMs, at most one action per fresh frame. After exhaustion one search per second continues while awaiting a clear view. Pure: no clock, no I/O.
 */
export const RECOVERY = {
  maxAttempts: 3,
  windowMs: 2000,
  freshObservations: 3,
  /** Normalized centre distance within which successive matches agree. */
  consistency: 0.02,
} as const;

export type IdentityStatus =
  | "tracked"
  | "occluded"
  | "reacquiring"
  | "needs_user_view"
  | "dormant"
  | "acquiring";
type Point = { x: number; y: number };
export type IdentityState = {
  status: IdentityStatus;
  episodeStartMs: number | null;
  attempts: number;
  /** Consecutive consistent candidate centres in the current search. */
  candidates: Point[];
  lastFrameId: string | null;
  lastSearchMs: number | null;
};
export type IdentityEvent = {
  objectId: string;
  status: IdentityStatus;
  reason: string;
};

export const trackedIdentity = (): IdentityState => ({
  status: "tracked",
  episodeStartMs: null,
  attempts: 0,
  candidates: [],
  lastFrameId: null,
  lastSearchMs: null,
});
export const dormantIdentity = (): IdentityState => ({
  ...trackedIdentity(),
  status: "dormant",
});

/** The tracker lost a reliable observation of a tracked object. */
export function loseIdentity(
  state: IdentityState,
  nowMs: number,
): IdentityState {
  if (state.status !== "tracked") return state;
  return {
    status: "occluded",
    episodeStartMs: nowMs,
    attempts: 0,
    candidates: [],
    lastFrameId: null,
    lastSearchMs: null,
  };
}
/** An approved later object became part of the watch set. */
export function activateIdentity(state: IdentityState): IdentityState {
  return state.status === "dormant"
    ? { ...state, status: "acquiring", candidates: [] }
    : state;
}
/**
 * What may run on this fresh frame for this identity:
 * - "confirm": re-check the current candidate (does not count as an attempt);
 * - "attempt": a full search for the approved appearance. During a loss
 *   episode at most RECOVERY.maxAttempts attempts run, spread across
 *   RECOVERY.windowMs (never on the frame that detected the loss), so a hand
 *   briefly covering the object does not exhaust them all at once;
 * - "none".
 * At most one action per fresh frame.
 */
export function nextSearch(
  state: IdentityState,
  nowMs: number,
  frameId: string,
): "attempt" | "confirm" | "none" {
  if (state.lastFrameId === frameId) return "none";
  if (state.candidates.length) return "confirm";
  if (state.status === "acquiring") return "attempt";
  if (state.status === "needs_user_view")
    return nowMs - (state.lastSearchMs ?? state.episodeStartMs ?? nowMs) >= 1000
      ? "attempt"
      : "none";
  if (state.status !== "occluded" && state.status !== "reacquiring")
    return "none";
  const elapsed = nowMs - (state.episodeStartMs ?? nowMs);
  return state.attempts < RECOVERY.maxAttempts &&
    elapsed > 0 &&
    elapsed <= RECOVERY.windowMs &&
    elapsed >= state.attempts * (RECOVERY.windowMs / RECOVERY.maxAttempts)
    ? "attempt"
    : "none";
}
/**
 * Apply one search or confirmation result. `candidate` is a centre that
 * already passed the approved-template match and competing-candidate
 * separation gates, or null. Identity is re-established only after
 * RECOVERY.freshObservations consecutive consistent observations.
 */
export function recordSearch(
  state: IdentityState,
  nowMs: number,
  frameId: string,
  candidate: Point | null,
): { state: IdentityState; accepted: boolean } {
  const acquiring = state.status === "acquiring";
  const confirming = state.candidates.length > 0;
  const consistent =
    !!candidate &&
    (!confirming ||
      Math.hypot(
        candidate.x - state.candidates.at(-1)!.x,
        candidate.y - state.candidates.at(-1)!.y,
      ) <= RECOVERY.consistency);
  const next: IdentityState = {
    ...state,
    status: acquiring ? "acquiring" : "reacquiring",
    attempts: acquiring || confirming ? state.attempts : state.attempts + 1,
    lastFrameId: frameId,
    lastSearchMs: nowMs,
    candidates: consistent ? [...state.candidates, candidate!] : [],
  };
  if (next.candidates.length >= RECOVERY.freshObservations)
    return { state: trackedIdentity(), accepted: true };
  if (
    !acquiring &&
    !next.candidates.length &&
    (next.attempts >= RECOVERY.maxAttempts ||
      nowMs - (next.episodeStartMs ?? nowMs) > RECOVERY.windowMs)
  )
    return {
      state: { ...next, status: "needs_user_view", candidates: [] },
      accepted: false,
    };
  return { state: next, accepted: false };
}
/** The bounded window ended without a search succeeding. */
export function expireSearch(
  state: IdentityState,
  nowMs: number,
): IdentityState {
  if (
    (state.status === "occluded" || state.status === "reacquiring") &&
    !state.candidates.length &&
    (state.attempts >= RECOVERY.maxAttempts ||
      nowMs - (state.episodeStartMs ?? nowMs) > RECOVERY.windowMs)
  )
    return { ...state, status: "needs_user_view", candidates: [] };
  return state;
}
