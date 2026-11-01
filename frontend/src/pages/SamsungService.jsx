import React from "react";
import { ActionGrid, SAMSUNG_ACTIONS } from "../components/ActionGrid";
import { DeviceInfoPanel } from "../components/DeviceInfoPanel";
import { Console } from "../components/Console";
import { useApp } from "../context/AppContext";
import { Smartphone, AlertTriangle, ShieldAlert, Usb, Loader2 } from "lucide-react";

// Models where Heimdall partition writes still succeed reliably (Knox 2.x
// and earlier). Newer models may fall through to read-only operations.
const KNOWN_GOOD = [
  "Galaxy S7", "Galaxy S8", "Galaxy S9",
  "Galaxy Note 7", "Galaxy Note 8", "Galaxy Note 9",
  "Galaxy A5", "Galaxy A6", "Galaxy A7", "Galaxy A8",
  "Galaxy J3", "Galaxy J5", "Galaxy J7",
  "Galaxy Tab S2", "Galaxy Tab S3", "Galaxy Tab A",
];

const KNOX_LIMITED = [
  "Galaxy S10", "Galaxy S20", "Galaxy S21", "Galaxy S22",
  "Galaxy Note 10", "Galaxy Note 20",
  "Galaxy A11", "Galaxy A21", "Galaxy A31", "Galaxy A51",
];

export default function SamsungService() {
  const { device, status, cliBridge, startSearch, setSetupOpen } = useApp();
  const matches = device && device.platform === "Samsung";
  const heimdallReady = cliBridge?.info?.heimdall;

  return (
    <div data-testid="samsung-page" className="h-full flex flex-col gap-3 p-4 overflow-y-auto">
      {/* Header */}
      <div className="bg-[#09090B] border border-white/10 p-5 flex items-center gap-4 flex-shrink-0">
        <div className="w-12 h-12 border border-[#1f5fdb]/40 bg-[#1f5fdb]/10 flex items-center justify-center">
          <Smartphone className="w-6 h-6 text-[#4d8bff]" strokeWidth={1.8} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Samsung Service Module</h1>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/40 mt-1">
            Odin · Download Mode · Heimdall {heimdallReady || "v?"} · Loke protocol
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
            Heimdall
          </div>
          <div className={`text-sm font-semibold ${heimdallReady ? "text-[#00FF41]" : "text-yellow-400"}`}>
            {heimdallReady ? "READY" : "NOT INSTALLED"}
          </div>
        </div>
        {!matches && (
          <button
            data-testid="samsung-connect-btn"
            onClick={() => startSearch("SAMSUNG")}
            disabled={status === "searching"}
            className="h-10 px-4 border border-[#1f5fdb]/50 bg-[#1f5fdb]/10 hover:bg-[#1f5fdb]/20 text-[#4d8bff] font-mono text-[11px] tracking-[0.18em] uppercase transition-colors disabled:opacity-40 flex items-center justify-center gap-2 flex-shrink-0"
            title="Scan for a Samsung device in Download Mode via the local Aether CLI bridge."
          >
            {status === "searching" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Usb className="w-3.5 h-3.5" />
            )}
            {status === "searching" ? "Scanning…" : "Connect Samsung"}
          </button>
        )}
      </div>

      {/* Setup banner — only when bridge is live but Heimdall isn't found. */}
      {cliBridge?.status === "connected" && !heimdallReady && (
        <div
          data-testid="heimdall-missing-banner"
          className="bg-yellow-400/5 border border-yellow-400/30 px-4 py-3 flex items-start gap-3 flex-shrink-0"
        >
          <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" strokeWidth={2} />
          <div className="flex-1 font-mono text-xs text-yellow-200/80 leading-relaxed">
            <span className="font-bold">Heimdall not detected.</span> Samsung operations need the Heimdall (Odin clone) binary on PATH.{" "}
            <a
              href="https://glassechidna.com.au/heimdall/"
              target="_blank"
              rel="noreferrer"
              className="text-[#00FF41] hover:underline"
            >
              Download for Windows
            </a>
            {" "}· macOS: <code className="bg-black/40 px-1">brew install heimdall</code>
            {" "}· Linux: <code className="bg-black/40 px-1">sudo apt install heimdall-flash</code>
            <button
              data-testid="samsung-run-setup"
              onClick={() => setSetupOpen(true)}
              className="ml-2 underline decoration-dotted text-[#00FF41] hover:text-[#00CC33]"
            >
              Run Setup Wizard
            </button>
          </div>
        </div>
      )}

      {/* Knox limitation warning */}
      <div
        data-testid="samsung-knox-warning"
        className="bg-[#1f5fdb]/[0.04] border border-[#1f5fdb]/20 px-4 py-3 flex items-start gap-3 flex-shrink-0"
      >
        <ShieldAlert className="w-4 h-4 text-[#4d8bff] mt-0.5 flex-shrink-0" strokeWidth={2} />
        <div className="flex-1 font-mono text-[11px] text-white/60 leading-relaxed">
          <span className="text-white/80 font-semibold">Knox compatibility:</span>{" "}
          partition writes (factory reset, Aegis Unlock) succeed reliably on{" "}
          <span className="text-[#00FF41]">Galaxy S9 / Note 9 / older A-series</span>.{" "}
          <span className="text-yellow-300">Galaxy S10–S22</span> may reject writes
          (Knox 3.x signing requirement).{" "}
          <span className="text-red-300">S23+ / current foldables</span> are not supported
          — commercial tooling required.
        </div>
      </div>

      {!matches && status === "connected" && (
        <div className="bg-yellow-400/5 border border-yellow-400/30 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-yellow-400" strokeWidth={2} />
          <span className="font-mono text-xs text-yellow-200/80">
            Connected device is not Samsung. Switch to MTK / Qualcomm / iPhone tab.
          </span>
        </div>
      )}

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-shrink-0">
        <div className="lg:col-span-8">
          <ActionGrid platform="Samsung" actions={SAMSUNG_ACTIONS} title="Samsung Operations" />
        </div>
        <div className="lg:col-span-4">
          <DeviceInfoPanel />
        </div>
      </div>

      {/* Supported models chip cloud */}
      <div className="bg-[#09090B] border border-white/10 p-4 flex-shrink-0">
        <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/50 mb-3">
          Known-good · Heimdall writes succeed
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto">
          {KNOWN_GOOD.map((s) => (
            <span
              key={s}
              className={`font-mono text-[10px] px-2 py-1 border ${
                device?.model?.includes(s)
                  ? "border-[#00FF41]/60 text-[#00FF41] bg-[#00FF41]/10"
                  : "border-white/5 text-white/50"
              }`}
            >
              {s}
            </span>
          ))}
        </div>
        <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-yellow-400/70 mt-4 mb-2">
          Knox 3.x limited · read-only
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-[60px] overflow-y-auto">
          {KNOX_LIMITED.map((s) => (
            <span
              key={s}
              className="font-mono text-[10px] px-2 py-1 border border-yellow-400/10 text-yellow-200/50"
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Console height="h-full" />
      </div>
    </div>
  );
}
