# Phase 3 media compatibility spike

Status: Phase 3 complete for the tested media path. Local compatibility checks passed, and on 2026-10-29 the owner-provided MP4/WAV passed explicitly approved live Files upload, SAM video parsing, cleanup, and Voice transcription. Browser coverage and perception accuracy remain limited as described below.

## What is implemented

- `/dev/media-lab`: client-side technical lab, available under `npm run dev`. Production returns 404 unless the server-only `ENABLE_MEDIA_LAB=1` flag is deliberately set. This is not Teach mode or a public upload service.
- Explicit consent checkbox before camera/microphone permission or existing-file selection; visible recording indicator, elapsed time, automatic stop at 15 seconds, manual stop after 10 seconds, and cancel/discard. Tracks stop on stop, error, cancel, or unmount. Blob URLs are revoked on discard/unmount. No recording is uploaded by the page.
- `src/media/convert.ts`: documented Mediabunny capability probes and conversion API. Probes H.264 at 640×480/15 fps, AAC mono/48 kHz, and PCM16 mono/24 kHz. Camera recording uses a probed MediaRecorder container as a temporary local input. Mediabunny/WebCodecs converts it to H.264 MP4 with fast-start metadata, adding AAC only when encoding is supported. Without AAC, the MP4 is explicitly video-only; WAV is extracted from the original microphone recording.
- WAV extraction decodes the source audio, downmixes to mono, resamples to 24 kHz, and writes signed little-endian PCM16 using Mediabunny's WAVE output. No speech or silence is invented if audio is missing. 16 kHz PCM16 WAV is also accepted by the validation/smoke path.
- `src/media/inspect.ts`: parses actual bytes with Mediabunny for container, codec, dimensions, frame count, audio properties, size, and duration; separately validates WAV RIFF chunks and PCM parameters. It ignores filename/type claims. Input formats are restricted to MP4, WebM, and WAVE, not remote playlists. One video and one audio track maximum.
- Displays actual MIME including codec parameters, sizes, duration, frame count, local processing time, MP4/WAV previews, download links, and explicit failures. A valid MP4 remains downloadable even if WAV extraction fails.
- Existing-MP4 fallback works without an H.264 encoder: parsed MP4/H.264 (optional AAC) is retained unchanged and its audio is converted if decodable. A video-only fallback cannot produce WAV.
- `src/server/meta/media.ts` and separate CLI scripts implement bounded Meta request contracts and official SAM video parsing. No paid HTTP route or browser API key is introduced.

## Boundaries

This spike is deliberately stricter than Meta's maximums: video 10–20.5 seconds (half-second tolerance for container/audio packet boundaries), at most 20,000,000 bytes, 600 frames, and 1280×720 pixels by area. Output recording is 640×480 at 15 fps. MP4 upload accepts H.264 only, with AAC or no audio; it rejects WebM, VP9, MOV, H.265, and other formats even where broader Meta support exists. WAV must be 10–20.5 seconds, mono integer PCM16, 16 or 24 kHz, at most 1,100,000 bytes. Files are read within a bounded buffer and SHA-256 must match the owner-approved input before live scripts run.

Browser support probes do not guarantee successful decoding/encoding. Conversion validity and discarded tracks are checked, actual output is inspected, and errors are surfaced. Codec decode failures retain any independently successful output. The AAC-positive browser branch is not exercised in the measured Linux browser, where the AAC encoder probe returned false. Camera access needs HTTPS or localhost, permissions, and a real device. Background-tab throttling or device interruption can cause a recording to fail the duration check; do not infer success from the timer alone.

## Measured local results (2026-10-29)

Environment: Node 24.21.0, npm 11.19.0, Mediabunny 1.63.0, Playwright Chromium 156.0.8078.4 on Linux, fake camera/microphone. Playwright and its browser/system dependencies were installed as temporary verification tooling, not added to application dependencies. These are synthetic green-clock video and test-tone audio, not a physical StepLint demonstration or speech. No model calls were made.

| Artifact | Actual format | Duration | Size |
| --- | --- | --- | --- |
| Temporary local recording | WebM, VP8 640×480, Opus mono 48 kHz, 225 video frames | 14.94 s | 693,890 bytes |
| Generated MP4 | `video/mp4; codecs="avc1.640c16"`, H.264, 640×480, 223 frames, 15 fps, no audio | 14.8667 s | 500,650 bytes |
| Generated WAV | RIFF/WAVE, integer PCM16 little-endian, mono, 24 kHz | 15 s | 720,044 bytes |

Mediabunny probes: H.264 true, AAC false, PCM16 true. Measured post-recording inspection/conversion time: **827 ms** for this synthetic clip on this environment, not a throughput or real-time guarantee. The small MP4/WAV duration difference is measured; no audio/video alignment accuracy is claimed. A CLI re-inspection independently parsed both downloaded artifacts and produced their hashes.

Browser checks performed:

