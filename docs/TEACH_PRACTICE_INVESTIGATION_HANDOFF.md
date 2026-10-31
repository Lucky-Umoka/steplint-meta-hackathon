# Teach–Practice failure investigation and implementation handoff

Date: 2026-10-31 UTC. Inspected baseline: `04ab6db` (`feat: accuracy fixes for teach and occulusion`). This document is an investigation and proposed repair plan, **not an implemented fix or acceptance claim**. This task changes documentation only. No live Meta request was made for this investigation.

## 1. Read this first

**The current system has not demonstrated reliable full Teach → creator rehearsal → publish → learner Practice acceptance, even on the owned phone-unboxing recording. A different tutorial is not currently guaranteed to work.** Existing automated checks verify important contracts and safeguards, but do not establish physical-task accuracy.

The main problem is a chain of imperfect perception, overly brittle evidence representation, and insufficient diagnostic/recovery design. It is not simply small drawn boxes, not an established Meta outage, and not solved by increasing a confidence number. The architecture uses generic object IDs and action rules, rather than a runtime phone-specific script, but its evidence and tracker assumptions are much narrower than the intended product. Repeatedly tuning one clip is not a generalization test.

The owner wants automatic Teach and Practice, with optional creator corrections, camera-first learner guidance, a complete ordered checklist, relevant start/change/result/goal images, and deterministic verification. Preserve the full necessary sequence of each actual lesson. The phone recording is one regression example, not the definition of all lessons. Do not hardcode its colours, coordinates, object names, timing, or four-action count into production.

Do not promise arbitrary physical-task verification. A camera can support specific visible changes; it cannot establish hidden torque, force, electrical correctness, food safety, or other unobservable properties. A general workflow must explicitly identify supported conditions and report unsupported requirements without deleting them or calling them verified. Successful supported examples are necessary before expanding capability claims.

### Authorization and continuity

- Follow `AGENTS.md` and the current repair priority in `PLANS.md`; read `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TEACH_PRACTICE_REPAIR_PLAN.md`, and `docs/ACCURACY_GAPS.md`.
- The AGENTS introduction still describes Phase 1-era implementation status. Its security/verification invariants remain authoritative; historical completion text must not override the current failed acceptance record.
- Four recorded five-trial repair allowances are exhausted: **20 failed workflow attempts**, separate from older model/phase smoke successes. The unused `repair-followup` ledger is not an extra authorization to spend.
- The two new tests reported by the owner below are separate manual reports, not agent trials or proof of a new allowance. Their detailed responses were not supplied.
- This request authorizes investigation/reporting. A **future five-test allowance is not yet approved**. The next chat should inspect and propose its concrete implementation plan, obtain the requested approval, implement/offline-verify, then request the bounded live-test allowance. Never infer approval from this report.
- No automatic paid retries. Never deploy, add Firebase, change model providers or start later phases as part of this report.

## 2. What the owner's two latest errors mean

### Report A: generic failure during Finding objects

> Finding objects: Lesson processing or validation failed. Review the clip, selections, or draft; no success was assumed. Temporary upload deleted.

**Confirmed code path:** `src/server/teach/security.ts::safeError` returns that generic text for unclassified exceptions. `analyseGuide` retains a broad “Finding objects” stage around localization/refinement and related validation; its catch sanitizes the exception. `src/server/guide/http.ts` streams the resulting message. Zod failures outside explicitly wrapped compiler errors, malformed JSON, parser errors, and image-processing exceptions can therefore converge on similar messages.

**Not established:** the original exception, failing component/frame, provider response ID, schema issue path, exact request or build used in this manual test. There is no retained correlated artifact for this report in the four agent ledgers. A client-visible message cannot reconstruct discarded server exception details. Do not announce a guessed root cause as a confirmed fix.

**First repair:** typed, sanitized stage diagnostics and a private correlation ID; retain error class/code, validation paths without user values, provider status/incomplete reason/request ID where documented, exact operation and source-frame metadata. Give the creator one actionable message and a diagnostic export. Do not return secrets, prompts, full provider responses, encrypted source tokens, or unrestricted exception messages. A network failure, invalid model structure, and insufficient visual evidence need different codes and recovery paths.

### Report B: no reliable yellow-box geometry during checklist building

> Building the visual checklist: No reliable geometry for yellow phone box. Correct the proposed mark or use a clearer view. Temporary upload deleted.

**Confirmed code path:** `src/guide/compile.ts::compileGuide` looks for a sample for each used object with a non-null provider confidence at least 0.90, first at its selected frame, then anywhere in its track. If none exists it throws `No reliable geometry for ${o.label}`. This happens before constructing the full reviewable guide.

