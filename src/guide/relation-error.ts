/** Authored, client-safe evidence failures; never wrap raw provider text here. */
export class RelationEvidenceError extends Error {
  constructor(
    public readonly code:
      | "invalid_relation_plan"
      | "source_evidence_missing"
      | "observation_mismatch",
    message: string,
  ) {
    super(message);
  }
}