- No recording starts before consent. Fake camera/microphone recording indicator became visible; auto-stop, both output previews/downloads, and discard worked.
- With an injected unsupported-H.264 probe, recording was disabled and the existing-MP4 fallback remained usable. It retained the valid 500,650-byte MP4; playback time advanced. Its missing audio was explicitly reported, with no invented WAV. Fallback inspection took 83 ms in the repeated check.
- A forged `fake.mp4` with MIME `video/mp4` was rejected as an unrecognizable format; zero download links appeared.
- Injected permission denial was reported and capture did not start.

## Meta contracts and explicitly approved commands

The browser page does not invoke these scripts. Use only after owner notice and explicit approval of the exact input, model, count, prompt, and expected cost. Phase 1's approval was consumed by its two completed requests; it does not authorize this phase's requests. Never put the key in a command argument. Store private recordings in ignored `.media-lab/` or outside the repository.

First inspect downloaded files locally (no key or API required):

```sh
npm run media:inspect -- .media-lab/steplint.mp4 .media-lab/steplint.wav
```

Copy the reported MP4/WAV SHA-256 hashes into the approved commands. Replace hash placeholders; do not literally use the placeholders. Both smoke scripts reject missing approval before loading credentials or making requests.

```sh
npm run smoke:sam-video -- --approved --mp4 .media-lab/steplint.mp4 --sha256 MP4_HASH --concept "red latch"
npm run smoke:voice -- --approved --wav .media-lab/steplint.wav --sha256 WAV_HASH
```

SAM video performs exactly one `POST /v1/files` (`purpose=user_data`, MP4 MIME), one streaming `POST /v1/responses` on `sam-3.1` with `{type: "input_video", file_id}`, and one cleanup `DELETE /v1/files/{id}` when an ID was returned. Upload is synchronous per the current docs; no polling is invented. The SDK client disables retries. The SDK's public `post` method carries Meta's `input_video` extension because this installed OpenAI SDK's generated Responses input type does not include it. It still uses the SDK SSE transport, with a 120-second stream abort bound.

`parseVideoStream(events).finalResult` consumes the stream once. `frameIndexOf` and `recordsOfKind` preserve source frame indices; frames need not arrive in order. Completion, diagnostics, matching boxes/masks, valid frame range, bounded mask dimensions, and nonempty `decodeMaskToRaster` output are checked. Empty output is a valid no-match API result but does not pass this smoke test's geometry requirement. Detection/segmentation does not verify procedural actions.

For frame prompts, choose `--frame-prompts .media-lab/prompts.json` **instead of** `--concept`. Example shape (coordinates must actually mark your intended object):

```json
{"kind":"frames","prompts":[{"frame":0,"points":[{"x":320,"y":240,"label":"positive"}]}]}
```

Coordinates are source display pixels, frame numbers are zero-based source indices, and dimensions come from the parsed clip. The official `buildObjectPrompt` creates the token grammar for one object. Multiple prompts may target later frames for the same object; `metadata.propagation_direction="forward"` is used. Prompts are validated before upload. Never guess a frame number from the playback time without checking the source frames.

Voice makes one multipart `POST https://api.meta.ai/v1/asr/transcribe` using `muse-voice-transcribe-1.0`, `PUSH_TO_TALK`, and `audioEncoding="WAV"`. Multipart fields are `request` (JSON, application/json, no filename) and `audio` (WAV file). Native fetch is used because this is **not** OpenAI's `/audio/transcriptions` endpoint. WAV bytes are validated before the request. Timeout 120 seconds, redirects rejected, no retries. Response validation requires a session ID, nonempty transcript, audio duration, and valid turns array. Silence/no transcript does not establish successful speech transcription. The CLI prints the transcript locally, not to a web response.

API errors expose status/error category without dumping provider bodies, headers, keys, or raw masks. If deletion fails, the file ID is shown for manual storage cleanup and success is not claimed.

## Cost and hosting constraints

Official pricing checked 2026-10-29: SAM video $0.20/1,000 frames, minimum 50 billable frames per request; Voice $0.18/hour of processed audio. One 600-frame-or-smaller request is expected at most **$0.12** for segmentation; one 20-second WAV about **$0.001**. For the measured 223-frame/15-second synthetic pair, the inference estimate would be $0.0446 + $0.00075 = $0.04535, but the tone WAV is not suitable for proving speech transcription. These are estimates, not measured bills. Files upload/delete have no separate price established by this spike; no free-storage assumption is made.

Meta Files docs allow uploads up to 1 GiB, with a team storage cap and no automatic expiry. Voice docs cap multipart bodies at 32 MB and audio at 10 minutes. This spike uses much smaller limits and deletes the uploaded test MP4 after the SAM request. Vercel currently documents a 4.5 MB function request/response limit and plan-specific timeouts (Hobby 300 s). Consequently, the CLI sends files directly from Node to Meta; no large Next.js serverless proxy or hosting deployment is introduced. A future browser-to-provider upload path still needs secure design; never put `MODEL_API_KEY` in the browser to bypass hosting limits.

## Verification and remaining gates

