# Phase 5 — local Practice mode

Status: implemented; automated tests, lint, type checking, production build and browser checks passed. The physical-camera demo remains an owner-run manual check. No live Meta calls are required or made by Practice.

## Files and data flow

- `src/app/practice/`: camera start/stop and calibration, zone overlay, approved lesson selection, current step/checklist, warning/recovery, source reference and event/latency display.
- `src/app/practice/use-camera.ts`: camera-only permission request, local 160×120 frames at up to 10 checks/second, stalled-frame/disconnect/hidden-tab handling, cancellation and track cleanup.
- `src/practice/tracker.ts`: RGB-to-HSV colour sampling and connected components. Saturation/value/hue gates, duplicate-colour rejection, size and edge checks. No network, learned model or dependencies.
- `src/practice/pipeline.ts`: approved-zone mapping, three-frame/400ms dwell, immediate uncertainty, typed observations and reset/retry events. Calls the existing `verifyEvents` evaluator without changing its rules.
- `src/practice/lesson.ts`: runtime validation for practice lesson data.
- `/api/teach/practice-lesson`: bounded, authenticated, non-paid endpoint validates the original Teach approval receipt and digest. Import must use the approving browser session; expired/new sessions require reapproval in Teach. No procedure rules are accepted from a language model in Practice.
- `tests/practice.test.ts`: synthetic pixel-to-evaluator tests, uncertainty/debounce/order/recovery tests, and signed-export import tests. Ordinary tests make no network calls.

The data flow is local camera → sampled colour blobs → normalized component centres/quality → approved zone IDs → debounced typed observations → deterministic evaluator → warning/checklist/timeline. The approved ProcedureSpec remains authoritative. Zone coordinates are a user-confirmed workbench calibration; zone IDs, thresholds, ordering and prerequisites are unchanged. Calibration is locked during verification.

## Grounding and uncertainty

Grounding associates each approved component ID with a user-clicked saturated colour region. Colours must be separated by at least 40 hue degrees. Each frame finds connected pixels within 18 hue degrees of the sample. A second substantial matching blob means ambiguous identity. Disappearing colour means missing; a clipped blob or area outside 80–120% of calibration means obstructed/changed geometry. A colour/area quality score must also meet the procedure's existing threshold. This score is a controlled-scene heuristic, **not a calibrated probability** or proof of an action.

One clear frame never establishes an action. A zone needs at least three fresh frames spanning 400ms. Uncertain detections immediately invalidate evidence; target reacquisition alone does not pass. The object must return to a clear starting zone and make a fresh supported transition. A short continuously visible trip through unassigned space can preserve a known start for up to 1.2 seconds; ambiguity, tracking gaps or longer transit invalidate it. A previously verified component leaving its target invalidates that and downstream steps. Duplicate/stale timestamps do not advance debounce.

SAM uses learned segmentation and point/box grounding in Teach. The local colour tracker has no general object understanding and cannot replace SAM for arbitrary scenes. For these distinctive colour markers, user grounding avoids an unnecessary remote request. Tracking failures ask for restored visibility or user recalibration, rather than silent model calls. No frame is sent to SAM, Spark, `/api/health` or another server in Practice.

## Lesson choice and references

Use **Save and open Practice** after approving in Teach, or import an unchanged approved Teach export after unlocking Teach in the same browser session. The direct handoff consumes a one-use local session-storage entry and validates the same receipt server-side. The signed receipt is verified on the server before the UI accepts it. Arbitrary JSON with an `approval` property does not bypass that check.

Alternatively, review the **hand-authored controlled fixture**, enter a reviewer name and explicitly approve it for this local demo. This approval is an actual UI action; the synthetic approval in the test fixture is replaced. The UI does not claim that Meta generated or approved this fixture. Its three observable transitions are blue base placement, yellow support placement after the base, and red latch marker movement after support verification. The last transition has an explicit forbidden-before-support rule.

The fixture has synthetic source timestamps and no actual teaching recording; its reference panel honestly says the frame is unavailable. To display a real teaching reference, use a Teach-approved lesson and select the unchanged original MP4 locally. Size/duration are checked and the user must confirm identity; this is not a cryptographic media identity check. The panel extracts the relevant step/recovery frame at its source timestamp. The video remains browser-local; stale/failed extractions do not show an unrelated frame.

## Speech, privacy and limits

SpeechSynthesis reads only the approved step or approved recovery instruction. It is optional, cancellable and reports failures; no generated spoken corrections are used. Browser/system voice availability and any underlying speech-service behavior vary; text remains available.

