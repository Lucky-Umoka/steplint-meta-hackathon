import { z } from "zod";

export const RevisionSchema = z.string().regex(/^[0-9a-f]{64}$/);
/**
 * Rehearsal outcome bound to one executable revision. `passed` and `failed`
 * come only from the canonical Practice verifier's evaluation status during a
 * rehearsal of exactly that revision; loading a lesson, opening a tab or
 * rendering a checklist never sets them. This is a browser-reported creator
 * rehearsal, never physical acceptance.
 */
export const RehearsalSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("not_run") }),
  z.strictObject({
    status: z.enum(["passed", "failed"]),
    revision: RevisionSchema,
    atMs: z.number().int().nonnegative(),
    /** A passed rehearsal that needed a correction after a verifier failure. */
    hadViolations: z.boolean(),
    source: z.literal("browser_rehearsal"),
  }),
]);
export type Rehearsal = z.infer<typeof RehearsalSchema>;

export const rehearsalKey = (lessonId: string) =>
  `steplint-rehearsal-result:${lessonId}`;

/**
 * Next rehearsal record for a verifier status. Returns null when the status is
 * not terminal, so nothing is recorded for loading or in-progress practice. A
 * failure is never overwritten except by a later verifier pass, which keeps
 * `hadViolations: true`.
 */
export function nextRehearsal(
  previous: Rehearsal | null,
  status: string | undefined,
  revision: string,
  nowMs: number,
): Rehearsal | null {
  if (status !== "passed" && status !== "failed") return null;
  const priorFailed =
    previous?.status !== "not_run" &&
    !!previous &&
    previous.revision === revision &&
    (previous.status === "failed" || previous.hadViolations);
  return {
    status,
    revision,
    atMs: nowMs,
    hadViolations: status === "failed" || priorFailed,
    source: "browser_rehearsal",
  };
}

/** Rehearsal evidence applies only to the identical executable revision. */
export function bindRehearsal(
  claimed: unknown,
  revision: string,
): Rehearsal {
  const parsed = RehearsalSchema.safeParse(claimed);
  if (!parsed.success || parsed.data.status === "not_run")
    return { status: "not_run" };
  return parsed.data.revision === revision
    ? parsed.data
    : { status: "not_run" };
}
