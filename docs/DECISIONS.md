# StepLint decisions and assumptions

Statuses: **Decided** means a project constraint or design choice; **Proposed** means intended but not yet implemented; **Awaiting verification** means a technical fact must be established before relying on it. Phase 1 source now exists; actual verification and unresolved live access are recorded in [PHASE1.md](PHASE1.md).

| Topic | Status | Decision / rationale |
|---|---|---|
| Coding agent | Decided | Muse Code is the only coding agent and follows [AGENTS.md](../AGENTS.md), the single authoritative instruction file. Muse Code's use does not itself demonstrate runtime application integration with Meta models. |
| Application stack | Decided | Prefer one TypeScript application (Next.js App Router, React, Node, Zod, Vitest) over competing frontend/backend stacks. Add infrastructure only for a demonstrated need. |
| Runtime/toolchain | Proposed | Prefer Node 22 and npm, subject to compatibility verification with current SDKs and packages. |
| Meta model roles | Proposed; awaiting verification | Planned Muse Spark for evidence interpretation/draft reasoning, SAM 3.1 for visual detection/segmentation/tracking, and Muse Voice Transcribe for speech-to-text. Verify identifiers, endpoints, payloads, limits, and pricing from current official documentation before implementing. |
| Evaluator authority | Decided | A deterministic, typed TypeScript evaluator decides procedural pass/fail; a model is not the sole judge. This supports explicit, reproducible rules and tests. |
| Evidence threshold | Decided | Object presence does not prove an action or state transition. Insufficient/ambiguous evidence remains unverified. |
| Human approval | Decided | Model-generated procedure drafts require human review/edit/explicit approval before Practice mode can use them. |
| Test and spending policy | Decided | Mock-first automated tests; live smoke tests are separate, bounded, and explicitly invoked after telling the owner which model and why. Hackathon use is not assumed to be free. |
| Controlled demo | Decided | Use blue base, yellow support, red latch; installing support precedes closing latch. Demonstrate premature latch closure, evidence-supported correction, and recovery without claiming arbitrary-task accuracy. |
| Media scope | Decided | Start with a short clip and stage media compatibility validation before relying on recording or upload infrastructure. Provide an existing-file fallback if needed. |
| Media tooling | Awaiting verification | Mediabunny is a candidate only. Inspect actual browser codecs/MIME and current endpoint upload requirements first. |
| Hosting and uploads | Awaiting verification | Vercel is planned, not selected as a proven media host. Verify current request-body, execution-time, and upload constraints before choosing proxy or direct upload. |
| Real-time perception | Awaiting verification | Prefer local frequent updates with bounded model re-localization where feasible; measure latency and reliability before claiming real-time behavior. |
| Hackathon requirements | Decided | The official participant guide is authoritative. Keep the repository public and accurately represent work created, model use, licenses, consent, and demonstrated limitations. |

When implementation or a compatibility experiment changes a status, update this record with the evidence and link relevant results from the appropriate project documentation.

## Phase 1 implementation decisions (2026-10-29)

- Use the existing Node 24.21.0 environment; declare Node 22.12+ or 24.x compatibility. Next.js requires >=20.9, the OpenAI SDK >=22, parser >=22.9 (or ^20.17), and Vitest ^22.12 or ^24. Node 22 is a compatible declared baseline, not a tested runtime here.
- Use the official `openai` SDK, fixed Meta base URL, `muse-spark-1.3`, and `sam-3.1`, confirmed against official Meta docs. Runtime responses still require successful live verification.
- Use only `@meta-sam/parser` 0.1.0; graphics/video packages are unnecessary in Phase 1. Inspected the published SAM License: custom terms require preserving the license on redistribution. Other direct dependencies use MIT, except the OpenAI SDK (Apache-2.0).
- Keep credentials lazy and server-only; no model calls from health, pages, automated tests, or builds. Explicit live scripts use one request each, no retries, a timeout, and an approval flag.
- SAM smoke input is a repository-owned generated PNG; decode output using the official parser and reject incomplete or diagnostic-bearing results. This validates connectivity and geometry parsing only, not procedure understanding or accuracy.

- Turbopack builds fail in this workspace because the CSS worker cannot bind a local port, including after an escalated retry. Use Next.js's documented bundled Webpack option for both dev and build; this changes the bundler, not TypeScript or test requirements.
- Retain ESLint 9.39.5 because installed Next.js plugins declare support through ESLint 9; ESLint 10 produces invalid peer dependencies. npm marks ESLint 9 deprecated. Revisit when those plugins support 10; no peer checks are suppressed.
- Vitest mocks only the `server-only` module marker in local tests because its runner does not apply Next.js compiler conditions. Production modules retain the real marker. Unit tests forbid network access through a failing fetch stub and assert zero calls.

## Phase 1 live verification (2026-10-29)

After explicit owner approval, one `muse-spark-1.3` text request and one `sam-3.1` image request succeeded, with automatic retries disabled. Spark returned completed output matching `STEPLINT_OK`; SAM's completed streaming result parsed without diagnostics and yielded one box and one nonempty mask decoded by the official parser. These exact request paths are now verified; broader model accuracy and all later-phase capabilities remain unverified. See [PHASE1.md](PHASE1.md) for commands and bounds. No billing lookup was made.

## Phase 2 evaluator decisions (2026-10-29)

- Keep the audit input log canonical: pure `verifyEvents` validates and replays up to 10,000 events instead of accepting caller-supplied passed states. No persistent storage or incremental-performance claim is introduced.
- Initial condition language is `enters_zone`, one step per component. Require clear observations on both sides of a zone change; uncertain or missing evidence never supplies a pass. Named zones and confidence are upstream evidence, not inferred by the evaluator. Demo threshold 0.9 and lesson/reviewer metadata are explicitly synthetic.
- Enforce array order plus prerequisite and forbidden-transition references. Reject non-increasing event times and intervals spanning prerequisite verification rather than inventing temporal order. Schema references must point backward, ruling out cycles.
- Loss of a verified component condition invalidates its ordered suffix. Correction requires fresh observations; an early closure is never retroactively passed when support is later verified.
- Deduplicate both event and observation IDs across resets/retries within a session log. Keep timestamped outcome history, evidence references, missing prerequisites, and teaching recovery guidance. Retry/reset clear progress, not historical violations or deduplication.
- Invalid structure throws ZodError; missing human approval blocks evaluation with an explicit error; valid uncertain evidence returns `needs_verification`. Actual reviewer authentication belongs to the later Teach workflow. See [PHASE2.md](PHASE2.md).

## Phase 3 media decisions (2026-10-29)

- Use unmodified Mediabunny 1.63.0 (MPL-2.0; public source/license notices included), documented encoding probes, and Conversion API. A temporary browser-local MediaRecorder container is transcoded to H.264 MP4; WebM is never sent to SAM. Browser encoders/decoders remain capability-dependent.
- Initial Linux Chromium measurement: H.264 available, AAC unavailable. Produce explicitly video-only MP4 and extract WAV from the original Opus microphone track; do not install a speculative codec plugin. An existing MP4/H.264 fallback requires no H.264 encoder.
- Use primary tracks and bounded media (≤20 MB, 10–20.5 s, ≤600 frames, ≤1280×720 pixels; PCM16 mono WAV ≤1.1 MB). Validate actual format/codec bytes and owner-approved SHA-256 before paid requests.
- Keep paid smoke operations in server-only CLI scripts, not public HTTP routes. Files upload uses user_data; SAM video uses input_video/file_id with official streamed video parser and frame indices; cleanup deletes the uploaded MP4. Voice uses its own ASR multipart endpoint and exact WAV contract. Disable retries; approval is per bounded run.
- Phase 3 local/browser results using fake devices are separated from the subsequent successful owner-approved live calls on real recordings. Files upload, SAM video parsing, cleanup, and Voice transcription are verified for that path. Browser coverage and perception/transcript accuracy remain limited; see [PHASE3.md](PHASE3.md).

### Phase 3 live evidence (2026-10-29)

One owner-approved MP4 upload, one sam-3.1 video request (prompt selected from a local preview), one confirmed upload deletion, and one muse-voice-transcribe-1.0 WAV request succeeded without retries. SAM returned 214 decoded box/mask pairs across 214 of 223 source frames; no geometry was returned for nine frames. Upload took 4.409 s; segmentation/parsing 10.551 s; transcription 4.200 s. Only validated compatibility is claimed. Raw media, hashes, and the full transcript remain in ignored local storage; the public record contains aggregate evidence only.

## Phase 4 Teach decisions (2026-10-29)

