# Phase 2: procedure schema and deterministic verification

Status: complete. All 62 tests and the lint/type-check/build checks passed on Node 24.21.0.

Scope: the procedure schema, synthetic fixture, and pure verifier only. No camera, AI compiler, segmentation route, UI integration, or live API request was added. No dependency changes were needed. `CLAUDE.md` was absent during inspection; `AGENTS.md` and the roadmap were read.

## Data flow and entry point

`verifyEvents(procedureInput, eventInput)` in `src/procedure/verifier.ts` validates unknown input with Zod and replays an ordered event log. It returns a new `VerificationResult` without changing either input. It uses no network, clock, credentials, or shared state: the same inputs produce the same result. Input logs are bounded at 10,000 events, with up to 100 procedure steps. This is a small batch replay implementation, not a streaming performance claim.

A **schema** describes valid data at runtime. TypeScript catches mistakes while developing; Zod also checks incoming JavaScript/JSON data when the program runs. Types such as `ProcedureSpec`, `Observation`, `InputEvent`, and `VerificationResult` are inferred from their schemas, so their definitions stay consistent.

- `ProcedureSpecSchema`: ID/version, components with descriptions, named zones, ordered steps, prerequisite references, visual transitions, forbidden transitions, recovery instructions, lesson references, and explicit approval metadata. Unapproved (`approval: null`) procedures may be drafted but cannot be verified. Authenticating a real reviewer is a later workflow concern.
- `VisualConditionSchema`: this phase supports only `enters_zone`, with a component, a known starting zone, a target zone, and a confidence threshold. It deliberately does not support `object_present` as an action.
- `ObservationSchema`: observation ID, stable component/object ID, relative practice timestamp in milliseconds, quality, zone, optional normalized x/y location, confidence, and source evidence reference. `null` explicitly represents unavailable location, zone, or confidence. Quality may be `observed`, `unknown`, `missing`, `ambiguous`, or `obstructed`. Clear observations require zone and confidence. Confidence is supplied evidence metadata, not a calibrated probability created by the verifier.
- `InputEventSchema`: timestamped `observation`, `reset`, or step-specific `retry`. Event, observation, and practice evidence timestamps must agree. Lesson source timestamps refer to the teaching source's timeline and are separate from practice time.
- `VerificationResultSchema`: procedure identity, current overall status, per-step states and verification times, and an audit trail with reasons, missing prerequisites, evidence references, and recovery guidance. A historical failure remains in the trail even after correction passes.

Procedure validation rejects duplicate IDs, duplicate prerequisites, dangling references, forward/self/cyclic prerequisites, unknown components/zones, unchanged zones, unsupported condition types, invalid confidence/timestamps, extra fields, and ambiguous multiple steps for one component. That last restriction is deliberate for this three-component demo, not a general procedural language. Forbidden rules apply to the component owned by their step and reference earlier prerequisite steps.

## How the state machine works

A **state machine** means that evidence changes progress only through defined rules:

| State | Meaning |
| --- | --- |
| `pending` | Eligible step awaits evidence. |
| `blocked` | Earlier steps have not passed. |
| `needs_verification` | Evidence cannot establish the required transition or previous verification was lost. |
| `failed` | A clearly observed transition violated ordering or a forbidden-transition rule. |
| `passed` | Clear before/after evidence establishes the transition with all earlier steps already verified. |

Overall status is `pending`, `in_progress`, `passed`, `failed`, or `needs_verification`. An unresolved failed step takes precedence over uncertainty. Ignored duplicates do not hide the most recent unresolved uncertainty decision.

For the demo, two clear observations at confidence >= 0.9 must show `staging` → the component's target. This threshold is a hand-authored fixture policy, not measured model accuracy. `staging` is the latch's open position. A lone image of a component in its target is insufficient. Unknown/missing/ambiguous/obstructed/low-confidence evidence breaks the transition chain; recovery needs fresh clear before/after observations. No failure is inferred just because an object is missing.

Array order is enforced even if a step omits an explicit prerequisite. All new events must have strictly increasing practice timestamps; equal-time or stale inputs are rejected conservatively rather than guessed or silently sorted. The before observation must occur after earlier steps were verified: an interval spanning prerequisite verification is uncertain. Future perception adapters must provide meaningful zones and stable object identities; this verifier does not manufacture them from pixels.

If a verified component leaves its target or becomes uncertain, its verification and later verifications are invalidated. Their old source evidence stays in the history, but downstream components require fresh transitions. For this small ordered fixture, invalidation applies to the entire suffix, rather than a general dependency graph.

Duplicate event IDs with identical data are ignored. Observation IDs are also deduplicated independently of their wrapping event ID. Conflicting reused IDs are rejected as `needs_verification`. Deduplication history survives reset and retry. It is scoped to the supplied log; callers must preserve that log for the session. This is not persistent storage or authentication.

`reset` clears all progress and observation baselines. `retry` clears progress/baselines from the selected step onward while preserving earlier verified prerequisites. Neither proves a physical correction, and neither can pass a step. A fresh observed transition is still required.

## Worked examples (synthetic evidence)

Correct order:

1. Base at `staging` at 10 ms, then `base-target` at 11 ms → base passed.
2. Support at `staging` at 20 ms, then `support-target` at 21 ms → support passed.
3. Latch at `staging` at 30 ms, then `latch-closed` at 31 ms → latch and procedure passed.

Wrong order and correction:

1. Verify base at 11 ms.
2. Observe latch open at 12 ms and closed at 13 ms → failed, missing `install-support`; recovery says to reopen the latch and verify support before reclosing.
3. Verify support at 21 ms. The early latch closure does **not** become a pass retroactively.
4. Observe latch open at 30 ms and closed at 31 ms → latch passed. The old violation is retained in history.

Uncertainty: support seen in its target once, or a transition ending with `quality: "ambiguous"`, stays `needs_verification`. Neither presence nor a confidence value overrides uncertain quality.

The fixture in `src/procedure/demo.ts` is hand-authored test data. Its lesson ID, reviewer, and teaching timestamps (1000/4000/7000 ms) are synthetic, not a real approved recording. Target-zone transitions are controlled demo proxies; they do not prove actual seating, mechanical closure, safety, or arbitrary-task accuracy.

## Verification

- `npm test`: **62 tests passed** across 2 files (53 Phase 2 cases and 9 foundation cases). All are local deterministic/mocked tests; fetch calls are forbidden and asserted absent.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed using the existing Webpack configuration; routes remain `/`, `/_not-found`, and `/api/health`.
- No model calls, secret changes, new routes, or application dependencies.

Run just these cases with `npm test -- tests/procedure.test.ts`. Read the "recovers through verified support, reopening, and a fresh closure" test alongside the worked example. Change a copied event to `quality: "ambiguous"` to see why the result remains unverified; change an ID to duplicate an earlier event to see why progress does not advance twice.
