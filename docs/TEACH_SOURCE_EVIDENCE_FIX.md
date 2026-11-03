# Teach source-frame failure and two-request live record

Date: 2026-11-02. Starting commit `088bf65`, branch `fix/phyical-practice-test`; prior uncommitted work and the owner's instruction-file edits were preserved.

**Status (updated after trial 5): live trial 5, on the same clip and cached SAM context, produced a complete draft that passed every source, movement, schema and procedure-consistency check through the app's real compile function, in one request. Physical acceptance and a fresh upload/SAM run remain outstanding.**

Earlier status (after trials 3–4): the reported `Unsupported source evidence … frame 1` failure did not recur in either completed live draft, and a second contract gap (unmeasured movement windows) was found and repaired. Live acceptance has still NOT passed: trial 4 was rejected by procedure-consistency rules described in the addendum. All four authorized requests are consumed.**

## Confirmed mechanisms

The reported error means the selected source frame lacked a trusted measurement: missing tracking, mismatched timestamp, or score below the existing 0.90 policy. It does not establish that the object was visually absent. The compiler previously exposed video frame times and only a few geometry samples without a complete eligible-frame contract. A model could select a visible frame that deterministic validation correctly rejected.

A retained real SAM result for the owner's phone clip reproduces this pattern: `component-1`, frame 1 has score `0.8769136667`; its 47 eligible observations begin at frame 11 and end at frame 73. Other tracked objects have different availability. The exact newly failed owner draft was not available, so these values demonstrate the real failure pattern, not a claim that this retained result was the latest request.

The live trials then exposed a second problem: the request's 12,000 completion tokens include Muse Spark Open's always-on reasoning, rather than being reserved for JSON output. Trial 2 consumed 10,673 reasoning tokens, leaving only 1,327 answer tokens and a truncated 5,132-character answer. No partial JSON was parsed or treated as a successful draft.

## Repairs

- `src/teach/source-evidence.ts`: one trusted-source policy and complete per-object frame catalog, represented compactly as inclusive intervals.
- `src/server/teach/pipeline.ts`: send the catalog and zero-based source-frame semantics; remove low-confidence/mismatched samples from representative generation evidence. Context-specific wire schemas enumerate eligible identity reference frames and eligible action start/change/result frames for each mover. An object with fewer than three trusted observations cannot generate a measured transfer. Optional/unmeasurable objects do not acquire fabricated references.
- `src/teach/v3-evidence.ts`: use the same trusted-source predicate and explain whether evidence is missing, mistimed or below policy. No threshold reduction, interpolation, automatic nearest-frame replacement or approval bypass.
- Compiler instructions: preserve complete requested work and unsupported requirements, but remove redundant instructions and require concise text. This did not by itself prevent truncation, as trial 2 records.
- `src/server/meta/spark.ts`: expose safe truncation counts (completion/reasoning tokens and answer character count), never reasoning text, keys or raw responses.
- `src/server/meta/spark-limits.ts`: bounded Baseten total completion cap of 24,576, accounting for measured reasoning plus full V3 JSON. Meta retains 12,000; legacy drafting retains 6,144. This is not an independent reasoning cap. Exceeding the applicable cap is rejected before dispatch. The adjusted Baseten cap is offline-tested but not live-tested.
- `tests/teach-source-evidence.test.ts` and `tests/spark-provider.test.ts`: source-gap, weak-score, timestamp, no-substitution, empty-availability, provider-budget and truncation-diagnostic regressions.

Unchanged: Practice, voice, camera, UI layout, runtime verifier, SAM, discovery, transcription, approval/storage migration, thresholds, retry/fallback policy and host/request deadlines. Existing V3 procedures remain draft-only pending the separately authorized later migration.

## Live allowance: exactly two Baseten requests

The owner approved two live tests. Each was announced before invocation and consisted of one request to `meta-models/muse-spark-open-1026` through the actual adapter and canonical draft parser/schema. Both used `.media-lab/steplint.mp4` (15.017 seconds, 223 source frames) and retained real SAM context from `.media-lab/teach-live-result.json`. Video byte count and complete source timeline were checked before calling. Credentials were confirmed configured without printing values.

No new Meta discovery/SAM/Voice requests were made. These were live Baseten drafting checks with cached real perception, **not fresh complete upload/transcription/SAM runs or physical-camera tests**.

