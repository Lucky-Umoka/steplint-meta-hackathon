import { ProcedureSpecSchema } from "./schema";

// Hand-authored controlled fixture, not compiled from or approved for a real lesson.
// Source times and reviewer are synthetic test data.
const source = (timestampMs: number) => ({
  sourceId: "synthetic-teaching-lesson", timestampMs, description: "Synthetic demo lesson reference",
});
const transition = (componentId: string, toZone: string) => ({
  kind: "enters_zone" as const, componentId, fromZone: "staging", toZone, minimumConfidence: 0.9,
});
const recovery = (instruction: string, timestampMs: number) => ({ instruction, source: source(timestampMs) });

export const demoProcedure = ProcedureSpecSchema.parse({
  id: "blue-yellow-red-demo", version: 1, title: "Controlled three-component assembly",
  approval: { reviewer: "synthetic-fixture-reviewer", timestampMs: 0 },
  components: [
    { id: "blue-base", description: "Blue base" },
    { id: "yellow-support", description: "Yellow support" },
    { id: "red-latch", description: "Red latch" },
  ],
  zones: [
    { id: "staging", description: "Known starting position; for latch, the open position" },
    { id: "base-target", description: "Base placement target" },
    { id: "support-target", description: "Support installation target on the base" },
    { id: "latch-closed", description: "Controlled latch closed-position target" },
  ],
  steps: [
    {
      id: "place-base", description: "Place the blue base.", prerequisites: [],
      condition: transition("blue-base", "base-target"), forbiddenTransitions: [],
      recovery: recovery("Return the base to staging, then place it in the base target.", 1000), source: source(1000),
    },
    {
      id: "install-support", description: "Install the yellow support.", prerequisites: ["place-base"],
      condition: transition("yellow-support", "support-target"), forbiddenTransitions: [],
      recovery: recovery("Verify the base, then move the support from staging into its target.", 4000), source: source(4000),
    },
    {
      id: "close-latch", description: "Close the red latch.", prerequisites: ["install-support"],
      condition: transition("red-latch", "latch-closed"),
      forbiddenTransitions: [{
        condition: transition("red-latch", "latch-closed"), unlessVerified: ["install-support"],
        recovery: recovery("Reopen the latch. Verify the base and support, then close the latch again.", 7000),
      }],
      recovery: recovery("Reopen the latch. Verify the base and support, then close the latch again.", 7000), source: source(7000),
    },
  ],
});
