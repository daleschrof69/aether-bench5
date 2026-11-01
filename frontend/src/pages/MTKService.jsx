import React from "react";
import { ActionGrid, MTK_ACTIONS } from "../components/ActionGrid";
import { DeviceInfoPanel } from "../components/DeviceInfoPanel";
import { Console } from "../components/Console";
import { useApp } from "../context/AppContext";
import { Cpu, AlertTriangle, Usb, Loader2 } from "lucide-react";

const SUPPORTED = [
  "MT6580", "MT6735", "MT6739", "MT6750", "MT6757", "MT6761", "MT6765",
  "MT6768", "MT6771", "MT6779", "MT6781", "MT6785", "MT6789", "MT6833",
  "MT6853", "MT6873", "MT6877", "MT6885", "MT6889", "MT6893", "MT6895",
  "MT6983", "MT6985",
  // Dimensity 7000/8000/9000 latest
  "MT8676 (D-9400)", "MT6989 (D-9300+)", "MT6897 (D-8300)",
  "MT6896 (D-8200)", "MT6878 (D-7400)", "MT6886 (D-7300X)",
  "MT6877V (D-7050)", "MT6855 (D-7020)", "MT6781V (G99)", "MT6789V (G99+)",
  "MT6833P (D-700)", "MT6835 (D-6300)", "MT6855V (D-6080)",
];

export default function MTKService() {
  const { device, status, startSearch } = useApp();
  const matches = device && device.platform === "MediaTek";

  return (
    <div data-testid="mtk-page" className="h-full flex flex-col gap-3 p-4 overflow-y-auto">
      {/* Header */}
      <div className="bg-[#09090B] border border-white/10 p-5 flex items-center gap-4 flex-shrink-0">
        <div className="w-12 h-12 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center">
          <Cpu className="w-6 h-6 text-[#00FF41]" strokeWidth={1.8} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">MTK Service Module</h1>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/40 mt-1">
            MediaTek BROM • Download Agent v6.2 • SP Flash protocol
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
            data-testid="mtk-connect-btn"
            onClick={() => startSearch("MTK")}
            disabled={status === "searching"}
            className="h-10 px-4 border border-[#00FF41]/40 bg-[#00FF41]/5 hover:bg-[#00FF41]/15 text-[#00FF41] font-mono text-[11px] tracking-[0.18em] uppercase transition-colors disabled:opacity-40 flex items-center justify-center gap-2 flex-shrink-0"
            title="Scan for a MediaTek device in BROM mode via the local Aether CLI bridge."
          >
            {status === "searching" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Usb className="w-3.5 h-3.5" />}
            {status === "searching" ? "Scanning…" : "Connect MTK"}
          </button>
        )}
      </div>

      {!matches && status === "connected" && (
        <div className="bg-yellow-400/5 border border-yellow-400/30 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-yellow-400" strokeWidth={2} />
          <span className="font-mono text-xs text-yellow-200/80">
            Connected device is not MediaTek. Switch to Qualcomm Service or reconnect target.
          </span>
        </div>
      )}

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-shrink-0">
        <div className="lg:col-span-8">
          <ActionGrid platform="MediaTek" actions={MTK_ACTIONS} title="MediaTek Operations" />
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
