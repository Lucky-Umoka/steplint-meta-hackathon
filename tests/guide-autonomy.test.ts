import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Box, GuideObservation } from "../src/guide/schema";
import {
  beginGuide,
  createGuideSession,
  feedGuideObservation,
  hasCandidate,
  recoverReturnedObjects,
} from "../src/guide/evaluator";
import { fixture } from "./fixtures/guide";

function box(x: number, y = 0.15): Box {
  return { left: x, top: y, right: x + 0.16, bottom: y + 0.2 };
}
function obs(t: number, cover = 0.1, phone = 0.1, id = "o"): GuideObservation {
  return {
    id: `${id}-${t}`,
    timestampMs: t,
    cameraEpoch: "test",
    objects: [
      { objectId: "cover", quality: "observed", box: box(cover), score: 0.99 },
      {
        objectId: "phone",
        quality: "observed",
        box: box(phone, 0.55),
        score: 0.99,
      },
    ],
  };
}
function hold(
  s: ReturnType<typeof createGuideSession>,
  time: number,
  cover: number,
  phone: number,
) {
  for (let t = time; t <= time + 480; t += 120)
    feedGuideObservation(s, obs(t, cover, phone));
}
beforeEach(() => {
  vi.stubEnv(
    "TEACH_ACCESS_TOKEN",
    "guide-autonomy-test-token-at-least-32-chars",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("No network in unit tests");
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("autonomous local verification without manual checks", () => {
  it("advances a correct action from observations alone", () => {
    const s = createGuideSession(fixture(), "test");
    beginGuide(s, obs(0));
    hold(s, 120, 0.4, 0.1);
    expect(s.steps["remove-cover"]).toBe("verified");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("emits a confirmed violation for a wrong-order action automatically", () => {
    const s = createGuideSession(fixture(), "test");
    beginGuide(s, obs(0));
    hold(s, 120, 0.1, 0.4);
    expect(s.steps["remove-phone"]).toBe("violation");
    expect(
      s.events.some(
        (e) => e.kind === "violation" && e.stepId === "remove-phone",
      ),
    ).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps a forming candidate provisional until evidence suffices", () => {
    const s = createGuideSession(fixture(), "test");
    beginGuide(s, obs(0));
    expect(hasCandidate(s)).toBeNull();
    feedGuideObservation(s, obs(120, 0.4, 0.1));
    expect(hasCandidate(s)).toBe("remove-cover");
    expect(
      s.events.some((e) => e.kind === "verified" || e.kind === "violation"),
    ).toBe(false);
    hold(s, 240, 0.4, 0.1);
    expect(s.steps["remove-cover"]).toBe("verified");
    expect(hasCandidate(s)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("recovers automatically after a valid correction with no retry click", () => {
    const s = createGuideSession(fixture(), "test");
    beginGuide(s, obs(0));
    const tick = (t: number, cover: number, phone: number) => {
      const o = obs(t, cover, phone);
      recoverReturnedObjects(s, o);
      feedGuideObservation(s, o);
    };
    for (let t = 120; t <= 600; t += 120) tick(t, 0.1, 0.4);
    expect(s.steps["remove-phone"]).toBe("violation");
    for (let t = 720; t <= 1200; t += 120) tick(t, 0.1, 0.1);
    expect(s.steps["remove-phone"]).not.toBe("violation");
    for (let t = 1320; t <= 1800; t += 120) tick(t, 0.4, 0.1);
    expect(s.steps["remove-cover"]).toBe("verified");
    expect(fetch).not.toHaveBeenCalled();
  });
});
