# Teach → Practice repair blueprint

Investigation date: 2026-11-02. Current checkout: `fix/phyical-practice-test`, `b769d8f`.

This document is the only file created or changed for this follow-up. No source/UI edits, paid calls, deployments, commits or pushes. Practice voice is required; Teach voice is deliberately out of scope and must remain absent.

The previous report inspected `18d7807` on `main`. The checkout changed between investigations. A targeted `git diff 18d7807 HEAD -- src/app/practice src/practice src/procedure src/teach src/server/teach src/voice` returned no differences, so the relevant findings still apply. The owner's two investigation documents and the prior report were preserved.

## 1. Executive decisions

**Teach owns executable intent. Practice owns evidence-based execution of that exact approved intent.** A selected object, a valid JSON response, an approval checkbox and a camera preview are not evidence that this contract is satisfied.

1. **Teach is currently capable of producing unsuitable or incomplete procedures.** Its canonical compiler is intentionally restricted to zone transfers, final drafting sees sampled geometry rather than the actual video, review suggestions can overwrite action intervals, and review can remove unsupported requirements. Source inspection does not establish that every actual phone action is missing; it establishes that completeness is neither represented nor enforced sufficiently.
2. **Practice requires too broad an object set.** It does not track every pixel/object the model might see. It tracks every saved `procedure.components` identity, including selected references that normalization adds. There is no relevance role, so supporting references become startup/calibration requirements.
3. **Smooth-table initialization fails because of the grounding contract.** Without two matching fixed anchors, it requires spatially separated source-table appearance matches. A different or featureless table fails before usable verification starts.
4. **Recovery deadlocks because object loss and scene loss are different states, but recovery listens only for scene loss.** A movable identity stays `lost` while `calibrationValid=true`; the recovery branch never runs.
5. **The minimum coherent repair spans the existing contract, compiler/review binding, tracker orchestration and Practice command acknowledgment.** A one-file tracker patch would leave approved lessons that cannot be executed correctly. Use the existing routes, verifier and worker; do not create another Practice engine.
6. **Implement Teach contract/evidence/goal gates first, then role-aware initialization and recovery, then unify control orchestration and voice acknowledgment.** Contract tests must land with their consumers; do not deploy a half-compatible artifact format.
7. **Acceptance is one full, reviewed real phone-unboxing artifact executed on camera through correct work, a wrong action, uncertainty, recovery, final-goal verification and reversal monitoring.** An isolated transfer, popup-opening test or synthetic replay does not meet that gate.

The blueprint below fixes implementation decisions. Physical parameters and the exact demonstrated action inventory must be confirmed from the actual phone clip during implementation; inventing those would repeat the original error.

## 2. Confirmed responsibility failures

### Teach: evidence and procedure generation

