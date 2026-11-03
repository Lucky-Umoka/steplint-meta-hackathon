# Practice Phase 5: final-goal verification, persistent conditions and completion integrity

Date: 2026-11-03. Owner-authorized. Not committed or deployed.

## 1. What existed
- The V3 contract carried `finalConditions` (`object_in_zone`, `projected_separation`) and `goalStepIds`, validated in Teach only.
- **At runtime no predicate was evaluated.** Completion was "every step passed" (`result.status === "passed"`), and the UI said "Goal verified" on that alone.
- Per-step persistence and reversal monitoring existed in the verifier.

## 2. Implemented
- `src/procedure/goal.ts` (pure, model-free):
  - `evaluatePredicate` returns **pass / fail / unknown**;
  - `updateGoal` is the completion gate with states `incomplete → verifying_goal → complete`, plus `invalidated`;
  - every completion and invalidation goes into an append-only audit tied to `approval.revision`.
- `pipeline.ts`: the session keeps the latest observation per object (older timestamps never overwrite newer ones) and updates the gate on every accepted, non-stale frame.
- `local-practice.tsx`: "Goal verified", the green border, the glow, the complete avatar and a **passed rehearsal** now require the gate. V2 lessons keep step-only completion. The messages distinguish:
  - all steps passed but the goal is not yet verified;
  - verification in progress;
  - complete;
  - invalidated;
  - complete earlier but the current view is unclear.

## 3. Predicates
- **`object_in_zone`:** the approved object's box centre is strictly inside the approved zone (the same 0.01 margin as the pipeline). It is **fail** only when reliably outside, and **unknown** at the edge, when ambiguous, below 0.9 or stale (older than the approved `maxObservationGapMs`).
- **`projected_separation`:** uses the same box-gap formula Teach approved, with both objects fresh and confident. Otherwise it is unknown.
- Unsupported or incomplete predicates, or unbound zones, are unknown and never pass.

## 4. Completion gate
- Requires all steps passed, all predicates passing continuously for the goal steps' approved `stableForMs`, no unresolved required identity (anything not observed this frame), a session that is armed and not stopped, and valid calibration.
- The UI also requires lifecycle `running`.

## 5. Persistence and reversals
- After completion the predicates are re-evaluated on every frame.
- A **reliable fail**, or a step that **failed** (verifier reversal), invalidates completion once, is audited, and stays "invalidated" until re-verified through the normal path. Earlier step history is kept.
- **Unknown evidence**, or a step that merely needs verification (for example a hand covering the object), keeps completion with an "uncertain" flag. It is never treated as a reversal.
- Stale-watch-key frames and older-timestamped evidence cannot change the state.

## 6. Tests (automated, not physical)
- `tests/phase5-goal.test.ts` (12 tests) covers spec items 1–25.
- Full suite: `tsc` exit 0; lint 0 errors (5 old warnings); `npm test` **657 passed in 75 files**; build exit 0; `playwright` **42 passed, 1 skipped** (already skipped before).

## 7. Limitations
- Completion uses 2D box geometry only, with no contact, depth or hidden-containment proof.
- A lookalike placed in the exact spot cannot be told apart (see Phase 3).
- Physical camera acceptance is still outstanding.

## 8. Manual test (deployed phone or bottle lesson)
1. Perform the steps. **Expect:** "All steps passed. Verifying the final goal" **before** "Final goal verified".
2. Move the object out of the destination. **Expect:** "Completion invalidated", recorded once.
3. Put it back visibly. **Expect:** it is verified again.
4. Cover the object with your hand after completion. **Expect:** "current view is unclear", not invalidated.
