import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GuideSchema,
  guideBlockers,
  type GuideObservation,
  type Box,
} from "../src/guide/schema";
import {
  beginGuide,
  createGuideSession,
  feedGuideObservation,
  shouldAutoStart,
  recoverReturnedObjects,
  changeMetric,
} from "../src/guide/evaluator";
import { canonical, newRevision } from "../src/guide/versioning";
import {
  stampGuide,
  verifyArtifact,
  openPerceptionSession,
  acquirePerception,
} from "../src/server/guide/security";
import { groundAppearance, trackAppearance } from "../src/practice/appearance";
import type { Pixels } from "../src/practice/tracker";
vi.mock("server-only", () => ({}));
import { fixture } from "./fixtures/guide";

function box(x: number, y = 0.15): Box {
  return { left: x, top: y, right: x + 0.16, bottom: y + 0.2 };
}
function obs(
  t: number,
  cover = 0.1,
  phone = 0.1,
  missing: string | null = null,
): GuideObservation {
  return {
    id: `o-${t}`,
    timestampMs: t,
    cameraEpoch: "test",
    objects: [
      {
        objectId: "cover",
        quality: missing === "cover" ? "obstructed" : "observed",
        box: missing === "cover" ? null : box(cover),
        score: missing === "cover" ? null : 0.99,
      },
      {
        objectId: "phone",
        quality: missing === "phone" ? "missing" : "observed",
        box: missing === "phone" ? null : box(phone, 0.55),
        score: missing === "phone" ? null : 0.99,
      },
    ],
  };
}
function hold(
  s: ReturnType<typeof createGuideSession>,
  time: number,
  cover: number,
  phone: number,
  missing: string | null = null,
) {
  for (let t = time; t <= time + 480; t += 120)
    feedGuideObservation(s, obs(t, cover, phone, missing));
}
beforeEach(() => {
  vi.stubEnv(
    "TEACH_ACCESS_TOKEN",
    "guide-test-token-at-least-32-characters-only",
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
describe("versioned guide contracts", () => {
  it("permits repeated object actions while validating order and real frame times", () => {
    const g = fixture();
    g.steps[1].condition.objectId = "cover";
    expect(GuideSchema.parse(g).steps).toHaveLength(2);
    g.steps[1].prerequisites = ["remove-phone"];
    expect(() => GuideSchema.parse(g)).toThrow();
  });
  it("blocks malformed, incomplete and unsupported guides", () => {
    const g = fixture();
    g.steps[0].supported = false;
    g.coverage[0].status = "unresolved";
    g.images = [];
    expect(guideBlockers(g).length).toBeGreaterThan(2);
    g.steps[0].evidence.startMs = 2;
    expect(() => GuideSchema.parse(g)).toThrow();
  });
  it("creates an unapproved revision without changing the original", () => {
    const g = fixture(),
      v = newRevision(g);
    expect(v.revision).toBe(2);
    expect(v.parentRevision).toBe(1);
    expect(v.approval).toBeNull();
    expect(g.revision).toBe(1);
  });
  it("canonicalizes keys and verifies unchanged receipts outside creator sessions", () => {
    expect(canonical({ b: 1, a: 2 })).toBe(canonical({ a: 2, b: 1 }));
    const a = stampGuide(
      { ...fixture(), approval: null },
      "Test reviewer",
      "published",
    );
    expect(verifyArtifact(JSON.parse(JSON.stringify(a)))).toEqual(a);
    a.guide.steps[0].condition.minimumChange = 0.2;
    expect(() => verifyArtifact(a)).toThrow("changed");
  });
  it("bounds practice sessions, prevents overlapping checks and never retries", () => {
    const a = stampGuide(
        { ...fixture(), id: crypto.randomUUID(), approval: null },
        "Test reviewer",
        "published",
      ),
      s = openPerceptionSession(a);
    for (let i = 0; i < 3; i++) {
      const check = acquirePerception(s.token);
      expect(() => acquirePerception(s.token)).toThrow("already");
      check.charge();
      check.charge();
      check.release();
    }
    expect(() => acquirePerception(s.token)).toThrow("limit");
    expect(fetch).not.toHaveBeenCalled();
  });
});
describe("deterministic setup and action loop", () => {
  it("does not score setup, object presence or an already-completed looking scene", () => {
    const g = fixture(),
      s = createGuideSession(g, "test");
    hold(s, 0, 0.5, 0.5);
    expect(s.events).toHaveLength(0);
    expect(shouldAutoStart(g, obs(0), obs(120))).toBe(false);
    expect(
      shouldAutoStart(g, obs(0), { ...obs(700, 0.5), cameraEpoch: "another" }),
    ).toBe(false);
  });
  it("supports explicit Ready, correct order and a fresh next-step baseline", () => {
    const s = createGuideSession(fixture(), "test");
    beginGuide(s, obs(0));
    hold(s, 120, 0.4, 0.1);
    expect(s.steps["remove-cover"]).toBe("verified");
    hold(s, 720, 0.4, 0.4);
    hold(s, 1320, 0.4, 0.4);
    expect(s.finished).toBe(true);
  });
  it("can auto-start with a retained before state, scoring its first action exactly once", () => {
    const g = fixture(),
      s = createGuideSession(g, "test"),
      before = obs(0);
    expect(shouldAutoStart(g, before, obs(120, 0.4))).toBe(true);
    expect(beginGuide(s, before, true)).toBe(true);
    expect(beginGuide(s, before, false)).toBe(false);
    hold(s, 120, 0.4, 0.1);
    feedGuideObservation(s, obs(600, 0.4));
    expect(s.events.filter((e) => e.kind === "started")).toHaveLength(1);
    expect(s.events.filter((e) => e.kind === "verified")).toHaveLength(1);
  });
  it("observes premature task actions and requires restoration before recovery", () => {
    const s = createGuideSession(fixture(), "test");
    beginGuide(s, obs(0));
    hold(s, 120, 0.1, 0.4);
    expect(s.steps["remove-phone"]).toBe("violation");
    hold(s, 720, 0.4, 0.4);
    hold(s, 1320, 0.4, 0.4);
    expect(s.finished).toBe(false);
    expect(recoverReturnedObjects(s, obs(1300, 0.4, 0.4))).toHaveLength(0);
    expect(recoverReturnedObjects(s, obs(1420, 0.4, 0.1))).toHaveLength(1);
    hold(s, 1540, 0.4, 0.1);
    hold(s, 2140, 0.4, 0.4);
    hold(s, 2740, 0.4, 0.4);
    expect(s.finished).toBe(true);
  });
  it("unknown/occluded evidence never completes a transition or counts reacquisition alone", () => {
    const s = createGuideSession(fixture(), "test");
    beginGuide(s, obs(0));
    hold(s, 120, 0.1, 0.1, "cover");
    hold(s, 720, 0.4, 0.1);
    expect(s.steps["remove-cover"]).not.toBe("verified");
  });
  it("objects expected inside packaging do not prevent initial Ready", () => {
    const s = createGuideSession(fixture(), "test");
    expect(beginGuide(s, obs(0, 0.1, 0.1, "phone"))).toBe(true);
    hold(s, 120, 0.4, 0.1, "phone");
    expect(s.steps["remove-cover"]).toBe("verified");
    expect(s.steps["remove-phone"]).not.toBe("verified");
    expect(s.events.some((e) => e.kind === "violation")).toBe(false);
  });
  it("rejects duplicate, stale and wrong-camera evidence", () => {
    const s = createGuideSession(fixture(), "test");
    beginGuide(s, obs(0));
    feedGuideObservation(s, obs(100, 0.4));
    for (let i = 0; i < 6; i++) feedGuideObservation(s, obs(100, 0.4));
    feedGuideObservation(s, { ...obs(800, 0.4), cameraEpoch: "old" });
    expect(s.steps["remove-cover"]).not.toBe("verified");
  });
  it("requires stable observations rather than transient movement", () => {
    const s = createGuideSession(fixture(), "test");
    beginGuide(s, obs(0));
    feedGuideObservation(s, obs(100, 0.4));
    hold(s, 220, 0.1, 0.1);
    expect(s.steps["remove-cover"]).not.toBe("verified");
  });
  it("uses relative anchor geometry and abstains if the anchor is missing", () => {
    const step = fixture().steps[0];
    step.condition = {
      ...step.condition,
      kind: "separation",
      anchorId: "phone",
    };
    expect(changeMetric(step, obs(0), obs(120, 0.6))).toBeGreaterThan(0.1);
    expect(changeMetric(step, obs(0), obs(120, 0.6, 0.1, "phone"))).toBeNull();
  });
});
function texture(dx = 0, hidden = false): Pixels {
  const width = 120,
    height = 90,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      let v = 60;
      if (!hidden && x >= 25 + dx && x < 65 + dx && y >= 25 && y < 65) {
        let hash = Math.imul(x - dx, 0x45d9f3b) ^ Math.imul(y, 0x119de1f3);
        hash ^= hash >>> 16;
        v = ((hash >>> 0) % 190) + 50;
      }
      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = 255;
    }
  return { width, height, data };
}
describe("appearance tracking independent of hue", () => {
  it("grounds a textured neutral object without any colour sample", () => {
    const a = texture(),
      track = groundAppearance(a, "phone", {
        left: 25 / 120,
        top: 25 / 90,
        right: 65 / 120,
        bottom: 65 / 90,
      });
    const b = trackAppearance(texture(4), track);
    expect(b.quality).toBe("observed");
    expect(b.box!.left).toBeCloseTo(29 / 120, 2);
  });
  it("abstains on obstruction and refuses to learn the replacement background", () => {
    const track = groundAppearance(texture(), "phone", {
      left: 25 / 120,
      top: 25 / 90,
      right: 65 / 120,
      bottom: 65 / 90,
    });
    expect(trackAppearance(texture(0, true), track).quality).not.toBe(
      "observed",
    );
    expect(trackAppearance(texture(), track).quality).not.toBe("observed");
  });
});

it("does not complete until the approved final goal holds, even after all actions were verified", () => {
  const s = createGuideSession(fixture(), "test");
  beginGuide(s, obs(0));
  hold(s, 120, 0.4, 0.1);
  hold(s, 720, 0.4, 0.4);
  expect(s.steps["remove-phone"]).toBe("verified");
  expect(s.finished).toBe(false);
  hold(s, 1320, 0.4, 0.1);
  expect(s.finished).toBe(false);
  hold(s, 1920, 0.4, 0.4);
  expect(s.finished).toBe(true);
});

it("validates saved rehearsal outcomes and revision identity before showing the library", async () => {
  const { parseSavedGuide, guideKey } = await import("../src/guide/storage");
  const artifact = { guide: fixture(), receipt: "synthetic receipt" };
  const row = {
    key: guideKey(artifact),
    artifact,
    savedAt: 1,
    rehearsal: null,
  };
  expect(parseSavedGuide(row).savedAt).toBe(1);
  expect(() =>
    parseSavedGuide({ ...row, rehearsal: { at: 1, passed: "yes", events: 1 } }),
  ).toThrow("damaged");
  expect(() => parseSavedGuide({ ...row, key: "wrong-revision" })).toThrow(
    "revision",
  );
  expect(() => parseSavedGuide({ ...row, savedAt: NaN })).toThrow("damaged");
});
