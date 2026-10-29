# Phase 4 — Teach mode and batch lesson processing

Status: **Complete.** Implementation, 128 automated tests, lint, type checking, production build, browser checks and four consecutive post-fix live smoke runs passed. The owner confirmed their manual test works and requested Phase 4 closure. Each generated lesson still requires human review and explicit approval; this phase sign-off does not approve a particular lesson. No live Practice workflow is implemented.

## Files and data flow

`/teach` is the teaching workspace. The home page links to it. A user unlocks the private workspace, records 10–20 seconds with camera/microphone or selects a supported MP4, previews it, and explicitly confirms processing. The recorder displays REC, Start/Done, elapsed time, preview, and discard; Done is available after 10 seconds and recording automatically stops at 20 seconds. Camera/microphone tracks are stopped on Done, discard, error, or unmount. Codec failures are reported; an existing MP4 with speech is the fallback.

The workflow has two paid stages so component selection can follow transcription without a duplicate video upload:

1. Browser prepares H.264 MP4 and mono PCM16 WAV at 24 kHz using the Phase 3 Mediabunny path. Conversion happens locally and has no credentials. The user previews and confirms before upload.
2. `POST /api/teach/lesson` validates all bytes and confirmation, uploads the MP4 **once** to Meta Files with `purpose=user_data` and an explicit one-hour expiration, then sends the WAV to Muse Voice Transcribe in `ENDPOINTING` mode. It returns validated speech-turn timestamps plus an encrypted, session-bound lesson reference. The same file ID is retained inside that reference for the next stage.
3. The browser displays the transcript and turn timestamps. The user chooses an exact source frame, then marks a point or box and description for one to four components. Representative frames come from Mediabunny's decoder and actual packet timestamps, not a guessed `time * fps` index. Stale frame previews are hidden while a newly selected frame loads.
4. After a second explicit processing confirmation, `POST /api/teach/compile` uses the existing file ID and official `buildObjectPrompt` for all selected objects in **one** SAM 3.1 video request. It consumes the documented Responses stream with `parseVideoStream`, `recordsOfKind`, `frameIndexOf`, and `decodeMaskToRaster`. It streams progress to the browser; raw masks are not sent to the client or kept after summarization.
5. Structured tracking includes per-component frame IDs, source timestamps, normalized boxes, optional model confidence, mask pixel count, and missing-frame counts. Missing geometry is not filled in. A bounded representative summary and the timestamped transcript go to one `muse-spark-1.3` request for strict JSON-schema output, with a maximum of 6,144 output tokens. No Muse Spark audio-understanding path is used.
6. The server runtime-validates structure, references, component identities, evidence frames, and `approval: null`. It deletes the temporary upload before reporting successful compilation. A malformed/incomplete response is rejected rather than repaired with fabricated steps or silently retried.
7. The browser displays editable steps, explanations, candidate error cases, uncertainties, teaching timestamps, supporting source-frame thumbnails, and review controls. Every visual rule must be manually mapped to separate starting/target zones on source frames.
8. `POST /api/teach/approve` repeats validation against the encrypted evidence context and explicit per-step review. It adds human approval metadata and an integrity receipt only when the reviewed zone transitions are supported. The user can download the approved procedure, reviewed zones/frames, notes, source metadata/transcript, and receipt. Editing invalidates the approval displayed in the browser. There is no automatic approval and no Practice mode.

Important files:

