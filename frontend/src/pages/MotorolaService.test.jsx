import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "../context/AppContext";
import MotorolaService from "./MotorolaService";
import { motorolaUnlockDataFromLogs } from "../lib/motorolaUnlockData";

const mockBridge = {
  status: "connected", info: {},
  call: jest.fn(async () => ({ devices: [], phones: [] })),
  runJob: jest.fn(),
};
jest.mock("../hooks/useCliBridge", () => ({ useCliBridge: () => mockBridge }));
jest.mock("../hooks/useWebUsb", () => ({ useWebUsb: () => ({ supported: false }) }));
jest.mock("../hooks/useOperationSound", () => ({ useOperationSound: () => ({ soundEnabled: false, setSoundEnabled: jest.fn(), playOperationSound: jest.fn() }) }));
jest.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: false, http: {}, noteCredits: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() } }));

let root, container, clipboardDescriptor;
const tag = (text, action = "motorola_unlock_data") => ({ text, action });
const start = tag(">>> EXECUTING (LIVE): Read Motorola Unlock Data");
const done = tag("Read Motorola Unlock Data completed (exit 0).");
const sample = ["(bootloader) 0123456789ABCDEF0123", "(bootloader) 456789ABCDEF#01234567"];

beforeEach(async () => {
  jest.useFakeTimers();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockBridge.runJob.mockReset();
  mockBridge.call.mockClear();
  mockBridge.status = "connected";
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<AppProvider><MotorolaService /></AppProvider>));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else delete navigator.clipboard;
  jest.clearAllTimers();
  jest.useRealTimers();
});

test.each([
  ["motorola-adb-devices", "adb", ["devices", "-l"]],
  ["motorola-fastboot-devices", "fastboot", ["devices"]],
  ["motorola-product", "fastboot", ["getvar", "product"]],
  ["motorola-bootloader-version", "fastboot", ["getvar", "version-bootloader"]],
  ["motorola-unlock-status", "fastboot", ["getvar", "unlocked"]],
  ["motorola-secure-status", "fastboot", ["getvar", "secure"]],
  ["motorola-fastboot-info", "fastboot", ["getvar", "all"]],
])("%s runs its actual read-only CLI command without a selected device", async (id, tool, args) => {
  mockBridge.runJob.mockImplementation(async (_method, _params, event) => { event({ stream: "done", exit_code: 0 }); return 0; });
  await act(async () => container.querySelector(`[data-testid="${id}"]`).click());
  expect(mockBridge.runJob).toHaveBeenCalledWith("official.run", { tool, args }, expect.any(Function));
});

test("unlock data comes from completed fastboot output and can be copied", async () => {
  const writeText = jest.fn().mockResolvedValue();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  mockBridge.runJob.mockImplementation(async (_method, _params, event) => {
    for (const line of sample) event({ stream: "stderr", line });
    event({ stream: "done", exit_code: 0 });
    return 0;
  });
  await act(async () => container.querySelector('[data-testid="motorola-unlock-data"]').click());
  expect(mockBridge.runJob).toHaveBeenCalledWith("official.run", { tool: "fastboot", args: ["oem", "get_unlock_data"] }, expect.any(Function));
  const expected = "0123456789ABCDEF0123456789ABCDEF#01234567";
  expect(container.querySelector('[data-testid="motorola-unlock-value"]').textContent).toBe(expected);
  await act(async () => container.querySelector('[data-testid="motorola-copy-unlock-data"]').click());
  expect(writeText).toHaveBeenCalledWith(expected);
  expect(container.querySelector('[role="status"]').textContent).toMatch(/copied/i);
});

test("clipboard denial offers manual copying", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: jest.fn().mockRejectedValue(new Error("denied")) } });
  mockBridge.runJob.mockImplementation(async (_method, _params, event) => {
    sample.forEach((line) => event({ stream: "stderr", line }));
    event({ stream: "done", exit_code: 0 });
    return 0;
  });
  await act(async () => container.querySelector('[data-testid="motorola-unlock-data"]').click());
  await act(async () => container.querySelector('[data-testid="motorola-copy-unlock-data"]').click());
  expect(container.querySelector('[role="status"]').textContent).toMatch(/copy it manually/i);
});

test("never copies stale, incomplete, failed, or unrelated output", () => {
  const lines = [start, ...sample.map((text) => tag(text)), done];
  expect(motorolaUnlockDataFromLogs(lines)).toBe("0123456789ABCDEF0123456789ABCDEF#01234567");
  expect(motorolaUnlockDataFromLogs([...lines, start, tag(sample[0])])).toBe("");
  expect(motorolaUnlockDataFromLogs([...lines, start, tag(sample[0]), tag("Read Motorola Unlock Data failed (exit 1).")])).toBe("");
  expect(motorolaUnlockDataFromLogs([start, tag(sample[0], "another_action"), done])).toBe("");
  expect(motorolaUnlockDataFromLogs([start, tag("(bootloader) unlock data not supported"), done])).toBe("");
});
