# Local Practice implementation progress and mistake log

Started: 2026-11-01. Baseline: 40e566a. Owner authorized implementing ROOT_CAUSE_AND_LOCAL_PRACTICE_PLAN.md.

## Acceptance scope

Real, unmodified objects; continuous movements; no per-step check buttons or invented holds; explicit destinations/goals; local normal verification; early advisory warnings; confirmed reversal correction and automatic recovery. Preserve signed review and legacy data. No paid Meta implementation/test calls, commits, pushes or external deployment.

## Work packages

- [x] Shared incremental verifier and continuous movement semantics.
- [x] Versioned executable measurement, goal and persistence contract.
- [x] Unmarked-object tracking adapter and live calibration.
- [x] Canonical Teach orchestration, review and approved persistence.
- [x] Canonical Practice UI wired to feedDetection and verifyEvents.
- [x] Evidence, diagnostics, correction, recovery and goal monitoring.
- [x] Unit, application integration, production browser and software performance checks. Physical targets remain separate.
- [x] Documentation/diff/security review and physical acceptance instructions.
- [ ] Owner physical-camera and fresh live-Meta acceptance.

## Progress

### 1. Implementation entry and baseline inspection

Confirmed the owner-supplied architecture prompt and plan, the currently disconnected procedure pipeline, and legacy approval formats. Production implementation has started; physical acceptance is open. Existing owner-authored NEW_ARCHITECTURE.MD is retained unchanged.

Next: remove repeated full-log verification from the existing pipeline while retaining a full replay reference and legacy behavior; add regressions before wiring UI.

## Mistakes and hazards to avoid

- A standalone verifier pass is not proof the main UI uses it. Tests must exercise /teach and /practice.
- Colour fixtures do not establish real-object acceptance. No sticker dependency.
- Do not make unknown overlay scores into confidence values to satisfy an interface.
- Do not parse/reserialize signed artifacts and silently change their digest/order.
- Do not confuse confirmation time with observed event time, or slow transit with tracking loss.
- Do not mark a reversal from occlusion alone or stop monitoring when the first completion banner appears.
- Preserve already-running preview builds; never rebuild a directory currently being served.
- Keep generated-camera/provider mocks separate from physical-camera and real API evidence.

## Verification record

No new checks run yet for implementation. Earlier investigation baseline: 139 targeted tests passed; that is not post-implementation evidence.

### 2. Incremental engine and versioned contract

Implemented one shared reducer (`createVerifier`); full replay invokes that same reducer. Camera pipeline now pushes one event rather than replaying the entire history. Added optional V2 measurement, explicit goal/coverage and persistence fields without converting signed V1 artifacts. V2 distinguishes visible transit, physical onset and confirmation; records reversals/restorations while preserving earlier audit events. Draft promotion remains explicit and unapproved.

Checks: 76 tests passed across procedure, practice, incremental replay and new continuous tests. TypeScript passed after correcting the metadata wiring described below. No live model calls or physical acceptance occurred.

Mistakes caught: the first metadata edit updated call sites without the event recorder signature; `tsc` caught two argument-count errors, now corrected and metadata asserted in regressions. Adding schema fields also expanded the paid compiler's strict wire format unintentionally; inspection caught this before any request. The provider wire schema now explicitly omits local-only execution/measurement extensions. Session initialization unnecessarily parsed the procedure twice; reduced to one verifier.

Remaining: V2 multi-step overlap/repeated-object tests, real-object tracker/calibration and main UI wiring. Current tests do not prove those features.

### 3. Integration work and a caught compiler regression

Added bounded native-object feature calibration/tracking, a tracking worker, one-frame-in-flight transport and configurable camera readback (320×240 for the new path). Added a separate fixed workspace reference and sticky identity loss. Added raw approved-artifact IndexedDB storage, a connected Teach composition and a local Practice composition; these are not yet switched into the default pages or accepted.

Expanded regression checks caught four mock Teach failures: Zod refuses `.omit()` on a refined object. This was introduced while excluding local-only contract fields from provider output. The correct repair is an explicit provider wire object constructed from field schemas, retaining full semantic validation after response parsing. No paid calls occurred. Also caught a UI status mismatch (`completed` vs actual `passed`) in TypeScript before connection.

### 4. Continuous order, review and connected UI checks

