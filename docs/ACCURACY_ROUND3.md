# Third live allowance: full-sequence acceptance

Owner approved five more trials after the previous batch exhausted five failures. This allowance is now exhausted: all five stopped before creator approval/Practice. Keep previous ledgers unchanged. Implementation scope and request bounds: [ACCURACY_ROUND3_PLAN.md](ACCURACY_ROUND3_PLAN.md). Acceptance has NOT passed.

## Source repair

The automatic Teach path now has two authenticated streaming stages. The first uploads/transcribes once and asks Spark for source identities and useful action moments. An encrypted, session-bound 20-minute source reference lets the browser decode the exact selected frames and resume analysis with the same uploaded file. The second stage validates those frames, localizes planned views, runs SAM video, and drafts the procedure. No extra user step or cloud store is needed. Media deletion is attempted on completion/failure/cancel; provider one-hour expiry is the fallback.

Primary and alternate source views are each inspected once, within an eight-image bound. Unusable views provide no SAM prompt; a valid already-planned alternate can seed the object. If all views are unavailable, the process stops. The 0.90 evidence/continuity policy remains unchanged. Model proposals never count as verified actions. The final Spark output ceiling is 12,288, including reasoning; incomplete output remains an error. This output-limit change has not yet produced a completed live draft in this batch.

## Trials

| Trial | Actual outcome |
| --- | --- |
| 1 | Source preparation and one exact-image localization returned. The clear-lid primary view was unidentifiable; stopped before SAM video/draft. Upload deletion confirmed. Four trials remained. |
| 2 | Video-only discovery returned an out-of-range source frame index. Validation stopped before localization; upload deletion confirmed. No source numbers were retained in the failure response, so an internal model frame-rate assumption is only a hypothesis. |
| 3 | Completed source responses and parsed video tracking. Chose actual moments at 2.0/6.47/8.47/10.0/11.47/13.0s. Tray tracking reached 0.976, but full action continuity remained insufficient; tool-case and tool-taking coverage unresolved. Approval not attempted; upload deleted. |
| 4 | Stopped before video: concept “plastic lid” returned small tool-cap matches at about 0.72–0.76, not the clear case. Rejected; upload deletion confirmed. |
| 5 | Full six-part/four-action planning returned, including the tray. SAM concept “phone” returned no image matches for the wrapped phone. Stopped before video/draft; upload deletion confirmed. No retry. |

Trial 1 still selected the old preview indices despite freedom to choose any source time. These extra still images have now been removed from the dynamic discovery input; it reads the video timeline and transcript directly. This is a concrete hypothesis being tested, not a verified accuracy improvement.

## Local evidence

270 Vitest tests passed, including source-token/session boundaries, exact frame validation, cancellation deletion, upload reuse, dynamic frame selection, and primary/alternate handling. TypeScript, lint and isolated production build passed. Fourteen mocked Playwright browser tests passed before the alternate-view/video-only discovery change, including the actual browser two-stage extraction/upload handoff. These tests do not prove real recording or physical-camera accuracy.

## Remaining gates

The source must preserve the full necessary package-opening, tool-case, tool-taking and phone-removal sequence, with independently reviewed before/change/result/goal evidence. No arbitrary movement or already-out phone may stand in for removal. Only an eligible source can proceed to a TEST-ONLY review actor, creator rehearsal/save and learner replay. Physical MacBook Chrome camera accuracy and real warning latency remain separate, unpassed gates.

## Timestamp contract correction

Dynamic discovery now returns integer video milliseconds, not packet indices. A pure mapper selects the nearest actual decoded frame within 250ms, rejects out-of-range/missing/ambiguous metadata, and retains requested time, actual time and frame number. Tests cover both 15fps and 30fps, nonuniform source times, future times and metadata gaps. It does not assert that a proposed moment contains the correct action: grounding, deterministic evidence validation and human review still apply. Full suite after this change: 273 unit tests passed; TypeScript, lint and isolated build passed. No confidence threshold was lowered.

## Independent seed audit after trial 3

The exact frame at 11.47s shows a held screwdriver roughly at x286–368, y20–77. The Spark proposal included hand pixels (a positive point at x245,y34) and omitted part of the tip. Source tracking then followed a hand-sized area after extraction; earlier tool masks were sometimes only a few pixels. This is a directly inspected error, not a source-clip impossibility claim. No invalid source was approved.