This message means that no sample for that selected object passed the current confidence gate in the compiler context. It does **not** prove the object was absent, the video was bad, the drawn box was too small, or the API call failed. Wrong outlines, identity drift, occlusion, low scores, missing records or correspondence errors can produce that context. The specific manual run remains uncorrelated.

The pipeline needs to preserve a non-executable partial draft and its unresolved object/action evidence, instead of losing the entire useful lesson at this exception. That requires a distinct draft contract, not filling an executable source box with an invented rectangle.

“Temporary upload deleted” is cleanup, not successful lesson creation. Retain this privacy policy; improve the recovery artifact rather than keeping provider uploads indefinitely.

## 3. Evidence inventory and all recorded repair outcomes

Detailed private data are ignored under `.media-lab/`; do not commit recordings, transcript payloads, tokens or private responses. Public historical reports: `REPAIR_VERIFICATION.md`, `ACCURACY_ROUND2.md`, `ACCURACY_ROUND3.md`, `ACCURACY_ROUND4.md`. Private ledgers are the attempt/count authority. Historical fixes differ by trial; none of these is an unchanged twenty-run benchmark.

| Batch / trial | Recorded failure or blocker | Follow-up/status |
| --- | --- | --- |
| repair-live 1 | Object discovery did not finish; original upstream reason not retained | Structured-response diagnostics added; exact old cause unknown |
| repair-live 2 | No reliable geometry for phone | Source grounding/geometry work; no approval |
| repair-live 3 | SAM could not reliably locate white tray | Concept/box grounding explored |
| repair-live 4 | White tray rejected; box refinement had package 0.984, tray 0.820 | 0.90 policy blocked source |
| repair-live 5 | Yellow box rejected, about 0.793 | More source views/points did not establish acceptance |
| repair-round2 1 | Source guide incomplete/unsupported tracking | Semantic discovery separated from exact-image localization |
| repair-round2 2 | No clear yellow-box outline | Short noun identities and exact normalized localization |
| repair-round2 3 | Three-step draft incomplete; tool actions unresolved | Native selected frames and before/after prompts; misleading removal/opening candidates caught in review |
| repair-round2 4 | Four-step draft, but lid/tool/tray and final goal unsupported | Removed undocumented outline padding; preserved per-frame prompts and removal semantics |
| repair-round2 5 | Spark draft incomplete, `max_output_tokens`, 6,144 tokens | Finite 12,288 ceiling and concise output; no retry |
| repair-round3 1 | Clear-cover outline unavailable | Planned alternate-view handling |
| repair-round3 2 | Invalid source frame/reference from discovery | Millisecond → actual decoded-frame mapping; old internal-frame-rate explanation remains a hypothesis |
| repair-round3 3 | Parsed tracking but unsupported full action sequence | Independent audit found tool point on hand, incomplete extent |
| repair-round3 4 | “plastic lid” concept matched tool caps, not cover | Reflective/transparent location-prompt routing |
| repair-round3 5 | “phone” concept had no match for wrapped phone | Reflective boxed checks; missing reference/action guards |
| repair-round4 1 | Cover rejected at 0.559 after clipping heuristic chose closed case | Removed the heuristic replacing a valid declared primary |
| repair-round4 2 | Cover 0.602/0.734; screwdriver concept crops empty | Distinct close-up localization, within existing request ceiling |
| repair-round4 3 | Difficult image masks below threshold; stopped before video | Optional image refinement separated from final video evidence |
| repair-round4 4 | Real video and four-step draft; no reliable screwdriver geometry | Removed unsolicited still detections from video anchors |
| repair-round4 5 | Real video and four-step draft; no reliable phone-tray geometry | Full acceptance still failed; no remaining allowance |

All twenty stopped before creator/learner Practice acceptance. Some returned incomplete drafts; others threw before a draft could be reviewed. Retained repair records report temporary-upload deletion. No physical MacBook Chrome warning latency or accepted full sequence was measured. Older isolated successful model calls must not be relabeled as successful workflows.

### Other historical errors and archive index

Earlier reports also cover cross-origin Teach rejection behind preview proxies, wrong access-token messaging, empty/gateway/malformed approval JSON, legacy review requirements (`conditionConfirmed`, `fromRegion`, `toRegion`), upload-button affordances, excessive learner controls and premature warning panels. Inspect `tests/teach.test.ts`, `tests/guide-http.test.ts`, `tests/api-response.test.ts`, `tests/dev-origins.test.ts` and `e2e/workflow.spec.ts` for current regressions. These are different from the latest source-geometry failures; do not disable origin checks, approval validation or auth to fix perception. HMR messages/favicon 404s are not evidence that SAM caused a failure. Historical implementation records are in `docs/PHASE1.md` through `docs/PHASE5.md`; their old completion claims do not close the current repaired-flow acceptance gate. `TEACH_PRACTICE_REPAIR_PLAN.md` records the UI/lifecycle redesign; `ACCURACY_ROUND2.md`, `ACCURACY_ROUND3.md` and `ACCURACY_ROUND4.md` retain detailed source fixes and their limits.

