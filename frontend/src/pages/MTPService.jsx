import React, { useState } from "react";
import { Usb, Smartphone, Info, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useApp } from "../context/AppContext";
import { ActionGrid, MTP_ACTIONS } from "../components/ActionGrid";
import { Console } from "../components/Console";

const DEMO_DEVICES = [
  { bus: 3, addr: 5, vid: "18d1", pid: "4ee1", mode: "Android MTP", manufacturer: "Google", product: "Pixel" },
];

export default function MTPService() {
  const { cliBridge, pushLog, runAction } = useApp();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [demoMode, setDemoMode] = useState(false);

  const bridgeOnline = cliBridge?.status === "connected";

  const detect = async () => {
    if (!bridgeOnline || typeof cliBridge.call !== "function") {
      // Demo fallback so the UI can be previewed without the CLI bridge.
      setDemoMode(true);
      setScanning(true);
      pushLog?.("INFO", "Bridge offline — showing demo MTP detection.");
      await new Promise((r) => setTimeout(r, 600));
      setResult({ detected: true, count: 1, devices: DEMO_DEVICES, demo: true });
      setScanning(false);
      return;
    }
    setDemoMode(false);
    setScanning(true);
    setResult(null);
    pushLog?.("INFO", "Scanning for MTP devices via local bridge ...");
    try {
      const res = await cliBridge.call("mtp.detect", {});
      const devices = Array.isArray(res?.devices) ? res.devices : [];
      const detected = Boolean(res?.detected) || devices.length > 0;
      setResult({ detected, count: res?.count ?? devices.length, devices });
      if (detected) {
        pushLog?.("SUCCESS", `MTP: ${devices.length} device(s) detected.`);
      } else {
        pushLog?.("INFO", "No MTP device detected.");
      }
    } catch (e) {
      const msg = e?.message || String(e);
      setResult({ error: msg });
      pushLog?.("ERROR", `MTP detect failed: ${msg}`);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div data-testid="mtp-page" className="h-full flex flex-col gap-4 p-4 overflow-y-auto">
      <div className="bg-[#09090B] border border-white/10 p-5 flex items-center gap-4 flex-shrink-0">
        <div className="w-12 h-12 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center">
          <Usb className="w-6 h-6 text-[#00FF41]" strokeWidth={1.8} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">MTP Mode</h1>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/40 mt-1">
            Media Transfer Protocol · file transfer detection
          </p>
        </div>
        <button
          data-testid="mtp-detect-btn"
          onClick={detect}
          disabled={scanning}
          className="h-10 px-4 border border-[#00FF41]/40 bg-[#00FF41]/5 hover:bg-[#00FF41]/15 text-[#00FF41] font-mono text-[11px] tracking-[0.18em] uppercase transition-colors disabled:opacity-40 flex items-center justify-center gap-2 flex-shrink-0"
          title="Scan for Android MTP devices via the local Aether CLI bridge."
        >
          {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Usb className="w-3.5 h-3.5" />}
          {scanning ? "Scanning…" : "Detect MTP"}
        </button>
      </div>

      {demoMode && (
        <div className="bg-[#4d8bff]/5 border border-[#4d8bff]/30 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <Info className="w-4 h-4 text-[#4d8bff]" strokeWidth={2} />
          <span className="font-mono text-xs text-[#a9c7ff]/85">
            Demo mode — CLI bridge is offline. Showing sample MTP detection. Start <code className="text-white">aether-cli serve</code> for live results.
          </span>
        </div>
      )}

      {!bridgeOnline && !demoMode && (
        <div className="bg-yellow-400/5 border border-yellow-400/30 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <XCircle className="w-4 h-4 text-yellow-400" strokeWidth={2} />
          <span className="font-mono text-xs text-yellow-200/80">
            Local CLI bridge is offline. Click Detect MTP for a demo preview, or run <code className="text-white">aether-cli serve</code> for live detection.
          </span>
        </div>
      )}

      {result?.error && (
        <div className="bg-red-500/5 border border-red-500/30 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <XCircle className="w-4 h-4 text-red-400" strokeWidth={2} />
          <span className="font-mono text-xs text-red-200/80">{result.error}</span>
        </div>
      )}

      {result && !result.error && (
        <div
          className={`border px-4 py-3 flex-shrink-0 ${
            result.detected
              ? "bg-[#00FF41]/5 border-[#00FF41]/30"
              : "bg-white/5 border-white/10"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            {result.detected ? (
              <CheckCircle2 className="w-4 h-4 text-[#00FF41]" />
            ) : (
              <Info className="w-4 h-4 text-white/50" />
            )}
            <span className="font-mono text-xs text-white/80">
              {result.detected
                ? `${result.count} MTP device(s) detected${result.demo ? " (demo)" : ""}`
                : "No MTP device detected"}
            </span>
          </div>
          {result.detected && result.devices.length > 0 && (
            <ul className="space-y-1.5 mt-2">
              {result.devices.map((d, i) => (
                <li
                  key={`${d.vid}-${d.pid}-${d.bus}-${d.addr}-${i}`}
                  className="font-mono text-[11px] text-white/70 flex items-center gap-2"
                >
                  <Smartphone className="w-3.5 h-3.5 text-[#00FF41]" />
                  <span>
                    bus {d.bus} · addr {d.addr} | {d.vid}:{d.pid} | {d.mode || "MTP"} |{" "}
                    {d.manufacturer || "—"} {d.product || ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!result.detected && (
            <p className="font-mono text-[11px] text-white/45 mt-1">
              Enable File Transfer / MTP on the phone and retry.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-shrink-0">
        <div className="lg:col-span-7">
          <ActionGrid platform="MTP" actions={MTP_ACTIONS} title="MTP Operations" />
        </div>
        <div className="lg:col-span-5 min-h-[280px]">
          <Console height="h-full" />
        </div>
      </div>

      <div className="border border-white/10 bg-[#09090B] p-4">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-[#00FF41] mt-0.5 flex-shrink-0" />
          <div className="space-y-2 text-sm text-white/70">
            <p>
              MTP mode lets the device expose its storage over USB so files can be
              transferred without ADB or root.
            </p>
            <p className="font-mono text-[11px] text-white/50">
              Detection runs via the local CLI bridge method{" "}
              <code className="text-[#00FF41]">mtp.detect</code>.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border border-white/10 bg-[#09090B] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Smartphone className="w-4 h-4 text-white/60" />
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/40">
              Common signatures
            </span>
          </div>
          <ul className="font-mono text-[11px] text-white/60 space-y-1">
            <li>18d1:4ee1–4ee7 — Android MTP / ADB+MTP</li>
            <li>04e8:6860 / 6865 / 6866 — Samsung MTP</li>
            <li>2717:ff40 / ff48 — Xiaomi MTP</li>
          </ul>
        </div>
        <div className="border border-white/10 bg-[#09090B] p-4">
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/40 mb-2">
            How to enter
          </div>
          <ol className="text-sm text-white/70 space-y-1 list-decimal list-inside">
            <li>Connect the phone via USB</li>
            <li>Pull down the notification shade</li>
            <li>Tap the USB notification</li>
            <li>Select File Transfer / MTP</li>
          </ol>
        </div>
      </div>
    </div>
  );
}