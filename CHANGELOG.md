# Changelog

All notable changes, newest first. Versions follow semantic versioning (see CLAUDE.md).

## 0.16.1 — 2026-11-04

### Fixed (owner: bowl on the mat but Practice "Waiting for the starting position")
- During the move, a single disturbed reference (hand/arm over it, camera noise) declared "camera moved", Practice re-set, re-located with the bowl already on the mat and waited again for the start position, so the move could never pass. In live setup, camera motion now needs consensus (two or more references seen displaced together); a hidden or single disturbed reference is uncertainty; references may stay hidden by the learner up to 6 s. Non-live setups keep the strict rules (all existing safety tests pass).

### Verified (owner's real frame + real SAM boxes, noise, exposure drift, hand over bowl and mat)
- Correct move: armed, step passed, goal verified. Reversal: step failed, goal invalidated. Wrong move (bowl on the bare table): never passes. Camera shifted 18 px: detected on the first frame. Unit 772; lint 0 errors; build; Practice browser tests on the final build. Not yet verified on the owner's physical camera.

## 0.16.0 — 2026-11-04

### Fixed (owner physical test: tracking started but no step, goal or correction)
- Lost objects were searched only where last seen: live calibration never set the approved zones, so a bowl carried to the mat was never found there. Live setup now passes its zones (goal zone included) to the tracker's bounded search.
- Worker crash: a diagnostic `alternativeGap` of Infinity failed the reply schema; non-finite diagnostics are reported as unknown.
- Camera references: one background reference is chosen above the objects and away from the side edges (where arms enter), in addition to the fixed supports. With fixed supports present, an unrecognised background patch is "not seen" rather than "camera moved"; as the ONLY reference the original strict rule stays (safety test kept).
- Gideon names objects plainly ("the white bowl").

### Verified
- Owner's real frame + real SAM 3.1 boxes, production tracker and deterministic verifier: arm and hand grasp/carry the bowl from the towel onto the mat -> armed, step passed, final goal verified; moving it back -> step failed, goal invalidated; calibration valid throughout. An 18 px camera shift is detected on the first shifted frame. Arm over the right edge: 90/90 frames valid.
- Unit 87 / 772; lint 0 errors; build; Practice browser tests 23/23 on the final build (full suite 52/1 skipped on the previous build); live-setup page test on the owner's dev server. Not yet verified on the owner's physical camera.

## 0.15.4 — 2026-11-04

### Fixed (owner console: "starting live setup" -> "calibration lost: The camera or workspace reference moved")
- Live setup used a background texture patch as the camera reference; on the owner's frame it sat at the right edge where the owner's arm appears, so the arm "moved the camera". Reproduced exactly on the owner's real frame (arm over the right edge: lost at the first covered frame). Live setup now uses the approved fixed supports (towel, mat) as camera references, with the tracker's rules for objects resting on / lifted off them; the same arm test holds 90/90 frames, bowl observed 90/90, also under ±12 % exposure drift.
- Measured: the same page test reaches 24 frames/s on a production build vs 10 frames/s on the dev server (owner saw 1 frame/s in dev mode with DevTools device emulation). Demo should run a production build.
- Restored `vitest.config.ts` (keeps tests scoped and the no-live-call guard) and `vercel.json`, deleted in the working tree, with the owner's approval.

### Verified
- Unit 87 files / 772 tests; lint 0 errors; Playwright 52 / 1 skipped run had one load-related failure that passes 3/3 in isolation. Not yet verified on the owner's physical camera.

## 0.15.3 — 2026-11-04

### Fixed (owner: "nothing worked, not even the Gideon voice" after "starting live setup")
- A live setup that failed to start (e.g. touching supports: overlapping zones or overlapping fixed objects) went through `halt()`, which cancelled Gideon's speech and stopped automatic setup, silently. Live setup failures are now logged (`[practice] live setup failed: …`) and retried; every tracker setup error is logged.
- Overlapping support zones are split at the middle of the overlap; touching supports are allowed in calibration while their boxes stay distinct.
- docs/FELICITY_NEXT.md lists the deferred Felicity and robustness work.

### Verified
- On the owner's real frame with real SAM boxes and the mat stretched to touch the towel: zones split, calibration valid, bowl observed. Unit 772; lint 0 errors; build; Playwright 52 passed / 1 skipped; live-setup page test 2/2 on the owner's dev server. Not yet verified on the owner's physical camera.

