import React from "react";
import { ActionGrid } from "../components/ActionGrid";
import { useApp } from "../context/AppContext";
import { ExternalLink, Smartphone } from "lucide-react";

const UNLOCK_DATA_ACTIONS = [
  {
    key: "motorola_unlock_data",
    label: "Read Motorola Unlock Data",
    icon: "Search",
    danger: false,
    testid: "motorola-unlock-data",
    cost: "Read-only",
  },
];

export default function MotorolaService() {
  const { device } = useApp();
  const model = device?.brand?.toLowerCase().includes("motorola") ? device.model : null;

  return (
    <div data-testid="motorola-page" className="h-full flex flex-col gap-3 p-4 overflow-y-auto">
      <section className="bg-[#09090B] border border-white/10 p-5 flex items-center gap-4">
        <Smartphone className="w-7 h-7 text-[#00FF41]" />
        <div>
          <h1 className="text-xl font-bold">Motorola Service</h1>
          <p className="font-mono text-[11px] uppercase tracking-wider text-white/45 mt-1">
            Official bootloader eligibility workflow · {model || "Connect a Motorola device"}
          </p>
        </div>
      </section>

      <section className="bg-yellow-400/5 border border-yellow-400/30 p-4 text-sm text-yellow-100/80">
        Unlocking is not performed by this screen. Motorola must approve the exact device and carrier variant.
        An approved unlock can factory-reset the phone and may affect warranty and device features. Back up your data first.
      </section>

      <ActionGrid
        platform="ALL"
        actions={UNLOCK_DATA_ACTIONS}
        title="Read-only eligibility preparation"
        columns={1}
        requireDevice={false}
      />

      <a
        className="inline-flex items-center gap-2 text-sm text-[#00FF41] underline underline-offset-4"
        href="https://en-us.support.motorola.com/app/standalone/bootloader/unlock-your-device-a"
        target="_blank"
        rel="noreferrer"
      >
        Continue on Motorola’s official unlock portal <ExternalLink className="w-4 h-4" />
      </a>
      <p className="font-mono text-xs text-white/45">
        Submit the unlock data on Motorola’s portal. Only use the returned official key if Motorola declares the device eligible.
        This app does not bypass carrier restrictions or execute the destructive unlock command.
      </p>
    </div>
  );
}
