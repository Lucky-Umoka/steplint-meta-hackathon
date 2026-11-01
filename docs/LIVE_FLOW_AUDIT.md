# Teach and Practice audit — 2026-10-31

> **Owner acceptance failed after this checkpoint.** The owner reports automatic right/wrong detection, verification, correction, latency, gesture and voice controls do not work adequately in a physical live session. The replay/mock passes below did not establish that acceptance and must not be presented as proof of a fully working physical workflow. See [PHYSICAL_PRACTICE_REPAIR.md](PHYSICAL_PRACTICE_REPAIR.md) for the follow-up.

This audit checks the current application and the historical claims in CHAT_REQUESTS_AND_WORK.md. It supersedes historical capability claims. It does not establish arbitrary-task accuracy or hardware hazard prevention.

## Confirmed defects and corrections

- The parser accepted StepLint but rejected the documented Guide prefix. Both now work, including “Step lint” and polite command phrasing. Ignored commands now explain missing activation, unavailable action, duplicate recognition or speaking interference. Screen-specific commands are listed. Dispatch is labelled “Command sent”, never proof of successful verification.
- Relationship Practice lacked resume. Its voice handler now shares the same continuation function as the button and captures a fresh starting baseline. “Next step” reads the current required instruction; it cannot bypass a step.
- Teach refused unavailable recording actions with an unhelpful generic response. It now distinguishes consent, codec support, readiness and active recording.
- Plain relationship plan/source exceptions produced internal/unknown. Authored evidence errors now expose safe actionable explanations and specific codes. Stage wrappers retain the actual classification; cleanup failure preserves the original cause and reports expiry fallback. Stream errors log only correlation ID, stage, code, schema paths and cleanup state. No raw provider exceptions or secrets are logged.
- Local tracking skipped pixel parity and could lose sharp texture after a one-pixel move. It now searches every bounded pixel position. Regression tests cover 1, 3 and 5 pixel translations plus obstruction and competing evidence. Tracking remains advisory for relationship verification.
- Timing median previously selected the upper middle observation. It now averages the middle pair. Other percentiles use nearest-rank; invalid inputs are rejected and no warning samples are shown as “No warning timing samples yet”.

Reference 1979985f was not found in retained logs; its exact historic cause cannot be reconstructed. The corrected diagnostics make subsequent failures distinguishable. Evidence gates, signed review, human approval and the 0.90 outline policy remain intact.

## Original six new live trials

Real browser upload, exact source frames, server-side Meta calls, explicit automated test-only review/signature, save/library, automatic Practice replay and cleanup were exercised. The test actor is not the owner and these artifacts do not assert owner approval. Camera input replays consented recorded footage; it is not an independent learner or physical camera.

| Trial | Outcome | Conservative model-request count |
| --- | --- | ---: |
| video2-1 | Teach draft reached; recorder failed retrieving streamed draft before approval/Practice. Harness failure, not a pass. | 3 |
| video3-1 | Passed after harness fixes and resuming the actual signed test artifact. Not uninterrupted. | 15 |
| video2-2 | Uninterrupted Teach → review → save → automatic Practice → persisted completion; camera stopped. | 8 |
| video3-2 | Same uninterrupted full-flow pass. | 7 |
| video2-3 | Same uninterrupted full-flow pass. | 7 |
| video3-3 | Same uninterrupted full-flow pass. | 7 |

Accounting caveats: video3-1 includes four requests whose attribution was uncertain on the formerly shared server; video2-2 includes one extra ASR request before per-request isolation was enforced. They remain counted conservatively. Later trials require a matching request header on a dedicated private test server. Counts are outbound instrumentation, not a billing statement. Temporary uploads were deleted. Raw journals and source hashes remain in ignored `.media-lab/live-e2e-six/`.

