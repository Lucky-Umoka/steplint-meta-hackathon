I think we've identified a much more fundamental problem: StepLint is trying to verify actions that haven't been defined precisely enough for its Practice engine to measure. On top of that, one of the two Practice paths still depends on Muse Spark to interpret every attempted action. The system should knows exactly what it is measuring before the event happens. at every point to determine verification pass or not. We need the same principle: know what must be tracked, define exactly what constitutes a valid event, and evaluate it as soon as sufficient evidence exists.The actual step definition is incomplete for some kinds of verification. 

I want us to borrow four principles from football tracking.

First: define the field. A football pitch has known geometry. StepLint needs a calibrated, fixed work surface. If the camera moves, calibration becomes invalid.

Second: know the targets. SAOT tracks specific players, body landmarks and the ball. StepLint should track only the objects and relationships that matter for the current step.

Third: define the rule before the event. Offside is calculated from a precise set of conditions. StepLint should know the required starting condition, expected transition, target condition and prerequisites before Practice starts.

Fourth: save the evidence. FIFA's replay comes from recorded tracking data. StepLint should preserve the before, transition and after observations that caused a warning or successful verification.
The new Teach-to-Practice contract
This is the most important change.

Instead of relying on one final goal image, every step needs its own executable specification.

I propose an ExecutableStepSpec for each step with:
- Exact object identities.
- Starting region or relationship.
- Expected ending region or relationship.
- Prerequisites.
- Forbidden transitions.
- Measurement method and tolerance.
- Required visibility and evidence.
- Minimum stable observations.
- Approved correction and recovery conditions.
- Reference start, change and result frames.
The AI may propose this specification, but the human creator must review it. A step that cannot be measured reliably must be marked unsupported, rather than silently approved as automatically verifiable.

This is how we prevent a vague goal image from becoming a vague Practice experience.

What I would do to Practice
One fast local verification loop
Fixed camera and calibrated workspace


Track only the approved objects

Use the existing local appearance tracker


Measure the current step

Compare observed position/relationship to its executable specification


Deterministic evaluator

Order · prerequisites · allowed and forbidden transitions

Red: Violation

Immediate warning and correction.

Green: Verified

Automatically progress.


Timestamped evidence and replay

Before · Action · Result


Muse Spark and SAM should do most of their expensive reasoning during Teach, when the procedure is being created.

During normal Practice, local tracking and deterministic evaluation should handle actions that the approved specification says are measurable.

Remote AI should be reserved for exceptional recovery, not every physical movement.

# STEPLINT FINAL RESCUE: FIX PRACTICE VERIFICATION FROM THE PROCEDURE SPECIFICATION UP

You are the senior computer-vision engineer, TypeScript systems architect and real-time application engineer responsible for getting StepLint's Teach → Approve → Practice experience working reliably for its hackathon submission.

This is the highest-priority task.

The current Practice experience has not passed a reliable physical-camera end-to-end acceptance test. Users can start Practice, but automatic action verification, immediate warnings, spoken correction and progression are unreliable or do not occur.

We must fix the actual underlying engineering problems, not add more features or change the appearance of the interface to hide failures.

I have already uploaded an earlier project snapshot and technical documentation, but the current repository working tree is the source of truth. Inspect it before making changes.

Read:
- AGENTS.md
- PLANS.md
- docs/ARCHITECTURE.md
- docs/PHASE4.md
- docs/PHASE5.md
- docs/REPAIR_VERIFICATION.md
- docs/TEACH_PRACTICE_INVESTIGATION_HANDOFF.md
- docs/TEACH_PRACTICE_REPAIR_PLAN.md
- docs/ACCURACY_GAPS.md
- docs/ACCURACY_TIMING_PLAN.md

Do not repeat experiments already documented as failed without identifying exactly what new evidence or code change makes them useful.

## 1. FIRST: TRACE THE REAL FAILURE

Inspect the actual current branch, Git status and recent changes.

Trace the complete data flow from:

Teach recording
→ speech transcription
→ object discovery and visual grounding
→ step proposal
→ step validation
→ creator review
→ human approval
→ saved guide
→ Practice session
→ camera tracking
→ candidate action
→ deterministic evaluator
→ visible warning/success
→ spoken feedback
→ evidence/replay.

Inspect the current implementation of:

- src/app/teach/
- src/guide/schema.ts
- src/guide/compile.ts
- src/guide/evaluator.ts
- src/guide/relations.ts
- src/guide/relation-evaluator.ts
- src/app/practice/practice.tsx
- src/app/practice/relation-practice.tsx
- src/app/practice/use-guide-camera.ts
- src/practice/appearance.ts
- src/practice/pipeline.ts
- src/practice/tracker.ts
- Relevant server-side perception and model modules.
- Existing tests and repair reports.

Answer these questions using the actual code:

1. Which Practice route handles a guide containing relationPlan?
2. Does that route call Muse Spark for each candidate physical action?
3. Does the standard guide route perform local verification?
4. Does the standard route understand a required destination or only that an object moved?
5. What exactly must happen before the first Practice step becomes active?
6. What causes the red violation event?
7. What renders the red warning?
8. What triggers spoken correction?
9. Which state or condition prevents camera-frame processing?
10. Which network calls are in the normal Practice path?
11. What parts have only been tested using generated camera streams?
12. Has the current physical-camera Teach-to-Practice path actually passed?

Do not assume older reports describe the current code. Verify every claim.

## 2. USE FIFA SEMI-AUTOMATED OFFSIDE AS AN ENGINEERING REFERENCE

