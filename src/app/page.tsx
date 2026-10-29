export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-slate-900">
      <h1 className="text-4xl font-bold">StepLint</h1>
      <p className="mt-4 text-lg">Visual verification for physical procedures.</p>
      <p className="mt-4">Teach a short lesson and review the generated procedure. Live Practice mode is not implemented.</p>
      <a className="mt-6 mr-6 inline-block underline" href="/teach">Open Teach mode</a>
      <a className="mt-6 inline-block underline focus-visible:outline-2" href="/api/health">Check application health</a>
    </main>
  );
}
