import React from "react";
import { Console } from "../components/Console";
import { DownloadCliButton } from "../components/DownloadCliButton";
import { useApp } from "../context/AppContext";
import { Smartphone, AlertTriangle, ShieldCheck, Lock, Activity, Search, Loader2 } from "lucide-react";

const LOGO_URL =
  "https://static.prod-images.emergentagent.com/jobs/540cc9df-c50a-4a07-a460-6c88ca22b1a7/images/2d4119f8e681e91c440e01928176b55e52818652e44fd72f5f424ba935136d9c.png";

const SUPPORTED = [
  "iPhone XS", "iPhone XR", "iPhone 11", "iPhone 11 Pro", "iPhone SE 2", "iPhone 12",
  "iPhone 12 Pro", "iPhone 13", "iPhone 13 Pro", "iPhone SE 3", "iPhone 14", "iPhone 14 Pro",
  "iPhone 15", "iPhone 15 Pro", "iPhone 16", "iPhone 16 Pro",
];

const SOC = ["A12", "A13", "A14", "A15", "A16", "A17 Pro", "A18", "A18 Pro"];

const IPHONE_ACTIONS = [
  { key: "read_info",         label: "Modern Diagnostic", icon: Activity,     cost: "20 Credits", danger: false, desc: "Full hardware fingerprint + trust-cache audit.", testid: "iphone-action-diag" },
  { key: "icloud_check",      label: "Activation Probe",  icon: Search,       cost: "5 Credits",  danger: false, desc: "Detect Activation Lock / iCloud status (read-only).", testid: "iphone-action-probe" },
  { key: "passcode_recover",  label: "Passcode Recovery", icon: Lock,         cost: "30 Credits", danger: false, desc: "Brute-tolerant recovery flow via DFU pipeline.", testid: "iphone-action-passcode" },
  { key: "trust_audit",       label: "Trust Cache Audit", icon: ShieldCheck,  cost: "10 Credits", danger: false, desc: "Verify SecureROM signatures vs Apple ground-truth.", testid: "iphone-action-trust" },
  { key: "apple_info",        label: "Recovery Query",    icon: Search,       cost: "Free",       danger: false, desc: "irecovery -q. ECID, board, and mode from Recovery or DFU.", testid: "iphone-action-recovery" },
  { key: "apple_lockdown",    label: "Lockdown Info",     icon: Activity,     cost: "Free",       danger: false, desc: "ideviceinfo. Paired device identity. Phone must be trusted.", testid: "iphone-action-lockdown" },
  { key: "apple_diagnostics", label: "Diagnostics",       icon: ShieldCheck,  cost: "Free",       danger: false, desc: "idevicediagnostics. Hardware report from a trusted device.", testid: "iphone-action-diagnostics" },
  { key: "apple_list",        label: "List Devices",      icon: Smartphone,   cost: "Free",       danger: false, desc: "idevice_id -l. UDIDs currently on usbmuxd.", testid: "iphone-action-list" },
  { key: "apple_restore",     label: "Official Restore",  icon: AlertTriangle, cost: "Free",      danger: true,  desc: "idevicerestore erase with the latest Apple-signed IPSW. Does not skip Activation Lock.", testid: "iphone-action-restore" },
];

export default function IPhoneService() {
  const { device, status, runAction, activeAction, credits, pushLog } = useApp();
  const isApple = device && (device.platform === "Apple" || device.brand?.toLowerCase().includes("iphone"));

  const handleClick = (a) => {
    if (status !== "connected") {
      pushLog("ERROR", "Connect a target device before running iPhone operations.");
      return;
    }
    runAction(a.key, a.label);
  };

  return (
    <div data-testid="iphone-page" className="h-full flex flex-col gap-3 p-4 overflow-y-auto">
      <div className="bg-[#09090B] border border-white/10 p-5 flex items-center gap-4 flex-shrink-0 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-44 h-44 opacity-[0.04] pointer-events-none">
          <img src={LOGO_URL} alt="" className="w-full h-full object-contain" />
        </div>
        <div className="w-12 h-12 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center relative">
          <Smartphone className="w-6 h-6 text-[#00FF41]" strokeWidth={1.8} />
          <img
            src={LOGO_URL}
            alt="Aether"
            className="absolute -top-2 -right-2 w-5 h-5 object-contain bg-black p-0.5 border border-[#00FF41]/40"
          />
        </div>
        <div className="flex-1 relative">
          <div className="flex items-center gap-2">
            <h1 data-testid="iphone-page-title" className="text-xl font-bold tracking-tight">iPhone Service Module</h1>
          </div>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/40 mt-1">
            DFU Pipeline · checkm8 / pongoOS · A12 → A18 SoC
          </p>
        </div>
        <DownloadCliButton variant="compact" />
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Wallet</div>
          <div className="text-sm font-semibold text-[#00FF41]">{credits} Credits</div>
        </div>
      </div>

      {!isApple && status === "connected" && (
        <div className="bg-yellow-400/5 border border-yellow-400/30 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-yellow-400" strokeWidth={2} />
          <span className="font-mono text-xs text-yellow-200/80">
            No iOS target detected. Connect device in DFU mode (Vol+ → Vol- → Power 10s).
          </span>
        </div>
      )}

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-shrink-0">
        <div className="lg:col-span-8">
          <div className="bg-[#09090B] border border-white/10">
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-[#00FF41]" />
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/70">
                iPhone Operations
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-white/5">
              {IPHONE_ACTIONS.map((a) => {
                const isActive = activeAction === a.label;
                return (
                  <button
                    key={a.key}
                    data-testid={a.testid}
                    disabled={status !== "connected" || activeAction}
                    onClick={() => handleClick(a)}
                    className="group bg-[#09090B] p-5 flex flex-col items-start gap-3 transition-colors min-h-[140px] disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-[#00FF41]/5 text-left"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="w-9 h-9 border border-[#00FF41]/30 text-[#00FF41] flex items-center justify-center group-enabled:group-hover:bg-[#00FF41]/10 transition-colors">
                        {isActive ? <Loader2 className="w-4 h-4 animate-spin" /> : <a.icon className="w-4 h-4" strokeWidth={2} />}
                      </div>
                      <span className={`font-mono text-[10px] tracking-[0.2em] uppercase ${a.danger ? "text-red-400" : "text-white/40"}`}>
                        {a.danger ? "Erases device" : a.cost}
                      </span>
                    </div>
                    <div>
                      <div className="text-white text-sm font-semibold">{a.label}</div>
                      <div className="font-mono text-[11px] text-white/40 mt-1 leading-snug">
                        {a.desc}
                      </div>
                    </div>
                    {isActive && (
                      <span className="font-mono text-[9px] text-[#00FF41] tracking-[0.2em]">
                        ● RUNNING
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-3">
          <div className="bg-[#09090B] border border-white/10 p-4">
            <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/50 mb-3">
              Supported devices
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-[140px] overflow-y-auto">
              {SUPPORTED.map((s) => (
                <span
                  key={s}
                  className="font-mono text-[10px] px-2 py-1 border border-white/5 text-white/50"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="bg-[#09090B] border border-white/10 p-4">
            <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/50 mb-3">
              SoC support matrix
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SOC.map((s) => (
                <span
                  key={s}
                  className="font-mono text-[10px] px-2 py-1 border border-[#00FF41]/30 text-[#00FF41]"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Console height="h-full" />
      </div>
    </div>
  );
}
