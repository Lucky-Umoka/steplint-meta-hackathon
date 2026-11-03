# Practice V3 Phase 3: watch sets, object initialization and identity recovery

Date: 2026-11-03. Branch `fix/phyical-practice-test` (base `088bf65`). The owner authorized Phase 3. Nothing was committed, pushed or deployed, and no paid model call was made. **STOP: Phase 4 needs explicit owner approval.** The "SURGICAL HACKATHON DEMO FIX" text in IMPLEMENTATION_FIXES.md was not applied (owner decision).

## Owner decisions (2026-11-02/03)
1. Make automatic setup role-aware (fixes a Phase 2 gap).
2. One strong stationary reference may establish a camera **shift only**. Rotation, zoom or tilt blocks with an instruction.
3. Approved stationary objects replace table texture as the camera-motion reference.
4. Run physical tests with the bottle lesson.

## Pre-implementation findings (confirmed in code)
- Startup required every approved object, so a hidden phone or an absent supporting object blocked it.
- Alignment needed two stationary anchors at least 0.2 apart, or else table-texture patches. Camera monitoring always needed a textured table patch.
- A lost object stayed ambiguous forever while calibration was valid.
- Arming waited for every mover, including a hidden later object.
- Every frame had to report every object, and there was no watch-set revision.
- Overlapping (nested) objects were rejected.
- Phase 2 gap: setup demanded a reliable source image for irrelevant objects too.

## 1. Files changed
- **New:** `src/practice/watch-set.ts`, `src/practice/identity-recovery.ts`, `tests/phase3-pipeline.test.ts`, `tests/phase3-tracking.test.ts`, `tests/identity-recovery.test.ts`, `tests/fixtures/practice-scene.ts`.
- **Changed:**
  - `src/practice/local-tracking.ts`: per-object slots, partial and dormant bootstrap, bounded searches, stationary-object camera reference, nested pairs.
  - `src/practice/automatic-alignment.ts`: `alignFixedObjects`.
  - `src/practice/local-tracking-protocol.ts`, `local-tracking-worker.ts`.
  - `src/practice/pipeline.ts`: watch-set frame contract, stale keys, arming, identity audit.
  - `src/app/practice/local-practice.tsx`: wiring only, no layout change.
  - `src/teach/automatic-setup.ts`: role-aware setup.
- **Teach diagnostics** (owner report during this phase): `src/teach/source-evidence.ts` (`movementDiagnosis`), `v3-evidence.ts`, `server/teach/pipeline.ts`, `teach/review-suggestions.ts` (zone message), `app/teach/review.tsx` (one informational line).

## 2. Watch sets
`watchSet(procedure, verifierResult)`:
- For V3 lessons it watches **every activated required object**. An object is activated when its `firstRequiredAt` is `initial`, or when its activation step is the current step or already behind it.
- This covers the current and next movers, later objects whose wrong-order movement must be caught, verified persistent conditions and goal objects.
- Supporting objects are `optional`. Irrelevant objects never appear. Not-yet-activated required objects are `dormant`.
- V2 lessons keep "every object required".
- The `key` changes whenever membership changes, and the host bumps `watchRevision` on each change.

## 3. Supporting and irrelevant objects
- Irrelevant objects are excluded from automatic setup, the watch set, tracking and blockers.
- Supporting objects are matched if visible. They are reported in a separate `optionalDetections` list, are never fed to the verifier, and their absence never blocks startup. A supporting stationary reference that is visible and moves still invalidates calibration (camera safety).

## 4. Later objects
- Dormant objects don't block bootstrap or arming and aren't treated as missing; reporting one before activation is rejected.
- On activation the tracker searches with the object's **approved Teach appearance template** near its approved expected location, and accepts it after **three consistent matches**.
- Its step stays unverified until a clear start-zone observation followed by a transfer. Being visible at the expected place proves nothing.

## 5. Grounding without table texture
- Approved stationary references must pass the existing 0.9 score, absolute-error and competing-candidate gates without rescaling. One such reference establishes a shift; several must agree within 0.01, otherwise startup blocks ("camera may be rotated, tilted or zoomed, or a reference was moved").
- Table texture is only a fallback when no reference matched. If neither is available, the message names the stationary references to show.
- When the table is smooth, the stationary references are the camera-motion reference: any drift over 0.025 invalidates calibration, so camera movement is never object movement.
- Approved nested pairs (overlapping source boxes) may overlap live while their boxes stay distinct (IoU < 0.8). Otherwise they are reported ambiguous.
- No threshold was lowered and no provider was added.

