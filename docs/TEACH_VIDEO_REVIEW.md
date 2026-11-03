# Video-informed Teach actions and goals

Owner-authorized scope: add actual demonstration video to canonical Teach's existing final drafting operation, preserving V3 evidence checks. This extends Teach generation only. It does not enable Phase 2 approval/storage migration or modify Practice, voice, deterministic runtime verification, navigation or screen layout.

## What changed

Previously, Meta Spark discovery saw the video and SAM tracked objects, but final drafting received only narration and representative coordinates. It could not visually cross-check the proposed action meanings or final outcome itself.

The reviewed MP4 now accompanies the final drafting request. With `SPARK_PROVIDER=baseten`, the adapter sends `video_url: {url: "data:video/mp4;base64,..."}` to Chat Completions using exactly `meta-models/muse-spark-open-1026`. It still omits JSON mode/`response_format` and validates the prompt-requested JSON with Zod. The configured Meta alternative uses the corresponding uploaded Meta file; Meta references never enter Baseten's body. Existing discovery, SAM and Voice transports remain Meta.

The model receives actual video, timestamp-to-frame mapping, narration, object IDs and tracking context in one existing request. Its `videoReview` must contain:

- Meaningful visible actions with source windows, object/requirement/step links and coverage reasons.
- Exactly one matching represented visual action for each generated step; continuous carries must not be fragmented into arbitrary lift/place actions.
- Required unsupported work retained explicitly, including actions involving an untracked object. Those entries may have no object IDs instead of inventing identities.
- `not_shown` actions with `evidenceWindow=null`, no measured step IDs and unsupported coverage. Narration alone cannot manufacture source timestamps.
- A goal review linked to all required requirements, a shared observed final scene, and explicit limitations.

Structural/source validation rejects unknown references, missing audits on video drafts, mismatched action windows, unseen actions labeled measured, omitted required coverage and unsupported final-scene references. Existing geometry/source checks still apply. Human review and the deterministic verifier retain their separate roles; the model's own audit is not an independent second opinion or a physical pass/fail decision.

## Media, spending and provenance

The original upload is already inspected for actual video format/codecs, duration, frame bounds and host size limits. Its server-sealed upload reference now includes a SHA-256 digest. Before dispatching any new model work, the compile handler verifies the attached MP4 bytes against that digest and the inspected byte count. Different clips and older unbound upload references fail explicitly before provider dispatch.

The browser sends the same reviewed bytes without re-encoding. Missing/generic file MIME metadata is normalized only for the data URL; it does not change the bytes. Compile requests use the existing host body cap rather than the small general JSON-edit cap. Base64 expansion is checked on the client, bounded again on the server, and covered by budget tests: Vercel's 1.98 MB video becomes about 2.64 MB; other Node hosts' 8 MB video becomes about 10.67 MB. Both leave room for the bounded upload token/goal under their respective 4 MB/12 MB compile caps. Audio was transcribed during upload and is not re-uploaded in this request.

There is still one final drafting request, now with video tokens. No additional model request, automatic retry or cross-provider fallback was added. Token usage/cost can increase. No paid request was made for implementation or automated tests.

## Files

- `src/app/teach/local-teach.tsx`: attach reviewed video to the normal compile action; enforce actual encoded body size.
- `src/teach/media.ts`: read the reviewed, bounded clip as a data URL without changing its bytes.
- `src/server/teach/video-evidence.ts`: canonical base64/MP4 bounds and binding to the reviewed upload digest.
- `src/server/teach/http.ts`: accept bounded video evidence, validate before provider calls, and pass it to the existing compiler.
- `src/server/teach/pipeline.ts`: seal upload digest, attach video/timeline to final drafting and require/preserve its action audit.
- `src/server/meta/spark.ts`: Baseten video content through typed SDK POST and configured Meta file transport; no type suppression or new dependency.
- `src/teach/video-review.ts`: strict audit schema and pure consistency validation.
- `src/teach/schema.ts`: preserve and validate the returned audit in the reviewable draft.
- `tests/teach-video-review.test.ts`: bounded transport, source binding, HTTP handoff, audit/source coverage and safety regressions.
- `e2e/teach-v3.spec.ts`: verify the normal Teach page attaches video and preserves the mocked visual audit through review.
- `README.md`, `docs/DECISIONS.md`, this file: usage, decision and evidence record.

Earlier uncommitted provider/scene-validator repairs and the owner's modified instruction file were preserved. This task does not commit, push or deploy.

## Documentation checked

[Baseten vision documentation](https://docs.baseten.co/inference/model-apis/vision) lists Muse Spark Open video support and its sampling/media limits. [Meta's Baseten cookbook](https://github.com/meta-models/meta-oss-cookbook/blob/main/muse-spark/hosted/baseten.md) documents `image_url`, `video_url` and `audio_url` media parts and inline base64. The hackathon model slug remains the owner's specified `meta-models/muse-spark-open-1026`; public examples use a different general slug, which was not substituted into the app.

## Verification and limits

Verification performed:

| Check | Actual result |
| --- | --- |
| Focused mocked Teach/provider tests | 139 passed in five files |
| `npm test` | 562 passed in 66 files |
| `npm run lint` | Exit 0: 0 errors, same 5 warnings in existing image/suppression lines |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0: production compilation, TypeScript, page generation and route output passed |
| `QA_BASE_URL=http://127.0.0.1:3317 npm run test:e2e -- e2e/teach-v3.spec.ts` | 1 passed against the production build, with provider/upload responses mocked: normal Teach attaches MP4 bytes, preserves the action/goal audit through review, retains unsupported work and keeps V3 approval gated |
| `git diff --check` | Passed |
| Live Baseten video, actual physical camera/microphone/gesture, hosted deployment | Not run; no acceptance claimed |

The initial full-suite run exposed a slow test assertion comparing a large video Buffer element-by-element. Native full-byte equality replaced that assertion; the test timeout was not increased, and the final complete suite passed. No application validation was weakened. The temporary production browser-test server on port 3317 was stopped, and Next-generated tracked configuration differences were restored.

To reproduce offline: run the commands above; the browser command needs the freshly built local server (for example `npm start -- --hostname 127.0.0.1 --port 3317`). Tests use fixtures/mocked responses and never call paid models. To inspect real behavior manually, load the updated app with the intended server provider setting, upload a fresh reviewed clip (old upload references lack the digest), and explicitly build the lesson. That normal build spends the existing model requests; compare every action and the intended goal with the source clip and inspect `videoReview` in the existing advanced editor. It is not evidence of runtime Practice completion.

Baseten samples at most 96 frames per clip and ignores its audio track. The separate transcript remains important; short, hidden or ambiguous actions can still be missed. The code cannot prove that a model-generated inventory contains every real action, or that a free-text description is semantically correct. It validates the available evidence and refuses unsupported execution claims. Real model action recognition on the owner's video remains untested here.

The actual hackathon deployment's video request and latency have not been live-tested. Existing 120-second model request limits and host analysis deadlines remain; this task does not guarantee 60-second clips finish under Vercel Hobby's runtime ceiling. No actual physical-camera/microphone/gesture or deployment acceptance is claimed. New V3 procedures remain draft-only until the owner authorizes their approval/Practice migration.
