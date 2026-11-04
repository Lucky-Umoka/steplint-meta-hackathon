# Changelog

All notable changes, newest first. Versions follow semantic versioning (see CLAUDE.md).

## 0.11.0 — 2026-11-04

### Fixed (paid run 17: Teach passed; Practice never armed)
- Unmoved "irrelevant" objects that hold an approved zone (the plate) are set up as optional fixed references, and the tracker always measures its fixed references, so Practice is not left with only a table patch that hands cross.
- Zones cover where the object was seen resting next to each end of the move (bounded 0.025 spread), with a radius of 0.2 x the object's height (min 0.04, max a quarter of the move): SAM and the live tracker disagree on a box edge by 15-18% of object height.
- Colour tracking: surroundings re-sampled farther out when SAM's box crops the object's base; at setup the live camera's colour is tried at the tracked box or the approved start box (Teach saw dark red, live bright red), so the bottle keeps its identity under a grasp.
- Paid-run harness archives each run's artifacts as `results-paidN` immediately.

### Verified
- Offline replay of run 17's real lesson (re-derived from its recorded SAM/Spark outputs): arms, keeps the bottle through the grasp, step passed and final goal verified after landing. Unit 758, lint 0 errors, build, browser suite 50 passed. Not yet verified live.

## 0.10.0 — 2026-11-04

### Fixed (paid run 16 root causes; Teach passed end to end, Practice never verified)
- Practice no longer treats a reference the mover started on (the lid under the bottle) as camera motion when the mover is lifted off it; such a reference is uncertain, and seen displaced it proves motion only if no other reference confirms the camera is still.
- V3 steps measure an object's base (`bottom_center`) by default, and steps, zone suggestions, approval and the final goal share one point per object. SAM and the local tracker disagree on a tall object's top, not its base; the centre missed the destination zone by 0.0023.

### Verified
- Offline replay of run 16's real approved artifact reproduced both failures; the lesson re-derived from run 16's recorded SAM/Spark outputs with the new rules approves, and Practice verifies the step and final goal 0.4 s / 0.8 s after landing. Unit tests (756) include both failures through the tracker and Teach-to-Practice paths, the old rules reproducing them, and controls (reference never stood on, camera motion, base outside the zone). Not yet verified live or on a physical camera.

## 0.9.0 — 2026-11-04

### Changed (owner decision)
- Teach evidence: SAM observations scoring >= 0.5 count when they form a steady rest (3+ consecutive frames, box within the 0.01 rest drift, outline within ±50%); everything else still needs >= 0.9. On the bottle video SAM scores correct outlines 0.5–0.9 most of the time (run 12: the plate had 7 frames >= 0.9; paid run 15 failed on a 4.3 s reliability gap while the bottle stood on the lid). One rule (`trustedTrack`) now decides Teach source reliability everywhere: compile, model eligible frames, review suggestions and moment menus, approval, scene predicates and Practice setup reference frames. Regression: a move whose resting start/landing score 0.6 compiles, is suggested, approves and gets a setup plan; at 0.45 it is rejected.

### Added
- Creator-only `diagnostic` event in the compile stream with per-frame SAM evidence after each SAM call, so failed runs can be replayed offline (run 14/15 data was lost without it).

## 0.8.0 — 2026-11-04

### Changed (owner decision)
- Teach accepts a hidden carry: a move may span one tracking gap of up to 4 s, only between a settled start and a settled landing at least 0.05 apart with a reliable observation between them (paid run 14: SAM dropped the bottle while carried). Gaps over 4 s are still rejected; Practice unchanged. Unit tests cover accepted carries, too-long gaps, unsettled landings and missing in-between observations.

## 0.7.3 — 2026-11-04

### Fixed
- A draft that is valid JSON but breaks the schema now gets the single correction, with the exact field issues (previously it failed immediately; Baseten does not enforce the schema).
- The schema is presented as something to satisfy, not to repeat: discovery echoed the schema itself in paid runs 13 and 14, wasting its one correction.

## 0.7.2 — 2026-11-04

- Drift gate now requires the box to grow beyond discovery's own box as well (paid run 13 false alarm: a lid grows its visible mask when the bottle is lifted off).
- Teach stops before the drafting request when no object has a measured movement, naming each object's reason (paid run 14: the draft schema allowed no steps, so drafting could only fail).

