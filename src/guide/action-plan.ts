import { z } from "zod";
import { CompilerOutputSchema } from "./compile";
export const PlannedActionSchema = z.strictObject({
  instruction: z.string().min(1).max(240),
  kind: z.enum(["movement", "separation"]),
  objectId: z.string(),
  anchorId: z.string().nullable(),
  requiredVisibleAfter: z.array(z.string()).max(6),
});
/** A draft may remain uncertain, but cannot silently replace required history with a final pose. */
export function checkPlannedActions(
  input: unknown,
  plan: z.infer<typeof PlannedActionSchema>[],
) {
  const output = CompilerOutputSchema.parse(input);
  let cursor = 0;
  for (const action of plan) {
    const index = output.steps.findIndex(
      (step, index) =>
        index >= cursor &&
        step.objectId === action.objectId &&
        step.anchorId === action.anchorId &&
        step.kind === action.kind,
    );
    if (index < 0)
      throw Error(
        `The draft omitted or changed a required action: ${action.instruction}. No approval was assumed.`,
      );
    const step = output.steps[index];
    if (
      action.requiredVisibleAfter.some(
        (id) => !step.requiredVisibleAfter.includes(id),
      )
    )
      throw Error(
        `The draft omitted a required visible result for: ${action.instruction}.`,
      );
    cursor = index + 1;
  }
}
