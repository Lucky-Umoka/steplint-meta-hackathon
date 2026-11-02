# Phase 6 deployment preparation

Checked 2026-11-02. This document describes preparation and reproducible checks, not a completed hosted deployment. See [acceptance status](PHASE6_ACCEPTANCE.md).

## Verified cause of the reported Vercel failure

The owner supplied `NEXT_OUTPUT_DIR_MISSING`: Vercel looked for `/vercel/path0/.next`. The prior Next configuration wrote all ordinary production builds to `.next-production` to isolate local previews. The deployment expected a different directory.

`next.config.ts` now prioritizes Vercel's `VERCEL=1` flag and writes `.next`. `vercel.json` explicitly selects Next.js, `npm ci`, `npm run build` and `.next`. Local builds retain their isolated directories. This is not a static export and must not use the `out` directory.

The reported `cache-dir`, deprecated ESLint and install-script notices are not this missing-output error. Do not change libraries merely to conceal those warnings. If an install script is actually blocked on your account, inspect the failed package/install step separately; do not blindly approve all scripts.

## Dashboard configuration

1. Import this repository, root directory `.` and Framework Preset **Next.js**.
2. Deploy the revision containing this repair. Changes in a local workspace do not update a remote Vercel Git deployment until the owner commits/pushes them or explicitly deploys the working tree.
3. Install: `npm ci`. Build: `npm run build`. Output: `.next` as declared in `vercel.json`; remove conflicting dashboard overrides. Do not set `.next-production`, `dist`, `out`, or a nested source folder.
4. Node: 24.x matches the tested local runtime; package engines also permit 22.12+ in 22.x. Do not claim a Node 22 test from that declaration.
5. Enable **Fluid compute**. Application video routes declare `maxDuration = 300`; keep a compatible plan/configuration.
6. Add server-side variables to the actual environment you deploy (Preview and/or Production):
   - `MODEL_API_KEY`: your own Meta API key.
   - `TEACH_ACCESS_TOKEN`: generate your own random 64-character hex password using the README command. This same password unlocks the Teach creator page.
   - `TEACH_PUBLIC_ORIGIN`: optional exact custom origin, no path/trailing slash. Automatically supplied `VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL` are already recognized.
   - Leave `ENABLE_MEDIA_LAB`, `STEPLINT_VERIFY_BUILD` and `STEPLINT_LOCAL_BUILD` unset.
7. Redeploy after setting variables. Never put secrets in `vercel.json`, Git or `NEXT_PUBLIC_*` variables. `.vercelignore` excludes private recordings, environment files and local build output from CLI uploads.
8. Test the resulting HTTPS URL using the checklist below. Save the exact deployment URL and revision in the acceptance report.

There is no Vercel account connection, project link or deployment token configured in this workspace. Do not paste private tokens into chat. The dashboard workflow can complete deployment without giving the coding agent an account credential.

## Current constraints and existing enforcement

Vercel's official [function limits](https://vercel.com/docs/functions/limitations) list a **4.5 MB request/response cap**. With Fluid compute, Hobby allows **300 seconds**, while Pro/Enterprise allow **800 seconds**, with an extended **1800-second beta** subject to runtime/configuration restrictions. Streaming still counts toward invocation duration. These are host ceilings, not application performance guarantees. [Duration configuration](https://vercel.com/docs/functions/configuring-functions/duration)

StepLint already enforces:

| Boundary | Limit / behavior |
| --- | --- |
| Complete multipart Teach request | 4,000,000 bytes, including multipart overhead |
| Source video | 1,980,000 bytes |
| PCM WAV | 1,930,000 bytes |
| JSON review/compile envelopes | Bounded by `MAX_TEACH_JSON` |
| Upload route | 300-second host declaration; 180-second application abort signal |
| Compile route | 300-second host declaration; 280-second application abort signal |
| Source media | 10–60 seconds, ≤600 frames, ≤1280×720 pixels; actual format validation |
| Provider behavior | No automatic SDK retries; upload cleanup on success/failure and requested one-hour expiration in Teach |

`boundedBody` checks declared size and counts actual streamed bytes before parsing multipart input or spending on models. Browser checks reject oversized MP4s. A request exceeding Vercel's own limit can be rejected before the application handles it; keep the whole request under the smaller application cap. Tests cover oversized declared and streamed bodies, malformed input and no paid requests on rejected input.

No server-side FFmpeg executable is required by the normal application: browser media conversion uses Mediabunny/WebCodecs, and Node inspects encoded media and invokes APIs. The app does not need a writable persistent upload folder or a server database. Saved lessons remain in browser IndexedDB and are origin-specific.

## Reliability status and smallest alternative

The source/output mismatch is fixed and locally reproduced under `VERCEL=1`. This does **not** establish that complete video analysis reliably finishes on Vercel. Teach compilation chains multiple remote calls, each with variable latency. A single SAM video smoke completing quickly does not bound the whole upload → transcription → discovery → segmentation → draft workflow. Application aborts and host termination may prevent cleanup or a final error event from reaching the browser.

Until a deployed, real short-lesson run succeeds repeatedly within the configured budget, deployed video-analysis reliability remains **unaccepted**. Do not merely increase a timeout or promise success on a higher plan.

If Vercel terminates representative valid lessons despite the bounded clip size, the smallest alternative is **the same Next.js/TypeScript repository on a persistent Node web service**, such as Render's Node Web Service, rather than adding another backend language, queue or AI provider. [Render's Next.js guide](https://render.com/docs/deploy-nextjs-app)

Use build command `npm ci && npm run build`, start command `npm start -- --hostname 0.0.0.0 --port $PORT`, the same server-side secrets and `/api/health`. Choose a service/proxy timeout suitable for the measured workload. Do not set `VERCEL=1` there; the existing `.next-production` build/start path is consistent. The application's existing timeout/limits still apply; any need to change those requires measured evidence. This alternative is proposed, **not provisioned or tested** in Phase 6.

## Deployment acceptance checklist

- `GET /api/health`: 200 and exact application liveness JSON, no secrets; `POST`: 405.
- `/teach` and `/practice`: render over HTTPS; Practice shows the chooser before any camera/mic room.
- Fresh browser with no creator session: paid Teach POST routes return 401.
- Unlock Teach with the configured creator code; wrong code fails and no model call occurs.
- Record/upload one consented supported clip; review actual draft/evidence; approve and save on this deployed origin.
- Open Practice through that selected lesson; no creator-token prompt or duplicate room selection.
- On the actual device, check camera/microphone permission, correct action, wrong order/reversal, uncertainty/occlusion, recovery and resource release when leaving.
- Measure model-request counts, total processing duration and feedback separately; inspect sanitized function logs for timeouts and check temporary-file cleanup.
- Scan deployed browser assets and never include credentials in the demo recording.

Local smoke checks and mocked browser checks do not check this list on a deployed URL.

For non-Vercel Node hosting, the standard profile now allows a 12 MB body / 8 MB video at 1 Mbps. Vercel uses 4 MB / 1.98 MB at 180 kbps. Both process up to 60 seconds at 10 fps with 16 kHz mono WAV. See [current 60-second policy](TEACH_60_SECONDS.md); no live 60-second completion time is guaranteed.
