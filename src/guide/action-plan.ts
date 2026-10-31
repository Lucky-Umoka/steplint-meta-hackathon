import { z } from "zod";
import { CompilerOutputSchema } from "./compile";
export const PlannedActionSchema = z
  .strictObject({
    instruction: z.string().min(1).max(240),
    kind: z.enum(["movement", "separation"]),
    operation: z.enum(["opening", "removal", "movement"]).optional(),
    objectId: z.string(),
    anchorId: z.string().nullable(),
    requiredVisibleAfter: z.array(z.string()).max(6),
  })
  .superRefine((action, ctx) => {
    if (
      (action.kind === "movement" && action.anchorId !== null) ||
      (action.kind === "separation" &&
        (!action.anchorId || action.anchorId === action.objectId))
    )
      ctx.addIssue({
        code: "custom",
        message: "Action kind and reference do not agree.",
      });
    if (
      (action.operation === "removal" && action.kind !== "separation") ||
      (action.operation === "movement" && action.kind !== "movement")
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Removal requires observed separation; movement uses its own starting position.",
      });
    if (action.operation === "opening" && !action.requiredVisibleAfter.length)
      ctx.addIssue({
        code: "custom",
        message: "Opening must expose a selected visible result.",
      });
  });
/** A draft may remain uncertain, but cannot silently replace required history with a final pose. */
export function checkPlannedActions(
  input: unknown,
  plan: z.infer<typeof PlannedActionSchema>[],
) {
  const output = CompilerOutputSchema.parse(input);
  const checked = z.array(PlannedActionSchema).parse(plan);
  let cursor = 0;
  for (const action of checked) {
    const index = output.steps.findIndex(
      (step, index) =>
        index >= cursor &&
        step.objectId === action.objectId &&
        ((step.anchorId === action.anchorId && step.kind === action.kind) ||
          (action.operation === "opening" &&
            step.kind === "movement" &&
            step.anchorId === null &&
            (!action.anchorId ||
              step.requiredVisibleAfter.includes(action.anchorId))) ||
          (action.operation === "opening" &&
            action.anchorId === null &&
            step.kind === "separation" &&
            !!step.anchorId &&
            action.requiredVisibleAfter.includes(step.anchorId))),
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
