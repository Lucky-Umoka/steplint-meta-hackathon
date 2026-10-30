# StepLint Teach–Practice repair plan

**Status: implementation authorized by owner on 2026-10-30 after completing this plan.** The repair is implemented and undergoing acceptance checks. See REPAIR_VERIFICATION.md for current results and the five-trial ledger summary; acceptance remains pending.

This document scopes the current Teach/Practice repair. [FUTURE_WORK.md](FUTURE_WORK.md) records deferred capabilities and the gates for returning to them. The [model evaluation](MODEL_ROLES.md) separates currently selected integrations from future candidates. Model access is not evidence of measured accuracy or an authorization to deploy additional services.

## Agreed outcome and scope

Use the owner's existing phone-unboxing clip for acceptance. Prioritize automatic, understandable Teach and Practice over cloud accounts/storage, deployment, or broad accuracy claims. First release uses a guide library in this browser, with a clean storage boundary for a later shared server library. Preserve Next.js/React/TypeScript/Node/npm/Zod/Vitest and server-only Meta credentials.

Normal creator journey: record/upload -> preview/consent -> analysis -> visual checklist and goal review -> optional private rehearsal -> approve/save to library.
Normal learner journey: select saved guide -> start camera -> receive setup guidance -> click Ready OR begin a clearly observed task action after setup is ready -> guided practice -> completion summary.
Ready expresses intent; it does not assert that setup or a step is correct. Automatic start is included in this repair, with the same observed-baseline/evidence requirements as clicking Ready. Setup still needs observed evidence. No test fixture, colour-sampling workflow, raw zone IDs or diagnostics in the normal learner flow. The learner sees instructions and goals for the selected guide only.

## Inspection evidence and limits

Read AGENTS.md, PLANS.md, architecture/decision records, Teach schemas and UI, provider pipeline, approval/security, Practice capture/tracker/pipeline/verifier, and relevant tests. Existing 186 tests passed during the initial inspection; this is not proof of the new flow.

Current Playwright capture at 1280x832, approximating a small laptop viewport:
1. Practice entry: poor. Shows a test fixture, disabled controls, calibration canvas, Cannot Verify, recovery copy, source-file import, latency and event timeline before any session exists. Screenshot 01-practice-empty.png.
2. Teach access: functional gate, separate explanation needed. Screenshot 02-teach-start.png.
3. Teach recording/upload entry: functions, but disabled actions lack nearby next-action guidance and the progress path is incomplete. Screenshot 03-teach-capture.png.
4. Owner MP4 preview: real local decode and WAV preparation worked; no page exceptions; provider upload/compile blocked by the audit harness and never invoked. Preview has a strong video but too much technical/cost detail in the main path. Screenshot 04-teach-preview.png.
5. Analysis/review/publish/rehearsal: not visually exercised in this new audit because implementation is pending and no paid call has been made. Prior stored results are code/data evidence only, not fresh UX captures.

Screenshots do not establish accessibility compliance, physical-camera accuracy, or the owner's vanished error. No current error stack was supplied. Add repeatable permission, camera, stale-session, race and failure tests rather than inventing its cause.

Source video inspection shows a packaged phone at the start and a phone held outside its tray near the end. It does not demonstrate a completed phone repair. Candidate steps and the goal must be grounded and reviewed, not copied from this observation as verified rules.

## Implementation order

### A. Make sessions and lifecycle explicit

Separate UI lifecycle from procedural outcomes: guide_selection, camera_permission, setup, ready, practicing, paused, complete, recoverable_error. Setup, face-only/empty scene, and camera repositioning cannot generate rule violations. Do not invoke procedural evaluation before the session starts with a fresh baseline.

Preserve native video aspect ratio and map display, capture, mask and geometry coordinates explicitly. Avoid stretching all cameras to 4:3. Run capture/analysis in bounded schedules; prevent overlap, ignore stale responses by session/generation/frame ID, cancel on stop/navigation, stop every track, and preserve recoverable drafts. Do not rebuild a directory used by a running Next server. Use a stable owner origin and isolated QA build/port.

