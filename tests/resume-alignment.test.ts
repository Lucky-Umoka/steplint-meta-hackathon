import { expect, it } from "vitest";
import { groundBackground } from "../src/practice/appearance";
import { sameWorkbenchView } from "../src/practice/resume-alignment";
function picture(shift = 0) {
  const width = 120,
    height = 90,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let n = Math.imul(x - shift, 0x45d9f3b) ^ Math.imul(y, 0x119de1f3);
      n ^= n >>> 16;
      const v = 55 + ((n >>> 0) % 140);
      data.set([v, v, v, 255], (y * width + x) * 4);
    }
  return { width, height, data };
}
it("requires fresh matching scene evidence before preserving earlier goal references after a break", () => {
  const image = picture(),
    background = groundBackground(image, []);
  expect(background).not.toBeNull();
  expect(sameWorkbenchView(background, image)).toBe(true);
  expect(sameWorkbenchView(background, picture(8))).toBe(false);
  expect(sameWorkbenchView(null, image)).toBe(false);
  expect(background!.lost).toBe(false);
});
