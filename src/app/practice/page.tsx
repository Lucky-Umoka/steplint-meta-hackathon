import Practice from "./practice";
import LocalPractice from "./local-practice";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ legacy?: string; guide?: string; test?: string }>;
}) {
  const query = await searchParams;
  return query.legacy === "1" || !!query.guide || !!query.test ? (
    <Practice />
  ) : (
    <LocalPractice />
  );
}
