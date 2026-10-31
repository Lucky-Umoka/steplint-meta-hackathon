# Muse Code handoff: unresolved Teach steps after draft repair

Date: 2026-10-31. Scope: investigate and repair the current Teach evidence/compilation path; preserve unrelated behavior. This document records code inspection, not a successful live acceptance test.

## Read first and respect scope

Read AGENTS.md, PLANS.md, ARCHITECTURE.md, DECISIONS.md and TEACH_PRACTICE_INVESTIGATION_HANDOFF.md. CLAUDE.md is absent in this checkout. The older handoff remains useful, but its spending status predates the new round-5 ledger. Do not replace existing work: there are staged and unstaged changes against HEAD `04ab6db`, including overlapping modifications to the compiler and draft UI. Record the starting diff before editing; do not reset, commit or stage the owner's work indiscriminately.

**Do not remove, bypass, redesign or otherwise change Teach access-token authentication, session cookies, origin checks, approval signatures, secrets, media limits, upload cleanup, navigation, library/storage, deployment or unrelated UI.** The previous handoff explicitly prohibited disabling authentication to fix perception. No access-token removal was requested. Do not bundle housekeeping, broad formatting or dependency upgrades into this repair. Ask for separately scoped authorization if a necessary change falls outside this boundary.

Inspect and state the concrete file plan before implementing. Start with `src/guide/{compile,draft}.ts`, `src/app/teach/draft-repair.tsx` and their tests. Evidence-contract work may require a separately explained, coherent change to `src/guide/{schema,evaluator}.ts`, the provider drafting/grounding modules and associated tests; identify those exact files after inspection. Updating both Teach and Practice semantics together is essential if introducing a new executable condition. Do not introduce a new condition only in the compiler.

## Access token: verified findings

- `src/app/teach/teach.tsx` still renders Creator access while `unlocked` is false. Its initial GET `/api/teach/access` restores an existing valid session and hides that prompt.
- `src/server/teach/security.ts::authorize` still requires same-origin plus a valid bearer token or sealed `steplint-teach` cookie. Compared with HEAD, the only changes in that file add `stage` and `cause` to TeachStageError; authentication was not removed.
- `src/server/teach/http.ts::access` still checks the code and issues an HttpOnly, SameSite=Strict cookie with an eight-hour lifetime. The guide analysis and approval handlers still call authorize.
- Therefore a previously unlocked browser is a plausible explanation for the absent prompt. This inspection does not establish which cookie or deployed revision the owner's browser used. Check a fresh browser context without invoking analysis: it should show Creator access; unauthenticated API requests must fail. Keep authentication unchanged.

## What the new failure actually says

The repair now preserves a reviewable AnalysisDraft with per-step diagnostics instead of losing all progress. That is a useful improvement, but it is not an accuracy fix or an executable guide. The reported build reached compilation and rejected its evidence; this message alone is not an API/network failure.

| Owner's latest result | Code-level interpretation | Required investigation |
| --- | --- | --- |
| Step 1 open box: low-score endpoints, 32 unreliable frames, tray/phone missing at result | `changeMetric` cannot measure without reliable object/anchor endpoints; compiler requires every involved frame at score >=0.90 and all required objects observed at endFrame | Inspect before/change/after images, the actual condition/object/anchor and identity tracks. Separate missing evidence from genuine lack of change. |
| Step 2 sleeve aside: measured 0.03 versus minimum 0.15 | A finite metric was computed, but it is below the hardcoded minimum; this is different from a null metric | Check whether source interval captures the actual move, whether the box is the correct object/extent, and whether the proposed condition represents the action. Do not lower the threshold to make this clip pass. |
| Steps 3–4 cover: weak endpoints/continuity; step 3 missing holder/tool at result | An object being outlined somewhere in the clip does not establish its state throughout an action | Review transparency, background capture, occlusion and the selected result frame. Missing reliable detection is not proof the object is absent. |
| Step 5 screwdriver: low scores, gaps, overlap with step 4 | Compiler rejects adjacent intervals when current startMs < previous endMs | Determine if the model chose bad boundaries or the demonstrator actually overlapped actions; do not fake chronology by sorting or shifting numbers. |
| Step 6 phone: low endpoint/gap evidence | A reliable phone mark at 13.8s cannot prove the 12.5–13.5s removal interval | Inspect the actual action witnesses, not merely the representative outline frame. |

