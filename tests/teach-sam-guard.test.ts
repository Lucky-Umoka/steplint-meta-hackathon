import { expect, it, vi } from "vitest";
import { implausibleTrack, samSelectionRequest } from "../src/server/teach/pipeline";
import { localFixture } from "./fixtures/local-procedure";

vi.mock("server-only", () => ({}));

const media = () => localFixture().context.lesson.media;
const track = (id: string, width: number, height: number) => ({
  componentId: id,
  missingFrames: 0,
  samples: Array.from({ length: 10 }, (_, frame) => ({
    frame,
    timestampMs: frame * 100,
    confidence: 0.98,
    maskPixels: 500,
    box: { left: 0.1, top: 0.1, right: 0.1 + width, bottom: 0.1 + height },
  })),
});
const selection = (id: string, within: { left: number; top: number; right: number; bottom: number }) => ({
  id,
  description: id === "component-1" ? "red squeeze bottle" : "white plate",
  frame: 0,
  mark: { kind: "point" as const, x: within.left + 2, y: within.top + 2, within },
});

it("rejects a discovered object whose SAM outline became the person (paid run 11)", () => {
  const m = media();
  const w = m.info.video!.width, h = m.info.video!.height;
  // Discovery's bottle box: about 11% x 31% of the frame. SAM's track: 84% wide.
  const bottle = selection("component-1", { left: Math.round(0.22 * w), top: Math.round(0.13 * h), right: Math.round(0.33 * w), bottom: Math.round(0.44 * h) });
  const reason = implausibleTrack([bottle], [track("component-1", 0.84, 0.34)], m);
  expect(reason).toMatch(/did not track "red squeeze bottle".*No lesson was drafted/);
});

it("accepts normal object tracks, including a large but box-sized plate", () => {
  const m = media();
  const w = m.info.video!.width, h = m.info.video!.height;
  const plate = selection("component-3", { left: Math.round(0.48 * w), top: Math.round(0.3 * h), right: Math.round(0.85 * w), bottom: Math.round(0.49 * h) });
  const bottle = selection("component-1", { left: Math.round(0.22 * w), top: Math.round(0.13 * h), right: Math.round(0.33 * w), bottom: Math.round(0.44 * h) });
  expect(
    implausibleTrack([bottle, plate], [track("component-1", 0.11, 0.31), track("component-3", 0.37, 0.2)], m),
  ).toBeNull();
});

it("prompts SAM with discovery's box together with its point", () => {
  const m = media();
  const w = m.info.video!.width, h = m.info.video!.height;
  const within = { left: Math.round(0.22 * w), top: Math.round(0.13 * h), right: Math.round(0.33 * w), bottom: Math.round(0.44 * h) };
  const request = samSelectionRequest("file-abc", [selection("component-1", within)], m);
  const text = JSON.stringify(request.input);
  expect(text).toContain(`<|box;x1=${within.left};y1=${within.top};x2=${within.right - 1};y2=${within.bottom - 1};`);
  expect(text).toContain(`<|point;x=${within.left + 2};y=${within.top + 2};`); // the point is still sent
});

it("rejects a track that switched to a hand or arm mid-demonstration (paid run 12), but not a steady one", () => {
  const m = media();
  const w = m.info.video!.width, h = m.info.video!.height;
  const bottle = selection("component-1", { left: Math.round(0.12 * w), top: Math.round(0.04 * h), right: Math.round(0.22 * w), bottom: Math.round(0.36 * h) });
  const drift = track("component-1", 0.1, 0.3);
  // As in run 12: the mask grows and the box grows well beyond the bottle's.
  drift.samples = drift.samples.map((s, i) => ({ ...s, maskPixels: i < 5 ? 1500 : 13000, box: i < 5 ? s.box : { left: 0.1, top: 0, right: 0.45, bottom: 0.5 } }));
  expect(implausibleTrack([bottle], [drift], m)).toMatch(/switched to a hand or arm/);
  const steady = track("component-1", 0.1, 0.3);
  steady.samples = steady.samples.map((s, i) => ({ ...s, maskPixels: i === 3 ? 4500 : 1500 }));
  expect(implausibleTrack([bottle], [steady], m)).toBeNull();
});