| Path | Responsibility |
| --- | --- |
| `src/app/teach/capture.tsx` | Camera/mic lifecycle, Start/Done, local preparation and upload fallback. |
| `src/app/teach/teach.tsx` | Preview/confirmation, upload, transcript, streaming progress and stage transitions. |
| `src/app/teach/frame-mark.tsx`, `component-picker.tsx` | Source-pixel point/box selection for up to four objects. |
| `src/app/teach/review.tsx` | Source-frame evidence, editing, zone drawing, explicit review and approved export. |
| `src/teach/media.ts` | Strict lesson media limits and packet/frame timelines; local frame extraction. |
| `src/teach/schema.ts` | Shared Zod boundaries, evidence validation and pure approval rules. |
| `src/server/teach/pipeline.ts` | One-time upload, timestamped ASR, SAM streaming/decode and Spark drafting. |
| `src/server/teach/security.ts` | Private workspace access, encrypted references, expiry/session binding and safe errors. |
| `src/server/teach/http.ts` | Bounded HTTP bodies and orchestration behind small Route Handlers. |
| `src/app/api/teach/*/route.ts` | Node Route Handlers for access, lesson, compile, approval and discard. |
| `scripts/smoke-teach.ts` | Opt-in live end-to-end run on an actual approved recording; stops at an unapproved draft. |
| `tests/teach.test.ts` | Deterministic tests and mocked provider contracts; no live requests. |

## Schema, evidence and approval

The existing `ProcedureSpec` is preserved: ordered steps, prerequisites, forbidden transitions, source references, recovery, and `enters_zone` conditions. Existing evaluator behavior is unchanged. This initial language still has one step per component; it cannot represent arbitrary repeated actions or general mechanical assembly. Generated drafts stay unapproved and carry one explanation/error/uncertainty note per step. Every note has real tracked supporting frame IDs.

Zod checks runtime data, beyond TypeScript's compile-time checks. The Spark wire schema additionally forces `approval` to null, at most four steps/components, and at most eight zones. Runtime checks reject invented source IDs/times, components that were not selected, unknown tracked frames, malformed rules, or incomplete output. Lesson/narration text is treated as untrusted evidence; it cannot authorize tools or approve itself.

Before approval, every step requires:

- Named reviewer and explicit whole-procedure confirmation.
- Explicit review of the step, order/prerequisites, candidate errors, source and recovery.
- Explicit visual-condition confirmation and drawn, non-overlapping start/target regions.
- Distinct, correctly ordered before/after source frames with decoded geometry and confidence meeting the rule. No missing or low/unknown-confidence frames may be bridged inside the reviewed interval.
- A component center in the starting region before the transition, outside the target at that time, then inside the target afterward. Later steps' reviewed intervals must follow earlier verified intervals.

These checks establish a human-reviewed observable zone-entry mapping, **not** that an object was safely installed, a box was opened, or narration was true. A model-proposed action that cannot be expressed and grounded this way must be corrected or removed; the user must not approve it as an unsupported general action. Drafts expose incomplete coverage rather than promise arbitrary-task accuracy. Tracking summaries are not procedural pass/fail results.

An approval receipt binds the exported artifact contents to the server's private workspace configuration. There is no Practice import route yet; Phase 5 must validate the receipt and region bindings before accepting external executable artifacts. The current pure evaluator's approval-metadata check alone is not authentication for arbitrary imported JSON.

## Size, privacy, expiration and spending

