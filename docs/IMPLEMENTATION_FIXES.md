# STEPLINT — PHASE 3 IMPLEMENTATION
## Practice watch sets, object initialization and identity recovery

You are implementing Phase 3 of the approved Teach → Practice repair blueprint.

Phases 1 and 2 should now be complete. Before making changes, inspect their actual implementation and test results. Do not assume V3 persistence or the Teach → Practice handoff works without verifying the current code.

### OBJECTIVE

Make the existing canonical Practice engine track the correct objects, initialize reliably from approved object evidence, handle objects that become visible later, and safely recover object identities after temporary occlusion.

Use the existing tracking worker, protocol, alignment, pipeline and deterministic verifier.

Do not create a second Practice engine.

### 1. Inspect before editing

- Confirm current branch, commit and working-tree status.
- Inspect the completed Phase 1 and Phase 2 changes.
- Confirm V3 roles, activation rules, step dependencies and setup metadata survive the canonical Practice loader.
- Inspect current tracking, alignment, worker and pipeline implementations.
- Identify all existing identity-safety and calibration tests.
- Preserve unrelated work.

Before implementation, report the exact files/functions you intend to modify and any Phase 1 or 2 contract gaps that would prevent this phase from working.

Do not silently work around a broken earlier phase. Report it first.

### 2. Implement role-aware watch sets

Create a small pure helper at `src/practice/watch-set.ts`, or reuse an existing equivalent if one already exists.

The watch set must include:

- Required objects for currently enabled steps.
- Required semantic references for those steps.
- Objects needed to detect explicitly approved forbidden early actions.
- Objects needed to monitor previously verified persistent conditions.
- Active final-goal predicate dependencies.
- Next-step objects when their prerequisites make them eligible for pre-acquisition.

Supporting objects may assist localization, but their absence must not block verification.

Irrelevant objects must never be submitted as runtime verification requirements.

Important:

Do not track only the current step's mover. That would miss approved wrong-order actions and reversals.

Watch-set membership must follow the approved procedure's dependencies and rules.

### 3. Enforce the tracking-frame contract

For every active required identity, accept exactly one detection or an explicit unknown observation.

- Reject duplicate IDs.
- Reject foreign or out-of-watch-set IDs.
- Keep optional supporting observations separate from required evidence.
- Do not treat a dormant later object as missing.
- Recompute watch-set revisions when procedure state changes.
- Reject stale worker responses from an earlier session generation or watch-set revision.

Preserve original approved object IDs throughout tracking and recovery.

### 4. Implement later-object activation

A required object that is hidden at the beginning must not block initial startup when its approved activation step has not yet occurred.

When the relevant prerequisites are satisfied:

- Activate its approved identity template.
- Attempt acquisition using approved source reference evidence.
- Require reliable identity evidence before using it.
- Keep the relevant step unarmed until its required starting state is established.
- Explain missing or ambiguous evidence rather than guessing.

A phone hidden inside packaging must not prevent Practice from verifying an earlier lid-opening step.

Do not mark a later object as successfully observed merely because its expected location is known.

### 5. Repair object initialization and grounding

Modify the existing alignment and local-tracking architecture.

Remove the mandatory dependence on matching textured table patches when approved semantic object references can establish the required scene geometry.

Use approved stationary semantic references, such as a packaging base, to establish object-relative destinations and work areas.

Requirements:

- Match live objects against approved identity evidence.
- Require strong match quality and a clearly better candidate than alternatives.
- Use temporal consistency and plausible geometry.
- Prevent two approved identities from silently sharing one live detection.
- Distinguish camera movement from physical object movement.
- Keep uncertainty explicit.
- Do not reduce existing confidence thresholds to make initialization succeed.
- Do not promote supporting objects to required objects at runtime.
- Do not use background appearance as proof of object identity.

Geometry rules:

