import { useEffect } from "react";
import { useVoice } from "@/lib/voice/store";

/**
 * F1 toggles microphone capture. It never resolves an open matching decision
 * and never writes data; typed content in inputs stays untouched.
 */
export function VoiceHotkeys() {
  const toggle = useVoice((s) => s.toggleListening);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F1" || e.repeat) return;
      // Browsers may reserve F1 for help; preventDefault works in most of them.
      e.preventDefault();
      e.stopPropagation();
      toggle();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [toggle]);

  return null;
}
