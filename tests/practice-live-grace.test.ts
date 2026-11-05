import { expect, it } from "vitest";
import { calibrateLocal, trackLocal } from "../src/practice/local-tracking";

// Owner 2026-11-05: "one second it sees the object, next it is gone". One
// failed frame latched the mover as lost; at the exported 2–3 tracked frames/s
// a hand carry also moved it beyond the 64 px live window.
const W = 320,
  H = 240,
  colour = [180, 30, 60];
function scene(objects: number[]) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const inObject = objects.some(
        (left) => x >= left && x < left + 24 && y >= 60 && y < 108,
      );
      const inWorkspace = x >= 250 && x < 300 && y >= 170 && y < 220;
      const value = 40 + ((x * 17 + y * 31) % 180);
      // Textured neutral table (usable exposure/detail everywhere).
      const table = inWorkspace ? value : 70 + ((x * 7 + y * 13) % 60);
      data.set(
        inObject ? [...colour, 255] : [table, table, table, 255],
        (y * W + x) * 4,
      );
    }
  return { width: W, height: H, data };
}
function setup() {
  return calibrateLocal(scene([40]), {
    objects: [
      {
        id: "object",
        box: { left: 39 / W, top: 59 / H, right: 65 / W, bottom: 109 / H },
      },
    ],
    workspace: { left: 250 / W, top: 170 / H, right: 300 / W, bottom: 220 / H },
  });
}
const track = (
  state: ReturnType<typeof setup>,
  objects: number[],
  nowMs: number,
) => trackLocal(scene(objects), state, { nowMs, frameId: `f-${nowMs}` });

it("one unclear frame during a fast carry does not lose the object; it is measured again live", () => {
  const state = setup();
  expect(track(state, [40], 0).detections[0].quality).toBe("observed");
  expect(track(state, [60], 300).detections[0].quality).toBe("observed");
  // Hand covers it for one frame: uncertain, never observed.
  const hidden = track(state, [], 600);
  expect(hidden.detections[0].quality).not.toBe("observed");
  expect(hidden.detections[0].box).toBeNull();
  expect(hidden.identityEvents).toEqual([]);
  // Reappears 90 px further on (beyond the 64 px base window).
  const back = track(state, [150], 900);
  expect(back.detections[0].quality).toBe("observed");
  expect(back.detections[0].box!.left).toBeCloseTo(150 / W, 2);
  expect(state.slots.object.identity.status).toBe("tracked");
});

it("a loss longer than the grace still goes through the bounded recovery", () => {
  const state = setup();
  expect(track(state, [40], 0).detections[0].quality).toBe("observed");
  const events = [
    ...track(state, [], 300).identityEvents,
    ...track(state, [], 1100).identityEvents,
  ];
  expect(events.map((e) => e.status)).toContain("occluded");
  expect(state.slots.object.identity.status).not.toBe("tracked");
});

it("a lookalike inside the grown window is ambiguous, never a silent identity swap", () => {
  const state = setup();
  expect(track(state, [40], 0).detections[0].quality).toBe("observed");
  track(state, [], 300);
  const twins = track(state, [20, 110], 600);
  expect(twins.detections[0].quality).not.toBe("observed");
  expect(twins.detections[0].box).toBeNull();
});
