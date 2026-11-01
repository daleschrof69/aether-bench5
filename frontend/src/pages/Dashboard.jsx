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
    <div data-testid="dashboard-page" className="h-full flex flex-col gap-3 p-4 overflow-y-auto">
      {/* Demo Mode notice — clearly informs users the web UI is a preview */}
      <div className="flex-shrink-0">
        <DemoModeBanner />
      </div>

      {/* Native Windows download CTA — the user's primary conversion goal */}
      <div className="flex-shrink-0">
        <GetDesktopHeroCard />
      </div>

      {/* Founding Builder CTA */}
      <div className="flex-shrink-0">
        <FoundingBuilderBanner />
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

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-shrink-0">
        <div className="lg:col-span-5">
          <DeviceStatus />
        </div>
        <div className="lg:col-span-4">
          <DeviceInfoPanel />
        </div>
        <div className="lg:col-span-3">
          <ActionGrid platform={device?.platform || "ALL"} />
        </div>
      </div>

      {/* Cloud exploit DB + Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-[480px]">
        <div className="lg:col-span-5 min-h-[420px]">
          <CloudExploitDB />
        </div>
        <div className="lg:col-span-7 min-h-[420px]">
          <Console height="h-full" />
        </div>
      </div>

      {/* Author credit strip — Made by Braiden Barker + rotating trust signals */}
      <AuthorCreditStrip />
    </div>
  );
}
