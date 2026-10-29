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