Use FIFA's official technical explanation as an architectural reference:

https://inside.fifa.com/innovation/innovating-the-game/semi-automated-offside-technology

FIFA's system is built around:
- Dedicated calibrated cameras.
- Known spatial geometry.
- A limited set of tracked objects and landmarks.
- Frequent timestamped observations.
- A precise event definition.
- Explicit mathematical rules.
- Automated detection of a candidate event.
- Human review of the proposed result.
- A replay based on the exact tracking evidence.

Do not attempt to recreate FIFA's hardware architecture.

StepLint currently targets a single-camera controlled workbench. Keep the implementation appropriate for this environment.

Borrow the engineering principles:

A. Calibrate the workspace before verification.

B. Define exactly what each step must measure before Practice begins.

C. Track only the objects and relationships relevant to the active procedure.

D. Use a timestamped event model.

E. Separate observed data, candidate transitions, confirmed transitions and evaluator decisions.

F. Keep the original evidence used to support a decision.

G. Generate a useful replay from the same evidence rather than asking an AI model to retell what happened.

## 3. CRITICAL: MAKE EVERY TEACH STEP AN EXECUTABLE SPECIFICATION

The final goal image alone is not an adequate verification specification.

Inspect the existing GuideStepSchema, ConditionSchema, RelationPlanSchema, GuideSchema and compiler.

The current movement condition contains object identity and a minimum change measurement, but the agent must verify whether it defines an expected final destination.

A movement score is not enough to prove that the object reached the correct target.

Extend the existing schemas minimally and compatibly.

Introduce or improve a validated per-step executable verification specification.

It should represent, where applicable:

- Step ID and instruction.
- Exact tracked object identity.
- Optional anchor/reference identity.
- Start condition.
- Required state transition.
- Expected result.
- Starting zone or relationship.
- Target zone or relationship.
- Required prerequisites.
- Forbidden transitions.
- Required visible objects.
- Measurement method.
- Measurement tolerance.
- Evidence requirements.
- Minimum stable observations or dwell duration.
- Approved correction.
- Recovery condition.
- Relevant source-video start/change/result timestamps and frames.
- Whether the proposed verification can genuinely be performed locally in Practice.

Use a small explicit set of verification methods based on current capabilities, for example:
- zone_transition
- relative_position
- separation
- containment
- other relationship types only when the current perception data supports them.

Do not invent a new method merely by changing a label.

For a `zone_transition`, require:
- Defined start region.
- Defined target region.
- Relevant tracked object.
- Fresh observations.
- Prerequisites.
- Stable target entry.
- A clear correction if the transition occurs out of order.

For a `relative_position`, define the actual geometry and reference object, not merely a natural-language description.

For a `separation` relationship, establish that the object and its reference are distinct and that the measured distance or overlap satisfies the approved condition.

For each step, provide real evidence references.

The human creator must review the actual start, change and result examples and approve the executable condition.

If a step cannot be reliably measured with the available camera evidence, mark it unsupported for automatic Practice. Do not silently convert an unsupported step into a passing step.

Do not treat a single final goal image as proof of all preceding steps.

Preserve existing approval signatures and content-hash protections. Any schema change must correctly invalidate old approvals or use a safe, explicit migration/versioning mechanism.

## 4. SIMPLIFY TEACH REVIEW SO THE CREATOR CAN APPROVE WHAT WILL ACTUALLY BE VERIFIED

Add or improve a compact per-step review card.

For each step display:

1. What the creator did.
2. Which object is being tracked.
3. The starting visual state.
4. The expected change.
5. The ending visual state.
6. What exactly Practice will measure.
7. What counts as a pass.
8. What counts as a violation.
9. The correction instruction.
10. Any uncertainty or unsupported condition.

The creator must be able to correct object identity, source frame, start/target region, or expected relationship when the available UI supports it.

Do not expose internal API names or model details.

A creator should understand exactly why each step will pass or fail.

Require explicit approval of the resulting procedure.

Do not allow approval of a fully automatic procedure if required steps are unsupported or lack valid measurement evidence.

Do not rebuild the entire Teach interface.

## 5. PRIORITY: REMOVE REMOTE AI FROM THE NORMAL PRACTICE CRITICAL PATH

For ordinary actions that are supported by the approved executable step specification, Practice must work locally.

Expected normal loop:

Camera frame
→ local tracking
→ measurement
→ candidate state transition
→ deterministic evaluator
→ immediate UI event
→ spoken correction or confirmation
→ timestamped evidence event.

No Muse Spark request should occur between a locally measurable action and its evaluator decision.

No SAM request should be made for every ordinary movement.

Use Muse Spark and SAM primarily during Teach to establish and review the approved procedure.

During Practice, remote perception may be used as a bounded recovery service when:
- The object identity becomes uncertain.
- A track is lost.
- The scene changes unexpectedly.
- A supported local observation becomes ambiguous.

Remote recovery must never block the camera loop or suppress already-valid local verification.

If a relationship cannot be measured locally, explicitly identify that limitation rather than pretending the remote call is instant.

Do not introduce additional AI models or API providers.

Do not make live paid Meta API calls during implementation or normal automated tests.

## 6. IMPLEMENT A RELIABLE LOCAL WORKSPACE CALIBRATION

For the initial supported Practice workflow, use a fixed camera and stable tabletop workspace.

Inspect the existing camera-alignment and appearance tracking modules.