- Complete multipart request: **4,000,000 bytes maximum**, including overhead, below Vercel's documented 4.5 MB function-body limit.
- MP4: at most **2,800,000 bytes**, H.264, 10–20.5 seconds, at most 600 frames and 1280×720 pixels. Camera output targets 640×480 at 15 fps. WAV: at most **1,100,000 bytes**, mono signed PCM16 little-endian, 16/24 kHz; browser extraction uses 24 kHz. Audio/video durations must agree within 0.5 seconds. An upload-existing MP4 must have decodable speech audio; audio is not invented for video-only files.
- JSON requests: at most 1.5 MB, with smaller access requests. Bodies are counted while reading even if Content-Length is missing or false. MIME/extension is not trusted. Provider calls occur only after media, input and ownership validation.
- All paid endpoints require private owner access. `TEACH_ACCESS_TOKEN` is separate from `MODEL_API_KEY` and must be at least 32 characters; use a high-entropy generated value. Browser login receives an HttpOnly, SameSite=Strict cookie, Secure on HTTPS. Cross-origin requests are rejected. This is a shared private owner workspace, not a multi-user account/role system or a distributed spending quota.
- Encrypted references use authenticated AES-256-GCM, distinct stage purposes, session binding and a **30-minute** lifetime. The raw file ID is not trusted from the browser. There is no process-memory session database or local filesystem media dependency, so later requests can reach a different serverless instance.
- Current official Files docs support `expires_after: {anchor: "created_at", seconds: 3600}`. The minimum is one hour. Upload metadata must confirm expiration. Successful compilation/discard and processing failures trigger immediate deletion; abandonment or a lost response relies on the requested provider expiration. This corrects the earlier Phase 3 assumption: files do not expire **by default**, but explicit expiry is now documented. Do not invent shorter provider lifetimes.
- Source MP4/WAV stay browser-local until explicit confirmation. The server holds bytes only during requests; provider masks are reduced to structured summaries, not archived. Source video can optionally be saved to the user's device for later evidence. Local preview URLs are revoked on discard/unmount. Refresh loses the in-browser draft; approved artifacts are explicitly downloaded rather than silently stored.
- No automatic retries. Normal staged processing uploads once and reuses its ID. A lost upload response is not proof of failure; a manually started new lesson may create another temporary upload, subject to expiry. This implementation does not claim distributed exactly-once request execution.
- Upload/transcription request uses a bounded cancellation signal; compilation has a 240-second overall bound, with `maxDuration=300` for Node handlers. Cleanup runs without the cancelled model signal. Deployment limits and browser codec support still need testing on the actual target environment; no deployment was performed.
- The application shows model names, request counts and estimates before each paid-stage confirmation. Rate limits produce an explicit error; malformed transcripts or drafts do not become successes. API error responses never dump credentials, provider bodies or raw personal media.

## Local setup and manual walkthrough

An ignored `.env.local` now contains a newly generated private `TEACH_ACCESS_TOKEN` if none was configured already. Its value was not printed or committed. Read it privately in the workspace and enter it in `/teach`; never paste `MODEL_API_KEY` into that form. On Vercel, configure both variables in server environment settings. `.env.example` lists names only. No new runtime package or infrastructure was added.

```sh
npm ci
npm run dev
```

Open http://localhost:3000/teach. Unlock with the workspace access code. Record or upload a 10–20-second MP4 with narration; confirm the video plays and the camera/mic indicator stops on Done. Discard before confirming to verify no upload occurs. After upload, check actual speech-turn timestamps, mark components on a suitable source frame, then confirm tracking/drafting. Inspect supporting frames, correct candidate rules, and draw before/after regions. An ambiguous or unsupported step should remain unapproved. Review all fields and approve only your supported correction. Download the artifact if valid; edit it and verify the UI removes approval.

Also test denied camera/mic permissions, an incompatible file, a clip over the size limit, an expired lesson reference, a missing track, invalid JSON, insufficient visual evidence and a cancelled operation. Do not repeatedly retry model errors without reviewing the cost and request count.

## Verification record (2026-10-29)

