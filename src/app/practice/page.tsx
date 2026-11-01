import Practice from "./practice";
import LocalPractice from "./local-practice";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ legacy?: string; guide?: string; test?: string }>;
}) {
  const query = await searchParams;
  return query.legacy === "1" || !!query.guide || !!query.test ? (
    <>
      <aside className="border-b bg-amber-50 p-3 text-sm">
        Previous lesson workflow. These existing approvals retain their earlier
        engine.{" "}
        <a className="underline" href="/teach">
          Create and review a local procedure
        </a>{" "}
        to use the new continuous Practice flow.
      </aside>
      <Practice />
    </>
  ) : (
    <LocalPractice />
  );
}
