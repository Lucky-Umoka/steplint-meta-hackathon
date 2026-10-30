import "server-only";
import { TeachError } from "../teach/security";
/** Bounded JPEG header validation, independent from segmentation grammar. */
export function jpegSize(image: string) {
  if (!image.startsWith("data:image/jpeg;base64,"))
    throw new TeachError(415, "Use a JPEG camera/reference image.");
  const encoded = image.slice(image.indexOf(",") + 1),
    raw = Buffer.from(encoded, "base64");
  if (
    raw.length > 340000 ||
    raw.toString("base64") !== encoded ||
    raw[0] !== 255 ||
    raw[1] !== 216
  )
    throw new TeachError(415, "The camera/reference image is invalid.");
  let p = 2;
  while (p + 4 < raw.length) {
    if (raw[p] !== 255) throw new TeachError(415, "Invalid image markers.");
    const marker = raw[p + 1];
    p += 2;
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const size = raw.readUInt16BE(p);
    if (size < 2 || p + size > raw.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (size < 7) break;
      const height = raw.readUInt16BE(p + 3),
        width = raw.readUInt16BE(p + 5);
      if (!width || !height || width > 1280 || height > 720) break;
      return { width, height };
    }
    p += size;
  }
  throw new TeachError(415, "JPEG dimensions could not be confirmed.");
}
export function validateJpeg(image: string, width: number, height: number) {
  const actual = jpegSize(image);
  if (actual.width !== width || actual.height !== height)
    throw new TeachError(
      415,
      "Camera/reference image dimensions do not match.",
    );
}
