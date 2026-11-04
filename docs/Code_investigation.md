TIME-BOXED 20 MIN. READ-ONLY study; no code changes until I approve. Clone to /tmp/refs,
never run their code, no installs, no paid API calls. License rule: the hackathon bans
code we have no rights to, so extract IDEAS only. Copy no code.
Repos: github.com/meta-models/meta-sam, meta-models/meta-model-cookbook,
dumbspacecookie/openeye, AUsernameForYou/agenthand. Optional README-only: IndustReal, SeeDo.
Run these as PARALLEL SUB-AGENTS, each returning at most 300 words:
A) meta-sam (protocol/sam3.md, conformance/, typescript/packages/parser): box prompts,
   propagation_direction, include_confidence, parser edge cases. Compare to our SAM parser
   and tracking gates.
B) cookbook (02_agent_patterns/04 and 05, 07_sam/03, 06_muse_voice): validated-edit and
   strict-JSON loops, speech<->track alignment. Compare to src/server/teach/audit.ts and
   source-evidence.
C) openeye (verify_step, schemas/, eval/): how uncertain verdicts and sessions are handled.
   Compare to our Practice verdicts.
D) agenthand (meta_client.py, ledger.py, verify.py): single choke point and invariants
   enforced in code. Compare to our spend caps.
For each: what they do, what works (with file:line), flaws to NOTE but not adopt, the
StepLint file it maps to, and effort in minutes.
SYNTHESIS: rank at most 5 changes that could help Practice automatic tracking (setup
failing, lost objects), with the files involved and a 30-minute task each. Then stop and
wait for my approval.

TASK: Parallel Architecture Study of Competing Repos
You are a senior architect studying four public repos to find ideas to fix StepLint's automatic tracking in Practice mode. Use sub-agents to scrape these repos in parallel:

https://github.com/DravenDou/processlens

https://github.com/SRKRz23/apprentice

https://github.com/CacinieP/video2knowledge

https://github.com/meta-models/meta-model-cookbook

Focus Areas:

Tracking Initialization: How does ProcessLens handle SAM 3.1 video uploads and per-concept tracking? Can this be adapted for live webcam? (See their internal/meta and internal/tracking folders).

Deterministic Comparison: How does ProcessLens's Go comparator map observed steps to expected steps? Can we port this logic to TypeScript?

Evidence Playback: How does ProcessLens link a finding to a specific video timestamp? We need this for our Felicity UI.

Progress UI: How does ProcessLens implement /api/progress polling? Can we use this for our long-running SAM calls?

Mock Mode: How does ProcessLens implement a fallback without an API key? We need this for a reliable demo.

Deliverable: Create a report docs/REPO_STUDY.md with:

For each repo: a table of "What they did better," "What they did worse," and "What we can copy."

Specific TypeScript code snippets adapted from their architecture that we can drop into StepLint to fix tracking initialization and add a mock mode.

A recommendation on whether to switch from live webcam tracking to a "record-and-verify" batch mode like ProcessLens (and why we should or should not).

# STEP LINT — COMPETITOR ARCHITECTURE INVESTIGATION & PRACTICE TRACKING RESEARCH

You are conducting a focused engineering research investigation to improve our existing StepLint application.

**This is an architecture investigation, not permission to rewrite the application.**

Our most urgent problem is that the Teach → Practice workflow has not yet worked smoothly end-to-end. In particular, automatic object tracking, object identity preservation, observation consistency, object reacquisition and deterministic step verification need careful investigation.

We want to learn from working engineering approaches in other public repositories, identify what they have figured out that we may have missed, and use those insights to solve our existing problems.

## 1. Repositories to investigate

Inspect these exact public repositories:

1. Focus
   https://github.com/Manuekle/focus

2. MetaRobo
   https://github.com/aboderinsamuel/MetaRobo

3. Video2Knowledge
   https://github.com/Ghiathash/Video2Knowledge

4. Meta Model Cookbook
   https://github.com/meta-models/meta-model-cookbook

Do not limit your research to README files. Inspect the actual implementation, relevant source files, tests, fixtures, documentation, issues and commit history where useful.

If a repository is unavailable, record that fact. Do not invent findings.

## 2. Use parallel subagents

You may launch independent subagents to investigate these repositories simultaneously.

Suggested assignments:

