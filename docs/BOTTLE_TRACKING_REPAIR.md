# Bottle tracking / Baseten approval investigation — 2026-11-02

Owner reported an unapprovable bottle lesson whose model coverage reason described a static whole-frame component outline across frames 0–269. Two owner-authorized parallel Luna audits independently traced the default Teach path. No UI or Practice engine changes were made.

## Confirmed code defects and evidence limits

The final draft receives bounded transcript/tracking JSON through Baseten Chat Completions at the exact hackathon endpoint/model. Discovery and SAM remain Meta operations. The natural-language unsupported reason is model-generated; `Unsupported required work cannot be approved` is the deterministic approval guard and must remain.

`summarizeTracking` accepted any nonempty SAM mask with an in-bounds box, including a constant whole-frame box. It counted mask pixels but ignored the foreground's actual extent. Thus a provider mask canvas/envelope could become the object's constant centre in the Spark evidence. Separately, automatic discovery accepted whole-scene proposals as object seeds. These defects are confirmed in code and reproduced with synthetic regression evidence. The incident's original raw masks/seed were not supplied, so whether its mask was a full-frame envelope or actual background segmentation remains unconfirmed.

## Repair

- New `src/server/teach/mask-geometry.ts` decodes foreground pixels and maps their tight extent through the mask's own source-pixel bounds.
- `src/server/teach/pipeline.ts` uses that measured foreground extent when the returned box covers the frame, retaining ordinary localized boxes and existing provider confidence policy. A truly scene-wide mask is excluded from object evidence; a selected object with no usable outline stops analysis before drafting with a corrective message. Stationary localized references remain valid; motion is never invented.
- `src/server/teach/discovery.ts` rejects an exact whole-scene automatic proposal before it becomes a SAM seed.
- `tests/teach-mask-geometry.test.ts` exercises the actual summary→draft-input path for moving foreground under static envelopes, stationary localized references, whole-scene masks, source-bound projection, and whole-scene discovery rejection. Only codec bytes are mocked in these geometry cases.

No confidence threshold was lowered, unsupported requirements were not changed to covered, and no approved artifact or Practice rule was rewritten. Existing failed drafts contain old evidence and must be regenerated from the original recording to use the repair. A genuinely unsupported/occluded task still cannot be approved.

## Verification

- Initial affected-path tests: 76 passed.
- Full `npm test`: 507 passed / 64 files (59.60s), including the first three new regressions.
- Final focused geometry tests: 5 passed (803ms), including seed and source-bound checks added after the full run.
- `npx tsc --noEmit`: passed; final scoped TypeScript check passed.
- `npm run lint`: 0 errors / 5 existing warnings. Scoped changed-code lint clean.
- `npm run build`: exit 0.
- No physical-camera, original-recording replay or hosted deployment acceptance is claimed.

## Paid Baseten follow-up

The owner explicitly approved three additional Baseten requests after the earlier two-call allowance was exhausted. Notice named the model, synthetic evidence, 6000-token cap/request, no retries/fallback. Calls use `sparkStructured`, the final compiler's JSON schema, and `parseSparkDraft` semantic validation. Cases: measured movement, static full-scene evidence, and a continuous red-bottle transfer with measured geometry. These are synthetic draft checks, not live SAM analysis of the owner's clip. Sanitized results: `.media-lab/baseten-outline/three-call-results.json`. Final outcomes appended below.

Three paid requests completed with no retries: measured-object draft passed schema and semantic validation and marked its transfer covered (13,339ms, 3428 output tokens); static-scene draft passed validation and correctly marked the goal unsupported (15,863ms, 4150 output tokens); continuous-bottle draft failed schema validation (12,228ms) and was not approved. No raw output or credential was logged. The failed response's detailed schema paths were not retained, so no field-specific diagnosis is invented. Baseten transport/model availability is demonstrated; reliable drafting for the original bottle clip and arbitrary task accuracy remain unaccepted. No fourth call was made.
