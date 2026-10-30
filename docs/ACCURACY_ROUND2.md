# Accuracy/timing repair: second live allowance

Status: allowance exhausted; full Teach-to-Practice acceptance has NOT passed. This separate owner-approved allowance permits five sequential trials, no automatic retries. The previous five-trial failure ledger remains unchanged. Media, detailed responses and test actor artifacts stay private under `.media-lab/repair-round2/`.

The latest owner instruction requires the full necessary demonstrated sequence in the 15-second phone recording. The temporary phone-removal-only restriction is superseded. Opening/preparation/removal history cannot be replaced by an already-removed phone. No completed repair is shown or claimed.

## Real requests

| Trial | Result | Follow-up |
| --- | --- | --- |
| 1 | Real Voice, Spark and SAM responses parsed; unsupported source geometry and incomplete tool coverage blocked approval. | Split semantic discovery from exact single-image localization; retain original frames and measured confidence windows. |
| 2 | Exact source localization did not produce a usable box; stopped before SAM video/draft. | Short noun identities, retained outline diagnostics and exact-image normalized coordinates. |
| 3 | Real source responses parsed and upload deletion confirmed. Six parts identified. Three draft steps; one unsupported, two with unresolved semantic/evidence limitations. Tool case and screwdriver actions unresolved; approval/Practice not attempted. | Use actual selected frame instead of forcing frame zero; preserve full scope. Add before/after SAM prompts using declared appearances within the same four localization calls. |

Trial 3 took about 133 seconds end to end. Server progress: upload/transcription 10.4s; discovery 25.2s cumulative; four localization calls completed 55.1s cumulative; video tracking parsed 88.4s cumulative. Remaining time included drafting, cleanup and UI/evidence capture. These are this run’s timings, not performance guarantees or measured learner warning latency. Billing totals were not available.

Independent visual review of trial 3: the final phone outline improved, but the tray outline omitted part of its outer body and high-confidence continuity was absent. The phone draft used motion after the actual lift, not proof of removal from the tray. A package lift was also proposed as opening. These drafts are not approved evidence of the requested sequence. Provider confidence alone is not identity accuracy.

Trial 4 returned a four-step draft covering package opening, tool-case opening, screwdriver removal and phone removal. All necessary actions remained in the draft. Approval was still blocked: clear-lid before state was below threshold, screwdriver tracking fragmented, tray never trusted, and final goal unsupported. It took about 122 seconds overall. Source video parsing completed at 89.9s cumulative. Multi-view prompts improved phone coverage (113 trusted frames) and found some screwdriver frames (27), but these counts do not prove the full actions or correct geometry.

Follow-up before the final trial: remove the undocumented 12% padding around exact source outlines, preserve each frame’s own positive/negative prompts, and explicitly forbid substituting arbitrary movement for removal when container evidence is missing. Practice no longer requests remote checks solely because the step index changes; it still requests grounding for missing required parts and newly exposed results. These are testable changes, not a claim that transparency or small-tool tracking is solved.

## Local checks

263 Vitest tests passed after the frame-specific multi-view prompt change. Prior to that change, production build, lint, TypeScript and 12 Playwright browser checks passed. Browser tests mock provider responses and cover setup, already-goal rejection, approval response errors, local rehearsal, pause/resume and completion persistence. They do not prove phone-scene accuracy. Re-run build/checks for the final source changes before live trial 4.

## Remaining acceptance

All five trials in this allowance are now used. The owner subsequently approved a separate five-trial batch; see [ACCURACY_ROUND3_PLAN.md](ACCURACY_ROUND3_PLAN.md). Inspect every draft’s before/change/result and necessary action coverage before test-only review. Only then attempt creator rehearsal, save and learner replay. A headless recorded-camera replay is distinct from the owner’s real MacBook Chrome camera. Wrong order, uncertainty and physical-camera accuracy remain explicit acceptance gates. Do not publish an incomplete guide or claim universal physical-task accuracy.

## Final trial

Trial 5 returned parsed tracking but no completed draft: Spark reported `status=incomplete`, `reason=max_output_tokens`, 6,144 output tokens (reasoning and message). No retry or approval occurred; upload deletion confirmed. About 129.5 seconds overall, tracking parsed at 95.7s cumulative. Source counts still did not establish a complete reliable sequence: the tray had zero trusted frames; the cover had two. Other parts improved in counts, but proposals varied between runs, so this does not isolate padding as the cause or prove better accuracy.

A subsequent finite draft ceiling of 12,288 and concise output instruction are planned for the next allowance. This is not a successful live fix until verified. Final local checks before this change: 263 Vitest tests, 13 mocked browser tests, lint, TypeScript and production build passed. Port 3000 served v0.3; health/Teach/Practice HTTP 200. Browser static assets and changed files passed private credential scans. Real creator rehearsal, learner replay and physical camera acceptance remain unpassed.
