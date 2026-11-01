# Local Practice implementation report

Date: 2026-11-01. Owner-approved implementation of ROOT_CAUSE_AND_LOCAL_PRACTICE_PLAN.md. Read the chronological progress/mistake record in LOCAL_PRACTICE_IMPLEMENTATION_LOG.md.

## Status

**Latest repair:** [UI, controls and automatic setup report](UI_CONTROLS_AUTOMATIC_PRACTICE_REPAIR.md): 475 unit tests / 32 production browser checks passed; both previews updated. Physical and fresh live Meta acceptance remain open.

The owner reopened acceptance after the initial delivery. The subsequent UI/control/automatic-setup repair is recorded below; earlier frozen-build numbers are historical checkpoints.

The bounded local Teach → approved procedure → Practice path is implemented. Automated checks and recorded replay are distinct from acceptance on the owner's camera. **Physical-camera acceptance and new live Meta compiler acceptance remain open. Arbitrary-task accuracy and hardware damage prevention are not established.**

No paid Meta request was made in this implementation run. No commit, push or deployment command was executed by this agent. An externally created owner-authored commit `56bf93e` appeared during work; it and subsequent working-tree changes were preserved. Original starting HEAD was `40e566a`.

## What changed

- Default `/teach` uses the existing authenticated capture/lesson/compiler/review/approval path. Explicit goal coverage, start/change/result review, measurement point, shared zones and human approval produce V2 ProcedureSpec. Unsupported required work blocks approval; source policy cannot be lowered below 0.90.
- Default `/practice` authenticates the unchanged signed export, uses receipt-bound Teach visual references to establish identities and scene geometry automatically; manual calibration is optional recovery. Normal verification has no remote relationship/model request and no per-step Check/Ready button.
- Native surfaces, dense appearance and features support unmodified objects under measured scene alignment or optional explicit calibration. Fixed destinations and workspace references are monitored. Local similarity is labelled as tracking quality, not a provider probability or accuracy percentage.
- `feedTrackingFrame` is shared by browser and recorded replay. It enforces the watch set, maps the approved centre/base point and feeds the existing zone pipeline. Incremental verification and full replay use one reducer.
- Continuously visible transit has no arbitrary eight-second action timeout. Local endpoint dwell checks position stability; other objects and the learner can keep moving. Physical occurrence and confirmation times remain separate.
- Partial identity has no endpoint geometry. It can preserve measured continuity through a clipped view but cannot complete a step or prove reversal. Ambiguous/lost identity remains unverified; there is no blind reseeding.
- Amber approach advisories use measured movement and approved forbidden/order rules. Confirmed red correction pulses on actual evidence; fresh correction restores the required state automatically. Persistent goals remain monitored until Stop.
- Pause/resume retains proven actions and audit history. A fresh calibration epoch revalidates current states; unfinished actions need fresh origins. Restart is explicit. Voice and gestures use normal controls and cannot verify or skip steps.
- Guidance/control transcript entries are distinct from actual speech-start events. Speech failures do not stop visual verification. The existing companion is restored in its previous dark panel, beside the camera.
- Raw approved JSON is stored separately without rewriting signed bytes. Previous Guide libraries and deep links remain explicitly labelled legacy workflows; they do not silently become V2 rules.

## Verification record

The final command outcomes and browser measurements are appended below after the frozen-build rerun. Already established checkpoints:

- Full Vitest: **464 tests, 57 files passed** after the matcher optimization and shared-frame adapter tests.
- Strict TypeScript, repository lint, configured formatting check and isolated production build passed.
- Canonical production browser checks passed Teach review/approval/handoff; automatic Practice, wrong-state correction, restoration, continued goal monitoring, voice interruption, consent guards and resume with retained history. These use generated camera pixels and mocked recognition/perception/receipt responses.
- Real server-handler tests separately cover V2 approval signing, unchanged receipt import and tamper rejection, with model/network calls forbidden.
- Browser tests deny paid routes unless explicitly mocked. No live API or physical success is implied by these tests.

## Recorded real-object replay

The private replay uses the owned recordings, manually checked calibration regions, a **synthetic procedure fixture**, and the same tracker/frame adapter/verifier as the application. It does not authenticate a real owner receipt or represent human lesson approval.

| Source | Frames checked | Result |
|---|---:|---|
| video3 | 86 | Bottle transfer verified; fixed plate edge, source lid edge and workspace remain observable throughout the checked window. |
| video2 | 65 | Transfer verified, including nine identity-only frames while the bottle top is clipped. Later the demonstrator covers a chosen fixed reference; verification correctly becomes unavailable. |

Corrected zero-based source timing: video3 endpoint onset 5,400ms, confirmation 5,800ms; video2 onset 8,466ms, confirmation 8,866ms. With all three objects monitored, video2 first loses a fixed reference at source frame 143 (9,533ms); the workspace is subsequently covered too. That is uncertainty, not an invented wrong action or continued green success.

Private artifacts: `.media-lab/local-procedure-replay-v2.json`, `local-procedure-replay-v3.json`, `local-browser-latency*.json`. Source SHA-256 prefixes: video2 `30ff37e6bc15de79`; video3 `75441cf84711a98c`. Calibration regions are human-supplied semantic assertions. They are not automatically inferred identities.

## Performance meaning and limits

