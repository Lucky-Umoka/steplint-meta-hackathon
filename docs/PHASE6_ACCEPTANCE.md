# Phase 6 acceptance report — StepLint

Date: **2026-11-02**. Starting revision: `8de4b21` on `fix/phyical-practice-test`; the working tree was clean when Phase 6 began. Runtime: Node **24.21.0**, Linux; automated browser: Playwright Chromium. Scope: testing, verified deployment blocker, documentation and demonstration preparation. No new runtime models, dependencies, UI redesign or verifier changes.

**Overall status: local hardening/deployment preparation performed; hosted and physical end-to-end acceptance remain open.** A successful build or API smoke is not proof that a deployed learner will be corrected accurately or quickly.

## Verified blocker and fixes

1. **Vercel `NEXT_OUTPUT_DIR_MISSING`.** Owner's logs expected `/vercel/path0/.next`; the previous config emitted `.next-production`. `next.config.ts` now emits `.next` when `VERCEL=1`, and `vercel.json` agrees. Local isolated directories remain intact. `VERCEL=1 npm run build` passed and produced `.next/BUILD_ID` and `.next/routes-manifest.json`. No dependency upgrade was needed to fix this error; npm/ESLint notices are separate.
2. **Missing newcomer setup information.** README and `.env.example` now distinguish the creator password the operator generates (`TEACH_ACCESS_TOKEN`) from the Meta-issued `MODEL_API_KEY`. Included local commands, Vercel variables, supported media, model roles, token-free learner entry, limitations and demo flow. Removed stale README/demo statements saying Practice was unimplemented.
3. **Non-asserting camera probes.** Removed committed `zz-probe.spec.ts` / `zz-video.spec.ts` tests that ended with `expect(true)`. Their replacement checks real generated-stream frame progression, decoded red pixels and stopping the camera. Shared synthetic approval setup is in `e2e/approved-fixture.ts`; this is test data, not a runtime implementation.
4. **Tests still assumed the old learner path.** Voice tests now enter a selected approved lesson. Automatic Practice test references are provided in the actual local artifact instead of a mocked receipt endpoint that canonical Practice no longer calls. Gesture assertions run while the live panel is visible; optional calibration intentionally hides that panel in the established UI. The updated test waits for a fresh camera frame before requesting setup, respecting the actual control guard.
5. **Deployment/security regression checks.** Added tests for Vercel output versus isolated local builds, the existing upload budget, route durations and credential-free health JSON. Added a read-only scanner for the configured API-key value in source, client assets, reachable Git history and nominated logs. `.vercelignore` keeps private local media/environment/build output out of CLI uploads.

Upload limits were already enforced and were **not increased**: MP4 ≤2.8 MB, WAV ≤1.1 MB, whole multipart ≤4,000,000 bytes. The server bounds actual received bytes before parsing/spending; header-only checks are not the sole enforcement. Video routes retain `maxDuration=300`. [Current host constraints and fallback](DEPLOYMENT.md).

## Exact checks and results

### Unit and mocked-transport integration

| Command | Actual result |
| --- | --- |
| `npm test` (initial baseline) | **482 passed / 60 files**. No live model calls. |
| `npx vitest run tests/deployment.test.ts tests/teach.test.ts` (initial deployment regression) | **71 passed / 2 files**; a later health assertion is included in the final full run. |
| `npm test` (final after deployment/health tests) | **486 passed / 61 files**, 41.92 s. |
| `npm run lint` | No errors; five pre-existing warnings (four native image warnings and one unused hook suppression). A temporary unused test import introduced during cleanup was removed. |
| `npm run typecheck`, then final `npx tsc --noEmit` | Passed. |
| `npm run format:check` | Passed for the configured directories. |
| `VERCEL=1 npm run build` | Passed, including TypeScript; actual output `.next` with Next route manifest. |
| `git diff --check` | Checked before handoff; no whitespace errors. |

The 486-test run includes actual PCM resampling/WAV extraction through Mediabunny, media bounds and malformed bytes, mocked SAM/Voice transport and parser contracts, upload cleanup, human approval, deterministic correct/wrong order, prerequisites, ambiguity, duplicate/retry handling, continuous movements, reversal and recovery. These are automated acceptance tests, not physical acceptance.

### Browser integration and generated camera

Command: `VERCEL=1 npm start -- --hostname 127.0.0.1 --port 3002`, then `QA_BASE_URL=http://127.0.0.1:3002 npm run test:e2e`.

- Initial full run: **33 passed / 2 failed**, 4.1 minutes. Failure causes and test repairs are listed above; no evidence threshold or production control was weakened.
- First targeted recheck: automatic Practice passed; calibration voice command initially arrived before the restarted camera had a fresh frame. Added an assertion that the real capture control was enabled before speaking. Subsequent targeted gesture check passed.
- Final full run: **pending at report draft; updated below when complete**.

Covered paths include canonical Teach upload/review/approval/save → selected Practice room; token-free pre-room lesson choice; actual local worker automatic start, green completion, red reversal and recovery; gesture hit-testing/native page actions from simulated recognizer readings; mocked browser speech delivery; camera denial/uncertainty; preserved explicit legacy workflow regressions. The generated recorder test parses the actual uploaded browser-generated H.264 MP4 and extracted mono 24 kHz PCM16 WAV and checks the complete upload size, then stops at a mocked failure response without contacting models.

**Boundary:** the Teach-to-room browser journey uses mocked provider drafts, and the automatic worker verification uses a generated visual fixture. This is not one successful live-model + human-review + physical-camera lesson. No such combined physical acceptance occurred in Phase 6.

### Real model smoke tests — four requests, no retries

