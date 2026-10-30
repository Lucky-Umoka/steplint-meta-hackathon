# Meta model roles and evaluation record

Researched against official Meta pages on 2026-10-30. These are engineering recommendations, not measured StepLint accuracy. The owner reports access to the hosted model families and future Baseten/Modal capacity. No new model request or hosting deployment was made for this evaluation.

## Current repair

| Model/component | Proposed responsibility | Boundary |
| --- | --- | --- |
| Muse Spark 1.3 (`muse-spark-1.3`) | Interpret demonstrated task/goal, candidate objects/actions and timestamped evidence; draft structured guide; interpret selected Practice scene observations | Validate all output. No model-authored rule changes during Practice and no direct model pass/fail command. |
| Muse Voice Transcribe (`muse-voice-transcribe-1.0`) | Lesson speech and real speech-turn timestamps | Not word timing or speech synthesis. A spoken action is not proof it occurred. |
| SAM 3.1 (`sam-3.1`) | Object localization, masks and recorded-video tracking; bounded Practice grounding/re-localization | Official Responses streaming and parser only. Masks do not establish procedural correctness. Separate requests do not automatically share a persistent live scene identity. |
| Browser tracking | Frequent, bounded appearance/feature/geometry updates between remote observations | Benchmark on actual footage; colour alone is insufficient. Preserve uncertainty, correct coordinates, frame freshness and identity continuity. |
| Deterministic TypeScript evaluator | Order, approved transitions, prerequisites, recovery, goal completion and duplicate protection | Sole procedural authority. A model's confidence or agreement cannot override it. |

Default hosted calls stay in Standard mode. No automatic fallback to another model/version, Contributor mode, heavyweight download or self-hosting is implied by model access. Record model identifiers with analysis artifacts.

## Additional accessible models: candidate roles after the core gate

| Model | Potential StepLint use (proposal) | Evaluation required before adoption |
| --- | --- | --- |
| Muse Spark 1.2/1.1 | Version comparison or explicit migration baseline | Compare identical labelled inputs and structured-output contracts. Older versions are not automatic failure fallbacks. |
| Muse Wonder (`muse-wonder-1.0`) | Deeper offline guide completeness/contradiction review or a difficult drafting comparison | Measure missed steps, invented rules, grounded source references, cost and latency versus Spark. Agentic/coding capability does not establish better physical verification. Human review/evaluator remain mandatory. No Wonder Full API integration is assumed: official pages distinguish subscription-only Muse Code access. |
| Muse Image | Optional clearly labelled instructional illustrations or layout assets | Generated/editable images cannot replace original source evidence, fabricate a demonstrated goal, or become a verification reference without explicit separate review. Draw actual SAM geometry over original frames with code. Exclude generation from the present acceptance path. |
| Muse Voice Transcribe, optional live mode | Later hands-free commands/questions with explicit microphone consent | Validate command intent separately from physical evidence; recording is not always on by default. Model provides transcription, not a speech-to-speech system. |
| Muse Glimmer | Future self-hosted/provider-hosted scene observations, private deployment or domain adaptation | Official release is text+image input/text output, not a hosted Meta Model API video endpoint. Check checkpoint/runtime licensing, memory, cold starts, concurrency, network delay and labelled scene accuracy. Do not assume a 30B model runs inside the browser or fits the owner's MacBook. |
| Muse Spark Open | Future provider-hosted or dedicated multimodal lesson analysis/scene interpretation | Official release is a large mixture-of-experts model; capacity planning must include all weights, not only active parameters. Validate provider input/streaming/structured-output contracts, privacy, license, cost and measured benefit before migration. |

Baseten and Modal are future hosting candidates, not provisioned infrastructure. Actual model/runtime availability, account quotas, GPU configuration and operating costs must be checked when that work is approved. Keep hosted inference behind server-only TypeScript adapters so the application/evaluator does not depend on a specific host. A future inference service is not permission to add another application stack now.

## Model-selection gate

Use the same consented labelled clips and expected outcomes. Compare object identity, localization/track continuity, action interval coverage, unsupported claims, false passes, abstentions, response parsing, latency percentiles and cost. Include changed background/appearance, occlusion and wrong-order cases. No generated reference or model reviewing its own result is independent ground truth. Model combinations are adopted for measured improvements, not to use every available model. Current live-trial approval does not authorize extra model-comparison requests or GPU deployment.

## Official sources

- [Model capabilities and identifiers](https://dev.meta.ai/docs/models)
- [Muse Spark](https://dev.meta.ai/models/muse-spark)
- [Muse Wonder](https://dev.meta.ai/models/muse-wonder)
- [Muse Image](https://dev.meta.ai/models/muse-image)
- [Muse Voice Transcribe](https://dev.meta.ai/models/muse-voice-transcribe) and [speech API capabilities](https://dev.meta.ai/docs/speech-to-text)
- [SAM 3.1](https://dev.meta.ai/models/sam-3-1), [prompting](https://dev.meta.ai/docs/sam/segmenting), [official parser](https://dev.meta.ai/docs/sam/client-libraries)
- [Muse Glimmer](https://dev.meta.ai/docs/muse-glimmer) and [deployment constraints](https://dev.meta.ai/docs/muse-glimmer/deploy)
- [Muse Spark Open](https://dev.meta.ai/docs/muse-spark-open) and [deployment](https://dev.meta.ai/docs/muse-spark-open/deploy)
- [Pricing and rate limits](https://dev.meta.ai/docs/pricing-rate-limits)
