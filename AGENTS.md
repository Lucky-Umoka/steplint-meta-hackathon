# StepLint agent instructions

## Purpose and current status
- StepLint is a visual verification system for physical procedures: it turns an expert demonstration into a human-approved procedure and checks observed practice against explicit rules.
- Its distinction is AI-assisted perception and drafting plus deterministic, testable procedural verification—not a chatbot or a model guessing whether an action succeeded.
- Muse Code is the project's only coding agent and must follow this file throughout development. This file is the single authoritative instruction source.
- Muse Code is a development tool, not a runtime model integration. Using it to write code does not prove that the application calls Meta models; document and verify actual application model requests separately.
- The Phase 1 foundation and bounded Spark/SAM live smoke tests are recorded in [docs/PHASE1.md](docs/PHASE1.md). Teach mode, Practice mode, and the procedure evaluator are not implemented.

## Product and verification invariants
- Teach mode drafts ordered steps, prerequisites, expected conditions, recovery guidance, and evidence references. A human must review and explicitly approve a procedure before Practice mode can use it.
- Practice mode evaluates timestamped visual evidence against preconditions, state changes, and order. Object presence alone does not prove an action or state transition.
- The deterministic TypeScript evaluator is the source of truth for pass/fail. Missing, obstructed, or ambiguous evidence means `needs_verification`, never an invented success or failure.
- The controlled fixture is a blue base, yellow support, and red latch. Installing the support precedes closing the latch; test the premature-latch violation and recovery.
- Teach is recorded/batch processing; Practice is the interactive verification workflow. Do not promise arbitrary-task accuracy or real-time performance without evidence.

## Architecture and technical principles
- Plan one TypeScript application: Next.js App Router, React, strict TypeScript, Node.js (prefer Node 22 if verified compatible), npm, Route Handlers, Zod, and Vitest.
- Keep provider-specific Meta API code server-side and isolated. Planned models are Muse Spark, SAM 3.1, and Muse Voice Transcribe; verify current official documentation before implementing any integration.
- Use only documented request/response formats and validate returned data. Do not infer API behavior from model names or memory.
- Keep routes small; separate UI, media, perception, procedure schema/evaluation, and provider clients. Avoid new infrastructure or dependencies without a concrete need and compatibility/license review.
- Consult [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DECISIONS.md](docs/DECISIONS.md) when design or technical assumptions are relevant. Record material changes there.

## Security, media, and spending
- Keep `MODEL_API_KEY` server-only; never use a `NEXT_PUBLIC_` name, hardcode credentials, commit a real `.env`, log secrets, or return private environment values. `.env.example` may contain placeholders only.
- Validate and bound external input before paid requests. Automated tests must not make live model calls; keep live smoke tests separate and explicitly invoked.
- Before any real API call, confirm the phase needs it, credentials are safely configured, the input/request count is bounded, and tell the owner which model will be called and why. Never spend credits without that notice.
- Respect media permissions and recording consent; show recording state. Verify real MIME type, codecs, upload limits, and hosting constraints before selecting a media path. Do not send every camera frame to a paid API.
- Use appropriate licenses and owned/consented assets. Do not claim certification, guaranteed safety, unsupported performance, or capabilities not demonstrated.

## Coding and testing
- Inspect relevant code and docs before changes; preserve existing work and follow the current roadmap phase. Do not implement multiple phases in one task.
- Use strict types, runtime validation at boundaries, explicit error handling, small focused modules, and existing project conventions. Avoid `any`, silent fallbacks, and suppressed checks.
- Add deterministic tests for correct/wrong order, missing prerequisites or objects, ambiguity, duplicates, retries, invalid procedures, and recovery. No duplicate event may advance state twice.
- Run the narrow relevant tests, type-check, lint, or build when available. Do not weaken checks to obtain a green result. Report commands and actual outcomes accurately.

## Hackathon and working rules
- Treat the official participant guide as authoritative; event reference: <https://dev.meta.ai/events/global-hackathon>. Keep the repository public for submission and represent hackathon work truthfully.
- Use Meta AI meaningfully and load-bearingly; never attribute mocked data or another model's work to Meta. Keep the demo focused on a working wrong action, evidence-based warning, and correction.
- For each meaningful task, state its phase and intended files, inspect, implement only the scoped change, verify, review the diff for accidental changes/secrets, and explain what changed, test evidence, failures, and next step in beginner-friendly language.
- Keep progress records truthful and short. Distinguish mocked tests, real API calls, manual checks, unrun checks, and planned features.
- Follow [PLANS.md](PLANS.md) as the detailed roadmap. Phase 1 is complete as recorded in [docs/PHASE1.md](docs/PHASE1.md); later phases require the owner's explicit authorization. Before any additional live Meta API request, follow the notice and approval rules above.
