# Practice and voice: root-cause investigation

Date: 2026-11-02 UTC. Inspected branch: `main`, commit `18d7807`.

**Scope: investigation and this report only. No application code, UI, configuration, dependencies or existing documents changed. No paid API calls, deployment, commits or pushes.** The owner's `PRACTICE_FIX.MD` remains unchanged.

## A. Findings that explain the broken workflow

The canonical Practice flow already has local camera capture, a tracking worker, deterministic verification, and feedback wiring. Its main failure is the contract between automatic initialization, object identity loss, and recovery. The system can fail before verification starts, or continue capturing frames after losing the only evidence that could advance a step. Voice has separate, concrete problems: default Teach does not mount voice controls, and Practice's camera-start branch does not always restart verification.

These are confirmed code mechanisms, including two reproduced tracker failures. **There is not enough current physical-camera evidence to identify which one occurred first in the owner's most recent attempt.** The supplied diagnostics describe a different, older engine. This report does not claim the full physical workflow has passed.

| Finding | Evidence level | User-visible consequence |
| --- | --- | --- |
| Automatic setup depends on source-image appearance and either two fixed object anchors or matching table features | Code trace and generated-pixel reproduction | Camera appears, but tracking never starts on some legitimate workbenches |
| A lost movable identity cannot recover while global calibration stays valid | Code trace and generated-pixel reproduction | Practice runs indefinitely without useful observations after occlusion or identity ambiguity |
| Starting Practice with the camera off returns before rearming automatic startup | Confirmed handler/state trace | After a stop or camera failure, one start command can open the camera without starting verification |
| Canonical Teach has no mounted voice-command hook | Current imports/render tree and historical deletion | Spoken Teach commands cannot execute through the canonical recorder |
| Practice deliberately ignores start/resume commands during its own speech | Parser reproduction and hook trace | Transcript appears but the requested action is ignored |
| Required lesson scope can be narrowed before review; rehearsal completion is not a save gate | Current review/save code | A shortened lesson can be approved without proving that the requested full sequence works in Practice |

### 1. Setup requires stronger scene equivalence than the product promises

