export type MatchPair = {
  from: { x: number; y: number };
  to: { x: number; y: number };
};
export type Similarity = {
  a: number;
  b: number;
  tx: number;
  ty: number;
  inliers: number[];
  scale: number;
  rotation: number;
};
export const transformPoint = (
  t: Pick<Similarity, "a" | "b" | "tx" | "ty">,
  p: { x: number; y: number },
) => ({ x: t.a * p.x - t.b * p.y + t.tx, y: t.b * p.x + t.a * p.y + t.ty });
/** Robust rigid-in-plane + scale fit. Outliers/large deformations abstain instead of dragging an object box. */
export function fitSimilarity(pairs: MatchPair[]): Similarity | null {
  if (pairs.length < 5) return null;
  let best: number[] = [];
  for (let i = 0; i < pairs.length; i++)
    for (let j = i + 1; j < pairs.length; j++) {
      const x = pairs[j].from.x - pairs[i].from.x,
        y = pairs[j].from.y - pairs[i].from.y,
        u = pairs[j].to.x - pairs[i].to.x,
        v = pairs[j].to.y - pairs[i].to.y,
        d = x * x + y * y;
      if (d < 36) continue;
      const a = (u * x + v * y) / d,
        b = (v * x - u * y) / d,
        scale = Math.hypot(a, b),
        rotation = Math.atan2(b, a);
      if (scale < 0.8 || scale > 1.25 || Math.abs(rotation) > Math.PI / 9)
        continue;
      const t = {
        a,
        b,
        tx: pairs[i].to.x - a * pairs[i].from.x + b * pairs[i].from.y,
        ty: pairs[i].to.y - b * pairs[i].from.x - a * pairs[i].from.y,
      };
      const ids = pairs.flatMap((pair, index) => {
        const p = transformPoint(t, pair.from);
        return Math.hypot(p.x - pair.to.x, p.y - pair.to.y) < 3.5
          ? [index]
          : [];
      });
      if (ids.length > best.length) best = ids;
    }
  if (best.length < 5 || best.length / pairs.length < 0.75) return null;
  const mean = (side: "from" | "to") =>
    best.reduce(
      (sum, index) => ({
        x: sum.x + pairs[index][side].x / best.length,
        y: sum.y + pairs[index][side].y / best.length,
      }),
      { x: 0, y: 0 },
    );
  const p = mean("from"),
    q = mean("to");
  let denominator = 0,
    aa = 0,
    bb = 0;
  for (const index of best) {
    const x = pairs[index].from.x - p.x,
      y = pairs[index].from.y - p.y,
      u = pairs[index].to.x - q.x,
      v = pairs[index].to.y - q.y;
    denominator += x * x + y * y;
    aa += x * u + y * v;
    bb += x * v - y * u;
  }
  if (denominator < 1) return null;
  const a = aa / denominator,
    b = bb / denominator,
    scale = Math.hypot(a, b),
    rotation = Math.atan2(b, a);
  if (scale < 0.8 || scale > 1.25 || Math.abs(rotation) > Math.PI / 9)
    return null;
  return {
    a,
    b,
    tx: q.x - a * p.x + b * p.y,
    ty: q.y - b * p.x - a * p.y,
    inliers: best,
    scale,
    rotation,
  };
}
