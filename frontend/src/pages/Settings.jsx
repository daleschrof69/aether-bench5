import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { Settings as SettingsIcon, ShieldCheck, Bell, Usb, Database, Info, Wrench, Terminal } from "lucide-react";
import DeployStatus from "../components/DeployStatus";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Toggle = ({ checked, onChange, testid }) => (
  <button
    data-testid={testid}
    onClick={() => onChange(!checked)}
    className={`relative w-11 h-6 border transition-colors ${
      checked ? "bg-[#00FF41]/20 border-[#00FF41]" : "bg-white/5 border-white/15"
    }`}
  >
    <span
      className={`absolute top-0.5 w-4 h-4 transition-all ${
        checked ? "left-6 bg-[#00FF41]" : "left-1 bg-white/40"
      }`}
    />
  </button>
);

const Setting = ({ icon: Icon, title, desc, control }) => (
  <div className="flex items-center gap-4 p-4 border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]">
    <div className="w-9 h-9 border border-white/10 flex items-center justify-center text-white/60 flex-shrink-0">
      <Icon className="w-4 h-4" strokeWidth={1.8} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-white">{title}</div>
      <div className="font-mono text-[11px] text-white/40 mt-0.5">{desc}</div>
    </div>
    <div>{control}</div>
  </div>
);

const TOOL_KEYS = { mtk: "mtkclient", qc: "edl" };
const TOOL_LABELS = { mtk: "mtkclient", qc: "edl" };

