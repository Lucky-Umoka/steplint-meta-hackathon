# Planned three-minute judging demo

This is a presentation plan, not a claim that the complete demo features exist. The Phase 1 foundation and bounded Spark/SAM live smoke tests are documented in [PHASE1.md](PHASE1.md); Teach mode, Practice mode, and procedural evaluation remain unimplemented.

## Run of show

1. **Problem (about 20 seconds):** Written steps can explain a procedure without checking what a learner actually did.
2. **Teach (about 40 seconds):** Show the expert recording or supplying the controlled demonstration, then the evidence-grounded draft, its editable steps and prerequisites, and explicit human approval. Do not imply this is complete until it works.
3. **Incorrect practice (about 45 seconds):** Show the learner attempting to close the red latch before installing the yellow support. Make the actual captured evidence visible.
4. **Warning and recovery (about 35 seconds):** Show the evaluator's warning naming the missing prerequisite and a concise corrective instruction. If evidence is insufficient, show `needs_verification`, not a fabricated verdict.
5. **Correction (about 30 seconds):** Install the yellow support, then close the red latch; show evidence and the evaluator's result for the corrected sequence.
6. **Technical contribution and limits (about 30 seconds):** Explain which verified Meta models contributed to perception/transcription/draft interpretation and how deterministic TypeScript rules made the procedural decision. Muse Code is the coding agent, not a runtime model; its use does not establish application integration. State measured limits and known uncertainties honestly.

Adjust timing to stay within three minutes; preserve the end-to-end wrong-action → evidence-based warning → correction proof.

## Evidence required before describing a feature as working

- [ ] The feature is present in the repository and can be run from documented, validated instructions.
- [ ] Relevant automated tests pass; identify mocked tests as mocks.
- [ ] Any claimed live Meta integration has a successful, bounded real request and validated response. Record model, date, and test outcome without exposing credentials.
- [ ] Any browser/media claim has a manual check and recorded MIME type/codec/size as relevant.
- [ ] The wrong-order scenario shows the actual supporting evidence and deterministic evaluator result.
- [ ] The correction is re-evaluated and passes only the defined evidence-backed conditions.
- [ ] Ambiguous, missing, or obstructed evidence does not produce unsupported success.
- [ ] Consent, permissions, visible recording state, error handling, and limitations are explained accurately.
- [ ] No benchmark, accuracy, safety, deployment, or model capability is claimed without evidence.

## Honest limitations

Do not present StepLint as certified safety equipment, a medical device, guaranteed repair authority, or a substitute for professional judgment. A controlled fixture does not establish accuracy on arbitrary tasks. Clearly distinguish planned behavior, mocked tests, real API calls, manual checks, and unrun checks.