### Latest measurable results

| Object | Round 4 trial 4: frames at ≥0.90 / returned frames | Trial 5 |
| --- | --- | --- |
| Outer sleeve/box | 4 / 184 | 116 / 212 |
| Tray | 4 / 103 | 0 / 48 |
| Phone | 28 / 29 | 28 / 29 |
| Transparent cover | 220 / 223 | 215 / 223 |
| Tool holder | 77 / 206 | 58 / 197 |
| Screwdriver | 0 / 48 | 102 / 167 |

These are **provider-score coverage**, not accuracy percentages. Missing frames are excluded from the denominators above. Whole-clip counts do not establish correct identity or sufficient evidence at the required action interval. Improving one track while losing another is not a reliable overall repair. Trials changed code/prompts, so this is not an isolated causal experiment.

Round 4 elapsed times to failure were 90.7, 94.5, 101.7, 171.5 and 165.8 seconds. These are failed-workflow times, not warning latency or successful completion times. Billing was not retrieved.

An offline Chromium audit used the actual Teach frame extractor and owned recording. Frames 30, 97, 142, 172 and 202 matched independent FFmpeg decoding at 640×480, mean absolute colour-channel difference 1.90–2.10 on a 0–255 scale. Visual tool-frame inspection agreed. This narrows those failures toward perception rather than a gross frame-extraction mismatch; it does not prove every timestamp, rotation or browser path correct.

Latest earlier baseline checks: 292 unit tests, 14 mocked-provider browser tests, lint, TypeScript and production build passed; owner app was served on port 3000. **For this investigation, `npm test` was rerun: 292 tests across 30 files passed.** Browser/build checks were not rerun for this documentation-only task. Never describe mocked tests as real camera accuracy.

## 4. Confirmed architecture weaknesses and remaining hypotheses

| Finding | Evidence / location | Consequence and required response |
| --- | --- | --- |
| Error sanitization loses classification | `src/server/teach/security.ts`, guide pipeline/http catches | Owner cannot distinguish invalid model data, network trouble and weak visual evidence. Add safe typed diagnostics first. |
| One object can destroy draft review | `src/guide/compile.ts`, throw before steps are returned | Keep unresolved drafts separate from executable guides. Block approval, not useful inspection. |
| Model proposals have wrong identity/extent | Retained hand-positive tool point; wrong cover/tool locations; tray body omitted | Validate identity/foreground and source geometry, not just JSON shape or score. |
| Cross-view anchor pollution | Prior all-selected-image detections became prompts for an object | Restriction to declared views is implemented. Declared views can still be wrong; validate their correspondence too. |
| Uniform 0.90 threshold is not calibrated | Compiler, source evidence, evaluator; provider c varies by frame | Keep current safeguards until an independently validated replacement exists. Separate identity, localization quality, visibility, continuity and action evidence; do not call any single score “accuracy.” |
| All-frame continuity is brittle | `compileGuide`: every frame start→end must pass for involved objects | Natural hand occlusion can reject an otherwise observable before/after change. Design explicit correspondence witnesses; missing evidence itself must never pass. |
| Narrow executable action vocabulary | `CompilerOutputSchema`, `ConditionSchema`, `changeMetric` | V2 represents movement/separation, not general cooking/repair/assembly semantics. Add only tested observable condition adapters. |
| Motion is underconstrained | `changeMetric`: displacement magnitude or relative centre-distance increase; no general expected destination/direction | A sufficiently large wrong-direction move may satisfy a movement rule if other checks allow it. Need goal-relative target/relation conditions and wrong-destination tests. Scene checks do not eliminate this gap. |
| Physical geometry is approximate | Normalized 2D boxes and centre distances | No metric dimensions, depth, actual containment or torque proof. Perspective and orientation matter. Use local reference frames and uncertainty; no invented measurements. |
| Live tracker has limited invariance | `src/practice/appearance.ts`: 5×5 patches, up to 18 features, ±16-pixel search; similarity transform | Small/blurred parts, 3D rotation, fast motion and occlusion can lose tracking. Domain transfer is not demonstrated. |
| Local scores resemble model probabilities | Appearance matcher returns 0.90–0.99 from retained feature fraction | A tracking-quality mapping is not calibrated identity certainty. Use typed quality/provenance and separate acceptance policies. |
| Uncertainty recovery cannot prove missing history | Evaluator clears/requires fresh baselines; gaps >700ms invalidate current metric | Safe today, but legitimate occluded actions may require retry. Do not restore old proof automatically on reacquisition. |
| Global downsampling loses small-part detail | `use-guide-camera.ts` local frames capped to 640×480 | Preserve high-resolution native scene/crops for critical parts, while keeping bounded local tracking cost. |
| Transparent/reflective materials break simple texture assumptions | Real cover/phone failures; mask interior can show table texture | Track distinctive edges/material features and relative motion; background seen through plastic must not establish object motion. |
| Sparse recovery budget | `server/guide/security.ts`: 6 model calls/session, normally 3 Spark+SAM checks; process-local guide daily cap 32 | Adequate recovery across many steps is not demonstrated. Measure usage and budget needs; do not silently remove caps. |
| Practice scene/session state is process-local | Perception maps in server security module | Restarts or multi-instance routing can lose a session. Distinct deployment concern, not proof of current source failure. Keep single-process tests explicit; cloud remains deferred. |
| Structural edits need new evidence | `approveGuide` compares `structuralContent` | Current text edits are not the same as correcting geometry/rules. Provide targeted reanalysis + revised review receipt; never bypass signatures to allow edits. |
| Limits restrict generalization | MP4/H.264, 10–20.5 seconds, at most 600 frames and 1280×720; Teach video ≤2.8 MB, WAV ≤1.1 MB, route body ≤4,000,000 bytes; six objects/twelve steps in V2 | “Any tutorial” exceeds the current contract. Validate the combined body and show capabilities before paid processing; expansion is separately scoped. |
| Narration is currently required | `normalizeTranscript` rejects zero speech turns | A silent demonstration is not supported automatically today. Decide a typed visual-only draft path or explain this limitation before processing; never fabricate narration. |
| Shape ratio depends on image aspect | `server/guide/perception.ts::demonstratedShapes` divides normalized box width by normalized height | This is not a pixel-space aspect ratio across different frame shapes. Correct conversion uses `(right-left)*frameWidth / ((bottom-top)*frameHeight`; it still does not measure physical dimensions. Add 4:3↔16:9/rotation regressions. |
| Stage/session deadlines are independent | Source stream has a 280-second abort budget; SDK operations have their own deadlines; source token expires | Include typed deadline/cancellation reporting and preserve useful partial results. Check actual hosting runtime limits separately. No evidence that a deadline caused either new manual error. |

