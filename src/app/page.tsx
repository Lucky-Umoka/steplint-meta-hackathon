import Link from "next/link";
import Workspace from "@/components/workspace";
export default function Home() {
  return (
    <Workspace mode="home">
      <div className="mx-auto max-w-3xl py-12">
        <p className="mb-3 font-semibold text-emerald-800">
          Demonstrate. Review. Practice.
        </p>
        <h1 className="text-4xl font-bold leading-tight md:text-5xl">
          A clear guide, one step at a time.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-slate-600">
          Turn a demonstration into a reviewed visual guide. Practice with your
          camera and follow the next step.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          <Link
            href="/teach"
            className="rounded-2xl border bg-white p-7 shadow-sm hover:border-emerald-500"
          >
            <h2 className="text-xl font-bold">Create a guide</h2>
            <p className="mt-2 text-slate-600">
              Show the process. Review the steps and goal.
            </p>
            <span className="mt-6 inline-block font-semibold text-emerald-800">
              Open Teach →
            </span>
          </Link>
          <Link
            href="/practice"
            className="rounded-2xl border bg-white p-7 shadow-sm hover:border-emerald-500"
          >
            <h2 className="text-xl font-bold">Practice a guide</h2>
            <p className="mt-2 text-slate-600">
              Choose a saved guide and start your camera.
            </p>
            <span className="mt-6 inline-block font-semibold text-emerald-800">
              Open Practice →
            </span>
          </Link>
        </div>
        <p className="mt-8 text-sm text-slate-500">
          Preview: verifies supported visible changes. Guides are saved in this
          browser.
        </p>
      </div>
    </Workspace>
  );
}