Added regressions for physical occurrence before confirmation, retained transitions while an earlier sensor confirms, explicit later actions using the same object, premature movement, and cancellation of a retained transition when the object leaves its destination. Inspection found two causal edge cases: a forbidden-order rule ran before pending-confirmation handling; and retained transitions survived a return to the start. Both were corrected with regression assertions. Persistent guards now remain active until an explicitly approved later action is eligible; repeated-object contracts require that release chain.

New Teach review requires human goal coverage and a distinct tracked change frame between start/result; existing confidence and contiguous-evidence checks remain. Added prepared-recording preview after discovering that unmounting Capture otherwise removed the preview. Removed old teaching copy asking for artificial pauses. Approval receipt verification stays on the server; raw export bytes/order are retained in dedicated storage. Legacy libraries remain behind explicit links.

Verification: full unit suite at the first integration checkpoint passed 423 tests across 50 files; lint passed. Later new review tests separately passed (2). Native-object synthetic texture tests passed (4): movement, moved reference, identity loss, overlapping calibration. These are neutral generated textures, not physical real-object acceptance. TypeScript caught a wrong UI completion literal; lint caught ref-object propagation, fixed by destructuring state/ref outputs without disabling the check.

Production QA builds use a new isolated `.next-local-qa` directory because both existing owner preview ports serve `.next-verify`. Existing preview builds were not overwritten. Browser tests are next; default page wiring has been changed in source but owner previews still run their existing build.

### 5. Browser-only calibration failure found

The generated-camera browser run failed to open calibration despite 11 processed camera frames. Tracing native video state, camera statistics and the production callback showed this was **not** a slow camera: spreading native `ImageData` dropped its prototype getter properties `width`/`height`. The resulting zero-size preview threw inside the capture handler. Replaced the spread with explicit dimensions and copied pixel bytes. Added first-frame gating and reset it on camera restart. This is exactly why plain-object pixel unit tests were insufficient; keep the native browser regression.

Test harness mistakes: one fixture used an invalid component ID (`object` instead of the allowed component-1..4) and passed a direct helper but failed real handler validation. Fixed the fixture, retaining the actual boundary test. Two overlapping Playwright runs briefly shared the same result directory and caused artifact collisions; stopped the duplicate runs and now run browser checks sequentially. No owner preview process was stopped.

### 6. Native surfaces, fixed references and explicit compiler coverage

Recorded video3 exposed the feature-only limitation on a plain object: the initial feature replay retained only 1/86 frames. Dense RGB appearance improved visibility but lost the changing bottle view around frame 81. Added an explicitly selected native-surface descriptor using measured chromaticity/RGB similarity and connected components, plus ambiguity, area/aspect and loss gates. It learns the existing surface; it does not require stickers or hardcode red/bottle. Neutral textures retain dense/feature modes. Modes are chosen at calibration and never switched after identity loss. Dense tracking exposes its actual matching error and alternative gap; null advisory scores remain null in the legacy API. No fixed success score was added.

A corrected full-object calibration box (including the nozzle) selected the native-surface mode and retained observed tracking across all 86 replay frames (video3 frames 25–110); median JPEG decode + local tracking was about 11ms. This is recorded replay with a manually checked ROI, not physical acceptance or a hardware latency guarantee. The earlier retained artifact's mark and an initial hand-chosen cropped mark were inadequate; do not silently reuse those marks.

Added fixed-object roles: selected stationary destinations are calibration references, not invented movement steps. Their movement/uncertainty invalidates the setup; legitimate overlap with a moving object is not an identity collision. Added native-surface regressions for several learned colours, illumination/scale, duplicates, loss and seeding the selected ROI rather than a larger object outside it.

Extended local compiler mode to ordered repeated-object transfers (bounded 20 steps/four objects), preserving legacy wire mode separately. A complete carry is one step. Repeated actions explicitly reuse the previous target zone. Structured goal coverage carries unsupported requirements forward; a global human checkbox cannot silently turn them into supported requirements. Explicit human goal confirmation is now part of V2 approval. Contact/force/hidden states remain unsupported by a zone measurement.

### 7. Browser pointer cancellation and evidence path

