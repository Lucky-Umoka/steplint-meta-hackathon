# 60-second Teach support and hosting profiles

Owner-authorized task, 2026-11-02. **Final shipping policy: Vercel 180 kbps CBR; standard hosts 1 Mbps CBR, both 10 fps.** Practice source files and verification architecture are unchanged. No live model requests, commits or deployments performed.

## Audit and budget

The audit found duration bounds in media inspection, transcript/provider schemas, source-reference storage and guide metadata; frame bounds in tracking/timelines/automatic references; byte bounds in canonical and legacy upload handlers and smoke scripts; and recording/encoding limits in Teach capture. Unrelated values (gesture landmark count 21, observation gaps 600 ms, CSS colors and schema text lengths) were retained.

`src/media/limits.ts` is the shared policy source. Lessons remain 10–60 seconds, at most 600 processed frames. Encoding uses 640×480 H.264 in explicit constant-bitrate mode at 10 fps and an independent mono PCM16 WAV at 16 kHz. No duplicate audio track is encoded into newly converted MP4s. Existing supported clips already within the active budget can be retained; input clips requiring conversion must have browser codec support. Raw conversion inputs remain bounded (20 MB and at most 3600 frames), then normalized to the 600-frame SAM contract.

| Budget | Vercel | Standard Node hosting |
| --- | --- | --- |
| MP4 target bitrate | 180,000 bits/s | 1,000,000 bits/s |
| Target 60s video payload | 1,350,000 bytes | 7,500,000 bytes |
| Hard MP4 cap | 1,980,000 bytes | 8,000,000 bytes |
| 60s 16 kHz PCM16 WAV | 1,920,044 bytes | Same |
| Hard WAV cap | 1,930,000 bytes | Same |
| Whole multipart body cap | 4,000,000 bytes | 12,000,000 bytes |
| Client multipart reserve | 10,000 bytes | Same |
| Overall analysis abort | 280 seconds | 580 seconds |

The Vercel hard file caps total 3,910,000 bytes, leaving 90,000 bytes of envelope headroom. Browser checks reserve 10,000; the server counts every actual streamed body byte. Encoder bitrate is a target, so actual output caps remain mandatory. Local compressed owner-video3 replay produced a 60s/600-frame file of 1,808,376 bytes; SSIM over its original segment was 0.982341. This is a compression feasibility check, not a segmentation/physical accuracy test or proof for every clip. The repository fixture is separately owned synthetic content.

Vercel builds automatically publish the safe `vercel` transport profile through `next.config.ts`. Other hosts default to `standard`, avoiding a universal Vercel cap. `NEXT_PUBLIC_TEACH_UPLOAD_PROFILE=vercel` can reproduce that envelope locally; it contains public policy only, no secrets. Rebuild after changing it so browser and server agree. Vercel always forces its safe profile. There is no new provider or storage service.

## API and timeout boundaries

Meta documents file transcription up to 10 minutes / 32 MB: https://dev.meta.ai/docs/api-reference/voice/transcribe . A 60-second WAV fits that contract. SAM receives no more than the existing 600-frame budget; the final Spark evidence summary remains bounded rather than sending every track sample. UI tracking-cost estimate scales with the actual processed frame count at the documented $0.20/1000-frame rate (50-frame minimum), plus separate transcription and Spark charges: https://dev.meta.ai/docs/pricing-rate-limits . Billing remains provider-authoritative.

Owner confirmed **Vercel Hobby**, whose function ceiling is 300 seconds: https://vercel.com/docs/functions/limitations . Route declarations stay 300. SAM's request timeout is 240 seconds, constrained by the overall 280-second signal on Vercel, with cleanup headroom. Self-hosted Node has the larger application analysis budget; Next's Vercel route duration declaration is not a self-hosted execution timer.

**No timeout guarantee is claimed.** A mocked 60s upload→transcription→SAM→Spark test verifies media/contracts/cleanup, not remote inference speed. No live or deployed 60s test was authorized. Increasing route duration past Hobby's ceiling would not fix this. Host/provider slowdowns must fail explicitly. A persistent Node host can use the standard profile without Vercel's request ceiling.

## Verification and mistakes caught