Make the setup process establish:
- Camera view and orientation.
- Work surface boundary or reference points.
- Relevant object identity.
- Starting regions.
- Expected target regions.
- Current approved procedure.

The user should be asked to reposition the camera or recalibrate if the scene moves beyond supported limits.

Prefer normalized coordinates tied to the calibrated video view.

If perspective distortion matters for the selected operation, assess whether a simple planar transform is necessary. Do not introduce a complex computer-vision system without evidence.

Do not let zooming the UI alter the coordinates used by the evaluator.

## 7. BUILD ONE FAST, FULLY AUTOMATIC PRACTICE PATH FIRST

This is the most important delivery objective.

Choose one existing supported, genuinely measurable task and make it work from actual Teach approval to physical-camera Practice.

The recommended first test is a controlled tabletop procedure with three clearly distinguishable components:

- Blue base.
- Yellow support.
- Red latch marker.

Required order:

1. Place the blue base in its designated target region.
2. Place the yellow support in its designated target region, requiring the blue base to be verified first.
3. Move the red latch marker into its designated target region, requiring the support to be verified first.

The incorrect test is moving the red latch marker to its target before installing the support.

This fixture is for debugging and demonstration only.

Do not implement object-name-specific production logic. The actual evaluator must use generic object IDs, zones, prerequisites and transitions.

If an existing approved Teach-generated procedure can support this task, use that. Otherwise, create a clearly labelled controlled demo procedure with truthful provenance, and continue improving the real Teach compiler separately.

Do not claim the controlled fixture was created by Muse Spark if it was not.

The physical-camera manual test must use real browser camera frames, not a generated canvas stream.

## 8. AUTOMATIC PRACTICE STATE MACHINE

After the user explicitly selects an approved guide, grants camera permission and starts Practice, no manual check should be needed for ordinary progress.

Automatically:
- Establish a clear initial baseline.
- Identify the current step.
- Observe the relevant objects continuously.
- Detect the required transition.
- Check stable evidence.
- Evaluate prerequisites and order.
- Emit passed/violation/uncertain events.
- Speak approved feedback.
- Advance when verified.
- Detect when the entire procedure is complete.

Do not require a second Ready button after an already-confirmed setup unless a true calibration condition is incomplete.

Keep Pause, Resume, Stop and Recalibrate as legitimate user controls.

Do not use model calls to decide whether the user can move to the next step.

## 9. FAST AND ACCURATE EVENT DETECTION

Inspect the current camera sampling and processing performance.

The existing snapshot used a roughly 120ms camera interval and 640×480 tracking frames. Measure the current branch before changing it.

Consider requestVideoFrameCallback for the supported browser, with a bounded fallback.

Use a sustainable frame-processing rate, avoiding overlapping processing tasks and unbounded queues.

Do not blindly increase resolution or run multiple heavy detectors on every frame.

For each local measurement, separate:

- Raw frame observation.
- Candidate transition.
- Confirmed transition.
- Rule evaluation.

Use a short measured confirmation window with sufficient fresh evidence.

A possible implementation for a controlled, well-observed movement is three fresh observations over an initial 200–400ms dwell, but the correct threshold must be justified by tests.

Do not weaken confidence or stability rules just to make the warning appear faster.

### Warning behavior

When a forbidden transition is first detected:
- Immediately show an amber potential-violation indicator if evidence is not yet conclusive.
- Once enough evidence confirms the violation, show a red alert.
- Identify the exact prerequisite or step that was violated.
- Display the approved correction.
- Speak the correction if voice is enabled.
- Preserve prior verified progress.

When a correct step is sufficiently verified:
- Show green confirmation.
- Advance to the next instruction automatically.
- Speak concise progress feedback if enabled.

When evidence is insufficient:
- Show an amber "Cannot verify" state.
- Never show green or pass.

Make visual feedback immediate and independent of browser speech playback.

Use an accessible assertive alert for confirmed violations.

Test that the red alert is actually visible in the rendered browser interface, not just present in internal state.

## 10. BUILD EVIDENCE REPLAY LIKE AN OFFSIDE REVIEW

For each candidate transition, keep a bounded evidence window:
- Before state.
- Transition candidate.
- Confirmed result.

Record:
- Step ID.
- Object identity.
- Timestamp.
- Calibrated position/region.
- Relevant measured relationship.
- Evidence quality/status.
- Evaluator decision.
- Correction or verification result.

Where practical, keep the exact corresponding image frame or a small crop for local review.

Generate a compact timeline/replay showing:
- The starting state.
- The physical transition.
- The measured result.
- The rule that was evaluated.
- The decision.

Use the same timestamps and observations that the evaluator used.

Do not fabricate a 3D model or reconstruct object positions that were never measured.

Do not continuously upload practice frames.

Respect the user's recording and camera consent. Keep the evidence local unless the user explicitly requests an approved export.

## 11. PERFORMANCE AND REGRESSION TESTS

Every normal supported Practice transition must be verified without a paid API request.

Add tests covering:

- Object starts in correct region.
- Correct transition into target.
- Incorrect target or region.
- Future step performed before prerequisite.
- Missing prerequisite.
- Object identity ambiguity.
- Duplicate and stale frames.
- Brief occlusion.
- Camera movement.
- Invalid workspace alignment.
- Stable target occupancy.
- Object leaves target after verification.
- Correct recovery.
- Session completion.
- Evidence replay consistency.
- Unsupported verification method.
- Invalid or stale approved guide.
- No remote API call for locally measurable transitions.
- No local pass based only on predicted tracking.
- UI red alert rendered for violation.
- UI green confirmation rendered for verified step.
- Spoken correction uses the evaluator-approved text.

