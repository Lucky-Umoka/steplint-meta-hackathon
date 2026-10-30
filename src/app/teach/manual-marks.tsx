"use client";
import { useEffect, useState } from "react";
import type { LessonMedia, Selection } from "@/teach/schema";
import { frameImage } from "@/teach/media";
import FrameMark from "./frame-mark";
export default function ManualMarks({
  video,
  media,
  value,
  onChange,
}: {
  video: Blob;
  media: LessonMedia;
  value: Selection[];
  onChange: (s: Selection[]) => void;
}) {
  const [frame, setFrame] = useState(0),
    [image, setImage] = useState(""),
    [label, setLabel] = useState(""),
    [mode, setMode] = useState<"point" | "box">("box"),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void frameImage(video, media.frameTimesMs[frame])
      .then((url) => {
        if (live) {
          setImage(url);
          setError("");
        }
      })
      .catch(() => {
        if (live) {
          setImage("");
          setError("This frame could not be decoded. Choose a nearby moment.");
        }
      });
    return () => {
      live = false;
    };
  }, [video, media, frame]);
  const size = media.info.video;
  if (!size) return null;
  return (
    <details className="rounded-xl border p-4">
      <summary>Help AI find an object (optional)</summary>
      <p className="my-2 text-sm text-slate-600">
        Usually automatic. To correct the starting marks, name each relevant
        object and draw around its full visible outline. Use a point on solid
        material for a thin rim. Up to six objects.
      </p>
      <label className="block">
        Object name
        <input
          value={label}
          maxLength={100}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="For example, phone cover"
        />
      </label>
      <label className="my-3 block text-sm">
        Mark with
        <select
          aria-label="Mark method"
          value={mode}
          onChange={(e) =>
            setMode(e.target.value === "point" ? "point" : "box")
          }
          className="ml-2 rounded border p-2"
        >
          <option value="box">Object outline</option>
          <option value="point">Foreground point</option>
        </select>
      </label>
      <label className="my-3 block text-sm">
        Source moment · {(media.frameTimesMs[frame] / 1000).toFixed(1)}s
        <input
          className="w-full"
          type="range"
          min={0}
          max={media.frameTimesMs.length - 1}
          value={frame}
          onChange={(e) => setFrame(Number(e.target.value))}
        />
      </label>
      {image && (
        <FrameMark
          image={image}
          width={size.width}
          height={size.height}
          mode={mode}
          mark={null}
          onMark={(mark) => {
            if (label.trim() && value.length < 6) {
              onChange([
                ...value,
                {
                  id: `component-${value.length + 1}`,
                  description: label.trim(),
                  frame,
                  mark,
                },
              ]);
              setLabel("");
            }
          }}
        />
      )}
      {error && (
        <p role="status" className="text-sm text-amber-800">
          {error}
        </p>
      )}
      <ul className="my-3 space-y-1">
        {value.map((s) => (
          <li key={s.id}>
            {s.description} · {(media.frameTimesMs[s.frame] / 1000).toFixed(1)}s
            <button
              className="ml-2"
              aria-label={`Remove mark for ${s.description}`}
              onClick={() =>
                onChange(
                  value
                    .filter((part) => part.id !== s.id)
                    .map((part, i) => ({ ...part, id: `component-${i + 1}` })),
                )
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {value.length > 0 && (
        <button onClick={() => onChange([])}>
          Use automatic marks instead
        </button>
      )}
    </details>
  );
}
