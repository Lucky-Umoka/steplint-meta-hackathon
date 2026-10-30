import type { Guide } from "@/guide/schema";
export default function GuideFrame({
  guide,
  frame,
  title,
  objectIds,
}: {
  guide: Guide;
  frame: number;
  title: string;
  objectIds?: string[];
}) {
  const image = guide.images.find((i) => i.frame === frame)?.image;
  return (
    <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b px-3 py-2 text-sm font-semibold">
        {title}{" "}
        <span className="float-right font-normal text-slate-500">
          {((guide.source.frameTimesMs[frame] ?? 0) / 1000).toFixed(1)}s
        </span>
      </div>
      {image ? (
        <svg
          viewBox={`0 0 ${guide.source.width} ${guide.source.height}`}
          role="img"
          aria-label={`${title} with labelled objects`}
          className="block w-full"
        >
          <image
            href={image}
            width={guide.source.width}
            height={guide.source.height}
          />
          {guide.geometry
            .filter(
              (g) =>
                g.frame === frame &&
                (!objectIds || objectIds.includes(g.objectId)),
            )
            .map((g) => {
              const b = g.box,
                name = guide.objects.find((o) => o.id === g.objectId)?.label;
              const y = Math.max(20, b.top * guide.source.height);
              return (
                <g key={g.objectId}>
                  <rect
                    x={b.left * guide.source.width}
                    y={b.top * guide.source.height}
                    width={(b.right - b.left) * guide.source.width}
                    height={(b.bottom - b.top) * guide.source.height}
                    rx="3"
                    fill="#10b981"
                    fillOpacity=".08"
                    stroke="#34d399"
                    strokeWidth="3"
                  />
                  <text
                    x={b.left * guide.source.width + 4}
                    y={y - 4}
                    fill="white"
                    stroke="#0f172a"
                    strokeWidth=".5"
                    fontSize="17"
                    fontWeight="bold"
                  >
                    {name}
                  </text>
                </g>
              );
            })}
        </svg>
      ) : (
        <p className="p-6 text-slate-500">
          This reference image is missing. Return to Teach to restore it.
        </p>
      )}
    </figure>
  );
}
