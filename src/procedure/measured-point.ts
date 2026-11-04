import type { ProcedureSpec } from "./schema";

type Box = { left: number; top: number; right: number; bottom: number };
export type MeasuredPoint = "center" | "bottom_center";

/**
 * One meaning of "where an object is" per object, shared by step verification,
 * zone suggestions, approval and the final goal (paid run 16 root cause: the
 * goal and approval used the box centre while steps used their own point).
 * An object's point is the point of its approved steps (the procedure schema
 * requires one point per object); objects without steps use the box centre.
 */
export function objectPoint(
  procedure: Pick<ProcedureSpec, "steps">,
  objectId: string,
): MeasuredPoint {
  return (
    procedure.steps.find((step) => step.condition.componentId === objectId)
      ?.measurement?.point ?? "center"
  );
}
export function measuredPoint(box: Box, point: MeasuredPoint) {
  return {
    x: (box.left + box.right) / 2,
    y: point === "bottom_center" ? box.bottom : (box.top + box.bottom) / 2,
  };
}