- **126 tests passed** across 4 files: 35 new Teach cases plus 91 existing tests. Ordinary tests use no live provider requests.
- `npm run lint`: passed. `npm run typecheck`: passed. `npm run build`: passed using existing Webpack configuration. All three checks were repeated successfully after the final source review.
- Mocked pipeline tests verify one upload with explicit expiry, one timestamped ASR invocation, reuse of the same video ID for SAM, one schema-constrained Spark call, and deletion on successful compilation or transcript/Spark failure.
- Approval tests cover explicit consent, per-step review, unchanged presence, missing frames, unknown/low confidence, overlapping regions, unsupported temporal order, malformed rules, invented sources/frames and tampered/expired references.
- Headless Chromium browser walkthrough used the actual local MP4 for browser decoding, but **mocked all paid provider responses**. Verified consent before capture, preview before any upload, one confirmation/upload, transcript display, component marking, unapproved draft display, failed unchecked approval, drawn-zone review, approved mock export, and invalidation after editing. That mock export is not a real approved lesson and is not published.
- Fake-device capture check verified REC, manual Done after 10 seconds, local preview without upload, all tracks ended, and discard returning to capture. No real-device permission controls were directly observed by the agent.
- Browser walkthrough found a real localhost/127.0.0.1 origin mismatch caused by Next.js request-URL normalization; the check now uses the browser-facing Host authority, retains cross-origin rejection, and has a regression test.
- A noncanonical base64 token test found that Node can ignore a trailing character. References now require canonical encoding before authenticated decryption. A mock SDK response was corrected to contain the documented `object: "response"`, rather than weakening output validation.
- Production checks: `/teach` 200, anonymous `/api/teach/lesson` POST 401, unchanged `/api/health` 200. No model calls were made by these checks.
- Browser build scan: no configured model key, workspace access value, or `MODEL_API_KEY` string found in 29 static build files. Final source/asset scan found neither configured secret value; the final 29-file browser scan also passed. `git diff --check` passed. Generated changes to AGENTS.md and next-env.d.ts were removed; real recordings, selections and .env.local remain ignored.
- `npm run smoke:teach` without `--approved`: exit 1 locally, approval required, no requests.
- **Live actual-recording batch smoke:** the owner approved one initial run, then up to five additional runs without automatic retries. The initial run failed after SAM tracking with a generic validation/processing error; deletion was not confirmed in its diagnostic output (explicit one-hour upload expiration was configured). Additional run 1 identified a forbidden-transition rule referencing a non-earlier step; the draft was rejected and upload deletion confirmed. Drafting instructions now explicitly explain earlier-step ownership and first-step empty rules; a regression assertion verifies that a self-referencing rule remains rejected. The remaining four additional runs all passed after that fix; latency is recorded below. All five additional authorized runs have been consumed; no automatic retries were used.
- **Per-lesson human approval:** remains a required product action for each generated draft. The agent does not approve lessons on the owner's behalf; this is separate from Phase 4 acceptance.

## Live smoke command

The opt-in script targets the local production or dev server and uses the same HTTP handlers as the UI. It validates actual bytes, file hashes, component marks, streamed results and the final unapproved draft. It writes detailed personal results only to ignored `.media-lab/teach-live-result.json`. It never fabricates human approval.

After exact file/prompt/model/count/cost approval, start `npm start` after building (or `npm run dev`) and run:

```sh
npm run smoke:teach -- --approved \
  --mp4 .media-lab/steplint.mp4 --wav .media-lab/steplint.wav \
  --mp4-sha256 APPROVED_MP4_HASH --wav-sha256 APPROVED_WAV_HASH \
  --selections .media-lab/teach-selections.json
```

The prepared private selections identify the orange box with a point and screwdriver case with a box on actual source frame 0, checked in a local preview. They are not a claim that either component's procedure is correct. A normal smoke run makes one Files upload, one Voice ENDPOINTING call, one SAM video call for both marks, one Spark draft call (max 6,144 output tokens) and one cleanup deletion, with no retries. The 223-frame/15-second recording has SAM inference around $0.0446 and Voice around $0.00075; Spark adds bounded text input/output. The approval request gives a conservative combined inference estimate below $0.20. No actual bill is claimed.

## Official references