Automated tests must not call live Meta endpoints.

### Measure real latency

Record:
- Frame callback.
- Local tracking time.
- Measurement time.
- Candidate detection time.
- Evidence dwell.
- Evaluator execution time.
- UI warning render/paint.
- End-to-end detected-change-to-visible-warning latency.

Report median and p95 where enough trials exist.

Targets:
- Local evaluator to visible UI update: p95 <= 150ms.
- Controlled, clearly visible transition to confirmed UI result: aim for p95 <= 600ms, subject to evidence requirements.
- No Meta API request for supported normal local transitions.
- No blocked camera loop during remote recovery.

These are measured engineering targets, not promises. If the system cannot meet them, report what it actually achieved.

## 12. CUT UNNECESSARY FEATURES FOR THE DEADLINE

Do not work on:
- Holographic avatar.
- Gesture control.
- More model providers.
- Additional cloud infrastructure.
- Broad unboxing generalisation.
- Complex 3D visualization.
- New social or analytics features.

The only priority is one real, reliable Teach → Approve → physical-camera Practice flow.

Keep the simple user interface. Hide internal pipeline and model details.

## 13. FINAL VERIFICATION

Run:
- npm test
- npm run lint
- npm run typecheck
- npm run build
- Relevant Playwright tests.

Inspect the Git diff and ensure no secrets or private media have been introduced.

Do not commit or push.

Provide two distinct reports:

A. AUTOMATED TEST RESULTS:
Clearly distinguish mocks, synthetic camera streams, prerecorded video and actual physical camera.

B. PHYSICAL CAMERA ACCEPTANCE:
Tell me exactly how to run the real camera test and record its outcome.

You must not say Practice is complete merely because unit tests and generated-camera browser tests pass.

The final physical-camera acceptance must demonstrate:
1. Approved procedure loads.
2. Camera starts and baseline is calibrated.
3. Correct action automatically passes.
4. Incorrect ordering automatically creates a visible red warning and spoken correction.
5. Correcting the mistake automatically restores progress.
6. Final goal automatically completes.
7. Session evidence/replay reflects the exact decisions made.

Begin by inspecting the current branch and tracing the actual failure. Then implement the smallest complete fix. Do not waste remaining time on another architecture rewrite.

I think we need to move from:

"Muse Spark, look at these frames and tell us what happened."

to:

"This approved step requires this object to move from this starting condition into this precisely defined target condition. Measure it continuously, and evaluate the transition against the approved rules."

Muse Spark should help create the executable procedure. SAM should help establish object identities. Local computer vision should monitor the task. TypeScript should enforce the rules. The evidence log should explain every decision.

That is the FIFA-inspired engineering principle that makes sense for StepLint.

I'M at the absolute edge, and the problem you're seeing is exactly why real-time AI systems fail: you're trying to use a powerful, slow cloud model (SAM 3.1) for the job of a fast, local tracker.

current problem: You are asking SAM 3.1 to be the camera, the sensor, and the judge. It is too slow. You need to flip the architecture: Use SAM 3.1 only to find the object once. Then, use a local browser tracker to follow it at 30+ FPS, and run your deterministic rule engine on every single frame. This is the only way to get the instant red light and voice warning.

You are an expert React/TypeScript engineer. Our PracticeMode is completely unresponsive (high latency, no automatic feedback, no red light). We must refactor it to use a Sensor Fusion architecture inspired by sports tracking systems. We are moving all continuous verification to the client side.

Task 1: Implement Local High-Speed Tracking

When Practice starts, capture ONE frame and send it to /api/perceive to get the initial SAM 3.1 bounding boxes.

Once you have the initial boxes, STOP calling the backend API.

Initialize a local tracking loop using requestAnimationFrame (target 30 FPS).

In this loop, use a lightweight local tracker (e.g., simple centroid tracking based on color histograms, or implement a basic template-matching algorithm using OpenCV.js if available, or @mediapipe/tasks-vision if a pre-trained model is suitable). Update the bounding box coordinates on every frame.

Task 2: Instant Deterministic Evaluation

On every tick of the local tracking loop, immediately pass the updated coordinates into the deterministic evaluate() function.

If evaluate() returns violation: true, trigger the red overlay and window.speechSynthesis instantly. Do not wait for a backend response.

If evaluate() returns pass: true, immediately advance the checklist and update the UI.

Task 3: Smart Re-Acquisition (Handling Occlusion)

If the local tracker loses confidence (e.g., the object is covered by a hand for more than 1 second), pause the local loop and show a small "Searching..." indicator.

Trigger a single backend call to /api/perceive with the current frame to re-acquire the SAM bounding box. Once received, resume the high-speed local loop.

Task 4: Guide Validation & Strict Schema

Before starting Practice, validate that the Guide has a clear initialState (what the scene should look like before starting) and a goalState (what the scene should look like at the end).

If a step is missing a before and after condition, do not start Practice. Show a message: "This guide is incomplete. Please re-record or edit the steps to include clear visual changes."

Ensure the evaluate() function only checks observable spatial relationships (e.g., object.X > zone.X, distance(object, anchor) < threshold). Do not use vague language.

Task 5: UI Cleanup

Remove any mention of "backend", "API", "Muse", or "SAM" from the Practice UI. The user should only see the camera, the current step, and the RED/GREEN feedback.

