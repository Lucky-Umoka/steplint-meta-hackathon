"use client";
import { useState } from "react";
import { useVoicePreference } from "./voice-preference";
import CommandFeedback from "./CommandFeedback";
import { useVoiceControl, type VoiceEvent } from "./use-voice-control";
import VoicePanel, { appendVoiceEvent } from "./VoicePanel";
import type { VoiceCommand } from "./commands";
/** Stage actions use the same host guards as buttons. Recognition is never approval. */
export default function ActionControls({
  commands,
  onAction,
}: {
  commands: VoiceCommand[];
  onAction: (id: string) => { applied: boolean; message: string };
}) {
  const [enabled, setEnabled] = useVoicePreference(),
    [events, setEvents] = useState<VoiceEvent[]>([]),
    [notice, setNotice] = useState("");
  const voice = useVoiceControl({
    commands,
    enabled,
    onAction: (id, disposition) => {
      if (disposition !== "executed") return false;
      const { applied, message } = onAction(id);
      setNotice(message);
      setEvents((old) =>
        appendVoiceEvent(old, {
          at: Date.now(),
          source: "control",
          text: message,
        }),
      );
      return applied;
    },
    onEvent: (event) => setEvents((old) => appendVoiceEvent(old, event)),
  });
  return (
    <div className="space-y-2 rounded border p-3">
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enable voice controls for this stage
      </label>
      <p>{commands.map((c) => `“Guide, ${c.phrases[0]}”`).join("; ")}</p>
      <p>Voice control: {voice.status}</p>
      <p role="status">{notice || voice.feedback}</p>
      <CommandFeedback
        feedback={voice.feedback}
        commands={voice.availableCommands}
        onRestart={
          voice.status === "error" || voice.status === "denied"
            ? voice.restart
            : undefined
        }
      />
      <VoicePanel events={events} />
    </div>
  );
}
