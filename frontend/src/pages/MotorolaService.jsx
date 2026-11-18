import React, { useEffect, useMemo, useState } from "react";
import { ActionGrid } from "../components/ActionGrid";
import { Console } from "../components/Console";
import { useApp } from "../context/AppContext";
import { motorolaUnlockDataFromLogs } from "../lib/motorolaUnlockData";
import { Copy, ExternalLink, Smartphone } from "lucide-react";

const UNLOCK_DATA_ACTIONS = [
  { key: "motorola_unlock_data", label: "Read Motorola Unlock Data", icon: "Search", danger: false, testid: "motorola-unlock-data", cost: "Read-only" },
];

const DIAGNOSTIC_ACTIONS = [
  { key: "motorola_adb_devices", label: "List ADB Devices", icon: "Smartphone", danger: false, testid: "motorola-adb-devices", cost: "Read-only" },
  { key: "motorola_fastboot_devices", label: "List Fastboot Devices", icon: "Search", danger: false, testid: "motorola-fastboot-devices", cost: "Read-only" },
  { key: "motorola_product", label: "Read Product", icon: "Tag", danger: false, testid: "motorola-product", cost: "Read-only" },
  { key: "motorola_bootloader", label: "Read Bootloader Version", icon: "Hash", danger: false, testid: "motorola-bootloader-version", cost: "Read-only" },
  { key: "motorola_unlock_status", label: "Read Unlock Status", icon: "Unlock", danger: false, testid: "motorola-unlock-status", cost: "Read-only" },
  { key: "motorola_secure_status", label: "Read Secure Status", icon: "ShieldCheck", danger: false, testid: "motorola-secure-status", cost: "Read-only" },
  { key: "motorola_fastboot_info", label: "Read Fastboot Details", icon: "FileCheck2", danger: false, testid: "motorola-fastboot-info", cost: "Read-only" },
];

export default function MotorolaService() {
  const { device, logs } = useApp();
  const [copyStatus, setCopyStatus] = useState("");
  const model = device?.brand?.toLowerCase().includes("motorola") ? device.model : null;
  const unlockData = useMemo(() => motorolaUnlockDataFromLogs(logs), [logs]);

  useEffect(() => setCopyStatus(""), [unlockData]);

  const copyUnlockData = async () => {
    try {
      await navigator.clipboard.writeText(unlockData);
      setCopyStatus("Unlock data copied.");
    } catch {
      setCopyStatus("Copy failed. Select the unlock data and copy it manually.");
    }
  };

  return (
    <div data-testid="motorola-page" className="h-full flex flex-col gap-3 p-4 overflow-y-auto">
      <section className="bg-[#09090B] border border-white/10 p-5 flex items-center gap-4">
        <Smartphone className="w-7 h-7 text-[#00FF41]" />
        <div>
          <h1 className="text-xl font-bold">Motorola Service</h1>
          <p className="font-mono text-[11px] uppercase tracking-wider text-white/45 mt-1">
            Device diagnostics and official bootloader eligibility · {model || "Connect a Motorola device"}
          </p>
        </div>
      </section>

      <section className="bg-yellow-400/5 border border-yellow-400/30 p-4 text-sm text-yellow-100/80">
        Unlocking is not performed by this screen. Motorola must approve the exact device and carrier variant.
        An approved unlock can factory-reset the phone and may affect warranty and device features. Back up your data first.
      </section>

      <p className="text-sm text-white/60">
        Connect one phone at a time. Use ADB while Android is running with USB debugging authorized, or Fastboot while the phone is in bootloader mode. Results appear in the console.
      </p>
      <div className="h-[360px] flex-shrink-0">
        <ActionGrid platform="ALL" actions={DIAGNOSTIC_ACTIONS} title="Motorola device checks" columns={2} requireDevice={false} />
      </div>
      <div className="h-44 flex-shrink-0">
        <ActionGrid platform="ALL" actions={UNLOCK_DATA_ACTIONS} title="Read-only eligibility preparation" columns={1} requireDevice={false} />
      </div>

      {unlockData && (
        <section className="bg-[#09090B] border border-white/10 p-4 space-y-2">
          <p className="text-sm text-white/70">Unlock data from the last successful read. Check it against the console before submitting.</p>
          <code data-testid="motorola-unlock-value" className="block select-all break-all text-[#00FF41] text-xs">{unlockData}</code>
          <button type="button" data-testid="motorola-copy-unlock-data" onClick={copyUnlockData} className="inline-flex items-center gap-2 border border-[#00FF41]/30 px-3 py-2 text-xs text-[#00FF41] hover:bg-[#00FF41]/10">
            <Copy className="w-4 h-4" /> Copy unlock data
          </button>
          <p role="status" className="text-xs text-white/60">{copyStatus}</p>
        </section>
      )}
      <a className="inline-flex items-center gap-2 text-sm text-[#00FF41] underline underline-offset-4" href="https://en-us.support.motorola.com/app/standalone/bootloader/unlock-your-device-a" target="_blank" rel="noreferrer">
        Continue on Motorola’s official unlock portal <ExternalLink className="w-4 h-4" />
      </a>
      <p className="font-mono text-xs text-white/45">
        Submit the unlock data on Motorola’s portal. Only use the returned official key if Motorola declares the device eligible.
        This app does not bypass carrier restrictions or execute the destructive unlock command.
      </p>
      <div className="min-h-[220px]"><Console height="h-64" /></div>
    </div>
  );
}
