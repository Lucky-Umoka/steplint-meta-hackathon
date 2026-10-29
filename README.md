# StepLint

Meta-powered TypeScript for the physical world: turn expert demonstrations into approved step-by-step guides and catch incorrect actions during practice.

StepLint is planned as a visual verification system for physical procedures. It will use AI-assisted perception and procedure drafting alongside a deterministic evaluator that checks explicit prerequisites, state changes, and action order. Generated procedures must be reviewed and approved by a person before practice.

## Current status

Phase 1 foundation is implemented: a minimal Next.js application, an application-only health endpoint, a server-only Meta client, and separate opt-in smoke scripts. On 2026-10-29, both owner-approved live smoke requests passed: Spark returned validated text, and SAM returned one box and a successfully decoded nonempty mask. Phase 2 adds a Zod-validated procedure schema and pure deterministic verifier, with 53 new local tests covering order, uncertainty, duplicates, reset/retry, and recovery. Phase 3 adds an isolated local media lab and opt-in video/transcription smoke scripts; the owner-provided recording passed approved live Files upload, SAM video parsing, cleanup, and Voice transcription on 2026-10-29. Teach and Practice workflows are not implemented.

## Project documents

- [AGENTS.md](./AGENTS.md) — canonical coding-agent instructions.
- [PLANS.md](./PLANS.md) — phased implementation roadmap and gates.
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — proposed system design and open technical questions.
- [docs/DECISIONS.md](./docs/DECISIONS.md) — decisions and assumptions with their status.
- [docs/DEMO.md](./docs/DEMO.md) — planned judging demonstration and proof checklist.
- [docs/PHASE1.md](./docs/PHASE1.md) — Phase 1 implementation and verification record.
- [docs/PHASE2.md](./docs/PHASE2.md) — procedure schemas, state machine, examples, and verification record.
- [docs/PHASE3.md](./docs/PHASE3.md) — media lab, measured formats/latency, live script instructions, and verified results.

Muse Code is the project's only coding agent and follows `AGENTS.md`. Muse Code is not a runtime model: only verified calls made by the StepLint application to Meta models count as application Meta integration. Phases 1–3 are complete for their documented tested scope; later phases require the owner's explicit authorization.

## Planned demo

The initial controlled fixture uses a blue base, yellow support, and red latch. The key scenario is closing the latch before installing the support, then correcting the order. The demo must show evidence-backed feedback and must not claim success when the available evidence is insufficient.

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