Camera activation is explicit and visibly indicated. No microphone is requested. Stop, disconnect, tab hiding and unmount end tracks. A 600ms stale-frame gap pauses capture and requires a new calibration. Camera frames are not recorded. Structured logs can be downloaded with procedure, calibrated zones, typed input events, results and latency samples. Download before beginning another session; a new session replaces in-memory progress. Reset/retry cannot set success and require new evidence. Sessions stop at 9,500 observations to bound replay cost.

This is a fixed-camera, stable-lighting workbench MVP. Remove similar colours, keep markers fully visible and use visibly distinct open/closed marker positions. Occlusion detectors are conservative heuristics: they cannot guarantee detection of all partial occlusions or camera motion. A coloured marker entering a zone establishes only that approved visible condition. It does not prove a hidden latch engaged, installation quality, force, torque, soldering quality, safety or arbitrary hand gestures.

## Manual physical-camera acceptance

1. Open `/practice` over HTTPS (or localhost), select an approved Teach export or explicitly review/approve the controlled fixture.
2. Start the real camera, confirm its indicator, fix it above the workbench and ground each component by clicking its solid colour centre. Draw each zone as needed; place all components in their starting zones. Confirm calibration and begin.
3. Hold the starting state steady, then place blue, yellow and red in their targets in order. Hold positions for at least 400ms and leave already verified components visible. Check all three pass.
4. Reset, restore starting positions, confirm and begin again. Move the latch marker into its target before installing support. Verify the **actual evaluator** displays a forbidden-transition warning naming `install-support`, approved recovery text and a timestamped event.
5. For a Teach lesson, load/confirm its original MP4 and check the recovery reference frame. The fixture intentionally has no real reference frame; do not present its synthetic timestamps as training evidence.
6. Retry the failed step, reopen the latch/return its marker to the starting zone, verify base and support, then close it again. Check advancement. Leaving it already closed must not pass a retry.
7. Cover/remove a component, add a duplicate-colour distractor, and briefly move across a target. Check Cannot Verify/no pass. Restore directly in the target: it must still require a fresh start-to-target transition.
8. Stop the camera and verify the hardware indicator turns off. Also test permission denial, tab hiding and restart/recalibration.
9. Download the session log and report the measured detected-change-to-warning times. The two animation callbacks approximate a painted warning; they do not measure physical-action onset or display hardware latency. No sub-second physical-demo claim is made without those data.

## References

- [Camera permissions and secure contexts](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Browser SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)

## Verification record

- **146 Vitest tests passed** across five files: 18 new Practice cases and 128 existing cases. Tests cover pixel frames through the evaluator, correct/wrong order, missing base, forbidden latch, transient noise, stale/duplicate frames, low scores, ambiguous/obstructed/missing evidence, short transit versus frame gaps, downstream invalidation, retry/reset, unused declared zones, event bounds and tampered/unapproved/unauthenticated lesson imports. No automated test calls a model.
- `npm run lint`, `npm run typecheck`, and the final `npm run build` passed. The build includes `/practice` and the non-paid approval-receipt validation route.
- Headless Chromium used a **generated canvas camera stream**, not a physical camera. The production walkthrough exercised actual browser capture plumbing, colour segmentation, debounce, typed events and the unchanged evaluator. Premature latch produced the actual forbidden-rule warning naming the support prerequisite. Returning to start, verifying base/support, and closing again passed. Missing base invalidated downstream steps; restoring it directly into its target did not pass. Reset cleared progress; Stop ended all tracks. No browser exceptions or remote perception requests occurred.
- Detected target candidate → rendered warning: **439ms development**, **426ms final production browser**. These are two synthetic-camera measurements, not a real-camera latency guarantee. The UI records timing per warning and includes it in downloadable logs.
- Separate browser checks passed denied permission and cancellation while permission was pending; a late stream after cancellation had all tracks ended.
- Source-frame browser check used a **mocked import response** and the existing real local MP4 solely for decoding. It displayed the requested 1.000s source frame. This does not claim a new real human approval or that the recording teaches the controlled fixture. Signed-import server validation is covered separately by tests.
- The existing Teach browser regression walkthrough passed with mocked provider responses: consent, visible file chooser, preview before upload, review gates, export/edit invalidation, fake-device REC/Done and track cleanup. No new live Meta calls were made.
- No `/dev/video*` physical camera device is available in this workspace. The physical-camera blue/yellow/red demo, real lighting/occlusion robustness, actual training-reference alignment and physical-demo latency remain owner-run manual checks using the steps above. No physical workbench success is claimed.