Entry point: [Practice page](../src/app/practice/page.tsx#L14) → [PracticeEntry](../src/app/practice/practice-entry.tsx) → [LocalPractice](../src/app/practice/local-practice.tsx).

After loading an approved lesson, LocalPractice requests automatic startup. The camera callback attempts initialization. In [bootstrapLocal](../src/practice/local-tracking.ts#L329):

1. Saved Teach image regions establish identities; this is local appearance matching, not fresh semantic recognition of the real objects.
2. Fixed-object alignment needs at least two matched fixed anchors. [alignFixedObjects](../src/practice/automatic-alignment.ts#L120) rejects fewer than two and checks their separation and translation consistency.
3. Without those anchors, [alignStartingView](../src/practice/automatic-alignment.ts#L31) searches outside the object regions for three spatially separated, consistent table-patch matches between Teach and Practice. Source/current image dimensions must agree. This estimates translation; it does not solve arbitrary scale, rotation or perspective changes.
4. Every source object must then be observed with score at least `0.9`. Initial fixed-object geometry must match within `0.015` normalized edge distance. These are appearance/geometry checks, not calibrated probabilities of semantic correctness.
5. Only a successful worker calibration enters normal tracking. After five automatic initialization errors, [LocalPractice](../src/app/practice/local-practice.tsx#L711) sets `automaticWanted=false` and stops automatic attempts.

**Why this is a root cause:** a valid procedure and functioning camera are insufficient to satisfy this initialization contract. A bottle and one fixed plate, on a smooth or different table, may lack both supported alignment mechanisms. Even an identical image can fail when the background does not supply enough distinguishable features. Retrying the same scene cannot create those features. Changing tables is therefore not generally supported by the current implementation, despite the intended roughly equivalent workbench setup.

Read-only reproduction, using existing exported functions and a 160×120 deterministic image:

| Scene | Source/live relationship | `bootstrapLocal` result |
| --- | --- | --- |
| One textured movable object, one textured fixed anchor, smooth background | Identical pixels | Rejected: “Finding the demonstrated work area…including clear table features.” |
| Same object/anchor layout, textured background | Identical pixels | Successful initialization |

This is generated-image evidence, not a test of the owner's camera or bottle. It proves a concrete setup restriction without any API, browser version or hosting dependency.

### 2. Loss of a movable identity is permanent, but does not trigger automatic recovery

[measureNative](../src/practice/local-tracking.ts#L70) returns an ambiguous detection immediately when `profile.lost` is true. Depending on the tracking method and partial-identity evidence, a failed measurement sets that flag. Overlapping moving identities can also set it.

[trackLocal](../src/practice/local-tracking.ts#L213) invalidates calibration for workspace/reference failures. A lost **movable** object, however, can coexist with `calibrationValid=true`. Its following frames remain ambiguous because of the sticky lost flag.

The [LocalPractice recovery branch](../src/app/practice/local-practice.tsx#L813) automatically bootstraps again when `!reply.calibrationValid`. It does not handle a lost movable identity with valid global calibration.

The resulting state is:

```text
camera frames continue
  → worker continues replying
  → movable identity remains lost
  → global calibration remains valid
  → automatic reacquisition branch is never entered
  → no reliable transition evidence reaches the verifier
  → no verified progress, correction or completion
```

Read-only reproduction using `calibrateLocal` and `trackLocal`, patterned after the existing local-tracking fixture:

| Input frame | Global calibration valid | Object quality | Object lost flag |
| --- | --- | --- | --- |
| Object visible | true | observed | false |
| Object hidden | true | ambiguous | true |
| Same object restored to same position | true | ambiguous | true |

This is especially relevant to continuous movements: hands, rotation, temporary occlusion and close interactions are normal events. The code's identity protection is understandable; silently assigning an unrelated object would be wrong. **The missing piece is a bounded, evidence-preserving recovery transition, not blindly clearing the lost flag or treating ambiguity as success.** The existing test “does not silently reacquire a lost identity” in [local-tracking.test.ts](../tests/local-tracking.test.ts) protects against identity swaps but does not establish end-to-end automatic recovery.

### 3. Camera restart and Practice restart are different transitions in the handler

[halt](../src/app/practice/local-practice.tsx#L269) clears `automaticWanted`, stops the worker and ends active processing.

In the [voice action handler](../src/app/practice/local-practice.tsx#L997), `start-camera`, or `start-practice` when the camera is off, starts the camera and returns. It does not set `automaticWanted=true`. That happens in a separate [start-practice branch](../src/app/practice/local-practice.tsx#L1026), reachable when the camera was already active.

Therefore, after a halt—such as stopping the camera or a camera failure—“Guide, start practice” can successfully open the camera while leaving automatic verification disabled. A second start command with the camera already active can take the other branch. Initial lesson loading does set the flag, so this does **not** prove every first start fails.

The header camera action also needs to be considered in the same state trace. A camera preview is not evidence that a tracking session was initialized or armed.

### 4. Teach voice is absent from the default route

The canonical [Teach page](../src/app/teach/page.tsx) renders [LocalTeach](../src/app/teach/local-teach.tsx), whose [Capture](../src/app/teach/capture.tsx) has recorder button handlers but no `useVoiceControl` hook or mounted gesture-to-recorder bridge. There is no global listener in the root layout to supply that missing connection. Review likewise has no canonical voice-action registration.

History confirms the cause: commit `ca07327` removed the voice hook, command handler, voice panels and gesture controls from the Teach recorder, and removed its voice preference provider. [DECISIONS.md](DECISIONS.md) records the simplification as “Voice and gesture controls removed from Teach entirely (Practice only).” That is the current behavior regardless of the owner's earlier expectation that Teach voice should work.

The older Teach implementation still contains voice code, but it is on the explicit legacy path. Finding that code or passing tests for it does not prove canonical Teach voice works. A transcript reported on some other screen must be traced to its actual mounted listener; it cannot establish a command bridge in the canonical recorder.

### 5. A Practice transcript is recorded before command acceptance or host completion

[useVoiceControl](../src/voice/use-voice-control.ts#L100) updates the heard text before applying the command decision. [decideDisposition](../src/voice/commands.ts#L86) requires a recognized wake prefix and an exact allowed phrase, applies duplicate/confirmation guards, and blocks most actions while `speechSynthesis.speaking` is true.

Read-only calls to the actual decision function returned:

| Final transcript | App speaking | Decision |
| --- | --- | --- |
| `Guide, start practice` | false | executed |
| `Guide, start practice` | true | ignored |
| `Guide, pause practice` | true | executed |
| `start practice` | false | ignored |

Thus the supported phrase is not generally broken by its regex. Recognition, command eligibility, host dispatch and achieved state are four distinct checkpoints. In addition, host callbacks that initiate asynchronous camera startup do not acknowledge its final success; “Command sent” is not “Practice is running.” The cold-camera defect above occurs after a valid command is recognized.

Browser speech recognition availability, permission and service failures remain possible device-specific blockers. They do not explain the confirmed absent Teach listener or the deterministic restart/recovery defects. No actual microphone test was performed here.

### 6. Draft acceptance and a complete, executable lesson are different contracts

Several upstream gaps matter even if tracking startup is repaired:

- [automaticSetupPlan](../src/teach/automatic-setup.ts#L43) builds references for all procedure components. A moving object's seed can come from its own first step, later than the initial scene. Bootstrap nevertheless tries to observe **every** component before starting. A hidden object introduced later can produce a valid sequential lesson with no simultaneously visible startup state. The [arming logic](../src/practice/pipeline.ts#L361) also checks the first step for each moving component. This contract needs a component visibility/lifecycle strategy; it is not solved by faster frames.
- [Review's `autoNarrowed`](../src/app/teach/review.tsx#L123) automatically calls [narrowToVerifiableScope](../src/teach/review-suggestions.ts#L108) when requirements are unsupported. It keeps retained requirements and prerequisites, removes other steps, filters goal IDs, and can assign the last remaining step as the goal. A visible notice identifies dropped requirements, so this is not entirely hidden. Nevertheless, it can change the intended lesson scope. It is a supported explanation for shortened instructions; the owner's particular bottle artifact is needed to prove it happened there.
- [Rehearsal](../src/app/teach/review.tsx#L293) can swallow automatic reference extraction errors and hand off `automaticSetup=undefined`. Loading a rehearsal and displaying its steps therefore does not prove automatic Practice can start.
- [Save and open Practice](../src/app/teach/review.tsx#L813) persists the approved artifact and routes to Practice. It does not require an observed completed rehearsal. The current rehearsal test checks popup/lesson rendering, not camera verification, recovery or completion.

These facts explain why a schema-valid, human-approved or successfully saved artifact is weaker evidence than the requested complete physical workflow.

## B. Where the first failure occurs

There are several distinct first-failure paths, rather than one universal location:

| Scenario | First failing boundary | What follows |
| --- | --- | --- |
| Smooth/different table with insufficient fixed anchors | Automatic scene alignment | No normal tracking session; repeated setup eventually stops |
| Unavailable later component at startup | All-components initialization / arming | Camera visible, sequential procedure cannot start normally |
| Successful startup, then movable identity loss | Tracker loss → recovery orchestration | Continuous frames, ambiguous observations, no automatic recovery |
| Restart following halt | Command/camera startup → automatic session startup | Camera opens without rearming tracking |
| Spoken command in canonical Teach | Page mounting → voice listener/action registration | No command dispatch exists there |
| Practice start command during app speech | Transcript → command eligibility | Transcript appears, command deliberately ignored |

The supplied `.media-lab/steplint-practice-diagnostics.json` records:

```text
version: practice-capture-repair-2
method: visual-relations-v1
timestamp: 2026-11-01T08:25:57.551Z
camera: active, 568 frames
flow: armed=false, busy=false, locating=false, queued=0, finished=false
voice: off
verification events: 0
tracking notice: local circles unavailable in this view
```

It proves camera capture occurred without an armed workflow in that older run. It cannot prove a current `local-zone-v2` bootstrap/lost-identity failure, and it contains no voice-recognition attempt to diagnose. Its camera processing average is not end-to-end verification or speech latency.

## C. Actual pipeline and files responsible

| Boundary | Current implementation | Investigation result |
| --- | --- | --- |
| Demonstration → draft | `src/app/teach/local-teach.tsx`, server Teach pipeline | Exists; no new live provider/semantic acceptance tested here |
| Draft → review/approval | `src/app/teach/review.tsx`, `src/teach/review-suggestions.ts` | Narrowing can alter scope; review gates are not runtime acceptance |
| Review → rehearsal | `review.tsx`, LocalPractice rehearsal handoff | Opens in-memory draft; automatic setup can be absent |
| Approval → saved lesson | `review.tsx`, approved-procedure storage | Local persistence; no mandatory successful rehearsal |
| Lesson selection → room | `practice/page.tsx`, `practice-entry.tsx`, `load-approved-lesson.ts` | Local schema-validated handoff; no canonical Teach-token requirement |
| Camera → worker | `local-practice.tsx`, `use-guide-camera.ts`, tracking worker | Local frame loop exists; startup/restart can stall before usable observations |
| Worker initialization | `local-tracking.ts`, `automatic-alignment.ts` | Reproduced scene-feature restriction |
| Worker tracking → recovery | `local-tracking.ts`, `local-practice.tsx` | Reproduced permanent movable-loss state with no automatic recovery branch |
| Observations → verdict | `src/practice/pipeline.ts`, deterministic evaluator | Receives quality/timestamped evidence; cannot verify an absent transition |
| Verdict → UI/speech | `local-practice.tsx` | Feedback wiring exists; not a substitute for useful observations |
| Transcript → action | `src/voice/commands.ts`, `use-voice-control.ts`, page handlers | Default Teach missing; Practice has eligibility and restart-state gates |

Route distinction matters: `/practice?legacy=1`, or a nonempty `guide` or `test` query, selects the older engine. `/practice?lesson=...` selects the canonical local engine. Bare `/practice` is the intended lesson chooser. Saved lessons are browser/origin-local; a guide saved on localhost does not automatically appear on a deployed origin or another browser.

There is also no dedicated per-request worker-response deadline in the traced startup path. A missing response can leave the busy gate blocking new submissions. This is a code-level failure mode requiring a browser reproduction, **not a demonstrated cause of the latest incident**.

## D. Assessment of the three proposed diagnoses and test evidence

| Proposal in `PRACTICE_FIX.MD` | Verdict against current code |
| --- | --- |
| Practice waits for a paid backend model on every check; create a new synchronous local loop | Incorrect for the canonical route. The local camera/worker/verifier loop already exists. Proposed `PracticeMode.tsx` is not the canonical implementation. A worker is not inherently the problem. |
| Teach provides only vague text without strict zones | Incorrect as a general diagnosis. Canonical loaded procedures require execution data and validated setup/zone bindings. Valid zones still do not guarantee measurable live identities. |
| Saved appearance and table matching make startup brittle | Substantially supported and reproduced. More precise: two qualifying fixed anchors avoid the source-table alignment branch; otherwise multiple source-table matches are required. “Pixel-perfect” overstates the actual tolerance. |
| Every object is subject to the same 1.5% movement constraint | Incorrect. Initial fixed geometry uses 1.5%; ongoing fixed-object checks use a different bound. Movable tracking is not simply this fixed-position constraint. |
| Add SAM fallback or loosen thresholds | A proposal, not a diagnosed repair. Must not silently change provider/spending or weaken identity evidence. Does not by itself fix missing lifecycle/recovery transitions. |
| Session-bound Teach receipt/token blocks all Practice | Stale for canonical Practice. `load-approved-lesson.ts` loads a locally validated approved artifact without a receipt verification request. Legacy rules must be assessed separately. |
| 30 fps or same-millisecond red/voice is assured by a synchronous loop | Unsupported. Sensor capture, tracker processing, evidence confirmation, rendering and speech each contribute delay. None of those targets was physically measured here. |

Evidence from this investigation:

| Category | What actually ran / result |
| --- | --- |
| Static inspection and history | Current routes, handlers, worker/tracker, approval/save, schemas, diagnostics, relevant docs and `ca07327` deletion inspected |
| Generated-image function probes | Lost identity remains lost after restoration; smooth-background bootstrap fails while textured equivalent passes |
| Voice parser function probes | Four decisions reproduced as reported above |
| Unit suite | Not run during this report-only investigation; existing tests read, no new suite-pass claim |
| Mocked browser tests | Existing source inspected; not executed here. Teach recorder test clicks buttons; rehearsal test opens popup. These do not establish spoken Teach control or physical completion. |
| Recorded-video replay | Not run here |
| Actual physical camera, microphone or gestures | Not tested here; owner reports remain failed acceptance |
| Live Meta/Baseten integration | Not called here |
| Lint / typecheck / production build / deployment | Not run here; no application changes to validate or deployment success claimed |

The generated probes ran in memory with `node --import tsx --input-type=module`, importing `calibrateLocal`, `trackLocal`, `bootstrapLocal` and `decideDisposition`. Images used the existing tracker's deterministic 160×120 fixture layout, with a hidden/restored object or a smooth/textured background. No files, network inputs or credentials were involved.

## E. Smallest repair sequence to propose next — not implemented

1. **Add precise gate diagnostics to the existing canonical path.** Record startup state, per-object loss, latest worker reply age, arming reason and command → host outcome. Do not add a parallel Practice implementation.
2. **Unify camera/start/resume orchestration.** A start request must reach camera-ready, worker-initialized and verification-armed states, or surface the exact blocked gate. Test fresh start, denied-then-granted permission, stop/start and retry after five setup failures through canonical page actions.
3. **Add explicit per-identity recovery.** Keep ambiguous evidence unverified, preserve audit/history, invalidate affected evidence as appropriate, and reacquire only with sufficient identity evidence. Do not clear `lost` unconditionally. Regression: observed → occluded → same object returns → evidence-based recovery; wrong replacement must remain unverified.
4. **Repair the Teach-to-Practice setup contract.** Preserve reviewed semantic object identity and approved goal geometry while grounding real objects in the live scene. Table texture must not be a mandatory substitute for object identity. Model visibility and first-use lifecycle for later components. Reject genuinely unobservable tasks explicitly rather than automatically deleting their required scope.
5. **Treat full requested scope and executable rehearsal separately from approval.** Make dropped requirements explicit scope changes, preserve continuous transfers, and prove the complete intended goal rather than just a retained substep. Surface reference extraction failure instead of opening an apparently ready automatic rehearsal.
6. **Restore canonical Teach command registration if approved as the repair scope; verify Practice commands through actual page transitions.** Reuse existing actions. Test start/pause/resume/stop and command refusal while guidance speaks. Microphone/gesture recognition requires separate real-device acceptance after dispatch tests.
7. **Run one full physical acceptance, then independent lessons.** Measure observed event, confirmation, visible feedback and speech onset separately. Prove wrong action, uncertainty, correction, reversal, recovery and completion without per-step buttons. Only then make performance or completion claims.

This sequence does not require redesigning the UI, replacing the deterministic verifier, adding provider calls per frame, raising timeouts or lowering confidence thresholds as the primary fix.

## F. Most useful real-world acceptance test

Use the owner's continuous bottle-to-white-plate procedure, real objects unchanged, roughly the demonstrated camera angle and an ordinary table. Use one newly reviewed artifact with the **whole continuous move** and final plate destination, not an isolated lift.

1. Record build commit, exact route/query and approved procedure ID. Open the canonical lesson room and confirm startup state, per-object observations and arming—not just camera preview.
2. If startup fails, capture the exact alignment/object error and stop calling the trial a verification test. This directly tests the first gate.
3. If startup succeeds, briefly occlude the moving bottle with the hand and restore it at its starting location. Check whether object loss recovers while the workspace remains valid. This targets the reproduced recovery dead end without substituting fixtures.
4. Perform the continuous transfer, a clearly wrong placement, correction into the approved goal and a clearly observed reversal when the approved rule requires persistence. Verify the corresponding evidence/audit events and completion behavior.
5. Stop the camera, then say “Guide, start practice” once while the app is silent. Verify camera **and tracking/arming** resume. Separately test during guidance speech and inspect the explicit command decision.

This is a proposed manual test, not performed in this investigation. It should use safe objects and does not establish hardware-damage prevention. A separate complete unboxing lesson must test concealed/later-introduced components; success on the bottle alone cannot prove that lifecycle works.

## G. Evidence needed to pinpoint the latest physical incident

The current [diagnostic export](../src/app/practice/local-practice.tsx#L1111) includes tracking counters, measurements, events, latency summaries, evidence frames and voice history, but omits several critical orchestration states.

For a decisive report on the latest run, capture or instrument:

- Build commit and exact URL/query; canonical versus legacy engine; selected approved artifact and whether this is rehearsal.
- Automatic reference availability, fixed/movable identity counts, source image dimensions and first required visibility of each object.
- Camera permission/ready state, actual frame dimensions, frame age and processed count.
- `running`, `starting`, `automaticWanted`, automatic failure count and latest exact initialization error.
- Worker generation, outstanding request age, submissions/replies/dropped-busy counts and worker errors.
- Per-object method, quality, score, `lost`, geometry, global calibration state and explicit arming blocker.
- Final transcript, listener status, command disposition, speaking flag, dispatched action and achieved host state.
- Last verifier decision and reason, active step, approved goal IDs, correction/recovery events and timestamped visible/audio feedback.

Do not publish raw evidence images, private lesson recordings, microphone transcripts or secrets as part of a public diagnostic report. Sanitized state summaries are enough for the first comparison.

## Changes, remaining failures and acceptance status

**File created:** `docs/PRACTICE_ROOT_CAUSE_REPORT.md` only. Application source, UI, Teach/Practice behavior, model adapters, environment files and the supplied diagnosis document were deliberately left unchanged.

**Confirmed unresolved defects/contracts:** initialization scene restrictions; no automatic recovery for a lost movable identity with valid calibration; incomplete cold-camera restart orchestration; absent canonical Teach voice registration; unsupported scope/lifecycle and rehearsal acceptance gaps described above.

**Not established:** which current gate first failed on the owner's latest physical attempt, real-device gesture/microphone behavior, achieved physical latency, accurate completion of the full requested lesson, or deployed end-to-end acceptance. The historical diagnostics and existing automated test descriptions cannot supply that missing evidence. This investigation is complete as a report; the product repair and physical acceptance remain outstanding.
