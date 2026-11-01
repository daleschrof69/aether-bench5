import React, { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { useCliBridge } from "../hooks/useCliBridge";

const CLI_TEXT = {
  connected: (v) => `CLI · live v${v ?? "?"}`,
  connecting: () => "CLI · connecting",
  offline: () => "CLI · offline",
};

const resolveCliText = (enabled, status, info) => {
  if (!enabled) return "CLI · disabled (demo)";
  const fn = CLI_TEXT[status] || CLI_TEXT.offline;
  return fn(info?.version);
};

export const StatusBar = () => {
  const { status, device, comPort, logs } = useApp();
  const { status: cliStatus, info: cliInfo, enabled: cliEnabled } = useCliBridge();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const dot = {
    idle: "bg-red-500",
    searching: "bg-yellow-400 animate-pulse",
    connected: "bg-[#00FF41] animate-pulse-glow",
    working: "bg-cyan-400 animate-pulse",
  }[status];

  const cliDot = {
    offline: "bg-white/20",
    connecting: "bg-yellow-400 animate-pulse",
    connected: "bg-[#00FF41] animate-pulse-glow",
  }[cliStatus];

  const cliText = resolveCliText(cliEnabled, cliStatus, cliInfo);

  return (
    <div
      data-testid="status-bar"
      className="h-7 flex-shrink-0 bg-black border-t border-white/10 flex items-center justify-between px-4 font-mono text-[10px] tracking-[0.18em] uppercase text-white/50"
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 ${dot}`} />
          <span>{status}</span>
        </div>
        <span className="text-white/20">|</span>
        <span>Port: {comPort || "—"}</span>
        <span className="text-white/20">|</span>
        <span>Device: {device?.model?.split(" ")[0] || "none"}</span>
        <span className="text-white/20">|</span>
        <span
          data-testid="cli-bridge-status"
          className={`flex items-center gap-2 ${cliStatus === "connected" ? "text-[#00FF41]" : ""}`}
          title="Local Aether CLI bridge status. Run `aether-cli serve` to enable live mode."
        >
          <span className={`w-1.5 h-1.5 ${cliDot}`} />
          {cliText}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span>Logs: {logs.length}</span>
        <span className="text-white/20">|</span>
        <span>CPU 4%</span>
        <span className="text-white/20">|</span>
        <span>MEM 312MB</span>
        <span className="text-white/20">|</span>
        <span>{now.toLocaleTimeString("en-GB")}</span>
      </div>
    </div>
  );
};