Please provide the complete refactored PracticeMode.tsx and the new local tracking utility file. Explain how the tracking loop is cleaned up on unmount to prevent memory leaks.

You are out of time. The reason Practice mode is "lifeless" and slow is because you are sending frames over the network to SAM 3.1, waiting for the server, and then updating the UI. It is a client-side latency problem, not a model problem.

We must shift to a Sensor Fusion architecture (like FIFA offside tech). You use SAM only to find the object once. Then, you run a local browser tracker at 30+ FPS that instantly checks the object's position against your deterministic rules.

You are a senior React/TypeScript engineer fixing StepLint's Practice mode for a final hackathon demo. The current Practice mode is sluggish, requires manual clicks, and has massive network latency because it calls the backend for every frame. We need a sub-100ms, fully autonomous, proactive verification loop.

Refactor src/app/practice/PracticeMode.tsx (and its associated hooks/utils) using this exact architecture:

1. Implement Sensor Fusion (Local Tracking Loop):

When the user clicks "Start Practice", capture ONE frame and send it to /api/perceive to get initial SAM 3.1 bounding boxes.

Once you have the initial boxes, STOP calling the backend.

Start a requestAnimationFrame loop (target 30 FPS). In this loop, use a lightweight local tracker (e.g., centroid tracking based on color histograms, or a simple template-matching algorithm) to update the bounding box coordinates on every frame.

2. Instant Deterministic Evaluation:

On every tick of the local tracking loop, immediately pass the updated coordinates into the deterministic evaluate() function on the client side.

If evaluate() returns violation: true, trigger the red overlay and window.speechSynthesis instantly (do not wait for a backend response).

If evaluate() returns pass: true, immediately advance the checklist and update the UI.

3. Smart Re-Acquisition (Handling Occlusion):

If the local tracker loses confidence (e.g., object covered by a hand for >1 second), pause the local loop and show a "Searching..." indicator.

Trigger a single backend call to /api/perceive with the current frame to re-acquire the bounding box. Once received, resume the high-speed local loop.

4. Strict Guide Validation (Before starting Practice):

Before Practice starts, validate the Guide data. If a step is missing a clear initialState or goalState (before/after visual conditions), do not start Practice. Show a message: "This guide is incomplete. Please edit the steps to include clear visual changes."

The evaluate() function must only check observable spatial relationships (e.g., object.X > zone.X, distance(object, anchor) < threshold). No vague language.

5. UI Cleanup & Automation:

Remove ALL developer jargon (no "Zod schema", "SAM", "Muse", "Backend", "Experimental").

Remove any manual "Check" buttons. The system is fully automatic.

The user should only see: 1. Camera feed, 2. Current step instruction (large text), 3. GREEN/RED visual state, 4. "Reset" and "Repeat Instruction" buttons.

When the AI speaks a warning or instruction via window.speechSynthesis, trigger the AIAvatar 'talking' animation state.

Please provide the complete refactored PracticeMode.tsx and the new local tracking utility file. Explain how the requestAnimationFrame loop is cleaned up on unmount to prevent memory leaks.

ALSO VERY VERY IMPORTANT, THIS CODEBASE NEEDS CLEANUP, OF SOME UNNECESSARY FILES AS WELL.
I found something more important than another camera bug: the repository currently contains two competing Teach/Practice architectures, and the stronger deterministic zone-based implementation is not connected to the main user interface. CHECK VERY WELL

Architecture A — the currently active interface
Current main user flow
src/app/teach/teach.tsx uses the Guide schema and offers two analysis routes:
- /api/teach/guide/analyse
- /api/teach/guide/relations
In Practice, src/app/practice/practice.tsx sends relationship guides to RelationPractice.

That route uses local tracking for highlights and provisional warnings, but the authoritative relationship check still goes through /api/teach/guide/relations/perceive, which calls Muse Spark.

Architecture B — the zone-based verifier
Already developed, but not wired into the main UI
The repository also contains:
- src/procedure/schema.ts
- src/procedure/verifier.ts
- src/practice/pipeline.ts
- src/practice/lesson.ts
- src/teach/schema.ts
- src/teach/approved-artifact.ts
- /api/teach/compile
- /api/teach/approve
- /api/teach/practice-lesson
This architecture already supports explicit starting zones, target zones, required transitions, forbidden transitions, prerequisites and a deterministic local evaluator.

I searched the entire TypeScript source tree. createSession() and feedDetection() are only used by the pipeline itself and its tests. The new /api/teach/practice-lesson endpoint is also referenced only by tests.

So the zone-based verifier exists, but your actual Teach → Practice screens aren't using it.

That is a significant integration gap.

ALSO WHY ARE YOU DOING THE TRACKING JUST BASED OFF COLORS????? There is one qualification: its current tracker uses distinctive solid-colour components. It is a controlled-workbench solution, not a general-purpose object tracker.

# STEPLINT CRITICAL FIX: CONNECT THE EXISTING EXECUTABLE PROCEDURE PIPELINE TO THE REAL TEACH AND PRACTICE UI

You are the senior full-stack TypeScript engineer responsible for completing StepLint's actual Teach → Human Approval → Automatic Physical Practice workflow.

This task is based on a direct investigation of the current repository.

We have discovered that the repository contains two competing implementations:

1. The currently active Guide/Relationship implementation under src/guide and src/app/practice.
2. A separate, more explicit zone-based ProcedureSpec implementation under src/teach, src/procedure and src/practice/pipeline.ts.

