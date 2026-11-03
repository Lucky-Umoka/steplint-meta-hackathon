# StepLint

StepLint turns an expert's short demonstration into a human-reviewed physical procedure, then checks a learner's observed actions against explicit rules. It is intended for instructors and learners practising visible workbench tasks, such as assembly, handling objects, or training demonstrations.

A written checklist cannot tell whether a step actually happened. StepLint combines Meta-assisted transcription, object segmentation and procedure drafting with a deterministic TypeScript verifier. **A model does not decide that a learner passed.** The verifier checks measured transitions, prerequisites, order and approved postconditions; missing or ambiguous evidence means `needs_verification`.

## Status and scope

This is a hackathon prototype with implemented Teach and local Practice flows. **Physical-camera acceptance remains outstanding.** Passing unit tests, generated-camera tests or individual API smoke tests does not establish arbitrary-task accuracy, hardware safety or production readiness. See the [Phase 6 acceptance report](docs/PHASE6_ACCEPTANCE.md) for dated results, failures and deployment status.

The canonical flow is:

1. **Teach:** record/upload → analyse → inspect and correct the draft → explicitly approve → save.
2. **Practice:** choose an approved lesson **before entering the room** → camera opens for supported automatic references → local tracking and deterministic feedback.
3. Selecting **Practice** on a Teach lesson opens that lesson directly. Learners do **not** need the creator's Teach access code or session token.

Lessons are stored in IndexedDB in the current browser and origin. A localhost lesson is not automatically available on a Vercel domain, another device, another browser profile or an incognito window. There is no cloud lesson catalogue or account system. Download approved exports for backup; the current learner picker lists locally saved lessons, not a shared remote library.

## Run locally

### Prerequisites

- Node.js **22.12+ within 22.x**, or **24.x**; npm. `.nvmrc` selects 22.12.0. Phase 6 was tested with Node 24.21.0; do not infer a Node 22 test from the version declaration.
- A modern desktop Chromium browser is the tested automated-browser target. Camera/microphone access requires localhost or HTTPS and explicit browser permission. Codec, speech recognition and device support vary by browser/platform.
- Your own Meta Model API key with access/credits for the configured models if you want to **create** lessons. Local tests and `/api/health` need no model credentials.

```sh
git clone https://github.com/Lucky-Umoka/steplint-meta-hackathon.git
cd steplint-meta-hackathon
npm ci
cp .env.example .env.local
```

On Windows, copy `.env.example` to `.env.local` in your editor or use `Copy-Item .env.example .env.local` in PowerShell. Do not overwrite an existing configured file.

### Two different credentials: API key versus Teach access code

