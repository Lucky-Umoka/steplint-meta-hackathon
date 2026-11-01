import { expect, it } from "vitest";
import { EvidenceBuffer } from "../src/practice/evidence-buffer";
it("preserves a long movement's actual origin and onset after recent frames expire, without mutable pixels", () => {
  const buffer = new EvidenceBuffer();
  const image = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([1, 2, 3, 255]),
  };
  buffer.add("origin", 0, image);
  buffer.hold("object:origin", "origin");
  image.data[0] = 99;
  for (let i = 1; i < 100; i++) buffer.add(`frame-${i}`, i, image);
  buffer.add("onset", 100, image);
  buffer.hold("object:onset", "onset");
  buffer.commit(["origin", "onset", "frame-99"]);
  expect(buffer.frames().map((f) => f.id)).toContain("origin");
  expect(buffer.frames()[0].image.data[0]).toBe(1);
});
it("bounds retained audit frames", () => {
  const buffer = new EvidenceBuffer();
  for (let i = 0; i < 100; i++) {
    buffer.add(`frame-${i}`, i, {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray(4),
    });
    buffer.commit([`frame-${i}`]);
  }
  expect(buffer.frames()).toHaveLength(60);
});
