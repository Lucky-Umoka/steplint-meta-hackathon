# Baseten final Teach drafting migration — 2026-11-02

Owner authorized this provider task separately from Phase 6. Existing dirty Phase 6 report/log edits were preserved. No UI, Practice architecture, provider fallback or new product feature was introduced.

## Call map before edits

Default `/teach` calls `teach/discovery.ts` for automatic component discovery on Meta, SAM for source tracking, then `teach/pipeline.ts::compileLesson` for final structured drafting. This last call consumes bounded transcript/tracking JSON rather than an uploaded video reference. Explicit legacy `guide/discovery.ts`, `guide/localization.ts` and final `guide/pipeline.ts` calls remain Meta.

## Changes

- New server-only `src/server/meta/spark.ts`: provider selection defaults to Meta; Baseten uses only Chat Completions, the owner-specified `meta-models/muse-spark-open-1026`, and `BASETEN_API_KEY`. No JSON-mode/schema-response flag, no retries or fallback. Prompt requests raw JSON and embeds the compiler schema; returned JSON passes Zod before existing semantic/evidence validation.
- Default final `compileLesson` call now invokes the adapter. Compiler result includes provider/model/token diagnostics. Discovery remains Meta; SAM/Voice clients/key unchanged.
- Typed adapter errors: missing_api_key, auth_failure, provider_error, truncated_output, invalid_model_data, schema_validation_failed, plus invalid provider/input and unsupported video. Truncation is rejected before parsing. Upstream bodies, keys and raw output are not logged.
- Optional images are bounded to eight base64 JPEG/PNG frames. Video is rejected. Production final drafting is text-only and sends no Meta file ID to Baseten.
- `.env.example`, package smoke command, README and decisions document activation and boundaries. New gated smoke script makes at most three requests using owned synthetic images, stops at first error, and never retries.

## Verification

- `npm test`: **496 passed / 62 files**, 58.16 seconds. Tests use mocks, including Baseten model/endpoint/JSON/truncation/schema/auth/server-failure cases and retained Meta routing. First run had one new Meta mock missing the expected output_text field; corrected fixture, focused recheck 106 passed, final full suite passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed, 0 errors / 5 pre-existing warnings. Scoped lint on changed implementation/tests: no warnings/errors.
- `npm run build`: passed, including production TypeScript.
- `npm run smoke:baseten` without approval flag: blocked, no paid request. **No live Baseten call was made.** Browser/physical acceptance was not rerun for this server-only task.
- Diff reviewed for scope/whitespace and secrets. No commit, push or deployment by this agent.

## Activation and remaining verification

Set `SPARK_PROVIDER=baseten` locally/on Vercel and retain the already-configured server-only `BASETEN_API_KEY`. Keep `MODEL_API_KEY` for Meta discovery/SAM/Voice and `TEACH_ACCESS_TOKEN` for creator access. Redeploy after configuration. No other new environment variables.

`reasoning_effort` is omitted until separately approved live validation confirms the hackathon endpoint accepts it. The exact slug is owner-specified; public examples may use different slugs. Partner verification determines open-weight prize eligibility; **no eligibility confirmation or live API success is claimed**. Live smoke invocation, once explicitly authorized: `npm run smoke:baseten -- --approved` (at most three model requests). Synthetic duplicate frames test multi-image transport, not real motion understanding.

## Owner-authorized two-call live check — 2026-11-02

After implementation, the owner explicitly authorized only two paid requests. Both used the actual `sparkStructured` adapter, server-only Baseten key, exact hackathon slug `meta-models/muse-spark-open-1026`, Chat Completions, prompt-only JSON, 2048-token maximum, and Zod `{ok: true}` validation. No reasoning_effort parameter, retries, fallback or further request was used.

| Request | Result | Latency | Reported output tokens |
| --- | --- | --- | --- |
| Text-only JSON | Passed | 2,636 ms | 211 |
| One owned synthetic PNG plus JSON | Passed | 3,111 ms | 304 |

Exactly **2** model requests were attempted and succeeded. Sanitized local evidence: `.media-lab/baseten/live-two-call-results.json`. No keys or raw provider responses were logged. This confirms endpoint/model availability and text/image request transport with valid JSON, not image-recognition accuracy: both prompts requested the same fixed JSON acknowledgement. Multi-frame input, reasoning_effort compatibility, full Teach drafting quality, physical acceptance and partner prize eligibility remain unverified. Earlier no-live statements in this report describe the implementation checkpoint before this separately authorized check.
