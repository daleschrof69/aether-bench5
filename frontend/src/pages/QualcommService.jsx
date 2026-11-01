import React from "react";
import { ActionGrid, QC_ACTIONS } from "../components/ActionGrid";
import { DeviceInfoPanel } from "../components/DeviceInfoPanel";
import { Console } from "../components/Console";
import { useApp } from "../context/AppContext";
import { Radio, AlertTriangle, Zap, Usb, Loader2 } from "lucide-react";

const SUPPORTED = [
  "SM6115", "SM6225", "SM6375", "SM7125", "SM7150", "SM7250", "SM7325",
  "SM7350", "SM7450", "SM7475", "SM8150", "SM8250", "SM8350", "SM8450",
  "SM8475", "SM8550", "SM8650", "SDM660", "SDM845", "SDA845",
  // Snapdragon 2024+
  "SM8750 (8 Gen 4)", "SM8650-AC", "SM7675 (7 Gen 3)",
  "SM7650 (7s Gen 3)", "SM7635 (7s Gen 2)", "SM4450 (4 Gen 2)",
  "SM6650 (6s Gen 3)", "SM7330 (4 Gen 2 Lite)", "SM8635 (8s Gen 3)",
  "SM7475-AC (7+ Gen 3)", "SC8380XP (X Elite)", "SC8280XP (8cx Gen 3)",
];

export default function QualcommService() {
  const { device, status, startSearch } = useApp();
  const matches = device && device.platform === "Qualcomm";

  return (
    <div data-testid="qualcomm-page" className="h-full flex flex-col gap-3 p-4 overflow-y-auto">
      <div className="bg-[#09090B] border border-white/10 p-5 flex items-center gap-4 flex-shrink-0">
        <div className="w-12 h-12 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center">
          <Radio className="w-6 h-6 text-[#00FF41]" strokeWidth={1.8} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Qualcomm Service Module</h1>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/40 mt-1">
            EDL 9008 • Sahara/Firehose v3.0 • QFIL protocol
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Connected</div>
          <div className={`text-sm font-semibold ${matches ? "text-[#00FF41]" : "text-white/70"}`}>
            {device ? device.model.split(" ")[0] : "—"}
          </div>
        </div>
        {!matches && (
          <button
            data-testid="qualcomm-connect-btn"
            onClick={() => startSearch("QC")}
            disabled={status === "searching"}
            className="h-10 px-4 border border-[#00FF41]/40 bg-[#00FF41]/5 hover:bg-[#00FF41]/15 text-[#00FF41] font-mono text-[11px] tracking-[0.18em] uppercase transition-colors disabled:opacity-40 flex items-center justify-center gap-2 flex-shrink-0"
            title="Scan for a Qualcomm device in EDL 9008 mode via the local Aether CLI bridge."
          >
            {status === "searching" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Usb className="w-3.5 h-3.5" />}
            {status === "searching" ? "Scanning…" : "Connect Qualcomm"}
          </button>
        )}
      </div>

      {!matches && status === "connected" && (
        <div className="bg-yellow-400/5 border border-yellow-400/30 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-yellow-400" strokeWidth={2} />
          <span className="font-mono text-xs text-yellow-200/80">
            Connected device is not Qualcomm. Switch to MTK Service or reconnect target.
          </span>
        </div>
      )}

      <div
        data-testid="edl-no-cable-note"
        className="bg-[#4d8bff]/5 border border-[#4d8bff]/25 px-4 py-2.5 flex items-start gap-3 flex-shrink-0"
      >
        <Zap className="w-4 h-4 text-[#4d8bff] mt-0.5 flex-shrink-0" strokeWidth={2} />
        <span className="font-mono text-[11px] text-[#a9c7ff]/85 leading-relaxed">
          <b className="text-white">EDL without a cable:</b> hit <b>Enter EDL (no cable)</b> below — it runs
          <code className="bg-black/40 px-1 mx-1">adb reboot edl</code> or
          <code className="bg-black/40 px-1 mx-1">fastboot oem edl</code>. A deep-flash cable is only needed for a
          hard-bricked unit; otherwise short the board test-point (ISP) to GND while plugging in.
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-shrink-0">
        <div className="lg:col-span-8">
          <ActionGrid platform="Qualcomm" actions={QC_ACTIONS} title="Qualcomm Operations" />
        </div>
        <div className="lg:col-span-4">
          <DeviceInfoPanel />
        </div>
      </div>

      <div className="bg-[#09090B] border border-white/10 p-4 flex-shrink-0">
        <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/50 mb-3">
          Supported chipsets · {SUPPORTED.length}
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
          {SUPPORTED.map((s) => (
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
      </div>

      <div className="flex-1 min-h-0">
        <Console height="h-full" />
      </div>
    </div>
  );
}
