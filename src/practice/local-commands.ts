import type { VoiceCommand } from "../voice/commands";
export const LOCAL_PRACTICE_COMMANDS: VoiceCommand[] = [
  { id: "start-practice", phrases: ["start practice", "start"] },
  { id: "resume-practice", phrases: ["resume practice", "resume"] },
  { id: "end-practice", phrases: ["end practice", "end session"] },
  {
    id: "restart-practice",
    phrases: ["restart practice"],
    destructive: true,
    confirmPhrase: "confirm restart practice",
  },
  { id: "pause-practice", phrases: ["pause", "stop", "stop practice"] },
  { id: "repeat", phrases: ["repeat", "repeat step"] },
  { id: "stop-speaking", phrases: ["stop speaking"] },
];
