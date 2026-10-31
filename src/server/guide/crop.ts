import "server-only";
import sharp from "sharp";
import { validateJpeg } from "./jpeg";
import { TeachError } from "../teach/security";
export type PixelBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
/** Preserve native pixels; offsets map SAM crop coordinates back to the original frame. */
export async function conceptCrop(
  image: string,
  box: PixelBox,
  size: { width: number; height: number },
) {
  validateJpeg(image, size.width, size.height);
  if (
    [box.left, box.top, box.right, box.bottom].some(
      (n) => !Number.isInteger(n),
    ) ||
    box.left < 0 ||
    box.top < 0 ||
    box.right > size.width ||
    box.bottom > size.height ||
    box.left >= box.right ||
    box.top >= box.bottom
  )
    throw new TeachError(422, "Invalid source crop geometry.");
  const padding = Math.ceil((Math.min(size.width, size.height) * 2) / 15),
    left = Math.max(0, box.left - padding),
    top = Math.max(0, box.top - padding),
    right = Math.min(size.width, box.right + padding),
    bottom = Math.min(size.height, box.bottom + padding);
  const width = right - left,
    height = bottom - top;
  const input = Buffer.from(image.slice(image.indexOf(",") + 1), "base64");
  const output = await sharp(input, { limitInputPixels: 1280 * 720 })
    .extract({ left, top, width, height })
    .jpeg({ quality: 90 })
    .toBuffer();
  return {
    left,
    top,
    width,
    height,
    image: `data:image/jpeg;base64,${output.toString("base64")}`,
  };
}
export function originalBox(
  box: PixelBox,
  origin: { left: number; top: number },
): PixelBox {
  return {
    left: box.left + origin.left,
    top: box.top + origin.top,
    right: box.right + origin.left,
    bottom: box.bottom + origin.top,
  };
}
