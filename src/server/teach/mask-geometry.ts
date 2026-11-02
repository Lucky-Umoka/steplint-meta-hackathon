import type { SegmentationMaskRecord } from "@meta-sam/parser";
import { decodeMaskToRaster } from "@meta-sam/parser";
import type { Region } from "../../teach/schema";

/** A mask's raster extent is not necessarily its foreground object extent. */
export function maskForeground(
  mask: SegmentationMaskRecord,
  width: number,
  height: number,
): { region: Region; pixels: number } | null {
  const bounds = mask.bounds;
  if (
    bounds.left < 0 ||
    bounds.top < 0 ||
    bounds.right > width ||
    bounds.bottom > height ||
    bounds.right <= bounds.left ||
    bounds.bottom <= bounds.top
  )
    throw Error("Invalid segmentation mask source bounds.");
  const raster = decodeMaskToRaster(mask.mask);
  const w = mask.mask.width,
    h = mask.mask.height;
  if (raster.length !== w * h || w <= 0 || h <= 0)
    throw Error("Invalid segmentation mask raster.");
  let left = w,
    top = h,
    right = -1,
    bottom = -1,
    pixels = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (raster[y * w + x]) {
        pixels++;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
  if (!pixels) return null;
  const region = {
    left: (bounds.left + (left / w) * (bounds.right - bounds.left)) / width,
    top: (bounds.top + (top / h) * (bounds.bottom - bounds.top)) / height,
    right:
      (bounds.left + ((right + 1) / w) * (bounds.right - bounds.left)) / width,
    bottom:
      (bounds.top + ((bottom + 1) / h) * (bounds.bottom - bounds.top)) / height,
  };
  return { region, pixels };
}
export function coversFrame(box: Region, width: number, height: number) {
  return (
    box.left <= 1 / width &&
    box.top <= 1 / height &&
    box.right >= 1 - 1 / width &&
    box.bottom >= 1 - 1 / height
  );
}