### Fixed
- Felicity Teach audit and Practice advice always failed on Baseten: the model echoed the schema's "$schema" key and strict validation rejected it (paid run 12). The key is no longer sent and is ignored if echoed.
- SAM is prompted with discovery's box together with its point; an implausibly large outline triggers one bounded box-only SAM retry, else Teach stops before any drafting request (paid run 11: the bottle point landed on the sleeve).
- Harness: waits for Felicity's audit before approving; captures compile stream, audit and Felicity replies; waits for running before pressing Pause; video recording optional.

- SAM tracks drifting to hands (paid run 12): a track whose outline exceeds 3× its early size on >15% of frames, or an object discovery did not report as moving whose outline wanders >25% of the view while changing size, is implausible → one bounded box-only SAM retry, else Teach stops before drafting. Checked on the captured run 11/12 tracks: flags exactly run 12's bottle (arm) and "lid" (hand), no correct track.
- Discovery may give a moving object's resting view (box + point after it comes to rest); SAM receives it as a second prompt frame so it can re-anchor after a grasp. Invalid or earlier views are dropped.

## 0.7.1 — 2026-11-03

### Fixed
- Teach failed at "SAM tracking: Lesson processing or validation failed" on phone videos with variable frame timing (video 5: 415 frames, 6.5–476 ms apart). Uploaded clips with irregular frame timing are now re-encoded to steady 10 fps before upload, like in-app recordings (verified in Chrome on video 5: 424 frames, 100 ms apart). Paid run 10 then passed SAM tracking where run 9 had failed.
- SAM-stage validation errors are shown instead of the generic message, and every hidden stage error is logged on the server (bounded, redacted).

### Known issue (paid run 10)
- White bowl on white paper: SAM's bowl track did not follow the bowl while the paper track did, so the draft could not be approved. Not fixed.

## 0.7.0 — 2026-11-03

### Added
- **Felicity Teach quality audit (Phase 3).** After a draft is built, the review page asks Felicity (one bounded Muse Spark Open request on Baseten, `POST /api/teach/audit`, creator session and sealed review context required, 60 s timeout, no tool loop) to compare the draft with the existing Muse Voice transcript, SAM 3.1 measured movement windows and source timing. Findings: missing actions, measured movements absent from the procedure, claims beyond the evidence, missing or unclear objects, unclear instructions, unclear final goal, each marked "Needs your attention" or "Suggestion", with step, narration time or frame references kept only when they exist. Advisory only: nothing is added to or approved in the procedure. If the audit fails or times out, the panel says "Audit unavailable" and Teach continues unchanged.

### Fixed
- Teach "Spark draft validation after one correction: Unseen or ambiguous actions cannot be represented as measured steps": the correction instructions told the model to keep `videoReview` unchanged, so it could not fix a contradiction inside the video review. It may now correct only the conflicting video-review fields (a step-linked action must be visible with its window; an unclear or unseen action is unsupported with no step).

### Verified
- 726 unit tests (audit: grounded request, findings kept, invented references removed, draft unchanged, failure reported, creator session required; correction path fixes a contradictory video review); type-check; lint 0 errors; build; full browser suite 50 passed, 1 skip (review shows audit findings and still approves; a blocked audit shows "Audit unavailable" and still approves).
- Not yet: a real paid audit or Teach run on video 5.

## 0.6.0 — 2026-11-03