Canonical path: [LocalTeach.compile](../src/app/teach/local-teach.tsx) → `/api/teach/compile` → [compileLesson](../src/server/teach/pipeline.ts#L368).

| Question | Current answer and implementation consequence |
| --- | --- |
| All meaningful actions represented? | Not guaranteed. Discovery returns 1–4 objects. The draft supports only `enters_zone`; the prompt explicitly substitutes observable movement for unsupported opening/unboxing and records uncertainty. Missing actions cannot be reconstructed downstream. |
| Measurable steps? | Zone entry is measurable, but a movement is not proof of opening, releasing a catch, removing film, contact, or a hidden state. Names can overclaim their geometric condition. |
| Starting condition? | Inferred from each object's first step `fromZone`, rather than a reviewed scene-level initial condition with visibility/activation rules. |
| Observable change and result? | Source start/change/result fields are added during review; source notes already carry frames, but the suggestion algorithm does not constrain itself to them. |
| Explicit final goal? | `execution.goal` is prose and `goalStepIds` are generated mechanically from the last step for each moving object. There is no independent final-scene predicate set. |
| Entire task completion? | [createVerifier.snapshot](../src/procedure/verifier.ts#L624) reports `passed` when every retained step passes, subject to uncertainty/failure precedence. It does not evaluate `execution.goal` or a separate final-goal predicate set. Maintained step monitoring exists, but cannot supply an omitted intended goal. |
| Object importance? | Discovery is prompted to exclude hands/backgrounds and include needed references. Neither discovery output nor `ComponentSchema` stores required/supporting/irrelevant roles. |
| Stable identity? | IDs are assigned by discovery order, SAM records are mapped by selection index, and references are validated within that analysis. That is referential consistency, not proof that the model selected the intended physical object or that a live match is the same identity. |
| Later-introduced objects? | Discovery permits later visible seeds, but automatic setup and initial arming require all component identities/first moving states before the workflow can begin. |

Media inspection in [teach/media.ts](../src/teach/media.ts) obtains bounded MP4 frame timestamps; review extracts JPEGs by those timestamps. [summarizeTracking](../src/server/teach/pipeline.ts#L165) checks SAM records, rejects duplicate object/frame pairs and converts usable mask geometry to normalized boxes. Those checks are useful, but geometry alone does not determine the physical meaning of an action.

Provider boundary: discovery still sends the uploaded video to Meta Spark; SAM uses Meta. The final [sparkStructured call](../src/server/teach/pipeline.ts#L438) selects Baseten or Meta using server configuration. It receives narration, selected component descriptions and at most roughly a dozen representative geometry samples per component. It receives no actual image/video in that call. Do not describe the final Baseten call as visually verifying the complete demonstration.

### New reproduced Teach defect: action intervals are not preserved

[suggestReviews](../src/teach/review-suggestions.ts#L29) searches the object's entire tracking timeline after `priorEnd`, maximizing endpoint displacement. It does not bind the search to the owning step's supporting frames/source action window.

A read-only in-memory probe created two ordered transfers of one object. Step A's supporting frames were `[0,1,2]`; step B's were `[2,3,4]`; all five frames had confidence `0.99`. Actual suggestions:

```text
move-a: fromFrame=0, changeFrame=2, toFrame=4
move-b: fromRegion=null, toRegion=null
```

The first suggestion consumed both actions. This is a Teach/review transformation defect, not an optical tracker defect. It can change the meaning of an instruction or make later review impossible even when tracking geometry is good.

### Contract: selected references become mandatory objects

[localExecutionDraft](../src/teach/local-execution.ts) appends all selections to components and assigns generic measurements. [automaticSetupPlan](../src/teach/automatic-setup.ts#L43) maps every component; `fixed = !firstMovementStep`. [feedTrackingFrame](../src/practice/pipeline.ts#L545) requires every approved identity exactly once in each tracking frame. [bootstrapLocal](../src/practice/local-tracking.ts#L329) requires every supplied identity to match.

Consequences:

- A merely helpful reference can block startup or invalidate global calibration.
- A stationary **required** destination and an optional alignment cue cannot be distinguished.
- An object not used in a movement is assumed fixed even if it moves incidentally.
- Phone inside tray/box creates legitimate overlapping projected regions, but `calibrateLocal` rejects overlapping object regions. Disjoint calibration is not a general unboxing model.
- The current four-object cap can be insufficient for the previously reported six-object sequence; excluding tools is legitimate only if the approved intended task excludes their actions, not simply to fit the cap.

### Practice: lifecycle, loss and voice

The previous report's code-confirmed startup and lost-identity defects remain. Practice voice has a real host connection, but `useVoiceControl` logs text before acceptance, ignores most commands during self-speech, and cannot await completion because its callback returns `void | boolean`. LocalPractice's camera-off start branch returns before rearming tracking. Therefore parsing the right phrase is insufficient.

Teach voice is **not a defect in the current requested product**. No repair below adds it.

## 3. Contract decision: execution schema version 3

Extend the existing approved artifact and `procedure.execution`; do not introduce a parallel procedure file or a second verifier. Keep version 2 readable in its explicit compatibility path. Never silently upgrade an already approved artifact or represent it as physically validated. New automatic guides require V3; old guides need explicit re-review to acquire new semantics.

### 3.1 Concrete fields and ownership

The following is a field contract for implementation, not a declaration that these fields exist today:

```ts
type ObjectRole = 'required' | 'supporting' | 'irrelevant';

// Extend ComponentSchema; preserve id and description.
type ComponentExecution = {
  role: ObjectRole;
  roleReason: string;
  motion: 'stationary' | 'movable'; // independent of relevance
  firstRequiredAt: 'initial' | { stepId: string } | 'never';
  referenceFrameIds: string[];     // approved identity views
};

// Extend each step, keeping its condition, prerequisites and recovery.
type StepExecution = {
  requiredObjectIds: string[];    // mover + semantic references
  evidenceWindow: {
    startFrame: number; changeFrame: number; resultFrame: number;
  };
  supportedClaim: string;        // exactly what the condition proves
};

// Extend zone binding: retain source region, add its coordinate reference.
type ZoneReference =
  | { kind: 'object'; objectId: string; localRegion: Box }
  | { kind: 'workArea'; referenceObjectIds: string[]; localRegion: Box };

type ScenePredicate =
  | { id: string; kind: 'object_in_zone'; objectId: string; zoneId: string }
  | { id: string; kind: 'projected_separation'; objectId: string;
      otherObjectId: string; minimumGap: number };

type ExecutionV3 = {
  schemaVersion: 3;
  goal: string;
  requirements: { id: string; description: string;
    status: 'covered' | 'unsupported' | 'outside_goal';
    stepIds: string[]; goalPredicateIds: string[]; reason: string }[];
  initialConditions: ScenePredicate[];
  finalConditions: ScenePredicate[];
  goalStepIds: string[];          // history dependencies, not inferred intent
};
```

Use strict Zod objects/discriminated unions and existing bounded IDs. `Box` above refers to a validated region; object-local regions need a separate bounded coordinate domain because a zone next to a box may lie outside that box. Concretely use each edge in `[-4, 5]`, positive area, transform then clip/check against the actual image. Source/live normalized image regions remain `[0,1]`. Reject an offscreen required destination; clipping must not create a new approved destination.

Roles and requirements are generated as proposals, corrected in Review and sealed in approval. Runtime live alignment may instantiate approved coordinates; it cannot reclassify required objects, change the goal, or invent coverage. All referenced identity/zone/frame IDs must be validated before approval and again when loading.

`irrelevant` entries remain available as reviewed metadata but have no runtime templates or observations. A supporting reference is optional only if it is genuinely nonsemantic. **Any object needed to define a goal, destination or rule is required**, even if it never moves. Thus a tray used to establish whether the phone left packaging is required; a spare tool and a table texture patch are not automatically required.

### 3.2 Required validation gates

Reject approval and new-guide loading when any of these fails:

1. Required intent has an unsupported or unaccounted requirement. No automatic scope narrowing. An explicit creator scope revision creates a new draft revision and requires re-review; it cannot inherit prior approval or rehearsal status.
2. Any step lacks an ordered evidence window, a tracked mover, identifiable start, observed change and result, a supported claim, or recovery. The model may propose `unsupported`; the server must not manufacture evidence.
3. A step's source windows violate the declared order or split one continuous transfer into redundant lift/place steps without a meaningful observable intermediate condition.
4. A semantic condition references a supporting/irrelevant object, or a role/lifecycle refers to an unknown step. Promote the object through review or reject.
5. Initial predicates require hidden later objects. Later objects need identity reference views and a reviewed activation step; no global co-visibility requirement.
6. A final condition lacks observed source result evidence, references a transient/released state, or has no coverage link to the intended requirement. At least one final predicate must exist; blank goal text or “all checklist items checked” is insufficient.
7. Required source templates, zone reference frames or automatic setup data are absent/inconsistent. New automatic lessons cannot save without the data their runtime requires.
8. Requested geometry is unobservable in the camera view. Projected separation cannot prove torque, contact, electrical correctness, physical support or hidden 3D containment. If a required claim needs those, the present verifier must block it rather than rename it.

Do not require every intermediate frame to be confidently visible merely to prove an endpoint transfer. Instead, specify evidence sufficiency per predicate: reliable identity/start/result plus observed travel evidence; intervals of uncertainty stay unknown. A rule asserting “never outside this area” requires coverage of the travel interval and cannot pass across an occlusion. This preserves confidence policy while avoiding the current all-frames-visible assumption for ordinary transfers.

### 3.3 Goal semantics for the phone example

The actual video must determine the inventory. A suitable **observable** goal, if demonstrated, is: the identified phone has been visibly transferred from its packaging to the reviewed destination, remains visibly within that destination and is visibly separated from the packaging in the approved camera view. If setting aside the lid, retaining the tray, film removal or tool actions are part of the intended task, they need their own covered steps/predicates; do not remove them to make this easier.

Required evidence includes a visible phone identity, its pre-transfer source relative to required packaging references, the complete demonstrated transfer, the destination reference and a current phone result. Phone absent from box is not proof of where it went. A phone already at the destination cannot establish that the learner performed the transfer. Goal text must use “visibly separated” where only 2D evidence is available; it must not claim hidden removal/contact facts.

Completion is computed inside the same deterministic verifier as:

```text
all required action-history steps passed
AND every required goal predicate currently verified with fresh evidence
AND all persistent required conditions satisfied
AND no unresolved failure, ambiguity or identity recovery for those conditions
```

No completion from a final instruction string, a goal image alone or a missing object. Unrelated supporting-object loss cannot downgrade completion. Continue persistent-condition monitoring while the camera session remains active; confirmed reversal invalidates the affected state and dependent completion, with an append-only audit.

## 4. Teach implementation decisions — Priority 1

### T1. Preserve action evidence and stop scope deletion

- **Files/functions:** `src/server/teach/pipeline.ts` (`compilerWireSchema`, `sparkRequest`, `parseSparkDraft`); `src/teach/local-execution.ts` (`localExecutionDraft`); `src/teach/review-suggestions.ts` (`suggestReviews`, `narrowToVerifiableScope` callers); `src/app/teach/review.tsx` (`autoNarrowed`, review edits).
- **Change:** final draft returns each action's exact evidence window, required IDs, supported claim and requirement links. Deterministic normalization validates these; it does not invent measurements or infer intent from the last action per object. Suggest moments only within that step's window; suggestions cannot expand it or consume another step. Remove automatic narrowing from the default review path, preserving the existing unsupported explanation instead. Reuse the existing review editor/controls; no screen redesign.
- **Regression:** two actions on one object keep `[0,1,2]` and `[2,3,4]`; one continuous carry remains one action; required unsupported work blocks approval; explicit edits invalidate prior confirmation/rehearsal; later windows cannot be stolen by maximum displacement.
- **Physical acceptance:** creator compares every meaningful action and source start/change/result against the full phone recording before approval.
- **Risk/dependency:** no prompt guarantees that the model finds all actions. This depends on the inventory/coverage gate and human correction. Unsupported action semantics remain blocked.

### T2. Produce relevance, lifecycle, initial scene and final goal

- **Files/functions:** `src/server/teach/discovery.ts` (`discoverySchema`, `discoveryRequest`, `parseDiscovery`); `src/server/teach/pipeline.ts`; `src/procedure/schema.ts` (`ComponentSchema`, `StepSchema`, `ExecutionSchema`); `src/teach/schema.ts` (`SelectionSchema`, `validateDraft`, `validateReviewEvidence`, `approveDraft`).
- **Change:** discovery proposes object roles and identity reference evidence. Compiler uses explicit initial/final predicates and coverage. Server validates role promotion and referenced objects. Review exposes corrections using the existing review/editor structure. New approval checks all V3 gates in section 3.
- **Provider decision:** keep discovery/SAM on their existing Meta clients; keep final drafting through `sparkStructured` and the configured Baseten adapter. Pass the bounded source action evidence into final drafting; visual claims must have their source references verified upstream. Do not add a new provider or silently replace discovery with Baseten.
- **Frame decision:** retain actual per-action evidence windows server-side. If representative geometry is sent, include those action landmarks; global uniform subsampling must not be the only evidence for a short action. Adding image inputs later requires the existing bounded media path and separate paid-test authorization; it is not an assumed solution here.
- **Capacity decision:** perform a reviewed inventory first. If the full intended sequence exceeds four identities, use one shared bound of eight for the scoped implementation, including optional metadata, with at most eight active tracked identities. Replace the four-object/ID-regex bounds consistently in schemas, discovery, compiler, worker protocol and calibration. Up to ten distinct setup frames cover eight identity seeds plus scene/result. Preserve body/storage limits and validate actual encoded size; block oversize rather than dropping an identity. No increase is needed if the reviewed full inventory fits four.
- **Regression:** background/hand excluded; optional spare tool not required; required destination cannot be supporting; hidden phone activates later; missing semantic reference fails; cap and payload boundaries tested. IDs cannot be regenerated when review reorders/removes a component.
- **Physical acceptance:** every required object is correctly outlined in its source view; misleading hand/background identity causes an explicit review rejection.
- **Risk/dependency:** increasing a bound increases SAM/CPU/payload cost. Role filtering and bounded frames are required; no live paid tests in this investigation or automated suite.

### T3. Persist exactly the approved execution contract

- **Files/functions:** `src/teach/automatic-setup.ts` (`AutomaticSetupSchema`, `automaticSetupPlan`, `bindAutomaticSetup`); `src/teach/approved-artifact.ts`; `src/server/teach/http.ts` (`approve`); `src/teach/approved-storage.ts`; `src/practice/lesson.ts`; `src/practice/load-approved-lesson.ts`; `review.tsx` (`rehearse`, approve/save handoff).
- **Change:** source setup stores required and optional templates separately with lifecycle/reference provenance. Irrelevant objects have no templates. Persist V3 roles, step windows, coordinate references, initial/final predicates, coverage and revision identity unchanged. Check revision identity and content consistency at each boundary. Keep Practice token-free; these checks are execution validation, not creator authentication.
- **Rehearsal decision:** approval means human-reviewed content, not proven physical performance. Save may retain an explicitly untested guide, but it must never label it rehearsal-verified. Add revision-bound rehearsal evidence with `not_run | failed | passed` and test kind. Failed frame extraction must block an automatic rehearsal with an actionable error, rather than handing off `automaticSetup=undefined`. Rehearsal passes only on full verifier completion plus required recovery checks, not popup creation. Any executable edit invalidates that record.
- **Regression:** compile → review → approve handler → IndexedDB save → actual canonical load preserves all fields; missing setup fails; stale rehearsal cannot verify a changed revision; V2 bytes preserved and require explicit re-review for V3; no Teach receipt/token requested by learner loading.
- **Physical acceptance:** save, reload and select the same reviewed phone guide; Practice displays and uses the same complete goal/actions.
- **Risk/dependency:** existing object schemas may strip unknown fields; all boundaries must be upgraded together. A mocked rehearsal record must never be displayed as physical acceptance.

## 5. Practice implementation decisions — Priority 2

### P1. Derive a relevant watch set; do not track just the next mover

- **Files/functions:** `src/practice/pipeline.ts` (`createSession`, `feedTrackingFrame`, `feedDetection`, arming); `src/practice/local-tracking-protocol.ts`; `src/practice/local-tracking-worker.ts`; `src/app/practice/local-practice.tsx` (worker setup/message orchestration). Add a small pure `src/practice/watch-set.ts`, used by these existing consumers.
- **Watch set =** required objects for enabled/current steps + required references for those conditions + objects needed to detect approved forbidden early actions + currently persistent verified conditions + active final-goal conditions. Pre-acquire next-step identities after their prerequisites make visibility possible. Supporting candidates are optional localization inputs, not verification blockers. Irrelevant entries are never submitted.
- **Important constraint:** literally tracking only the current step would miss wrong-order actions and reversals. Watch-set membership follows approved rule dependencies, not just checklist position.
- **Frame contract:** exactly one detection or explicit unknown for each expected active required ID; reject duplicate/foreign IDs. Dormant later objects are not missing observations. Optional references are reported separately. Recompute watch-set revision on state changes; reject stale worker replies by session generation and watch-set revision.
- **Arming:** initial scene gates only initially required predicates. Each later action arms when its own prerequisites and visible starting state are measured; one hidden phone must not block lid-opening practice.
- **Regression:** absent spare tool does not block; missing required destination does; later phone absent initially is allowed; premature future action observed when its rule requires monitoring; persistent earlier result still monitored; duplicate/out-of-watch-set evidence rejected.
- **Physical acceptance:** begin from closed packaging, automatically continue as phone/tray are revealed, without asking for all contents to be displayed first.
- **Risk/dependency:** needs V3 lifecycle and rule references. If a forbidden action cannot be observed while its object is hidden, report unavailable evidence rather than claiming protection.

### P2. Ground against relevant objects, not a mandatory matching table

- **Files/functions:** `src/practice/automatic-alignment.ts` (`alignFixedObjects`, `alignStartingView`, `chooseLiveWorkspace`); `src/practice/local-tracking.ts` (`bootstrapLocal`, `calibrateLocal`, `trackLocal`); `src/teach/automatic-setup.ts`; worker protocol.
- **Algorithm:** identify visible initial required identities from their approved source views; search bounded live candidates using the existing appearance/feature methods. Require strong identity evidence, a clearly better candidate than alternatives, plausible geometry and temporal agreement. Select a consistent joint assignment; two IDs cannot silently share one measured surface. Track uncertainty explicitly.
- **Coordinate decision:** use approved stationary semantic references such as the box base to instantiate object-relative destination/work-area regions. An optional table patch can improve camera-motion estimation after grounding but cannot be mandatory or define the task's meaning. Do not silently promote a supporting object to required.
- **Geometry:** one unique required stationary anchor can establish translation and a constrained scale only when its measured shape/landmarks make that mapping identifiable. Two separated approved references are used when additional geometric degrees of freedom are necessary. One movable bottle alone cannot distinguish camera motion from object motion. Unsupported rotation/perspective/anchor ambiguity blocks affected verification with a specific reframe instruction; it must not force a generic textured-table requirement.
- **Changing table/lighting:** different table appearance is irrelevant to object identity. Use normalized appearance/features and approved multiple views where available; require actual observed match quality and candidate separation. A new table must not justify a lower confidence threshold. If lighting destroys identifiability, ask for clearer lighting instead of guessing.
- **Overlap decision:** remove blanket “all boxes disjoint” as an execution precondition. Validate intended nested relationships from the approved evidence; use distinct visible identity features and occlusion quality to distinguish phone/tray/base. Geometric overlap is not automatically an identity swap. Where the source cannot distinguish nested surfaces, that condition stays unknown.
- **Regression:** smooth/different table with identifiable box starts; optional reference removed still starts; duplicate lookalike blocks; camera shift updates reference epoch without counting an action; unresolvable rotation blocks; nested phone/tray boxes do not trigger unconditional calibration rejection.
- **Physical acceptance:** identical real objects, ordinary smooth table different from Teach, roughly the same camera angle; start automatically, then small camera reposition must not verify object movement.
- **Risk/dependency:** this is the largest perception risk. Existing matching primitives may not distinguish the real nested objects reliably. If physical evidence disproves local identifiability, report that blocker and propose a bounded existing grounding integration separately; do not invent local success or add a paid fallback silently.

### P3. Add bounded per-object identity recovery

- **Files/functions:** `src/practice/local-tracking.ts` (`measureNative`, `trackLocal`, profiles); `local-tracking-protocol.ts`; `local-tracking-worker.ts`; `local-practice.tsx` (tracked reply recovery branch); `pipeline.ts` (gap/evidence handling). New recovery state belongs in these existing components, not another tracking engine.
- **States:** `tracked → occluded/ambiguous → reacquiring → tracked | needs_user_view`. Keep global geometry validity separate from per-object observability.
- **Bound:** at most three local identity-search attempts over two seconds per loss episode, limited to one attempt per fresh eligible frame and no extra worker backlog. After exhaustion, stop searching automatically until a materially clearer eligible view is detected or the learner requests retry. Explain the missing identity/action needed. These are resource bounds to validate, not a claim of sufficient physical detection speed.
- **Identity proof:** retained approved appearance + last reliable identity features + plausible trajectory/location + competing-candidate separation + three fresh consistent observations. No identity acquisition from color alone, overlap alone, narration or “closest object.” Preserve original IDs and append a reacquisition event with evidence.
- **Continuity:** reacquired at source → re-arm and observe a fresh transfer. Reacquired at target after an unseen interval → result may be observed, but the action remains unverified unless independently retained evidence already proves the transition. Never infer travel across occlusion. A previously verified persistent state with ambiguous visibility remains uncertain; clear observed reversal is a different event.
- **Regression:** lost movable while scene valid triggers bounded recovery; restoring same object works; replacing it with another does not; target reappearance cannot fabricate completion; repeated occlusion cannot double-advance; late replies from old epochs ignored; continuous transitions already supported by retained evidence do not require invented physical waits.
- **Physical acceptance:** brief hand occlusion, hand removal, automatic reacquisition of the same phone; deliberate lookalike substitution must not pass.
- **Risk/dependency:** depends on usable identity features and correct watch-set membership. The current safety test against silent reacquisition remains; add safe reacquisition tests rather than deleting it.

### P4. One start/resume controller with observable success

- **Files/functions:** `src/app/practice/local-practice.tsx` (`halt`, `start`, frame callback, worker messages, onAction, camera buttons); `src/app/practice/use-guide-camera.ts`; add `src/practice/session-lifecycle.ts` as a small state reducer/controller reused by page actions.
- **States:** `idle → requesting_camera → acquiring_initial_objects → arming → running`; also `paused`, `recovering`, `blocked`, `ended`. Camera preview is a camera substate, never `running`.
- **One entry:** `ensurePracticeRunning({ intent: start | resume, requestId })` is called by existing UI and voice. It sets desired intent before requesting camera, then waits for fresh frames, matching worker generation/watch set, valid reference geometry and relevant arming evidence. It reports completion only at `running`.
- **Restart:** ordinary stop/start or permission retry retains the audit and approved revision. Resume reacquires current expected states and checks persistent conditions; it never restarts from an invented untouched scene. Destructive “restart practice” alone creates a fresh attempt after existing confirmation safeguards.
- **Failure:** permission error → `blocked(camera_permission)`; missing required object → `blocked(identity)`; worker failure → terminate obsolete worker and `blocked(worker)`; retry creates a new generation. Initialization failure counters reset for a new explicit request. No unlimited worker/model retries. Per-request worker startup timeout is bounded (initial implementation: five seconds), surfaced as failure, and not counted as evidence time.
- **Regression:** first start, camera off, denied then granted, stop/start, paused resume, five-failure retry, stale worker reply, worker crash and duplicate starts. Assert `running`, actual processed observations and arming—not merely `<video>` visibility.
- **Physical acceptance:** one “Guide, start practice” from stopped opens capture and starts verification; pause/resume retains prior verified work after revalidation.
- **Risk/dependency:** browser permission still requires browser/user interaction when mandated. Report permission pending honestly; voice cannot grant it.

### P5. Practice speech and commands use an explicit turn-taking policy

- **Files/functions:** `src/voice/use-voice-control.ts` (`dispatch`, hook callback contract); `src/voice/commands.ts` (disposition and normalized duplicate handling); `src/practice/local-commands.ts`; `local-practice.tsx` (`speak`, onAction, lifecycle acknowledgment). Any shared hook extension must retain existing callers' behavior unless they opt into Practice acknowledgment. Do not touch the Teach recorder.
- **Decision:** use explicit half-duplex turn-taking, not unsafe unrestricted self-speech barge-in. Stop/silence/pause interruption remains available subject to existing safeguards. Normal start/resume commands are accepted while the companion is quiet. The user must never be instructed to speak a wake word over the companion's own speech.
- **Guidance scheduling:** issue short event-driven utterances, do not endlessly repeat waiting messages, and yield a quiet listening opportunity automatically. Initial bound: guidance chunks no longer than about 1.5 seconds followed by at least one second without queued speech; split or cancel stale guidance at boundaries. These timing values are provisional usability/resource settings, not guaranteed browser synthesis timings. Speech callbacks/watchdog must drive actual listening readiness. Correction visuals/verifier continue independently of the audio turn.
- **During speech:** transcript receipt is logged as received-but-ineligible, not executed or queued for surprise execution later. After speech ends, the next eligible command is allowed immediately. Do not speak an error explanation that continuously prevents the retry. If true simultaneous barge-in is later required, reliable echo discrimination must first be demonstrated; the browser's `speaking` boolean is not speaker identification.
- **Echo boundary:** serialize generated guidance and normal-command listening epochs. Invalidate the normal recognizer epoch before TTS and create a fresh epoch for the quiet turn; delayed results from the speech epoch cannot become a normal command after `onend`. Preserve the existing interrupt-only allowlist during speech as a separate eligible mode, without expanding it to start/resume/restart. Controlled guidance must not say activation-prefixed command phrases. This reduces self-trigger risk; interruption acoustics still require real-speaker testing and are not a speaker-identification guarantee.
- **Action protocol:** normalized command → `accepted` or explicit `rejected` → `dispatched(requestId)` → `completed(hostState)` or `failed(reason)`. Hook callback may return a typed async acknowledgment for Practice. `start` completes at lifecycle `running`; `pause` when verification is paused; `stop camera` when capture/tracking stop; `resume` after evidence revalidation. Transcript receipt is a separate event.
- **Duplicates:** deduplicate normalized command IDs within a recognition episode/request in flight, rather than relying only on raw text equality. Keep consequential-action confirmation expiration and one-time consumption. Never replay an ignored phrase automatically once speech stops.
- **Regression:** self-guidance transcript never starts/restarts a session; final transcript while quiet reaches the real host; punctuation/case duplicate dispatches once; async camera failure yields failed acknowledgment; pause/resume/stop prove host state; confirmation expires and cannot be reused.
- **Physical acceptance:** with actual microphone, normal speakers and Chrome, hear correction, wait for the automatic quiet turn, say start/pause/resume/stop once, verify both acknowledgment and camera/verifier state. Test with app speech present and record exact eligibility/turn transitions. Passing mocked recognition does not prove this.
- **Risk/dependency:** browser recognition may rely on its own service; no guaranteed offline support or acoustic echo rejection. The half-duplex choice avoids claiming either capability and does not introduce a voice backend.

## 6. Goal evaluation and continuous motion

**Files/functions:** `src/procedure/verifier.ts` (`createVerifier`, `push`, `snapshot`, invalidation); `src/procedure/schema.ts` (goal observations/result); `src/practice/pipeline.ts` (typed scene observations and transition evidence).

Add deterministic evaluation of the limited V3 predicates to the existing verifier. Geometry-to-predicate observations must identify object IDs, current evidence frames, reference epoch and quality. Duplicate protection and audit replay remain authoritative. No LLM decides pass/fail.

Do not equate “stable evidence” with “learner must hold every intermediate object still.” Current default `stableForMs=400`, three frames and small position drift can impose a stationary-state expectation on a continuous sequence. Separate observed physical event time from later confirmation. Retain source/change/result trajectories and allow a confirmed continuous transition to be consumed in order even if a later permitted movement already began. Only an explicitly approved final/persistent condition requires sustained current result evidence; no generic midair hold is added.

For the first implementation, keep confidence policy, minimum fresh observation count and maximum-gap protections. Replace the unconditional low-drift dwell requirement for transient travel with trajectory/identity consistency for the approved transfer. Define confirmation evidence per predicate, and measure its delay. A camera cannot provide sub-frame or zero-latency verification; report real observed, confirmed, displayed and spoken timestamps separately.

Tests must include: final text/checklist passed but wrong destination → not complete; phone initially at goal without transfer → not complete; phone carried continuously through a necessary action boundary → no invented hold; hidden final phone → uncertainty; returned phone → persistent-goal invalidation and automatic evidence-based recovery; missing optional object → no downgrade.

## 7. Implementation order and bounded file scope

Implement in five reviewable patches within the same canonical architecture:

1. **V3 schema and pure validation/evidence tests:** `procedure/schema.ts`, Teach schemas, compiler wire/parser, `local-execution.ts`, review suggestions. Introduce explicit roles/windows/goals; remove automatic scope deletion. These must exist before runtime can choose the right objects.
2. **Approval, save/load and rehearsal contract:** automatic setup, artifact/storage schemas, Teach HTTP approval, Practice lesson loader and existing Review handlers. Exercise the whole mocked handler→storage→load boundary.
3. **Watch sets, object initialization and per-identity recovery:** existing tracking/protocol/worker/alignment/pipeline plus the small watch-set helper. Do not weaken old identity safety tests. This is the physical perception gate; stop feature claims if it fails on the real objects.
4. **Lifecycle and Practice voice acknowledgment:** existing LocalPractice/camera hook, one lifecycle helper, voice hook/parser/local allowlist. Test actual canonical page actions and keep Teach voice absent.
5. **Final predicate evaluation, complete regression and physical acceptance:** existing deterministic verifier and UI result consumption. Complete goal and reversal tests; then perform the real demo gate below.

Contract scaffolding for final predicates lands in patch 1; completion behavior must be finished before any V3 guide is presented as ready for automatic Practice. Intermediate patches are not separately releasable as a complete product repair.

**Deliberately excluded:** layouts, navigation, companion art, styling, new gesture commands, recording voice controls, legacy engine rewrite, new providers/dependencies, cloud storage, token changes, unrelated media conversion and deployment configuration. Review field corrections and existing status text are functional scope, not permission to redesign the screen. Any later UI change requires the owner's preservation/screenshot rules.

## 8. Priority 3 — exact end-to-end acceptance

### Offline regression commands after implementation

Run focused tests first, including existing `tests/local-teach-contract.test.ts`, `teach.test.ts`, `automatic-setup.test.ts`, local-tracking tests, `incremental-verifier.test.ts`, `practice-local-timing.test.ts`, `voice-commands.test.ts`, and canonical `e2e/rehearsal.spec.ts`, `local-practice.spec.ts`, `practice-autonomy.spec.ts`, `voice-controls.spec.ts` with new cases above. Add new pure watch-set/lifecycle tests and recorded-phone replay tests where their assertions test behavior rather than implementation details.

Then run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and the relevant `npm run test:e2e -- <spec files>`. Mock all provider responses and deny outbound model network access in automated tests. No command above was executed as a suite during this documentation-only investigation.

### Physical phone-unboxing gate

Use one actual complete demonstration and the owner's real objects without stickers. Before spending any credits on a new compile, separately give model/request-count notice and obtain live-test authorization. Existing older allowances are not renewed by this plan.

1. **Inventory and scope:** creator lists every meaningful demonstrated action and the final intended visible state. The generated draft must account for each as covered or explicitly blocked. No tool/packaging action is dropped merely because the capacity or tracker is inconvenient.
2. **Teach review:** correct identities, roles, action windows, visible prerequisites, required destinations, later phone activation and final predicates. One continuous lift/carry is one transfer. Approve the full contract, save, reload and open that exact revision through the ordinary lesson chooser.
3. **Automatic start:** ordinary smooth table, roughly the recorded angle, real unchanged objects. Camera and required initial objects initialize automatically; no manual calibration/per-step button. Hidden later phone does not block lid actions. Missing optional spare tool/table patch does not block.
4. **Wrong action:** attempt one explicitly prohibited later transfer before its approved prerequisite. Show the correct red/correction event for the measured rule; do not count a prediction as a confirmed violation. Record observed event, confirmation, visual feedback and speech onset separately.
5. **Uncertainty/recovery:** briefly occlude the phone, then restore the same identity. Show uncertainty, bounded reacquisition and resumed verification. Revealing a phone already at the destination after an unseen move must not fabricate transfer success.
6. **Correction and continuation:** restore the approved starting state as required, perform the correct ordered continuous movements, automatically progress without artificial holds, and prove final predicates from current visible evidence.
7. **Completion/reversal:** completion occurs only with all required action history and goals verified. While the camera stays active, clearly undo a maintained goal. Show correction/invalidation, then supported recovery. If a movement is explicitly permitted later, it must not be mislabeled a reversal.
8. **Voice:** actual microphone, commands in automatic quiet turns: pause, resume, stop camera and one start command. Assert achieved camera/tracking/verifier states, not just transcript. Confirm a consequential restart exactly once; preserve the audit distinction between resume and new attempt.

The final record must include artifact/revision, commit, URL/engine, device/browser, watch-set changes, initialization/recovery reasons, timestamped observations/verdicts, command lifecycle and a short consented recording. Report unit, mocked browser, generated-camera, recorded replay, physical camera and microphone outcomes separately. Gestures are not repaired or certified by this blueprint.

Use the owner-accepted separated targets recorded in [ROOT_CAUSE_AND_LOCAL_PRACTICE_PLAN.md, section 18](ROOT_CAUSE_AND_LOCAL_PRACTICE_PLAN.md#18-latency-targets-and-measurement): sufficient evidence → visible feedback p95 ≤100 ms (broader fallback ≤150 ms, reported as a miss of the stricter target); first observable valid entry → confirmed visible result aim p95 ≤600 ms; violation event → speech dispatch aim ≤100 ms. Report actual audible onset separately. Normal verification makes zero model calls. Setup/reacquisition are separate measurements. Retain the existing 200–400 ms stability policy only where the approved persistent predicate needs it; a transient action must not acquire a new physical hold requirement. Gather at least 30 meaningful samples per device/scenario before claiming useful p95; the single full-workflow run proves the sequence, not statistical latency compliance.

**Pass condition:** one complete phone workflow meets all eight sections with no hidden scope reduction, unsupported success, manual per-step verification or optional-object startup blocker. Smooth-table startup alone and green unit tests are insufficient. Report functional sequence acceptance and statistically measured performance acceptance separately.

## 9. Open evidence, not open design

The design decisions above are fixed enough to implement. Three physical facts still need evidence rather than guessing: the phone clip's complete required action inventory, whether its nested objects have distinguishable visible features in the learner view, and the actual latency achieved on the owner's device. If any required action cannot be expressed/proven with the limited visual predicates, the correct result is a named capability blocker and scoped proposal—not a shorter supposedly equivalent lesson.

Only the step-window defect was newly reproduced in this follow-up, using an in-memory generated tracking timeline. Other conclusions come from the current code trace and the previously recorded reproductions. No new physical, model, microphone, browser-suite or deployment acceptance is claimed. This document is an implementation blueprint, not an implemented repair.