| Trial | Request / change | Actual outcome |
| --- | --- | --- |
| 1 | Complete eligible-source contract and source-constrained wire schema; 12,000-token cap | Failed after 53,875 ms: `truncated_output`; no complete JSON or accepted draft |
| 2 | Same real clip/context, concise instructions; same 12,000-token cap | Failed after 52,669 ms: `truncated_output`; 12,000 completion tokens, 10,673 reasoning tokens, 5,132 answer characters; no accepted draft |

The 24,576-token repair was made **after** these observations. Neither result proves that the full source checks would pass on a completed model output, because both failed before complete JSON/schema/source validation. They must not be reported as successful source-frame fixes or successful Teach flows.

Private, ignored evidence: `.media-lab/source-evidence-live/ledger.json`, `trial-1-result.json`, `trial-2-result.json`, and the gated `check.ts`. The ledger records two consumed requests and blocks further calls. No raw provider response, partial answer or private reasoning was logged. Do not reset this ledger to spend again; a new allowance must be separately authorized and recorded.

## Verification

| Check | Actual result |
| --- | --- |
| Focused regression after the budget repair | 148 passed in six files |
| `npm run lint` | Exit 0; 0 errors, same 5 existing warnings |
| `npm run typecheck` | Exit 0 |
| `npm test` (final run, without concurrent heavy checks) | 571 passed in 67 files; 27.45 seconds |
| `npm run build` | Exit 0; compilation, TypeScript, page generation and route output passed |
| `git diff --check` | Passed |
| Live complete draft/source validation at adjusted budget | Not run; needs new authorization |

An earlier full run timed out in the unchanged `tests/duration-limits.test.ts` streamed-body test at its existing five-second limit. Its isolated rerun passed all six tests, and the final default full-suite rerun passed unchanged. No assertion, timeout, file, worker setting or check was weakened to hide the failure. Concurrent-load sensitivity is a plausible explanation, not a proven application defect.

All automated provider responses were mocked; no automated test used the live allowance. The earlier canonical browser video test is recorded in `TEACH_VIDEO_REVIEW.md`; it was not rerun for this source-catalog/budget follow-up. Physical acceptance remains outstanding. Next-generated tracked route-reference changes were restored; no generated configuration or unrelated changes are included.

## Remaining acceptance and next step

One separately approved Baseten confirmation request can test the adjusted total budget and completed draft/source validation on the same failure-inducing real clip/context. It must be a new recorded allowance; no automatic retry or fallback. A fresh canonical upload/SAM end-to-end test is separate and would incur additional model calls, so it is not covered by that single-call proposal.

If a completed response still cites invalid multi-object/scene evidence, those checks must continue to fail rather than silently substitute frames. Unsupported physical claims still cannot become verified merely because the model sees them in video. This code does not guarantee every action is recognized, or that arbitrary 60-second V3 inference finishes within Vercel Hobby's analysis deadline. A larger total token ceiling can increase inference time and cost; existing timeouts remain in force.

