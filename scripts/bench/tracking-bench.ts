/**
 * Local tracker latency benchmark (no network, no model calls). A scene
 * shaped like the owner's physical setup: white bowl on a blue towel, black
 * mat, light textured table, 320x180 frames. Measures per-frame trackLocal
 * time while the bowl is carried (normal tracking) and while it is hidden
 * (identity search), and prints a stable checksum of the decisions so
 * optimisations can be checked for identical output.
 */
import { calibrateLocal, trackLocal } from "../../src/practice/local-tracking";
import type { Pixels } from "../../src/practice/tracker";

const W = 320, H = 180;
function scene(bowlX: number, hidden = false, seed = 0): Pixels {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let h = Math.imul(x + seed * 7, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b);
      h ^= h >>> 15;
      const n = (h >>> 0) % 14;
      let c = [200 + n, 186 + n, 165 + n];
      if (y > 95 && y < 170 && x > 30 && x < 160) c = [28 + n, 58 + ((x + y) % 25), 190 + n];
      if (y > 100 && y < 168 && x > 180 && x < 290) c = [18 + n, 18 + (n >> 1), 22 + n];
      if (!hidden) {
        const r = Math.hypot(x - bowlX, y - 130);
        if (r < 22) c = r > 17 ? [236, 236, 236] : [150 + ((x * 5 + y * 11) % 60), 135 + ((x + y * 7) % 50), 115];
      }
      data.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
    }
  return { width: W, height: H, data };
}
const box = (l: number, t: number, r: number, b: number) => ({ left: l / W, top: t / H, right: r / W, bottom: b / H });
const towel = box(30, 95, 160, 170), mat = box(180, 100, 290, 168);
const state = calibrateLocal(scene(95), {
  objects: [
    { id: "bowl", box: box(72, 107, 118, 153) },
    { id: "towel", box: towel, fixed: true },
    { id: "mat", box: mat, fixed: true },
  ],
  workspace: null,
  zones: [towel, mat],
  consensus: true,
});
const watch = { required: ["bowl"], optional: [] as string[] };
let t = 0, frame = 0;
const timings: { phase: string; ms: number }[] = [];
let checksum = "";
function step(image: Pixels, phase: string) {
  t += 66;
  const start = performance.now();
  const r = trackLocal(image, state, { nowMs: t, frameId: `f${++frame}`, watch });
  timings.push({ phase, ms: performance.now() - start });
  const d = r.detections[0];
  checksum += `${d.quality[0]}${d.box ? Math.round(((d.box.left + d.box.right) / 2) * 1000) : "-"}${r.calibrationValid ? "" : "!"}|`;
}
for (let i = 0; i < 20; i++) step(scene(95, false, i), "still");
for (let x = 95; x <= 235; x += 3) step(scene(x, false, x), "carry");
for (let i = 0; i < 30; i++) step(scene(235, true, i), "hidden");
for (let i = 0; i < 30; i++) step(scene(235, false, i), "reacquire");
const stats = (phase: string) => {
  const v = timings.filter((x) => x.phase === phase).map((x) => x.ms).sort((a, b) => a - b);
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return `${phase.padEnd(9)} n=${String(v.length).padStart(3)} median ${q(0.5).toFixed(1)} ms  p95 ${q(0.95).toFixed(1)} ms  max ${v.at(-1)!.toFixed(1)} ms`;
};
for (const p of ["still", "carry", "hidden", "reacquire"]) console.log(stats(p));
let hash = 0;
for (const ch of checksum) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0;
console.log(`decisions checksum ${hash >>> 0} (${checksum.length} chars)`);
