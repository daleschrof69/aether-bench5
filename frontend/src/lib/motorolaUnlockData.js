// Extract only successful output from the most recent unlock-data command.
// Fastboot writes the device data on stderr on many platforms; the console
// keeps both streams, so accept either. Never derive a code from a failed job.
const START = ">>> EXECUTING (LIVE): Read Motorola Unlock Data";
const SUCCESS = "Read Motorola Unlock Data completed (exit 0).";
const FAILURE = "Read Motorola Unlock Data failed (exit ";

export function motorolaUnlockDataFromLogs(logs) {
  const entries = logs.filter((entry) => entry.action === "motorola_unlock_data");
  let start = -1;
  entries.forEach((entry, index) => {
    if (entry.text === START) start = index;
  });
  if (start < 0) return "";
  const run = entries.slice(start + 1);
  const end = run.findIndex((entry) => entry.text === SUCCESS || entry.text.startsWith(FAILURE));
  if (end < 0 || run[end].text !== SUCCESS) return "";
  const parts = run.slice(0, end).map(({ text }) => {
    const match = /^\s*(?:\(bootloader\)|INFO)\s*([0-9a-fA-F#]+)\s*$/.exec(text);
    return match ? match[1] : "";
  }).filter(Boolean);
  const data = parts.join("");
  return data.length >= 20 ? data : "";
}
