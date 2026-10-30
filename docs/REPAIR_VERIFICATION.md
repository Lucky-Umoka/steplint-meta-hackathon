# v0.2 Teach–Practice repair verification

Status: implementation and verification in progress, not accepted as complete. Owner authorized five new sequential live workflow trials on 2026-10-30. This record supersedes old acceptance assumptions for the changed workflow without rewriting historical live records.

## Implemented so far

Camera-first learner interface and local guide library; creator visual step/goal review and optional private rehearsal; explicit setup/Ready/automatic start lifecycle; repeated-object V2 guide/evaluator; final-goal state checks; independent signed artifact verification; bounded Spark/SAM perception; appearance feature tracking instead of colour sampling; reference frames/crops stored with guides; revision creation and method pinning. Legacy deterministic/provider tests remain.

## Local checks

- 238 unit tests passed across 15 files at the latest checkpoint, including schema/evaluator, source compilation, malformed data, JPEG validation, approval receipts, session caps and safe structured-response diagnostics. No unit test makes a live model call.
- Nine mocked-provider Chromium browser tests passed: clean empty library, automatic grounding/Ready and completion on a textured neutral fixture, camera denial, face/empty-area setup without scoring, clip preview, empty/gateway/incomplete approval recovery without rerunning analysis, and refusing Ready/scoring without work-surface alignment.
- Lint, strict TypeScript and production build passed at their recorded checkpoints. Changes after a checkpoint require relevant rechecks.
- Latest screenshots were inspected at a 1280×832 laptop viewport. The first screenshot pass found Ready below the fold; instructions/actions were moved above the video and a viewport assertion added. Screenshots alone do not prove physical tracking or accessibility compliance.

## New live allowance

At most five full workflow attempts. Failed attempts count. Current bound: eight Teach model requests maximum (Voice, discovery, up to four SAM image box refinements, SAM video, Spark draft), then up to six model requests per creator/learner camera session (two sessions maximum), at most 20 total. No automatic API retries or unattended five-run batch. Model/cost notices precede calls. No Contributor mode or additional model/GPU deployment is included. Requests stop on failure; not every failed trial reaches every planned stage.

| Trial | Input / actual outcome | Approval / Practice | Cleanup |
| --- | --- | --- | --- |
| 1 | Owned phone-unboxing MP4. Transcription/upload advanced; discovery did not produce a completed usable result. The exact upstream completion reason was not retained. | Not attempted; no guide approved or success claimed. | Upload deletion confirmed. |
| 2 | Source discovery and video segmentation advanced; draft compilation rejected missing reliable phone geometry. | Not attempted; source evidence failed validation. | Upload deletion confirmed. |
| 3 | Added source-image concept checks; SAM could not reliably locate the white tray. | Not attempted; no uncertain identity approved. | Upload deletion confirmed. |
| 4 | Box refinement located the package at 0.984, but tray confidence was 0.820 (required 0.90). Stopped at source grounding. | Not attempted; no guide approved. | Upload deletion confirmed. |
| 5 | Four native frame candidates and proposed foreground points; package confidence was 0.793 (required 0.90). Stopped at source grounding. | Not attempted; no guide approved. | Upload deletion confirmed. |

A CLI module-import problem was caught before a paid request or trial start; the new preflight checks input hash, size, environment and app health. The private ledger begins when an actual bounded workflow attempt starts. No automatic retry of trial 1 occurred. Before trial 2, safe status/reason/output-token diagnostics and documented Responses output extraction were added, with a 3,000-token discovery output bound.

Future successful automated actor approvals must be labelled test-only, never owner approval. Recorded video replay (including pauses) must be distinguished from physical-camera capture. The owner’s MacBook Chrome physical workbench demonstration, independent learner footage, generalization across backgrounds/objects and domain-specific accuracy remain acceptance gates, not inferred from unit tests or replay.

Before trial 4: official box prompts replaced concept-only source image prompts, preserving the confidence, nonempty-mask and ambiguity gates. Native source frames are used for proposals. Actual provider box/mask scores and safe diagnostics are now retained privately to diagnose failures. These changes do not prove that the owner clip is trackable.

## Acceptance outcome after five trials

**Not accepted. All five failed before creator rehearsal or learner Practice. No sixth call is authorized or made.** The owned clip did not produce a sufficiently grounded executable guide under the current conservative contract. Trial 2 reached video segmentation/drafting, but reliable phone geometry was missing. Later trials isolated source grounding as a blocker; adding prompts/frames did not prove reliable tracking. These results do not establish accuracy of the camera model, local tracker or full workflow. No automated actor approved an invalid real guide.

End-to-end browser wall-clock time to each failure (includes preview/preparation, upload, processing and failure capture; not individual model latency): trial 1 39.2s, trial 2 91.2s, trial 3 33.7s, trial 4 52.2s, trial 5 35.4s. No live Practice warning latency was measured. No sub-second claim or actual billing total is available.

After the last paid trial, local review found another correctness gap: features could be selected from background/contents inside a bounding box. Practice now consumes provider-neutral packed foreground pixels derived server-side from the official SAM raster decoder. Feature patches must lie within the actual foreground, including holes/crop bounds; missing or duplicate foreground identities fail validation. Runtime image grounding uses documented box prompts rather than a potentially hollow geometric center. These changes have deterministic/mocked tests only, **no post-change live acceptance**.

