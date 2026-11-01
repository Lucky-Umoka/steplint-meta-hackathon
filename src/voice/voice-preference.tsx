"use client";
import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

const VoicePreference = createContext<
  [boolean, Dispatch<SetStateAction<boolean>>] | null
>(null);
/** One Teach flow keeps its opt-in across recorder, processing and review stages. */
export function VoicePreferenceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const preference = useState(false);
  return (
    <VoicePreference.Provider value={preference}>
      {children}
    </VoicePreference.Provider>
  );
}
export function useVoicePreference() {
  const shared = useContext(VoicePreference);
  const local = useState(false);
  return shared ?? local;
}
