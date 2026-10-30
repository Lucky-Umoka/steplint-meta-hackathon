import { z } from "zod";
import { BoxSchema } from "./schema";
/** Provider-neutral row-major foreground bits, packed most-significant bit first. */
export const ForegroundSchema = z
  .strictObject({
    width: z.number().int().positive().max(1280),
    height: z.number().int().positive().max(720),
    bounds: BoxSchema,
    bits: z
      .string()
      .max(160000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .superRefine((value, ctx) => {
    const bytes = Math.ceil((value.width * value.height) / 8);
    const expected = 4 * Math.ceil(bytes / 3);
    if (
      value.width * value.height > 1280 * 720 ||
      value.bits.length !== expected
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid bounded foreground size.",
      });
  });
export type Foreground = z.infer<typeof ForegroundSchema>;
export function foregroundPixels(value: Foreground) {
  const mask = ForegroundSchema.parse(value);
  const packed = Uint8Array.from(atob(mask.bits), (c) => c.charCodeAt(0));
  if (packed.length !== Math.ceil((mask.width * mask.height) / 8))
    throw Error("Invalid foreground data.");
  return (x: number, y: number) => {
    const xx = Math.floor(
        ((x - mask.bounds.left) / (mask.bounds.right - mask.bounds.left)) *
          mask.width,
      ),
      yy = Math.floor(
        ((y - mask.bounds.top) / (mask.bounds.bottom - mask.bounds.top)) *
          mask.height,
      );
    if (xx < 0 || yy < 0 || xx >= mask.width || yy >= mask.height) return false;
    const index = yy * mask.width + xx;
    return Boolean(packed[index >> 3] & (1 << (7 - (index & 7))));
  };
}
