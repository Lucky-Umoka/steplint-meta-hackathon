# Phase 4 — Teach mode and batch lesson processing

> Historical implementation record. The v0.2 Teach/Practice repair supersedes the UI and runtime path described below. Current Practice uses bounded server-side Spark/SAM grounding and local mask-constrained appearance tracking; the old colour-calibration flow is no longer the normal learner UI. See [current verification](REPAIR_VERIFICATION.md): the new real-recording acceptance has not passed.

Status: **Complete.** Implementation, 128 automated tests, lint, type checking, production build, browser checks and four consecutive post-fix live smoke runs passed. The owner confirmed their manual test works and requested Phase 4 closure. Each generated lesson still requires human review and explicit approval; this phase sign-off does not approve a particular lesson. No live Practice workflow is implemented.

## Automatic-first Teach update

The default is now preview/consent → one upload and Muse Voice transcription → Spark video component discovery → SAM tracking → Spark draft → human review/edit/approval → **Save and open Practice**. No initial manual marking is required. The same uploaded file ID feeds Spark discovery and SAM; the final Spark call uses the bounded transcript/tracking summary. Manual marking remains an optional fallback. The earlier four successful live runs tested the manual-mark path; the later five approved automatic trials and point-grounding refinement are recorded below.

SAM's documented contract needs either one concept prompt or object locations; it does not understand a lesson independently. Spark uses documented Responses `input_file` with `file_id` to propose up to four interior points and source times (the initial implementation used boxes). The server bounds/validates those proposals and maps times to actual source frames. Official `buildObjectPrompt`, SAM streaming and the official parser then track the proposed objects. Automatic compilation makes two Spark requests (1,800 discovery + 6,144 drafting output-token caps) and one SAM request, without retries. The old one-Spark combined cost estimate does not apply. The preview consent states the new request count before spending; the initial implementation used mocks; later approved live trials are recorded below.

Review prefills candidate before/after intervals and small zones from continuously tracked, sufficiently confident movement, while preserving order. Missing/low-confidence/stationary evidence gets no invented zone suggestion. All review flags stay false until explicitly checked. Object overlays show the current step's component. Moment choices are bounded to useful references rather than every frame; optional manual correction uses a time slider. Users can still adjust zone marks and edit draft data before approval. SAM boxes are perception evidence, not proof of an action.

Approved lessons can be saved to a one-use browser session-storage handoff and opened directly in Practice. Practice still verifies the original approval receipt with the server; local storage does not authorize a procedure. Download/export remains available as a fallback, including browsers that reject local storage. Source videos stay local and should be saved separately if needed for reference frames.

New modules: `src/server/teach/discovery.ts` (bounded video request and proposal parsing) and `src/teach/review-suggestions.ts` (pure interval/zone/moment suggestions). The existing compile endpoint supports explicit automatic or manual mode; conflicting mode/mark input is rejected before a provider request. Discovery failures also delete the temporary file, with expiry fallback and no automatic retry.

Verification: **157 tests passed** (11 automatic-first cases plus 146 existing cases), lint, type checking and production build; a headless browser using the actual MP4 for local decoding and **mocked provider/approval responses** verified automatic processing without marking, labelled object boxes, bounded moment choices, unchecked approval gates, and Save/open into Practice. Mocked approval is not a real lesson approval. The later approved live results below establish the automatic API path; this browser check itself used mocks.

## Manual-path foundation and shared data flow

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

The opt-in smoke script now accepts `--automatic` instead of `--selections PATH` for this new path. It still requires fresh file/hash/request-count approval and `--approved`; without approval it exits locally before any network request. Automatic compilation has a bounded server deadline and no retries. At introduction, no automatic live response or accuracy result was claimed; the subsequent live results are recorded below.

### Approval readiness and processing popup follow-up

The owner reported that Approve exposed raw Zod errors for `conditionConfirmed: false` and null start/target regions. The UI had enabled approval before every step was reviewable. It now shows a per-step/readiness checklist and disables approval until zones, human confirmations and actual evidence all pass. Raw schema errors are replaced with plain-language guidance. Readiness and server approval call the same extracted evidence validator; human approval flags are still required only by the approval function and cannot be bypassed by drawing boxes or checking an unsupported interval.

