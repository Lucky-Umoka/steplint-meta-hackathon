import { expect, it, vi } from "vitest";
import { teachV3Fixture } from "./fixtures/teach-v3";
import { repairTargets, parseRepairViews, repairImproves } from "../src/server/teach/felicity-repair";

vi.mock("server-only", () => ({}));

// Bowl video: SAM lost the moved object for longer than any carry may be
// hidden, so no move was measured. Felicity must target exactly that object.
function lostMover() {
  const { context } = teachV3Fixture();
  const lost = structuredClone(context.tracking);
  lost[0].samples = lost[0].samples.filter((s) => s.frame <= 3 || s.frame >= 10); // 600+ ms gap over the move
  for (const s of lost[0].samples) if (s.frame >= 10) s.box = { ...s.box, left: 0.4, right: 0.55 };
  return { context, lost };
}
it("targets an object whose move is lost in a tracking gap, and nothing that is fine", () => {
  const { context, lost } = lostMover();
  expect(repairTargets(context.lesson, context.selections, context.tracking)).toEqual([]);
  const targets = repairTargets(context.lesson, context.selections, lost);
  expect(targets.map((t) => t.id)).toEqual(["component-1"]);
  expect(targets[0].gaps[0].toMs - targets[0].gaps[0].fromMs).toBeGreaterThan(600);
});
it("converts Felicity's views to validated pixel views; invalid or invented views are dropped", () => {
  const { context, lost } = lostMover();
  const targets = repairTargets(context.lesson, context.selections, lost);
  const next = parseRepairViews(
    {
      objects: [
        { id: "component-1", views: [
          { timestampMs: 500, box: { left: 250, top: 300, right: 400, bottom: 650 }, positive: { x: 320, y: 450 } },
          { timestampMs: 700, box: { left: 250, top: 300, right: 400, bottom: 650 }, positive: { x: 900, y: 900 } }, // point outside box
        ] },
        { id: "component-9", views: [{ timestampMs: 500, box: { left: 1, top: 1, right: 50, bottom: 50 }, positive: { x: 10, y: 10 } }] },
      ],
    },
    context.lesson,
    context.selections,
    targets,
  );
  expect(next[0].views).toHaveLength(1);
  expect(next[0].views![0].frame).toBe(5);
  expect(next.find((s) => s.id === "component-9")).toBeUndefined();
});
it("keeps the re-tracked result only when it measures more movement", () => {
  const { context, lost } = lostMover();
  const before = { selections: context.selections, tracking: lost };
  expect(repairImproves(context.lesson, before, { selections: context.selections, tracking: context.tracking })).toBe(true);
  expect(repairImproves(context.lesson, before, before)).toBe(false);
});