## 0.15.2 — 2026-11-04

### Fixed (root cause of "3/3 objects found; starting live setup" repeating with no tracking)
- When live setup started, the page terminated the still-loading Teach-based setup worker; that worker's late load error ran its `onerror`, which called `halt()` and killed the NEW live worker. A replaced worker can no longer halt the current one, and terminated workers have their handlers detached.

### Verified
- Real SAM 3.1 locate call (3 image requests, Meta API) on the owner's real camera frame: bowl 0.96, towel 0.98, mat 0.89, one instance each, 2.0 s. With those real boxes and the owner's real pixels, the production tracker sets up, keeps the bowl in the start zone, tracks it across the table and into the goal zone, calibration valid throughout (recorded frame with the bowl moved digitally, not a live camera).
- Moved-camera page test: 3/3 on the production build (was 0/3), 2/2 on the owner's dev server. Unit 771; lint 0 errors; Playwright 52 passed / 1 skipped. Not yet verified on the owner's physical camera.

## 0.15.1 — 2026-11-04

### Fixed (owner screenshots: "Tracking live … Waiting for the starting position"; bowl "found, not yet in its starting place")
- Live setup mapped small Teach-relative zone patches into the support object's box; with a different camera angle they landed on the wrong part of the towel, so Practice never armed although the bowl was tracked. A zone that belongs to a supporting object is now that object's whole live box ("on the towel", "on the mat").
- Calibration losses and identity losses are logged with their exact reason; the page respects the server's 20 s locate interval (no more 429 loops).

### Verified
- Owner's real camera frame: bowl in the start zone (whole towel) at setup, tracked across the table, in the goal zone (whole mat), calibration valid throughout. Moved-camera page test passes on the owner's dev server. Unit 771; lint 0 errors; build; Playwright suite (see report). Not yet verified on the owner's physical camera.

## 0.15.0 — 2026-11-04

### Fixed / added
- Owner console: live setup started, then "Tracking evidence keeps arriving too late" stopped Practice for good. Tracking costs 18-31 ms per frame on the owner's real frame; replies were late because every reply re-rendered the whole Practice page (slow in dev mode). Screen-only updates are now capped at 10/s; every reply is still verified (the 600 ms evidence rule is unchanged).
- Felicity supervisor: when evidence keeps arriving late or the tracker crashes, Practice no longer stays stopped; it re-locates the objects with SAM and restarts live setup (at most 4 times per 5 minutes), Gideon says so, and the console logs `[felicity] supervisor: …`. It never marks anything passed.
- `docs/EXTERNAL_REPO_ARCHITECTURE_RESEARCH.md`: read-only study of ten public repositories (no code copied).

### Verified
- Unit 87 files / 771 tests; lint 0 errors; build; Playwright 52 passed / 1 skipped (production build). The moved-camera live-setup page test also passes against the owner's dev server (16 s). Not yet verified on the owner's physical camera.

## 0.14.0 — 2026-11-04

### Fixed (root cause: automatic Practice never started on the owner's real camera)
- Practice setup was built from the Teach recording's pixels and positions. It could not work when the learner's camera differs in position, perspective, lighting, aspect ratio (laptop 16:9 vs Teach 4:3: `sameSize` skipped every reference) or object arrangement. The owner's console proved SAM found all 3 objects ("3/3 objects found") but the old design only used them for a global camera correction.
- New primary setup: when SAM 3.1 locates every approved object in the live frame, Practice calibrates on THAT frame (existing calibration path): objects from SAM boxes, appearance learned from the live camera, each zone moved with the object it belongs to in Teach (or the nearest object), and a textured background patch as the camera-motion reference. Works for any lesson's objects; no object names are hard-coded. The Teach-pixel setup only runs until SAM answers. Re-locates at most every 20 s per session.
- A mover resting on a fixed object (bowl on towel) is an approved nested pair in calibration too (same rule as automatic setup).
- Visible provenance for real model calls: console lines `[practice] sam-3.1 (Meta API): N requests in X ms` and `[felicity] Muse Spark Open (Baseten): …`; Network tab shows `/api/practice/locate` with a `provenance` field (no keys).
- Worker crashes now log their real message.

