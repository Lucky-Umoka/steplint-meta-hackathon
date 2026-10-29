"use client";
import { useEffect, useState } from "react";
import { frameImage } from "@/teach/media";
import type { EvidenceReference } from "@/procedure/schema";
export default function Reference({ file, source }: { file: File | null; source: EvidenceReference | null }) {
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const key = file && source ? `${file.name}:${file.lastModified}:${source.sourceId}:${source.timestampMs}` : "";
  useEffect(() => { let active = true; if (file && source) void frameImage(file, source.timestampMs).then((url) => { if (active) setImage({ key, url }); }).catch(() => { if (active) setImage(null); }); return () => { active = false; }; }, [file, source, key]);
  return <section className="rounded border p-4"><h2 className="text-xl font-bold">Teaching reference</h2>{source ? <><p>{source.description} — {(source.timestampMs / 1000).toFixed(3)}s</p>{file && image?.key === key ? <svg viewBox="0 0 640 480" role="img" aria-label="Relevant training lesson reference frame"><image href={image.url} width="640" height="480" preserveAspectRatio="xMidYMid meet" /></svg> : <p>Reference frame unavailable. Load and confirm the original teaching MP4. The hand-authored fixture has no real training video.</p>}</> : <p>Select a procedure to see its source reference.</p>}</section>;
}