- One stationary reference may establish a limited mapping only when its observed shape or landmarks make that mapping identifiable.
- Use additional approved references when the required geometric mapping needs them.
- If rotation, perspective or ambiguous geometry cannot be resolved safely, block the affected verification with a specific instruction.
- A different table appearance must not invalidate an otherwise reliable object match.
- Do not assume overlapping object boxes mean identities are wrong. Support approved nested relationships where the evidence can distinguish the objects.
- If nested objects cannot be distinguished from the available view, report uncertainty.

Do not introduce a new perception provider, paid fallback or tracking engine.

### 6. Implement bounded per-object identity recovery

Keep global scene calibration separate from individual object observability.

Use explicit per-object states:

`tracked → occluded/ambiguous → reacquiring → tracked | needs_user_view`

Recovery requirements:

- A lost movable object must trigger its own recovery path even when global calibration remains valid.
- Retain the approved identity template and last reliable identity evidence.
- Require plausible location/trajectory, competing-candidate separation and three fresh consistent observations before accepting reacquisition.
- Never identify an object using color alone, narration or nearest-object matching.
- Preserve the original approved object ID.
- Record reacquisition as an auditable event.

Resource limits:

- Maximum three local identity-search attempts per loss episode over two seconds.
- At most one attempt per fresh eligible frame.
- No uncontrolled worker backlog.
- After exhaustion, stop automatic searching until a materially clearer eligible view is detected or the learner requests retry.

Continuity rules:

- If the object is reacquired at its source, require a fresh verified transfer.
- If it reappears at the target after an unseen interval, do not claim the transfer occurred.
- Do not fabricate movement evidence across occlusion.
- Distinguish an uncertain persistent condition from an observed reversal.

Preserve existing identity safety tests. Do not delete or weaken them to make reacquisition pass.

### 7. Add tests

Add pure unit tests for watch-set construction and identity lifecycle.

Add worker/protocol tests for stale generations, stale watch-set revisions, duplicate IDs and unknown observations.

Required regression scenarios:

1. An absent irrelevant object does not block startup.
2. An absent supporting object does not block startup.
3. A missing required destination blocks startup with an actionable explanation.
4. A hidden later phone does not block initial lid-opening steps.
5. The phone becomes eligible for acquisition when its activation prerequisites are met.
6. A smooth or visually different table does not block initialization when semantic object grounding is sufficient.
7. Duplicate or ambiguous lookalike candidates do not get silently assigned.
8. Camera movement does not count as object movement.
9. Brief object occlusion enters an uncertain state.
10. The same object can be safely reacquired after occlusion.
11. A lookalike replacement cannot pass identity checks.
12. Reappearance at a target after unseen movement does not verify a transfer.
13. Repeated occlusion does not cause duplicate step advancement.
14. Late worker replies from previous session/watch-set revisions are ignored.
15. Existing confidence and identity-safety tests remain passing.

Mock all external providers and block outbound model requests during automated tests.

### 8. Physical acceptance preparation

Do not claim physical acceptance based on unit tests or generated-camera tests.

Prepare an exact manual test procedure using:

- The actual phone.
- Its real packaging.
- The same camera/browser intended for the demo.
- An ordinary smooth table.
- The approved V3 lesson.

The physical test must demonstrate:

1. Automatic startup without table-texture calibration.
2. Initial steps can begin while the phone remains hidden.
3. Later phone activation when it becomes visible.
4. Temporary hand occlusion.
5. Safe reacquisition of the same phone.
6. No false transfer success when movement occurred during an unseen interval.
7. No identity substitution using a lookalike object.

If the real objects cannot be reliably distinguished, report the limitation. Do not weaken identity checks or claim success.

Do not make paid model calls during this phase.

### 9. Verification

Run focused tracking, alignment, watch-set, worker protocol, pipeline and verifier regression tests.

Then run:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

Report exact results. Do not conceal failures or modify unrelated code to get a passing result.

### 10. Required completion report

Report:

