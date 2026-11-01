import React from "react";
import { useApp } from "../context/AppContext";
import { Usb, Loader2, CheckCircle2, PowerOff, Activity } from "lucide-react";

// Header pill lookup — replaces nested ternaries flagged in code review.
const HEADER_STATES = {
  connected: { dot: "bg-[#00FF41]", pulse: true, label: "ONLINE" },
  working:   { dot: "bg-[#00FF41]", pulse: true, label: "ONLINE" },
  searching: { dot: "bg-yellow-400", pulse: false, label: "SCANNING" },
  idle:      { dot: "bg-red-500",   pulse: false, label: "OFFLINE" },
};

const IdlePanel = () => (
  <div className="space-y-3">
    <div className="flex items-center gap-3 text-white/40">
      <PowerOff className="w-7 h-7" strokeWidth={1.5} />
      <span className="font-mono text-[11px] tracking-[0.25em] uppercase">No Connection</span>
    </div>
    <div className="text-3xl md:text-4xl font-bold tracking-tight text-white">Ready to scan</div>
    <p className="text-sm text-white/50 max-w-md">
      Connect target device via USB. Hold Vol- + plug-in for MTK BROM, or Vol+ Vol- for Qualcomm EDL.
      Use <span className="text-[#4d8bff]">WebUSB</span> (Chrome/Edge) to detect a device in-browser,
      or scan via the local Aether CLI bridge.
    </p>
  </div>
);

const SearchingPanel = () => (
  <div className="space-y-3">
    <div className="flex items-center gap-3 text-yellow-400">
      <Loader2 className="w-7 h-7 animate-spin" strokeWidth={1.8} />
      <span className="font-mono text-[11px] tracking-[0.25em] uppercase">Listening on USB bus</span>
    </div>
    <div className="flex items-baseline gap-2">
      <div className="text-3xl md:text-4xl font-bold tracking-tight text-white animate-pulse-text">
        Searching
      </div>
      <span className="inline-block w-3 h-7 bg-[#00FF41] animate-blink mt-1" />
    </div>
    <p className="text-sm text-white/50">
      Probing MediaTek preloader · Qualcomm Sahara · ADB · Fastboot ...
    </p>
  </div>
);

const WorkingProgress = ({ activeAction, progress }) => (
  <div className="mt-4 space-y-2">
    <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.2em] uppercase text-[#00FF41]">
      <span className="flex items-center gap-2">
        <Activity className="w-3 h-3 animate-pulse" />
        Running · {activeAction}
      </span>
      <span>{progress}%</span>
    </div>
    <div className="h-1 bg-white/5 overflow-hidden">
      <div
        className="h-full bg-[#00FF41] transition-all duration-300"
        style={{ width: `${progress}%` }}
      />
    </div>
  </div>
);

const ConnectedPanel = ({ device, comPort, status, activeAction, progress }) => (
  <div className="space-y-3">
    <div className="flex items-center gap-3 text-[#00FF41]">
      <CheckCircle2 className="w-7 h-7" strokeWidth={2} />
      <span className="font-mono text-[11px] tracking-[0.25em] uppercase">
        Device detected · {comPort}
      </span>
    </div>
    <div
      data-testid="detected-device-name"
      className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight"
    >
      {device.model}
    </div>
    <div className="font-mono text-sm text-white/60">
      {device.brand} <span className="text-white/30">·</span> {device.platform} platform
    </div>
    {status === "working" && <WorkingProgress activeAction={activeAction} progress={progress} />}
  </div>
);

const DisconnectedActions = ({ startSearch, connectWebUsb, isSearching, webusbSupported }) => (
  <>
    <button
      data-testid="btn-start-scan"
      onClick={startSearch}
      disabled={isSearching}
      title="Scan for a connected device via the local Aether CLI bridge."
      className="flex-1 h-10 border border-[#00FF41]/40 bg-[#00FF41]/5 hover:bg-[#00FF41]/15 text-[#00FF41] font-mono text-xs tracking-[0.2em] uppercase transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
    >
      <Usb className="w-3.5 h-3.5" />
      {isSearching ? "Scanning..." : "Scan Devices"}
    </button>
    <button
      data-testid="btn-webusb-connect"
      onClick={connectWebUsb}
      disabled={isSearching || !webusbSupported}
      title={
        webusbSupported
          ? "Detect a real USB device directly in the browser (Chrome / Edge / Opera)"
          : "WebUSB needs Chrome, Edge or Opera on desktop"
      }
      className="flex-1 h-10 border border-[#4d8bff]/40 bg-[#4d8bff]/5 hover:bg-[#4d8bff]/15 text-[#4d8bff] font-mono text-xs tracking-[0.2em] uppercase transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
    >
      <Usb className="w-3.5 h-3.5" />
      {webusbSupported ? "WebUSB" : "WebUSB N/A"}
    </button>
  </>
);

const StatusBody = ({ status, device, comPort, activeAction, progress }) => {
  if (status === "idle") return <IdlePanel />;
  if (status === "searching") return <SearchingPanel />;
  if ((status === "connected" || status === "working") && device) {
    return (
      <ConnectedPanel
        device={device}
        comPort={comPort}
        status={status}
        activeAction={activeAction}
        progress={progress}
      />
    );
  }
  return null;
};

export const DeviceStatus = () => {
  const {
    status,
    device,
    comPort,
    startSearch,
    disconnect,
    connectWebUsb,
    webusb,
    activeAction,
    progress,
  } = useApp();

  const isSearching = status === "searching";
  const isConnected = status === "connected" || status === "working";
  const webusbSupported = !!webusb?.supported;
  const pill = HEADER_STATES[status] || HEADER_STATES.idle;

  return (
    <div
      data-testid="device-status-panel"
      className="bg-[#09090B] border border-white/10 p-5 flex flex-col gap-5 relative overflow-hidden bg-grid"
    >
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.25em] text-white/40 uppercase">
            Device Status
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-white/40">
          <span className={`w-2 h-2 ${pill.dot} ${pill.pulse ? "animate-pulse-glow" : ""}`} />
          {pill.label}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center min-h-[180px] relative z-10">
        <StatusBody
          status={status}
          device={device}
          comPort={comPort}
          activeAction={activeAction}
          progress={progress}
        />
      </div>

      <div className="flex items-center gap-2 relative z-10">
        {!isConnected ? (
          <DisconnectedActions
            startSearch={startSearch}
            connectWebUsb={connectWebUsb}
            isSearching={isSearching}
            webusbSupported={webusbSupported}
          />
        ) : (
          <button
            data-testid="btn-disconnect"
            onClick={disconnect}
            disabled={status === "working"}
            className="flex-1 h-10 border border-red-500/40 bg-red-500/5 hover:bg-red-500/15 text-red-400 font-mono text-xs tracking-[0.2em] uppercase transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <PowerOff className="w-3.5 h-3.5" />
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
};
