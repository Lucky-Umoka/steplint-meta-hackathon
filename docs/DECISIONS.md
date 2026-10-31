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