### A1. Automatic start without inventing intent or missing the first action

Automatic start is enabled for the normal flow once the user has started the camera and the approved guide setup has been established. Starting the camera begins setup assistance, not procedural scoring. Explain this behavior briefly; retain a clear Ready button and Pause/Stop controls.

1. Wait for a stable, sufficiently visible approved initial state, including only objects required to be visible initially. An object expected to emerge from packaging later is not a setup failure. Face-only/empty scenes, blur, camera movement and uncertain identity keep the session in setup.
2. Maintain a bounded rolling buffer of fresh timestamped observations after readiness. The camera session, guide revision, method and coordinate alignment must match; a changed alignment or tracking gap invalidates that baseline.
3. Start when the learner clicks Ready or when reliable evidence shows a task-relevant action from that baseline. A qualifying action must concern an approved step or forbidden transition; arbitrary motion, a hand entering view, object presence, or an LLM's unsupported intent label is insufficient.
4. On automatic start, retain the fresh before/action evidence so the action that started practice is evaluated exactly once. Do not discard the first action, create two sessions from a Ready/auto-start race, or retroactively pass an action without its before state.
5. An out-of-order task action after a valid setup also starts the session and reaches the evaluator; do not wait only for the expected first step and miss early violations. If the scene was already mid-task before a baseline was observed, ask for an approved starting state rather than crediting unseen history.
6. Notify with a small visible 'Practice started' status that does not obscure the object. If intent or evidence is ambiguous, stay ready and invite the learner to click Ready. Pause and recovery never silently clear a violation or count an unobserved action.

Tests cover setup movements vs task actions, face-only setup, hidden initial objects, spontaneous correct/wrong first actions, missing before evidence, stale baselines, camera reorientation, occlusion and simultaneous Ready/automatic triggers.

### B. Establish a richer, versioned guide contract

Introduce explicit schemaVersion distinct from guide revision and app release version. Model a guide, its methods, immutable approved revisions, goal, initial visible requirements, objects/roles, temporal appearance references, step evidence, observable conditions and approved corrections. Objects may participate in multiple steps. Limits apply per bounded analysis chapter/request rather than silently limiting the entire lesson to one transition per component.

Each step has source speech-turn references, a precise demonstrated frame interval, start/change/result frames, related object IDs, geometry/mask references, approved condition and uncertainty. Every transcript-derived candidate instruction is either supported, explicitly outside the reviewed guide goal, or unresolved. Do not publish a complete-looking executable guide with silently omitted required actions.

Keep evaluator decisions pure and deterministic. Add only observable predicates required and measured for the chosen lesson: object placement/removal and relative object separation where video evidence supports them. Define thresholds, before/after evidence and debounce explicitly. Never implement a generic LLM 'action succeeded' boolean. Separate completed events from ongoing prerequisites that genuinely must remain true, so normal reuse of a component does not automatically undo prior valid work. Preserve duplicate, order, retry, stale evidence and uncertainty protections.

Old guides require explicit migration/compatibility validation; no silent conversion to new semantics or automatic approval.

### C. Repair Teach evidence and completeness

Use Muse Voice Transcribe for speech with real turn boundaries. Spark interprets task goal, candidate actions and objects using the video plus transcript. SAM tracks the proposed objects with official prompt utilities, documented streaming and @meta-sam/parser. Reuse the upload. Retain bounded decoded masks/geometry and meaningful appearance crops; current summaries lose mask geometry needed for object references.

Replace uniform summary sampling and maximum-displacement-only review suggestions with motion/stability change windows aligned to transcript turns. A long utterance may cover several actions: do not invent word timestamps. Match proposed intervals to actual tracked samples and source time; check gaps, identity continuity and evidence coverage. Missing tracking stays missing.

