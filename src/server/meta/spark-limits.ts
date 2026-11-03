import "server-only";

export const META_SPARK_COMPLETION_LIMIT = 12_000;
// Baseten counts always-on reasoning and answer tokens together. A real V3
// video draft used 10,673 reasoning tokens at the old 12,000-token limit.
// Reserve bounded headroom for that reasoning plus the complete JSON contract.
// This is a total ceiling, not a supported independent reasoning control.
export const BASETEN_SPARK_COMPLETION_LIMIT = 24_576;
export function sparkCompletionLimit(provider: string): number {
  return provider === "baseten"
    ? BASETEN_SPARK_COMPLETION_LIMIT
    : META_SPARK_COMPLETION_LIMIT;
}
