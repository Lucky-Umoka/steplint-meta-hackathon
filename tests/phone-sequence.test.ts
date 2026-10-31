/** Synthetic observations for the owner's four-action scope; never claimed as Meta output or camera accuracy. */
import { expect, it } from "vitest";
import {
  GuideSchema,
  type GuideObservation,
  type Box,
} from "../src/guide/schema";
import {
  beginGuide,
  createGuideSession,
  feedGuideObservation,
  retryGuide,
} from "../src/guide/evaluator";
import { fixture } from "./fixtures/guide";
const rect = (x: number, y: number, w = 0.2, h = 0.2): Box => ({
  left: x,
  top: y,
  right: x + w,
  bottom: y + h,
});
const initial = {
  cover: rect(0.1, 0.5),
  tray: rect(0.1, 0.5),
  phone: rect(0.12, 0.52, 0.16, 0.16),
  lid: rect(0.6, 0.5),
  rack: rect(0.6, 0.5),
  tool: rect(0.66, 0.52, 0.04, 0.13),
};
type Pose = typeof initial;
function guide() {
  const base = fixture(),
    image = base.images[0].image;
  const definitions = [
    {
      id: "open-package",
      instruction: "Open the package",
      objectId: "cover",
      anchorId: null,
      kind: "movement" as const,
      requiredVisibleAfter: ["tray", "phone"],
    },
    {
      id: "open-case",
      instruction: "Open the tool case",
      objectId: "lid",
      anchorId: "rack",
      kind: "separation" as const,
      requiredVisibleAfter: ["rack", "tool"],
    },
    {
      id: "take-tool",
      instruction: "Take the screwdriver",
      objectId: "tool",
      anchorId: "rack",
      kind: "separation" as const,
      requiredVisibleAfter: [],
    },
    {
      id: "remove-phone",
      instruction: "Remove the phone",
      objectId: "phone",
      anchorId: "tray",
      kind: "separation" as const,
      requiredVisibleAfter: ["tray", "phone"],
    },
  ];
  return GuideSchema.parse({
    ...base,
    title: "SYNTHETIC four-action phone workflow",
    objects: Object.entries(initial).map(([id, box]) => ({
      id,
      label: id,
      description: id,
      initiallyVisible: !["phone", "tray"].includes(id),
      sourceFrame: 0,
      sourceBox: box,
      appearance: null,
    })),
    steps: definitions.map((definition, index) => ({
      id: definition.id,
      instruction: definition.instruction,
      explanation: "Controlled observable transition",
      correction: `Restore the starting state and complete the preceding steps before ${definition.id}.`,
      prerequisites: index ? [definitions[index - 1].id] : [],
      condition: {
        kind: definition.kind,
        objectId: definition.objectId,
        anchorId: definition.anchorId,
        minimumChange: 0.4,
        requiredVisibleAfter: definition.requiredVisibleAfter,
      },
      evidence: {
        startFrame: index * 5,
        changeFrame: index * 5 + 2,
        endFrame: index * 5 + 4,
        startMs: index * 500,
        endMs: index * 500 + 400,
        turnIds: [0],
      },
      uncertainties: [],
      supported: true,
    })),
    source: {
      ...base.source,
      transcript: {
        ...base.source.transcript,
        text: "Open the package, open the case, take the tool, remove the phone.",
        turns: [
          {
            startMs: 0,
            endMs: 2000,
            text: "Open the package, open the case, take the tool, remove the phone.",
          },
        ],
      },
    },
    images: Array.from({ length: 21 }, (_, frame) => ({ frame, image })),
    goalFrame: 20,
    goalStepIds: ["remove-phone"],
  });
}
function observation(
  at: number,
  pose: Pose,
  unavailable: string[] = [],
): GuideObservation {
  return {
    id: `phone-${at}`,
    timestampMs: at,
    cameraEpoch: "phone-test",
    objects: Object.entries(pose).map(([objectId, box]) => ({
      objectId,
      quality: unavailable.includes(objectId) ? "obstructed" : "observed",
      box: unavailable.includes(objectId) ? null : box,
      score: unavailable.includes(objectId) ? null : 0.99,
    })),
  };
}
function hold(
  session: ReturnType<typeof createGuideSession>,
  at: number,
  pose: Pose,
  unavailable: string[] = [],
) {
  for (let delta = 0; delta <= 480; delta += 120)
    feedGuideObservation(session, observation(at + delta, pose, unavailable));
}
const packageOpen = { ...initial, cover: rect(0.55, 0.05) };
const caseOpen = { ...packageOpen, lid: rect(0.6, 0.1) };
const toolTaken = { ...caseOpen, tool: rect(0.45, 0.15, 0.04, 0.13) };
const phoneRemoved = { ...toolTaken, phone: rect(0.65, 0.35, 0.16, 0.16) };
function start() {
  const session = createGuideSession(guide(), "phone-test");
  beginGuide(session, observation(0, initial, ["phone", "tray"]));
  return session;
}
function prepare(session: ReturnType<typeof createGuideSession>) {
  hold(session, 100, packageOpen);
  hold(session, 700, caseOpen);
  hold(session, 1300, toolTaken);
}
it("requires all four observed actions and the held final result before completion", () => {
  const session = start();
  prepare(session);
  expect(session.finished).toBe(false);
  hold(session, 1900, phoneRemoved);
  hold(session, 2500, phoneRemoved);
  expect(session.finished).toBe(true);
  expect(
    session.events
      .filter((event) => event.kind === "verified")
      .map((event) => event.stepId),
  ).toEqual(["open-package", "open-case", "take-tool", "remove-phone"]);
  expect(
    session.events.filter((event) => event.kind === "complete"),
  ).toHaveLength(1);
});
it("rejects phone removal after package opening when the case/tool steps were skipped", () => {
  const session = start();
  hold(session, 100, packageOpen);
  const premature = { ...packageOpen, phone: phoneRemoved.phone };
  hold(session, 700, premature);
  hold(session, 1300, premature);
  expect(session.steps["remove-phone"]).toBe("violation");
  expect(session.finished).toBe(false);
  expect(
    session.events.filter(
      (event) => event.kind === "violation" && event.stepId === "remove-phone",
    ),
  ).toHaveLength(1);
});
it("does not turn obstruction and a pre-existing outside-phone pose into completed history", () => {
  const session = start();
  prepare(session);
  hold(session, 1900, phoneRemoved, ["phone"]);
  hold(session, 2500, phoneRemoved);
  hold(session, 3100, phoneRemoved);
  expect(session.steps["remove-phone"]).not.toBe("verified");
  expect(session.finished).toBe(false);
});
it("retries from a fresh visible before-state while preserving verified prerequisites", () => {
  const session = start();
  prepare(session);
  feedGuideObservation(session, observation(1900, phoneRemoved, ["phone"]));
  retryGuide(session, 1950);
  expect(session.running).toBe(false);
  beginGuide(session, observation(2000, toolTaken));
  hold(session, 2100, phoneRemoved);
  hold(session, 2700, phoneRemoved);
  expect(session.finished).toBe(true);
  expect(
    session.events.filter((event) => event.kind === "verified"),
  ).toHaveLength(4);
});
it("cannot verify removal while its tray reference is missing", () => {
  const session = start();
  prepare(session);
  hold(session, 1900, phoneRemoved, ["tray"]);
  expect(session.steps["remove-phone"]).toBe("uncertain");
  expect(session.finished).toBe(false);
});