Display a storyboard: initial scene, numbered actions with start/change/result and labelled related objects, then final goal. Group redundant frames. The creator can optionally rename/edit, adjust a mistaken mark or interval, or correct scope. Small target zones are not full object outlines; show actual bounds/masks separately. Review must account for incomplete coverage before approval.

### D. Add private creator rehearsal

After explicit review approval for testing, create a private test revision. Try this guide opens the same Practice engine and returns a result to the editor. It does not publish. Content edits invalidate test/review stamps. Saving/publishing requires explicit final approval. Rehearsal results record which exact revision/method and scenarios were tested; do not label one successful replay as proven general accuracy.

### E. Save a local guide library and remove manual file handoffs

Use IndexedDB for validated guides, selected reference images/crops, revisions and local test summaries. Reference frames load automatically. Keep stored approval proof independent of the original owner browser session while preserving server validation and content-integrity checks. Use canonical validated content hashes rather than JSON property-order dependence.

Keep raw original media local only with clear retention/discard controls; store necessary reference evidence by default, not unnecessary server media. Handle quota, failed transactions, interrupted saves and missing assets honestly. Export/import is a backup option rather than the main journey. Browser storage is origin/device-specific and can be cleared; it is not a shared database or cloud backup. No Firebase/Supabase required for this acceptance scope. Later server storage can implement the same repository interface.

The creator token protects paid authoring and encrypted lesson references. Separate read-only guide use from creator access. Practice provider requests must use bounded server-side sessions/capabilities and quota controls; do not expose unrestricted paid routes. API keys and signing secrets remain server-only. No claim that the creator access code authenticates a learner's physical work.

### F. Build automatic Practice grounding and tracking

On camera start, present the camera as the main view and begin setup assistance. If the task area is absent, guide camera placement instead of reporting failure. Check frame quality, relevant initial objects and alignable view; objects expected to emerge later need not be visible at setup.

Use reviewed task roles, appearance/shape references, relative geometry and scene context to locate objects. Colour is a feature, not object identity. A changed table/background does not itself violate a rule. Equivalent object variants must be defined and tested; if ambiguous, pause rather than guessing. Derive alignment from task objects/anchors, not copying teacher image pixels onto a learner's view. Ask for a clearer camera angle when the required state is hidden. Object outlines must follow measured size/perspective, while rule tolerances remain separately validated.

Use bounded Spark image/short-sequence observations for semantic scene interpretation and official SAM image/video grounding when needed. Fast browser processing tracks between remote checks using appearance/features and temporal continuity, replacing colour-only segmentation. Evaluate the candidate browser tracker against the owner's real footage before selecting/adding a dependency; inspect its license and Chrome compatibility. No unsupported local SAM/Glimmer API or guaranteed Mac performance is assumed.

Remote checks are triggered by stable material scene changes, loss or a semantic boundary, under cooldowns, in-flight locks, maximum request/time/input/output limits and no automatic API-failure retries. Never send every frame to SAM. Remote responses are typed observations, not executable rules or direct pass commands. Conflicting, stale or uncertain evidence pauses evaluation. Local reacquisition must not erase a prior violation or fabricate a missed transition.

Once setup is stable, the system says the learner can click Ready or begin. Either path starts from a fresh observed baseline under the automatic-start contract below. Display one instruction, related labels, small progress list, current expected result and access to the final goal. Positive routine feedback must not obscure the object. Show approved correction when an actual forbidden/wrong transition is observed; show setup/tracking help for uncertainty. Offer pause/restart and repeat instruction; manual box drawing is not routine learner work.

If the scene is already midway through the task, do not credit actions never observed. Guide restoration to an approved initial state or a creator-approved restart point.

### G. Goal, revisions and alternative methods

The goal consists of a creator-reviewed description, final reference evidence and explicit observable conditions. Progress means verified steps/goals, not an invented visual similarity percentage. A matching final-looking picture does not replace required history/order.