Also added native keyboard-contained Teach progress/error/success dialogs, explicit wording for each executable movement check, optional box/point correction controls, source-reference validation before paid uploads, and strict saved-record/rehearsal validation. The UI never converts a weaker grounding score into success. Broad colour/background/viewpoint generalization and physical MacBook Chrome acceptance remain unverified.

Next acceptance work requires an explicitly bounded new allowance and a grounding investigation on independently annotated source frames before another full trial. Consider verifying corrected full extents/foreground prompts on clear exposed surfaces, or recording an unobstructed demonstration with clear before/action/after holds. Neither is a guarantee. A human may use optional source corrections, but that is not evidence that fully automatic creation passed. No Firebase/hosting/long-duration work should distract from this unresolved core gate.

Camera alignment now also gates observations: unavailable background tracking or unusable frame quality produces ambiguous evidence, not scoring. Background features are selected outside object extents before ranking, so strong object texture cannot displace all work-surface features. Unchanged failed alignment does not trigger a loop of remote checks. This deliberately abstains on a featureless work surface rather than treating camera translation as object movement. This behavior requires a practical physical-device usability check.

## How the files work together

`src/guide/schema.ts` is the validated form for a guide: objects, ordered actions, source speech/frame times, goal and approval. TypeScript helps while coding; Zod also checks incoming data while the app runs. `src/guide/compile.ts` checks generated proposals against actual source geometry rather than trusting a model's assertion.

`src/server/guide/` handles credentials, upload/transcription, source discovery/segmentation/drafting, signed approval and bounded camera observations. The small `/api/teach/guide/*` routes delegate to these modules. Model calls are isolated on the server. Voice supplies speech turns, Spark proposes meaning/locations, and SAM supplies masks. None can issue an executable success command.

`src/guide/evaluator.ts` is the rule judge. A clear before state and sustained observed change are needed; a visible object alone does not pass. Earlier approved actions must precede later ones. Uncertainty invalidates evidence, duplicates cannot advance twice, and the final reviewed result must hold before completion. The current predicates measure movement/separation, not hidden opening, repairs or arbitrary physical correctness.

`src/practice/appearance.ts` follows visible texture features locally between remote checks. It is much lighter than a remote segmentation model and cannot understand every new scene. SAM foreground limits where it can select features. Losing identity, image quality or scene alignment means the app cannot verify, not that the learner failed.

`src/guide/storage.ts` keeps the current browser's library/draft and private rehearsal outcomes. `versioning.ts` makes a new unapproved revision. A revision changes one guide; a separately demonstrated method is a different route, with its authoring UI deferred. Signed receipts let the server detect altered rules after approval. They are integrity checks, not a promise that a human/model was correct.

The Teach access code is a private creator gate for uploads, paid lesson processing and approval. It is separate from the Meta API key and is not a full account system. Published local guide selection does not require re-entering that creator code. Production sharing/auth and distributed quotas remain deferred.

`src/app/teach/` provides preview, actual-stage progress dialog, visual review and optional rehearsal/save. `src/app/practice/` provides the camera-first setup and current action. Major Teach outcomes use keyboard-contained dialogs; Practice guidance stays visible beside/above the camera so it does not cover physical work.

## Final local verification commands

- `npm test`: 238 passed, 15 files; no live requests.
- `npm run lint`: passed.
- `npm run typecheck`: passed; production build also ran strict TypeScript.
- `npm run build`: passed.
- `QA_BASE_URL=http://127.0.0.1:3000 npm run test:e2e`: nine passed, mocked providers/synthetic camera; no live requests. A targeted screenshot rerun checks the final laptop controls placement.
- `npm run format:check`: passed.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities reported for runtime dependencies at this checkpoint.
- Actual secret-value scan of 144 source/test/script/browser-build files found zero matches. Private media/results remain ignored. No commit, deploy, Firebase or GPU hosting action was performed.

The owner app is served from the stable production build on port 3000. Rebuilding that directory requires stopping the server first; verification builds can use the separate directory/port. Do not start a new paid analysis just to inspect the new UI: the live allowance is exhausted.

## Remaining manual acceptance (conditional on a correctly grounded guide)

1. Review every actual source start/change/result, named object and final goal; ensure speech coverage does not imply an unrecorded repair. Reject incomplete evidence.
2. Rehearse before publishing. Start with the camera on your face/empty setup, then point it at the work area. No procedural pass/failure should occur during setup. The next action and Ready must be visible without searching.
3. Perform the approved sequence on a real MacBook Chrome camera, then an early later action, obstruction, camera move and recovery. Verify that uncertainty never passes and an approved correction is relevant. Measure warning latency from actual detected changes.
4. Save the reviewed revision, reload/select it as a learner without the creator cookie, repeat the same checks, and confirm Stop releases the camera. Confirm a revision requires fresh review and never silently changes an ongoing session.

These manual steps have not passed on the owner's physical camera, and the new live batch did not reach step 2. They are acceptance gates, not instructions to bypass the failed grounding or approve an uncertain guide.