it("discovery's resting view becomes a second SAM prompt; an invalid or earlier view is dropped", async () => {
  const { parseDiscovery } = await import("../src/server/teach/discovery");
  const { context } = localFixture();
  const lesson = context.lesson;
  const last = lesson.media.frameTimesMs.at(-1)!;
  const base = { description: "red squeeze bottle", timestampMs: 0, box: { left: 100, top: 100, right: 300, bottom: 500 }, positive: { x: 200, y: 300 } };
  const response = (component: object) => ({ status: "completed", output_text: JSON.stringify({ components: [component] }) });
  const kept = parseDiscovery(response({ ...base, restingView: { timestampMs: last, box: { left: 600, top: 100, right: 800, bottom: 500 }, positive: { x: 700, y: 300 } } }), lesson, "Move it");
  expect(kept[0].views).toHaveLength(1);
  expect(kept[0].views![0].frame).toBe(lesson.media.frameTimesMs.length - 1);
  const outside = parseDiscovery(response({ ...base, restingView: { timestampMs: last, box: { left: 600, top: 100, right: 800, bottom: 500 }, positive: { x: 100, y: 300 } } }), lesson, "Move it");
  expect(outside[0].views).toBeUndefined();
  const prompt = JSON.stringify(samSelectionRequest("file-abc", kept, lesson.media).input);
  expect(prompt).toContain(`<${kept[0].views![0].frame}f>`);
  expect(prompt.match(/<\|point;/g)?.length).toBe(2);
  // Box-only retry form: views carry boxes and no points.
  const retry = kept.map((s) => ({ ...s, mark: { kind: "box" as const, ...(s.mark.kind === "point" ? s.mark.within! : { left: 0, top: 0, right: 1, bottom: 1 }) } }));
  const retryPrompt = JSON.stringify(samSelectionRequest("file-abc", retry, lesson.media).input);
  expect(retryPrompt).not.toContain("<|point;");
  expect(retryPrompt.match(/<\|box;/g)?.length).toBe(2);
});

it("rejects a 'stationary' reference whose outline wanders and changes size (a hand, paid run 12)", () => {
  const m = media();
  const w = m.info.video!.width, h = m.info.video!.height;
  const lid = selection("component-2", { left: Math.round(0.1 * w), top: Math.round(0.25 * h), right: Math.round(0.3 * w), bottom: Math.round(0.4 * h) });
  const hand = track("component-2", 0.12, 0.15);
  hand.samples = hand.samples.map((s, i) => ({ ...s, maskPixels: i === 7 ? 9500 : 3000, box: { ...s.box, left: 0.05 + i * 0.05, right: 0.17 + i * 0.05 } }));
  expect(implausibleTrack([lid], [hand], m)).toMatch(/should stay in place/);
  // The same wandering track is fine for an object discovery reported as moving.
  expect(implausibleTrack([{ ...lid, views: [{ frame: 9, x: 5, y: 5, within: { left: 1, top: 1, right: 9, bottom: 9 } }] }], [hand], m)).toBeNull();
});

it("an object uncovered later (lid after the bottle is lifted, paid run 13) is not mistaken for drift", () => {
  const m = media();
  const w = m.info.video!.width, h = m.info.video!.height;
  const lid = selection("component-2", { left: Math.round(0.1 * w), top: Math.round(0.25 * h), right: Math.round(0.35 * w), bottom: Math.round(0.4 * h) });
  // Mask small while the bottle covers it, then 4x larger, but the box stays the lid's size.
  const uncovered = track("component-2", 0.24, 0.14);
  uncovered.samples = uncovered.samples.map((s, i) => ({ ...s, maskPixels: i < 5 ? 1000 : 4000 }));
  expect(implausibleTrack([lid], [uncovered], m)).toBeNull();
});