A revision updates a guide. A method is an approved alternative route to its goal. Each method needs its own demonstrated steps, evidence, approval and optional rehearsal. Keep the learner on one chosen method and revision during a session. Do not mix rules or let a model switch methods silently. The current clip supplies only the route it demonstrates; do not invent a second route. General branching can follow later with explicit observed branch conditions.

### H. Longer lessons

Design chapter IDs, source offsets, persistent object identities and cross-chapter evidence into the contract now. Prove this short real clip first. A later long-lesson path must chunk/transcode upload media and WAV, preserve global timestamps, handle boundary speech/actions, cancellation/resume, request sizes and costs; it cannot be enabled by merely raising the 20-second limit. Keep long-lesson throughput acceptance separate from this short-clip tracking gate. Do not reduce video detail until objects become unreadable just to fit a request.

## Delivery checkpoints

1. Repair lifecycle/camera stability and introduce versioned guide/evidence contracts with deterministic tests.
2. Repair Teach completeness, storyboard and goal, then local save/reload and private rehearsal boundaries.
3. Benchmark automatic grounding/local tracking on owned footage before adopting a tracker; connect camera-first guidance and the Ready/automatic-start paths.
4. Run mocked failure tests and visually inspect the complete flows. Only then begin the sequential owner-approved live trials.
5. Record real results and remaining limits; perform the physical MacBook Chrome acceptance separately from recorded-video replay. Do not mark the repair accepted based on unit tests alone.

Checkpoint failures stop advancement until corrected. Keep the evaluator evidence gates and owner approval boundaries intact.

## Intended files and implementation mapping

The implemented V2 boundary lives in `src/guide/` and `src/server/guide/`, with small `/api/teach/guide/*` Route Handlers. The original procedure/provider modules remain for regression coverage and historical compatibility; they were not silently rewritten into the new guide semantics. New browser appearance tracking is `src/practice/appearance.ts`, capture lifecycle is `src/app/practice/use-guide-camera.ts`, and the Teach/Practice screens use these V2 modules. The paths below were the planning targets, rather than a claim that every listed legacy file needed modification.