- Preserve the single Next.js/TypeScript stack and existing ProcedureSpec; no new runtime dependency or database. Separate shared Teach schemas, browser media/UI, server provider orchestration, and small HTTP routes.
- Stage the workflow so transcription precedes component marking. Upload the MP4 once, retain its file ID inside an authenticated encrypted short-lived reference, and reuse it for one multi-object SAM video call. Do not depend on process memory across Vercel invocations.
- Correct the Phase 3 expiration assumption: current official Files docs support explicit expires_after with a minimum of 3,600 seconds. Request this one-hour lifetime, require it in upload metadata, and also delete on compile/discard/failure. Default uploads without this policy still do not expire.
- Restrict the complete multipart body to 4,000,000 bytes, MP4 to 2.8 MB and mono PCM WAV to 1.1 MB. Read/count actual bytes before paid calls; preserve codec/duration/frame validation from the spike.
- Muse Voice uses ENDPOINTING for actual turn timestamps. SAM uses official box/point prompts, source frame indices, include_confidence and official streaming/mask parsing. Spark receives bounded text evidence and strict-schema output with approval forced null. Generated observations never decide procedural pass/fail.
- Require a separate high-entropy TEACH_ACCESS_TOKEN for paid owner routes; use HttpOnly owner cookies, same-origin checks and encrypted stage/session references. No API key or private environment value is returned to the browser. No multi-user role system or distributed exactly-once spending claim is made.
- Approval repeats structural/evidence validation and requires explicit per-step review plus supported, non-overlapping zone mappings and ordered confidence-supported before/after frames without gaps. An integrity receipt accompanies exported artifacts; Phase 5 must validate external artifacts before execution.
- Browser checks use explicitly mocked provider results; the agent does not approve the owner's lesson. The real-recording batch smoke remains a separate approved run. See [PHASE4.md](PHASE4.md).

- Live draft validation rejected a forbidden transition referencing a non-earlier step. Keep the deterministic schema strict; explicitly explain rule ownership, backward references and empty first-step rules in Spark instructions, rather than silently modifying model output. Report the failing stage and confirmed/unconfirmed cleanup without secrets.
- Accept the exact server-configured Codespaces/Vercel public origin or optional TEACH_PUBLIC_ORIGIN to support TLS reverse proxies; do not trust arbitrary forwarded-origin headers. Keep origin rejection for other sites.

- Teach origin guard also accepts the browser-controlled `Sec-Fetch-Site: same-origin` signal with a valid HTTP(S) Origin, so preview/reverse proxies can rewrite internal Host/port without rejecting legitimate relative fetches. Explicit cross-site/same-site metadata is rejected; absent metadata retains the exact-origin allowlist. Authentication remains required. Reference: https://www.w3.org/TR/fetch-metadata/ (Sec-Fetch-Site and reserved Sec- headers).

## Phase 5 Practice decisions

- Preserve the approved ProcedureSpec and existing pure evaluator. Frequent observations use local saturated-colour connected components and area checks; no remote SAM or language-model rule override. User colour sampling is appropriate grounding for this controlled fixture; tracking loss asks for intervention rather than paid re-localization.
- Accept three fresh frames spanning at least 400ms, reject stale timestamps, emit uncertainty immediately, and require fresh start-to-target evidence after loss. Short continuously visible transit has a bounded 1.2s grace; target loss and ambiguous matches never receive that grace.
- Bind imported Teach exports to their original approval digest and owner session before use. The hand-authored fixture is separately and explicitly approved by the user; no synthetic approval is represented as an actual Teach lesson.
- Lock zone calibration during verification. Speech uses approved text only. Keep camera frames local, cap event logs and expose reset/retry, source reference and detected-change-to-warning measurement. Physical-camera performance and arbitrary-task accuracy are not inferred from synthetic tests.

## Automatic-first Teach refinement

- Default to Spark video component proposals followed by one multi-object SAM tracking request and a second Spark drafting request. SAM requires a concept or geometry and does not autonomously interpret a procedure. Reuse the same uploaded file ID; use Muse Voice for transcript rather than relying on Spark 1.3 audio.
- Keep automatic discovery capped at four boxes and 1,800 output tokens, final drafting at 6,144. Explicit preview consent names one Voice, one SAM and two Spark requests. No retries or new live smoke runs without approval; previous manual-path live successes are not automatic discovery evidence.
- Suggest review zones only from clear contiguous SAM tracking, never fill missing evidence or tick human review. Show a few object-labelled moments instead of exposing hundreds of frames by default. Keep manual correction optional.
- Save approved exports through a bounded, one-use session-storage handoff to Practice; server approval-receipt validation is unchanged. No new dependencies or infrastructure.

## Teach approval and progress follow-up

- Extract evidence validation so review readiness and server approval use identical confidence/gap/order/zone checks. Never enable approval solely because a reviewer name and whole-procedure checkbox are set. Give actionable missing-zone/checklist messages, preserving explicit human approval and unsupported-evidence rejection.
- Lower only the suggestion candidate-displacement cutoff from 10% to 5%; do not relax actual evidence or approval rules. Rechecking suggested zones uses cached structured tracking and makes no model request.
- Use a native accessible processing dialog with real stage transitions, explicit background/cancel controls and honest stopped states. No fake progress percentage, implicit retry or model request is introduced.

- Configure Next development asset/HMR origins separately from Teach API CSRF/auth checks. Use hostname-only explicit loopback/current-workspace/public-origin entries per the installed Next 16.4.3 docs; do not permit arbitrary `*.app.github.dev` origins. Browser testing reproduced blocked HMR and absent hydration before this fix and passed the approval-to-Practice flow after it.

## Simple interaction and live grounding follow-up

- Use visible shared file-picker buttons and centred feedback for meaningful outcomes; keep routine tracking updates quiet. Move detailed explanations under Help while retaining consent, evidence blockers, live state and corrections.
- Prefer Spark-proposed positive interior points for automatic SAM grounding after live box-proposal trials produced weak confidence. Keep official point utilities and all evidence thresholds unchanged. Do not manufacture approval to resolve a blocked recording.
- Five owner-approved automatic live trials were consumed. Last three point-grounded runs produced evidence-eligible candidates (two synthetic-fixture runs and one owner-recording run). Real human approval and physical-camera practice are separate from model request success. See PHASE4.md for per-run outcomes.


## Response boundaries, timestamp alignment and grounding audit

- Validate complete approval/import payloads after reading response text safely. Preserve original validated approval JSON for receipt digest consistency; no empty/non-JSON response may become success. Keep drafts available after errors and never retry a paid compiler automatically.
- Isolate verification builds from the directory of an active Next server to avoid manifest-read failures. Keep exact host/auth protections in place.
- Feed bounded Voice turn timestamps to discovery; map proposal times to actual decoded frame indices. Speech is a timing hint, never geometric or action evidence.
- Freehand Spark points missed visible object interiors in additional live trials. Request bounded normalized object boxes and derive a central positive SAM point on the server. Reject invalid boxes, retain official parser/utilities, preserve uncertainty and human review, and measure returned geometry against synthetic ground truth rather than assuming confidence alone proves correct identity.


## Browser-first repair decisions (2026-10-30)

- Owner authorized implementation after the revised plan, with five sequential new live workflow trials. Document deferred infrastructure, long lessons and future model hosting rather than expanding this repair.
- Use a V2 guide contract for repeated-object steps, explicit evidence and final-goal checks, preserving legacy verifier regression coverage. No model output directly sets success. Published rules are signed; canonical validated content removes JSON key-order dependence. Test actor artifacts carry `testOnly` and do not imply owner review.
- Save guides/reference images in IndexedDB for the current origin/device. Keep practice reading separate from creator unlock, while bounded paid perception stays server-side. Rehearsal is private and separate from publication. Revisions are not alternative methods.
- Camera assistance starts on camera activation; Ready or a clearly observed task action starts scoring only from a suitable fresh baseline. Setup, camera motion, uncertainty and already-complete scenes cannot invent past success.
- Use up to four native candidate images alongside video during discovery when the upload bound permits, without extra model requests. Native coordinates and actual frame times matter. Separate covers/contents from containers. Treat missing geometry as missing.
- Live trial 1 returned no completed usable discovery output and stopped safely; deletion confirmed. Improve documented output-text extraction and add prompt-free status/reason/token diagnostics before the next bounded trial. Raise discovery output cap from 1,800 to 3,000; do not claim truncation as the first cause without retained evidence. No automatic API retry.

- 2026-10-30 acceptance: all five new repair trials failed before approval/Practice. Keep the 0.90 evidence policy, preserve failures, delete temporary uploads and stop paid tests at the approved cap. Do not describe this as a working real-camera workflow. Post-trial mask-constrained local features and UI/storage fixes require fresh live acceptance before any accuracy claim.

## Accuracy/timing repair, second owner-approved batch (2026-10-30)