export default function Settings() {
  const { autoConnect, setAutoConnect, soundEnabled, setSoundEnabled, setSetupOpen, cliBridge, pushLog } = useApp();
  const cliConnected = cliBridge?.status === "connected";
  const [checks, setChecks] = useState({});

  const checkModule = async (id) => {
    setChecks((prev) => ({ ...prev, [id]: "Checking…" }));
    let apiLine = "API offline";
    try {
      const res = await fetch(`${API}/repair/readiness`);
      const body = await res.json();
      apiLine = res.ok && body.status === "ok"
        ? `API ${body.api} · database ok`
        : `API degraded · database ${body.database || "down"}`;
    } catch (e) {
      apiLine = "API offline";
    }
    const toolKey = TOOL_KEYS[id];
    let toolLine = "CLI offline";
    if (cliConnected && typeof cliBridge.call === "function") {
      try {
        const hello = cliBridge.info || (await cliBridge.call("hello", {}));
        const ver = hello?.[toolKey];
        toolLine = ver ? `${TOOL_LABELS[id]} ${ver}` : `${TOOL_LABELS[id]} not installed`;
      } catch (e) {
        toolLine = "CLI hello failed";
      }
    }
    const summary = `${apiLine} · ${toolLine}`;
    setChecks((prev) => ({ ...prev, [id]: summary }));
    pushLog?.("INFO", `Repair readiness (${id}): ${summary}`);
    if (apiLine.startsWith("API offline") || toolLine.includes("not installed") || toolLine === "CLI offline") {
      toast.warning("Repair check", { description: summary });
    } else {
      toast.success("Repair check", { description: summary });
    }
  };

  return (
    <div data-testid="settings-page" className="h-full flex flex-col gap-3 p-4 overflow-y-auto">
      <div className="bg-[#09090B] border border-white/10 p-5 flex items-center gap-4">
        <div className="w-12 h-12 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center">
          <SettingsIcon className="w-6 h-6 text-[#00FF41]" strokeWidth={1.8} />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Settings</h1>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/40 mt-1">
            Runtime configuration · profile: default
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-[#09090B] border border-white/10">
          <div className="px-4 py-3 border-b border-white/10 font-mono text-[10px] tracking-[0.25em] uppercase text-white/50">
            General
          </div>
          <Setting
            icon={Usb}
            title="Auto-detect on boot"
            desc="Automatically scan USB bus when application launches."
            control={
              <Toggle testid="setting-auto-connect" checked={autoConnect} onChange={setAutoConnect} />
            }
          />
          <Setting
            icon={Bell}
            title="Sound feedback"
            desc="Play tone on operation success/failure."
            control={
              <Toggle testid="setting-sound" checked={soundEnabled} onChange={setSoundEnabled} />
            }
          />
          <Setting
            icon={ShieldCheck}
            title="Verify exploit signatures"
            desc="Cryptographically verify DA payloads before sending."
            control={<Toggle testid="setting-verify" checked={true} onChange={() => {}} />}
          />
        </div>

        <div className="bg-[#09090B] border border-white/10">
          <div className="px-4 py-3 border-b border-white/10 font-mono text-[10px] tracking-[0.25em] uppercase text-white/50">
            Exploit Database
          </div>
          <Setting
            icon={Database}
            title="MTK DA Database"
            desc={checks.mtk || "Live check of the API and local mtkclient"}
            control={
              <button
                data-testid="setting-update-mtk"
                onClick={() => checkModule("mtk")}
                className="h-8 px-3 border border-[#00FF41]/30 hover:bg-[#00FF41]/10 text-[#00FF41] font-mono text-[10px] tracking-[0.2em] uppercase transition-colors"
              >
                Check
              </button>
            }
          />
          <Setting
            icon={Database}
            title="Qualcomm Firehose DB"
            desc={checks.qc || "Live check of the API and local edl client"}
            control={
              <button
                data-testid="setting-update-qc"
                onClick={() => checkModule("qc")}
                className="h-8 px-3 border border-[#00FF41]/30 hover:bg-[#00FF41]/10 text-[#00FF41] font-mono text-[10px] tracking-[0.2em] uppercase transition-colors"
              >
                Check
              </button>
            }
          />
        </div>

        <div className="bg-[#09090B] border border-white/10 lg:col-span-2">
          <div className="px-4 py-3 border-b border-white/10 font-mono text-[10px] tracking-[0.25em] uppercase text-white/50">
            Environment · Local CLI
          </div>
          <Setting
            icon={Wrench}
            title="Setup Wizard"
            desc="Detect & install mtkclient (MediaTek), Heimdall (Samsung) and the Aether CLI bridge."
            control={
              <button
                data-testid="settings-open-setup-wizard"
                onClick={() => setSetupOpen(true)}
                className="h-8 px-3 bg-[#00FF41] hover:bg-[#00CC33] text-black font-mono text-[10px] tracking-[0.2em] uppercase font-bold transition-colors"
              >
                Run Setup
              </button>
            }
          />
          <Setting
            icon={Terminal}
            title="CLI bridge status"
            desc="Run `aether-cli serve` on your machine to switch from demo to live device mode."
            control={
              <span
                data-testid="settings-cli-status"
                className={`font-mono text-[10px] tracking-[0.18em] uppercase px-2.5 py-1 border ${
                  cliConnected
                    ? "text-[#00FF41] border-[#00FF41]/40 bg-[#00FF41]/5"
                    : "text-white/50 border-white/15"
                }`}
              >
                {cliConnected ? "Connected" : "Offline (demo)"}
              </span>
            }
          />
        </div>

        <DeployStatus />

        <div className="bg-[#09090B] border border-white/10 lg:col-span-2">
          <div className="px-4 py-3 border-b border-white/10 font-mono text-[10px] tracking-[0.25em] uppercase text-white/50">
            About
          </div>
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
            <div>
              <div className="text-white/40 text-[10px] tracking-[0.2em] uppercase mb-1">Version</div>
              <div className="text-white">4.8.0</div>
            </div>
            <div>
              <div className="text-white/40 text-[10px] tracking-[0.2em] uppercase mb-1">Channel</div>
              <div className="text-[#00FF41]">PRO</div>
            </div>
            <div>
              <div className="text-white/40 text-[10px] tracking-[0.2em] uppercase mb-1">Driver</div>
              <div className="text-white">aether-usb 2.4.1</div>
            </div>
            <div>
              <div className="text-white/40 text-[10px] tracking-[0.2em] uppercase mb-1">Hardware ID</div>
              <div className="text-white">A8F4-37B9-EE21</div>
            </div>
            <div className="col-span-2 md:col-span-4 flex items-start gap-2 text-white/50 leading-relaxed">
              <Info className="w-3.5 h-3.5 mt-0.5 text-white/30 flex-shrink-0" />
              <p>
                Aether Repair Tool is intended for licensed device technicians. Operations performed
                may permanently modify or erase data on the connected target device. Use with care.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
