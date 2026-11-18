import { useCallback, useEffect, useRef, useState } from "react";

export function useOperationSound() {
  const [soundEnabled, setEnabled] = useState(false);
  const audio = useRef(null);
  const enabled = useRef(false);
  const setSoundEnabled = useCallback((value) => {
    enabled.current = Boolean(value);
    setEnabled(enabled.current);
    if (!value) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!audio.current) audio.current = new Audio();
      // Resume during the setting button's user gesture so later job events can play.
      Promise.resolve(audio.current.resume()).catch(() => {});
    } catch {
      // Sound availability must not prevent a device operation.
    }
  }, []);
  const playOperationSound = useCallback((success) => {
    const context = audio.current;
    if (!enabled.current || !context || context.state !== "running") return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = success ? 880 : 220;
      gain.gain.setValueAtTime(0.08, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
    } catch {
      // Audio failures do not change the operation result.
    }
  }, []);
  useEffect(() => () => {
    if (audio.current) Promise.resolve(audio.current.close()).catch(() => {});
    audio.current = null;
  }, []);
  return { soundEnabled, setSoundEnabled, playOperationSound };
}
