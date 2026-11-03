# Changelog

All notable changes, newest first. Versions follow semantic versioning (see CLAUDE.md).

## 0.4.1 — 2026-11-03

### Fixed
- Teach on Meta Spark (Vercel) failed with HTTP 400. The V3 drafting schema sent `oneOf` (Zod's discriminated union for scene conditions); strict structured outputs document `anyOf` only. Provider schemas now use the equivalent `anyOf`, and Zod still validates the exact union. The provider's rejection reason is now logged server-side (bounded, redacted, never sent to the browser). Confirmed by code and schema inspection; not yet confirmed by a live Meta request.
- Practice: one late tracker reply no longer stops the whole session. It is discarded as stale evidence; Practice halts only if replies stay late for 3 s. This was the cause of paid run 5's "Tracking evidence arrived too late" stop after the first real end-to-end goal verification.
- Practice resume with the bottle resting on the plate: the plate is matched with the expected bottle region masked out, and the resting overlap is allowed for the verified zone. Local setup retries once per second instead of every 3 s.
- Teach recording: refuses to record without a live microphone track, only uses recording formats that name an audio codec, and explains a silent recording instead of "No audio track".
- The voice and gesture commands popup is centred on screen.
- Automatic component discovery (now on Baseten, which does not enforce schemas for Muse Spark Open) gets the same single bounded correction as drafting, and schema failures log their field paths server-side. Paid run 7 failed at discovery before this fix.
- Teach drafting no longer rejects a draft whose final condition was realigned to the measured result frame: the video goal review's final-scene frames are realigned with it (paid run 6 failed on this mismatch).

### Changed
- Two keys, two clients (owner rule): every Muse Spark call (automatic component discovery and drafting) goes only to Baseten Muse Spark Open with `BASETEN_API_KEY`; `MODEL_API_KEY`/api.meta.ai serves only SAM 3.1 and Muse Voice Transcribe. The Meta drafting path was removed, and the Meta client refuses any Muse Spark model at its HTTP boundary. The Vercel 400 happened because `SPARK_PROVIDER` was unset there and the old code defaulted to Meta. Legacy guide workflows that used Meta-hosted Spark now fail closed.
- Unit tests remove real provider keys before running, so an unmocked call can never reach a paid API.

### Added
- Front/back camera switch on Practice (shown when the device has more than one camera; restarts Practice on the new view) and on Teach recording (back camera by default).

### Verified
- 696 unit tests; type-check; lint 0 errors; production build; full browser suite 45 passed, 1 expected skip.
- Paid run 5 (Baseten): real Teach → approve → automatic Practice → first final goal verified; it then stopped on the late-reply halt fixed above.
- Paid runs: 5 reached the first real end-to-end final goal, then hit the late-reply halt (fixed); 6 failed at drafting on the video-goal frame mismatch (fixed); 7 failed at discovery schema validation (fixed). Fixes after run 7 are verified offline only; no authorized paid run remains.
- Paid run 8: Teach passed end to end on the two-client setup; Practice did not verify the goal (colour-profile exposure fragility, open).
- Not yet: a clean paid end-to-end pass, camera switch on a real phone, physical-camera acceptance.

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
