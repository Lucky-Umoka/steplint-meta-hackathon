import { expect, it, vi } from "vitest";
import { bootstrapLocal, trackLocal } from "../src/practice/local-tracking";
import { mappedSetupIssue, shortNoun, toLive, viewFromBoxes, warpToTeach, type View } from "../src/practice/viewpoint";
import { smoothTable } from "./fixtures/practice-scene";
import type { Pixels } from "../src/practice/tracker";

vi.mock("server-only", () => ({}));

// Owner physical-camera root cause: Practice searched only near the Teach
// positions/sizes, so a camera placed differently never started tracking.
type Box = { left: number; top: number; right: number; bottom: number };
const mover = { left: 0.3, top: 0.3, right: 0.45, bottom: 0.6 },
  plate = { left: 0.55, top: 0.5, right: 0.8, bottom: 0.8 },
  lid = { left: 0.6, top: 0.1, right: 0.8, bottom: 0.3 };
const teach = smoothTable([{ box: mover, seed: 1 }, { box: plate, seed: 2 }, { box: lid, seed: 4 }]);
/** The same scene seen by a camera further back and to the side. */
function moved(image: Pixels, view: View): Pixels {
  const data = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < data.length; i += 4) data.set([118, 118, 118, 255], i);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const u = ((x + 0.5) / image.width - view.dx) / view.scale,
        v = ((y + 0.5) / image.height - view.dy) / view.scale;
      if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
      const j = (Math.floor(v * image.height) * image.width + Math.floor(u * image.width)) * 4;
      data.set(image.data.subarray(j, j + 4), (y * image.width + x) * 4);
    }
  return { ...image, data };
}
// Moved well beyond the old ±15 % search window (no resizing, so the
// synthetic pixel texture survives; real images also survive resizing).
const camera: View = { scale: 1, dx: -0.2, dy: 0.1 };
const objects = [
  { id: "mover", box: mover, fixed: false, image: teach, required: true },
  { id: "plate", box: plate, fixed: true, image: teach },
  { id: "lid", box: lid, fixed: true, image: teach },
];
it("SAM boxes from >= 2 agreeing objects give the camera mapping; one object or disagreement gives none", () => {
  const live = (b: Box) => toLive(b, camera);
  const view = viewFromBoxes([mover, plate, lid].map((b) => ({ teach: b, live: live(b) })))!;
  expect(view.scale).toBeCloseTo(1, 3);
  expect(view.dx).toBeCloseTo(-0.2, 3);
  expect(viewFromBoxes([{ teach: mover, live: live(mover) }])).toBeNull();
  expect(viewFromBoxes([{ teach: mover, live: live(mover) }, { teach: plate, live: toLive(plate, { scale: 1.6, dx: -0.3, dy: 0 }) }])).toBeNull();
  // Same viewpoint: no resampling.
  expect(viewFromBoxes([mover, plate].map((b) => ({ teach: b, live: b })))).toBeNull();
});
it("a moved camera fails the old setup but sets up and tracks at the Teach positions once mapped", () => {
  const live = moved(teach, camera);
  let unmappedOk = true;
  try {
    const { zoneTranslations, state } = bootstrapLocal(live, { scene: teach, objects, zones: [plate] });
    const r = trackLocal(live, state, { nowMs: 1000, frameId: "a" });
    const m = r.detections.find((d) => d.objectId === "mover");
    unmappedOk = !!m?.box && Math.abs(m.box.left - mover.left) < 0.03 && Math.hypot(zoneTranslations[0].x, zoneTranslations[0].y) < 0.03;
  } catch {
    unmappedOk = false;
  }
  expect(unmappedOk).toBe(false); // the root cause, reproduced
  const view = viewFromBoxes([mover, plate, lid].map((b) => ({ teach: b, live: toLive(b, camera) })))!;
  const mapped = warpToTeach(live, view);
  const { state, zoneTranslations } = bootstrapLocal(mapped, { scene: teach, objects, zones: [plate] });
  expect(mappedSetupIssue(zoneTranslations)).toBeNull();
  const reply = trackLocal(warpToTeach(live, view), state, { nowMs: 1000, frameId: "b" });
  expect(reply.calibrationValid).toBe(true);
  const seen = reply.detections.find((d) => d.objectId === "mover")!;
  expect(seen.quality).toBe("observed");
  expect(Math.abs(seen.box!.left - mover.left)).toBeLessThan(0.03);
  // Drawn on the live camera where the object really is.
  expect(Math.abs(toLive(seen.box!, view).left - toLive(mover, camera).left)).toBeLessThan(0.03);
});
it("a large residual after mapping (mis-matched reference) refuses the setup attempt", () => {
  expect(mappedSetupIssue([{ x: 0.01, y: 0 }])).toBeNull();
  expect(mappedSetupIssue([{ x: -0.115, y: -0.054 }])).toMatch(/^Finding/);
});
it("approved descriptions become short SAM noun phrases", () => {
  expect(shortNoun("white bowl (white ball/plate) moved from book to white paper")).toBe("white bowl");
  expect(shortNoun("black mat on the table serving as the destination support")).toBe("black mat");
  expect(shortNoun("red plastic squeeze bottle with pointed nozzle")).toBe("red plastic squeeze bottle");
});
it("the locate route is same-site, bounded per session and makes one SAM image request per object", async () => {
  const { admitLocate, locateObjects, resetLocateLimits, LocateRequestSchema } = await import("../src/server/practice/locate");
  resetLocateLimits();
  const input = LocateRequestSchema.parse({ sessionId: "practice-test-1", image: "data:image/jpeg;base64,AAAA", width: 320, height: 240, objects: [{ id: "a", noun: "white bowl" }, { id: "b", noun: "black mat" }] });
  admitLocate(input, 0);
  expect(() => admitLocate(input, 1000)).toThrow(/already ran/);
  const calls: unknown[] = [];
  const text = "<0f>0<|box;x1=32;y1=48;x2=96;y2=120;w=320;h=240;c=0.97|><|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>\n";
  const client = { responses: { create: async (body: { model: string }) => { calls.push(body); expect(body.model).toBe("sam-3.1"); return (async function* () { const lane = { item_id: "m", output_index: 0, content_index: 0 }; yield { type: "response.output_text.delta", ...lane, delta: text }; yield { type: "response.output_text.done", ...lane, text }; yield { type: "response.completed" }; })(); } } };
  const found = await locateObjects(input, new AbortController().signal, client as never);
  expect(calls).toHaveLength(2);
  for (const [k, v] of Object.entries({ left: 0.1, top: 0.2, right: 0.3, bottom: 0.5 }))
    expect(found[0].box![k as "left"]).toBeCloseTo(v, 2); // parser: far edge inclusive
});
