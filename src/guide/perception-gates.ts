/** Scene interpretation can block a missing before-state; it can never grant a procedural pass. */
export function needsStartingView(
  phase: "starting" | "in_progress" | "goal" | "no_work_area" | "uncertain",
  hasObservedBaseline: boolean,
) {
  return !hasObservedBaseline && phase !== "starting";
}
