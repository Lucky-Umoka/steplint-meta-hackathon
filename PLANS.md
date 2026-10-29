# StepLint implementation roadmap

This roadmap is the source of truth for scope, deliverables, verification, and exit gates. Work one phase at a time. **Phase 1 is complete; see [docs/PHASE1.md](docs/PHASE1.md) for its implementation and verification record. Obtain the project owner's explicit authorization before beginning each later phase.**

Muse Code is the project's only coding agent and must follow [AGENTS.md](AGENTS.md) throughout development. Muse Code writes the application; it is not an application runtime model. Only actual, verified StepLint application calls to Meta models establish runtime Meta integration.

## Phase 1 — Foundation and API smoke tests

**Status: Complete.** See [docs/PHASE1.md](docs/PHASE1.md) for implementation details, test results, and bounded live smoke-test results.

**Scope and deliverables**
- Inspect repository state, then initialize the minimal Next.js App Router / React / strict TypeScript foundation and a safe health endpoint.
- Establish server-only `MODEL_API_KEY` configuration and an isolated Meta client using the documented official interface.
- Add separate explicitly invoked Muse Spark and SAM 3.1 smoke tests; add lint, type-check, unit-test, and build scripts.
- Verify `.gitignore`, secret handling, and actual API formats against official documentation.

**Verification and acceptance**
- Run lint, type-check, unit tests, and production build; health check works without a paid request or environment disclosure.
- Tests do not call paid APIs by default; confirm no committed or browser-exposed credentials.
- A model integration is called working only after its bounded real smoke request succeeds and its response is validated. Do not run these calls without the required owner notice.

**Exit gate:** minimal app and health endpoint pass checks; secure configuration and explicitly invoked smoke-test paths exist. Record any API access that has not actually succeeded as unresolved.

## Phase 2 — Deterministic procedure evaluator

**Status: Complete.** See [docs/PHASE2.md](docs/PHASE2.md) for schema/evaluator semantics, recovery examples, limitations, and passing verification results.

**Depends on:** Phase 1 foundation. **Scope and deliverables**
- Define Zod-validated procedure, evidence, and event types; keep raw observations distinct from evaluated procedural outcomes.
- Implement explicit state transitions, prerequisites, ordering, forbidden transitions, duplicate protection, and recovery independently of model calls.
- Create the blue-base / yellow-support / red-latch fixture and use mocks for all ordinary tests.

**Verification:** test correct order, wrong order, missing prerequisite/object, ambiguous evidence, duplicate events, retries, invalid procedure data, violation recovery, and a correction satisfying the missing requirement. Verify missing evidence remains unverified and duplicate events never advance twice.

**Exit gate:** wrong-order latch closure fails with the missing prerequisite identified; corrected order passes only the evaluator's defined, evidence-supported requirements.

## Phase 3 — Media compatibility spike

**Status: Local spike implemented and tested; live verification pending.** See [docs/PHASE3.md](docs/PHASE3.md) for browser measurements, fallback behavior, and remaining consented-media/approval gates.

**Depends on:** Phase 1. **Scope and deliverables**
- Check current official media requirements, supported upload process, and applicable hosting/request-body/execution limits.
- Capture a short (about 20-second) browser recording and inspect actual MIME type, codec, size, and duration.
- Evaluate Mediabunny only if needed; verify Meta Files API, SAM video processing, and Voice Transcribe formats through small, explicit live smoke tests.
- Document a reproducible supported path or add a practical existing-file upload fallback. Use audio conversion only if the verified transcription workflow requires it.

**Verification:** record measured properties, actual errors, supported formats, upload constraints, and whether each real request succeeded. No claims based on assumptions.

**Exit gate:** a reproducible media path works, or a practical fallback is implemented and its remaining constraints are explicit.

## Phase 4 — Teach mode

**Depends on:** Phases 1 and 3. **Scope and deliverables**
- Support a short instructor recording or existing-video upload with visible recording state, permissions, preview, discard, and clear errors.
- Gather grounded visual and audio evidence through verified integrations; allow representative objects to be selected or grounded.
- Draft a procedure with steps, prerequisites, expected conditions, recovery guidance, and supported references. Validate output with Zod; make it editable and require explicit human approval.
- Surface ambiguity instead of inventing unsupported actions.

**Verification:** manually exercise capture/upload, processing, errors, editing, validation, and approval; retain evidence that the draft is grounded in supplied input.

**Exit gate:** demonstrate the full capture/upload → analysis → review/edit → approval workflow. Unverified model features remain labeled as such.

## Phase 5 — Practice mode

**Depends on:** Phases 2 and 4 (and verified perception/media paths from Phase 3). **Scope and deliverables**
- Provide a controlled camera practice environment; ground objects and observable states.
- Prefer local frequent processing where feasible; use bounded model re-localization only when needed. Map timestamped observations into evidence events for the deterministic evaluator.
- Show the current requirement, evidence, violation, concise correction, and reference evidence when available. Handle missing/obstructed/ambiguous evidence honestly.
- Log events and evaluator state; measure latency and repeatability rather than promising real-time behavior.

**Verification:** repeatedly test wrong order, supported warning, correction, and re-evaluation; test permissions and uncertain evidence manually.

**Exit gate:** the wrong sequence, actionable warning, correction, and resulting evaluation can be demonstrated repeatedly without claiming unsupported certainty.

## Phase 6 — Hardening, deployment, and submission

**Depends on:** Phases 1–5. **Scope and deliverables**
- Run production lint, type-check, tests, and build; verify real integrations only through explicit smoke tests.
- Check camera permissions, media/API failures, loading states, environment handling, and production bundle for secret exposure.
- Verify current deployment and upload constraints, deploy to the selected host, and check the deployed application.
- Update README with validated setup, actual architecture/model use, limitations, and test instructions. Prepare a truthful three-minute demo and confirm public-repository and official submission requirements.

**Verification:** retain actual command results, deployment URL/check if deployed, demo evidence, and known limitations.

**Exit gate:** core acceptance criteria pass and the deployed/demo workflow is truthful and reproducible. Do not add large features during hardening unless the core gates already pass.
