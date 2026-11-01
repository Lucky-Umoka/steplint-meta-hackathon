import { expect, it } from "vitest";
import { demoProcedure } from "../src/procedure/demo";
import { createVerifier, verifyEvents } from "../src/procedure/verifier";
import type { InputEvent } from "../src/procedure/schema";
function observation(
  id: number,
  objectId: string,
  zone: string,
  quality: "observed" | "missing" = "observed",
): InputEvent {
  return {
    type: "observation",
    id: `event-${id}`,
    timestampMs: id,
    observation: {
      id: `observation-${id}`,
      objectId,
      zone: quality === "observed" ? zone : null,
      timestampMs: id,
      quality,
      confidence: quality === "observed" ? 0.99 : null,
      location: null,
      evidence: {
        sourceId: "synthetic-prefix-test",
        timestampMs: id,
        description: "Observed test transition",
      },
    },
  };
}
it("incremental processing equals full replay at every prefix including failure, recovery, duplicates, loss and reset", () => {
  const inputs: InputEvent[] = [
    observation(1, "blue-base", "staging"),
    observation(2, "blue-base", "base-target"),
    observation(3, "red-latch", "staging"),
    observation(4, "red-latch", "latch-closed"),
    observation(5, "yellow-support", "staging"),
    observation(6, "yellow-support", "support-target"),
    observation(7, "red-latch", "staging"),
    observation(8, "red-latch", "latch-closed"),
    observation(8, "red-latch", "latch-closed"),
    observation(9, "blue-base", "base-target", "missing"),
    { type: "reset", id: "reset-10", timestampMs: 10 },
    observation(11, "blue-base", "staging"),
    observation(12, "blue-base", "base-target"),
  ];
  const verifier = createVerifier(demoProcedure);
  for (let i = 0; i < inputs.length; i++)
    expect(verifier.push(inputs[i])).toEqual(
      verifyEvents(demoProcedure, inputs.slice(0, i + 1)),
    );
});
it("returned arrays and step snapshots cannot mutate incremental verifier state", () => {
  const verifier = createVerifier(demoProcedure);
  const snapshot = verifier.push(observation(1, "blue-base", "staging"));
  snapshot.steps[0].status = "passed";
  snapshot.events.pop();
  expect(verifier.snapshot().steps[0].status).not.toBe("passed");
  expect(verifier.snapshot().events).toHaveLength(1);
  expect(Object.isFrozen(verifier.snapshot().events[0])).toBe(true);
});