Additional hypotheses to test rather than assert: primary-view choice near blur/occlusion, compound nouns/instance confusion, too many prompts with inconsistent extents, insufficient source resolution, output truncation, schema-refinement failures despite structurally valid JSON, model nondeterminism, request timing/rate limits, and stale/mixed analysis artifacts. The generic manual error does not tell us which occurred. Do not blame the recording by default.

### Why passing tests and live failures coexist

Most tests exercise clean fixtures, expected payloads and deterministic rules. They protect against duplicate events, wrong order, invalid output, approval errors and lost-scene false passes. They do not independently label object identity in varied real video. Repeated live prompt edits changed multiple variables and lacked a stable labeled holdout set. The next iteration needs reproducible offline replay and error taxonomy before more paid inference.

## 5. Official API research and implications

Reviewed current official pages on 2026-10-31. Provider-specific contracts belong behind server adapters; runtime outputs still need application validation.

- SAM accepts a single concept phrase **or** box/point location prompts. A completed concept request can legitimately return no match. Results can vary between identical runs. Confidence is per record/frame; it is not a procedural-success metric. Video tracking must be indexed by returned source frame markers, including backward propagation. MP4/MOV with compatible codecs are supported; WebM/VP9 is not. Preserve the official `buildObjectPrompt`, `parseImageStream`, `parseVideoStream`, `frameIndexOf`, and `decodeMaskToRaster` path. [SAM prompting/limits](https://dev.meta.ai/docs/sam/segmenting), [TypeScript parser](https://dev.meta.ai/docs/sam/client-libraries).
- Spark grounding uses normalized 0–1000 coordinates; native image, crop and displayed overlay coordinates require explicit transforms. Multiple-image reasoning can compare context with close-ups, subject to payload/token budgets. It does not guarantee correct identity. [Image understanding/grounding](https://dev.meta.ai/docs/image-understanding).
- Spark can consume uploaded video references; reuse a Files API upload with `purpose=user_data`. The docs warn that Spark 1.3 audio understanding is not fully supported. Keep dedicated Voice transcription instead of substituting Spark audio. [Video/audio understanding](https://dev.meta.ai/docs/video-understanding).
- Muse Voice provides **turn-level**, not word-level timing; do not pretend a word identifies the exact action frame. Use speech as a temporal/search hint plus actual visual change. It is not a sound-event detector. [Speech to text](https://dev.meta.ai/docs/speech-to-text).
- Strict structured output constrains shape, not factual correctness, tracked identity or application invariants. Check the actual generated Responses schema and supported subset. Reasoning tokens consume the output ceiling, so truncation needs explicit diagnostics. [Structured output](https://dev.meta.ai/docs/structured-output), [Reasoning](https://dev.meta.ai/docs/reasoning).
- Mediabunny returns the decoded canvas timestamp/duration; `getCanvas` selects the last frame starting at or before the requested time. Sorted batch extraction can avoid repeated decoding. Retain/check actual timestamps and transforms. [CanvasSink](https://mediabunny.dev/api/CanvasSink), [WrappedCanvas](https://mediabunny.dev/api/WrappedCanvas).

No official documentation read establishes universal StepLint accuracy, a general physical-action recognizer, or guaranteed repeatable mask geometry. Adding Muse Wonder, open weights, Baseten or Modal is not the first repair. Compare models later using labeled evidence and explicit spending approval; see `MODEL_ROLES.md`.

## 6. Zoom and larger marks: what to implement and what to avoid

Treat these as three different controls:

1. **Review zoom:** enlarge the original frame/crop for human inspection, with pan and reset. Display a full-scene inset and object label. This improves review and optional correction; it does not improve captured evidence.
2. **Analysis crops:** retain native-resolution full scene plus bounded context/foreground crops. Crop size should depend on object pixel extent, motion and reference context, not just one fixed padding derived from the shortest image side. Expand when the object touches the ROI boundary; preserve neighboring anchor context. Only evaluate a predeclared bounded set of views/requests, with no automatic paid retries. Keep local high-resolution crops while using a cheaper global tracker.
3. **Camera capture zoom:** probe device/browser capabilities and settings first; do not assume a MacBook webcam has optical zoom. Optional supported camera constraints need explicit UI, failure handling and scene-realignment invalidation. Automatically moving a physical camera/zooming the input can invalidate previous coordinates. [Capabilities](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getCapabilities), [constraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/applyConstraints).

A digital upscale creates no new detail. Crop isolation can help a model focus; it cannot undo blur, occlusion or missing pixels. Ask for a closer/clearer view when evidence is inadequate. Do not use generative upscaling as verification evidence.

Separate **object extent**, **foreground mask**, **context ROI**, and **visual overlay padding**. Labels and handles may be visually larger without changing measured geometry. A bigger SAM prompt can capture the hand/table or adjacent identical object; a too-tight prompt can omit a shaft or box side. Test extent/identity against independent annotations rather than applying a blanket padding percentage. Preserve native↔crop↔normalized↔CSS/mirrored-camera transforms and rounding rules in one tested module. Include rotation, aspect ratio and half-open box bounds.

## 7. Proposed repair architecture

This is a proposal for the next chat to inspect, challenge, cost and refine. Do not simply append more prompt instructions and spend five more attempts.

### A. Diagnose and reproduce before changing perception

Implement a typed stage result/error envelope and private diagnostic bundle. Include analysis ID, build/model/prompt/schema versions, input hash, request ordinal, sanitized provider IDs/status, stage timings, schema issue paths, selected native frame times, crop transforms, candidate/track IDs and rejection codes. Preserve a bounded creator-local report on failure; default to no raw-media cloud persistence. Make retries explicit separate actions, never automatic model-call loops.

Capture failures at each boundary: media validation, upload, Voice transcript, discovery, time mapping, localization, crop, image parsing, video parsing, identity association, action compilation, approval and Practice. Distinguish bad input from unusable evidence and infrastructure failures. Export enough redacted data for offline reproduction. Do not rely on screenshots of a generic popup or keep paid work only in console output.

### B. Build an independent evidence benchmark

Create a consented local manifest with expected object identities, masks/boxes at selected frames, action ordering, visible before/change/result/goal intervals, distractors, occlusions and unsupported requirements. Start with the owned clip and at least two different supported tasks (for example placing parts into a tray and opening/removing items from different packaging). Add separate learner recordings with a changed background, position, pace and lighting. Test meaningful appearance variation only where identity remains observable.

Annotations must be independently reviewed; a model scoring its own generated marks is not ground truth. Keep a held-out lesson that is not used to tune prompts. Do not commit personal media. Public deterministic fixtures can use consented/synthetic patterns but must be labeled. Replay retained provider data offline; first convert reproduced failures into regression tests. Freeze baseline code/config/input for comparisons and change one hypothesis at a time.

### C. Separate semantic planning from verified scene evidence

Use Voice + Spark to propose ordered action intervals and semantic entities with distinct parts/containers/tools, spoken aliases, candidate instance counts and source provenance. Speech may lead or lag an action; one utterance can contain multiple actions. Search visual changes around that interval, not a uniform one-second slideshow or invented word alignment.

Keep an object hypothesis graph: appearance variants, material, visible features, reference relations, unresolved alternatives and actual source times. Do not identify “the screwdriver” solely by colour or assume an exposed cap proves the whole tool's identity. Use clear before/after keyframes selected for sharpness, pixel extent and low occlusion, with coarse scene context and close-up candidates. Candidate generation is not an observation.

### D. Establish identity and geometry before drafting executable conditions

Evaluate agreement among semantic identity, actual foreground, visible extent, temporal correspondence, background motion and independent source annotations. Track the same part through appearance changes, not just boxes with one ID. Reject multiple plausible instances; retain their alternatives for optional creator correction. Use mask/feature motion consistency and bidirectional checks to detect hand/background drift. Transparent regions need edge/material support and motion distinct from the background visible through them. Reflective appearance changes require explicit abstention/re-localization when correspondence fails.

Replace arbitrary whole-clip “trusted fraction” as the success criterion with action-specific evidence sufficiency. Keep raw provider confidence, local tracker quality and identity evidence separate. **Do not lower the existing 0.90 threshold to make trials pass.** A new evidence policy needs independent validation, typed provenance and adversarial tests before replacing the old gate. Never synthesize confidence, assume a clean crop is proof, or make a large rectangle count as object recognition.

### E. Introduce a real draft lifecycle and actionable repair

Define separate `AnalysisDraft`/`UnresolvedObject`/`UnresolvedStep` types from an approved executable guide. Required geometry may be absent in a draft, with typed reason and actual supporting frame references. No fake default coordinates. Show all necessary steps and one concise issue at a time: “I could not follow this tool while your hand covered it.” Display relevant before/change/result views and suggested optional correction/short additional view.

A draft with unresolved necessary actions can be saved as a draft, not published as verifiable. Creator edits to geometry or conditions trigger bounded targeted reanalysis and a new signed review artifact. Preserve original local media/derived progress so an error does not force retranscription and full processing. Reuse the provider file only while valid; if deleted/expired, explain any necessary new upload/request before spending. Keep expiration and deletion policies explicit. Human approval cannot convert unobservable claims into verified evidence.

### F. Define observable conditions and occlusion correspondence explicitly

Retain the pure deterministic evaluator as sole authority. Add a versioned evidence/condition contract only for supported actions, with explicit before predicates, expected transition, result predicates, reference frame/alignment, confidence provenance, timing/debounce and recovery. Possible initial adapters: entering a target region relative to a visible container/workbench; moving away from a known reference in the approved direction/range; visually evidenced exposure/opening of a selected part. “Opening” must not reduce to arbitrary package displacement or exposed-item presence alone.

For a gap, store a **candidate** before-state, never a verified transition. A proposed correspondence witness must validate the same unique object, known before relation, known after relation, unchanged/proven scene transform, bounded elapsed time, prerequisites already satisfied at the relevant time, no contradictory intervening evidence, and adequate visible state difference. Model perception can propose correspondence, but cannot grant success or edit rules. Without those witnesses, remain `needs_verification` and request a fresh visible attempt. Wrong-order actions performed behind an obstruction must not be retrospectively credited.

Keep current tests preventing success from reacquisition. Add positive tests only for the new explicit witness contract, plus negatives for identity swaps, removed-before-start objects, scene changes and occluded wrong order. If no safe correspondence method is established, keep abstention rather than implementing an optimistic gap bridge.

### G. Make Practice an evidence-driven camera loop

States: selecting → camera/setup assistance → grounded starting scene → Ready or observed supported start → active guidance → temporary verification wait/re-localization → correction/retry or completed goal. Face/empty views are setup, not learner errors. Show the camera, one instruction and progress; reveal detailed diagnostics only on request.

Use multi-resolution local tracking with native ROI detail, multiple appearance exemplars and foreground constraints; benchmark speed/rotation/scale limits before selecting a new algorithm/dependency. Handle off-screen parts, repeated objects, lighting changes, dropped frames and transparent surfaces. Use bounded remote scene checks on meaningful uncertainty/change, not every frame. Measure recovery usage and latency before requesting any budget change. A paused tracker or exhausted remote budget must lead to clear assistance, not a frozen confusing page or success.

Setup alignment should use task-relevant relationships and observable initial states, not literal training-camera pixels, one table colour or assumed physical dimensions. Appearance can vary between teacher and learner, but ambiguous identity cannot be solved merely by requesting higher confidence. Retain explicit error/unknown states.

### H. Make review, rehearsal, versioning and completion coherent

Render a concise visual checklist with labeled start → change → expected result per step, goal before/after, real transcript turns and meaningful source frames. Deduplicate redundant frames for display, without discarding machine evidence. Optional zoom/corrections belong primarily in creator review. Learners should only select a guide, start the camera and follow guidance.

Creator rehearsal and learner practice use the same approved immutable contract and evaluator; private rehearsal cannot publish an unresolved guide. Save pinned guide revision, method, evidence-policy version and analysis provenance. Alternative valid methods are explicit method variants, each with its own validated sequence/evidence—not an accidental order relaxation or a revision replacing all alternatives. Preserve signature verification and require review after structural changes.

Completion requires every approved step plus visible final goal. Keep existing active-work/break/verification-wait/setup timing separation and provenance. ETA is an estimate; creator duration is not a population benchmark. No performance ratings based on unvalidated tracking or invented averages.

## 8. Proposed implementation order and files

Complete these stages offline before a new live allowance. File names for new modules are proposals; the next chat should inspect current conventions and produce the final scoped diff plan.

| Order / exit gate | Existing files to inspect/change | Proposed focused modules / tests |
| --- | --- | --- |
| 1. Reproducible safe failure reports | `server/teach/security.ts`, `server/guide/{structured,pipeline,http}.ts`, Teach streaming consumer | `guide/diagnostics.ts`, private bounded diagnostic storage/export; tests for Zod/JSON/parser/network/truncation/cleanup errors |
| 2. Independent replay baseline | `scripts/smoke-workflow.ts`, existing `.media-lab` artifacts, tests | Consent-aware benchmark manifest, offline provider replay, annotation review/metrics utility; no live calls in tests |
| 3. Coordinate/zoom contracts | `teach/media.ts`, `server/guide/{localization,crop,refine-source,ground-seeds}.ts`, `use-guide-camera.ts` | Pure coordinate transforms/ROI planner, review zoom; tests for resize/crop/mirror/rotation/out-of-bounds/native time |
| 4. Draft vs executable lifecycle | `guide/{schema,compile}.ts`, `server/guide/{pipeline,http,security}.ts`, Teach review/library | Separate draft schema and migration; component repair flow; unsigned/unresolved approval rejection and signature regression tests |
| 5. Identity and evidence sufficiency | `guide/evidence.ts`, source planning/localization/segmentation adapters | Typed object correspondence and quality provenance; failures replayed from retained results; distractor/transparent/hand-background tests |
| 6. Supported transition contract | `guide/{schema,compile,evaluator}.ts`, Practice pipeline/scene gates | Versioned before/after condition adapters and candidate-gap witness; pure false-pass/wrong-destination/wrong-order/recovery tests |
| 7. Local tracker/recovery | `practice/{appearance,similarity,camera-motion,resume-alignment}.ts`, Practice UI/hook, server perception/security | Multi-resolution appearance and recovery scheduling; bounded offline real-video tracker benchmarks; caps/freshness/race tests |
| 8. Complete browser journey | Teach/Practice/library/versioning/timing and e2e | Creator draft repair/rehearsal/save → separate learner selection/setup/guidance/completion; mocked infrastructure failures; camera permission/error recovery |

Avoid a single large component or untyped catch-all “AI manager.” Keep perception adapters, evidence validation and procedure decisions separate. Avoid duplicate legacy/V2 paths silently applying different policies. Preserve legacy tests while making active-path ownership explicit. Update architecture/decisions and version/migration notes with material changes.

## 9. Required tests and measurements before paid testing

- Reproduce each class of retained failure offline; sanitized errors identify exact stage/component/reason. Generic fallback retains an actionable correlation ID, not raw secrets.
- No swallowed schema paths; no out-of-range timestamps, duplicate object/frame records, malformed masks, mismatched IDs, inconsistent crop projection or missing transcript turns reach approval.
- Independent object/foreground identity and extent measurements: box/mask overlap where annotations exist, identity switches, track loss/recovery, foreground-versus-background contamination. Report per object and action; do not hide failed objects inside an average.
- Action interval recall/completeness, unsupported/invented step counts, wrong-order detection, false verification and abstention rates. Keep teaching-model scores distinct from measured correctness.
- Negative scenarios: camera faces learner; no work area; pre-existing completed goal; missing required part; similar distractor; right object into wrong destination; wrong order; duplicate/stale events; lens covered; fast motion; camera movement/zoom; hand occlusion; identity swap; pause/restart; missing final goal; budget exhaustion.
- Positive supported scenarios: fresh correct sequence, legitimate optional retry, repeated use of the same object, validated correspondence only where implemented, completion persistence and active-time accounting.
- Different task/learner setup on held-out footage, rather than only new prompts for the same phone recording. Unsupported tasks should receive an understandable capability result, never a misleading executable guide.
- Production lint, strict types, unit tests, relevant browser tests and build. Review diff/secrets. Never rebuild a directory currently served by Next. `STEPLINT_VERIFY_BUILD=1` uses `.next-verify`; normal production uses `.next-production`. Restore appropriate developer type imports after build as needed, without discarding owner changes.
- Measure per-stage elapsed time, request count, provider usage where available, browser responsiveness and detected-change→displayed-warning time. Distinguish replay from physical camera. No sub-second or zero-error claim without data.

## 10. Proposed next five live acceptance trials — not yet authorized

Do not spend these merely to discover another generic error. First meet the offline gates, independently inspect source annotations, freeze build/config, and give the owner the concrete model/input/count/cost notice. Recalculate request bounds after implementation; the previous ceiling (18 Teach + 6 per actor = 30 model requests) is historical, **not permission for a larger design**. Include failed attempts, cleanup requests, expiration policy, SDK retry=0, no fallback models, and actual spend accounting if available. The owner must approve the new bounded plan.

1. Existing phone sequence: full necessary opening/case/tool/phone history. Inspect before/change/result and all references before test-only review. If eligible, creator rehearsal → save → learner replay. Stop on any false identity, missing necessary action or unsupported guide; fix offline before trial 2.
2. Different supported tutorial: new objects/task and creator clip, same end-to-end path. Do not prefill its expected steps in runtime code. Independent expected sequence prepared for evaluation only. Stop/fix on failure.
3. Held-out learner scene: different arrangement/background/lighting and supported appearance variation; actual camera where available. Correct setup and sequence; measure guidance and completion. Recorded replay alone does not satisfy a physical-camera gate.
4. Wrong action/order and correction: violate an actual selected guide rule, show the correct warning/reference/recovery, correct it and reach the goal; also try a wrong destination and an already-completed initial state. No invented violation when evidence is merely unclear.
5. Uncertainty/reliability: obstruction, similar object, view loss/re-localization, breaks/retry, then fresh correct evidence and goal. Repeat required stable segments/conditions within the approved bound. Do not report this as statistical proof of universal reliability.

Each live trial is conditional on the previous retained result being inspected and its failures fixed. Some will stop before Practice if source is invalid; record **not reached**, not pass. Never force all five to run after a blocker just to use the budget. If a new consented tutorial/learner clip is unavailable, ask for it instead of inventing evidence. Test-only automated review is not owner approval of a real guide.

### Acceptance and future-phase exit

Require: independently correct complete source and references; creator review/corrections with no raw schema/JSON failures; same verifier in rehearsal and learner flow; at least one different supported task; real camera setup and valid start; actual wrong-order warning/recovery; uncertainty does not pass; correct steps and final goal complete; timings/latency recorded; no secret exposure; cleanup confirmed or expiry fallback accurately reported. Repeatability must be demonstrated on frozen conditions, not inferred from one lucky run. Zero false passes in the planned small acceptance set is a release gate, not a measured population error rate of zero.

Only then review the deferred roadmap in `FUTURE_WORK.md`: longer/chunked lessons, cloud/shared persistence, additional models/hosting and wider task coverage. Some local evidence/identity repairs are prerequisites now; Firebase and new models are not substitutes for them. Expand limits only with explicit capacity/cost/design review.

## 11. Handoff instructions for the next chat

1. Read this report and authoritative repo docs, inspect current git status/commit and active files. Do not assume this report's hypotheses are proven or its proposed filenames mandatory.
2. Inspect retained artifacts privately. If unavailable in a new workspace, rely on the public summaries and request a redacted diagnostic export; do not claim access to missing data.
3. Independently calculate the failure tree, condition semantics, coordinate transforms, benchmark design, runtime recovery and paid-request bounds. Propose the smallest complete staged repair that addresses those findings, with explicit unsupported cases and migration risks.
4. Present the concrete implementation plan to the owner as requested. Do not claim approval/working accuracy from this document. After approval, implement and pass offline gates before asking for a new five-trial allowance.
5. Record each actual result and revision. Preserve historical ledgers and the full lesson scope. Do not spend exhausted allowances, approve missing evidence, turn a score into an accuracy percentage, or claim Practice acceptance without actual Practice results.

The most useful immediate change is diagnostic and draft/evidence separation, followed by independently tested identity/transition handling. Another broad prompt, a larger rectangle, more confidence wording or another five unchanged calls is not an adequate repair strategy.