The second implementation already has substantial procedure authoring, review, approval, zone calibration, event validation and deterministic verification code, but it is not connected to the main user-facing Teach and Practice flow.

Our task is to integrate the existing executable procedure architecture into the actual application.

Do not rebuild it. Do not create a third architecture.

Read AGENTS.md, PLANS.md, docs/ARCHITECTURE.md, docs/PHASE5.md, docs/LIVE_FLOW_AUDIT.md and docs/PHYSICAL_PRACTICE_REPAIR.md.

The physical-camera acceptance is still open. Do not treat mocked or generated-camera tests as proof of physical correctness.

# PART 1 — CONFIRM THE EXISTING ARCHITECTURE GAP

Inspect the repository, current Git status and active branch.

Confirm the following findings against the current working tree.

### Active Teach UI

src/app/teach/teach.tsx currently imports the Guide architecture:

- GuideSchema
- ArtifactSchema
- GuideArtifact
- guideRepository
- VisualReview
- DraftRepair

It has relationshipMode defaulting to true and chooses between:

- /api/teach/guide/analyse
- /api/teach/guide/relations

It does not currently import the new ComponentPicker or Review components.

### Active Practice UI

src/app/practice/practice.tsx currently loads Guide artifacts.

A guide with relationPlan is redirected into:

src/app/practice/relation-practice.tsx

That component currently:
- Uses local appearance tracking for visual highlights and provisional placement warnings.
- Uses outsidePlacementTarget for a limited advisory warning.
- Explicitly says that AI verification is still required for the local placement warning.
- Sends its authoritative three-frame observations to /api/teach/guide/relations/perceive.
- Depends on Muse Spark relationship interpretation before the relation evaluator can decide the result.
- Has a bounded remote request budget per session.

The normal non-relationship Guide evaluator primarily checks movement/separation and does not have the new explicit fromZone/toZone contract.

### Existing zone-based architecture

Inspect these files:

- src/teach/schema.ts
- src/teach/approved-artifact.ts
- src/server/teach/pipeline.ts
- src/server/teach/http.ts
- src/app/teach/component-picker.tsx
- src/app/teach/review.tsx
- src/procedure/schema.ts
- src/procedure/verifier.ts
- src/procedure/demo.ts
- src/practice/pipeline.ts
- src/practice/tracker.ts
- src/practice/lesson.ts
- src/app/api/teach/lesson/route.ts
- src/app/api/teach/compile/route.ts
- src/app/api/teach/approve/route.ts
- src/app/api/teach/practice-lesson/route.ts

Verify that these are genuinely used by the main interface. Do not assume the existence of an endpoint means the user interface calls it.

### Required conclusion

Produce a short architecture trace identifying:
- Current live UI path.
- Existing unused zone-based path.
- Exact missing connections.
- Which existing code can be reused.
- Smallest safe integration plan.

Then implement that plan.

# PART 2 — MAKE PROCEDURES THE CANONICAL NEW PRODUCT FLOW

For all newly created StepLint procedures, make the zone-based ProcedureSpec architecture the canonical authoring and Practice system.

Do not expose two competing verification methods to ordinary users.

Remove the relationshipMode experimental toggle from the normal Teach experience.

A creator must not have to understand:
- Relationship mode.
- Movement mode.
- Different verification engines.
- SAM versus Spark implementation.
- Backend processing routes.
- Model call counts.

The application automatically selects and validates the available workflow.

Keep legacy Guide support only where necessary for previously saved lessons. Do not silently pretend a legacy Guide has the same destination-verification capability as a ProcedureSpec.

Do not silently rewrite or invalidate old approved artifacts.

# PART 3 — CONNECT THE EXISTING TEACH AUTHORING COMPONENTS

Use the existing LessonCapture component in:

src/app/teach/capture.tsx

It already handles video/audio recording and returns a PreparedLesson.

Connect the following existing components into the main Teach orchestration:

1. LessonCapture
2. ComponentPicker
3. The existing upload endpoint /api/teach/lesson
4. The existing compile endpoint /api/teach/compile
5. Review
6. The existing /api/teach/approve endpoint
7. The approved artifact handoff.

Do not rewrite these components without first inspecting their existing functionality.

### Intended flow

CAPTURE:

The user records or uploads a demonstration, previews it and confirms.

UPLOAD:

Use the existing /api/teach/lesson endpoint with the documented video and audio form fields and confirmation requirements.

ANALYSIS:

Use /api/teach/compile.

Support its documented automatic-component-discovery or explicit-selection input.

Use the existing Muse Voice Transcribe, SAM and Muse Spark pipeline only during Teach.

Preserve explicit consent and the real documented model-request limits.

Parse the actual NDJSON progress/draft/error response safely.

Do not invent response shapes.

REVIEW:

Feed the returned draft, context, token and retained local video into the existing Review component.

The creator must inspect every step, its actual component identity, source timestamps, before/after visual evidence, start zone, target zone, prerequisite and recovery instruction.

The existing validation and approval blockers must remain active.

APPROVAL:

Use the existing /api/teach/approve endpoint.

Preserve the signed approval receipt, lesson identity, digest and source evidence.

Do not bypass human review.

SAVE AND OPEN PRACTICE:

Reuse the existing approved artifact handoff, including the sessionStorage handoff already implemented in Review.

Add minimal persistence only if required by the real application navigation and library workflow.

Do not save an unapproved or modified artifact as approved.

The approved procedure must be revalidated through the existing /api/teach/practice-lesson endpoint before Practice can start.

