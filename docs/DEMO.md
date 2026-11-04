# StepLint three-minute demonstration runbook

Phase 6, 2026-11-02. This is a runbook, not a recording of physical acceptance. Current results and deployment status are in [PHASE6_ACCEPTANCE.md](PHASE6_ACCEPTANCE.md).

## Prepare before recording

- Use a tested local production build or a deployment explicitly recorded as tested. Do not label localhost as a Vercel deployment.
- Configure the Meta API key and your own Teach creator password privately; unlock Teach before screen recording. Never show `.env.local`, credentials, cookies or provider response dumps.
- Use consented short media within the documented MP4/WAV limits. Keep the real objects, lighting and workbench angle available for Practice. A different table does not imply arbitrary-view support.
- Review every visible step, prerequisite, transition, persistent result and final goal. Unsupported evidence must remain unsupported. Save the approved lesson on the same browser/origin used for the demo.
- Rehearse the exact physical demonstration first. Record failures and uncertainty honestly. Keep a labelled offline generated-camera test available as technical evidence, not as a substitute secretly presented as live video.

## Run of show (180 seconds)

| Time | Show | Explain |
| --- | --- | --- |
| 0:00–0:20 | Expert clip and a short task description | A checklist describes actions; StepLint checks observable evidence of actions. |
| 0:20–0:55 | Teach draft, source start/change/result frames, final goal, explicit review/approval | Meta helps transcribe, perceive and draft. Human approval defines the procedure to practise. If analysis was prepared earlier, say so. |
| 0:55–1:10 | Practice lesson chooser, then selected room | Learners choose before entering. No creator token is needed to practise an approved local lesson. |
| 1:10–1:35 | One actual supported continuous movement | Automatic local observations feed the deterministic verifier; no per-step success button. |
| 1:35–2:05 | A clearly observable wrong-order action or unauthorized reversal, then correction | Show the measured evidence and rule behind the correction. Do not invent a violation from an obscured object. |
| 2:05–2:30 | Restore the allowed state and perform the required transition | Recovery must be verified from fresh evidence; do not skip dependencies. |
| 2:30–2:45 | Brief occlusion/uncertainty | Unknown is not success and is not an invented failure. |
| 2:45–3:00 | Architecture and limits | Meta models draft and perceive (Teach, plus SAM 3.1 camera localization when Practice starts); deterministic TypeScript decides Practice. No safety or arbitrary-task/latency guarantee. |

## If the physical run fails

Show the error/uncertainty and stop the acceptance claim. Do not lower confidence gates, mark hidden actions passed, edit a prerecorded success into a live demonstration, or describe a mocked provider result as a live Meta call. You may separately show passing generated-camera regression tests, labelled as such.

## Manual acceptance record to capture

Record deployment URL or local base, commit/build, browser version, actual device/camera, lesson title, source clip, each action/observation/result, recovery, and measured delays. Include permission denial and leaving the room: camera/microphone indicators should stop. Test actual voice commands and actual gestures separately from mocked command delivery. Confirm the final goal against the real workbench.

The controlled blue-base/yellow-support/red-latch fixture is retained for offline wrong-order/recovery regression tests. It does not replace first-delivery acceptance on the owner's real unmarked objects.
