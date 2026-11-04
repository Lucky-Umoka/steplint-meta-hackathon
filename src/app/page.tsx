import Link from "next/link";
import GuideAvatar from "@/components/GuideAvatar";
import Workspace from "@/components/workspace";

const FLOW = ["Record", "Felicity checks", "Approve", "Practice", "Goal verified"];

export default function Home() {
  return (
    <Workspace mode="home">
      <div className="mx-auto grid max-w-6xl items-center gap-10 py-6 md:min-h-[calc(100dvh-9rem)] md:grid-cols-[1.1fr_0.9fr] md:py-4">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-sm font-semibold text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Demonstrate. Review. Practice.
          </p>
          <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-slate-950 md:text-[3.4rem]">
            A clear guide,
            <br />
            <span className="bg-gradient-to-r from-emerald-600 to-sky-600 bg-clip-text text-transparent">
              one step at a time.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            Turn a demonstration into a reviewed visual guide. Practice with your
            camera and follow the next step.
          </p>
          <ol
            aria-label="How StepLint works"
            className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm font-medium text-slate-600"
          >
            {FLOW.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 shadow-[0_1px_2px_rgb(15_23_42/0.05)]">
                  {step}
                </span>
                {i < FLOW.length - 1 && (
                  <span aria-hidden="true" className="text-slate-300">
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Link
              href="/teach"
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_8px_24px_-12px_rgb(15_23_42/0.12)] transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_12px_32px_-12px_rgb(16_185_129/0.35)]"
            >
              <span
                aria-hidden="true"
                className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="6" width="13" height="12" rx="2" />
                  <path d="M16 10l5-3v10l-5-3" />
                </svg>
              </span>
              <h2 className="text-lg font-bold text-slate-900">Create a guide</h2>
              <p className="mt-1.5 text-slate-600">
                Show the process. Review the steps and goal.
              </p>
              <span className="mt-5 inline-block font-semibold text-emerald-700 transition group-hover:translate-x-0.5">
                Open Teach →
              </span>
            </Link>
            <Link
              href="/practice"
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_8px_24px_-12px_rgb(15_23_42/0.12)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_12px_32px_-12px_rgb(14_165_233/0.35)]"
            >
              <span
                aria-hidden="true"
                className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8.5 12.5l2.5 2.5 4.5-5" />
                </svg>
              </span>
              <h2 className="text-lg font-bold text-slate-900">Practice a guide</h2>
              <p className="mt-1.5 text-slate-600">
                Choose a saved guide and start your camera.
              </p>
              <span className="mt-5 inline-block font-semibold text-sky-700 transition group-hover:translate-x-0.5">
                Open Practice →
              </span>
            </Link>
          </div>
          <p className="mt-6 text-sm text-slate-500">
            Preview: verifies supported visible changes. Guides are saved in this
            browser.
          </p>
        </div>
        <div className="hidden md:block">
          <div className="relative h-[30rem] overflow-hidden rounded-3xl shadow-[0_30px_80px_-30px_rgb(8_47_73/0.6)] ring-1 ring-slate-900/10">
            <GuideAvatar
              mode="idle"
              speech="silent"
              caption="Hi, I'm Gideon. I'll watch each step and tell you the moment it's verified."
              artClassName="mx-auto h-80 w-72"
            />
          </div>
        </div>
      </div>
    </Workspace>
  );
}