# PART 4 — MAKE THE PROCEDURE SPECIFICATION THE ACTUAL PRACTICE CONTRACT

Use the existing types and logic:

ProcedureSpecSchema
PracticeLessonSchema
ZoneBindingsSchema
createSession()
feedDetection()
verifyEvents()

A procedure step already supports:

- componentId
- fromZone
- toZone
- minimumConfidence
- prerequisites
- forbiddenTransitions
- recovery
- source evidence

Retain this explicit contract.

Do not replace it with a goal image or general natural-language matching.

Do not use mere object presence as proof.

Do not accept movement to any arbitrary destination.

A required action must be a verified transition from its approved starting zone into its approved target zone.

A forbidden transition must be rejected when its required earlier steps are not verified.

Insufficient or ambiguous evidence must return needs_verification.

Preserve duplicate-event rejection, timestamp ordering, stale-frame handling, prerequisite invalidation and recovery rules in verifyEvents.

# PART 5 — IMPORTANT: CALIBRATE THE ACTUAL PRACTICE CAMERA

Do not blindly reuse normalized zone coordinates from the instructor's source video as if they were automatically correct for another camera.

Teach's approved zone bindings describe the source demonstration.

Practice may use a different camera angle or workspace position.

Implement a clear, one-time Practice calibration that preserves the approved semantic zone identifiers but establishes their actual geometry in the live learner camera.

At setup:

1. Start the real browser camera.
2. Show the current work surface.
3. Ask the user to identify the relevant component locations.
4. Allow the user to mark or draw the required starting and target regions in the live camera.
5. Validate that required regions exist and are not improperly overlapping.
6. Calibrate the relevant physical components.
7. Confirm that the starting objects are visible and in their expected initial zones.
8. Start automatic Practice only after setup succeeds.

Use the existing validateSetup logic where possible.

Live calibration must not change the approved procedure's logical requirements or approval signature. It only supplies a camera-specific mapping of the same approved zone identifiers to the current workspace.

If the camera moves after calibration, stop verification and request recalibration.

Do not claim accurate physical dimensions. Coordinates are normalized image/workspace positions.

# PART 6 — LOCAL OBJECT TRACKING

Inspect the existing local colour tracking implementation:

src/practice/tracker.ts

It already provides:
- groundColour()
- trackColour()
- distinctive-colour validation
- connected-component segmentation
- location and confidence-like quality measurements
- missing, obstructed and ambiguous states.

Inspect the existing camera capture helpers.

For the initial supported live workflow, use visually distinct, solid-colour components.

The user may click the centre of each component once during setup to establish its colour profile.

Reject ambiguous or similar colours rather than silently choosing the wrong object.

Use the existing controlled-colour tracker first. It is already implemented and tested.

Do not add OpenCV or a new paid vision model.

If a better existing appearance tracker can be adapted safely, compare it against the colour tracker, but do not start a new tracking framework.

Check the image-size limit in tracker.ts. It currently rejects frames larger than 320×240 pixels. Supply appropriately bounded/downsampled images rather than passing unsupported dimensions.

Preserve the correct source-frame orientation, coordinates and timestamp.

Never label a local colour score as a probability of physical correctness.

The Practice camera should remain local. Do not upload every frame.

# PART 7 — CONNECT THE LOCAL PRACTICE PIPELINE TO THE CAMERA

Wire the actual camera frame loop into:

src/practice/pipeline.ts

The real Practice component must:

1. Receive current camera pixels.
2. Produce a fresh detection for each tracked component using the calibrated profiles.
3. Pass typed detections to feedDetection().
4. Process its returned VerificationResult.
5. Update the current step, progress, violations and final status.
6. Generate visual and spoken feedback from actual new verifier events.
7. Continue automatically until completion, pause or an uncertainty/recalibration condition.

Do not merely write tests for feedDetection() and leave it disconnected.

This is the central integration requirement.

Do not invoke Muse Spark or the remote relationship-perception route for normal locally measurable transitions.

The approved procedure was generated and reviewed during Teach. Practice uses its executable rules.

No API key, Muse model or network request should be needed for ordinary zone-transition verification.

No manual "Check current view" button should be needed.

Once calibration is complete and the user starts the session, observations and evaluation must run automatically.

# PART 8 — AUTOMATIC WARNING AND CORRECTION

Create or reuse a clean event adapter between VerificationResult and the React Practice interface.

When a new event has status "failed":

- Immediately display a prominent red alert.
- Name the exact failed step.
- Explain the missing prerequisite or forbidden transition.
- Display the procedure's approved recovery instruction.
- Speak the correction when voice feedback is enabled.
- Add the event to the visible timeline.
- Preserve the original event/evidence reference.

When a new event has status "passed":

- Show green confirmation.
- Mark the corresponding step complete.
- Update progress.
- Automatically advance to the next unblocked step.
- Optionally speak the next instruction.

When a new event has status "needs_verification":

- Show an amber message.
- Explain the observation problem.
- Do not mark the step complete.
- Do not speak a false success.

Deduplicate alerts and speech by event ID.

The spoken correction must use the exact recovery instruction stored in the approved procedure.

Do not ask the user to click a check button after every action.

A manual reset/recalibration may remain available when the camera view genuinely changes.

The user must not be able to bypass a prerequisite using a voice command or gesture.

# PART 9 — AUTOMATIC RECOVERY

Investigate the current verifyEvents() and findForbidden() behaviour.

Ensure the learner can recover from an out-of-order action through fresh physical evidence.