1. Exact files changed.
2. How watch sets are constructed and updated.
3. How supporting and irrelevant objects are excluded from blockers.
4. How later objects become eligible.
5. How semantic object grounding replaces mandatory table texture.
6. How bounded identity recovery works.
7. How stale worker replies are rejected.
8. Tests added and exact results.
9. Lint, typecheck, test and build results.
10. Remaining physical risks and the exact manual test instructions.

Do not commit, push or deploy.

**STOP after Phase 3. Do not begin Phase 4 until I review your report and explicitly approve it.**


# STEPLINT — PHASE 4 IMPLEMENTATION
## Practice lifecycle, start/resume reliability and voice control

You are working on the existing StepLint repository.

Implement **Phase 4 only** of the Teach-to-Practice repair plan.

The goal is to make Practice start, pause, resume and restart reliably, with voice commands that are acknowledged and executed predictably.

Do not redesign the app. Do not create a second Practice engine. Preserve the existing architecture and Phase 1–3 work.

---

## 1. Inspect before editing

First inspect:

- Current branch and latest commit.
- Phase 1, Phase 2 and Phase 3 implementation.
- Current V3 approved procedure contract.
- `src/app/practice/local-practice.tsx`
- `src/app/practice/use-guide-camera.ts`
- `src/voice/use-voice-control.ts`
- `src/voice/commands.ts`
- Existing camera startup, worker lifecycle, pause, halt and restart functions.
- Existing tests for Practice and voice.

Identify the actual lifecycle and voice defects that remain.

Do not assume the earlier blueprint describes the current code perfectly. Adapt to the current implementation.

If Phase 3 has unresolved build failures or broken interfaces, report them before proceeding. Do not silently rewrite Phase 3.

---

## 2. Implement one shared Practice lifecycle controller

There must be one authoritative lifecycle controller used by both the Practice UI and Practice voice commands.

Use the existing architecture. You may create a small controller or hook if needed, but do not introduce a second camera or verification pipeline.

The lifecycle must represent these states:

- `idle`
- `requesting_camera`
- `acquiring_initial_objects`
- `arming`
- `running`
- `paused`
- `recovering`
- `blocked`
- `ended`

Use the closest existing naming conventions if equivalent states already exist.

### Required behavior

**Start Practice**
1. Request camera permission if needed.
2. Start the camera stream.
3. Initialize the existing tracking pipeline.
4. Acquire the approved initial required objects.
5. Arm the existing verifier.
6. Enter `running` only when the pipeline confirms it is ready.

**Pause**
- Stop active verification progression.
- Preserve the approved procedure, completed-step history and audit events.
- Do not falsely mark the procedure as completed.
- Keep camera behavior consistent with the existing product design.

**Resume**
- Reuse the existing approved procedure and session.
- Reacquire required objects if necessary.
- Revalidate identity and calibration.
- Resume only when the pipeline is genuinely ready.

**Restart**
- Must work whether the camera is currently off or already active.
- Must not depend on which UI or voice command initiated it.
- Must restore the automatic tracking/verification intent.
- Must not leave `automaticWanted` false after a successful restart.
- Must not silently retain stale worker state or stale observations.
- Preserve the session audit trail according to the existing session model.

**Failure**
- Show a meaningful blocked or recovery state.
- Do not display `running` when the camera, worker or verifier is not ready.
- Avoid infinite loading or a permanently busy worker gate.
- Provide a recoverable error where recovery is safe.

### Important

Create one shared operation, such as `ensurePracticeRunning()` or an equivalent, and route all start/resume actions through it.

Do not leave separate, inconsistent startup logic in the UI and voice handler.

---

## 3. Add explicit lifecycle diagnostics

Make it possible to understand why Practice did not start.

Expose or log useful lifecycle information using the existing diagnostics approach:

- Current lifecycle state.
- Last transition and its reason.
- Camera permission and stream status.
- Worker status and last successful reply time.
- Whether automatic tracking is wanted.
- Whether initial acquisition is complete.
- Whether the verifier is armed.
- Last startup or recovery error.
- Whether the session is paused, blocked or running.