A real generated 60-second H.264/600-frame fixture is inspected; tests cover 59/60 acceptance, 61 rejection, invalid/missing metadata, over-budget streamed body rejection, both hosting profiles, 60-second actual PCM resampling/extraction and the mocked full compiler path with confirmed cleanup. External APIs are mocked.

During implementation, verification caught an overly broad literal replacement affecting unrelated 1600/3600 schema text limits and a displaced client directive; both were corrected before final verification. Initial fixed suite: 503 tests passed; the profile-aware final checks are recorded below. Encoding quality and model speed remain separate acceptance categories.


Browser verification also caught AAC decoder padding extending a nominal 60s source beyond the output bound. Conversion now trims to the already-validated source timeline, rejecting 61s metadata before any conversion; no duration-validation tolerance was loosened. The generated 60s browser upload then passed with exactly 600 video frames and 16 kHz PCM WAV. A separate recorder regression exposed frame quantization at the 10s minimum; the Done gate now reserves two 10-fps frames while retaining the 10s encoded-media minimum. Final browser rerun is recorded below.

Desktop/mobile before/after screenshots are retained under ignored `.media-lab/duration60/screenshots`. Navigation, control placement, spacing and interactions were reviewed; only the requested copy changes and dynamically scaled cost information were added. Mobile upload help wraps onto one additional line; no horizontal overflow was observed.

## Reproduce offline

Normal checks: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. To exercise Vercel's smaller envelope locally: `NEXT_PUBLIC_TEACH_UPLOAD_PROFILE=vercel npx vitest run tests/duration-limits.test.ts tests/teach.test.ts tests/media.test.ts`.

The optional browser regression accepts `DURATION_SOURCE` (a local synthetic source path). Generate it with a development FFmpeg installation, not a model:

```sh
ffmpeg -f lavfi -i 'testsrc2=s=640x480:r=15:d=60' -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=60' -c:v libx264 -b:v 200k -c:a aac -b:a 32k -ac 1 -shortest -movflags +faststart -y /tmp/steplint-60s.mp4
NEXT_PUBLIC_TEACH_UPLOAD_PROFILE=vercel STEPLINT_LOCAL_BUILD=1 npm run build
NEXT_PUBLIC_TEACH_UPLOAD_PROFILE=vercel STEPLINT_LOCAL_BUILD=1 npm start -- --port 3005
```

Then in another terminal:

```sh
NEXT_PUBLIC_TEACH_UPLOAD_PROFILE=vercel DURATION_SOURCE=/tmp/steplint-60s.mp4 QA_BASE_URL=http://127.0.0.1:3005 npx playwright test e2e/duration.spec.ts
```

The browser test is skipped without an explicit source path. It checks actual conversion/output bytes and stops at a mocked upload boundary; no live API is called. Do not run a build against a directory currently served by another process.


The Vercel-profile browser test exposed target-bitrate overshoot on a complex moving synthetic pattern; the existing byte guard rejected it. Encoding now explicitly requests constant bitrate instead of relying on the default variable-rate behavior, with the same 250 kbps/1 Mbps budgets and actual-byte guards. A prior standard-host browser case passed; the Vercel case was rerun after this correction. This preserves evidence/media rejection rather than raising Vercel's body cap.


Measured Chromium output at 250 kbps constant bitrate was 2,293,727 bytes on the complex source, so merely selecting CBR was insufficient. A bounded offline 200 kbps trial produced 1,975,335 bytes and reached the prepared screen. The final Vercel target was therefore revised to **200 kbps CBR**, leaving a larger nominal codec-overshoot allowance while retaining the 1.98 MB hard cap. The source-video3 compression check at 200 kbps gave SSIM 0.979888 and a 1,438,709-byte 60s file. Standard hosting remains 1 Mbps. The final canonical build/browser result is recorded below; runtime instrumentation was used only to select the candidate, not as final acceptance evidence.


## Final verification