## 6. Bounded identity recovery
States: `tracked → occluded → reacquiring → tracked | needs_user_view`, plus `dormant` and `acquiring`, kept separate from global calibration.
- **Attempts:** at most 3 full searches per loss episode, spread across 2 s (never on the frame that detected the loss) and at most one action per fresh frame.
- **What a search is:** the approved appearance template (pattern matching, not colour alone), within ±48 px of the last reliable position, with the competing-candidate and 0.9 gates. A candidate that overlaps another tracked identity is rejected.
- **Acceptance:** 3 consistent observations (one search hit plus fresh confirmations within 0.02), keeping the original object ID. Each lifecycle change goes into the append-only `session.identityAudit`.
- **Exhaustion:** after `needs_user_view` there is no automatic searching until the learner restarts tracking (a new generation re-runs setup). The existing notice line shows the reason.
- **Continuity** comes from the unchanged verifier: an object reacquired at its source needs a fresh observed transfer, and reappearing at the target after an unseen interval does not pass.

## 7. Stale replies
- Replies from an older worker generation are ignored (existing behaviour).
- Replies carrying an older `watchRevision` are ignored by the host, and `feedTrackingFrame` ignores frames with a different watch key (`stale: true`, no events).
- Duplicate, foreign and out-of-watch IDs are rejected.

## 8. Tests (mocked providers, synthetic pixels; not physical acceptance)

| Spec scenario | Test |
| --- | --- |
| 1 absent irrelevant | pipeline: watch set and setup exclude it |
| 2 absent supporting | tracking: startup OK, separate optional detection |
| 3 missing required reference | tracking: blocked with "show plate clearly…" |
| 4 hidden later phone | pipeline: arms without it; reporting it early is rejected; no dormant evidence events |
| 5 phone eligible after prerequisites | watch set plus tracking acquisition after 3 matches |
| 6 smooth table | tracking: bootstrap and tracking with no workspace patch |
| 7 lookalike duplicates | tracking: no unique match, never assigned |
| 8 camera movement | tracking: shift invalidates calibration, no object movement |
| 9 brief occlusion | tracking: ambiguous plus `occluded` event |
| 10 safe reacquisition | tracking: 3 consistent matches, including a ~0.5 s hand cover |
| 11 lookalike replacement | tracking: never accepted, `needs_user_view` |
| 12 unseen move to target | pipeline/verifier: not passed until a fresh observed transfer |
| 13 repeated occlusion | pipeline: one transition pass only |
| 14 stale replies | pipeline stale key, protocol revision |
| 15 existing tests | unchanged and passing |

Plus lifecycle, protocol, bounds and exhaustion unit tests.

## 9. Verification
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: 0 errors, the same 5 warnings.
- `npm test`: **626 passed in 72 files**.
- `npm run build`: exit 0.
- `npx playwright test`: **37 passed, 1 skipped** (that test was already skipped before).

## 10. Remaining physical risks and manual test (bottle lesson)
**Risks:**
- Identity uses appearance templates from Teach frames, so an identical-looking replacement placed at the same spot cannot be told apart. This is reported as a limitation, not claimed solved.
- Shift-only alignment: a moved or rotated camera blocks startup.
- Lighting changes can defeat template matching, which shows as uncertainty.
- Hand gaps longer than 600 ms in Teach leave no measured action.

**Manual test.** Use the approved bottle V3 lesson, the same Chrome and camera, and an ordinary smooth table without added stickers. Record each result separately from automated tests.
1. Place the blue lid, bottle and white plate as in the lesson, using a **smooth, plain** table surface. Open Practice from the library and start. **Expect:** automatic start without any table-texture calibration step.
2. Remove the plate (a required stationary reference) and restart. **Expect:** startup is blocked with a message naming the plate. Put it back.
3. Start, then briefly cover the bottle with your hand (~0.5 s) without moving it. **Expect:** "uncertain", no step passes, then the same bottle is reacquired after your hand leaves.
4. Cover the bottle, move it to the plate while covered, and uncover it. **Expect:** the transfer is **not** verified. Return it to the lid and do a visible carry. **Expect:** it is verified.
5. Swap in a different object (or a second identical bottle beside it) where the bottle was. **Expect:** never accepted as the bottle, and "show it clearly, then restart" appears.
6. Bump or slightly move the camera during a run. **Expect:** verification pauses and re-aligns, and no movement is counted.
7. (Later, phone lesson) Hidden phone: the initial steps run while the phone is inside its packaging, and the phone is acquired only when revealed after its activation step.

## Teach diagnostic added during Phase 3 (owner report)
The owner's new bottle recording had **no measured movement window** for the bottle, and the zone message listed only one user. The run's tracking was not retained, so the exact cause is **unconfirmed**. Changes:
- Teach now computes `movementDiagnosis` per object from its own trusted tracking: too few reliable frames, never moved 0.05, a gap over 600 ms during the move (with ms and frames), or never still for 400 ms before or after.
- The diagnosis goes to the compiler evidence (`whyNoMovementWindow`), the validator message, and one review line ("Movement evidence for …: none measured, because …").
- The zone-conflict message now also lists scene conditions that use the zone.
- On the retained phone clip the diagnosis reproduces the known cause (a 734 ms gap at frames 56–67).
- Next step: re-run the bottle lesson and read that line to establish the real cause before changing any rule.