Automatic zone suggestions now consider clear movements of at least 5% normalized centre displacement instead of the former 10% cutoff, while preserving confidence, continuous tracking and ordering checks. A recheck button uses existing tracking without a new paid request. Gaps, ambiguity and stationary evidence still cannot be approved. If no supported interval exists, the user must choose supported moments/zones, revise unsupported rules or record a clearer demonstration; an arbitrary draft is not forced into Practice.

A native modal presents a connected stage chain for upload/transcription, component discovery, SAM tracking, drafting/validation and readiness for review. Stages follow actual processing messages, not fabricated percentages. The modal supports continuing in the background, reopening, explicit cancellation/discard, completion and failure. Future stages stay waiting after a failure. Manual selection mode skips discovery. Original SVG/ICO app icons resolve the favicon 404.

Verification: **167 tests passed** across six files, lint and type checking passed, and the production build passed. Headless production-browser checks used mocked access/provider/approval responses and actual local MP4 decoding: supported review approved and opened Practice; the reported missing-zone case stayed disabled with readable guidance and zero approval requests; a simulated SAM failure stopped the active stage without completing later stages or retrying. The chain popup was visually inspected. `/teach`, `/favicon.ico` and `/icon.svg` returned 200. No paid model calls or actual lesson approval were made for this fix. The old development process showed failed HMR/browser interaction; it was restarted, and the fresh production build remains available on port 3000.

The development-browser failure was traced to Next.js blocking the HMR handshake from the local `127.0.0.1` hostname. `next.config.ts` now sets documented hostname-only `allowedDevOrigins` entries through `src/config/dev-origins.ts`: local loopback, exact current-workspace Codespaces hosts for 3000/3001 (and configured PORT), and an optional exact TEACH_PUBLIC_ORIGIN hostname. It does not allow arbitrary Codespaces hosts or wildcard domains, and does not change Teach API authentication/origin enforcement. Four configuration regression tests cover this. After restart, the development browser also passed the supported approval-to-Practice walkthrough with mocked responses. Normal HMR/Fast Refresh logs are development messages; an access-endpoint 401 is an unlock failure, separate from the null-zone approval error. Local configured-credential checks returned 200 on both app ports without any model call.

### Simpler interface and five approved live trials

All file choices now have visible buttons: Teach MP4, approved Practice lesson, Practice reference MP4 and media-lab MP4. Shared `src/components/file-picker.tsx` hides the native control and keeps a labelled button/selected filename. `src/components/feedback.tsx` provides brief centred success messages and acknowledged failure dialogs. Important processing outcomes, approval/import, reference loading, calibration, Practice start/completion, rule violations and reset/retry give feedback. Routine frame updates do not produce popup spam. Practice step states use readable labels; IDs remain internal. Component marking advances to the next unmarked part. Longer explanations, codec data and rule details are under Help/details; required consent, readiness, recording state and corrective instructions remain visible.

A real trial exposed imprecise automatic boxes and poor SAM confidence. Automatic discovery now requests a positive interior point per component using Spark's structured output. The existing official SAM point-prompt utility seeds tracking from those points. This changes grounding only: confidence/order/continuous-evidence and human approval checks are unchanged. Manual points/boxes remain available.

The owner authorized at most five additional end-to-end live trials, including failed runs. Each made one Files upload, one Voice ENDPOINTING request, one Spark video-discovery request, one SAM request, one Spark draft request and cleanup deletion, with no automatic retry. All five were used; this approval is exhausted. Cost notice before calls used current published prices and a conservative expected <$0.50/trial estimate, not a billing guarantee. No actual bill is claimed.