Do not log sensitive camera image data or unnecessary personal information.

A missing worker response must not leave startup permanently busy. Add a bounded timeout or equivalent safe failure path where needed.

---

## 4. Make Practice voice commands reliable

Voice control belongs to **Practice only**.

Do not add voice control to Teach.

Inspect the existing voice command parser and dispatch logic before changing it.

Implement explicit command handling states:

`received → accepted/rejected → dispatched → completed/failed`

Use equivalent types if the codebase already has a command lifecycle model.

### Required behavior

- A recognized command must receive a clear accepted or rejected result.
- Accepted commands must be dispatched to the shared lifecycle controller.
- A command must not be silently ignored because the app is currently speaking.
- Prevent duplicate command execution.
- Preserve wake-word and safety rules where appropriate.
- Keep confirmation requirements for destructive or consequential actions.
- Provide clear spoken or visible feedback when a command cannot be executed.
- Do not claim a command succeeded before the lifecycle controller confirms success.

### Half-duplex voice behavior

Implement predictable turn-taking between the app's speech output and the user's speech input.

The app should not talk over the user or unintentionally reject a valid command just because speech synthesis is active.

Use a deliberate approach:
- Stop or finish app speech when the user begins a valid command, where safe.
- Avoid processing the app's own spoken response as a new user command.
- Resume listening after the app's response when appropriate.
- Prevent repeated recognition of the same command from dispatching it twice.

Do not introduce a new voice provider or paid API dependency.

### Voice commands to verify

Test the existing supported commands, including equivalents of:

- Start Practice.
- Pause Practice.
- Resume Practice.
- Restart Practice.
- Repeat instruction.
- What should I do next?

Do not invent unsupported commands simply to increase the command list.

---

## 5. Tests

Add or update automated tests covering:

### Lifecycle
1. Start with camera off.
2. Start when camera is already active.
3. Resume after pause.
4. Restart after halt.
5. Restart while camera remains active.
6. Camera permission denied.
7. Worker startup failure.
8. Worker stops responding.
9. Initial object acquisition fails.
10. Verifier refuses to arm.
11. Successful startup reaches `running` only after readiness confirmation.
12. Repeated start requests do not create duplicate workers or sessions.
13. Stale worker responses cannot revive an old session.
14. UI and voice use the same lifecycle controller.

### Voice
15. Valid start command dispatches once.
16. Valid pause command dispatches once.
17. Valid resume command dispatches once.
18. Valid restart command dispatches once.
19. Duplicate recognition does not execute twice.
20. Invalid commands receive a rejection.
21. Commands are not silently dropped while app speech is active.
22. App speech is not recognized as a user command.
23. Failed lifecycle operations produce failed command results.
24. Teach remains voice-free.

Do not weaken existing identity, confidence or verifier safety tests to make these tests pass.

---

## 6. Constraints

- Preserve Phase 1–3 functionality and V3 procedure compatibility.
- Keep all existing physical identity and confidence thresholds.
- Do not weaken tracking or verification safety.
- Do not add another verifier, camera pipeline or tracking engine.
- Do not add a new model provider or dependency unless strictly necessary; explain before doing so.
- Do not make live paid Meta or Baseten API calls.
- Do not change Teach voice behavior: Teach must remain voice-free.
- Do not redesign screens or add unrelated features.
- Do not commit, push or deploy.

---

## 7. Validation and final report

Run the available:

- Lint.
- TypeScript typecheck.
- Relevant unit tests.
- Integration tests.
- Production build.

Report:

1. What lifecycle defects were found.
2. Which shared lifecycle controller or operation was implemented.
3. How UI and voice now share it.
4. How start, pause, resume and restart behave.
5. How worker timeouts and stale responses are handled.
6. How voice turn-taking and duplicate prevention work.
7. Which tests passed and failed, with exact counts.
8. Any remaining risks or limitations.
9. Exact manual steps I should follow to test Phase 4 in the deployed app.