- [Meta Files and explicit expiration](https://dev.meta.ai/docs/file-handling)
- [Muse Voice Transcribe modes and multipart WAV contract](https://dev.meta.ai/docs/speech-to-text)
- [SAM video prompts and tracking direction](https://dev.meta.ai/docs/sam/segmenting)
- [Official SAM parser and mask decoding](https://dev.meta.ai/docs/sam/client-libraries)
- [Structured output and strict JSON schema](https://dev.meta.ai/docs/structured-output)
- [Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits)
- [Vercel function constraints](https://vercel.com/docs/functions/limitations)

Current installed Next.js Route Handler/client-boundary docs and the published TypeScript definitions were inspected. Mediabunny remains the unmodified Phase 3 dependency, with its existing source/license notice retained. No mocked output is attributed to Meta.

Codespaces access fix: same-origin checking accepts the exact server-derived forwarded Codespaces URL, with regression tests rejecting other origins and forged forwarding headers. Optional `TEACH_PUBLIC_ORIGIN` specifies one exact deployment origin. HTTPS access sets a Secure cookie. A browser check confirmed the visible **Choose MP4 file** button opens the file chooser.

### Additional live run 2 (overall run 3)

Passed all live stages and runtime parsing: upload, timestamped Muse Voice, SAM video, schema-valid Spark draft, and confirmed deletion. Total approximately 45.8 seconds: upload/transcription 11.522s, tracking 22.482s, drafting/cleanup 11.830s (application-observed wall times, not provider-only compute). Two selected components yielded 214/223 and 223/223 tracked frames; nine gaps remain missing evidence. One candidate zone-entry step remained unapproved. Notes explicitly identify incomplete task coverage and uncertainty about interpreting movement. This is a batch-processing result, not a claim that an unboxing action was verified. Private result and safe stage logs remain ignored under `.media-lab/`.

### Completed five-run repeatability check

| Additional authorized run | Outcome | Upload + transcription | Tracking | Draft + cleanup | Total |
| --- | --- | --- | --- | --- | --- |
| 1 | Rejected invalid forbidden-transition reference; deletion confirmed | Not instrumented | Not instrumented | Not instrumented | Not instrumented |
| 2 | Passed | 11.5s | 22.5s | 11.8s | 45.8s |
| 3 | Passed | 8.5s | 21.7s | 13.8s | 44.0s |
| 4 | Passed | 10.2s | 22.5s | 14.1s | 46.8s |
| 5 | Passed | 7.2s | 20.6s | 12.5s | 40.2s |

Four consecutive post-fix successes averaged 44.2 seconds for the 15-second source clip. Each produced one schema-valid unapproved draft step and confirmed upload deletion. All used the same approved source files and component selections, one request per model per run, with no automatic retries. Results do not establish arbitrary-task accuracy, future reliability, or real-time performance. The earlier separately approved initial failure is additional to these five runs. No further live requests are authorized by this five-run budget.

Final checks: 126 Vitest tests passed, lint/type checking and production build passed; the visible file chooser and mocked browser flow passed. Public-origin login returned 200 with a Secure cookie; anonymous paid upload returned 401, Teach/health returned 200. Configured secret values were absent from 74 source/test/browser files, private inputs/results remain ignored, and whitespace diff checks passed. Per-lesson human approval remains required before execution; it is separate from phase acceptance.

### Follow-up: forwarded-browser origin rejection

The owner still observed the origin rejection after the exact Codespaces-origin fix. Their exact failing browser URL was requested; the deployed-url cause was not independently observed. A local regression reproduces the remaining failure pattern: a browser on a preview proxy sends a legitimate same-origin fetch, but the proxy rewrites Host/internal port. Teach now accepts valid HTTP(S) origins with browser-controlled `Sec-Fetch-Site: same-origin`; cross-site/same-site metadata is rejected and clients without metadata retain the configured exact-origin checks. No arbitrary forwarded-header trust or credential bypass was added.

Verified 128 tests, lint, type checking and production build passed. A real headless Chromium browser successfully unlocked Teach through a local proxy on port 3002 forwarding to 3000 with rewritten Host; a cross-site request still returned 403. Restarted the production server with the new build. No live Meta calls were made for this fix. The owner subsequently confirmed their manual test works, closing this manual check.

### Phase 4 closure

Owner-reported manual test: “I have already done the test and it works.” Phase 4 is marked complete on that confirmation, together with the recorded technical checks. This records the owner's report without inventing additional observed test details or a signed lesson approval. No additional live API calls or Phase 5 implementation were performed for closure.