Default Teach → reviewed goal/source moments → approval → saved handoff → default Practice passed in a production browser with mocked perception/receipt responses. Real server-handler tests separately prove genuine V2 receipt signing/verification and tamper rejection without model calls.

Practice calibration still failed after dimensions were fixed. Pointer tracing established the next cause: SVG image drag generated `pointercancel`/`dragend` instead of pointer-up on larger zone drags. Fixed FrameMark to prevent native dragging and clear cancelled pointers; the regression draws all fields through native pointer events. Do not treat this as another camera latency failure.

Replaced periodic live JPEG encoding with a bounded raw-pixel evidence buffer. It retains origin/onset references across long transit and encodes only on diagnostics export. Added worker request/reply schemas and typed sends. Inspection caught a missing measurement field in the calibration reply before rebuilding. Worker errors and stale generations stop verification rather than continuing optimistically.

Current gate: rerun the full Practice browser sequence after the pointer/worker changes, then audit latency/voice/recovery and real video2 replay. No live Meta requests, commits, pushes or deployment have occurred.

### 8. Continuous clipped identity, endpoint stability and resume

Video2 inspection established that the bottle's top genuinely leaves the image while its distinctive body remains continuously visible. Full-outline coordinates are therefore unavailable. Added a separate **identity-only transit** signal: it supplies no endpoint coordinates and cannot complete a step or confirm a reversal. Competing/insufficient identity still becomes lost; there is no blind reacquisition. Fresh complete geometry must satisfy endpoint evidence before verification. Tests explicitly reject clipped endpoint geometry, and preserve only bounded, continuously visible identity.

A broad destination can be crossed while still moving. Added approved per-object maximum position drift to endpoint dwell; this does not wait for the whole scene to settle. Added automatic initial-view arming before the first spoken instruction. Adjacent actions use physical onset, so the next action need not wait for the previous software confirmation. New tests cover these cases and early-start recovery.

Implemented pause/resume with fresh calibration epochs. The shared verifier retains original completed-action times and append-only events, invalidates current evidence, then revalidates known completed states from fresh target evidence. Unfinished actions require a fresh origin; target presence cannot fill missing history. Resume expectations come from verifier history, not a second guessed state machine. Restart is explicit and voice-confirmed; voice never passes a step. State/identity records use safe dictionary keys.

Caught and fixed: redundant worker termination became unreachable after a new synchronous start guard (`tsc` caught it); resume initially selected the first lesson instruction even when completed work had been retained (changed to the next unverified step); calibration confirmation text needed different semantics for resume; stale warnings and alerts needed clearing when their condition or selected lesson changed. Source-confidence policy is now explicitly checked at >=0.90 during Teach draft validation so the model cannot lower it.

### 9. Shared frame adapter, controls and validation hardening

Browser and replay now use `feedTrackingFrame` for complete watch-set checks, ordered component updates, image-point mapping, partial identity and unavailable calibration. Empty/duplicated/mismatched identities cannot leave an old green result active. Fixed-object identity checks use stable visible edges and complete template error, rather than letting a saturated colour blob stand in for a white plate. Full-object overlap with a fixed destination is legitimate; contradictory identity tracks are not.

Voice start/resume/end/restart controls use the same host guards as buttons. Rejected host actions do not consume the transcript and suppress an immediate valid retry. Pause/stop-speaking IDs match the interruption allowlist. Speech errors no longer stop visual verification. Transcript labels distinguish guidance/control feedback from actual speech start. Restored the companion in the canonical UI and corrected its dark panel to the explicitly requested light theme.

Build isolation mistake caught: ESLint initially scanned generated `.next-local-qa` bundles because the new build output was missing from the existing generated-output ignores. Added that directory alongside the other build directories; no source rule was disabled. A temporary test-edit syntax error was also corrected before the next clean run.

Recorded-replay timing correction: FFmpeg files begin at 001 for source frame 0. The initial private replay timestamp calculation was off by one frame (66.7ms at 15fps). Corrected to `(fileIndex - 1) / fps`, and changed the replay to the same `feedTrackingFrame` adapter as the application. Reports remain synthetic procedure fixtures over real owned recordings, without authenticated receipts or physical acceptance.

Final check run is in progress. Earlier checkpoint: 455 unit tests across 57 files passed; later resume/frame-adapter tests require the final run below. Prior production browser checkpoint passed both canonical flows, reversal/restoration, voice interruption, consent guards and handoff; final rerun includes resume.