The next bounded check uses one noun-concept SAM image request for each risky part, parses its real masks, requires provider confidence at least 0.90, and accepts only a uniquely matching geometric candidate. Video prompts for those parts use the selected mask’s actual box and foreground point, discarding suspect Spark points. Other parts retain their planned source views. Transparent/reflective material metadata also stays in the reviewed source profile. Maximum extra SAM images is six; new notice/bound before trial 4 is 18 Teach + 12 camera = 30 model requests, no automatic retries. This is not yet a demonstrated accuracy improvement.

## Final-trial preparation

Trial 4’s discovery omitted the white tray reference. Dynamic discovery now returns a typed ordered action plan with one-based component/reference indices. References must exist; each removal needs a distinct actual container. The final compiler checks the action plan as an ordered subsequence with matching kind, object, anchor and required visible result. It rejects missing actions and movement-for-removal shortcuts; uncertainty remains explicit and cannot become approval. The final draft prompt preserves required but unsupported steps in the review checklist.

Transparent parts now use a boxed SAM image check rather than the noun that matched unrelated tool caps. Small tools/reflective parts use concept checks without suspect Spark points. Each selected image check still runs at most once; maximum six, same 30-model full-trial bound. These are concrete follow-ups, not successful live verification. Latest local suite: 275 tests passed; TypeScript passed. Build/lint being checked before the final trial.

## Offline changes after the cap

No additional paid request was made after trial 5. Transparent AND reflective parts now use boxed image checks, while small opaque tools use a noun concept. A mocked SDK/parser contract test verifies the reflective-phone request is boxed and cleanup occurs once. This routing change is not live-verified.

The source action wire schema now uses nested `anyOf` variants (supported by the official strict subset), preventing movement with a non-null ignored anchor. An explicit operation distinguishes opening/removal/movement. Opening can be refined into observed cover movement plus an exposed-container result; removal cannot be downgraded to generic movement. Raw draft proposals are retained in authenticated progress diagnostics before pure compilation, so a later validation failure can be investigated without inventing success or immediately repeating paid inference.

The automatic first upload no longer extracts/sends unused coarse images. The second request carries only actual requested frames and the encrypted source reference. A browser/route regression checks no repeated video/audio upload. Short-lived camera frame history and overlays clear on pause/completion; completed/off/paused sessions skip tracking work.

Final local unit suite: **284 passed across 28 files**. The full four-action phone fixture tests complete order, premature phone removal, obstruction/reappearance without success, missing tray and fresh retry. These are synthetic observations, never represented as real Meta/camera accuracy. TypeScript, lint and isolated build passed. Fourteen mocked browser checks passed after the upload/history changes. Latest production verification is recorded below; local checks remain distinct from real acceptance.

**Unresolved:** no accepted automatic full-sequence source, real creator rehearsal, learner replay, physical MacBook camera accuracy or real warning latency. The API cap is a cap, not a reason to waive evidence gates. [ACCURACY_GAPS.md](ACCURACY_GAPS.md) records the remaining evaluation work.

The localizer now checks every component in each already-selected image (still at most eight image calls). When the primary is unavailable or clipped, it can use a full view from those same images; a regression test covers the previously unused cross-view. This addresses the clipped screwdriver primary without extra requests or invented coordinates. The cross-view/boxed-reflective fixes remain live-unverified because all five trials were already used.

## Final local verification and serving state

- `npm test`: 284 passed, 28 files.
- `npm run lint`, TypeScript and production build passed; no checks were suppressed or relaxed.
- `QA_BASE_URL=http://127.0.0.1:3002 npm run test:e2e`: 14 passed with mocked provider responses. This checks UI/state handling and does not claim real perception accuracy.
- Latest production app is serving on port 3000; `/api/health`, `/teach` and `/practice` returned HTTP 200.
- Credential scans passed for 38 browser assets, the diff and untracked source files; no secret values printed. `git diff --check` passed. Existing development type imports in `next-env.d.ts` were restored and `tsc --noEmit` passed.
- Read-only follow-up preflight passed for the owned input hash, size, configuration and app health. No paid request/trial was consumed by preflight.
- One additional full-sequence trial has been requested from the owner because the current five-trial cap is exhausted. Pending explicit approval; the separate follow-up ledger has cap 1 and zero attempts. No extra call has been made.