Completed checks in this batch took about 4.24–4.94 seconds; initial grounding about 5.31–6.46 seconds. Local provisional feedback is separate from authoritative relationship verification. Seconds of network/model latency remain a material limit. For the last three original trials, action-start-to-visible-verification was 8.15–8.63 seconds including 2.2–3.2 seconds of demonstration playback and the held result. API duration alone must not be presented as full learner-observed latency.

## Historical Muse claims audited

- Automatic capture, correction pulsing, recovery and goal checks have deterministic and browser regressions. Object presence/movement alone cannot establish a destination relationship.
- The claimed local geometry relationship verifier is not implemented; current relationship verification uses Spark observations plus the deterministic evaluator. Local boxes provide provisional highlights only.
- The claimed shared observation engine in detections.ts is inaccurate: that module provides equality/statistics helpers.
- The old “repair-round5 5/5 passed” statement conflicts with its retained failed/blocked ledger and must not be used as acceptance evidence.
- Gesture input uses the real MediaPipe landmark shape after repairs. Interface gestures never advance procedural evidence. Physical gesture/microphone usability remains unverified.
- Avatar state, transcript labels, camera cleanup, timing and explicit confirmation are interface features, not proof of procedural accuracy.
- Hidden force, torque, temperature, internal repair quality and arbitrary tasks remain outside demonstrated evidence. Newly taught tasks require reviewable rules and clear observations; unsupported evidence remains needs_verification.

## Post-fix acceptance

Production build `yTWDrWLHLidw_JCwJWrGl` passed. Normal user ports 3000 and 3001 run this build without the private live-test guard. Private test requests are isolated on 3187.

- 401/401 unit tests across 46 files; no live requests.
- 23/23 production browser tests, including real browser MediaRecorder start/pause/resume/stop from injected finalized transcripts, Practice camera start/pause/resume/stop, duplicate/confirmation and denial handling, automatic action/correction/recovery, delayed-response capture, approval failure recovery and persistence. Generated camera/audio and mocked provider responses are used in automated browser tests; physical microphone recognition is not established.
- Strict TypeScript, lint, production build, formatting and git diff whitespace checks pass.
- Scan of 208 authored files found zero configured secret values.

The separately authorized one new live trial each for video2 and video3 started only after these checks. Both passed uninterrupted against that build, with no retry:

| Final new trial | Teach analysis stages | Initial grounding | Practice API check | Model requests | Outcome |
| --- | --- | --- | --- | ---: | --- |
| video2 | 30.78 s + 20.10 s | 6.47 s | 4.40 s | 7 | Reviewable source, test-only signed save, automatic goal verification, completed attempt persisted, all camera tracks stopped, upload deleted. |
| video3 | 27.49 s + 16.26 s | 7.77 s | 4.30 s | 7 | Same uninterrupted full-flow pass. |

Measured action-start-to-visible-verification was 8.27 s for video2 (including 2.6 s playback) and 7.92 s for video3 (including 2.2 s playback).

Both rules require the bottle base on the actual white plate/dish; moving away from the blue starting surface alone is insufficient. Correct-action replay is tested live here; wrong-action/recovery and correction animation are covered by mocked browser observations and deterministic evaluator tests, not independent live learner footage. Raw source hashes, signed test artifacts, actual outbound request/cleanup journals and screenshots remain in ignored `.media-lab/live-postfix/`. These are separate from earlier trial grants; no extra paid retry occurred.

After these live runs, two display-only audit findings were corrected: the thinking avatar no longer labels itself idle, and relationship review describes the actual approved relationship explanation instead of generic movement. No perception, command, approval or evaluator semantics changed in that final presentation edit. Final production build/browser confirmation is recorded below.


Final presentation build `80sbo7RaV1szQPoG1k4T6` passed, followed by 6/6 focused production browser checks (including the thinking label during a delayed check), strict TypeScript, lint, formatting and whitespace checks. The full 23-test suite and the final two live trials preceded only these display-label corrections; verification and command semantics are unchanged. Normal ports 3000 and 3001 now serve this final build, without test instrumentation. The private paid-test server was stopped after both trials.
