# StepLint

Meta-powered TypeScript for the physical world: turn expert demonstrations into approved step-by-step guides and catch incorrect actions during practice.

StepLint is planned as a visual verification system for physical procedures. It will use AI-assisted perception and procedure drafting alongside a deterministic evaluator that checks explicit prerequisites, state changes, and action order. Generated procedures must be reviewed and approved by a person before practice.

## Current status

The browser-first Teach/Practice repair is in progress as version 0.2.0. The learner flow now selects a locally saved guide, starts the camera, receives automatic setup assistance, and starts practice with Ready or an observed task action. The creator reviews labelled start/change/result frames and a goal, can privately rehearse, and explicitly approves a revision before saving. The normal learner interface has no test fixture, colour-sampling calibration or developer diagnostics.

Runtime Meta roles remain Voice transcription, Spark interpretation/drafting and SAM segmentation, with server-only credentials and deterministic procedural decisions. The new real-recording acceptance is **not complete**: all five approved live repair trials stopped before approval/Practice because discovery or grounding evidence was insufficient. Upload deletion was confirmed. No sixth trial was run. See [current repair evidence](docs/REPAIR_VERIFICATION.md). Historical model successes are recorded separately in PHASE1–PHASE5 and do not prove the new workflow or physical-camera accuracy.

Local guide storage is browser/origin-specific. Cloud sharing, longer lessons and additional model hosting are deferred in [FUTURE_WORK.md](docs/FUTURE_WORK.md). [The approved repair plan](docs/TEACH_PRACTICE_REPAIR_PLAN.md) defines the current gates.

## Project documents

- [AGENTS.md](./AGENTS.md) — canonical coding-agent instructions.
- [PLANS.md](./PLANS.md) — implementation roadmap and current repair priority.
- [docs/TEACH_PRACTICE_REPAIR_PLAN.md](./docs/TEACH_PRACTICE_REPAIR_PLAN.md) — scoped repair and acceptance gates.
- [docs/FUTURE_WORK.md](./docs/FUTURE_WORK.md) — deferred work with explicit return gates.
- [docs/MODEL_ROLES.md](./docs/MODEL_ROLES.md) — selected models and researched future candidates.
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — proposed system design and open technical questions.
- [docs/DECISIONS.md](./docs/DECISIONS.md) — decisions and assumptions with their status.
- [docs/DEMO.md](./docs/DEMO.md) — planned judging demonstration and proof checklist.
- [docs/PHASE1.md](./docs/PHASE1.md) — Phase 1 implementation and verification record.
- [docs/PHASE2.md](./docs/PHASE2.md) — procedure schemas, state machine, examples, and verification record.
- [docs/PHASE3.md](./docs/PHASE3.md) — media lab, measured formats/latency, live script instructions, and verified results.
- [docs/PHASE4.md](./docs/PHASE4.md) — Teach setup, pipeline, review/approval, tests, and live smoke results.

Muse Code is the project's only coding agent and follows `AGENTS.md`. Muse Code is not a runtime model: only verified calls made by the StepLint application to Meta models count as application Meta integration. Phases 1–3 are complete for their documented tested scope; later phases require the owner's explicit authorization.

## Current acceptance target

Use the owner's consented phone-unboxing recording through Teach, creator rehearsal, local save and learner Practice. Correct/wrong-order/uncertain cases must use observed changes and approved rules. The blue/yellow/red fixture remains deterministic regression-test data only; it is not part of the normal learner flow. Recorded camera replay and physical-camera acceptance are separate evidence categories.

## Setup expectations

Use Node 22.12+ (22.x) or Node 24.x and npm. This workspace uses Node 24.21.0. The `.nvmrc` records the compatible Node 22 baseline; Node 22 has not been exercised here.

```sh
npm ci
npm run dev
```