These are owner-reported values, not a replay performed in this investigation. No raw artifact has been conclusively matched to this specific manual run. Object identity errors, transparent-mask capture and exact frame misselection remain hypotheses until inspected against its images and tracks.

## Confirmed design problems still present

1. **Misleading error classification.** `compile.ts` emits `no_measurable_change` for null measurements, too-small measurements and too-large measurements. Null means insufficient usable evidence, not that the person did nothing. Its endpoint diagnostic checks only the primary object although separation also needs an anchor, so an unreliable anchor can produce an unexplained null. Diagnose all dependencies and keep missing/low-score/identity ambiguity distinct from observed insufficient displacement.
2. **Action semantics are too narrow.** `ConditionSchema` supports only movement and separation. `changeMetric` measures bounding-box centre displacement or change in distance from an anchor. Opening a box/cover can change visibility and configuration without a large centre displacement. Conversely, moving a closed box can satisfy displacement without opening it. The words in a generated instruction do not change the executable metric. The current schema cannot honestly support arbitrary opening actions through these two measurements alone.
3. **All-frame continuity is brittle.** Every frame between start and result must contain reliable tracking for the object and anchor. Hands naturally occlude those objects during manipulation. This is a conservative current policy, not a complete model of action evidence. Do not replace it with endpoint-only acceptance: an object can disappear and be swapped or moved by a different action. A changed policy requires an explicit identity/witness contract, uncertainty states and negative tests shared with Practice.
4. **Whole-clip geometry is confused with action evidence in the presentation.** “Outlined at 12.9s” describes one representative frame. It cannot resolve a missing result at 6.7s. Show action-local before/change/result evidence and explain which observation is unresolved.
5. **Partial draft is not yet a repair workflow.** `DraftRepair` currently lists failures and offers Run analysis again, wired directly to `analyse()`, or discard. There is no focused correction interface in this component despite wording suggesting the creator can fix the view. A full paid rerun with unchanged inputs is not a reliable correction mechanism.
6. **Sequential semantics versus overlapping demonstration.** The added adjacent-interval check exposes overlap but does not interpret it. Preserve necessary actions; neither silently drop one nor force invented sequential evidence. Actual concurrency requires a separately designed prerequisite/condition contract or a truthful request to demonstrate those actions separately within the supported sequential workflow.

Bigger boxes and zoom are not universal repairs. Enlarging the actual measured box increases the normalization diagonal and can make an identical displacement score smaller. Display padding is separate from segmentation geometry. Crops can help small-object inspection but require native/full-frame coordinate transforms and context for identity; digital enlargement cannot recover detail absent from the recording. Never tune marks to cross a pass threshold.

## Implementation order before another live trial

### A. Reproduce offline and fix attribution first

- Locate the exact manual run's sanitized diagnostic/run ID and persisted evidence if available. Do not assume round-5 trial 1 is the same run; its recorded intervals and scores differ. If unavailable, say so and build synthetic fixtures mirroring these six failure types without calling them captured provider data.
- For every step record object/anchor IDs, selected condition, before/change/after frame times, sample availability and scores per dependency, normalized geometry, computed metric and required result witnesses. Retain provider score provenance; 0.90 is a gate, not measured 90% correctness.
- Emit distinct typed reasons for unavailable metric, measured insufficient change, implausible change, missing result evidence and incompatible temporal order. Include anchor attribution. Render friendly object labels, not component IDs. Move detailed frame counts/thresholds behind Technical details.
- Show one actionable summary while preserving all unresolved steps. Prefer “We couldn't clearly see the box opening. Review these moments.” Do not blame the recording before inspecting the evidence. Keep approval disabled while any necessary step/goal is unresolved.

### B. Correct action-local grounding and chronology

- Compare the transcript turns and visual changes against each candidate interval. Speech helps find an action; it does not prove it occurred. Choose stable before/result windows around the action while retaining the demonstrated change witness. Never select convenient high-score frames unrelated to the action just to obtain a pass.
- Ground primary objects and required anchors in the relevant windows. Preserve identity across views; separate transparent covers, containers, contents, hands and background. Do not silently swap an object for its container or a hand.
- Keep uncertain boundaries editable through a small before/change/result visual review. Corrections are proposals until revalidated. Preserve the full necessary demonstrated sequence. Unsupported necessary actions should remain explicit blockers with a specific capture/correction request.
- For overlap, identify the actual completion dependency. If the source supports revised non-overlapping boundaries, show those frames for review. If actions really overlap beyond supported semantics, state that clearly rather than fabricating order.

