"use client";
import { useRef } from "react";
import type { VoiceCommand } from "./commands";

/**
 * Button plus modal manual of every voice command (and gesture) the page
 * accepts, generated from the same allowlist the parser uses, so the manual
 * can never drift from what actually executes.
 */
export default function CommandHelp({
  commands,
  gestures,
}: {
  commands: VoiceCommand[];
  gestures: { gesture: string; action: string }[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        className="rounded border px-2 py-0.5 text-xs font-medium"
        onClick={() => dialog.current?.showModal()}
      >
        Voice &amp; gesture commands
      </button>
      <dialog
        ref={dialog}
        aria-label="Voice and gesture commands"
        className="fixed inset-0 m-auto h-fit max-h-[85dvh] w-[min(92vw,34rem)] overflow-y-auto rounded-xl p-4 backdrop:bg-black/40"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <h2 className="text-lg font-bold">Voice commands</h2>
        <p className="mt-1 text-sm text-slate-700">
          Turn on <strong>Enable microphone voice controls</strong>, then say a
          command. Start with <strong>“Guide”</strong> (for example “Guide,
          pause”) for the most reliable result. A short command on its own,
          such as “pause”, also works when the guide has not just said it.
        </p>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr>
              <th className="pr-2">Say</th>
              <th>Also accepted</th>
            </tr>
          </thead>
          <tbody>
            {commands.map((command) => (
              <tr key={command.id} className="border-t align-top">
                <td className="py-1 pr-2 font-medium">
                  “Guide, {command.phrases[0]}”
                  {command.destructive && command.confirmPhrase
                    ? ` then “Guide, ${command.confirmPhrase}”`
                    : ""}
                </td>
                <td className="py-1 text-slate-600">
                  {command.phrases.slice(1).join(", ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2 className="mt-4 text-lg font-bold">Gestures</h2>
        <ul className="mt-1 list-disc pl-5 text-sm">
          {gestures.map((item) => (
            <li key={item.gesture}>
              <strong>{item.gesture}</strong>: {item.action}
            </li>
          ))}
        </ul>
        <form method="dialog" className="mt-4 text-right">
          <button type="submit" className="rounded border px-3 py-1">
            Close
          </button>
        </form>
      </dialog>
    </>
  );
}