Open http://localhost:3000 and http://localhost:3000/api/health. Neither needs credentials. The health response is exactly `{"status":"ok","application":"steplint"}` and does not test Meta. POST to the health route should return 405; never send it camera frames.

For model tests only, copy `.env.example` to `.env.local` and set `MODEL_API_KEY` privately, or provide it through your environment. Do not paste keys into code, chat, logs, or command arguments. `.env.local` is ignored. Existing environment variables take precedence. No `NEXT_PUBLIC_` key is used.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`package.json` lists runtime dependencies and development tools; its scripts name repeatable commands. `package-lock.json` locks exact installed versions so `npm ci` reproduces them. The dev/build commands select Next.js’s bundled Webpack because Turbopack’s CSS worker cannot bind a port in this environment. Next.js provides routing and builds, React describes the page, TypeScript checks types, Tailwind supplies CSS utilities, and Vitest runs local tests. `typecheck` generates Next.js route types before checking all TypeScript.

`src/app/api/health/route.ts` maps its exported `GET` function to `/api/health`. `src/server/meta/client.ts` uses the official `openai` TypeScript SDK pointed at Meta, with a `server-only` import that prevents accidental use in browser components. Credentials are read lazily, only when constructing the client. SDK retries are disabled and timeout is 60 seconds.

### Explicit live smoke tests

**Obtain owner approval for the model, payload, request count, and cost before running these.** The `--approved` flag records the operator's responsibility to obtain approval; it cannot verify a conversation. Running without the flag fails locally before any API call. Ordinary tests never invoke these scripts.

```sh
npm run smoke:spark -- --approved
npm run smoke:sam -- --approved
```

- Spark: one `muse-spark-1.3` Responses request with a fixed short prompt, minimal reasoning, and at most 128 output tokens; requires completed output containing exactly `STEPLINT_OK`.
- SAM: one `sam-3.1` streaming Responses request with one owned synthetic 256×256 PNG and the noun phrase `red square`. The fixture is generated geometry, not a photo or recording. No upload API call is needed. `parseImageStream(events).finalResult` consumes the stream once; completion and diagnostics are checked, then `recordsOfKind` selects geometry and `decodeMaskToRaster` verifies nonempty masks. No handwritten mask decoder is used.

Model IDs select which Meta model performs the request; the SDK package does not mean OpenAI serves these calls. Environment variables are private process configuration; `.env.example` documents names only. Local tests use a published parser example as mocked data, never as proof of live model success. API failures report status and error class without dumping response bodies or credentials. Do not automatically retry a failed paid request; obtain approval again for additional requests.

