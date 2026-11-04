import { expect, it } from "vitest";
import { groundNativePalette } from "../src/practice/native-palette";

// Paid run 17: SAM's box cut off the bottle's base by more than the 10%
// surroundings margin, so the bottle's own red base counted as "background"
// and a distinctive red bottle was refused colour tracking.
const W = 160, H = 120;
function scene(redBottom: number, greyRed = false) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([120, 120, 120, 255], i * 4);
  for (let y = 10; y < redBottom; y++)
    for (let x = 40; x < 56; x++) data.set([200, 30, 30, 255], (y * W + x) * 4);
  if (greyRed) // a red table edge right around the object: genuinely not distinctive
    for (let y = 0; y < H; y++) for (const x of [36, 37, 59, 60]) data.set([200, 30, 30, 255], (y * W + x) * 4);
  return { width: W, height: H, data };
}
const box = { left: 40 / W, top: 10 / H, right: 56 / W, bottom: 50 / H }; // base cropped
it("a box cropping the object's base still grounds a distinctive colour", () => {
  // Base extends 6 px below the box: the 10% ring (4 px) lands on it, the
  // 20% ring (8 px) on the table.
  expect(groundNativePalette(scene(56), "bottle", box)).not.toBeNull();
});
it("a colour that is common around the object is still refused", () => {
  expect(groundNativePalette(scene(50, true), "bottle", box)).toBeNull();
});