The owner authorized Phase 6 smoke tests. Before calls, a notice named all models, inspected inputs and bounded counts. Credentials were checked for presence without printing them. Commands below use private files not shipped in the repository; use the hashes produced by `media:inspect` for your own consented media.

| Command / model | Actual result |
| --- | --- |
| `npm run smoke:spark -- --approved` / `muse-spark-1.3` | **Passed**: one short text request, max 128 output tokens, completed response with expected `STEPLINT_OK`. |
| `npm run smoke:sam -- --approved` / `sam-3.1` | **Passed**: one owned synthetic 256×256 image; completed stream, **1 box / 1 decoded nonempty mask**. |
| `npm run smoke:sam-video -- --approved --mp4 .media-lab/steplint.mp4 --sha256 <inspected SHA-256> --concept 'yellow box'` / `sam-3.1` | **Passed**: one upload, one segmentation request, one confirmed delete. **214 boxes and masks across 214 of 223 frames**. Upload 7,909 ms; segmentation/parsing 12,380 ms. Missing frames are not invented detections. |
| `npm run smoke:voice -- --approved --wav .media-lab/steplint.wav --sha256 <inspected SHA-256>` / `muse-voice-transcribe-1.0` | **Passed**: one request, nonempty validated transcript, provider duration 15,040 ms; latency 4,540 ms. Transcript accuracy was not independently scored. |
| `npm run media:inspect -- .media-lab/steplint.mp4 .media-lab/steplint.wav` | **Passed**: MP4 H.264/AAC, 640×480, 223 frames, 15.0173 s, 2,103,900 bytes; WAV mono PCM16/24 kHz, 14.9973 s, 719,916 bytes. Hashes verified before calls. |

No live request was automatically retried, no extra Teach workflow smoke was silently added, and no billed cost was inferred as an actual invoice. Sanitized local summary: `.media-lab/phase6/live-smoke-summary.json`; private logs/media remain uncommitted. These calls establish API transport and parsing for those inputs, not semantic accuracy, low-latency physical feedback or complete Teach compilation.

### Health and access boundary

Against the Vercel-mode production build at **`http://127.0.0.1:3002`**:

- `GET /api/health`: **200**, exact `{"status":"ok","application":"steplint"}`, `Cache-Control: no-store`.
- `POST /api/health`: **405**.
- `/teach`, `/practice`: **200**.
- Fresh unauthenticated POSTs to `/api/teach/lesson`, `/api/teach/compile`, `/api/teach/approve`: **401**; no model call.

This address is a local test server, **not a deployment URL**.

### Secret handling

`npm run security:check -- .next <log paths...>` inspected the configured `MODEL_API_KEY` value without displaying it. Initial scan: **341 files, 45 client artifacts and 619 reachable historical Git blobs; zero findings**. Final scan including new documentation/tests and all Phase 6 logs is recorded below. No tracked real environment file was found. The provider client remains `server-only`; no `NEXT_PUBLIC_MODEL_API_KEY` is used.

This is an exact-value scan for the configured key, not proof that every unknown historical secret or every external log system is clean. Provider/server/browser code was not modified to expose credentials. Build and checked test logs did not contain the configured key.

## Deployment status

**Deployment URL: none available. Hosted deployment tested: no.** No linked `.vercel` project, Vercel account token or connected Vercel deployment tool was available. No commit, push, merge, project creation, production deployment or external environment-variable mutation was performed. The Vercel-mode local build verifies the reported output mismatch; it does not test Vercel's deployed execution.

The owner must deploy the repaired revision and configure the server-side values in the target Preview/Production environment. Then execute the HTTPS acceptance checklist in [DEPLOYMENT.md](DEPLOYMENT.md). Current Vercel constraints are documented with official sources; whole-video pipeline reliability under those limits is unaccepted until measured on the deployment. The smallest proposed fallback is the same TypeScript/Next.js app on a persistent Node web service; it was not provisioned or tested.

## Remaining limitations and manual tasks

1. **Deploy and test the actual URL.** Ensure this working-tree repair reaches the deployed revision, correct dashboard settings, set secrets privately, redeploy and verify health/sign-in/upload/approval/Practice on that origin.
2. **Actual physical-camera acceptance remains open.** Use real unmarked objects and the demonstrated camera angle. Test continuous movements, wrong order, approved reversals, uncertainty and evidence-based recovery. Recorded source API smokes do not establish physical practice accuracy.
3. **Actual microphone and gesture acceptance remains open.** Browser tests use simulated recognition readings. Test your real microphone/hands and confirm actions occur; verify device indicators stop when leaving the room.
4. **No cross-device lesson catalogue.** IndexedDB is browser/origin-specific. Saved localhost lessons do not populate a new deployed origin automatically. The normal picker lists local approved lessons; cloud publishing/import UI is outside Phase 6.
5. **Accuracy and latency are bounded.** No arbitrary-task, hardware damage-prevention, hidden torque/electrical correctness or hard real-time guarantee. Current four-object, short-clip constraints and ambiguous/occluded objects remain limiting. Older artifacts without automatic visual references require a fresh approved Teach review or explicit manual recovery.
6. **Mocked versus real evidence remains separate.** Unit/mock/generated-camera results, individual live APIs, recorded-video replay and actual physical acceptance are different categories. No new recorded-video Practice replay or physical test was performed this phase.
7. **Manual demonstration.** Follow [DEMO.md](DEMO.md): source/review/approval → choose lesson → continuous correct move → measured wrong move/reversal → correction/recovery → uncertainty → architecture/limits. Record any failure honestly.

Phase 6's hosted/physical exit gate is **not closed** by the local results above.