| Trial | Input / grounding | Parsed end-to-end result | Review evidence | Wall time |
| --- | --- | --- | --- | --- |
| 1 | Owner's 15-second recording, boxes | Passed; deletion confirmed | Two candidate steps held: insufficient confident motion | 68.2s |
| 2 | Synthetic 18-second colour fixture, boxes | Passed; deletion confirmed | Blue/yellow held for uncertain tracking | 65.6s |
| 3 | Same synthetic fixture, interior points | Passed; deletion confirmed | Three steps had supported zone suggestions; evidence eligibility passed | 67.8s |
| 4 | Actual browser upload/preview/consent on synthetic fixture, points | Passed; deletion confirmed | Three supported candidates; approval correctly remained disabled awaiting human checks | 61.7s |
| 5 | Owner's original recording, points | Passed; deletion confirmed | One supported visible box-movement candidate; evidence eligibility passed | 73.2s |

The synthetic fixture is explicitly labelled on screen, uses original generated coloured rectangles and local eSpeak narration, and is not a physical-camera recording. ffmpeg/eSpeak were used only as development tools to make owned test media; neither is an application dependency. Their installed tool licensing was inspected. These are **real Meta requests on synthetic media**, not mocked model responses. Owner media and all detailed results remain ignored in `.media-lab/`; no personal transcript is copied into public docs. The CLI's `trackingMs` for automatic runs includes Spark discovery plus SAM, not SAM-only compute.

No real generated lesson was approved by the agent. Evidence-eligibility checks discard their validation result and do not create approval. The actual live browser stopped at review. Approval → Save/open Practice was separately verified with explicitly mocked approval responses; a generated canvas stream tested local Practice violations, recovery, completion, uncertainty, reset and track cleanup. A real physical-camera demonstration remains owner-run. The owner's recording supports only the returned visible movement, not a claim of complete unboxing understanding or arbitrary action detection.

Final local evidence: 176 tests pass across six files; lint/type checking and production build pass. Browser checks cover every upload control as a visible button, centred success/failure feedback, missing-zone blocking without raw schema JSON, chain-loader success/failure, and correct approval-to-Practice handoff using mock review data. No further live calls are authorized under these five trials.

Simple review fields now let users correct component names, step instructions and recovery messages without JSON. Edits reset human confirmations and approval. The overlay label follows the edited component name; object identity and tracked geometry are preserved. The advanced rule editor remains available for structural changes. Browser verification covers editing a label, invalidating approval, reviewing again, then saving/opening Practice using mocked approval data.

### Sign-in error correction

An overlong wrong access code reproduced the owner's misleading “Lesson processing or validation failed” login message. The access route had used throwing schema validation plus the shared lesson error formatter. Access now validates its own input and returns a uniform, explicit 401 (“Incorrect Teach access code. Check it and try again.”) for wrong/empty/overlong/malformed token values. Malformed JSON and oversized bodies get access-specific 400/413 messages. Server configuration errors remain distinct, and unexpected sign-in failures no longer become lesson errors. No token value is echoed, no cookie is issued on rejection, and no provider client is constructed.

Nine regression cases bring the suite to 176 tests. A real local development-browser request with an overlong wrong code displayed the centred access error and made zero lesson requests. This check was non-paid; the five-trial model-call budget remains exhausted.


### Approval response handling and timestamp alignment audit

Approval, access, upload and Practice import now read responses through `src/teach/api-response.ts`. Empty success bodies, interrupted connections, HTML gateway errors and malformed JSON produce actionable messages, preserve the draft and do not count as success. `src/teach/approved-artifact.ts` validates the complete approval payload before offering Save/open Practice. The original validated object is retained so receipt verification uses the original JSON ordering. The streaming compiler also detects malformed/truncated messages. Automated tests cover these failure boundaries; browser fault injection checked empty, incomplete and gateway approval responses followed by a successful explicit retry without rerunning AI.

The actual approval and Practice import endpoints returned HTTP 200 with verified receipts on both local app ports using explicitly synthetic contract fixtures. This does not represent owner approval of a real lesson. Separate generated-camera browser checks passed premature latch violation, recovery, correct-order completion, obstruction/reacquisition blocking, reset and stream shutdown.

Development and production verification now use separate Next build directories. Rebuilding the directory of a running server was found to cause manifest-read failures; verification builds use `.next-verify`, development uses `.next`, and the normal production build uses `.next-production`. Stop a server before rebuilding its own directory.

