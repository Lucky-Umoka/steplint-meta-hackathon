import { expect, it } from "vitest";
import {
  RECOVERY,
  activateIdentity,
  dormantIdentity,
  expireSearch,
  loseIdentity,
  nextSearch,
  recordSearch,
  trackedIdentity,
} from "../src/practice/identity-recovery";
import {
  LocalWorkerInputSchema,
  LocalWorkerReplySchema,
} from "../src/practice/local-tracking-protocol";

const p = { x: 0.2, y: 0.5 };
it("tracked → occluded → reacquiring → tracked only after three consistent observations", () => {
  let s = loseIdentity(trackedIdentity(), 1000);
  expect(s.status).toBe("occluded");
  expect(nextSearch(s, 1000, "loss-frame")).toBe("none"); // never on the loss frame
  expect(nextSearch(s, 1070, "a")).toBe("attempt");
  let r = recordSearch(s, 1070, "a", p);
  expect(r).toMatchObject({
    accepted: false,
    state: { status: "reacquiring", attempts: 1 },
  });
  expect(nextSearch(r.state, 1070, "a")).toBe("none"); // one action per fresh frame
  expect(nextSearch(r.state, 1140, "b")).toBe("confirm");
  r = recordSearch(r.state, 1140, "b", { x: 0.205, y: 0.5 });
  r = recordSearch(r.state, 1210, "c", { x: 0.21, y: 0.505 });
  expect(r.accepted).toBe(true);
  expect(r.state.status).toBe("tracked");
  s = r.state;
});
it("an inconsistent confirmation discards the candidate, and attempts are capped and spread over the window", () => {
  let s = loseIdentity(trackedIdentity(), 0);
  let r = recordSearch(s, 70, "a", p);
  r = recordSearch(r.state, 140, "b", { x: 0.5, y: 0.5 }); // jumped: not the same object
  expect(r.state.candidates).toEqual([]);
  s = r.state;
  expect(nextSearch(s, 210, "c")).toBe("none"); // next attempt waits for its slot
  const slot = RECOVERY.windowMs / RECOVERY.maxAttempts;
  expect(nextSearch(s, slot + 1, "d")).toBe("attempt");
  s = recordSearch(s, slot + 1, "d", null).state;
  expect(nextSearch(s, 2 * slot + 1, "e")).toBe("attempt");
  const last = recordSearch(s, 2 * slot + 1, "e", null);
  expect(last.state.status).toBe("needs_user_view");
  expect(nextSearch(last.state, 2 * slot + 100, "f")).toBe("none"); // cooldown after exhaustion
  expect(nextSearch(last.state, 2 * slot + 1002, "g")).toBe("attempt");
  const retry = recordSearch(last.state, 2 * slot + 1002, "g", null).state;
  expect(nextSearch(retry, 2 * slot + 1500, "h")).toBe("none");
  expect(nextSearch(retry, 2 * slot + 2003, "i")).toBe("attempt");
});
it("a loss episode with no successful attempt expires to needs_user_view after the window", () => {
  const s = loseIdentity(trackedIdentity(), 0);
  expect(expireSearch(s, RECOVERY.windowMs).status).toBe("occluded");
  expect(expireSearch(s, RECOVERY.windowMs + 1).status).toBe("needs_user_view");
});
it("a dormant later object is not searched until activated, then acquired from three consistent matches", () => {
  let s = dormantIdentity();
  expect(nextSearch(s, 0, "a")).toBe("none");
  s = activateIdentity(s);
  expect(s.status).toBe("acquiring");
  let r = recordSearch(s, 10, "a", p);
  r = recordSearch(r.state, 20, "b", p);
  expect(r.accepted).toBe(false);
  expect(recordSearch(r.state, 30, "c", p).accepted).toBe(true);
});
it("the worker protocol carries watch-set revisions, rejects duplicate watch identities and keeps optional detections separate", () => {
  const image = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  const frame = {
    type: "frame",
    generation: 1,
    frameId: "f",
    timestampMs: 1,
    image,
    watchRevision: 2,
    watch: { required: ["a"], optional: ["b"] },
  };
  expect(LocalWorkerInputSchema.safeParse(frame).success).toBe(true);
  expect(
    LocalWorkerInputSchema.safeParse({
      ...frame,
      watch: { required: ["a"], optional: ["a"] },
    }).success,
  ).toBe(false);
  const reply = LocalWorkerReplySchema.parse({
    type: "tracked",
    generation: 1,
    watchRevision: 2,
    timestampMs: 1,
    frameId: "f",
    processingMs: 1,
    detections: [
      { objectId: "a", quality: "ambiguous", box: null, score: null },
    ],
    optionalDetections: [
      { objectId: "b", quality: "ambiguous", box: null, score: null },
    ],
    identityEvents: [{ objectId: "a", status: "occluded", reason: "hand" }],
    calibrationValid: true,
    partialIdentities: [],
    reason: null,
    measurements: [],
  });
  expect(reply.type === "tracked" && reply.watchRevision).toBe(2);
  // Older replies without the new fields still parse with empty defaults.
  const old = LocalWorkerReplySchema.parse({
    ...reply,
    optionalDetections: undefined,
    identityEvents: undefined,
    watchRevision: undefined,
  });
  expect(old.type === "tracked" && old.optionalDetections).toEqual([]);
});
