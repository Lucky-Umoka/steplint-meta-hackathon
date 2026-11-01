import Teach from "./teach";
import LocalTeach from "./local-teach";
export default async function TeachPage({
  searchParams,
}: {
  searchParams: Promise<{ legacy?: string }>;
}) {
  const query = await searchParams;
  return query.legacy === "1" ? (
    <>
      <aside className="border-b bg-amber-50 p-3 text-sm">
        Previous lesson workflow.{" "}
        <a className="underline" href="/teach">
          Use the new Teach flow
        </a>{" "}
        for local continuous Practice.
      </aside>
      <Teach />
    </>
  ) : (
    <LocalTeach />
  );
}