Diagnostics separate worker time, endpoint dwell, frame-callback-to-render estimate and onset-to-feedback. Two animation frames provide a software render estimate, not hardware sensor or display latency. Empty measurements are null, not zero.

The initial generated-camera check missed the stricter feedback target. Allocation/sorting work in dense matching was replaced with an equivalent residual histogram; oracle tests assert the same trimmed mean. No candidate, confidence, ambiguity or dwell gate was weakened. The camera fixture was then changed to pre-rendered image blits to avoid unrealistic JavaScript pixel-array allocation competing with the UI. Earlier and later measurements remain separate in the progress record.

This small browser sample cannot establish a population p95 or guarantee the owner's Mac/camera performance. The <=100ms feedback / broader150ms, separate sensor dwell and <=600ms onset target still require the physical acceptance run.

## Remaining acceptance and boundaries

1. Create a fresh lesson in `/teach`; review complete transfers and the actual visible goal. For placement, explicitly select the visible-base point when appropriate. Old Guide receipts require new review rather than reinterpretation.
2. On the owner's Chrome/camera, select a freshly approved lesson and let automatic source matching establish the view. Check fixed object references on a different table; use manual adjustment only as recovery. Confirm correct and wrong order/destination, correction, continuous adjacent actions, reversal/restoration and goal monitoring.
3. Check clipping, obstruction, competing identities, camera movement, pause/resume, actual microphone/voice and pointer/pinch/palm controls. Unavailable evidence must be amber/`needs_verification`, never fabricated red or green.
4. Export diagnostics and assess the separate latency distributions. Do not use the system as a certified hazard-prevention mechanism.
5. A new live Meta acceptance run needs its own model/request notice and reconciled allowance. Earlier historical trial ledgers were not treated as fresh permission to spend during these offline checks.

Current bounded authoring supports four selected objects/references and up to twenty ordered visible transfer steps. Identical/indistinct objects, unseen transitions and hidden contact/force/torque/electrical conditions are unsupported. Source perception can still require clearer evidence or corrected marks. The current private approval import remains bound to its approving owner session; durable cross-session sharing was not loosened as a convenience fix.

## Review of Muse's recorded claims

| Area from CHAT_REQUESTS_AND_WORK.md | Current checked conclusion |
|---|---|
| Earlier live-pass totals | Historical narrative is not acceptance evidence; its correction and existing ledgers remain intact. No earlier trial was relabelled as a new pass. |
| Automatic local Practice | The canonical path now actually consumes ProcedureSpec and calls the shared zone/verifier adapter. Browser tests exercise the default pages, rather than only a disconnected engine. |
| Relationship verification | Earlier relationship data remains on the explicitly labelled legacy path. Box overlap still does not prove contact, containment or closure; no new such claim is made. |
| Shared perception engine | `detections.ts` is still a comparison/statistics helper. Real shared frame ingestion is now `feedTrackingFrame`; acquisition is in the tracking worker. |
| Voice transcript and commands | Browser tests execute actual recorder/Practice control transitions with mocked recognition. Host-denied commands report denial and can be retried; voice cannot verify. Physical microphone and Safari behavior remain unaccepted. |
| Gesture controls | Retained tests load/sample the real self-hosted worker and exercise pinch-to-Pause without passing a step. Physical hand-recognition accuracy remains owner-run. |
| Companion/theme | Existing state resolver is retained, tied to verifier/speech events; its panel is light. It is not a verifier or runtime model. |
| Source analysis and confidence | Local discovery now includes needed stationary supports/destinations and explicit visible surface points, avoiding an assumed centre behind another object. Strict source validation is preserved. New live model output remains unverified. |
| Latency claims | The measured software stages are reported separately below; none is a physical hardware or universal accuracy guarantee. |

The preserved legacy browser tests are explicitly routed to the legacy pages. This protects existing behavior without disguising those tests as evidence for the new canonical path.

## Initial frozen-build results (before reopened UI/control acceptance)

- `npm test`: **466 tests passed across 57 files**.
- `npx tsc --noEmit`, `npm run lint`, `npm run format:check`: passed.
- `STEPLINT_LOCAL_BUILD=1 npm run build`: passed in the isolated build directory.
- `QA_BASE_URL=http://127.0.0.1:3002 npx playwright test`: **30 production browser checks passed**, including the two canonical tests and preserved legacy coverage. Recognition/providers are mocked where stated; the bundled gesture worker startup is real local inference startup.
- `git diff --check`: clean. No environment file or dependency manifest changed; credential-literal scan found no production literals. No local camera device is available in this Codespace.

| Software measurement | Samples | Median | p95 |
|---|---:|---:|---:|
| Worker | 16 | 4.7ms | 16.9ms |
| All emitted-frame feedback estimates | 16 | 35.2ms | 73.9ms |
| Confirmed decision feedback estimates | 4 | 36.9ms | 45.1ms |
| Observed endpoint dwell | 4 | 426.6ms | 467.7ms |
| Observed onset to feedback | 4 | 463.5ms | 502.1ms |

The four confirmed decisions are a small smoke sample (verification, reversal and restorations), not independent physical trials. Observed feedback and total-onset samples are within the 100ms/600ms targets. The configured 400ms dwell measures longer at sampled camera callbacks (p95 about 468ms here); the 200–400ms sensing target is therefore not fully demonstrated. No dwell or evidence gate was reduced to improve the numbers. Physical sensor/display latency remains unmeasured.
