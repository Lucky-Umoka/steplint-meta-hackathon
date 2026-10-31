import { describe, it, expect } from "vitest";
import {
  createRelationSession,
  evaluateRelationWindow,
  recoverRelation,
  type RelationWindow,
} from "../src/guide/relation-evaluator";
import { clearRelation, type RelationPlan } from "../src/guide/relations";
const plan: RelationPlan = {
  title: "Open a container and remove its part",
  goal: "Part outside opened container",
  initialInstruction: "Start closed",
  objects: [
    { id: "component-1", label: "Cover", description: "Container cover" },
    { id: "component-2", label: "Container", description: "Container body" },
    { id: "component-3", label: "Part", description: "Removable part" },
  ],
  steps: [
    {
      id: "open",
      instruction: "Open container",
      explanation: "Expose inside",
      correction: "Close it and open first",
      objectId: "component-1",
      anchorId: "component-2",
      before: "closed",
      after: "open",
      startMs: 0,
      changeMs: 500,
      endMs: 1000,
    },
    {
      id: "remove",
      instruction: "Remove part",
      explanation: "Part leaves container",
      correction: "Return part and open container first",
      objectId: "component-3",
      anchorId: "component-2",
      before: "contained",
      after: "separate",
      startMs: 1000,
      changeMs: 1500,
      endMs: 2000,
    },
  ],
  coverage: [
    { instruction: "Open and remove", status: "included", reason: "Visible" },
  ],
};
const box = { left: 0.1, top: 0.1, right: 0.3, bottom: 0.3 };
function window(stepId: string, start = 0): RelationWindow {
  const step = plan.steps.find((s) => s.id === stepId)!;
  return {
    id: `${stepId}-${start}`,
    epoch: "camera",
    frames: [start, start + 600, start + 1100].map((frame, i) => ({
      frame,
      readings: [
        {
          stepId,
          relation: i ? step.after : step.before,
          visibility: "clear",
          objectBox: box,
          anchorBox: box,
          description: "Visible configuration",
        },
      ],
    })),
    witnesses: [
      {
        stepId,
        objectIdentity: "same",
        anchorIdentity: "same",
        sceneAlignment: "stable",
        contradictingEvidence: false,
        description: "Same distinct parts on a stationary surface",
      },
    ],
  };
}
describe("visible relationship rules", () => {
  it("recognizes a detached cover while rejecting a closed enclosure merely moved", () => {
    const s=createRelationSession(plan,"camera"), w=window("open");
    w.frames[0].readings[0].relation="covering";
    w.frames[1].readings[0].relation="separate";
    w.frames[2].readings[0].relation="separate";
    expect(evaluateRelationWindow(s,w)[0].state).toBe("verified");
    const closed=createRelationSession(plan,"camera"), moved=window("open");
    moved.frames.forEach(f=>{f.readings[0].relation="closed";});
    moved.frames[2].readings[0].objectBox={left:0.7,top:0.1,right:0.9,bottom:0.3};
    expect(evaluateRelationWindow(closed,moved)[0].state).toBe("waiting");
  });
  it("verifies an ordered sequence with an observed baseline for every action", () => {
    const s = createRelationSession(plan, "camera");
    expect(evaluateRelationWindow(s, window("open"))[0].state).toBe("verified");
    const final = window("remove", 1200);
    final.frames.forEach((f) =>
      f.readings.push({ ...window("open").frames[2].readings[0] }),
    );
    expect(evaluateRelationWindow(s, final)[0].state).toBe("verified");
    expect(s.finished).toBe(true);
  });
  it("detects a wrong first action and requires observed restoration before recovery", () => {
    const s = createRelationSession(plan, "camera");
    evaluateRelationWindow(s, window("remove"));
    expect(s.states.remove).toBe("violation");
    expect(recoverRelation(s, window("remove", 1200))).toBe(false);
    const restored = window("remove", 1200);
    restored.frames.forEach((f) => {
      f.readings[0].relation = "contained";
    });
    expect(recoverRelation(s, restored)).toBe(true);
    expect(s.states.remove).toBe("waiting");
    expect(s.finished).toBe(false);
  });
  it.each(["obstructed", "ambiguous", "not_visible"] as const)(
    "does not pass %s endpoint evidence",
    (visibility) => {
      const s = createRelationSession(plan, "camera"),
        w = window("open");
      w.frames[0].readings[0].visibility = visibility;
      evaluateRelationWindow(s, w);
      expect(s.states.open).toBe("needs_verification");
    },
  );
  it.each(["identity", "camera", "contradiction", "missing_after"])(
    "rejects %s",
    (failure) => {
      const s = createRelationSession(plan, "camera"),
        w = window("open");
      if (failure === "identity") w.witnesses[0].objectIdentity = "ambiguous";
      if (failure === "camera") w.witnesses[0].sceneAlignment = "changed";
      if (failure === "contradiction")
        w.witnesses[0].contradictingEvidence = true;
      if (failure === "missing_after")
        w.frames[2].readings[0].relation = "unknown";
      evaluateRelationWindow(s, w);
      expect(s.finished).toBe(false);
      expect(s.states.open).toBe("needs_verification");
    },
  );
  it("does not credit an already completed scene or a moved closed container", () => {
    for (const relation of ["open", "closed"] as const) {
      const s = createRelationSession(plan, "camera"),
        w = window("open");
      w.frames.forEach((f) => {
        f.readings[0].relation = relation;
      });
      evaluateRelationWindow(s, w);
      expect(s.states.open).not.toBe("verified");
    }
  });
  it("never advances on duplicate, stale, or other-camera windows", () => {
    const s = createRelationSession(plan, "camera"),
      w = window("open");
    evaluateRelationWindow(s, w);
    expect(evaluateRelationWindow(s, w)).toEqual([]);
    const next = window("remove", 1200);
    next.epoch = "other";
    expect(evaluateRelationWindow(s, next)).toEqual([]);
    expect(s.finished).toBe(false);
  });
  it("does not credit both transitions from a window that lacks their order", () => {
    const s = createRelationSession(plan, "camera"),
      a = window("open"),
      b = window("remove");
    a.frames.forEach((f, i) => f.readings.push(b.frames[i].readings[0]));
    a.witnesses.push(b.witnesses[0]);
    evaluateRelationWindow(s, a);
    expect(s.states.open).toBe("verified");
    expect(s.states.remove).toBe("violation");
  });
  it("requires a persistent result and bounds elapsed time", () => {
    const s = createRelationSession(plan, "camera"),
      w = window("open");
    w.frames[1].readings[0].relation = "unknown";
    evaluateRelationWindow(s, w);
    expect(s.states.open).toBe("needs_verification");
    const gap = window("open");
    gap.frames[2].frame = 9000;
    expect(() => evaluateRelationWindow(s, gap)).toThrow();
  });
  it("does not infer hidden content from a closed enclosure", () => {
    const r = window("open").frames[0].readings[0];
    r.anchorBox = null;
    expect(clearRelation(r)).toBe(true);
    r.relation = "contained";
    expect(clearRelation(r)).toBe(false);
  });
});
