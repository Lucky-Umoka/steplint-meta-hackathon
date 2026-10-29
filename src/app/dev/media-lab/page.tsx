import { notFound } from "next/navigation";
import MediaLab from "./media-lab";

export const dynamic = "force-dynamic";
export default function MediaLabPage() {
  if (process.env.NODE_ENV !== "development" && process.env.ENABLE_MEDIA_LAB !== "1") notFound();
  return <MediaLab />;
}
