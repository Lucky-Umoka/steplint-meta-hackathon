# StepLint — handoff to the next agent

> **Latest repair status (2026-11-03): all four authorized paid runs are now used. Do not run another paid test without new explicit authorization.** Run 3 failed at Spark JSON; bounded syntax correction was implemented and checked. Run 4 passed real Teach through approval and automatic Practice startup but failed goal completion. Retained repairs pass 684 unit tests, build, TypeScript and lint; browser cases pass across the main suite and focused reruns (one expected skip). A concrete same-size start-region correction passes offline completion/reversal/recovery, but requires owner approval before Practice can use it. Read `docs/PRACTICE_REVIEW_CORRECTION.md` and the latest `docs/DECISIONS.md` entries before following the older steps below. Physical-camera acceptance and a clean final paid pass remain open.

> **Update (2026-11-03, later):** Owner APPROVED the zone-1 correction; revised artifact `.media-lab/live-e2e/approved-revision-zone1-up002.json`. Goal-invalidation speech fix landed in `local-practice.tsx`. Open blocker: intermittent browser-only work-area loss during the carry (see latest `docs/DECISIONS.md` entry). Outputs: `.media-lab/live-e2e/practice-continuation/revision-run*/`.

Date: 2026-11-03. Branch: `fix/phyical-practice-test`. Last commits: `5257ebf` and `4c82c4b` (by the owner). **Uncommitted:** `src/practice/local-tracking.ts`, the occlusion-tolerance work in progress described in §3. State when this was written: `npx tsc --noEmit` exits 0 and `npm test` passes **661 tests in 76 files**. The Playwright suite was last green (42 passed, 1 skipped) *before* the uncommitted tracker edits, so rerun it.

Read **CLAUDE.md** first (it is authoritative; AGENTS.md content is the same). Key rules:
- The deterministic verifier decides pass/fail.
- Missing evidence means `needs_verification`.
- Never lower confidence or identity thresholds.
- Announce every paid call (model and reason) and keep it bounded.
- Don't commit, push or deploy unless asked.
- Record decisions in `docs/DECISIONS.md`.

---

## 1. Where the project stands

Phases 1–5 of `docs/IMPLEMENTATION_FIXES.md` are implemented:

| Phase | Record | Status |
| --- | --- | --- |
| 1 Teach V3 contract | `docs/TEACH_V3_PHASE1.md`, `docs/TEACH_SOURCE_EVIDENCE_FIX.md` | Done; owner Teach runs pass step 4 |
| 2 Approval/handoff | `docs/TEACH_V3_PHASE2.md` | Done (revision IDs, rehearsal status, V2 compatibility) |
| 3 Watch sets/recovery | `docs/PRACTICE_V3_PHASE3.md` | Done, but live testing exposed tracker defects (§2) |
| 4 Lifecycle/voice | `docs/PRACTICE_V4_PHASE4.md` | Done (`src/practice/lifecycle.ts`, `ensurePracticeRunning` in `local-practice.tsx`, half-duplex voice) |
| 5 Final goal gate | `docs/PRACTICE_V5_PHASE5.md` | Done (`src/procedure/goal.ts`, wired in `pipeline.ts` and `local-practice.tsx`) |

