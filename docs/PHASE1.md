# Phase 1 verification record

Implementation authorized by the owner on 2026-10-29. Scope is foundation and opt-in API smoke tests only.

Environment: Node 24.21.0, npm 11.19.0. Existing documentation edits preserved. Credentials were kept server-side and successfully authenticated the two approved live requests. No credential values were printed.

## Local checks

Executed on Node 24.21.0:

- `npm run lint`: passed, zero warnings.
- `npm run typecheck`: passed, including Next.js route type generation.
- `npm test`: 9 tests passed; mocked responses and official parser example only. Fetch is forbidden and zero calls asserted.
- `npm run build -- --webpack`: passed; the default `build` script now selects this same Webpack path. Compiled `/`, `/_not-found`, and `/api/health`.
- Production `npm start -- --hostname 127.0.0.1 --port 3000`: started with escalation because sandbox port binding was denied.
- Production HTTP checks: home 200; GET `/api/health` 200 with exactly `{"status":"ok","application":"steplint"}`, JSON content type and `Cache-Control: no-store`; POST 405.
- `npm run smoke:spark` and `npm run smoke:sam` without approval flag: each exited 1 locally with approval-required message. No model calls made.
- `git diff --check`: passed. Environment files, dependency directory and build artifacts are ignored; `.env.example` has only the empty key name. No real environment file is tracked.
- Current credential-value scan of project source/config/docs: no matches. Browser artifacts: neither the credential value nor `MODEL_API_KEY` found (20 files inspected). No key value was printed.
- npm installation audit: zero reported vulnerabilities. ESLint 9.39.5 is deprecated but satisfies the Next.js plugins' peer requirements; attempted ESLint 10 produced peer incompatibilities and was reverted.

Initial failures and fixes: Vitest did not honor the Next.js server marker, so the marker alone is mocked in tests; production guard remains. Turbopack CSS processing failed with a local-port permission error even after escalation, so dev/build use the documented bundled Webpack option. Production server and HTTP checks required escalation. npm registry DNS failures were retried with escalation.

Not performed: visual browser inspection, Node 22 execution, or deployment. Live results are recorded below.

## Live verification

Owner explicitly approved two live requests with no automatic retries on 2026-10-29, after notice of the models, inputs, request bounds, and combined expected cost below $0.0035. Both commands used the existing server-side credential. No additional requests were made.

- `npm run smoke:spark -- --approved`: exit 0. One request to `muse-spark-1.3`, fixed short text input, minimal reasoning, maximum 128 output tokens. Received a completed response; validated output text exactly `STEPLINT_OK`.
- `npm run smoke:sam -- --approved`: exit 0. One request to `sam-3.1`, one synthetic 256×256 PNG, prompt `red square`, streaming Responses API, `one_bit` mask encoding. `parseImageStream(events).finalResult` completed without diagnostics. Official parser returned 1 box and 1 mask; `decodeMaskToRaster` successfully decoded a nonempty mask with a matching box.
- Both clients used `maxRetries: 0`. Actual billing was not retrieved; the previously stated cost is an estimate, not a measured charge.

Phase 1 exit gate satisfied: foundation checks passed and both bounded live smoke requests returned successfully validated output. Manual browser checks listed in README remain for the owner before proceeding to another phase.

The foundation is not evidence of model accuracy, a working Teach/Practice flow, or real-time performance. No later phase is implemented.
