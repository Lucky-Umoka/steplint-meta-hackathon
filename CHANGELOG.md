# Changelog

All notable changes, newest first. Versions follow semantic versioning (see CLAUDE.md).

## 0.4.0 — 2026-11-03

### Fixed
- Voice commands now execute for real browser speech. The parser previously required the wake word at the very start of a final result followed by an exact phrase. Real continuous recognition prepends earlier speech (including the app's own narration), splits "Guide" from the command, keeps apostrophes ("what's next") and adds filler ("pause the practice"). Now the last wake word anywhere starts the command, a wake-word-only result is joined with the next one, filler and apostrophes are ignored, a command inside a sentence matches by whole words (most specific wins, ambiguous ties do nothing), and a bare exact command ("pause") works unless it echoes the app's last 5 s of speech. Destructive actions still need confirmation. Spoken prompts now say "Guide, resume practice".
- The goal-invalidation announcement is no longer cancelled by the same frame's "Stop. …" correction.
- Teach review: initial/final scene conditions that cite a frame contradicting the measured at-rest endpoint are bound to that endpoint, so approval is no longer blocked with nothing to fix.

- Practice tracking in the browser: the tracker chose its method from one live frame, and the colour-profile test sampled "background" 3 px outside a SAM box that crops the bottle's cap, so it often fell back to a tracker that loses the bottle under the hand. Surroundings are now sampled at a 10% margin, the approved Teach colour profile is kept and used when a live frame cannot confirm one (same 0.9 gate), and setup falls back to the approved dense template when needed.
- Practice no longer drops the work area when a bottle whose box is stale lands on the plate: a fixed reference under an approved zone is treated as possibly covered while a mover is not clearly observed. The 2 s no-reference guard, camera-movement tests and thresholds are unchanged.
- Gestures: pinch clicks where the pointer was aimed; the zone outline follows the visible picture; open palm uses the canonical pause.

### Added
- Tracking readiness panel under the Practice status: live/stalled indicator with frames per second, work-area state, each object's state and where to place it, and when Practice has started.
- "Voice & gesture commands" button on Practice opens a popup manual generated from the live command allowlist.

### Verified
- Unit: 693 tests pass; type-check; lint 0 errors (5 existing warnings); production build.
- Browser (fake camera, no model calls): full suite 44 passed, 1 expected skip; three canonical Practice continuations on the approved bottle revision passed goal, reversal, recovery, voice and button actions.
- Offline replay of the real clip: goal at frame 141, reversal at 280, calibration valid on all 540 frames; 28 start-frame/source/drop combinations complete.
- Not yet: live paid end-to-end run and physical-camera acceptance.
