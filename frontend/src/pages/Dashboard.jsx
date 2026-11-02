import React from "react";
import { DeviceStatus } from "../components/DeviceStatus";
import { DeviceInfoPanel } from "../components/DeviceInfoPanel";
import { ActionGrid } from "../components/ActionGrid";
import { Console } from "../components/Console";
import { CloudExploitDB } from "../components/CloudExploitDB";
import { FoundingBuilderBanner } from "../components/FoundingBuilderBanner";
import { DemoModeBanner } from "../components/DemoModeBanner";
import { GetDesktopHeroCard } from "../components/GetDesktopHeroCard";
import { AuthorCreditStrip } from "../components/AuthorCreditStrip";
import { useApp } from "../context/AppContext";
import { Activity, Database, ShieldCheck, Wifi } from "lucide-react";

const Stat = ({ label, value, icon: Icon, accent = false }) => (
  <div className="bg-[#09090B] border border-white/10 px-4 py-3 flex items-center gap-3">
    <div
      className={`w-9 h-9 border flex items-center justify-center ${
        accent
          ? "border-[#00FF41]/40 text-[#00FF41] bg-[#00FF41]/5"
          : "border-white/10 text-white/60"
      }`}
    >
      <Icon className="w-4 h-4" strokeWidth={2} />
    </div>
    <div className="flex flex-col leading-tight min-w-0">
      <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-white/40">
        {label}
      </span>
      <span className={`text-sm font-semibold truncate ${accent ? "text-[#00FF41]" : "text-white"}`}>
        {value}
      </span>
    </div>
  </div>
);

export default function Dashboard() {
  const { logs, status, device, activeAction } = useApp();
  const successCount = logs.filter((l) => l.level === "SUCCESS").length;

  return (
    <div data-testid="dashboard-page" className="h-full min-h-0 flex flex-col gap-3 p-4 overflow-y-auto lg:overflow-hidden">
      <div className="flex-shrink-0">
        <DemoModeBanner />
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        <Stat
          label="Connection"
          value={status === "connected" || status === "working" ? "Active" : status === "searching" ? "Scanning" : "Idle"}
          icon={Wifi}
          accent={status === "connected" || status === "working"}
        />
        <Stat
          label="Active Operation"
          value={activeAction || "Standby"}
          icon={Activity}
        />
        <Stat label="Successful Ops" value={successCount} icon={ShieldCheck} accent={successCount > 0} />
        <Stat label="Exploit DB" value="v6.2 / v3.0" icon={Database} />
      </div>

      {/* Device, identity, and actions share the remaining height and scroll inside their own cards. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)] gap-3 flex-none lg:flex-1 min-h-0 overflow-visible lg:overflow-hidden">
        <div className="lg:col-span-5 h-auto min-h-0 lg:h-full overflow-visible lg:overflow-y-auto">
          <DeviceStatus />
          <div className="mt-3 space-y-3">
            <GetDesktopHeroCard />
            <FoundingBuilderBanner />
          </div>
        </div>
        <div className="lg:col-span-4 h-auto min-h-0 lg:h-full overflow-visible lg:overflow-y-auto">
          <DeviceInfoPanel />
        </div>
        <div className="lg:col-span-3 h-auto min-h-0 lg:h-full overflow-visible lg:overflow-hidden">
          <ActionGrid platform={device?.platform || "ALL"} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-auto lg:h-[240px] flex-none overflow-visible lg:overflow-hidden">
        <div className="lg:col-span-5 h-[240px] min-h-0 lg:h-full overflow-hidden">
          <CloudExploitDB />
        </div>
        <div className="lg:col-span-7 h-[240px] min-h-0 lg:h-full overflow-hidden">
          <Console height="h-full" />
        </div>
      </div>

      <div className="flex-shrink-0">
        <AuthorCreditStrip />
      </div>
    </div>
  );
}