- Agent 1: Focus — SAM 3.1, object tracking, stable identity, masks, frame consistency, video pipeline, caching, recovery and tests.
- Agent 2: MetaRobo — physical-world measurements, simulation, deterministic verification, agentic diagnosis, revision loops and validation.
- Agent 3: Video2Knowledge — speech/video alignment, timestamp handling, frame selection, evidence grounding, checkpoints and verification.
- Agent 4: Meta Model Cookbook — Muse integration, structured outputs, tool calling, bounded agent loops, parallel orchestration, retries and error handling.
- Main agent: Independently inspect StepLint, understand our current implementation and failures, coordinate the subagents, challenge their findings and produce the final comparison.

Subagents must return concrete file paths, function names, code references, implementation explanations and test evidence.

Do not allow agents to make changes to StepLint.

## 3. First inspect our actual StepLint implementation

Before recommending anything, establish the current state of our repository.

Verify:

- Current Git branch.
- Git status and existing uncommitted changes.
- Existing architecture and important documentation.
- Current Teach → Practice execution path.
- Current automatic tracking implementation.
- Current SAM integration.
- Current local tracking implementation.
- Current procedure contracts and object identity handling.
- Current deterministic verifier.
- Current Felicity recovery and orchestration logic.
- Existing test coverage and known failed tests.

Trace the actual implementation through the relevant files, including (but not limited to):

- src/server/teach/
- src/app/api/teach/
- src/app/teach/
- src/practice/
- src/app/api/practice/
- src/app/practice/
- src/procedure/
- src/components/GuideAvatar.tsx

Do not assume these paths or previous documentation are still accurate. Verify them in the current checkout.

Read the existing repair documentation, especially:

- docs/DECISIONS.md
- docs/HANDOFF_NEXT_AGENT.md
- docs/REPAIR_VERIFICATION.md
- docs/ACCURACY_GAPS.md
- docs/PHYSICAL_PRACTICE_REPAIR.md
- docs/TEACH_PRACTICE_REPAIR_BLUEPRINT.md

Also inspect any newer relevant documents.

## 4. Investigate the most important problem: automatic Practice tracking

This is the highest-priority investigation.

Understand exactly how each external repository handles:

### A. Object detection and identity

- How is an object initially identified?
- How does the system retain the same identity across frames?
- Does it use SAM object IDs, masks, bounding boxes, reference images or another mechanism?
- What happens when several objects look similar?
- What happens when the object disappears temporarily?
- How does it avoid accidentally switching to another object?
- How does it reacquire an object after occlusion?
- How does it distinguish an object being absent from an object being outside the camera view?

### B. Continuous tracking

- Does it process every frame or selected frames?
- How does it maintain continuity between observations?
- How are previous masks or tracking results reused?
- Does it use reference frames, temporal windows, cached segmentation or other techniques?
- How does it handle camera movement, lighting changes, rotation, scale changes and partial occlusion?
- What happens when tracking confidence decreases?
- Does it have a recovery mechanism or does it simply fail?

### C. Coordinate consistency

Investigate:

- Original video dimensions versus resized frame dimensions.
- Normalized coordinates versus pixel coordinates.
- Bounding-box geometry.
- Mask geometry.
- Reference points and measurement points.
- Frame timestamps and sampling rates.
- Camera coordinate changes.
- Any transformations between SAM output and local tracking.

We have previously encountered concerns about different measurement points being used across SAM and local tracking. Investigate whether a similar class of problem exists in our implementation.

### D. Physical action verification

- How does each system determine that something actually moved?
- How does it distinguish movement from camera noise?
- How does it determine whether the expected movement occurred?
- Does it use object position, mask changes, geometry, trajectory, simulation or other measurements?
- How does it establish that a step is complete?
- How does it handle ambiguous observations?
- Does it separate visual detection from actual verification?

Find approaches that could help StepLint's deterministic verifier.

## 5. Compare every useful technique against StepLint

For every technique discovered, explain:

1. What the external repository does.
2. Which exact source files and functions implement it.
3. Why the approach works.
4. What problem it solves.
5. Whether StepLint already implements the same idea.
6. If StepLint does, explain what is different or potentially weaker.
7. If StepLint does not, explain whether it would help.
8. How difficult it would be to integrate into our existing architecture.
9. What tests would prove it works.

Do not recommend an approach simply because another repository uses it.

We only want techniques that have credible implementation evidence and are relevant to our problem.

## 6. Investigate mistakes and weaknesses in the external repositories

We want to learn from their successes without inheriting their problems.

Look for:

- Incomplete or experimental features.
- Missing live-camera support.
- Weak object identity guarantees.
- Unhandled edge cases.
- Unreliable model-generated output.
- Poor error handling.
- Excessive API calls.
- Latency problems.
- Memory or performance problems.
- Inadequate test coverage.
- Mock-only tests presented as evidence of real-world reliability.
- Architectural coupling.
- Incorrect assumptions about physical-world verification.

