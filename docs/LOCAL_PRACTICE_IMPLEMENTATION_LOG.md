# Local Practice implementation progress and mistake log

Started: 2026-11-01. Baseline: 40e566a. Owner authorized implementing ROOT_CAUSE_AND_LOCAL_PRACTICE_PLAN.md.

## Acceptance scope

Real, unmodified objects; continuous movements; no per-step check buttons or invented holds; explicit destinations/goals; local normal verification; early advisory warnings; confirmed reversal correction and automatic recovery. Preserve signed review and legacy data. No paid Meta implementation/test calls, commits, pushes or external deployment.

## Work packages

- [ ] Shared incremental verifier and continuous movement semantics.
- [ ] Versioned executable measurement, goal and persistence contract.
- [ ] Unmarked-object tracking adapter and live calibration.
- [ ] Canonical Teach orchestration, review and approved persistence.
- [ ] Canonical Practice UI wired to feedDetection and verifyEvents.
- [ ] Evidence, diagnostics, correction, recovery and goal monitoring.
- [ ] Unit, application integration, production browser and performance checks.
- [ ] Documentation/diff/security review and physical acceptance instructions.

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
