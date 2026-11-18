import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useOperationSound } from "./useOperationSound";

let root, sound, context, oscillator, gain, originalAudio;
function Harness() { sound = useOperationSound(); return null; }
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  originalAudio = window.AudioContext;
  oscillator = {frequency:{}, connect:jest.fn(), disconnect:jest.fn(), start:jest.fn(), stop:jest.fn()};
  gain = {gain:{setValueAtTime:jest.fn(), exponentialRampToValueAtTime:jest.fn()}, connect:jest.fn(), disconnect:jest.fn()};
  context = {state:"running", currentTime:0, resume:jest.fn(), close:jest.fn(), createOscillator:jest.fn(() => oscillator), createGain:jest.fn(() => gain)};
  window.AudioContext = jest.fn(() => context);
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
});
afterEach(() => { act(() => root.unmount()); window.AudioContext = originalAudio; });
test("sound is opt-in, distinguishes results, and stops when disabled", () => {
  sound.playOperationSound(true);
  expect(context.createOscillator).not.toHaveBeenCalled();
  act(() => sound.setSoundEnabled(true));
  expect(context.resume).toHaveBeenCalled();
  sound.playOperationSound(true);
  expect(oscillator.frequency.value).toBe(880);
  expect(oscillator.stop).toHaveBeenCalledWith(0.2);
  sound.playOperationSound(false);
  expect(oscillator.frequency.value).toBe(220);
  act(() => sound.setSoundEnabled(false));
  sound.playOperationSound(true);
  expect(context.createOscillator).toHaveBeenCalledTimes(2);
});
test("an audio failure cannot propagate into an operation", () => {
  act(() => sound.setSoundEnabled(true));
  context.createOscillator.mockImplementation(() => { throw new Error("audio unavailable"); });
  expect(() => sound.playOperationSound(true)).not.toThrow();
});