**`MODEL_API_KEY`** comes from your Meta developer account. Follow the [Meta Model API getting-started documentation](https://dev.meta.ai/docs/overview) and create a key in the [API key dashboard](https://dev.meta.ai/). Account/model access and billing are controlled by Meta. Paste your key into `.env.local`; it is read only by server-side code. Do not paste it into the Teach sign-in box.

**`TEACH_ACCESS_TOKEN` is a password you create yourself.** It does not come from Meta, Vercel, a lesson, or this repository. It protects paid Teach operations on your installation. Generate a random value locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy that generated 64-character value into `TEACH_ACCESS_TOKEN=` in your private `.env.local`. Save it in a password manager. Start the application:

```sh
npm run dev
```

Open **http://localhost:3000/teach** and paste the **same generated value** into **Creator access code**, then click **Unlock Teach**. The creator session lasts eight hours. Restart the server after changing environment variables. Rotating the code invalidates existing creator sessions/review references; it does not add a token requirement to local learner Practice.

There is no default public password. Do not distribute your Meta API key. Anyone you give the creator code to can trigger paid analysis on your installation. Learners only practising already-approved local lessons do not need either credential.

### Environment variables

| Variable | Required for | Value / handling |
| --- | --- | --- |
| `MODEL_API_KEY` | Paid Teach analysis; live model smoke tests | Your Meta API key. Server-only; never `NEXT_PUBLIC_*`. |
| `TEACH_ACCESS_TOKEN` | Creator sign-in, uploads, compilation, approval | Your random creator password, 32–256 characters. Use the same value in Teach's sign-in field. |
| `TEACH_PUBLIC_ORIGIN` | Optional custom domain/reverse proxy | Exact origin, e.g. `https://your-app.example`; no path or trailing slash. Vercel deployment/production hostnames and current Codespaces hosts are recognized automatically. |
| `ENABLE_MEDIA_LAB` | Optional production media diagnostics | Leave blank normally. Set `1` only to deliberately expose `/dev/media-lab`; development enables it locally. |
| `QA_BASE_URL` | Browser tests against an already-running server | Example `http://127.0.0.1:3002`; not a production application setting. |
| `STEPLINT_VERIFY_BUILD`, `STEPLINT_LOCAL_BUILD` | Local isolated builds | Internal test switches. Leave unset on Vercel. |

`.env.local` is ignored by Git. `.env.example` contains names and instructions only. Do not log, commit or put real credentials into screenshots, shell arguments, browser bundles or public documentation.

### Local production preview

```sh
npm run build
npm start
```

Ordinary local production output is `.next-production`; development uses `.next`. Verification builds use `.next-verify` or `.next-local-qa`. On Vercel (`VERCEL=1`), production output is **`.next`**, matching its Next.js adapter. Do not rebuild a directory while a running server is serving it. If port 3000 is occupied, use `npm start -- --port 3002` and visit that port.

Health check:

```sh
curl -i http://localhost:3000/api/health
```

Expected: HTTP 200, `Cache-Control: no-store`, and `{"status":"ok","application":"steplint"}`. POST returns 405. This is application liveness, not a paid model connectivity check.

## Architecture and model roles

```text
Browser Teach: recording / MP4 preview / WAV extraction / explicit consent
  → authenticated Node.js Route Handlers
  → Muse Voice transcription + Muse Spark drafting + SAM source geometry
  → human review of steps, evidence, zones and final goal
  → validated approved procedure + local reference images in IndexedDB

Browser Practice: lesson picker → existing room → local tracking worker
  → timestamped observations → deterministic TypeScript verifier
  → steps / correction / uncertainty / voice guidance / overlays
```

| Component | Actual role |
| --- | --- |
| `muse-spark-1.3` | Server-side object discovery and structured procedure drafting from the recorded demonstration. Outputs are validated and require human review. |
| `sam-3.1` | Server-side segmentation/tracking of source images/video to ground Teach objects and evidence. |
| `muse-voice-transcribe-1.0` | Server-side transcription of the recorded lesson's WAV using Meta's ASR endpoint. |
| Local tracking worker | Tracks bounded visual references during normal Practice; does not send every camera frame to a paid API. |
| TypeScript verifier | Authoritative rule-based pass/fail/uncertainty and recovery decisions. Presence alone is not proof of an action. |
| Browser speech APIs / MediaPipe | Existing runtime voice-command, speech-synthesis and gesture interfaces. These are distinct from recorded-lesson Meta transcription. |
| Muse Code / coding agents | Development tools, not runtime model integrations. |

The OpenAI-named SDK is configured against **`https://api.meta.ai/v1`**; that package name does not mean these model requests go to OpenAI. Provider clients are isolated under `src/server/meta` and guarded by `server-only`. Automatic SDK retries are disabled.

The verifier checks prerequisites and ordered state changes, rejects duplicate advancement and handles unknown evidence. It monitors approved persistent results for observed reversals and supports evidence-based recovery. Prediction may warn but cannot count as a completed action or confirmed failure. See [architecture](docs/ARCHITECTURE.md) and [decisions](docs/DECISIONS.md). Explicit legacy routes remain separate; they are not the normal learner flow.

## Supported media and practical limits

- Teach accepts **10–60 seconds** of demonstration; use a short narrated clip.
- MP4 with **H.264/AVC**, optional AAC audio in the video; the supplied source must have decodable audio to extract the required WAV. No transcript/audio is invented for a silent or missing track.
- Normal browser conversion targets **640×480 at 10 fps, video-only H.264 targeting 180 kbps**; inspected source must have at most 1280×720 total pixels and 600 frames. Browser WebCodecs support is checked. If recording cannot encode H.264, use an existing supported MP4.
- Vercel profile: Teach MP4 ≤ **1,980,000 bytes**, WAV ≤ **1,930,000 bytes**, complete multipart ≤ **4,000,000 bytes**. Self-hosted Node defaults to **8 MB video / 12 MB body**, with a 1 Mbps video target instead of Vercel’s 180 kbps. See [60-second hosting policy](docs/TEACH_60_SECONDS.md).
- WAV is mono signed PCM16 at **16 or 24 kHz**; browser extraction produces 16 kHz. WAV and video durations must agree within 0.5 seconds.
- Standalone media-inspection/video smoke tools have a separate **20 MB** input bound. That does **not** increase the web-upload limit.
- Current local Teach bounds include four tracked objects and up to twenty supported steps. Unsupported coverage must be reviewed, not silently called verified.
- Automatic setup expects roughly the demonstrated workbench view and distinctive visible objects. A different table may work using stable object references; substantial scale/rotation/perspective changes, visually identical objects, occlusion and low contrast remain limitations.
- Automatic feedback is not a guaranteed millisecond deadline. Sensor confirmation/dwell and physical event time are separate from software processing time. Hidden torque, force, electrical state and damage prevention cannot be established from object visibility.

Browser conversion stays local until the user confirms upload. Teach then sends the bounded clip/audio to Meta; temporary uploaded clips are cleaned up on compile/discard where possible. Network/host termination can interrupt cleanup, so check provider storage after failures. Approved lesson data and evidence remain browser/origin-specific. Clearing site storage removes saved lessons.

## Tests and reproducible checks

Install Chromium for browser tests:

```sh
npx playwright install --with-deps chromium
```

| Command | What it proves |
| --- | --- |
| `npm run lint` | ESLint checks. Warnings are reported separately from failures. |
| `npm run typecheck` | Generates Next route types and runs strict TypeScript checks. |
| `npm test` | Unit and mocked-transport integration tests; no live model calls. Includes correct/wrong order, missing prerequisites, uncertainty, duplicate events, retries and recovery. |
| `npx vitest run tests/media.test.ts tests/teach.test.ts tests/local-teach-contract.test.ts` | Media bytes/WAV extraction, upload limits, mocked API contracts and approval handling. |
| `npm run build` | Production compilation. |
| `npm run test:e2e` | Production Chromium tests with mocked providers/generated camera input; starts isolated port 3001 build unless `QA_BASE_URL` is supplied. |
| `npm run format:check` | Formatting of configured guide/server-guide/browser-test directories. |
| `npm run security:check -- .next-production` | Scans the configured key's actual value in tracked files, reachable Git blobs and client artifacts; also checks for the credential name in client artifacts. Requires a privately configured key. Add log paths as subsequent arguments to scan logs. |

For an existing production server: `QA_BASE_URL=http://127.0.0.1:3002 npm run test:e2e` (POSIX shell). Do not point destructive test fixtures at a shared production browser profile. Unit tests use synthetic data; browser tests mock model responses and some device interfaces. Neither proves actual camera, microphone or gesture-recognition accuracy.

### Explicit live API smoke tests (paid)

These never run as part of ordinary tests. Review payloads, permissions and account cost first. `--approved` is an operator acknowledgement, not an approval system. Each command attempts one model request with no automatic retry; the SAM video command also uploads and deletes one file.

```sh
npm run smoke:spark -- --approved
npm run smoke:sam -- --approved
npm run media:inspect -- /path/to/clip.mp4 /path/to/audio.wav
npm run smoke:sam-video -- --approved --mp4 /path/to/clip.mp4 --sha256 VIDEO_HASH_FROM_INSPECTION --concept "yellow box"
npm run smoke:voice -- --approved --wav /path/to/audio.wav --sha256 AUDIO_HASH_FROM_INSPECTION
```

Use your own consented media and a concept actually present. The repository does not ship the owner's private recordings or API key. Spark uses a short fixed prompt with at most 128 output tokens; image SAM uses the repository-owned synthetic red square. Video/voice inputs are hash-checked and bounded before spending. Provider billing is authoritative; consult [current Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits).

A successful smoke checks transport and output structure, not procedure accuracy or physical safety. A full live Teach run invokes additional paid requests and human review; it is separate from these four smokes and from mocked end-to-end tests.

## Deploy to Vercel

See [deployment instructions and limits](docs/DEPLOYMENT.md), especially the fix for **`NEXT_OUTPUT_DIR_MISSING`**.

1. Import the repository using the **Next.js** framework preset and repository root.
2. Use `npm ci` and `npm run build`. `vercel.json` selects `.next`; remove conflicting old dashboard output-directory overrides.
3. Choose a supported Node version (24.x matches the Phase 6 local run). Enable Fluid compute for the documented 300-second route configuration.
4. Add `MODEL_API_KEY` and your generated `TEACH_ACCESS_TOKEN` as **server-side environment variables** in the intended Preview/Production environments. Keep `ENABLE_MEDIA_LAB` blank. Set `TEACH_PUBLIC_ORIGIN` only if needed for your exact custom origin.
5. Deploy/redeploy after setting variables. Check health, creator sign-in and an explicitly consented short Teach → Practice run at the resulting URL.

**Deployment preparation is not a tested deployment.** The acceptance report states whether a URL was actually deployed and exercised. If video analysis cannot reliably finish within the host limits, the smallest alternative is the same Next.js/TypeScript app on a persistent Node service; no second-language backend is required.

## Three-minute demo

Use the [demo runbook](docs/DEMO.md). Show a reviewed source lesson and its final goal, choose it before entering Practice, perform a visible correct transition, demonstrate a supported wrong-order/reversal correction, and restore the correct state. Briefly occlude an object to show uncertainty rather than invented success. If the physical scenario fails, show and explain the failure; do not substitute generated-camera footage while calling it live.

## Repository map

- `src/app/teach`, `src/app/practice`: canonical workflows and explicitly separated legacy paths.
- `src/server`: private provider clients, authenticated Teach handlers.
- `src/procedure`: approved procedure contracts and deterministic verifier.
- `src/practice`: local perception, geometry, event adaptation, diagnostics.
- `src/media`, `src/teach`: media conversion and shared lesson/review contracts.
- `tests`, `e2e`: offline/unit/mocked integration and browser regressions.
- `scripts`: explicitly invoked live checks and security audit.
- `docs`: architecture, roadmap records, deployment and acceptance evidence. Historical Phase 1–5/repair records are retained and do not override the latest acceptance report.
- `.media-lab`: ignored private recordings and local evidence; not required to build or deploy.

The official SAM parser/model license is retained under `docs/licenses/SAM-LICENSE.txt`; do not assume all dependencies or assets share one license. Do not claim certification, guaranteed safety, arbitrary-task accuracy or unmeasured performance.

## Optional Baseten final procedure drafting

Teach drafting always uses Baseten (owner decision, 2026-11-03): configure server-only `BASETEN_API_KEY`. The **final default Teach procedure draft** goes to `https://inference.baseten.co/v1/chat/completions`, model `meta-models/muse-spark-open-1026`. `SPARK_PROVIDER` no longer selects Meta for drafting; Meta drafting exists only behind a developer-only test opt-in. There is no automatic fallback. Canonical Teach sends the reviewed MP4 using `video_url` with a base64 data URL alongside bounded narration, timestamp and tracking JSON. The server binds those bytes to the original inspected upload using SHA-256 before any new model request. No Meta video file ID is sent to Baseten. The configured Meta alternative uses its own uploaded file reference. The adapter also retains support for up to eight bounded images.

The same drafting call returns a visual action inventory linked to step windows and requirements, an observed-goal review, and explicit unsupported/unshown work. This is a model-generated draft/audit, not independent physical verification or proof that every action was found. Baseten samples at most 96 frames per clip; brief actions can be missed. Existing host-dependent video/body limits still apply, including base64 expansion in the compile request. See [Teach video review](docs/TEACH_VIDEO_REVIEW.md) for transport, evidence rules and verification limits. V3 approval and Practice remain gated pending their separately authorized migration.

**Two keys, two clients (owner rule):** `MODEL_API_KEY` with `https://api.meta.ai/v1` serves **only SAM 3.1 and Muse Voice Transcribe**; `BASETEN_API_KEY` with `https://inference.baseten.co/v1` serves **only Muse Spark Open** (automatic component discovery and procedure drafting). The Meta client refuses any Muse Spark model at its HTTP boundary, so earlier legacy guide workflows that used Meta-hosted Spark now fail closed instead of calling it. Keep that key and `TEACH_ACCESS_TOKEN` configured. In Vercel, keep `BASETEN_API_KEY` configured (no `SPARK_PROVIDER` setting is needed), then redeploy. No other new variables are needed.

Baseten JSON is requested in the prompt, without JSON mode or `response_format`, and validated with the same compiler Zod contract and subsequent evidence checks. Generation receives complete eligible source-frame intervals, and source-bound schemas reject untrusted reference/action frames. Truncated, invalid or schema-incompatible output fails explicitly; no provider response or key is logged. Provider/model diagnostics accompany the server compiler result. Muse Spark Open always reasons; no unsupported reasoning control is sent. Baseten V3 drafting now has a bounded 24,576-token total ceiling for reasoning plus JSON (Meta stays at 12,000); this adjustment follows two truncated live requests and has not yet passed a live confirmation. See [source evidence repair and live results](docs/TEACH_SOURCE_EVIDENCE_FIX.md).

Offline tests: `npx vitest run tests/spark-provider.test.ts`. Optional paid smoke: `npm run smoke:baseten -- --approved` makes at most three requests (text, one image, two identical synthetic image frames), stopping on first failure with no retries. Without the flag it makes no call. This checks API compatibility, not real video sequencing or lesson accuracy.

This migration targets the open-weight bonus. **Partner verification determines prize eligibility; it has not been independently verified here.** No live Baseten request or prize acceptance is claimed by the mocked tests.

Teach supports 60 seconds through shared duration/media bounds. Vercel auto-selects the safe upload profile; other Node hosts default to the larger standard profile. Optional public build setting: `NEXT_PUBLIC_TEACH_UPLOAD_PROFILE=vercel|standard` (rebuild required; Vercel forces vercel). No live 60-second performance guarantee has been measured.