- Version 0.3 adds measured local session timing and observation availability. Availability and provider confidence are not calibrated accuracy. Setup is excluded; explicit breaks and verification waits are separate; completion requires the final approved goal. Local averages require three completed runs and never imply a population benchmark.
- The owner superseded the temporary phone-removal-only scope: preserve the full necessary demonstrated sequence. Already-removed presence cannot stand for its history. No unshown repair is invented; unobservable necessary actions remain unresolved.
- Separate semantic discovery from exact single-image Spark localization, using the documented 0–1000 grid before converting to SAM pixels. Group at most six relevant parts into at most four localization calls, keeping the eight-call Teach bound. Keep official SAM streaming/parser utilities and the 0.90 evidence gate.
- Ground source objects in their selected clear frame, not frame zero based on a model's initial-visibility flag. Retain literal spoken names only when found in the actual Voice transcript turn.
- Camera setup does not use a face-only view as the workbench. Old verified pixel-space goal references cannot survive unproven scene realignment. This deliberately abstains rather than inventing completion.
- First two trials of this separate five-trial allowance failed before approval/Practice: incomplete source geometry/coverage, then unavailable source outline. Three remain before the next run. No automated retry, no physical-camera acceptance claim.


## Exact action moments rather than a coarse shortlist

- Split automatic source analysis into two authenticated streaming stages, reusing one Meta upload through an encrypted, expiring source context. The browser decodes the actual requested source frames; validate indices, metadata, JPEG dimensions and session ownership before further paid requests. No process-memory rendezvous or cloud storage is added.
- Dynamic discovery reads video and Voice timing without an evenly spaced still-image shortlist. At most eight exact-image localization calls cover root and declared before/after views. One missing root does not cancel valid planned alternates; each image is requested once, never retried automatically. No unavailable view becomes evidence.
- Spark reasoning counts within the output budget, per [official reasoning documentation](https://dev.meta.ai/docs/reasoning). A real 6,144-token incomplete response justified a finite 12,288 ceiling and concise drafting instructions. Do not claim the limit fix is live-verified until a completed parsed response is received.
- The owner authorized a third separate five-trial allowance. New planned bound is 12 Teach model requests plus 6 per creator/learner session, 24 maximum per trial; announce purpose/models/cost before each run. Preserve all prior failures and conservative approval/verification gates.

## Retained-failure follow-up

- A real noun-concept request returned no phone for the wrapped object. Use boxed checks for reflective and transparent parts; use noun concepts for small opaque objects. This routing passed SDK/parser simulation, not a subsequent live trial.
- Check all relevant parts in each already-selected source image; prefer an uncut view when a primary is unavailable/clipped. This does not add image calls or turn a proposal into evidence. Real SAM geometry, source validation and creator review remain necessary.
- Preserve required planned actions and reference objects. Allow an opening to use observed cover motion plus newly exposed contents when before-state contents are hidden; do not weaken a removal into generic movement. The source action wire uses nested `anyOf`, matching the [official strict schema subset](https://dev.meta.ai/docs/structured-output).
- First-stage upload carries media once without unused coarse images. Clear short-lived camera frame history/overlays on pause and completion, and skip local tracking once off/paused/finished.

## Fourth acceptance repair

- Remove the clipping heuristic that chose a less useful closed-case seed. Retain the declared valid action view and bounded planned alternates.
- Pin existing Sharp 0.35.5 directly for native-pixel concept crops (Apache-2.0; Node >=20.9). Translate actual parsed masks back by the crop offset; no resized geometry or invented points.
- At most six predeclared SAM image views, with unavailable results preserved. Only accepted mask-derived foreground points enter video tracking. Confidence is a provider score, not measured accuracy. Full trial bound remains 30 model requests, no automatic retries.

- After trial 2, reserve unused slots inside the eight-image Spark ceiling for distinct close-up interpretations of difficult parts. Project cropped bounds/points back, then use documented SAM location prompts; no noun guess or failed-call retry. Refined points remain untrusted until accepted real SAM geometry. Full-frame unrefined points stay out of video prompts.

- Image seed checks are optional refinements for automatic video grounding, not procedural observations. Rejected checks return no mask/point; location proposals may still guide the documented multi-frame SAM video call. Final continuous high-confidence geometry, ordered action checks and human review remain unchanged. This avoids equating an image preflight rejection with proof the video cannot be tracked.

- Trial 4 exposed identity drift from incidental still detections. Limit video anchors to declared per-object appearances; still inspect all relevant objects in selected images. Large opaque part location points may guide SAM as proposals, while demonstrated risky small/reflective/transparent guesses stay out unless confirmed. Only parsed video observations feed source verification.

## Stage 1 repair: diagnostics and draft separation (2026-10-31)

- Teach stream failures now carry a typed sanitized diagnostic bundle (`src/guide/diagnostics.ts`): correlation ID, stage, failure class/code, validation paths without values, documented provider status, frame/object references, elapsed time and upload-cleanup state. Creator messages stay authored-safe; raw exception text never reaches the browser. Non-stream JSON errors are byte-identical.
- `compileGuide` returns an executable `Guide` or a reviewable `AnalysisDraft` (`src/guide/draft.ts`), never a lesson-destroying throw for missing structure. Metric-weak steps keep the existing Guide-with-blockers path; only structurally missing evidence (no geometry, bad intervals/refs/order) becomes a draft. Approval explicitly rejects drafts. No evidence threshold was changed.
- Verified offline only: 305 unit tests, typecheck, lint, format check and isolated production build. No live Meta request was made for this change; real-recording acceptance remains pending.

## Draft failure attribution follow-up (2026-10-31)

- The first live run against the Stage 1 repair returned a reviewable draft (5 of 6 objects tracked; tray best 0.841) with all five steps unsupported. Code inspection confirmed this is genuine hand-occlusion discontinuity, not a counting bug: SAM emits samples only for segmented frames and the compiler requires every interval frame at ≥0.90.
- Unresolved draft steps now record failing frames (frame, timestamp, missing/low-score, first 60 plus true total), unobserved endpoints and absent result objects. The repair view shows each step's start/change/result interval. No evidence policy or threshold was changed; weak-but-complete evidence still returns a guide with unsupported steps.
- Verified offline only: 309 unit tests plus typecheck, lint, format check and isolated production build. No threshold was lowered and no gap-bridging was introduced; the witness contract for occluded actions remains future work.

## Live trial round 5, trial 1 (2026-10-31)

- Owner granted five live Teach trials; the manual baseline run is uncharged. Ledger: `.media-lab/repair-round5/ledger.json` (cap 5, trial 1 recorded failed).
- Trial 1 ran the owned clip (sha 455dd049, 2.1 MB, 223 frames) through the direct V2 pipeline: 28 model calls (1 Files, 17 SAM/video Responses posts, 10 Spark creates), maxRetries 0, no fallbacks, 188.6 s, upload deleted. A browser-driven run was impossible (agent-sandbox chromium cannot reach any local server; Next cannot enumerate interfaces unsandboxed-only) so the identical paid-call path ran in Node with ffmpeg-extracted source frames (a substitution the earlier FFmpeg audit supports).
- Outcome: reviewable draft, approval not reached, Practice not reached. Tray best 0.796 (need 0.90). All six steps unsupported. New attribution data shows: per-object clean runs exist but sit outside the action intervals (box clean 101–222 while its step spans 21–71); the tray poisons every interval it touches; s5's intervals genuinely overlap (cover placed 154–161 while screwdriver taken 142–159), which sequential steps cannot represent. Billing was not retrieved. Four trials remain.

## Attribution completion, offline only (2026-10-31)

- `no_measurable_change` is now three typed reasons: `metric_unavailable` (null, with per-dependency endpoint frames tagged by object id, covering anchors as well as primary objects), `insufficient_change` (measured below range, value recorded), `implausible_change` (measured above range, value recorded). Same 0.15/12 bands; no threshold changed. Guide path behavior is byte-identical (codes stripped as before).
- Failing frames are sorted in time order across involved objects; repair UI shows friendly object labels instead of component ids.
- Synthetic fixtures added for anchor-endpoint failure, insufficient vs implausible bands, time-ordered multi-object frames, valid adjacency (no false overlap flag) and draft approval rejection.
- Verified offline only: 314 unit tests plus typecheck, lint, format check and isolated production build. No live Meta request, no commits, no staging changes. Access-token auth, approval signatures, storage and unrelated UI untouched. Round-5 ledger unchanged at 1 of 5.
- Remaining, explicitly out of scope: opening/exposure condition semantics (needs Teach+Practice contract together), occlusion witness/identity correspondence, targeted reanalysis UI, Guide-blockers detail, physical-camera acceptance.

## Clip trials 2+2, first supported guide (2026-10-31)

- Owner-approved 2 Teach runs each on steplint_video2.mp4 (sha 30ff37e6, 2.53 MB, 18.1 s) and steplint_video3.mp4 (sha 75441cf8, 2.35 MB, 16.7 s). Ledger `.media-lab/repair-clips/ledger.json` is 4/4 used. Direct-pipeline runs, maxRetries 0, 14–16 calls each, ~100 s each, uploads deleted.
- video2 t1/t2 and video3 t1: guides returned but single steps unsupported (same hand-occlusion pattern). video3 t2 PASSED Teach: step s1 [64→80→88] supported with measured minChange 0.392, no uncertainties, goal supported, bottle tracking 248/248 trusted. Simpler high-contrast scene plus a tight interval inside clean tracking.
- Status blocked before approval: reference images, human step/goal review and the approval seal all require the browser flow plus the creator; the agent cannot self-approve. No Practice without that. Round-5 still holds 3 unspent trials; no further agent spend without a new notice.

## Replication: video3 passes 2 of 5, intervals decide (2026-10-31)

- Three round-5 replication trials on steplint_video3.mp4 (trials 2–4, 12–14 calls each, ~100 s each, 0 retries). Round-5 ledger is 4/5; clips ledger stays 4/4. Six requested runs exceeded every remaining cap, so only the 3 available ran.
- r5t2 PASSED Teach again (step-1 [64→80→97] supported, goal supported). r5t3 failed (wide [24→78→104] interval, step and goal unsupported). r5t4 failed (separation step [16→80→105], anchor lid confidence below 0.90 — the anchor-attribution case live).
- Across five video3 runs: 2 Teach passes, 3 fails. Tracking itself is 248/248 clean; the dominant variable is which interval the model proposes. Passing is not repeatable on demand — re-rolling analysis until a tight clean interval lands is the current mechanism, not a fix.
- Practice remains gated on a browser approval the creator must perform. Nothing further will be spent without a fresh notice.

## Fresh-grant video2 pair completes 3+3 quota (2026-10-31)

- Owner granted 2 more video2 runs (new cap-2 ledger repair-clips2, now 2/2). Same Teach-only direct path, 12 and 16 calls, ~84–95 s each, 0 retries, uploads deleted.
- video2-t4: guide, step unsupported on the [99→126→135] interval. video2-t5: reviewable draft — squeeze bottle best provider score 0.894 across 270 samples, six thousandths under the gate, honestly refused.
- Final per-clip totals: video2 = 5 runs, 0 Teach passes; video3 = 5 runs, 2 Teach passes. All ledgers full (round5 5/5, clips 4/4, clips2 2/2): 11 agent trials, 0 retries, billing never retrieved.
- The 0.894 near-miss confirms the gate holds where it matters: near-passing scores are refused, not rounded up. No further spend without a fresh grant plus notice.

## Clip quotas complete, all allowances spent (2026-10-31)

- Final trial (round-5 trial 5) gave steplint_video2.mp4 its third run: guide returned, step-1 [108→117→126] unsupported again, goal supported. Approval and Practice not reached. 16 calls, 83.4 s, 0 retries.
- Per-clip totals: video2 = 3 runs (0 Teach passes), video3 = 5 runs (2 Teach passes). Both ledgers full: repair-round5 5/5, repair-clips 4/4. No agent live trials remain in any allowance.
- Standing result: the only approved-path candidate remains the video3 supported guide (tight interval inside clean tracking). Everything else fails honestly on occlusion-driven discontinuity. Any further live work needs a fresh owner grant plus the model/count/cost notice.


## Practice review and control repair (2026-10-31)

- Preserve the distinction between advisory local appearance tracking and deterministic evaluation of model-observed physical relationships. Correct the prior documentation that claimed local box geometry could establish general touching/containment/closure. Retain explicit destination support rules and repeated, current goal evidence.
- Review the actual SDK landmark type (`NormalizedLandmark[][]`): one list per hand. Map the designated control strip across the viewport so ordinary controls outside the video can be reached. Open-palm pause requires that same control zone.
- Stop and release speech recognition when disabled/paused; do not automatically restart after permission/service errors. Bound duplicate suppression to immediate repetitions, cancel stale destructive confirmation on another executed command, and require an activation prefix.
- Render immutable Practice display snapshots rather than reading mutable evaluator/timing refs in JSX. Maintain event-time measurements through an explicit browser-clock adapter; no verification rules or lint rules were disabled. Exclude only vendored MediaPipe runtime code and ignored private lab artifacts from authored-code linting.
- Record paid tests separately from provider mocks and recorded replay separately from physical-camera acceptance. Preserve the new owner caps of seven tests per additional clip; do not spend remaining tests merely to repeat an unchanged failed configuration.

### 2026-10-31 — Command dispatch and source diagnostics acceptance

Accept explicit `Guide` and `StepLint` activation (including spaced `Step lint`) with allowlisted screen-specific commands. Show why ignored speech did not act. Relationship resume shares the button's fresh-baseline continuation; instruction requests never verify or skip steps. Acceptance includes actual browser recorder/camera state changes, not parser-only tests. Keep physical microphone acceptance separate.

Use typed, authored relationship evidence errors and stage wrappers for source failures. Return specific safe validation reasons, preserve the primary cause if cleanup fails, and log only sanitized correlation metadata. Reference 1979985f could not be reconstructed from retained logs. Do not infer a historical cause or relax evidence gates.

Timing medians average the middle pair; other percentiles use nearest-rank. A bounded appearance search visits all pixel parities because refining one coarse peak cannot recover an arbitrary skipped sharp texture peak. Missing/competing evidence still abstains. See LIVE_FLOW_AUDIT.md for real replay and browser acceptance evidence.

## Local procedural Practice migration (2026-11-01, owner authorized)

- Default Teach/Practice share an approved V2 ProcedureSpec. Reuse existing review, receipt validation, zone pipeline and verifier; retain old Guide libraries explicitly rather than reinterpreting signed bytes.
- Keep Meta load-bearing in recorded Teach perception/drafting. Normal Practice decisions are local worker measurements plus the deterministic verifier, with no remote semantic check per action. No new provider or dependency was added.
- Require explicit goal/capability coverage and human confirmation. Zone measurements establish visible transfers, not hidden contact force, torque, electrical correctness or damage prevention.
- Preserve source policy >=0.90; local tracking scores are measured similarity/quality, not provider probabilities or accuracy percentages. Null legacy overlay scores remain null. Native surfaces, dense appearance and feature modes are selected at calibration; no marker dependency or silent identity reseeding.
- Distinguish continuously visible partial identity from full geometry. Partial identity can preserve transit history but cannot verify an endpoint or confirm a reversal. Lost/competing identity stays unverified.
- Automatically establish the initial scene, use local endpoint stability and separate event time from confirmation. Monitor persistent goals until Stop. Resume requires fresh calibration and evidence but retains proven historical actions; restart is explicit.
- Browser tests have a default deny rule for paid routes unless the test supplies an explicit mock. Physical camera, actual speech/gesture accuracy and new live compiler behavior remain separate acceptance gates. No live model requests, commits, pushes or deployment occurred in this implementation run.

### 2026-11-01 — Restore UI and make normal setup automatic

- Owner rejected the replacement layout and mandatory manual calibration. Restore existing Teach cards/progress and the dark companion; keep camera/companion side by side, with workflow panels below. Keep their row visible while scrolling normal Practice; optional manual editing must remain unobstructed.
- Carry bounded source images and server-derived source geometry in the signed approval. Establish local scene translation from consistent fixed objects (different tables allowed) or stationary scene matches. Background appearance alone does not define semantics or destinations. Ambiguous/different perspective views remain unknown. Runtime alignment is not human approval; record its provenance separately. Failed initialization retries cannot consume resume epochs or reset history.
- Complete the stage-specific command allowlists (`start camera`, `pause practice`, Muse activation), preserve Teach voice opt-in between stages, and return actual host refusal. Gestures click normal buttons and checkboxes; Teach also connects pinch/palm to recorder handlers. Keep action feedback visible; controls never verify physical steps.
- Browser tests assert real host state with mocked recognition; recorded replay uses real owned pixels and explicitly synthetic source metadata. Neither is acceptance of the owner's physical camera/microphone/hand recognition or a fresh Meta output.

### 2026-11-01 — Simplify Teach review (owner-requested)

- Teach review shows the goal, a punchy step checklist, and per-step toggles with before/after zone images. One approval checkbox ("I approve this lesson for Practice.") plus reviewer name replaces the per-step and goal checkboxes; ticking it marks every step reviewed and zone-confirmed, while missing zones or invalid evidence still block approval through the unchanged `reviewBlockers` gate. Owner explicitly chose this over collapsed per-step checks.
- Teach landing lists the creator's approved lessons (Practice / Rebuild with goal prefilled) plus a "Create new teach" card. "Re-run analysis" re-uploads the prepared recording and recompiles with the previous mode. The legacy `?legacy=1` route still works but is no longer linked from the new flow.
- One-click Teach build (owner-requested): a single consent plus "Build my lesson" chains upload, transcription and automatic compile straight to review; the manual component-marks picker was removed. MP4 upload no longer requires the recording-consent checkbox. Teach sections were compacted to fit one screen.
- Teach simplification round 2 (owner-requested): no goal input — the build goal is derived from the creator's narration transcript (fallback: "Complete the demonstrated procedure."). Voice and gesture controls removed from Teach entirely (Practice only); recorder buttons now also emit legacy control marks. Procedure download/import removed app-wide (diagnostics export stays). Single consent covers upload, transcription and analysis.
- Pre-approval rehearsal (owner-requested): "Test in Practice" in Teach review opens a live Practice run of the current draft in a new tab. The draft passes the same `reviewBlockers` evidence gate, loads in memory only (localStorage handoff, consumed once), skips receipt validation, is never saved, and shows a "Rehearsal — testing an unapproved draft" banner. Each review step also flags weak tracking evidence (fewer than 3 tracked frames in its window or frames without geometry) so bad moments/zones get fixed before approval.
- Review accuracy (owner-reported wrong-object tracking): the "Finish these checks" coaching lines are gone — review now enforces zones/evidence only, via the same auto-marks the single approval applies. Moment menus offer only frames with trusted (≥0.9 confidence) tracking geometry for that component, so any choice keeps exact-frame evidence binding for approval and Practice setup. Component identity itself comes from the AI build: if step images show hands instead of the object, adjust moments/zones, rehearse, and if still wrong re-run analysis or re-record naming the object with hands clear of start/end.
- Self-narrowing unverifiable goals (owner-requested): validation errors now name the failing field, the review shows each goal requirement with its status/reason, and unsupported scope is dropped automatically at review load (covered steps kept, references repaired, checks re-suggested) with a notice naming what was dropped — no button. Nothing verifiable → re-record guidance instead. Verified by engine diff: tracker, verifier, pipeline and server Teach code are byte-identical to before — the perceived tracking change comes from auto-confirmed zones and AI-proposed marks, not the matching math.
- Practice speech + stall feedback (owner-reported silent speech, slow correction): `speak()` no longer issues `speak()` in the same task as `cancel()` (a known Chrome utterance drop), resumes a suspended engine, picks an explicit English voice, and logs speech failures visibly instead of silently. Speech engine warms on session start. A stall watchdog notices "Waiting for trackable movement…" when armed tracking yields no decisions for 4s. Dwell/stability evidence thresholds untouched. Real-device speech still needs physical confirmation.
- Practice one-screen layout (owner-requested, matches reference screenshot): big camera (44vh) + companion side column; goal/next card, voice and gesture controls live beside the camera; goal shrinks to a corner overlay while running and the full before/after shows only when idle; verdict banner and steps strip compacted. Kept the light theme — say the word if you want the dark look too.
- Practice no-scroll rework (owner-requested): the lesson picker cards are gone — the latest approved guide opens automatically and switching guides is a single header dropdown ("Approved lessons"); Start/Stop camera, calibration capture, Pause and Resume all live in that slim header. Camera/side is 60/40 full-bleed; the steps list moved into the side column; before/after appears once, as a small labeled "Before and after goal" pair tucked in the left corner under the live camera while idle (corner goal overlay while running); the duplicate "Available voice controls" help text was removed (commands live once in CommandFeedback, history once in VoicePanel); manual tracking, retry, export and the legacy library link folded into one collapsed "Control settings" dropdown. Companion and gesture panels gained compact modes so the whole screen fits without scrolling. `e2e/local-practice.spec.ts` now expands Control settings before clicking Export diagnostics.
- Practice equal-height no-scroll pass (owner-requested): Goal/Next, voice and gesture moved out from under the companion into one slim top bar (goal truncated, text-xs, compact gesture without the explainer paragraph); the companion stands alone at full size with larger art and stretches to the exact camera-card height via flex-1; steps live under the camera (auto-open while running, collapsible when idle); before/after shrunk to small left-corner thumbs; the video carries a viewport cap in both states (running vs idle) and Practice uses full-bleed padding via `Workspace`. Proven by measurement: document height equals viewport height (832/832) in both idle and live-verified states at 1280×832, with camera and companion cards at equal height. `e2e/rehearsal.spec.ts` expands the Steps dropdown before asserting step text.
- Voice default-on + transcripts + spoken setup (owner-reported dead voice): the mic was opt-in, so nothing ever listened. Voice controls now start listening on page load (denial surfaces as a visible status with restart, same as before); the top bar shows a fixed one-line live transcript ("You said … · Guide said …", full history stays in VoicePanel) with reserved space so it never shifts the layout; the guide now speaks when the camera turns on (starting-view vs calibration wording depends on automatic setup) and announces each practice start with the first pending step, on top of the existing verdict speech. Bare "stop camera" without "Muse/Guide/StepLint" is still narration by design (exact-phrase gate unchanged), but the hint is now always visible. `e2e/voice-controls.spec.ts` locks auto-listen on load plus both transcript lines; the gestures test re-checks voice after exercising pinch-toggle.
- Fixed top-bar growth (owner-reported scroll): the bar cells are fixed-height now — goal/status/gesture lines truncate, transcript and gesture-notice lines always render (blank placeholder when empty), and the growing CommandFeedback moved into the collapsed Control settings dropdown next to VoicePanel.
- Bright verification glow (owner-requested): a `practice-glow-pass`/`fail` wash over the whole live area (camera + companion) flashes on each new verdict and holds while the state holds, on top of the existing camera border, banner, tracking boxes and companion color; reduced-motion safe. Asserted green and red in the committed correction test and visible in `.media-lab/restored-practice-correction.png`.

### 2026-11-02 — Local learner access is independent of Teach credentials

Owner-authorized change: canonical Practice loads validated, human-approved saved/imported artifacts locally, without creator-session authorization or approval-receipt verification. Optional legacy receipt data remains compatible. Human approval/schema/source/zone checks remain mandatory, but local file provenance is not cryptographically authenticated. Teach's paid endpoints and legacy verification endpoint retain their existing authorization. Teach library navigation carries the selected lesson ID; review handoff opens its lesson directly. No UI redesign or verification-engine change.

Learner-flow clarification: `/practice` without a selection is the lesson chooser, not the practice room. The room mounts only after selection; `/practice?lesson=<id>` and Teach review handoff carry that choice. Camera, companion and control hooks do not mount on the chooser. No second lesson dropdown inside the room. Explicit legacy/rehearsal routes remain separate.

### 2026-11-02 — Phase 6 Vercel output compatibility

Owner's `NEXT_OUTPUT_DIR_MISSING` log identified a build/adapter contract mismatch: production output was `.next-production` while Vercel required `.next`. `VERCEL=1` now takes precedence in `next.config.ts`; `vercel.json` pins the matching output and Next.js preset. Local isolated build directories remain unchanged. The existing 4,000,000-byte multipart limit and 300-second video route declarations remain intact; deployment tests lock these constraints. No provider, evaluator or product UI change is required. Actual hosted acceptance remains separate from the locally exercised Vercel-mode build; see `PHASE6_ACCEPTANCE.md` and `DEPLOYMENT.md`.


### 2026-11-02 — Owner-authorized Baseten final Teach drafting

Only `compileLesson`'s final structured procedure draft now uses `sparkStructured` with `SPARK_PROVIDER=meta|baseten` (default Meta). Baseten endpoint is Chat Completions at `https://inference.baseten.co/v1`, owner-specified hackathon slug `meta-models/muse-spark-open-1026`, server-only `BASETEN_API_KEY`, prompt-only JSON and Zod validation. Final drafting consumes bounded transcript/tracking JSON, so no uploaded Meta file reference is forwarded. Optional bounded images use image_url data URLs; video is rejected. All discovery/legacy Spark calls, SAM and Voice remain Meta. Existing evidence validation and human approval remain mandatory. No fallback or automatic retries. Truncation is classified before parsing. Provider/model diagnostics are returned from the compiler.

Live reasoning-effort support and hackathon model availability remain unverified; reasoning_effort is omitted. The gated smoke script permits at most three calls on explicit operator approval; none was run during this implementation. This targets the open-weight bonus; partner verification determines eligibility and has not occurred here. UI/Practice architecture unchanged.

Baseten follow-up: owner authorized exactly two live checks after implementation. Text-only and synthetic-image JSON requests both passed through the actual adapter (2,636 ms / 3,111 ms), without retries or fallback. Exact hackathon slug was accepted. These checks establish request transport/schema validation, not semantic image accuracy, full Teach acceptance, reasoning_effort support or prize verification. See `BASETEN_MIGRATION.md`.


### 2026-11-02 — 60-second Teach with host-aware transport

Owner approved 60-second lessons and clarified that Vercel restrictions must not constrain other hosts. Shared media limits now select Vercel-safe 4 MB body/1.98 MB video at 180 kbps constant bitrate, or standard 12 MB body/8 MB video at 1 Mbps. Both normalize to 10 fps/600 frames and mono PCM16 16 kHz audio. Actual output bytes are checked. Canonical and legacy upload schemas/handlers use the same bounds. Vercel Hobby remains 300 seconds with a 280-second application abort; standard Node uses 580 seconds. No Practice file/engine changes or live calls. See TEACH_60_SECONDS.md for budgets, constraints and test evidence.

The initial 250 kbps target exceeded the cap in Chromium on complex footage (2,293,727 bytes). A measured 180 kbps candidate fit at 1,975,335 bytes; actual-byte guards remain authoritative. AAC padding is trimmed to validated source duration, and the recorder minimum reserves two encoded frames without weakening duration validation.

### 2026-11-02 — Owner-authorized Teach V3 contract, Phase 1 only

Canonical local drafting requires explicit V3 roles, activation, source identity frames, action-owned evidence windows, requirement coverage and initial/final visual predicates. Existing V2 contracts remain readable. Review never automatically narrows required scope. V3 stays unapproved/reviewable until separately authorized approval/storage and Practice migration; the existing V2 verifier must not accept V3 approvals and silently ignore final predicates. No Practice/voice/provider integration changes or live model calls. See [TEACH_V3_PHASE1.md](TEACH_V3_PHASE1.md) for tests, implementation boundaries and remaining dependencies.

### 2026-11-02 — Owner-authorized video-informed Teach drafting

The owner requested Baseten to see the demonstration while drafting meaningful actions and goals. The existing final Spark call now accepts the exact reviewed MP4, cryptographically bound to its inspected upload, through documented Chat Completions `video_url` content. The configured Meta alternative retains its own file reference; SAM/discovery/Voice remain unchanged. One existing drafting request includes a source action/goal audit; no second independent model check, retry, fallback or Practice model loop is added. Unknown/unshown work stays unsupported, with null action timing when no observation exists. Provider video sampling is bounded and cannot guarantee every brief action. Existing V3 approval/Practice guards remain. See [TEACH_VIDEO_REVIEW.md](TEACH_VIDEO_REVIEW.md); no live paid call was made during implementation.

### 2026-11-02 — Eligible source-frame generation and measured completion budget

Frame references and action landmarks are now constrained by complete per-object trusted-source catalogs, rather than letting video visibility imply valid SAM evidence. The policy remains 0.90 with actual timestamped observations; no snapping or threshold bypass. Two newly approved Baseten video requests both truncated at 12,000 completion tokens; the second used 10,673 reasoning tokens. Baseten's bounded total cap is now 24,576 to leave room for reasoning and JSON; Meta's cap and all host deadlines remain unchanged. No third call was made; adjusted-budget live acceptance remains outstanding. See [TEACH_SOURCE_EVIDENCE_FIX.md](TEACH_SOURCE_EVIDENCE_FIX.md).

## Teach V3: derived relevance and one validator-feedback correction (2026-11-02)

The V3 validator makes `role: required` equivalent to being measured by a step or scene predicate, and makes activation follow from those references. The compiler now derives these two fields from the model's explicit steps and predicates, recording every override in `roleReason`, instead of asking the model to restate them. Intent (steps, windows, requirement links, goals, supporting versus irrelevant) remains model-authored and human-reviewed, and no validation rule changed. A completed draft rejected by deterministic validation gets at most one correction request carrying the exact issues, without video. Transport and truncation failures are never corrected. This extends decision 72 (explain rules, do not silently modify intent). Live evidence: trial 5 passed on its first request; see TEACH_SOURCE_EVIDENCE_FIX.md.

## Teach/approval evidence agreement and Phase 2 handoff (2026-11-02)

- Compile now applies approval's continuity rule to V3 action windows instead of approval relaxing it. No threshold changed.
- Review-evidence problems (suggested zones) drive the single correction request but do not reject a valid draft; reviewers fix zones in review, and approval still validates.
- Phase 2 (owner-authorized): V3 approval stamps a SHA-256 executable revision (procedure without approval, zones, setup geometry). Stale approvals and rehearsals are rejected at load. Rehearsal is `not_run|failed|passed`, bound to the revision, set only by the canonical verifier's terminal status and labelled browser-reported. V3 requires consistent automatic setup. V2 is unchanged. See TEACH_V3_PHASE2.md.

## Teach action windows end where the object comes to rest (owner decision 2026-11-02)

V3 Teach actions run from a settled start (still for 400 ms before) to the first settled landing (still for 400 ms after), and may contain tracking gaps of at most 600 ms. These values equal the existing Practice measurement defaults and are shared from one module. The rule is the same at compile, review suggestion and approval; V2 is unchanged. This replaces "first frame with 0.05 displacement" and "no gap at all", which produced mid-air after-moments and mid-air target zones. Live bottle trials 8–9 passed; see TEACH_SOURCE_EVIDENCE_FIX.md.

### 2026-11-03 — Handoff repair: calm identity recovery and endpoint-derived zones

Owner requested continuous recovery through hand occlusion. Keep the initial three searches in two seconds, then retry once per second on fresh frames; acceptance still requires three consistent approved-template observations with unchanged match/separation/identity gates. Search the last position, then translated approved zones, nearest first. Stationary references covered by movers use the requested 50% appearance retention with unchanged position/cost gates.

Scene predicates no longer widen action endpoint zones. Predicate evidence remains independently validated against those zones; the compiler is instructed to prefer settled initial frames. Automatic setup “Finding” responses remain recoverable with silent three-second retries; actual worker timeout and exception bounds remain intact. Approval button is green.

Verification: 54 targeted tests passed; TypeScript passed. Real run-2 video replay now reacquires the bottle at frame 131, but the plate stays uncertain and calibration invalidates at frame 156. Goal completion and reversal replay gates remain FAILED, so no paid request was made and physical acceptance is still open. Diagnostic replay retained outside the regular suite at `.media-lab/handoff-replay.test.ts` (requires `/tmp/steplint-replay.rgba` generated from the original clip). Next repair must establish why the visible plate fails the existing appearance/position gates, without weakening them.

Additional checks: lint passed with 0 errors and the same 5 warnings; JSX click-handler audit found no non-button/link actions in the requested directories; `git diff --check` passed. Full suite finished with 661 passed and 1 timeout in `local-teach-contract.test.ts`; its isolated rerun passed all 7 tests. Production build passed, including its TypeScript check. Playwright and paid tests have not run in this repair.

### 2026-11-03 — Retry lifecycle and approval appearance verification

A retry worker now retains the `recovering` lifecycle until actual setup success, rather than bouncing into initial acquisition on every three-second retry. A seven-failure lifecycle regression preserves automatic intent and confirms setup/arming recovery. The browser regression injects more than five schema-valid Finding setup replies into the real page controller, then disables injection and requires real tracking to reach running. A first version incorrectly assumed hiding a synthetic sprite necessarily makes bootstrap fail; that version was corrected after bootstrap instead succeeded but correctly stayed unarmed. This regression verifies lifecycle handling, not perception accuracy; browser results are recorded separately by the validation run.

The approval button uses the existing `primary` style: global `.flow-workspace button` rules override ordinary Tailwind background utilities, while `.flow-workspace button.primary` supplies the intended dark green background and retains disabled behavior. AST audit of Teach, Practice and shared components found zero click handlers on non-button/link elements. Existing native disclosure controls remain keyboard-accessible.

`npx vitest run tests/teach-source-evidence.test.ts tests/practice-lifecycle.test.ts`: 31 passed. This includes a slightly displaced initial-predicate scene frame that stays within the original rest policy and introduces no approval blocker. No live requests were made by this work.

### 2026-11-03 — Parallel repair follow-up: measured occlusion continuity and delayed reversal

Real-video diagnosis found two integration causes. Stationary matching fitted exposure using pixels covered by the mover, then compared ambiguous flat patches. Reference matching now excludes mover-covered approved sample indices from both illumination fitting and candidate scoring, requires at least 32 visible samples, and applies the same indices to competing hypotheses. Retention remains 0.8; cost, separation and position gates are unchanged. Stationary searches restart at their reference each frame while retaining the full displaced-candidate search.

The native palette tracker already produced valid partial identity, but `trackLocal` incorrectly entered identity recovery and suppressed subsequent partial measurements. Valid measured partial identity now stays tracked; it preserves transit identity without providing endpoint geometry. A genuine missing-identity interval still requires a fresh observed start.

An already verified maintained state could become uncertain and then clearly reverse without a reversal event, because the verifier checked only status `passed`. It now also checks maintained states awaiting revalidation; identity-only evidence still cannot establish reversal. Fresh target evidence restores the state with append-only audit.

Verification: independent real-video replays of all 540 frames passed completion and reversal gates. Step pass was observed at frame 135 and final goal completion at frame 141. Tracking tests: 24 passed; pipeline/continuous/goal regressions: 37 passed; lifecycle/Teach tests: 31 passed. Full 662-test suite passed before the final tracking/verifier edits; final broader checks are tracked separately. These are recorded-camera checks, not physical-camera acceptance.

Final parallel verification: production verify build passed; TypeScript passed; lint passed with 0 errors and the same 5 warnings. Full bounded-worker test run passed 667 tests in 77 files, including the temporary real-video replay; the replay was then moved out of `tests/` into `.media-lab/` as required. Independent verifier review plus 32 neighboring tests passed. Final production server uses port 3003; Playwright results and paid-test ledger remain separate. Execution permission delays exceeded the requested ten-minute target.

Browser gate remains unverified: sandbox Chromium launch failed before application assertions. The escalated browser permission request waited 162 seconds and was aborted when the validation turn was interrupted; no escalated browser session started. This is an execution-environment block, not a passing browser result. No paid run 3 or final run was launched, so the remaining budget is unchanged. The final production server is on port 3003. No commit, push, or deployment was performed.

### 2026-11-03 — Bounded correction of completed malformed Spark JSON

Live run 3 stopped on a completed response that failed JSON parsing; its raw content was not retained, so markdown wrapping or any specific syntax fault is not established. Baseten's current Model APIs documentation explicitly excludes Muse Spark Open from JSON mode and structured outputs (`https://docs.baseten.co/inference/model-apis/overview#feature-support`), so no unsupported response-format flag is added.

A completed malformed candidate may now consume the existing single correction allowance. The original evidence plus candidate must fit the unchanged 28,000-character request bound; otherwise the original error remains. The candidate is server-only and non-enumerable on the typed error. The syntax correction reuses the approved schema/token limits and original visual source; every schema, semantic and review-evidence check still applies. Whether that second request produces invalid JSON, invalid semantics, or a reviewable evidence issue, no third request occurs. Transport, authentication, rate-limit, provider and truncation errors remain unretired. This changes handling of a supported failure class, not a claim that run 3's unknown syntax fault has been diagnosed.

Verification of this server-only change: `npx vitest run tests/teach-v3-consistency.test.ts tests/spark-provider.test.ts` passed 48 tests; `npx tsc --noEmit` and `git diff --check` passed. All new model responses in these tests are mocked; no paid request was made by this implementation/verification.

Live run 3 failed before review/approval: the first completed Baseten Spark drafting response was invalid JSON. Its raw text was not retained, so a markdown wrapper, malformed syntax and other presentation causes remain hypotheses, not confirmed causes. The confirmed application gap was that malformed completed answers bypassed the existing single-correction path. The correction budget now includes that failure class, without retries for transport/truncation/auth/rate/provider failures and without a third drafting request. One whole-response JSON code fence may be decoded as presentation; prose, multiple payloads, malformed JSON and schema violations remain rejected. Candidate text is non-enumerable, server-only correction context, never an HTTP/log payload.

Official provider limitation verified at https://docs.baseten.co/inference/structured-outputs and https://docs.baseten.co/inference/json-mode: Muse Spark Open does not enforce those formats. No unsupported response_format flag was added.

Call-accounting correction: automatic component discovery also invokes Meta Muse Spark once. Earlier live notices omitted that existing request. Run 3 actually used Voice1, Meta Spark discovery1, SAM tracking1, and Baseten Spark drafting1. Final run accounting explicitly separates the discovery call from the at-most-two Baseten drafting/correction requests.

Final paid run 4: real Teach analysis, no review blockers, approval and automatic Practice startup passed; goal completion failed. The loop later entered recovery and rejected a stale response. All four paid runs are used. No clean final paid pass or real-video live feedback latency is claimed. The same-size start-zone correction is a human-review proposal only, with offline completion/reversal/recovery evidence in `docs/PRACTICE_REVIEW_CORRECTION.md`. The incompatible source-point mapping experiment was removed from tracker/protocol/pipeline/goal code; 24 retained tracker tests passed again. Source geometry consistency and physical acceptance remain open.

No-cost diagnostic continuation of the original approved run-4 lesson made zero Teach API requests. Across 633 worker replies, worker median was 11.3 ms, p95 31.2 ms, max 313.6 ms; callback-to-reply age median16 ms, p9541 ms, max321.2 ms. The original >600 ms stale-response halt did not reproduce in this no-video-recording diagnostic; its cause remains unconfirmed and no freshness timeout was weakened. A separate short canonical diagnostics export succeeded: 34 sampled software UI updates, median33.6 ms/p9568.7 ms callback-to-two-animation-frame feedback; worker median10.7 ms/p9531.1 ms. Result remained needs_verification, so these samples do not establish successful goal feedback or physical-camera acceptance. The proposed zone correction remains awaiting explicit owner approval; no changed artifact has been used in Practice.

## 2026-11-03 — Owner approved the zone-1 review correction; speech fix

- **Owner approval (chat, explicit):** "Approve correction" for exactly `docs/PRACTICE_REVIEW_CORRECTION.md` (zone-1 up 0.02, size/target/thresholds unchanged). New revision `b5083aca…` was generated with the product's `executableRevision`/`bindRehearsal`/`parseApprovedArtifact` code (`.media-lab/live-e2e/make-approved-revision.ts`, diff-guarded to the zone-1 binding, matching review fromRegion, reviewer/approval stamp; old receipt discarded; rehearsal `not_run`). Original artifact (sha256 `f1b2767c…`) is unchanged.
- **Speech defect (confirmed in canonical page):** `speak()` is latest-wins, so the goal-invalidation announcement was cancelled by the step "Stop. …" correction spoken in the same tracking reply. The goal announcement is now spoken in the same utterance as the last step verdict of that reply (or alone). Verified on the canonical Practice page with the recorded clip: "Stop. Return bottle to blue lid and retry move to plate. Completion invalidated. Restore the final state." No synthetic V3 browser regression exists yet (browser fixtures are V2); that gap is open.
- **No-model Practice continuation on the approved revision (recorded clip, fake camera, Teach API blocked, 0 requests), 5 runs:** goal verified + loop reversal caught + automatic re-verification in 4/5 runs; voice pause passed; voice resume did not reach `running` within 45 s in the full-sequence run. Run 2 and the resume failure share one pattern: browser-only "View unclear; finding the work area again" during the carry, followed by slow re-arming. Offline replay of the same revision (every frame, and 20–40% random frame drops) keeps calibration valid and completes at frames 139–144, so the cause is browser-path specific and **not yet identified** (candidates: fake-camera decode/scaling pixels vs ffmpeg, frame timestamps). Software latency: callback→paint median 49 ms / p95 86 ms; worker median 14 ms / p95 48 ms. Not physical-camera acceptance.

## 2026-11-03 — Scene predicates follow the measured endpoints when they contradict them

- **Owner report:** a real Teach run analysed fine, then review blocked with "The reviewed zone does not support its initial/final source condition", so Test in Practice was unavailable.
- **Confirmed gap (code):** compile validation (`validateV3Evidence`) only checks that predicate frames fall before the first start or after the last result and are tracked. Approval (`validateReviewEvidence`) also requires each `object_in_zone` predicate centre to be inside the reviewed zone, which is derived from the step endpoints. Since zone widening for predicates was removed (it caused start/target overlap), a model-cited frame showing the moved object elsewhere blocks approval with nothing the reviewer can adjust.
- **Change:** `src/teach/predicate-evidence.ts` `alignScenePredicateEvidence`, applied in the compile parser and when the review page opens a draft. Only when a cited frame shows the moved object displaced from its measured at-rest endpoint by more than `TEACH_REST_MAX_DRIFT`, that phase's predicates are bound to the first start / last result frame (all predicate objects must have trusted samples there). Clearer frames at the same resting position are kept. All existing validation still runs; no threshold changed.
- **Not confirmed:** the owner's exact draft was not inspected. If the blocker comes from a different cause (for example a predicate zone ID not used by any step), this change does not fix it.
- Regressions in `tests/teach-source-evidence.test.ts` reproduce the original blocker message, then show it cleared; full unit suite 688 passed. Teach browser e2e not rerun.

## 2026-11-03 — Baseten for all Teach drafting; v0.4.1
- **Owner decision:** "move everyone to Baseten … no more Muse Spark [on Meta], use Baseten like before." Drafting now always resolves to Baseten (`sparkProvider()` in `src/server/meta/spark-limits.ts`); `SPARK_PROVIDER=meta` routes to Meta only with the developer test opt-in `STEPLINT_ALLOW_META_SPARK=1`. Cause of the Vercel HTTP 400: `SPARK_PROVIDER` unset there, so the old default picked Meta, whose strict schema mode was sent a `oneOf` (now emitted as the equivalent `anyOf` for any provider). Superseded the same day by the owner rule "two keys, two clients": discovery also moved to Baseten (`discoverComponents` sends the bound lesson video through `sparkStructured`, 12,000-token ceiling for always-on reasoning); the Meta drafting branch was removed; the Meta client rejects `muse-spark*` bodies at its fetch boundary. Discovery on Baseten is unit-tested with mocks only until the next live run.
- Paid run 5 reached the first real end-to-end final goal and then hit a single-late-reply halt; that halt is now a discard (3 s sustained-lateness bound). Resume over a resting mover and the camera switch were added; see CHANGELOG 0.4.1.

## 2026-11-03 — v0.4.2: preview audio, live colour upgrade, support-surface references
- Audio: the upload MP4 stays silent by the Vercel body budget (TEACH_60_SECONDS.md); the local preview plays the original recording (`PreparedLesson.playback`), never uploaded. Root cause: 7dbcb85 replaced `support.aac ? aac : discard` with `discard`, so previews became silent.
- Tracking: run-8 lesson's approved colour was a shadow red from one JPEG frame; the bounded every-10th-observation upgrade now tries the live-grounded colour first (identity already confirmed that frame; same 0.9 gate), then the approved one. A fixed optional reference overlapping more than 20% of a mover's approved box is treated as contaminated (previously only the reverse ratio), which excludes a whole-table "support" box. Evidence: page-like offline replays (`.media-lab/page-like-replay.ts`) for run-5 and run-8 lessons from 7 start points each; not a paid or physical-camera result.

## 2026-11-04 — Hidden carry up to 4 s in Teach move windows (owner decision)
- Evidence: paid run 14 received ~1,548 of ~1,620 SAM records, consistent with the bottle being dropped for ~2.4 s while carried; with the 600 ms gap rule (2026-11-02) no move could be measured, so drafting could only fail. Inference from the record count; tracking was not retained.
- Owner chose "Allow up to 4 s": a Teach move window may span ONE tracking gap of more than 600 ms and at most 4,000 ms (`TEACH_MAX_HIDDEN_CARRY_MS`), only between a start still for 400 ms before the gap and a landing still for 400 ms after it, at least 0.05 apart, with at least one reliable observation strictly between them. Start and landing must be observed at rest; only the carry may be hidden. Practice is unchanged (its 600 ms observation gap and live verification remain).
- Implemented in `src/teach/source-evidence.ts` (`measuredDisplacementWindows`, `actionWindowIssue`, `movementDiagnosis`), so compile, review suggestions and approval share it.

## 2026-11-04 — Steady-rest SAM observations >= 0.5 count as Teach evidence (owner decision)
- Evidence (run 12 full SAM output, bottle video): correctly outlined objects score 0.5–0.9 for most frames (the never-moving plate had only 7 of 270 frames >= 0.9; the resting bottle's box at frame 30 is correct at 0.51). Paid run 15's logged diagnosis: the bottle's reliable tracking had a 4.27 s gap (frames 14–78) while it stood on the lid.
- Owner chose "Accept steady rest ≥ 0.5": `trustedTrack` keeps every observation >= 0.9 plus observations in a steady rest (>= 3 consecutive within 4 frames, each >= 0.5, centre within the 0.01 rest drift, outline within ±50%). Movement still needs >= 0.9 or the hidden-carry rule. Identity is guarded by the outline gates (size, drift, wander) and human review. Practice thresholds unchanged.
- Every Teach reliability check (compile catalog, V3 evidence, review suggestions, approval, predicate alignment, the model's eligible frames) uses `trustedTrack`.
- Diagnostics: the compile stream now carries a creator-only `diagnostic` event with per-frame SAM evidence after each SAM call, so a failed run can be replayed offline.

## 2026-11-04 — Practice: references a mover starts on; one measured point per object (paid run 16)
- Evidence: paid run 16 passed Teach end to end on the bottle video (SAM measured the move, Spark drafted, Felicity audited, approval and Practice start succeeded), then Practice looped "View unclear; finding the work area again" and never verified. An offline replay of the run's real approved artifact on the same camera clip, with the page's tracker and verifier functions, reproduced it exactly and found two causes:
  1. The bottle stood on the blue lid, so the lid's approved reference appearance contained the bottle. When the bottle was lifted, the unmoved lid stopped matching (or its match was dragged toward the bottle) and the tracker declared camera motion, resetting the session mid-move. Rule added: a fixed reference whose box overlaps a mover's starting box ("start support") that becomes unrecognised is uncertain, not motion; seen displaced, it proves motion only when no other reference confirms the camera is still. A reference the mover never stood on, camera motion confirmed by another reference, and the 2 s no-reference guard are unchanged.
  2. Zone membership used the box centre. SAM (Teach) and the local tracker (Practice) agree on the bottle's base within 0.004 but its top by only 0.058, so the centre missed the approved destination zone by 0.0023 and the verifier reported "continuous visible travel" while the bottle rested on the plate. V3 steps now default to `bottom_center` (where an object rests), and one point per object (`src/procedure/measured-point.ts`) is used by steps, zone suggestions, approval of scene conditions and the final-goal gate (previously the goal and approval always used the centre, so the existing reviewer option `bottom_center` could not complete a goal).
- Verified offline: the run-16 lesson re-derived from its recorded real SAM and Spark outputs with the current rules passes review and approval; the Practice replay verifies the step 0.4 s and the final goal 0.8 s after the bottle lands. Not yet verified with a paid live run or a physical camera.

## 2026-11-04 — Paid run 17 fixes (zone anchors, size-scaled rest zones, live colour at setup)
- Evidence: run 17 Teach passed; Practice never armed. Offline replay of the real lesson: lid/plate labelled irrelevant (no stationary references), start zone from one gripped instant, SAM box cropping the bottle base (colour grounding refused; texture tracker lost the bottle under the grasp), Teach vs live colour exposure mismatch.
- Decisions: irrelevant stationary objects holding an approved zone are optional fixed references (never step/goal objects); zones cover the object's resting positions next to each endpoint (<= 0.025 spread) with radius 0.2 x object height (min 0.04, max distance/4); palette surroundings re-sampled at a 20% margin when the 10% ring fails (distinctiveness limits unchanged); setup tries the live colour at the tracked or approved start box under the unchanged 0.9 gate.

## 2026-11-04 — Felicity repairs Teach (owner override, docs/new_final_phases)
- Felicity may correct a draft when measured evidence supports it: Spark proposes a plan of steps as indexes into measured movement windows; code builds the draft and the unchanged validators accept or reject it. One Spark repair call per lesson; tracking repair (re-anchored SAM views) and draft repair share that budget, after a free box-only SAM retry. Unsupported narrated work stays unsupported. Creator sees plain messages; technical detail is logged or collapsed.

## 2026-11-04 — Practice camera locate (owner: automatic, no alignment for the learner)
- Root cause of "automatic tracking never starts" on real cameras: setup searched only near Teach positions/sizes. Owner chose automatic relocation with SAM over an alignment guide.
- One bounded SAM 3.1 image step per camera session (one noun-phrase request per approved object, parallel); boxes only. Code derives one Teach->live mapping (>= 2 objects agreeing) and the worker resamples frames into the Teach viewpoint; all tracking and verification stay local and unchanged. Never per frame.

## 2026-11-04 — Practice calibrates on the live camera from SAM boxes
- Root cause of repeated physical-camera failures: setup depended on the Teach recording's pixels/positions/aspect. Practice now calibrates on the learner's live frame from SAM 3.1 boxes (one bounded locate, re-run at most every 20 s), moving each approved zone with its object. Tracking, gates and the deterministic verifier are unchanged and local.

### 2026-11-04 — Bounded occlusion bridge replaces "unseen interval needs a fresh start"
Owner physical-camera export: a hand-carried move hides the object, so the 2026-11-03 rule ("a genuine missing-identity interval still requires a fresh observed start") made every real carry unverifiable. The verifier (`src/procedure/verifier.ts`, `OCCLUSION_BRIDGE_MS` = 12 s) now accepts last-clear-at-start → only unclear/missing → clear at target within the bound as before/after evidence. Not bridged: longer gaps, target-only presence, a clear observation elsewhere in between, identity-only observations. Thresholds and identity reacquisition gates unchanged. Regression: owner export replay in `tests/local-continuous.test.ts`.

### 2026-11-04 — Occlusion never undoes a verified step; moved objects match on their own pixels
Verifier: after a step passes, unclear or partial identity is retained as passed ("no reversal inferred"); only a clearly measured observation outside the target is a reversal. Tracker: moved-object templates use a border-contrast foreground so a change of supporting surface does not lose identity; lost-object searches are limited to the last position plus one zone per attempt (1 px grid kept for lookalike separation).

### 2026-11-04 — Colour palettes must work in the live search window
A native colour palette is accepted only if a live-mode measurement (the wider frame-to-frame window) also observes the object; the best-margin candidate is kept. Root cause of multi-second Practice decisions: a cream bowl's hue matched the table outside the grounding ring, so the bowl flapped lost/reacquired. A tracking grace period was rejected because it bypassed the three-match identity reacquisition rule.

