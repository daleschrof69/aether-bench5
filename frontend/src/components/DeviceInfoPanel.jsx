import React from "react";
import { useApp } from "../context/AppContext";
import { Fingerprint } from "lucide-react";

const Row = ({ label, value, highlight = false }) => (
  <div className="grid grid-cols-[120px_1fr] gap-2 py-2 px-3 border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]">
    <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/40 self-center">
      {label}
    </div>
    <div
      className={`font-mono text-[12px] truncate ${
        highlight ? "text-[#00FF41]" : "text-white/85"
      }`}
    >
      {value || <span className="text-white/20">—</span>}
    </div>
  </div>
);

export const DeviceInfoPanel = () => {
  const { device } = useApp();

  return (
    <div
      data-testid="device-info-panel"
      className="bg-[#09090B] border border-white/10 flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Fingerprint className="w-3.5 h-3.5 text-[#00FF41]" strokeWidth={2} />
          <span className="font-mono text-[10px] tracking-[0.25em] text-white/70 uppercase">
            Device Information
          </span>
        </div>
        {device && (
          <span className="font-mono text-[10px] text-[#00FF41]/80 tracking-[0.2em] uppercase">
            ● Live
          </span>
        )}
      </div>
      <div className="flex-1">
        <Row label="Brand" value={device?.brand} />
        <Row label="Model" value={device?.model} highlight />
        <Row label="Platform" value={device?.platform} />
        <Row label="IMEI 1" value={device?.imei_masked} />
        <Row label="IMEI 2" value={device?.imei2_masked} />
        <Row label="Serial Number" value={device?.serial} />
        <Row label="CPU ID" value={device?.cpuId} />
        <Row label="Storage" value={device?.storage} />
        <Row label="RAM" value={device?.ram} />
        <Row label="Android" value={device ? `Android ${device.android}` : null} />
        <Row label="Patch Level" value={device?.patch} />
        <Row label="Bootloader" value={device?.bootloader} />
        <Row label="Region" value={device?.region} />
      </div>
    </div>
  );
};
