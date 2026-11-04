import Link from "next/link";
export default function Workspace({
  children,
  mode,
  fitScreen = false,
}: {
  children: React.ReactNode;
  mode: "teach" | "practice" | "home";
  /** Desktop: fit the page to one screen height (Practice camera view). */
  fitScreen?: boolean;
}) {
  return (
    <div
      className={`min-h-dvh bg-[radial-gradient(1200px_600px_at_10%_-10%,rgb(16_185_129/0.07),transparent_60%),radial-gradient(900px_500px_at_100%_0%,rgb(14_165_233/0.06),transparent_60%)] bg-slate-50 text-slate-900 ${fitScreen ? "md:flex md:h-dvh md:flex-col" : ""}`}
    >
      <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200/70 bg-white/75 backdrop-blur-md supports-[backdrop-filter]:bg-white/60">
        <div
          className={`mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 ${fitScreen ? "py-2" : "py-4"}`}
        >
          <Link
            href="/"
            className="flex items-center gap-2.5 text-xl font-bold tracking-tight"
          >
            <span
              aria-hidden="true"
              className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 shadow-[0_2px_8px_-2px_rgb(15_23_42/0.5)] ring-1 ring-white/10"
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none">
                <path
                  d="M5 12.5l4 4 10-10"
                  stroke="#34d399"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            StepLint
            <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              Preview · v{process.env.NEXT_PUBLIC_APP_VERSION}
            </span>
          </Link>
          <nav
            aria-label="Main navigation"
            className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100/70 p-1"
          >
            <Link
              aria-current={mode === "teach" ? "page" : undefined}
              className={`rounded-lg px-4 font-medium transition ${fitScreen ? "py-1" : "py-1.5"} ${mode === "teach" ? "bg-white text-slate-900 shadow-[0_1px_3px_rgb(15_23_42/0.12)] ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-900"}`}
              href="/teach"
            >
              Teach
            </Link>
            <Link
              aria-current={mode === "practice" ? "page" : undefined}
              className={`rounded-lg px-4 font-medium transition ${fitScreen ? "py-1" : "py-1.5"} ${mode === "practice" ? "bg-white text-slate-900 shadow-[0_1px_3px_rgb(15_23_42/0.12)] ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-900"}`}
              href="/practice"
            >
              Practice
            </Link>
          </nav>
        </div>
      </header>
      <main
        className={`flow-workspace mx-auto ${mode === "practice" ? `w-full px-4 ${fitScreen ? "py-2 md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-y-auto" : "py-3"}` : "max-w-7xl px-5 py-6"}`}
      >
        {children}
      </main>
    </div>
  );
}