Clearly distinguish automated test results from actual camera/microphone testing.

**Stop after Phase 4. Do not begin Phase 5. Wait for my review.**


# STEPLINT — PHASE 5 IMPLEMENTATION
## Final goal verification, persistent conditions and completion integrity

You are working in the existing StepLint repository.

Implement Phase 5 only.

The objective is to ensure that Practice declares a procedure complete only when:

1. Every required approved procedure step has passed.
2. The approved final physical goal has been independently verified.
3. All required persistent final conditions remain satisfied.
4. There are no unresolved tracking, identity, recovery or verification failures.
5. The final result has sufficient fresh visual evidence.

Do not redesign the product. Do not create another verifier. Extend the existing canonical verifier and V3 execution contract.

---

## 1. Inspect before editing

Inspect the current repository and the completed Phase 1–4 implementations.

Pay particular attention to:

- `src/procedure/verifier.ts`
- `src/procedure/schema.ts`
- The V3 execution contract and its final-condition fields.
- `src/practice/pipeline.ts`
- The Practice watch-set implementation from Phase 3.
- The identity and recovery states from Phase 3.
- The lifecycle controller from Phase 4.
- The approved procedure loader and storage.
- Existing verifier and integration tests.

First report:

- Which final-goal and predicate structures already exist.
- Which are actually evaluated at runtime.
- Whether completion currently depends only on passing steps.
- Whether persistent conditions and reversals are already monitored.
- Which Phase 1–4 fields or interfaces are missing.

Do not assume the blueprint was implemented exactly as written. Work from the current code.

If Phase 1–4 introduced unresolved blockers, report them before proceeding. Do not silently rewrite earlier phases.

---

## 2. Implement the approved final-goal predicates

Use the existing V3 schema and approved execution artifact.

Support only the approved predicate types:

- `object_in_zone`
- `projected_separation`

Do not introduce arbitrary natural-language evaluation or an LLM-based pass/fail system.

### `object_in_zone`

Verify that the approved object is inside its approved destination zone using the existing normalized geometry and approved coordinate-frame rules.

Requirements:
- Use the approved object identity.
- Use the approved zone reference and coordinate frame.
- Require fresh, sufficiently confident observations.
- Reject ambiguous or lost identities.
- Do not treat an object appearing near a destination as proof of transfer.
- Do not accept a stale observation as current evidence.

### `projected_separation`

Verify that the approved objects have the required visible separation according to the approved predicate and geometry.

Requirements:
- Use the approved object identities.
- Use fresh observations.
- Apply the approved geometry and thresholds.
- Do not infer separation from narration or an instruction being completed.
- Unknown or ambiguous geometry must remain unknown, not pass.

If a predicate is unsupported or its required fields are missing, it must not silently pass.

---

## 3. Verify the final goal independently of step completion

The final goal must be a separate completion gate.

For example, in the phone-unboxing procedure:

- The phone must be visibly transferred into the approved destination.
- The phone must remain within the destination.
- The phone must be visibly separated from the packaging where that is an approved final condition.

Passing the instruction "remove the phone from the box" is not sufficient by itself.

Use the actual approved V3 goal predicates. Do not hardcode phone-unboxing behavior into the verifier.

The completion evaluator must require:

- All required step IDs passed.
- All approved final predicates passed.
- All required persistent conditions satisfied.
- No unresolved required-object identity or recovery state.
- No stale or ambiguous evidence.
- No blocked or paused lifecycle state.

Do not infer the goal from the last step or automatically redefine the user's intended scope.

---

## 4. Persistent conditions and reversal monitoring

Some final conditions must remain true after first being achieved.

Implement persistent-condition monitoring using the approved V3 contract.

Required behavior:

