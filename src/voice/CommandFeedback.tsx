export default function CommandFeedback({
  feedback,
  commands,
  onRestart,
}: {
  feedback: string;
  commands: string[];
  onRestart?: () => void;
}) {
  return (
    <div className="mt-2 text-sm">
      {feedback && (
        <p
          role="status"
          data-testid="voice-command-feedback"
          className="rounded-lg bg-slate-50 p-2 text-slate-800"
        >
          {feedback}
        </p>
      )}
      {onRestart && (
        <button type="button" onClick={onRestart}>
          Restart listening
        </button>
      )}
      <details className="mt-2 text-xs text-slate-600">
        <summary>Voice commands for this screen</summary>
        <p className="mt-1">
          Begin with “Guide” or “StepLint” (including “step lint”). Commands
          control the interface; they never verify a step.
        </p>
        <ul className="mt-1 list-inside list-disc">
          {commands.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