### Verified
- On the owner's real camera frame (cropped from the 12:36 screenshot, 16:9), with the towel and mat swapped relative to the Teach layout: live setup calibrates, the bowl is tracked in its start zone, moved across the table and observed in the goal zone, calibration valid throughout (recorded-frame check, not a live camera run).
- Browser test through the real page: camera placed differently from Teach (70 % scale, shifted), SAM mocked -> live setup -> step passed. Unit 87 files / 771 tests; lint 0 errors; build; Playwright 52 passed / 1 skipped (locate disabled; no paid calls).
- Not yet verified: a physical camera session in the owner's browser.

## 0.13.1 — 2026-11-04

### Fixed
- The camera locate step never ran in the real app: the page's handler effect re-assigned `automaticStart` on every render without it (only the initial ref value called it), so no SAM request or console line ever appeared. Now wired in the effect; every locate outcome is logged (`[practice] camera locate …`). Regression: a browser test asserts the real page reaches the locate step.
- Setup message names objects plainly ("Looking for the blue towel, the black mat in your camera view…") instead of long reviewed descriptions.

### Verified
- Unit 87 files / 771 tests; lint 0 errors; build; Playwright 51 passed / 1 skipped (locate disabled, no paid calls). Not yet verified with a real SAM call or physical camera.
- Known limit: the camera mapping assumes the same object arrangement as the Teach recording; swapping objects (towel and mat) is not supported yet.

## 0.13.0 — 2026-11-04

### Fixed (root cause: automatic Practice tracking never started on the owner's real camera)
- Practice matched approved objects only within ±48 px and ±15 % size of their Teach-video positions (`appearance-overlay.ts`), so a camera placed differently from the recording camera could never start automatic tracking. All earlier replays and browser tests fed the Teach video itself as the camera, which hid this.
- New one-time camera locate at Practice start: SAM 3.1 (Meta API) finds the approved objects in the learner's camera (one noun-phrase image request per object, in parallel; `/api/practice/locate`, same-site, one per camera session per 2 min, hourly limit, `PRACTICE_LOCATE_ENABLED=0` disables). At least two objects must agree on one camera mapping (scale + shift); live frames are then resampled into the Teach viewpoint in the tracker worker, so zones, references, tracking gates and the verifier are unchanged; boxes are drawn back on the live view. A large residual after mapping refuses that setup attempt. Same-viewpoint cameras start exactly as before (locate runs in parallel). No per-frame model calls.
- Practice layout: the goal/step card no longer covers the camera; the page fits 1440x900 and 1280x800 without scrolling.

### Verified
- Unit 87 files / 771 tests (new: moved camera fails the old setup and tracks after mapping; mapping agreement rules; locate route bounds with mocked SAM); lint 0 errors; build; Playwright 50 passed / 1 skipped (locate disabled, no paid calls); layout check at 1440x900 and 1280x800 (page height = viewport).
- Recorded-video replay: run 17's real bottle lesson with a simulated moved camera (75 % scale, shifted) and SAM-like boxes completes (armed, step passed, goal verified). Before: never armed.
- Not yet verified: a real SAM locate call and a physical camera.

## 0.12.0 — 2026-11-04

### Added (owner override: Felicity repairs, the creator only records and approves)
- Felicity tracking repair (`src/server/teach/felicity-repair.ts`): objects SAM lost long enough that no move is measured get re-anchored views from Muse Spark Open and one more SAM pass, kept only if it measures more. Before it, a free SAM retry from discovery's box alone.
- Felicity draft repair (`src/server/teach/repair.ts`): when drafting is rejected (paid run 20: invalid JSON twice) or leaves review issues, ONE bounded Spark request returns a small plan (steps as indexes into measured movement windows + goal); code builds the V3 draft and every existing validator decides. One Spark repair call per lesson (shared budget).
- Review page: one "Approve and practice" button; Felicity suggestions and technical details collapsed; creator sees one plain sentence.
- Diagnostics: rejected Spark JSON (head/tail), per-object measured windows.

### Verified
- tsc clean; Vitest 86 files / 766 tests; lint 0 errors; build; Playwright 50 passed / 1 skipped.
- Real data, no paid calls: run 20's recorded bowl tracking after Felicity re-anchoring has both narrated moves measured (20.4–21.5 s, 34.6–36.3 s); a repair plan builds a draft that passes every validator and approval (2 steps), with a Practice setup plan.
- Not working yet: offline Practice replay of that bowl lesson cannot find the white bowl at setup for most of the clip and loses calibration when the book (a reference) moves. Bottle lessons (runs 16/17) verify offline.

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
