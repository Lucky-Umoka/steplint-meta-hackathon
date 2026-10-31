import { expect, it, vi } from "vitest";
import { conceptCrop, originalBox } from "../src/server/guide/crop";
import { jpegSize } from "../src/server/guide/jpeg";
import { fixture } from "./fixtures/guide";
vi.mock("server-only", () => ({}));
it("crops native pixels with bounded context and retains the correct coordinate origin", async () => {
  const crop = await conceptCrop(
    fixture().images[0].image,
    { left: 210, top: 227, right: 272, bottom: 256 },
    { width: 640, height: 480 },
  );
  expect({
    left: crop.left,
    top: crop.top,
    width: crop.width,
    height: crop.height,
  }).toEqual({ left: 146, top: 163, width: 190, height: 157 });
  expect(jpegSize(crop.image)).toEqual({ width: 190, height: 157 });
  expect(
    originalBox({ left: 65, top: 65, right: 125, bottom: 92 }, crop),
  ).toEqual({ left: 211, top: 228, right: 271, bottom: 255 });
  const edge = await conceptCrop(
    fixture().images[0].image,
    { left: 0, top: 0, right: 10, bottom: 10 },
    { width: 640, height: 480 },
  );
  expect(jpegSize(edge.image)).toEqual({ width: 74, height: 74 });
});
it("rejects invalid crop or image geometry before model requests", async () => {
  await expect(
    conceptCrop(
      fixture().images[0].image,
      { left: -1, top: 0, right: 10, bottom: 10 },
      { width: 640, height: 480 },
    ),
  ).rejects.toThrow("geometry");
  await expect(
    conceptCrop(
      fixture().images[0].image,
      { left: 1, top: 0, right: 10, bottom: 10 },
      { width: 320, height: 240 },
    ),
  ).rejects.toThrow("dimensions");
});