Example:
- Close the red latch before installing the support.
- StepLint records the failed transition.
- StepLint tells the user to reopen the latch.
- The learner reopens it.
- The missing support step is completed.
- The learner closes the latch again.
- The evaluator accepts the new correct transition once all prerequisites are satisfied.

No manual "Mark recovered" button.

Do not delete or rewrite the failed event. The new recovery event should appear after it in the audit history.

Do not make the correction pass simply because the object returns to its old position. The subsequent valid transition must also be observed.

# PART 10 — PRACTICE UI AND USER EXPERIENCE

The ordinary user should see:

- The procedure title and goal.
- Live camera and tracked objects.
- The current required action.
- A compact step list.
- Green, red and amber verification feedback.
- Voice guidance controls.
- Pause, resume and stop.

Hide:
- Internal evaluator names.
- TypeScript types.
- Model calls.
- API endpoints.
- Model budgets.
- Experimental relationship switches.
- Raw confidence numbers.
- Internal pipeline architecture.

Put sanitized diagnostics in an optional Developer Details section.

Do not put any Muse Spark or SAM-specific controls in the normal Practice screen.

# PART 11 — ONE CONTROLLED PHYSICAL ACCEPTANCE SCENARIO

Use a small, visibly distinct workbench task as the first complete acceptance scenario.

Three components:

- Blue base.
- Yellow support.
- Red latch marker.

Required sequence:

1. Move the blue base from staging into the base target.
2. Move the yellow support from staging into the support target after the base is verified.
3. Move the red latch marker from staging into its closed target after the support is verified.

Wrong-order action:
- Move the red latch marker to its target before the support is installed.

Expected behaviour:
- Automatic violation event.
- Red warning.
- Spoken correction.
- Reopen/return the marker to its starting zone.
- Install the support.
- Close the latch again.
- Automatic recovery and completion.

This is a controlled demonstration fixture, not hardcoded production logic.

Use the existing demo fixture only in automated tests unless it is explicitly presented as a controlled example. Do not claim it was generated from a real expert recording unless the actual Teach workflow produced it.

The real user demo must create an actual signed approved procedure through Teach, not bypass approval using synthetic data.

# PART 12 — TESTING

Do not spend Meta API credit for ordinary tests.

Use existing tests and add focused integration tests.

### Procedure unit tests

- Correct target zone.
- Wrong target zone.
- Wrong order.
- Forbidden transition.
- Missing prerequisite.
- Stale frame.
- Duplicate observation.
- Ambiguous colour.
- Obstructed/missing component.
- Object leaves an already verified zone.
- Recovery through a fresh correct transition.
- Complete procedure.
- Unapproved procedure rejected.
- Invalid zone setup rejected.

### Teach integration tests

- Lesson capture handoff.
- Correct upload.
- Compile response parsing.
- Component selection.
- Review and zone drawing.
- Approval blockers.
- Signed artifact issuance.
- Practice lesson approval validation.
- Modified/tampered artifact rejected.

### Practice integration tests

- Real UI consumes an approved ProcedureSpec.
- Start camera.
- Calibrate components and zones.
- Correct transition automatically passes.
- Wrong-order transition automatically fails.
- Red warning actually renders.
- Spoken correction receives the verifier's recovery instruction.
- Recovery is observed automatically.
- Correct transition then advances.
- Final procedure completes.
- Camera tracks are released after stopping.

Generated camera tests must be explicitly labelled as simulated.

### Real physical-camera acceptance

Provide me with one concise manual test checklist.

Do not claim physical acceptance based on a generated canvas stream.

Use the actual Chrome camera and a fixed tabletop with high-contrast coloured markers or components.

Record:
- Camera frame rate.
- Tracking quality and uncertainty.
- Time from stable zone entry to evaluator event.
- Time from event to visible alert.
- Time from violation to spoken correction dispatch.
- Whether the correct action passed.
- Whether the wrong action failed.
- Whether recovery succeeded.
- Whether the session completed.

Do not claim universal object support or hardware-damage prevention.

# PART 13 — DOCUMENTATION AND FINAL REPORT

The current documentation contains historical architecture descriptions that may imply the zone-based pipeline is already the active Practice route.

After the integration:
- Update docs/ARCHITECTURE.md.
- Update docs/PHASE4.md and docs/PHASE5.md.
- Update docs/LIVE_FLOW_AUDIT.md.
- Update docs/PHYSICAL_PRACTICE_REPAIR.md.

Distinguish:
- Existing tested zone verifier.
- Newly connected application functionality.
- Mocked browser tests.
- Generated camera tests.
- Real physical-camera tests.

Run:
- npm test
- npm run lint
- npm run typecheck
- npm run format:check
- npm run build
- Relevant Playwright tests.

Inspect the final Git diff.

Do not make real paid Meta API calls.
Do not consume model API credit.
Do not commit or push.

## FINAL ACCEPTANCE

This task is complete only when the actual main user-facing application supports:

Teach recording
→ actual procedure compilation
→ explicit per-step review and zones
→ signed human approval
→ saved practice handoff
→ approval validation
→ live-camera calibration
→ automatic local object tracking
→ automatic deterministic evaluation
→ immediate red/green/amber feedback
→ spoken correction
→ automatic physical recovery
→ completed session.

Do not claim completion because the standalone verifier tests pass.

The key requirement is that the code used by the actual /teach and /practice screens is connected to the zone-based procedure engine.

Begin by confirming the architecture gap, then implement the integration using the existing modules.