### 10. Final performance pass and external checkpoint

Full Vitest passed 464 tests across 57 files. TypeScript, lint, configured formatting and isolated production build passed. Canonical production browser tests passed including fresh-calibration resume.

The first browser timing run missed the strict target: confirmed-decision feedback estimate median 121.7ms / p95 130.8ms, worker median49.9ms. Dense matching allocated RGB arrays and sorted residuals for every candidate. Replaced that work with a reused histogram of integer channel residuals, preserving the exact trimmed mean, candidate search and all quality gates; oracle tests passed. Worker median then measured11.3ms; feedback median83.0ms, with a141.7ms tail in four decisions. The generated-camera fixture itself still allocated76,800 arrays per animation frame. Changed it to pre-rendered image blits of the same deterministic texture; the frozen-build rerun is recorded next. These are software estimates, not physical display measurements.

Detected externally created commit `56bf93e` by Lucky Umoka during the run. This agent executed no commit/push command and preserved that checkpoint. Final diff review must include changes from original `40e566a`, not only the now-smaller unstaged diff. The owner's NEW_ARCHITECTURE.MD remains unchanged by this agent.


### 11. Frozen-build verification

Final full suite:466 tests/57 files, strict TypeScript, lint, configured format check and isolated production build passed. All30 production browser checks passed, including canonical Teach/Practice, correction/restoration, voice guards/interruption, preserved-progress resume, legacy workflows and real bundled gesture-worker startup.

The same-pixel blit camera removed synthetic allocation pressure. Latest software feedback samples: confirmed decisions median36.9ms/p9545.1ms (4 decisions); all emitted samples median35.2ms/p9573.9ms (16); worker median4.7ms/p9516.9ms. Onset-to-feedback p95502.1ms. Endpoint dwell was configured400ms but observed p95467.7ms due to sampled callbacks; do not claim the200–400ms sensing target or hardware latency fully accepted. Earlier slower measurements are retained above.

Final self-review caught a known-violation presentation defect: later unchanged observations or unrelated successes could replace a red wrong-order correction. Added presentation priority from the verifier's current failed states and a sticky-known-violation regression; unknown evidence still becomes uncertainty. Source discovery now explicitly includes stationary support/destination references and selects a visible surface point rather than an occluded box centre; legacy wire mode remains separate.

Real recorded replay now monitors bottle, white plate and blue source lid. Video3 verifies and remains supported in its checked window. Video2 verifies at8866ms (onset8466ms), then becomes unverified when a fixed reference is covered at source frame143/9533ms. No clipped outline completed a step. These use synthetic procedure fixtures, not real signed owner approvals or physical-camera acceptance.

Final report: LOCAL_PRACTICE_IMPLEMENTATION_REPORT.md. Preview refresh/cleanup is the last operational step; no paid API request or commit/push/deployment command was executed by this agent.

### 12. Preview refresh and cleanup

Both owner preview ports (3000 and 3001) now serve the validated isolated production build. Canonical Teach/Practice return HTTP 200; unauthenticated compile, approval and lesson import return 401 on both ports. The temporary QA server on 3002 was stopped. No Playwright or FFmpeg workers remain; only the two intended preview servers remain. Final Playwright last-run artifact reports passed with no failed tests. No model requests were made during these checks.

### 13. Owner reopens UI and control acceptance

The owner rejected the replacement layout and reported recognized voice/gestures without actions. Preserve the deterministic engine, restore the previous Teach header/cards/progress and Practice visual hierarchy, and put camera and the original dark companion side by side with steps, references and settings below. The supplied screenshot was inspected. Confirmed wiring gaps: Teach lacked gesture controls entirely; gesture activation resolved buttons only, ignoring checkbox labels/settings; the parser did not recognize Muse activation; Teach voice opt-in reset between processing stages; recorder guards returned void even on refusal, allowing misleading command-sent feedback. These do not prove the cause of every physical recognition failure; exact failed utterance/gesture was requested while implementation continues. No paid calls authorized or made in this repair.

Implemented-so-far checks caught a TypeScript overload issue in the shared voice preference tuple; corrected to an explicit boolean/setter type. Browser action/state regressions and visual checks are required before completion.

