"use client";
import { useRef } from "react";
import type { Selection } from "@/teach/schema";
export type Mark = Selection["mark"];
export default function FrameMark({ image, width, height, mode, mark, onMark }: { image: string; width: number; height: number; mode: "point" | "box"; mark: Mark | null; onMark: (mark: Mark) => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  function position(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(width - 1, Math.floor((event.clientX - bounds.left) / bounds.width * width))), y: Math.max(0, Math.min(height - 1, Math.floor((event.clientY - bounds.top) / bounds.height * height))) };
  }
  return <svg className="w-full touch-none rounded border bg-slate-100" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={mode === "point" ? "Click a component in the lesson frame" : "Drag a box in the lesson frame"}
    onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); start.current = position(event); }}
    onPointerUp={(event) => {
      const first = start.current, last = position(event); start.current = null;
      if (!first) return;
      if (mode === "point") onMark({ kind: "point", ...last });
      else if (Math.abs(last.x - first.x) >= 2 && Math.abs(last.y - first.y) >= 2) onMark({ kind: "box", left: Math.min(first.x, last.x), top: Math.min(first.y, last.y), right: Math.max(first.x, last.x), bottom: Math.max(first.y, last.y) });
    }}>
    <image href={image} width={width} height={height} />
    {mark?.kind === "point" && <circle cx={mark.x} cy={mark.y} r={6} fill="#fef08a" stroke="#000" strokeWidth={2} />}
    {mark?.kind === "box" && <rect x={mark.left} y={mark.top} width={mark.right - mark.left} height={mark.bottom - mark.top} fill="#fef08a" fillOpacity={0.2} stroke="#e11d48" strokeWidth={3} />}
  </svg>;
}