- Final `npm test`: **504 passed / 63 files**, 63.09 seconds, with mocked external APIs.
- Vercel-profile boundary/Teach/media command: **105 passed / 3 files**.
- Final focused media/duration checks after the conversion correction: **36 passed / 2 files**.
- `npx tsc --noEmit`: passed; final production build also completed TypeScript.
- `npm run lint`: 0 errors / 5 existing warnings. Changed encoding/capture/config files have no lint findings.
- Standard-profile production build passed. Final Vercel-profile production build (`NEXT_PUBLIC_TEACH_UPLOAD_PROFILE=vercel npm run build`) exited **0**.
- Browser: initial standard-profile 60s conversion passed; the smaller Vercel budget exposed codec padding and target-rate overshoot as documented. Final canonical browser result is appended below.
- `git diff --check`: passed. No paid calls, deployment, commit or push. Actual 60s remote inference/physical acceptance remains untested; Hobby timeout reliability cannot be confirmed from mocked tests.

## Changed files

- `.env.example`
- `README.md`
- `docs/DECISIONS.md`
- `docs/DEPLOYMENT.md`
- `docs/LOCAL_PRACTICE_IMPLEMENTATION_LOG.md`
- `docs/TEACH_60_SECONDS.md`
- `e2e/duration.spec.ts`
- `e2e/voice-controls.spec.ts`
- `next-env.d.ts`
- `next.config.ts`
- `scripts/media-inspect.ts`
- `scripts/smoke-teach.ts`
- `scripts/smoke-voice.ts`
- `src/app/teach/capture.tsx`
- `src/app/teach/local-teach.tsx`
- `src/guide/schema.ts`
- `src/media/convert.ts`
- `src/media/inspect.ts`
- `src/media/limits.ts`
- `src/server/guide/http.ts`
- `src/server/guide/relation-http.ts`
- `src/server/meta/media.ts`
- `src/server/teach/http.ts`
- `src/server/teach/pipeline.ts`
- `src/teach/approved-storage.ts`
- `src/teach/automatic-setup.ts`
- `src/teach/media.ts`
- `src/teach/schema.ts`
- `tests/deployment.test.ts`
- `tests/duration-limits.test.ts`
- `tests/fixtures/README.md`
- `tests/fixtures/teach-60s.mp4`
- `tests/media.test.ts`
- `tests/teach.test.ts`

`next-env.d.ts` was already modified at task start and was also regenerated by Next checks. No `src/app/practice` or `src/practice` file changed. The unrelated legacy Practice perception request bound was deliberately retained.


Owner-reported conversion failure identified another confirmed branch: browsers reporting AAC encoding support triggered an obsolete required-audio guard, even though MP4 audio is now deliberately discarded. The guard now requires only video; WAV remains independently validated. The browser regression advertises AAC support during capability probing to exercise the same branch, while using the real video conversion and WAV extraction paths. No media validity check was bypassed.

The 200 kbps candidate left only 4,665 bytes below the video cap and a later canonical run exceeded it. Final Vercel target is **180 kbps CBR**, with unchanged hard file/body caps; standard remains 1 Mbps. At 180 kbps the owner-video3 compression SSIM was 0.978553. Earlier 250/200 kbps measurements above are investigation history, not the shipping settings. The final canonical run uses the unmodified application's encoder policy; capability simulation only covers AAC availability, not success/failure decisions.

### Final canonical browser result

`NEXT_PUBLIC_TEACH_UPLOAD_PROFILE=vercel DURATION_SOURCE=.media-lab/duration60/browser-source.mp4 QA_BASE_URL=http://127.0.0.1:3007 npx playwright test e2e/duration.spec.ts e2e/voice-controls.spec.ts --grep '60s clip|Teach recorder'`: **2 passed (21.9s)**, using the final 180 kbps application policy. The 60s conversion case passed in 6.1s; recorder workflow passed in 13.9s. The test validated 60s/600 frames, video-only H.264, independent 16 kHz mono WAV and actual complete multipart bytes under 4 MB. AAC capability was simulated to reproduce the owner's guard branch; codecs/conversion and uploaded bytes were real browser outputs. No provider was called.

Final full unit/integration run: **504 passed / 63 files (67.76s)**. Final production build and TypeScript passed; lint **0 errors / 5 existing warnings**. Standard-host and Vercel-profile limits were checked separately. Real 60s Meta/Baseten latency and deployed Hobby completion remain untested and cannot be promised. Final shipping bitrate supersedes earlier audit targets: **180 kbps CBR on Vercel, 1 Mbps CBR on standard hosting, 10 fps on conversion**.