### 14. Automatic setup and control root causes (owner feedback)

Owner clarified roughly the same camera angle, with potentially different tables. Added bounded, receipt-bound source frames and source geometry derived from the sealed Teach context. Normal fresh Teach approvals now carry automatic identity references. Practice opens the camera after selection, attempts local source alignment and starts tracking without drawing regions or confirming calibration. Manual adjustment is optional recovery. Two separated fixed object references may establish the layout on a new table; otherwise three agreeing stationary source patches are required. Unknown correspondence never establishes a layout. Substantial rotation, scale/perspective changes and insufficient fixed references on changed scenery remain unsupported; physical accuracy is unaccepted.

Speech recognition showing a transcript establishes capture, not dispatch. Confirmed missing commands were `start camera` and `pause practice`; added these and Muse activation. Canonical browser tests now use the owner's phrases and assert real camera/recording state. Voice opt-in persists across Teach stages; refused recorder actions return false. Guidance is on by default separately from optional microphone controls.

First revised browser pass failed and was not acceptance: one selector became ambiguous after adding the library card; a stage test assumed re-enabling a voice opt-in that now persists; CSS color serialization used OKLCH rather than RGB. Real defects caught: an extra source `frame` field violated the strict worker wire schema, and successful gesture feedback vanished on the next pointer sample (recording actually paused in the failure capture). Corrected the wire mapping and retained visible action feedback; gesture tests additionally count actual dispatched native clicks and verify host state. An automatic-resume draft also mutated history before alignment succeeded; delayed resume until successful alignment so failed retries cannot consume epochs or reset history. Automatic alignment provenance is separate from human confirmation. Camera aspect preference now follows the source.

Earlier 472/58 unit checkpoint passed before the last automatic-alignment additions. Targeted source/alignment checks include a different-table fixture and contradictory fixed anchors. Final production browser and full regression checks are pending below. No live paid API call was made.

### 15. Repaired production verification and preview refresh

All 474 unit tests/58 files and all 32 production browser checks passed. Strict TypeScript, lint, configured formatting, production build and diff whitespace check passed. One build emitted its complete route list but exited with SIGTERM; no reason was established. A standalone rebuild exited 0 before release. No app source is newer than the served build. Both owner ports 3000/3001 now run that immutable build; canonical pages return200 and unauthenticated paid/approval/import boundaries return401. A hard refresh is required for existing tabs.

Automatic recorded replay used source appearance from three frames earlier: video3 checked83 frames and passed; video2 checked62 frames, verified transfer and then correctly became unknown when a fixed reference was obscured. Source regions are explicit synthetic test metadata over real owned pixels, with no owner receipt or fresh provider acceptance. Different-table anchoring is covered by a deterministic synthetic fixture, not a physical new-table test.

Latest full-suite software timing sample (4 decisions) is slower than the earlier focused sample: decision feedback p95 about110ms, onset-to-feedback p95 about593ms; the strict100ms feedback target and200–400ms sensing target are not fully accepted. Do not cherry-pick the earlier faster numbers or represent software replay as hardware timing.

The owner was asked to test Guide,start camera after a hard refresh with consent/voice enabled. That physical confirmation is pending. Report: UI_CONTROLS_AUTOMATIC_PRACTICE_REPAIR.md. Temporary QA server cleanup follows; only the two intended previews should remain.

### 16. Portable before/goal previews and final cleanup

Final review caught that preview thumbnails lived only in their creating browser. Fresh approval now signs the reviewed result frame alongside identity frames; imports derive before/goal images from those signed frames. Older identity-only approvals still validate unchanged. Canonical handoff tests delete the separate thumbnail cache and confirm both pictures survive reload. No new model request is involved.

Final immutable build: all475 unit tests/58 files and all32 production browser checks passed again. TypeScript, lint, configured formatting and production build passed. Owner ports3000/3001 now serve that latest build; source timestamps are no newer than its BUILD_ID. Last software sample:4 confirmed decisions, median75.1ms/p95114.1ms; worker median11.9ms/p9531.0ms; onset median469.9ms/p95555.6ms. Physical timing and the strict100ms feedback/200–400ms sensing targets remain unaccepted. Temporary QA server3002 is being stopped; only the two preview servers remain. Physical owner confirmation is still pending.
