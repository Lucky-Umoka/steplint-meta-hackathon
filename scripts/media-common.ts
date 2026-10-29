import "server-only";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import nextEnv from "@next/env";
import { MAX_MEDIA_BYTES } from "../src/media/inspect";

export function prepareMediaSmoke(approved: boolean | undefined) {
  if (!approved) throw new Error("Live request blocked. Obtain owner approval for this file and request count, then pass --approved.");
  nextEnv.loadEnvConfig(process.cwd());
}
export async function readMedia(path: string, maxBytes = MAX_MEDIA_BYTES) {
  const handle = await open(path, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) throw new Error("Input must be a nonempty regular file within the spike size limit.");
    // Bounded read even if the source file grows after stat.
    const bytes = Buffer.alloc(maxBytes + 1);
    let count = 0;
    while (count <= maxBytes) {
      const { bytesRead } = await handle.read(bytes, count, maxBytes + 1 - count, null);
      if (!bytesRead) break;
      count += bytesRead;
    }
    if (count > maxBytes) throw new Error("Input grew beyond the spike size limit.");
    return bytes.subarray(0, count);
  } finally { await handle.close(); }
}
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