- `npm test`: **91 tests passed** across 3 files (29 new media tests, 62 existing tests). Includes real local PCM conversion, mocked Meta multipart/stream contracts, out-of-order frame indices, request cleanup after errors, format bounds, cancellation, and invalid media. No live model calls in tests.
- `npm run lint` and `npm run typecheck`: passed.
- Both smoke scripts without `--approved`: exited 1 locally with approval-required messages; no requests.
- `npm run build`: passed with the existing Webpack configuration; added only `/dev/media-lab` to application routes.
- Production HTTP checks: `/dev/media-lab` 404 with the enable flag unset, `/api/health` 200 with its unchanged app-only response, public license notice 200.
- Current credential value absent from source/config/docs/public assets; neither its value nor `MODEL_API_KEY` appears in the 23 browser build files scanned. No credential values were printed.
- `git diff --check`: passed. `.media-lab/` and real `.env` files are ignored. Next.js-generated changes to `AGENTS.md` and `next-env.d.ts` were removed after verification to preserve the owner's instructions and avoid unrelated type-path churn.
- **Live Files upload / SAM video / Voice transcription:** passed on owner-provided recordings after explicit approval, with no retries. See the live verification record below.
- **Real media:** the owner recorded and supplied a real video and WAV; both were parsed and accepted by their live endpoints. The uploaded MP4 contains AAC, but its browser/encoder capability probe was not independently observed here. Real-device permission/indicator controls were not directly observed by the agent. Safari, Firefox, mobile, and universal browser support remain unverified.

Remaining owner manual checks: verify that the camera/mic indicator turns off after stop/discard and test permissions/fallback on the actual target browser. These controls were exercised with synthetic devices locally; successful live model calls do not establish universal browser compatibility. Phase 4 remains unimplemented and requires separate authorization.

## Owner-provided live verification (2026-10-29)

The owner uploaded `.media-lab/steplint.mp4` and `.media-lab/steplint.wav`, then explicitly authorized the live requests. Local inspection verified formats, limits, and SHA-256 before the calls. The owner received a pre-call notice naming both models, the selected prompt, bounded counts, no retries, and an inference estimate below $0.046. Credentials stayed server-side. The full transcript and file hashes are kept only in ignored `.media-lab/live-results.json`; personal media and the full transcript are not added to public documentation.

| Input | Actual format | Duration | Size |
| --- | --- | --- | --- |
| Owner MP4 | H.264 `avc1.64001e`, 640×480, 223 frames at 15 fps; AAC `mp4a.40.2`, mono 48 kHz | 15.0173 s container | 2,103,900 bytes |
| Owner WAV | RIFF/WAVE, mono integer PCM16, 24 kHz | 14.9973 s | 719,916 bytes |

- Local `npm run media:inspect -- .media-lab/steplint.mp4 .media-lab/steplint.wav`: exit 0.
- `npm run smoke:sam-video -- --approved --mp4 .media-lab/steplint.mp4 --sha256 <inspected-hash> --concept 'orange box'`: exit 0. The short noun phrase was chosen from a local preview of the supplied recording, rather than assuming it contained the blue/yellow/red fixture. One Files upload with purpose=user_data, one streaming sam-3.1 call, and one confirmed deletion. Upload latency **4,409 ms**; segmentation plus parsing **10,551 ms**.
- Official parser accepted a completed stream without diagnostics and decoded **214 boxes and 214 nonempty masks**, across **214 unique source frames**. Frames with geometry: 0–60, 62–89, and 98–222. Source frames 61 and 90–97 had no returned geometry; no detection or action success is invented for those nine frames. No per-frame visual accuracy audit was performed.
- `npm run smoke:voice -- --approved --wav .media-lab/steplint.wav --sha256 <inspected-hash>`: exit 0. One request to muse-voice-transcribe-1.0 returned a validated, nonempty transcript; latency **4,200 ms**, provider audio duration **15,040 ms**. Transcript accuracy was not independently scored.
- No retries, additional model requests, or billing lookup. Estimated inference cost was below $0.046; this is not an actual measured bill. Measured latencies include client/network/validation time and do not establish real-time performance.

The tested MP4→Files→SAM video and WAV→Voice request paths are now verified. These results establish supported transport and successful response parsing for this recording, not procedure compilation, action recognition, safety, or correctness of the recorded demonstration.

## Official sources and license

- [Mediabunny formats and capability probes](https://mediabunny.dev/guide/supported-formats-and-codecs)
- [Mediabunny conversion API](https://mediabunny.dev/guide/converting-media-files)
- [Mediabunny installation and TypeScript requirements](https://mediabunny.dev/guide/installation)
- [SAM video, uploaded IDs, frame prompts, tracking direction](https://dev.meta.ai/docs/sam/segmenting)
- [Official SAM parser](https://dev.meta.ai/docs/sam/client-libraries)
- [Meta Files API and limits](https://dev.meta.ai/docs/file-handling)
- [Voice Transcribe multipart/WAV contract](https://dev.meta.ai/docs/speech-to-text)
- [Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits)
- [Vercel function limits](https://vercel.com/docs/functions/limitations)

Mediabunny 1.63.0 requires ES2021+ and TypeScript 5.7+, compatible with this app's TypeScript 5.9 and Node 24 environment. Its source and MPL-2.0 license were inspected; it is used unmodified. Public license/source notices are served under `/licenses/`. No optional AAC/WASM codec package was added to conceal an unavailable browser encoder.
