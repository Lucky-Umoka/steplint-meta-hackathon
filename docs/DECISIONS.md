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
