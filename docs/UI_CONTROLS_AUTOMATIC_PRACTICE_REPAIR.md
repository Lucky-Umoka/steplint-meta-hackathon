# UI, controls and automatic Practice repair — 2026-11-01

The owner reopened acceptance after the previous UI and manual setup failed their needs. The repaired production build is now on preview ports **3000 and 3001**. A hard refresh is needed for an already-open tab. No paid Meta request, new dependency, commit, push or external deployment was used in this repair.

## Confirmed causes and changes

- The new engine replaced the previous presentation with a basic layout. Restored the Teach header, cards and progress treatment. Practice has the camera and original dark companion beside each other, with steps, before/goal references and control settings below. The row remains visible during normal Practice scrolling. Manual editing does not have a sticky overlay covering its controls. Desktop/mobile layout checks passed.
- The command tables omitted `start camera` and `pause practice`. Teach now maps camera phrases to its actual preview handler; Practice maps them to actual camera/pause handlers. Muse activation is accepted alongside Guide/StepLint. No model or regex guesses physical success: matching only dispatches an allowlisted interface action.
- Teach voice opt-in reset between recording and processing stages. It now persists for the flow. Recorder guards return refusal rather than claiming a command was applied; rejected commands may be retried immediately. Narration remains interruptible by pause/stop controls.
- Teach had no gesture controller connected. Pinch/palm now use its actual recorder handlers. Gesture hit testing previously resolved only buttons; checkbox labels/settings now resolve to native controls too. Disabled controls remain disabled. Successful action feedback persists instead of disappearing on the next pointer sample.
- Manual Practice calibration was mandatory because approved exports carried no visual identity references. Fresh approvals now include bounded JPEG identity frames, the reviewed final-result frame and geometry derived from the sealed Teach context, bound into the approval receipt. Before/goal previews survive importing the unchanged export into another browser; canonical tests remove the separate thumbnail cache to verify this. Lesson selection opens the camera and starts local matching/tracking without drawing boxes or confirming calibration. Manual adjustment is optional recovery.
- The same camera angle is supported with translated framing. Two separated, agreeing fixed object references can establish the layout on a changed table; otherwise three consistent stationary source patches are required. A new table may provide a fresh camera-motion reference after object geometry is established. Significant rotation/scale/perspective changes and insufficient distinctive references remain unsupported.
- Practice requests the source aspect ratio. Prior Teach/Practice camera preferences differed, which could misalign otherwise similar views. Automatic resume preserves history and consumes an alignment epoch only after successful matching. Unavailable scene geometry produces uncertainty and automatic realignment attempts, not invented red/green scoring.
- Guidance is on by default, separately from opt-in microphone controls. Verification drives object circles/outlines, correction text, companion state and spoken guidance. The red warning outline pulses until correction without dimming live camera pixels; reduced-motion preferences are respected.

## Verification

- **475 unit tests across 58 files passed.** Tests cover automatic source planning, bounded worker envelopes, changed-table fixed anchors, inconsistent references, source confidence, signed image integrity and existing verifier behavior.
- **32 production browser checks passed.** Canonical checks exercise actual recorder/camera state, automatic start, green verification, red reversal, spoken-correction requests, automatic resume/restoration, native gesture clicks and maintained Teach voice preference. Providers and recognition readings are mocked where stated. The actual bundled gesture model also loads/samples in its separate runtime check.
- TypeScript, lint, configured formatting and the isolated production build passed. `git diff --check` is clean. No source file is newer than the build currently served.
- Both preview ports return the restored Teach/Practice pages. Unauthenticated compile, approval and lesson-import POSTs return 401. Approval integrity and the source confidence floor were preserved.
- Real owned-recording replay: video3 checked **83 frames** after automatic setup from a source frame three frames earlier and finished passed. Video2 checked **62 frames**, verified the transfer, then became `needs_verification` when a fixed reference was obscured (first unavailable reference at source frame143). Source identity geometry in these replays is an explicitly manual synthetic test fixture, not fresh Meta output or an authenticated owner approval. Current camera regions were located by the bootstrap matcher. These are recorded-pixel checks, not physical-camera acceptance.

## Timing and remaining acceptance

The latest small generated-camera software sample measured:

| Stage | Samples | Median | p95 |
|---|---:|---:|---:|
| Worker | 18 | 11.9ms | 31.0ms |
| All emitted-frame feedback estimates | 18 | 65.3ms | 118.7ms |
| Confirmed-decision feedback estimates | 4 | 75.1ms | 114.1ms |
| Observed endpoint dwell | 4 | 413.1ms | 441.5ms |
| Onset to feedback | 4 | 469.9ms | 555.6ms |

These are callback-to-two-animation-frame software estimates, not camera sensor/display measurements or a population p95. The focused pass and full compatibility run vary; the latest full-run feedback p95 exceeds the strict 100ms target, and sampled endpoint dwell exceeds 400ms. The strict timing targets and physical microphone/gesture/visual accuracy remain unaccepted. No gate was lowered to obtain better numbers.

A freshly approved Teach lesson is required for automatic visual setup; older signed exports contain no source images and are preserved unchanged. Existing clips can be selected again rather than re-recorded. Fresh live Meta output and the owner's actual Chrome/camera acceptance remain outstanding. The uploaded historical diagnostic identifies Chrome138 and voice off at that capture; it does not establish the cause of later failures. Missing command routes and mandatory setup were confirmed code defects, not attributed to the browser version.

The owner was asked to verify the repaired `Guide, start camera` action on their refreshed Teach page. Pending physical confirmation must not be described as a completed live acceptance test.