Voice turn start/end times are included in bounded Spark discovery input. Proposal timestamps map to the nearest actual decoded video frame; SAM uses that frame index, and tracking evidence retains actual frame timestamps. Timing is a search hint, not proof of movement. An additional approved five-trial batch exposed a red-object point outside its visible shape. Automatic discovery now requests tight normalized 0–1000 object boxes and centrally converts each box center to a positive source-pixel point for the official SAM point utility. Tests cover scaling, bounds and zero-area rejection. Uncertain tracking still blocks approval; it is not filled in from speech.

Latest automated checks: 186 tests across seven files, lint, type checking and isolated production build passed. Credential scan found no configured model key in source/test/script/public files or generated browser assets. Additional live-batch results are recorded below separately from mocked and synthetic contract checks.


### Additional five-trial audit: real models through approval and Practice

The owner then authorized a fresh maximum of five end-to-end trials. Failed attempts count; this new budget is now exhausted. Each attempt was explicitly invoked, with no automatic retry. Notices named Voice transcription, Spark discovery, SAM video tracking and Spark drafting, one reused upload, bounded output tokens, and an expected <$0.50 inference/trial estimate (not a billing guarantee). These tests use an owned synthetic 18-second H.264/AAC MP4; browser audio extraction produces mono PCM16 24 kHz WAV. The corrected fixture aligns narration with visible blue/yellow/red movements. No real owner lesson was approved by the test actor.

| Trial | Actual result |
| --- | --- |
| 1 | Full-test assertion failed: only two draft steps. Earlier harness did not retain full diagnostics; not claimed as end-to-end success. |
| 2 | Test capture failed because the browser debugging protocol could not retrieve the response body. Neither full completion nor upload deletion was independently confirmed; requested one-hour provider expiry remains the fallback. Capture now clones the fetch response without consuming the app response. |
| 3 | Parsed draft had two steps. Red discovery point was outside the object; SAM did not support its motion. Draft correctly omitted the unsupported action. Upload deletion confirmed. |
| 4 | Normalized freehand points still missed interiors. Only one supported draft step; full test failed and approval stayed blocked. Upload deletion confirmed. |
| 5 | Box-center positive points produced three supported ordered steps. Real approval HTTP 200, signed receipt verified, direct Practice import, premature red-step violation, recovery, all three steps passed in order, obstruction invalidated success, reacquisition did not auto-pass, all camera tracks stopped. Upload deletion confirmed. |

Trial 5 used an explicitly labelled **AUTOMATED SYNTHETIC TEST — not owner approval** reviewer for synthetic media only. No model/approval response was mocked in that end-to-end run. The Practice camera was a generated canvas stream: this is not physical-camera acceptance. Exactly one application upload, compile, approval and Practice import request occurred; no automatic paid retry occurred. Total browser workflow time, including interaction/calibration/Practice assertions, was **93.9 seconds**, not isolated model latency. The warning measured **766 ms detected state change to displayed warning**, one synthetic sample, not a general performance guarantee.

Independent synthetic ground truth checked each proposal inside the correct visible object and compared SAM centers to known motion. Each component had 270/270 confidence-qualified samples and no missing frames. SAM center error at the 95th percentile was blue **2.69 px**, yellow **3.20 px**, red **1.80 px** at 640×480. Local Practice marker center error at the 95th percentile was **0 px** at its 160×120 test resolution. These are controlled synthetic-scene measurements, not arbitrary real-world accuracy claims. Source timestamps and frame indices remained attached to the evidence.

Final response-fault browser checks on the latest production build passed for empty approval bodies, HTTP 502 gateway responses and incomplete JSON artifacts: the draft remained available, a clear centered failure appeared, and explicit approval retry succeeded without another model request (mocked provider/approval fault checks). The separately invoked real non-paid approval/receipt contract passed on both local app ports. Final suite: **186 tests, lint, type checking and production build passed**. The latest verified build is serving port 3000; no further live model calls are authorized under this batch. Real workbench camera acceptance remains manual.