- A persistent condition is not permanently satisfied merely because it passed once.
- Continue monitoring it while Practice is running.
- If fresh, reliable evidence shows that the condition has become false, invalidate completion.
- Record the reversal as an auditable event.
- Return Practice to an appropriate incomplete or recovery state.
- Do not erase the earlier successful step history.
- Do not allow stale worker responses to reverse or restore a newer state.

Do not invent a hold duration where the approved procedure does not specify one.

A condition that is only momentarily observed must not be treated as persistently satisfied.

Unknown evidence is not proof that a condition became false. Preserve the distinction between `pass`, `fail` and `unknown`.

---

## 5. Completion state and audit trail

Use the existing verifier and session state model.

Represent completion clearly, using equivalent existing states if available:

- `incomplete`
- `verifying_goal`
- `complete`
- `invalidated`

Completion should record:

- Approved procedure revision.
- Required steps passed.
- Final predicates passed.
- Persistent conditions satisfied.
- Evidence timestamps or frame references.
- Relevant identity and calibration state.
- Completion timestamp.
- Any later reversal or invalidation event.

Do not store unnecessary raw camera images.

A completion event must be tied to the exact approved procedure revision. If the approved procedure changes, the previous completion cannot automatically carry over.

---

## 6. UI and learner feedback

Keep the existing Practice UI and visual style.

Make feedback distinguish:

- All steps passed, final goal not yet verified.
- Final goal verification in progress.
- Final goal verified and procedure complete.
- Completion invalidated because a persistent condition visibly reversed.
- Verification blocked because evidence is ambiguous or an object needs reacquisition.

Do not display "Complete" while any required gate remains unresolved.

Avoid vague success messages.

Do not add unrelated features or redesign the screen.

---

## 7. Tests

Add or update automated tests for:

### Final predicates
1. `object_in_zone` passes with valid fresh evidence.
2. It fails when reliable evidence shows the object outside the zone.
3. It remains unknown when identity is ambiguous.
4. It remains unknown with stale evidence.
5. It does not pass when the object only appears near the destination.
6. `projected_separation` passes with valid approved geometry.
7. It fails when reliable geometry shows insufficient separation.
8. It remains unknown when geometry is ambiguous.
9. Unsupported or incomplete predicates cannot pass.

### Completion gates
10. All steps pass but final goal fails: procedure remains incomplete.
11. All steps pass but final goal is unknown: procedure remains incomplete.
12. Final goal passes but a required step is incomplete: procedure remains incomplete.
13. Final predicates pass but identity recovery is unresolved: procedure remains incomplete.
14. Final predicates pass but lifecycle is paused or blocked: procedure remains incomplete.
15. All required gates pass with fresh evidence: procedure becomes complete.

### Persistent conditions
16. Persistent condition remains true: completion remains valid.
17. Reliable reversal invalidates completion.
18. Unknown evidence does not falsely invalidate completion.
19. Stale worker response cannot invalidate a newer completion.
20. Fresh evidence can verify the condition again only through the normal verifier path.
21. Reversal is recorded without erasing earlier step history.

### Integrity
22. Completion is tied to the approved procedure revision.
23. A changed approved revision cannot inherit old completion.
24. Duplicate events do not duplicate completion or reversal records.
25. No LLM or model call is required for normal verification.

Do not weaken tracking identity thresholds, geometry requirements or existing safety tests to make these pass.

---

## 8. Constraints

- Extend the existing canonical verifier.
- Preserve Phase 1–4 functionality.
- Use only the approved V3 procedure contract.
- Do not hardcode phone-unboxing behavior.
- Do not use an LLM or model to decide pass/fail.
- Do not treat narration, elapsed time or instruction completion as physical evidence.
- Do not lower confidence thresholds.
- Do not add another camera, tracking or verification engine.
- Do not add new paid API calls or model providers.
- Do not commit, push or deploy.
- Do not begin additional features after Phase 5.

---

## 9. Validation and final report

Run:

- Lint.
- TypeScript typecheck.
- Relevant unit tests.
- Integration tests.
- Production build.

Report:

