import Link from "next/link";
export default function Workspace({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: "teach" | "practice" | "home";
}) {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight">
            StepLint
            <span className="ml-2 text-xs font-normal text-slate-500">
              Preview · v0.3
            </span>
          </Link>
          <nav aria-label="Main navigation" className="flex gap-2">
            <Link
              aria-current={mode === "teach" ? "page" : undefined}
              className={`rounded-lg px-4 py-2 font-medium ${mode === "teach" ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-100"}`}
              href="/teach"
            >
              Teach
            </Link>
            <Link
              aria-current={mode === "practice" ? "page" : undefined}
              className={`rounded-lg px-4 py-2 font-medium ${mode === "practice" ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-100"}`}
              href="/practice"
            >
              Practice
            </Link>
          </nav>
        </div>
      </header>
      <main className="flow-workspace mx-auto max-w-7xl px-5 py-6">
        {children}
      </main>
    </div>
  );
}
