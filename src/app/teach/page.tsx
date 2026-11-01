import Teach from "./teach";
import LocalTeach from "./local-teach";
export default async function TeachPage({
  searchParams,
}: {
  searchParams: Promise<{ legacy?: string }>;
}) {
  const query = await searchParams;
  return query.legacy === "1" ? <Teach /> : <LocalTeach />;
}