### Added
- Practice progress bar, elapsed timer and time-to-goal estimate (demonstrated step times, rescaled by the learner's own pace once a step is done), in the live goal panel.
- Centred finish celebration on the first verified completion: finish time, speed against the demonstration, personal best (stored in this browser). It does not block the controls and closes itself after 9 s.
- Felicity setup help: when automatic Practice has not started, Gideon gives a local hint at 12 s naming the first object and its starting place; at 20 s Felicity diagnoses once from the real setup state (lifecycle, last problem, objects found or missing), and Gideon speaks the advice. The advice is discarded once Practice runs or the camera stops.

### Fixed
- Teach: a final goal naming an intermediate place (for example the paper instead of the mat) is now rejected with a precise reason, so the single correction request can fix it before review. It is never silently rewritten (existing rule: the goal is not inferred from the last steps).

### Verified
- 720 unit tests; type-check; lint 0 errors; build. Practice browser specs 17/17 sequentially. One existing automatic-Practice browser test is intermittent under load (passed 2/2 on rerun).
- Recorded bottle clip (fake camera, model calls blocked): start, identification, verified step, Gideon's grounded "Stop.", named visibility requests, same-object reacquisition, verified final goal, pause/resume/stop/start. Median feedback 34 ms (p95 53 ms). This is not physical acceptance.

## 0.5.0 — 2026-11-03

### Added
- **Felicity** (Phase 1, `docs/Final-Implementation`): asynchronous recovery advice for difficult Practice incidents — a confirmed mistake still unresolved after 4 s, or an object unseen for 8 s. One request per incident to Muse Spark Open on Baseten (`meta-models/muse-spark-open-1026`, same adapter), with the approved step, recovery, verifier reason, approved object/zone names and one small evidence frame. One sentence; never claims a verdict (rejected server-side); never changes the verifier. Endpoint `POST /api/practice/recovery`: same-site only, 1 request per incident, at most 6 per learner session per 10 min, `FELICITY_MAX_PER_HOUR` (default 60), `FELICITY_ENABLED=0` switches it off; 25 s timeout.
- **Stale-response protection:** advice is delivered only if, when it arrives, Practice is still running in the same worker generation and revision, the incident is still the latest one, the learner has not corrected it, and it is under 30 s old. A new incident aborts the previous request locally (an abort is never treated as the provider stopping).
- **Gideon** (the Practice avatar, formerly labelled "StepLint Guide"): immediate local visibility requests naming the object — "I can't see the red squeeze bottle clearly. Please show it to the camera.", "Please move your hand so I can see …", "I lost track of … Hold it still for a moment." — instead of the generic "Missing, unknown, obstructed…" sentence. Never a violation.
- Live goal panel in the bottom-left corner of the Practice camera: before/goal pictures, the goal and the full step checklist (✓ done, ✗ correct this, ● current, ○ to do), visible throughout Practice.
- Lesson pictures in the Teach and Practice lesson lists (stored goal reference, else the reviewed Teach frame).

### Fixed
- Teach camera and preview no longer show black bars at the sides: the video keeps its own aspect ratio.

### Verified
- 712 unit tests; type-check; lint 0 errors (5 existing warnings); production build.
- Browser: full suite 46 passed, 1 skip; two renderer crashes under parallel load on this 8 GB codespace, both specs passed when rerun alone (12/12). Felicity browser tests (mocked endpoint, no paid call): immediate "Stop." with no remote wait; stale advice discarded after a correction; a new mistake's advice delivered and spoken; a failed request leaves Practice running and the step failed.
- Real bottle clip (free continuation, model calls blocked): visibility requests during hand occlusion, step and final goal verified, reversal corrected, recovery verified.
- Not yet: a paid Felicity request, physical-camera acceptance, video 4 (dark bottle in front of a dark sweater).

## 0.4.2 — 2026-11-03

### Fixed
- Teach recordings sounded silent on phone and desktop. Root cause: commit 7dbcb85 (60-second limit, 2 Nov) changed the prepared MP4 from keeping AAC audio to always discarding it, to fit Vercel's 4 MB upload (silent MP4 plus a separate narration WAV). The preview, and anything saved from it, played that silent MP4. The preview now plays the original recording with its sound; the upload is unchanged (silent budgeted MP4 + WAV), so limits are untouched. Uploading a file without a sound track now says so plainly.
- Practice tracking on new lessons (paid run 8): while an object's identity is confirmed, the tracker now tries a colour profile grounded from the live view (current exposure) before the one learned from a single compressed Teach frame, under the same 0.9 gate. An optional "support" surface that contains a mover (a whole tabletop) is no longer used as a camera reference. Page-like offline replay of the real clip: both the run-5 and run-8 lessons confirm the goal from all 7 tested start points (3–27 s); reversal still caught at frame 280; calibration valid on all 540 frames.
- The version shown in the header is read from package.json (it was hard-coded as v0.3).

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