### C. Implement supported evidence semantics, not weaker thresholds

- First specify which actions this repair will support and how each is observable in BOTH Teach and Practice. For example, opening needs evidence of a changed relationship/configuration of the cover/container and newly exposed contents, plus a reliable before state; contents already present at session start cannot count as an opening action. Do not claim a general-purpose opening detector until implemented and tested.
- Define typed evidence with identity, alignment, before predicates, transition witnesses, after predicates, uncertainty and recovery. Keep existing guides version-compatible; do not reinterpret old approved movement rules as new opening rules.
- If supporting short occlusions, require validated correspondence and action-specific witnesses around the gap. Identity swap, ambiguous reappearance, unseen required transition and tracking loss must stay unverified. No interpolation may masquerade as observed evidence. If that cannot be proven for a step, keep it unresolved.
- Validate condition semantics offline with true and false examples before wiring generated proposals into executable guides. Spark may propose interpretations, but deterministic validated rules remain authoritative.

### D. Make repair targeted and paid work explicit

- Show the relevant before/change/result images with labelled objects and optional correction controls. Clearly distinguish proposed outlines from validated action evidence. Keep the original media until explicit discard under the existing local lifecycle.
- Before a new analysis, identify what input changed and which operation will run. Do not automatically retry or re-upload unchanged media. Targeted reprocessing needs an explicit bounded request/lifecycle design; do not bypass expiration or cleanup to achieve it.
- Preserve token access, existing review/approval and Practice entry. If a new evidence contract changes Practice evaluation, add focused integration tests and document the exact migration; do not redesign the rest of Practice under this repair.

## Verification gates and live spending

Current inspection ran:

`npm test -- tests/guide-draft.test.ts tests/guide-compile.test.ts tests/guide-diagnostics.test.ts tests/guide-http.test.ts tests/teach.test.ts`

Result: **105 tests passed across five files.** These are offline tests; they do not prove visual accuracy. This documentation task did not run the full suite, browser acceptance, production build or any live Meta request.

Add regression tests for unreliable primary versus anchor endpoints; finite 0.03 movement versus missing metric; large implausible movement; mark available only after the action; missing result evidence; valid/invalid temporal overlap; stationary closed box versus true opening; closed box moved sideways; already-exposed contents; occlusion/reappearance/identity swaps; wrong direction; duplicate events; uncertainty/retry; draft approval rejection. Test different supported task fixtures, not phone-specific labels or timestamps. Include coordinate/crop transforms and varied object sizes where grounding changes.

Run full unit tests, typecheck, lint and isolated build. Test auth with fresh and existing browser sessions; wrong token must fail and valid cookie must restore access. Confirm unauthenticated analysis/approval reject before provider calls. Review diff for unrelated changes/secrets. Then verify the visual repair flow with Playwright and deterministic provider mocks, explicitly labelled as mocks.

The older four repair batches exhausted 20 trials. New DECISIONS.md and `.media-lab/repair-round5/ledger.json` record a subsequent five-trial grant with one failed trial and four remaining in that ledger. That trial took 188.6 seconds and recorded 28 provider/upload operations; it was a direct pipeline run, not browser or physical-camera acceptance. Do not conflate one trial with one model request. Reconcile any additional owner/manual runs before spending; this handoff does not issue a fresh allowance. Follow the required notice with model names, purpose, bounded request counts and expected cost before further live work. No automatic retries. Keep request-level counts and actual billing unknown unless retrieved.

After offline fixes, spend at most one authorized trial, inspect the full result, then repair before the next. Do not consume all remaining trials to sample stochastic outputs. Acceptance requires usable full-sequence Teach evidence, explicit creator review, optional rehearsal, saved approved revision, learner setup, correct/wrong/uncertain execution, recovery and goal completion. A replay can validate pipeline integration but cannot substitute for physical-camera tests with a different viewpoint/background. Record measured timing without promising unsupported accuracy or latency.

## Required delivery from Muse Code

Report exact files changed; which failure classes were fixed; remaining unsupported action/evidence cases; offline and real-call results separately; live ledger balance; and whether physical-camera acceptance actually passed. Explicitly confirm access-token protection and unrelated features were preserved. If evidence still cannot support opening or a necessary step, report that limitation instead of claiming the full workflow works.