The owner approved **3 live paid end-to-end tests plus 1 final test after fixes**. **Two have been used.**
- Ledger: `.media-lab/live-e2e/ledger.json`.
- Results: `.media-lab/live-e2e/results-run1/` and `.media-lab/live-e2e/results/` (run 2).
- **Remaining:** live test 3, then one final test that **must pass end to end** (owner's instruction). Test 3 may only run once §3 is finished and the offline replay (§3.5) passes.

## 2. Live findings and root causes (already fixed, committed)

**Run 1.** Teach passed fully: upload, analysis, one step, no blockers, approval and save. Practice could not start:
- Stationary references were grounded from an 8%-wide patch around a discovery point. Fixed in `src/teach/automatic-setup.ts`: SAM-tracked boxes are used.
- The mover's template was taken with the demonstrator's hand on it. Fixed in `automatic-setup.ts`: the identity view is the earliest approved `referenceFrames` entry at the same start position.
- Phone auto-exposure made raw-RGB matching fail. Fixed in `src/practice/appearance-overlay.ts`: an `illumination` flag adds per-channel gain/offset compensation (gain limited to 0.5–2); the cost threshold of 24 and the separation gate are unchanged.
- Placing objects by hand broke 1% agreement. Owner decision: zones follow their own reference (`alignFixedObjects` median, `MAX_INDEPENDENT_PLACEMENT` 0.1, `zoneTranslations` in the protocol and `local-practice.tsx`).
- A renderer crash happened under the dev server. Run tests against the **production** build (`npm run build && npm start -- -p 3002`). Run 2 had no crash.

**Run 2.** Practice started automatically; voice pause, stop camera and start practice changed real lifecycle state. Then, about 1 s in, Practice dropped to "View unclear; finding the work area again". Root causes from an **offline replay of the real video**:
1. The table-patch camera reference was scanned from the top-left and landed on the **demonstrator's body**. Fixed: no table patch when stationary references are matched.
2. The "lid" SAM box was actually the bottle (it overlapped the mover). Fixed: references whose approved box overlaps a mover by more than 20% are *contaminated* and excluded from anchors and camera checks.
3. Continuous auto-exposure made a still plate "move" between frames. Fixed: stationary references and the workspace patch track with `illumination = true`.
4. Resume gave up after 5 attempts (about 6 s) and blocked. **Not fixed yet** (§3.4).

## 3. Unfinished work (do this next, in order)

### 3.1 Finish occlusion tolerance in `src/practice/local-tracking.ts` (uncommitted, partly done)

Already in the uncommitted file:
- `coveredByMover(state, box)`: a mover's `lastBox` is within 0.1 of the box.
- A reference that is missing or displaced while a mover is near it counts as **occlusion**: no failure, the reference box is reported unknown, and mover evidence keeps flowing.
- References are re-measured every frame (`profile.lost = false`).
- `referenceHiddenSince` gives a 2 s grace period before invalidating.
- With no mover nearby, "missing or displaced" still means **camera moved**. This keeps `tests/local-tracking.test.ts` and phase-3 scenario 8 unchanged and passing; do not weaken them.

Replay status at the hand-off (run-2 lesson, real frames, `.../scratchpad/replay/replay.test.ts`, see §3.5):
- Startup OK (`fixed=[component-3]`), armed at frame 11.
- The bottle is lost at frame 118 (hand grabs it) and **never reacquired**.
- At frame 156: "No stationary reference has been visible for 2 seconds" invalidates calibration.
- The step never passes.

Two fixes remain:
- **(a) Recovery search must look where the object can plausibly be.** `searchIdentity` currently searches ±48 px around `slot.lastBox` only. A carried object ends up in the step's target zone, about 125 px away.
  - Store the bootstrap's translated zone regions in state (`state.zones: Box[]`, from `source.zones` plus `zoneTranslations`).
  - In the search loop (`const action = nextSearch(...)`, around line 517), try `lastBox` first, then each zone region (nearest first). Take the first candidate that passes the existing gates (approved template, separation, 0.9, no overlap with another identity).
  - Keep the 3 consistent observations and the 3-attempts-in-2-s bound.
- **(b) No permanent `needs_user_view`.** Owner's instruction: the system must "stay relaxed" during hand occlusion.
  - In `src/practice/identity-recovery.ts`, allow `needs_user_view` to run one `attempt` per 1000 ms (still at most one action per fresh frame).
  - Update `tests/identity-recovery.test.ts` ("no automatic search after exhaustion") and `tests/phase3-tracking.test.ts` ("stops searching after the bounded attempts") to the new rule. Record the owner request in `docs/DECISIONS.md`.
- **(c) A reference permanently partly covered by an object resting on it** (bottle on plate) must still count as seen.
  - Add an optional `retainFraction` override to `measureNative` (currently hard-coded 0.8, around line 105).
  - When `coveredByMover(state, reference)` is true, re-measure the reference with `retainFraction: 0.5`; if it is within the 0.025 position tolerance, `referenceSeen = true`.
  - The position tolerance and the cost threshold stay unchanged.

### 3.2 Teach review: zone conflict from scene predicates (owner's latest error)

Owner error:
> Zone "zone-blue-lid" is used at several different places (step-1 (component-1 start), initial-1 (component-1 scene condition)) … Starting and target zones overlap.

Cause (from the code): `reconcileSharedZones` in `src/teach/review-suggestions.ts` widens a zone to also cover **scene-predicate** observation points. An initial predicate frame where the bottle is lifted or held widens the start zone until it overlaps the target, which blocks approval and **Test in Practice**.

Fix:
- Widen only from **step endpoints**; exclude predicate points from the widening.
- Leave `validateReviewEvidence` (`src/teach/schema.ts`) to check predicates against the step-derived region. It already reports "The reviewed zone does not support its initial/final source condition", which the correction request can fix.
- Update `tests/teach-source-evidence.test.ts` (the shared-zone test lists predicate users in the message; keep listing them in the message, but don't widen for them).
- Add a regression: same-object start zone plus an initial predicate at a slightly different place gives no overlap and no blocker.
- Ideally also make the compiler prefer initial-predicate frames where the object is at rest. Movement windows already give a settled start frame; tell the model in `sparkRequest` instructions that initial predicates should cite that frame.

### 3.3 UI requests from the owner (do last, without touching working logic)
- Everything clickable must be a real `<button>` or link, not plain text. Audit `src/app/teach/*.tsx`, `src/app/practice/*.tsx` and `src/components/*`. Look for `onClick` on non-button elements and for text that is styled like an action. Fix only those.
- The **Approve procedure** button (`src/app/teach/review.tsx`, label "Approve procedure") must be **green**. Use the existing Tailwind style, for example `bg-green-600 text-white hover:bg-green-700`, keeping the disabled styles.
- Re-run the Playwright suite after the UI changes (labels and roles must stay the same, since tests use them).

### 3.4 Resume must not block after about 6 s

In `local-practice.tsx` (the reply handler, `reply.type === "error" && automatic`, plus `workerTimeout`), `autoFailures >= 5` sets `automaticWanted = false` and the lifecycle goes `blocked`.
- For **"Finding …" errors** (an object not visible yet, which is normal while the learner positions things), keep retrying every 3 s silently.
- Don't re-announce; keep the notice; the lifecycle stays `recovering`.
- Block only for real errors such as exceptions or invalid setup.
- Keep `e2e/practice-lifecycle.spec.ts` "(7, 9) never shows running" passing, and update `tests/practice-lifecycle.test.ts` only if needed.

### 3.5 Offline replay gate (mandatory before any paid test)

Re-create the replay (scratchpad paths may be gone):
1. `ffmpeg -i .media-lab/steplint_video2.mp4 -vf scale=320:240 -f rawvideo -pix_fmt rgba <dir>/all.rgba` (270 frames × 307,200 bytes).
2. A vitest file, placed temporarily in `tests/` and deleted after:
   - reads `.media-lab/live-e2e/results/approved-artifact.json`, the real approved lesson from run 2;
   - runs `bootstrapLocal(frame0, {scene: frame(sceneFrame), objects from automaticSetup with required = role==="required", zones from zoneBindings})`;
   - translates the bindings by `zoneTranslations` and calls `createSession(procedure, bindings, 0)`;
   - for every frame, takes `watchSet` → `trackLocal(..., {nowMs: 1000+f*66.7, frameId, watch})` → `feedTrackingFrame(session, {...reply, timestampMs, frameId, watchKey})`;
   - prints changes in bottle quality, `armed`, step status and `session.goal.status`.

**Pass criteria:**
- Calibration stays valid through the carry (frames 110–140).
- The bottle is reacquired at the plate.
- `step-1` becomes `passed`, and `session.goal.status` becomes `complete`.
- Also loop the video (append frames 0..269 again): the reversal back to the lid must give a failed step and a goal `invalidated`, with no crash and no lifecycle churn.

### 3.6 Then run the full checks
- `npx tsc --noEmit`
- `npm run lint`: 0 errors, the same 5 old warnings.
- `npm test`
- `npm run build`
- `npx playwright test`: all must pass, with 1 test still skipped.

### 3.7 Live test 3, then the final test (owner-approved)
- **Harness:** `.media-lab/live-e2e/` (README, `live-e2e.spec.ts`, `playwright.live.config.ts`, fake camera `camera/bottle-rest-then-move.y4m`, made by `prepare-camera.sh`).
- **Server:** production, `npm run build && npm start -- -p 3002`. The keys (`MODEL_API_KEY`, `BASETEN_API_KEY`) come from the Codespaces environment; the Teach token is in `.env.local`.
- **Command:** `LIVE_BASE_URL=http://localhost:3002 LIVE_CONFIRM_PAID=1 LIVE_TEACH_TOKEN="$(grep '^TEACH_ACCESS_TOKEN=' .env.local | cut -d= -f2-)" npx playwright test -c .media-lab/live-e2e/playwright.live.config.ts`. Before running, move `results/` to `results-runN/` and append an entry to `ledger.json`.
- **Notice to give the owner before running:** Meta Muse Voice Transcribe ×1; SAM 3.1 plus Baseten `meta-models/muse-spark-open-1026` ×1 compile, with at most 2 Spark requests; approve and Practice make no model call.
- **The voice checks are through real page state** (`#local-practice-status[data-lifecycle-state]`). The owner's complaint was that voice was transcribed but didn't trigger actions; the Phase 4 shared controller fixes this, and the harness proves it.
- **The fake camera loops the clip.** At each loop the bottle jumps back to the lid, which is expected to cause a reversal or invalidation. Consider making the harness wait for the first "Final goal verified" (it appears about 9 s after start), then run the voice checks.
- After each live test, diagnose failures from `results/lifecycle.log`, `browser-console.log`, `practice.json` and `approved-artifact.json`, plus an **offline replay with that run's approved artifact**. Fix root causes before the next test.

## 4. Owner requirements to keep in view (latest messages)
- **Focus on the objects, not on alignment.** Hands and continuous movement must never stop tracking or verification. Occlusion is uncertainty, handled calmly.
- **Very low latency.** Feedback (red/green light and voice) should come in well under 1 s.
  - Measure in the live run: `metrics` in `local-practice.tsx` (`frameCallbackAtMs` → `confirmedAtMs` → `paintAtMs`) and the download export's `latencySummary`.
  - Report the median and p95 to the owner.
  - The worker currently processes frames at 320×240 every 33 ms; check that `processingMs` stays small with `illumination` compensation on stationary references.
- **Reversals after verification** must be caught and the learner asked to correct them. This exists (verifier reversal → "Stop. <recovery>" speech and red; goal `invalidated`). Verify it in the live run's looping video.
- Teach must remain voice-free.
- Think end to end, from Teach to Practice. **Smooth success, no errors.**

## 5. Files touched in this work (for orientation)
- **Teach:** `src/teach/{source-evidence,v3-evidence,v3-relevance,review-suggestions,automatic-setup,schema,revision,rehearsal,finalize-approval}.ts`, `src/server/teach/{pipeline,http}.ts`, `src/app/teach/review.tsx`.
- **Practice:** `src/practice/{watch-set,identity-recovery,lifecycle,local-tracking,local-tracking-protocol,local-tracking-worker,automatic-alignment,appearance-overlay,pipeline}.ts`, `src/app/practice/local-practice.tsx`, `src/procedure/goal.ts`.
- **Voice:** `src/voice/{commands,use-voice-control}.ts`, `src/practice/local-commands.ts`.
- **Tests:** `tests/{teach-source-evidence,teach-v3-consistency,v3-handoff,phase3-*,identity-recovery,practice-lifecycle,practice-voice,phase5-goal,live-startup-regressions}.test.ts`, `e2e/{v3-handoff,practice-lifecycle}.spec.ts`, `e2e/practice-harness.ts`.


---

# 6. Complete session handoff — owner closed the chat (2026-11-03)

**Read this addendum before acting on the older sections. It supersedes their remaining-test counts and unfinished-work status. The earlier content has been preserved.**

## 6.1 Exact pending question for the owner

> I need your approval of the exact review correction in `docs/PRACTICE_REVIEW_CORRECTION.md`: move the starting zone **up 4.8 pixels** in the 320×240 reference image, keeping its size and the target unchanged. It passes offline completion, reversal and recovery.
>
> **Approve this correction so I can run the prepared no-cost Practice continuation?**
>
> AGENTS.md requires explicit human approval before Practice uses a changed procedure. The original approval is preserved. All four authorized paid runs are used; the final paid Practice test did not pass.

**The owner has NOT answered or approved this correction.** An asynchronous question was presented, and the final response repeated it. The owner's latest instruction was only to record everything here because they were closing the chat. That instruction is not approval of the new region, not permission to silently change an approved lesson, and not a new paid-request allowance.

The governing instruction is: “A human must review and explicitly approve a procedure before Practice mode can use it.” The concrete review proposal is ready; do not ask a vague permission question or repeat paid tests just to obtain the same diagnosis.

## 6.2 Actual current status, budget, workspace

- Branch remains `fix/phyical-practice-test`.
- No commit, push, merge, deployment, new dependency or infrastructure change was performed.
- Existing uncommitted `src/practice/local-tracking.ts` work was preserved and extended. Many additional changes are uncommitted; inspect `git status --short` and the diff before working.
- **All four owner-authorized paid runs have now been used. No fifth paid run is authorized.** Ledger: `.media-lab/live-e2e/ledger.json`.
- A clean final paid end-to-end pass was **not** achieved. Physical-camera acceptance remains open. Do not claim the handoff is complete.
- The owner repeatedly requested completion within ten minutes and explicitly authorized parallel smaller agents. Three subagents were used for tracking, lifecycle/Teach/UI, and validation/research; root reviewed their results. Execution-permission waits, browser failures, full-suite duration, model latency and newly exposed failures exceeded that target. All subagents finished; no delegated work should be assumed still running.
- Production server was last started on port **3003**, using `STEPLINT_VERIFY_BUILD=1` and `.next-verify`. Its last root session ID was `80172`, but session IDs/server processes may not survive a new agent. Check availability before using it.
- Source/runtime point-offset experiments were fully reverted. `src/practice/local-tracking-protocol.ts`, `src/practice/pipeline.ts`, and `src/procedure/goal.ts` have **no retained correspondence/measurementOffsets changes** from this session. Do not restore experimental warps from scratch files.

## 6.3 Retained implementation changes

### Practice tracking and recovery

Files: `src/practice/local-tracking.ts`, `src/practice/identity-recovery.ts`; regressions in `tests/{identity-recovery,phase3-tracking,native-palette,local-tracking}.test.ts`.

1. Store source zones translated by each zone's approved alignment in tracker state. Lost-identity search tries the last reliable box first, then approved zones nearest first. It still requires the approved appearance template, original cost/separation/0.9 gates, distinct identities and three consistent fresh observations.
2. Keep the initial three searches spread over two seconds; after exhaustion, `needs_user_view` allows one fresh-frame search per second instead of permanently requiring a restart. `lastSearchMs` enforces cooldown; repeated frame IDs cannot provide additional confirmations.
3. Preserve the previous stationary-reference occlusion work: references are remeasured every frame; mover-nearby uncertainty is treated as occlusion, not immediately as camera motion; the two-second all-reference-hidden guard remains. Genuine displaced/unexplained references still invalidate calibration. Existing camera-movement regressions were not weakened.
4. The requested retainFraction=0.5 approach did not solve the plate. A confirmed cause was that mover pixels polluted per-candidate illumination fitting and then made competing flat patches nearly indistinguishable. For stationary matching, exclude source sample indices covered by the mover from **both illumination estimation and appearance scoring**. Use the same remaining indices for competing translation hypotheses, with at least 32 visible samples; otherwise fall back to the original samples and original gates. Retention remains **0.8**, not a reduced acceptance threshold. Cost 24, separation and position tolerances remain unchanged.
5. Reset stationary search centers to their fixed reference each frame, while retaining the full displacement search. This prevents drift from an earlier disturbed match; it does not force a stationary observation or remove competing hypotheses.
6. Fixed a separate integration bug: native palette tracking already returned valid `partialIdentity`, and `measureNative` kept the native profile alive, but `trackLocal` unconditionally called `loseIdentity` on the obstructed detection. The final tracked-only partial-evidence filter then discarded the valid identity evidence. Keep the slot tracked while its existing measured partial identity is valid. Partial identity preserves transit identity and never supplies endpoint geometry. Existing score≥0.9 and visibleFraction≥0.45 gates are unchanged.
7. Reacquisition messages now describe continued searching rather than mandatory restart. A genuinely unusable approved template still reports that the Teach reference needs review; it does not promise that a nonexistent template will recover.

### Maintained-state reversal after uncertainty

Files: `src/procedure/verifier.ts`, `tests/local-pipeline.test.ts`.

A verified maintained step could become uncertain, then clearly return to its starting zone, without recording a reversal: the old reversal branch checked only status `passed`, while uncertainty had changed it to `needs_verification`. The verifier now also checks previously passed `maintain` states in `revalidate`. Identity-only evidence still cannot establish reversal; missing-origin→target still cannot pass; permitted later-movement release behavior remains unchanged. Added pass→missing→clear original-zone reversal→fresh target restoration regression, preserving the audit history and original physical timing where appropriate.

Independent review and 32 neighboring pipeline/continuous/phase-3 tests passed. Do not “repair” the new source-geometry failure by remembering an origin through genuine missing identity: existing tests explicitly reject that.

### Teach region conflict, compiler prompt and approval styling

Files: `src/teach/review-suggestions.ts`, `src/server/teach/pipeline.ts`, `src/app/teach/review.tsx`, `tests/teach-source-evidence.test.ts`.

- `reconcileSharedZones` now widens only from step endpoints. Scene predicates remain listed in conflict explanations but cannot widen a start region into a target. Existing schema validation still checks their source evidence independently.
- Added held-view no-widen regression and the requested slight initial-predicate drift regression that creates no approval blocker.
- Compiler instructions prefer the measured settled start frame for initial scene predicates instead of a lifted/held view.
- Approve procedure uses the existing `primary` CSS class. A plain Tailwind `bg-green-600` addition was initially tried, but `.flow-workspace button` overrode it; `primary` has the existing higher-specificity emerald-green styling and preserves disabled behavior.
- AST audit of `src/app/teach`, `src/app/practice`, `src/components` found no `onClick` handlers on non-button/non-link elements. No unrelated UI redesign was done.

### Automatic startup/recovery lifecycle

Files: `src/app/practice/local-practice.tsx`, `src/practice/lifecycle.ts`, `tests/practice-lifecycle.test.ts`, `e2e/{practice-harness,practice-lifecycle.spec}.ts`.

- `Finding...` setup errors no longer count toward the five-error failure cap. Retry silently every three seconds, retaining the notice and automatic intent. Real errors and worker-timeout bounds remain bounded; no blanket infinite retry for exceptions was introduced.
- Starting a retry worker retains `recovering` rather than transiently changing to `acquiring_initial_objects`.
- Added seven-retry pure lifecycle test and canonical-page retry/recovery browser coverage.
- The first browser test incorrectly assumed hiding the synthetic sprite must make bootstrap throw a Finding error. It actually produced a valid initialized-but-unarmed session, so counting >5 workers was an invalid fixture assumption. Corrected it to explicitly inject schema-valid Finding bootstrap replies with the real generation in the worker wrapper, then turn injection off and require the **real** worker to reach `running`. The test name clearly labels injection; it is not represented as physical perception acceptance.

### Spark malformed-output correction after paid run 3

Files: `src/server/meta/spark.ts`, `src/server/teach/pipeline.ts`, `tests/{spark-provider,teach-v3-consistency}.test.ts`.

- Official Baseten documentation explicitly excludes Muse Spark Open from enforced structured outputs/JSON mode. Do not add an unsupported `response_format` and claim it guarantees a fix:
  - https://docs.baseten.co/inference/structured-outputs
  - https://docs.baseten.co/inference/json-mode
  - https://docs.baseten.co/inference/model-apis/overview#feature-support
- Run 3's first completed Baseten drafting response failed JSON parsing before reaching the existing correction logic. Its original response text was not retained, so **the precise syntax/presentation defect is unknown**. Do not claim it was definitely a fence, truncation or trailing comma.
- `SparkError.candidateText` now retains a bounded completed malformed candidate for the server-side correction path. It is non-enumerable and is not included in HTTP/log serialization. Transport/truncation/auth/rate/provider errors do not gain candidates or retries.
- Accept either raw JSON or one exact whole-response JSON markdown fence. Reject surrounding prose, additional payloads/fences and malformed inner JSON; apply the same Zod/schema and semantic checks. This is presentation decoding, not JSON repair or weaker evidence.
- `draftWithOneCorrection` can spend the **same single correction allowance** on a completed malformed candidate. Candidate plus full evidence must fit the unchanged 28,000-character bound. Preserve original video, schema and token ceiling. There is never a third drafting request, including when the second response has semantic or review problems.
- Added success, repeated syntax failure, repeated semantic failure, reviewable second-draft issues, oversized correction body, serialization safety and transport-no-retry regressions. Root and subagent narrow suite: 48 passed; full final suite: 684 passed.
- Run 4 passed real Teach after these changes. The available capture does not prove whether syntax correction or fence decoding was exercised; do not invent that detail.

## 6.4 Verification results and pitfalls

### Final retained product code

- `npm test -- --maxWorkers=2`: **684 passed, 76 files** after Spark changes; no live model calls in unit tests.
- `STEPLINT_VERIFY_BUILD=1 npm run build`: **passed**, including its TypeScript stage.
- `npx tsc --noEmit`: **passed**, including a later rerun after experimental correspondence plumbing was reverted.
- `npm run lint`: **0 errors, same 5 existing warnings**.
- `git diff --check`: **passed**.
- Earlier 667-test run included a temporary recorded replay test. That file was moved out of `tests/`; do not compare 667 directly with the later regular-suite count without noting temporary coverage and added Spark tests.

### Browser checks: report the actual runs, not a fictional single green run

Root ran `QA_BASE_URL=http://localhost:3003 npx playwright test` outside the sandbox: 44 cases, **41 passed, 1 expected skip, 2 failed**. One failure was the incorrect synthetic-hidden-object test described above; the other was **trace-file ENOENT from an overlapping test process deleting the shared output directory**, after the application assertions had completed.

After correcting the fixture, root ran:

```bash
QA_BASE_URL=http://localhost:3003 npx playwright test \
  --grep 'injected Finding|after empty approval' \
  --output=.media-lab/playwright-final-retry
```

**Both passed** (21.6 s and 2.7 s). Therefore all browser cases are covered passing across the main run plus focused reruns, with one expected skip. There was **not** a subsequent uninterrupted full-suite green run. If rerunning, give concurrent processes separate `--output` directories or run sequentially. Never mistake trace-file races for product failures.

Sandbox Chromium failed at launch (`sandbox_host_linux.cc ... Operation not permitted`). Nested Node subprocess capture also returned empty stdout in the sandbox, causing Next's `tsc --showConfig` JSON parsing to fail despite standalone tsc working. Escalated execution fixed these environment failures. Request required execution permission through the tool; do not weaken checks or spend model credits to work around environment errors.

## 6.5 Paid runs 3 and 4 — exact outcomes and artifacts

### Run 3

- Archived results: `.media-lab/live-e2e/results-run3/`.
- Creator access and source-video preparation passed.
- Real upload/transcription and compile were made once each.
- Teach failed at **Spark request: Spark returned invalid JSON**. Temporary upload deletion was confirmed. Approval and Practice were not reached, so no approved artifact exists for a run-3 Practice replay.
- This triggered the bounded syntax-correction repair above, followed by offline tests, full unit suite, type-check, lint and production rebuild.

### Run 4 (final authorized paid run)

- Current results: `.media-lab/live-e2e/results/`.
- `summary.json`, `failure.txt`, `lifecycle.log`, `requests.jsonl`, `browser-console.log`, screenshots/video, `review.json` and `approved-artifact.json` describe the actual run.
- Real Teach analysis, one-step goal, no approval blockers, review, approve, save/open Practice and automatic Practice `running` all passed.
- Goal completion failed: Practice entered uncertainty/recovery and eventually blocked with “Tracking evidence arrived too late. Verification stopped; recalibrate before continuing.” The harness timed out waiting for the first final goal.
- Because the goal gate precedes voice tests, **run-4 voice checks, reversal checks and successful-goal latency export were not reached**. Do not count the earlier mocked browser voice checks as run-4 real-video acceptance.
- New artifact lesson ID: `59882a57-32e4-4632-ad85-05d2f17767b0`.
- New approved movement window: start41/change85/result130; bottle identity frame41, references41/85/130; starting zone `zone-1`, target `zone-2`.
- Older run-2 outputs moved to `.media-lab/live-e2e/results-run2/` (run1 remains `results-run1/`).
- `compile-stream.json` is empty (`[]`) because the Playwright response-body capture failed/returned empty; do not infer zero provider calls or lack of real compile from that file. The real request log and successful review/approval are separate evidence. Raw run-3 malformed candidate cannot be recovered from it.

### Corrected call accounting

Automatic discovery also makes **one Meta Muse Spark component-discovery request** (`src/server/teach/discovery.ts`), omitted from earlier handoff notices. This omission was acknowledged to the owner and recorded in the ledger/docs.

The whole automatic flow is: Meta Voice transcription1, Meta Muse Spark component discovery1, SAM tracking1, and at most **two Baseten Muse Spark drafting/correction requests**. The two-request correction bound refers to Baseten drafting, not the separate discovery call. Run3 reached one Baseten draft and no correction. Exact run4 drafting count was not independently logged; do not guess it.

No model key or Teach access-code value was written into this handoff. Keep keys server-only and never print `.env.local` or real credential values. Any additional paid end-to-end test needs new explicit spending authorization and accurate advance notice.

## 6.6 Root cause of final Practice failure; rejected workaround

The frame-41 SAM source box crops the cap, while a local palette detection later includes the full connected red surface. The source approved box center was approximately y0.2823; the runtime red-surface center was approximately y0.245–0.25. The original start zone top0.24229 with existing0.01 inset requires y>0.25229. A genuine observed starting pose can therefore fail the approved zone gate. This is a **source/runtime geometry contract mismatch**, not missing object identity, confidence or a need for the learner to hold still longer.

Raw paid4 offline replay did not reliably arm/pass its first loop. It still used the original approval, unlike the separately labeled proposal replay.

An experimental source-only constant point offset was investigated. It produced a goal completion but then falsely invalidated the bottle while resting at frame160, before the loop at270. Endpoint-specific warping would conceal incompatible source geometry. **All offset/sourceSurfaceOffset/measurementOffsets experiments were removed from product code and their temporary tests moved out of the regular suite.** Do not revive them merely to make acceptance green. Local source/runtime point consistency needs a general pre-approval check; that general fix is still open.

A direct extraction of original source frame41 was saved as `/tmp/steplint-frame41.png` during visual inspection. Temporary files may disappear; regenerate from `.media-lab/steplint_video2.mp4` if needed.

## 6.7 Concrete owner-review proposal — prepared and tested, NOT approved

Main review document: `docs/PRACTICE_REVIEW_CORRECTION.md`.
Machine-readable evidence/proposal: `.media-lab/live-e2e/review-proposal.json`, status `PROPOSED_NOT_APPROVED`, `approvalRequired:true`, with original artifact SHA and diagnostic trace.

Only translate `zone-1` up0.02. Exact region:

| Bound | Original approval | Proposed human review |
| --- | ---: | ---: |
| left | 0.23578125 | 0.23578125 |
| top | 0.2422916667 | 0.2222916667 |
| right | 0.31578125 | 0.31578125 |
| bottom | 0.3222916667 | 0.3022916667 |

Both dimensions remain0.08. The target, procedure steps/order, source frames, confidence/identity/position thresholds and physical objects remain unchanged. This region contains the reviewed source point and the actual runtime surface center with the existing inset. It is a review change, not a hidden runtime threshold change.

Proposal-only offline 540-frame replay:
- Calibration valid on every frame.
- Goal complete139.
- First invalidation280, **after** clip loop270, not while the bottle rests.
- No false invalidation before the loop.
- Automatic recovery complete509.
- Tracker median10.69 ms/p9520.16 ms.

These are offline recorded-media/proposed-review results. They are **not** an owner-approved Practice pass, live feedback metrics or physical-camera acceptance.

After explicit owner approval, update only the agreed binding and corresponding review region, issue a new executable revision, reset stale rehearsal state and discard the old receipt for changed content. Do not forge/reuse the old approved revision or invent a new human approval. Use the existing source media; this region correction and local Practice continuation require no model call.

## 6.8 No-cost original-lesson diagnostics and latency (completed)

A separate local browser continuation seeded the original unchanged run-4 approved export into the canonical Practice library. It blocked **all Teach API routes** and made zero Teach/model requests. This was diagnostic, not an end-to-end pass.

Files:
- `.media-lab/live-e2e/practice-continuation/original-45s-observations.json`
- `.media-lab/live-e2e/practice-continuation/observations.json`
- `.media-lab/live-e2e/practice-continuation/diagnostics.json`

633 worker replies in the longer diagnostic:
- worker median11.3 ms, p9531.2 ms, max313.6 ms;
- callback-to-reply age median16 ms, p9541 ms, max321.2 ms.

The >600 ms stale-response halt from paid4 did **not** reproduce in this no-video-recording continuation. Browser video/scheduling load is a hypothesis, not a confirmed root cause. No freshness limit was raised and no stale evidence was accepted.

A short canonical diagnostics-export test passed (12.7 s total). Its downloaded `latencySummary` contains 34 sampled software UI updates:
- callback→worker→verifier→two animation frames: median33.6 ms, p9568.7 ms;
- worker: median10.7 ms, p9531.1 ms;
- only one confirmed uncertainty decision sample; it does **not** establish successful final-goal feedback latency.

The original result remained `needs_verification`. `hardwareSensorLatencyMeasured` is false. These are sampled software timings on a fake camera replay, not hardware sensor/display latency, physical-camera acceptance or a guarantee of all-action performance.

## 6.9 Harness/scripts and next execution steps

Git-ignored working assets/scripts (must be transferred separately if another AI uses a fresh clone):

- `.media-lab/live-e2e/run-authorized.mjs`: safely loads the Teach token without printing it, archives prior results, checks ledger and only permits unused run3/run4; both are now used. **Do not edit away its budget guard to run a fifth test.**
- `.media-lab/live-e2e/live-e2e.spec.ts`: now waits for first final goal then loop reversal before voice tests, requires red correction + emitted completion-invalidation speech, and exports diagnostics. Final paid4 did not reach those success stages.
- `.media-lab/live-e2e/playwright.live.config.ts`: paid tracing is off to avoid recording creator access-code request bodies. Dry tracing can remain on. Paid recordings/screenshots remain private local artifacts.
- `.media-lab/live-e2e/playwright.practice.config.ts`, `practice-continuation.spec.ts`, `practice-helpers.ts`: prepared no-model canonical Practice continuation. It defaults to the original run4 artifact, routes every Teach API request to abort, and exports diagnostics. `PRACTICE_ARTIFACT_PATH` may point to a **properly owner-approved** revised artifact; `PRACTICE_REQUIRE_GOAL=1` requires recorded completion/reversal and tests pause/resume/repeat/stop-camera/start plus canonical buttons. That corrected-artifact path and the full added voice branch have **not yet run**. Do not represent this prepared code as completed acceptance.
- Export buttons are inside closed details. Harness locators now use `includeHidden:true` to locate the ancestor details before opening it; a previous diagnostic failed solely because the hidden export button could not be located. The corrected original-lesson diagnostic export passed.
- Practice continuation config output is nested under the local config directory because it uses a relative outputDir; keep it separate from ordinary `.media-lab/playwright-results` to avoid trace deletion races.
- `.media-lab/handoff-replay.test.ts`, `.media-lab/handoff-final-replay.test.ts`: earlier run2 completion/reversal probes. Their artifact paths may now point to run4; use `results-run2/approved-artifact.json` explicitly if reproducing older evidence.
- `.media-lab/paid4-correspondence-probe.test.ts` and other paid4 scratch probes are **rejected experimental diagnostics**, not product code or approvals.
- Temporary proposal replay was moved from `tests/` to `.media-lab/`; inspect local filenames before use. `/tmp/steplint-replay.rgba` is raw320×240 RGBA from the owner's clip; regenerate with the original ffmpeg command if absent.

Production rebuild/start used:

```bash
STEPLINT_VERIFY_BUILD=1 npm run build
STEPLINT_VERIFY_BUILD=1 npm start -- -p 3003
```

No-cost continuation (original lesson until owner approves a change):

```bash
LIVE_BASE_URL=http://localhost:3003 npx playwright test \
  -c .media-lab/live-e2e/playwright.practice.config.ts
```

Browser/build execution may require escalation outside the sandbox; use the tool's permission mechanism. Never assume a sandbox-launch failure is an application assertion failure. Do not run overlapping browser jobs into the same output directory.

## 6.10 Remaining work — do not claim finished

1. Obtain the owner's answer to the **exact** region-review question in6.1. Closing this chat did not answer it.
2. If approved, create the new reviewed revision without changing anything beyond the agreed region, and run the canonical no-cost Practice continuation on that revision. Verify completion, loop reversal, automatic recovery, real page voice/button actions and exported latency. The prepared future voice branch is unrun.
3. Investigate the original >600 ms stale response if it recurs; measured typical tracker time was small, and no root cause for that browser spike was confirmed. Do not extend timeouts or accept old evidence to turn a test green.
4. A **clean new paid end-to-end** test would require new explicit owner spending authorization because all four prior tests are used. Any no-cost continuation must be labeled separately from the failed paid run4.
5. General automatic pre-approval consistency between SAM's reviewed point and the local tracker point is still an architectural gap. Do not claim arbitrary-task robustness from this one manually reviewed correction.
6. Owner physical-camera acceptance remains open. Earlier recorded/mock/browser passes do not close it.

Additional progress records written this session: `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/LOCAL_PRACTICE_IMPLEMENTATION_LOG.md`, and `docs/PRACTICE_REVIEW_CORRECTION.md`. Preserve owner work and the append-only audit. No real credentials are included here, and nothing was committed or deployed.

## 7. Status after v0.4.1 work (2026-11-03, later)
- Uncommitted on `main`; the owner commits and pushes themself. Do not push.
- Two keys, two clients: `MODEL_API_KEY`/api.meta.ai only SAM 3.1 + Muse Voice Transcribe; `BASETEN_API_KEY`/inference.baseten.co only Muse Spark Open (discovery + drafting). The Meta client refuses `muse-spark*` at its fetch boundary.
- Paid runs 5–7 (the owner's second batch of 3) are all used; see `.media-lab/live-e2e/ledger.json`. Run 5 reached a real end-to-end final goal; 6 and 7 failed in Teach on issues now fixed offline. A further paid run needs new explicit owner authorization.
- See CHANGELOG 0.4.1 and the last DECISIONS entries.