Record these separately.

Do not blindly copy their architecture. A technique can be useful while the overall system has important limitations.

## 7. Examine the Meta Model Cookbook

We need to know whether its engineering patterns can improve Felicity.

Investigate:

- Structured output and schema validation.
- Tool/function calling.
- Bounded agent loops.
- Agent self-correction.
- Retry policies and backoff.
- Parallel execution.
- Context management.
- Prompt caching.
- Error classification.
- How an agent knows when to stop.

Determine how these patterns could make Felicity a genuine coordinating and recovery agent rather than an assistant that merely reports errors.

Felicity must remain evidence-grounded. It can correct a procedure when available transcript, video and visual evidence support the correction. It must never invent an object identity, physical action or observation.

## 8. Our StepLint architectural requirements

Any recommendations must respect these existing principles:

- Keep our existing Muse Spark Open integration through Baseten.
- Do not change our model provider.
- Preserve existing Meta Model API integrations for Muse Voice Transcribe and SAM 3.1.
- Do not switch to Muse Spark 1.3.
- Keep the existing Teach → Review → Approve → Practice architecture where possible.
- The approved procedure revision must be the exact revision loaded by Practice.
- Use consistent coordinate geometry across Teach, tracking and verification.
- Do not weaken confidence thresholds or verification requirements.
- Do not add object-specific hardcoded workarounds.
- Do not fabricate evidence.
- Do not use an LLM as the authority for declaring a physical action successful.
- Deterministic verification remains the only authority that marks a step or final goal as passed.
- Felicity coordinates reasoning and recovery; Gideon communicates with the learner.
- Avoid unnecessary model calls during every camera frame.
- Delayed AI responses must not override newer observations or already-resolved incidents.
- Keep internal technical errors out of the learner's normal experience.

The system should recover automatically when the available evidence permits it. If the evidence genuinely cannot establish what happened, it must communicate that honestly.

## 9. Prioritise findings by impact

Produce three categories:

**P0 — Critical:** Directly addresses our current automatic tracking or Teach → Practice failures.

**P1 — Important:** Improves reliability, recovery, evidence consistency or verification.

**P2 — Future improvements:** Useful but not necessary to solve the current pressing problems.

For every proposed improvement, include:

- The current StepLint file/function affected.
- The external repository and corresponding implementation.
- The exact proposed change.
- Why it is better than our current approach.
- Risks and trade-offs.
- A minimal regression test.
- Whether it can be done without changing our architecture.

## 10. Required final report

Produce a detailed report at:

docs/EXTERNAL_REPO_ARCHITECTURE_RESEARCH.md

The report must contain:

### Section A — Executive findings
What we learned and the most important discoveries.

### Section B — Repository-by-repository analysis
Architecture, implementation, strengths, weaknesses and useful techniques.

### Section C — Side-by-side comparison
Compare Focus, MetaRobo, Video2Knowledge and Meta Model Cookbook against StepLint.

### Section D — Automatic tracking deep dive
Explain how their tracking works, what our current implementation does differently and the most useful potential improvements.

### Section E — Our current mistakes and gaps
Identify specific weaknesses in our code, backed by file/function references and test evidence.

### Section F — Prioritised repair recommendations
P0, P1 and P2, with specific implementation suggestions.

### Section G — What NOT to copy
External architectural weaknesses and techniques that would be inappropriate for StepLint.

### Section H — Recommended implementation sequence
A minimal, low-risk sequence to fix the most important problems first.

### Section I — Evidence and confidence
Clearly distinguish:
- Verified implementation.
- Documented but not independently tested.
- Hypothesis requiring an experiment.
- Unknown or unavailable information.

## 11. Strict execution boundaries

This phase is research and diagnosis only.

- Do not edit existing application source code.
- Do not modify configuration or environment files.
- Do not change model providers.
- Do not change verification thresholds.
- Do not delete or overwrite user work.
- Do not commit, push or deploy.
- Do not make paid model API calls.
- Do not start unnecessary live inference.
- Do not claim physical tracking works based only on mocked tests.
- Do not implement recommendations yet.

You may create the research report specified above after completing the investigation.

At the end, give me a concise summary of the five most important things we should learn from these repositories and the three most urgent improvements to make to StepLint's automatic Practice tracking.

**The objective is not to copy four repositories. The objective is to understand what they have figured out, discover what we are missing, avoid their mistakes and use the strongest proven ideas to finally make StepLint's Teach → Practice workflow work reliably.**