1. What final-goal verification already existed.
2. What was missing and what you implemented.
3. How each supported predicate is evaluated.
4. How completion gates work.
5. How persistent conditions and reversals work.
6. How ambiguous, stale and missing evidence is handled.
7. Which tests passed and failed, with exact counts.
8. Whether any earlier phase has unresolved blockers.
9. Exact manual steps to test final-goal verification using the deployed phone-unboxing workflow.
10. Any remaining limitations.

Clearly separate automated test results from actual physical camera testing.

**Stop after Phase 5. Do not deploy. Wait for my review.**



What to test at each phase
Phase 1 — Teach procedure quality Completed

Before moving on, make sure Codex's report confirms these tests passed:
- Two actions on the same object retain their separate evidence windows.
- A continuous carry is not incorrectly split into multiple actions.
- Required unsupported actions remain visible instead of disappearing.
- Invalid object, step and goal references are rejected.
- Final conditions and requirement coverage are validated.
- Existing Teach tests, lint, typecheck and build pass.
Phase 2 — Approval and Teach → Practice handoff
This is the next phase.

Test the complete data journey:
1. Create a V3 lesson.
2. Review and correct its object roles, steps and final goal.
3. Approve it.
4. Save it.
5. Reload the application.
6. Select the saved lesson in Practice.
7. Confirm that every field is unchanged.
Also test:
- Missing automatic setup data prevents an invalid lesson from loading.
- Editing an approved lesson invalidates its previous rehearsal evidence.
- A failed rehearsal cannot be labelled as passed.
- V2 lessons remain readable through the explicit compatibility path.
- V2 lessons are not silently upgraded or represented as physically validated.
- A new V3 lesson cannot bypass its validation requirements.
Important: Passing these tests proves the handoff and data contract, not that the camera can execute the lesson.
Phase 3 — Practice tracking and recovery
This is where we return to the physical camera.

Test:
- Practice starts on a different, smooth table without requiring table texture.
- Missing optional objects do not block startup.
- Missing required objects do block startup with a useful explanation.
- A phone hidden inside packaging does not block the initial steps.
- The phone becomes trackable when it is revealed.
- Brief hand occlusion causes uncertainty, not a false success.
- The same phone is safely reacquired after the hand moves away.
- A different lookalike object cannot be mistaken for the original.
- A phone appearing at the destination after an unseen movement does not count as a verified transfer.
- Camera movement is not mistaken for object movement.
Physical test: Use your actual phone, packaging and ordinary table. Don't rely only on simulated camera tests.
Phase 4 — Controls and Practice voice
Test each of these using both the UI and actual voice commands:
- Start Practice with the camera off.
- Stop and start again.
- Pause and resume without losing previously verified work.
- Deny camera permission, then grant it and retry.
- Worker failure produces an understandable error.
- Duplicate commands don't execute twice.
- "Guide, start practice" actually starts verification.
- Pause, resume and stop commands actually change the host state.
- The assistant doesn't accidentally respond to its own spoken guidance.
- Voice remains in Practice only.
Physical test: Use your real microphone and Chrome. A passing voice parser test alone is not sufficient.
Phase 5 — Final verification and full demo
Test the entire phone-unboxing workflow:
1. Start with closed packaging.
2. Perform an incorrect action and confirm the appropriate warning.
3. Briefly cover the phone with your hand.
4. Confirm that uncertainty and recovery are handled.
5. Correct the mistake and perform the proper sequence.
6. Confirm the phone reaches the intended destination.
7. Confirm the final goal is verified.
8. Move the phone back and confirm that completion is invalidated.
Also test:
- A checklist cannot pass when the phone is in the wrong destination.
- A phone already at the destination does not prove the learner performed the transfer.
- A hidden phone cannot produce false completion.
- Persistent final conditions are monitored after completion.
- Permitted later movements are not incorrectly classified as reversals.
Final physical acceptance: one complete run from beginning to end, including wrong action, uncertainty, recovery, correction, completion and reversal monitoring.