Pricing checked 2026-10-29: Spark standard input $1.25 / million tokens, output $4.25 / million tokens; this tiny request is expected below $0.001 (128 output tokens cost at most $0.000544, plus input). SAM is $0.0025 per image. Combined expected cost is below $0.0035 for the two requests, without retries; provider billing is authoritative. See [official pricing](https://dev.meta.ai/docs/pricing-rate-limits).

Official contracts: [Responses API](https://dev.meta.ai/docs/protocols/responses), [SAM requests](https://dev.meta.ai/docs/sam/overview), [SAM TypeScript parser](https://dev.meta.ai/docs/sam/client-libraries). The parser package uses Meta's SAM License, not MIT; retain its license if redistributing it. Next.js, React, Tailwind, Zod, Vitest, TypeScript, and ESLint use MIT; OpenAI's SDK uses Apache-2.0. See `docs/PHASE1.md` for actual verification outcomes.

## Media compatibility lab (Phase 3)

Run `npm run dev` and open http://localhost:3000/dev/media-lab. Confirm recording consent, inspect codec probes, then record 10–15 seconds with spoken narration. Preview/download the generated files or discard them. An existing MP4/H.264 file can be selected when encoding is unsupported. Files stay local; the page never sends them to Meta. The lab is disabled in production unless `ENABLE_MEDIA_LAB=1` is deliberately set server-side.

See [PHASE3.md](docs/PHASE3.md) for local inspection and explicitly approved `smoke:sam-video` / `smoke:voice` commands. Both live Phase 3 smoke tests passed on the owner-provided recording. Successful parsing does not establish segmentation/transcription accuracy or procedural verification.

## Teach mode (Phase 4)

Run `npm run dev` and open http://localhost:3000/teach. The private workspace access code is `TEACH_ACCESS_TOKEN` in your ignored `.env.local`; use a random value of at least 32 characters. It is separate from `MODEL_API_KEY`, which stays server-only. This task generated an access code privately if none existed. Configure both variables in your hosting environment before using paid routes. Codespaces forwarded URLs are recognized automatically; for another reverse proxy, set `TEACH_PUBLIC_ORIGIN` to the exact public origin (for example `https://your-app.example`, without a trailing slash).

Preview and confirm a short lesson before upload. Teach transcribes speech, asks Spark to identify up to four components automatically, tracks their proposed interior points using SAM, then asks Spark for an **unapproved** procedure draft. Automatic analysis uses two Spark requests and one SAM request after preview consent; manual marking is an optional fallback. Correct the draft, inspect source frames and candidate errors, review/edit suggested zone mappings and a few marked reference moments, then explicitly confirm each condition before approval. Unsupported or uncertain transitions cannot become verified steps. Use **Save and open Practice** for direct handoff, or download the approved artifact to retain it; no server database stores your lesson. Temporary uploads request one-hour expiration and are deleted on compile/discard.

The complete request is limited to 4 MB (MP4 ≤2.8 MB plus PCM WAV ≤1.1 MB and multipart overhead), below Vercel's 4.5 MB body cap. Source video may be saved locally for evidence. No live Practice mode is included. See [PHASE4.md](docs/PHASE4.md) for manual checks and the separately approved `npm run smoke:teach` workflow.

## Practice mode (Phase 5)

Open `/practice`. Import an unchanged approved Teach export in its approving browser session, or explicitly review and approve the hand-authored blue/yellow/red fixture. Start the camera, sample each component colour, draw/check the fixed workbench zones, and confirm calibration. Move each part from its visible starting zone into its target and hold steady. The evaluator checks the approved rules; a premature latch transition reports its real missing prerequisite and recovery. Missing/ambiguous evidence means Cannot Verify.

Frames stay local. Practice uses colour/area tracking with three-frame/400ms debounce, not remote inference per frame. Optional SpeechSynthesis reads approved instructions and corrections. Teach source reference frames come from the locally selected original MP4; the synthetic fixture has no real teaching video. See [PHASE5.md](docs/PHASE5.md) for exact limitations, latency evidence, tests and the physical-camera acceptance walkthrough.

The automatic component-discovery path passed real owner-approved API trials. Point grounding produced evidence-eligible drafts on the synthetic fixture and one visible movement in the owner recording; earlier box-grounded trials were held for weak evidence. All five trials confirmed upload deletion. Human approval and physical-camera testing remain separate. The interface uses visible upload buttons, concise help and centred action feedback. See PHASE4.md for the full test record.


## Browser-first repair checks

`npm test` runs deterministic tests without live model requests. `npm run test:e2e` runs mocked-provider Chromium journeys and starts an isolated verification build on port 3001 when needed. Use `QA_BASE_URL` to test an already running compatible build. Browser tooling is a development dependency (Playwright, Apache-2.0); Prettier (MIT) formats code. Neither is a runtime perception model.

The explicitly invoked `npm run smoke:workflow -- --preflight ...` checks the consented file hash, size, configured environment and app health without consuming a live trial. Actual `--approved-live --trial N --video PATH --sha256 HASH --base URL` runs are separately authorized and recorded in the ignored local ledger. They never run as part of unit/browser tests. Automated acceptance review is marked test-only and is not owner human approval. Never rebuild the directory used by a running app server.
