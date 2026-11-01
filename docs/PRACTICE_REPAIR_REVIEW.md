# Practice repair and Muse review — 2026-10-31

This record covers the owner's automatic-Practice/latency report and subsequent review of Muse's changes. It supersedes capability claims in earlier checkpoint notes where they conflict. It is not physical-camera acceptance or a claim of hardware hazard prevention.

## Findings and repair

- Existing video3 movement-only guides could accept movement to the wrong destination. New visible-relationship guides check the actual destination surface with a `separate → supported_by` rule. Continuous transfers remain one action; splitting lift/place at an invented mid-air pause blocked video2. Existing signed guides are not silently modified; the UI explains their movement-only limitation and offers rebuilding in Teach.
- Automatic capture previously discarded action evidence during a pending request. A bounded queue now captures subsequent actions while local appearance feedback continues. Duplicate/stale windows cannot advance twice. Backpressure pauses when verification falls behind rather than silently losing history.
- Wrong visible relationships were classified as perpetual uncertainty because the repeated-result check only admitted expected states. Repeated clear wrong states can now issue a deterministic violation. Recovery and completion require fresh, ordered evidence; every designated goal relationship needs repeated current evidence and correspondence.
- Offset Spark boxes produced unreliable bottle masks. Bounded native crops plus named SAM concepts grounded both video3 parts above the existing evidence threshold. The threshold remains 0.90; scores are not calibrated accuracy. Missing/competing identities remain unavailable.
- Local appearance overlays are advisory. On retained video3 frames, dense mask-seeded appearance matching followed the bottle in 34/34 sampled frames and the plate in 28/34, abstaining on obscured plate frames; mean processing was approximately 54 ms per sampled frame on this machine. This is one recorded replay, not a population accuracy or live-device latency estimate. Local box geometry cannot prove physical support/contact, closure or hidden correctness.
- Review of Muse's hands-free additions found an incorrect extra nesting in MediaPipe landmark access, an unreachable screen area for gesture clicks, open-palm pause outside its declared zone, an ineffective voice pause flag, permanent suppression of repeated utterances, stale destructive confirmations, recognition restart loops after service/permission errors, and a transcript that labelled all verdicts (including violations) as “Verified.” These were repaired and covered by deterministic/browser checks.
- Mutable evaluator/timing refs were read during React render. The standard Practice display now consumes state snapshots updated after events and on clock ticks. Event timing uses an explicit browser clock. Camera callback exceptions now stop visibly. The voice transcript scrolls inside its own list, keeping the live camera and correction in place; verdict entries no longer falsely label violations as verified. No evaluator, approval or lint rule was disabled.

## Paid tests under the new clip allowances

The owner granted seven tests each for video2 and video3. Private inputs, signed test artifacts, provider results and the immutable attempt ledger remain under ignored `.media-lab/practice-repair/`. No automatic paid retry occurred. Temporary Teach uploads were deleted; Practice uses bounded still requests and no retained video upload. Actual billing was not queried.

| Clip / test | Actual outcome |
| --- | --- |
| video3 / 1 | Source blocked: unnecessary context landmark was incorrectly required to have an executable outline. |
| video3 / 2 | Destination-aware source eligible; prohibition preserved in guidance; no real owner approval inferred. |
| video3 / 3 | Test-only signed approval and recorded Practice passed. Initial grounding 5.284 s, relationship check 8.607 s; bottle local grounding unavailable. |
| video3 / 4 | Grounding attribution: proposed box score 0.672; independently inspected box 0.969 on the same visible bottle. Diagnostic comparison, not end-to-end acceptance. |
| video3 / 5 | Recorded Practice passed with three-image check at 3.782 s; initial bottle track still unavailable. |
| video3 / 6 | Named-crop grounding found bottle and plate above threshold, 4.272 s setup; recorded relationship check passed in 4.052 s. |
| video2 / 1 | Source blocked: planner split a continuous transfer and chose an already-landed second-step start. |
| video2 / 2 | Continuous-transfer source eligible with actual destination-support rule. |
| video2 / 3 | Test-only signed approval and recorded Practice passed; 7.387 s initial grounding, 4.159 s relationship check. Plate local grounding unavailable, so continuous two-part local tracking is not accepted on this clip. |

Used: **video3 6/7; video2 3/7**. Remaining allowances are not permission for unbounded retries. The earlier original-recording allowance/ledger remains separate.

These Practice runs called the actual approval/session/perception handlers with explicit test actors and recorded before/result images, including a held result. They did not simulate a human approving the real guide and did not test a physical camera. Browser regression runs use mocked providers and generated camera frames.

## Validation and remaining limits

The final unit checkpoint passed **392 tests across 45 files**, with no live model calls. Lint, strict TypeScript, and formatting checks passed. A scan of 203 authored source/test/script/documentation files found zero configured secret values. The retained real observations of the original four-step phone procedure also still reach completion under the current evaluator in an offline replay.

Production/browser checks are being rerun after the final readiness-baseline fix. The first full production run passed 19/21: one failure exposed the now-fixed initial-frame race; another was a test-artifact collision from overlapping browser runs. The delayed-response regression passes after the fix. The subsequent sequential production run passed **21/21 browser tests** against the corrected readiness baseline. These cover automatic advancement, wrong-order correction, voice-disabled alerts, camera cleanup, queued capture during a delayed response, recognition shutdown, Teach approval-error recovery, setup/alignment and pause/resume. Small final presentation corrections keep transcript scrolling inside its list and select correction highlights from the failed step rather than the active prerequisite. The final production build passed after these changes, followed by **3/3 focused production browser checks**, including the actual CSS correction animation, recovery, queued capture and recognition shutdown. Formatting and `git diff --check` are clean. No commit, push or deployment was performed by this review.

The corrected relationship mode still uses bounded Spark observations to verify each action. Its measured checks take seconds, while local highlights and provisional position warnings run independently. Physical workbench accuracy, actual error-onset-to-warning latency, different lighting/objects, voice plus recording on one microphone, and real gesture usability remain unverified. Neither recordings nor mocked browser tests establish arbitrary-task accuracy or dependable prevention of hardware damage.


## Subsequent complete browser/live audit

The newer [LIVE_FLOW_AUDIT.md](LIVE_FLOW_AUDIT.md) records the six additional trials, their harness/attribution caveats, the separately authorized two post-fix full-flow passes, actual command execution tests, corrected median calculation and odd-pixel regression, actionable source diagnostics and the final production build. It supersedes the older validation checkpoint above: 401 unit tests, 23 full production browser checks plus six final focused checks passed. Relationship checks remain several seconds; physical microphone/gesture acceptance and general task accuracy are not established.