[Baseten reasoning documentation](https://docs.baseten.co/inference/model-apis/reasoning) states that Muse Spark Open always reasons and provides no depth control. [Baseten Chat Completions API schema](https://docs.baseten.co/reference/inference-api/llm-openapi-spec.json) defines the total `max_tokens` request field. Public endpoint documentation does not establish live acceptance of the adjusted budget on the hackathon-specific slug; that remains unverified.

## Addendum: owner-authorized trials 3–4 (same day)

The owner authorized two further Baseten requests to `meta-models/muse-spark-open-1026` with the same clip (`sha256 455dd049…`, 223 frames) and the same retained real SAM context. The ledger cap was raised from 2 to 4 with that authorization recorded in `check.ts`; it now blocks a fifth call. Each request was announced, single-shot and had no retry. No SAM, Voice or discovery calls were made.

| Trial | Code state | Actual outcome |
| --- | --- | --- |
| 3 | 24,576-token budget; source catalog | Completed in 48,040 ms, with no truncation. Wire schema and all source-frame checks passed. Rejected: `Unsupported transfer: source evidence does not show measurable displacement.` |
| 4 | + measured movement-window contract (below) | Completed in 77,466 ms, with no truncation. Offline re-check of the saved output: every reference, action window and scene frame passes the source-frame **and** displacement checks. Rejected by procedure schema: initial conditions name objects whose `firstRequiredAt` is a later step (×2); a covered requirement has no final predicate; a required object has no action or scene role. |

**Trial 3 root cause (confirmed with the real tracking):** the compiler told the model which frames were *trusted*, but not where the tracked box *moved*. The model chose component-1 frames 18→28, where the tracked centre shifted only ~0.003 against the existing 0.05 rule. The measured movement occurs at 55→67 (0.12). Component-4's SAM box spans nearly the whole frame, so this cached perception cannot measure a clear phone lift. Its only measured window (105→191, 0.052) is marginal. Component-2 shows frame-to-frame jumps above 0.2, which looks like mask flicker rather than motion; the policy still counts these as measured, a perception-quality limitation that is recorded here, not hidden.

**Repair (no threshold change):** `src/teach/source-evidence.ts` derives deterministic non-overlapping movement windows from trusted samples only. Each window has a trusted start, a trusted result at least 0.05 away and a trusted change frame strictly between. They are sent as `measuredMovementWindows`. Only objects with at least one window may be step movers in the wire schema; previously any object with three trusted frames qualified. The validator still measures whatever window the draft chooses, and its error now names the object's measured windows. Regressions: a motionless trusted window through `parseSparkDraft` (mirrors trial 3), a whole-scene mask that cannot be a mover, and low-score samples that cannot create windows.

**Not fixed / next step:** trial 4's consistency rejections are correct deterministic refusals of a self-contradictory draft. They must not be relaxed. A candidate next repair is to state those cross-field rules explicitly in the compiler contract, or to derive the dependent fields deterministically. This is a hypothesis that needs a newly authorized live request to test. A fresh upload/SAM run with a phone mask that is not whole-scene is also needed before any claim about the phone-lift step. Physical acceptance remains outstanding.

Offline verification after this repair: `npm run typecheck` exit 0; `npm run lint` 0 errors, the same 5 warnings; `npm test` 575 passed in 67 files.

## Addendum 2: procedure-consistency failure and trial 5

**Owner failure after trials 3–4 (fresh Teach run, step 4):** seven validator issues: supporting/irrelevant objects gating activation (×3), semantic conditions referencing non-required objects (×2), a final predicate without a covered relationship, and coverage naming non-existent steps. Trial 4 failed the same way (×4).

**Confirmed mechanism:** the V3 validator makes `role: required` an if-and-only-if of "some step or scene predicate measures this object". `firstRequiredAt` is definitional: `initial` if an initial predicate measures the object, otherwise the first step requiring it, and `never` for non-required objects. The wire contract still asked the model to restate both fields consistently with its own steps and predicates. Of the 11 observed violations, 9 were such restatement contradictions. The JSON schema cannot express these cross-field rules, so each run broke a different subset.

**Repair:**
- `src/teach/v3-relevance.ts` derives role-required and activation from the model's explicit steps and predicates, applied in `parseSparkDraft` before unchanged validation. Supporting versus irrelevant for unreferenced objects stays the model's choice. An unreferenced object the model called required becomes non-gating `supporting`. Every override is written into that object's `roleReason` for the reviewer. Steps, windows, predicates, requirements and goals are never created, removed or reinterpreted.
- Compiler instructions now list the remaining linkage rules explicitly.
- `draftWithOneCorrection` (`src/server/teach/pipeline.ts`, used by `compileLesson`): if a completed draft is rejected with a 422 validation error, the model's own JSON and the exact validator issues are sent back once, without video. It is bounded by the 28,000-character input limit and is never sent a second time. Transport, truncation and provider errors are not corrected. Code never edits intent; the validator remains authoritative.
- A wire-level copy of the coverage rule was tried and removed: it hid the validator's complete issue list from a correction request.

**Offline evidence on real outputs:** with derivation, the real trial-4 draft has one remaining issue (a covered requirement without a final predicate). Adding that one intent link by hand makes it pass full validation. Trial 3 still correctly fails its motionless window. Tests: `tests/teach-v3-consistency.test.ts` covers the owner-failure reproduction through `parseSparkDraft`, an unchanged validator without derivation, no intent repair, a valid first draft (1 request), correction with exact issues and no video (2 requests), never a third request, and no correction of truncation or source failures.

**Trial 5 (owner asked to fix and verify; ledger reserved at most 2 requests, 1 used):** same clip (`455dd049…`), same retained real SAM context, Baseten `meta-models/muse-spark-open-1026`, 24,576 budget, through `draftWithOneCorrection`. **Passed on the first request in 82,764 ms (19,805 output tokens), with no correction.** Draft: inner box exposed (component-2, 26→28), outer sleeve moved left (component-1, 55→67), phone lifted (component-4, 105→191). The screwdriver requirement is kept as unsupported, approval is null, and none of the derivations overrode the model in this run.

**Limitations recorded, not hidden:**
- Component-2's 26→28 movement is a one-frame SAM box spike: frame 28's box nearly doubles in height and frame 29 returns. It satisfies the existing 0.05 policy, but the reviewer must check it.
- The phone's cached mask is near whole-scene, so 105→191 (0.052) is marginal.
- This is one live success on cached perception, not a reliability rate. The correction path is mocked-tested only.
- No fresh upload/SAM run, physical-camera acceptance or deployed-build check was performed; a deployed app needs these uncommitted changes deployed first.

Verification: `tsc` exit 0; lint 0 errors (the same 5 warnings); `npm test` 584 passed in 68 files; `npm run build` exit 0.

## Addendum 3: review-stage failures, trials 6–7 (owner authorized 2 tests, up to 4 requests)

**Owner failure:** "Weak evidence (102 tracked frames, 1 without geometry)", "no usable, ordered source evidence within its own window", "starting/target zones are missing".

**Confirmed mechanism:** compile-time V3 checks looked only at the start, change and result frames, while review suggestions and approval (`validateReviewEvidence`) require **every** frame from start to result to be tracked and at least 0.90. A draft could therefore compile and then never be approvable. Reproduced on real tracking: trial-5 step 55→67 has 6 untracked and 4 low-score frames.

**Repair (stricter compile, no weakened rule):**
- Measured movement windows lie inside continuous trusted runs.
- `validateV3Evidence` rejects windows with gaps, naming the first gap and the available windows.
- The compiler instructions state the continuity rule.
- Tests check that every compiled draft gets supported suggestions that pass `validateReviewEvidence`.

**Trial 6** (1 request, 70,692 ms, no correction): the draft passed. All three steps had `supported` evidence with start and target zones, so the owner's reported errors did not occur. Two blockers remained:
- (a) Unsupported screwdriver/fix requirements. This is correct; it needs explicit scope revision.
- (b) "Visual evidence does not show the component entering the target zone." Mechanism: the model reused zone `center_table` for **two different objects** at different places. Suggestions reused the first object's small region, and approval needs one region per zone ID.

**Repair:** suggestions widen **only** a zone whose region misses some observation using it (other zones keep their exact regions). If the widened region overlaps the step's other zone, the step is flagged with which steps and objects share the zone. That review-evidence issue drives the one correction request. Compiler instructions state that one zone ID is one drawn region.

**Trial 7** (2 requests, 85,675 ms): the correction ran live for the first time, but **both** drafts reused zone `zone_01_center_table_outer` at different places. **This trial failed.** The rejected outputs were not saved by the harness, so whether the conflict came from a different object or from the same object's forced start/target chain is **unconfirmed**.

**Design correction after trial 7:** rejecting at compile for review-evidence problems removed the human repair path. Now:
- Base validation (source, movement, consistency) still rejects.
- Review-evidence problems only drive the correction. If the correction does not fix them, the best valid draft reaches the review screen with the specific steps flagged.
- Editing a flagged zone clears only that zone flag (window flags stay), and approval's evidence check still decides.
- Under this design, trial 7 would have reached review flagged instead of failing at step 4. That claim is inferred from tests, not re-run live.

**Allowance:** the ledger records 8 requests (trials 1–7), and the harness refuses trial 8. Next step: a new allowance, with the harness saving rejected outputs, to diagnose the zone conflict live.

## Addendum 4: "Final goal conditions must remain maintained" (owner Teach run, failed on draft and correction)

**Confirmed mechanism (from the code; the owner's exact draft was not retained):**
- The compiler, not the model, sets each step's `measurement.persistence` (`local-execution.ts`): `release_on_later_step` when a later step moves the same object, otherwise `maintain`.
- The procedure validator requires every `goalStepIds` step to be `maintain`, so only an object's last action can be a goal step.
- The model was never told this rule; it was even told "never infer the intended goal merely from last steps", so it listed intermediate same-object actions (for example a lift and a place) as goal steps.
- The correction request received only "must remain maintained", which refers to a field the model cannot see and names no step. The identical second failure is consistent with this.

**Repair (rule unchanged):**
- The validator message now names the goal step, its object and the later step that moves it, and says what to change.
- The compiler instructions state that only an object's last action may be a goal step; earlier actions stay in their requirement's stepIds.
- No goal is rewritten in code: goalStepIds remain explicit model intent and human-reviewed.

**Tests** (`tests/teach-v3-consistency.test.ts`, mocked provider):
- reproduction through `parseSparkDraft` with the exact new message, plus a valid last-step goal;
- a correction carries the actionable reason, and the fixed draft is accepted;
- the instruction is present.

**Verification:** `tsc` exit 0; lint 0 errors (same 5 warnings); `npm test` 600 passed in 69 files; build exit 0; `npx playwright test` 37 passed, 1 skipped (already skipped before).

**Not verified live:** no paid request was made for this fix. A real Teach run, or a separately authorized live check, is needed to confirm the model follows the stated rule.

## Addendum 5: wrong "after moment" / final-goal image (owner report), and live trials 8–9

**Owner report:** Teach passed, but the step's after-moment and final-goal image did not show the real result.

**Confirmed mechanism (real tracking and frames):** the movement windows introduced earlier ended at the **first** frame where the centre had moved 0.05, so they captured the start of motion rather than its end. The continuity rule then forced windows to stop before any tracking gap.
- Bottle clip `steplint_video2.mp4`: the window was 122→124, and f124 shows the bottle **in mid-air**.
- The suggested target zone was centred on that mid-air position, so this affected verification, not only the picture.

**Owner decisions (2026-11-02):**
1. Allow tracking gaps of at most 600 ms inside an action, the existing Practice `maxObservationGapMs`.
2. The after moment is the **first moment at rest**.
3. Run the live tests on the bottle clip.

**Repair:**
- `source-evidence.ts`:
  - shared constants, equal to the existing Practice defaults: 0.01 drift, 400 ms rest, 600 ms gap (`local-execution.ts` now reads them);
  - an action's start must be still for 400 ms *before* it, and its result still for 400 ms *after* it, with every observation in that span checked;
  - catalog windows run from the settled start to the first settled landing, inside a segment whose gaps are ≤600 ms.
- `validateV3Evidence`, V3 `validateReviewEvidence` and V3 `suggestReviews` all use the same `actionWindowIssue`. V2 review rules are unchanged.
- Compiler instructions describe the rest-to-rest windows.
- On the bottle, the catalog gives one window, **114→127**: f114 shows the bottle on the lid, f127 on the plate.

**Tests:**
- The shared fixture `tests/fixtures/teach-v3.ts` previously moved the object every frame and never stopped. It now has realistic still periods, with frame landmarks named in `v3Frames`. Tests use these instead of hard-coded frames; no assertion about rules was relaxed.
- New regressions: a 500 ms gap is accepted through parse, review and approval; a 700 ms gap is rejected at compile and approval; a mid-motion result is rejected ("would show it mid-motion"); windows are built from settled start to first landing across a short gap and not across a long one.
- `npm test`: 602 passed in 69 files. `tsc` exit 0. Lint 0 errors (same 5 warnings). Build exit 0. `npx playwright test`: 37 passed, 1 skipped (already skipped before).

**Live trials 8–9** (owner-approved: 2 tests on the bottle clip, ≤2 requests each). Each used Baseten `meta-models/muse-spark-open-1026` through `draftWithOneCorrection`, with retained real SAM context and no SAM/Voice/discovery calls; every raw output was saved.

| Trial | Requests | Result |
| --- | --- | --- |
| 8 | 1 (31,296 ms) | Passed. One step, window 114→119→127. Review evidence supported with zones, no blockers, approval evidence check passed. Final scene f140. |
| 9 | 1 (54,259 ms) | Passed. One step, window 114→122→127. Same review/approval result. Final scene f180. |

Frames were viewed: f114 shows the bottle on the lid, f119/f122 mid-carry, f127 on the plate, and f140/f180 on the plate with hands away. The ledger records 10 requests over trials 1–9, and the harness refuses trial 10.

**Not verified:** a fresh upload with new SAM tracking, the owner's own new recording, and physical-camera Practice. Limitation: with poor tracking (for example the phone clip's whole-scene mask or a hand gap over 600 ms), actions now correctly have no window and must be marked unsupported.