- src/guide/schema.ts, versioning.ts, storage.ts and indexeddb.ts (new): validated guide/revision/method/goal and local repository.
- src/teach/schema.ts, media.ts, review-suggestions.ts and new evidence alignment/completeness modules: frame/turn/track linkage and coverage.
- src/procedure/schema.ts and verifier.ts: explicit condition semantics and repeated-object support, with compatibility guards and regression tests.
- src/server/teach/discovery.ts, pipeline.ts, http.ts/security helpers: full lesson grounding/coverage, approval/test revision boundaries and provider budgets.
- New small server-only practice perception modules and Route Handlers: bounded Spark/SAM observations, exact official contracts, session validation/cancellation.
- src/practice/tracker.ts, pipeline.ts, lesson.ts and new setup/alignment/session modules: automatic grounding, correct coordinates, conservative observations and lifecycle.
- src/app/teach/*: guided stages, storyboard, goal, rehearsal, corrections and saving.
- src/app/practice/* plus guide selection components: camera-first flow without test fixtures, raw IDs, calibration chores or developer panels.
- src/components/* and globals.css: existing design conventions, clear controls, focus, responsive layout and non-obscuring feedback.
- tests/* plus repeatable browser test harness and isolated live smoke runner; relevant package scripts/version metadata as justified.
- PLANS.md and docs/ARCHITECTURE.md, DECISIONS.md, PHASE4.md, PHASE5.md: truthful scope/status/results after implementation.

No edits to owner-authored AGENTS instructions. No deployment, cloud provisioning or new second application stack in this pass.

## Acceptance and five-trial loop

Before spending: unit/schema/evaluator/storage/HTTP checks, browser walkthroughs with explicitly mocked provider failures, visual screenshot inspection, media/credential/input bounds, and a concrete request/cost notice. Paid API calls remain separate from normal tests. Treat each full trial as a fresh Teach pipeline plus creator rehearsal and learner selection/use of that saved revision. Failed attempts count. No automatic live retry or batch of five unattended runs.

Current bound for this short clip: up to 8 Teach model requests (1 Voice, 2 Spark, up to 4 SAM source-image box refinements, 1 SAM video) plus up to 6 bounded model requests per Practice session, with at most two sessions (creator and learner), i.e. at most 20 model requests per full trial. Source-image refinements were added after failed grounding checks; each uses official box prompt utilities and a decoded foreground point for the video prompt. No evidence threshold was reduced. Requests stop when evidence is sufficient, an API call fails, the user stops or the budget is exhausted. The per-session cap includes setup and any re-localization; it is not permission to repeatedly sample unchanged frames. Exact token/image/frame limits and a current cost estimate must be stated before trial 1. A separate failure retry or larger budget needs owner approval. No Contributor mode. Target first acceptance uses the existing short owned clip, not arbitrary long lessons.

For each of the maximum five trials: inspect UI and artifacts -> run the full permitted journey -> compare model/track/evaluator results to independently reviewed source evidence -> inspect screenshots and failures -> document -> fix -> run relevant checks -> only then consider the next paid trial. If one stage fails, stop and report that trial incomplete rather than spending remaining steps blindly.

Scenario matrix:
- Camera sees face/wall/empty work area: setup help, zero procedural failures or passes.
- Ready click and automatic task-start paths: fresh baseline, exactly one session, first action retained, wrong-first-action violation retained, no start from setup/camera motion.
- Permission denied, insecure context, busy/unplugged camera, cancelled permission, tab hidden, stalled frame, failed decoding: recoverable state and track cleanup.
- Correct unboxing; premature/omitted step; repeated same-object action; already-complete scene; wrong object; similar objects; expected-hidden object; misplaced object.
- Partial occlusion, hands covering the target, blur, glare, low light, clipping, scale/rotation/viewpoint changes, different background/colour, camera movement, distractors and uncertain identity.
- Stale/duplicate/out-of-order observations and provider replies, concurrent starts, slow/empty/invalid/rate-limited responses, transport loss and session caps.
- Creator edits after rehearsal/approval; revision/method mismatch; local save/reload, full quota, missing reference assets, backup import and changed signature.
- Correct goal appearance with missing action history must not pass; uncertainty or unobservable physical properties must not become success.

Report detection identity/geometry against independent annotations, false passes, missed/false warnings, cannot-verify time, recovery rate and setup duration; measure local event-to-warning and remote response delays separately. No unmeasured '98% accuracy' or universal real-time performance claim. Automatic interaction is a UX goal; perception accuracy must be measured per scenario. Browser recorded-video camera replay is not a physical camera. The owner's MacBook Chrome camera acceptance is a separate final gate. Existing footage can prove replay behavior, not new-view generalization.

Multi-domain architecture is welcome; cooking doneness, torque, internal repair quality and other hidden states require additional evidence/sensors or remain unverified. Do not turn a phone-unboxing success into a claim of verified cooking or engineering competence.

## Official references checked

- https://dev.meta.ai/docs/sam/segmenting
- https://dev.meta.ai/docs/sam/client-libraries
- https://dev.meta.ai/docs/speech-to-text
- https://dev.meta.ai/docs/video-understanding
- https://dev.meta.ai/docs/models
- https://dev.meta.ai/docs/pricing-rate-limits
- https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria

Muse Glimmer is self-hosted/provider-hosted, not a new hosted Meta Model API realtime endpoint. No new heavyweight local model/runtime, hosted GPU service, Muse Wonder request or image-generation call is included in this browser-first repair. See [MODEL_ROLES.md](MODEL_ROLES.md) for researched candidates and evaluation gates.
