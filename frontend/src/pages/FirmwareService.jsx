import React, { useEffect, useState } from "react";
import { ExternalLink, HardDriveDownload, Search, ShieldAlert } from "lucide-react";
import { Console } from "../components/Console";
import { useApp } from "../context/AppContext";

const VENDOR_COVERAGE = [
  ["Samsung", "Download Mode / ADB", "Firmware metadata lookup (model + CSC)", "Flash not validated"],
  ["Apple", "Recovery / DFU / usbmux", "Official signed restore action exists", "Model-specific restore only"],
  ["Motorola", "ADB / Fastboot / USB", "Device detection; official bootloader eligibility", "Firmware flash not implemented"],
  ["Google / Pixel", "ADB / Fastboot / USB", "Device detection", "Firmware flash not implemented"],
  ["Xiaomi / Redmi / POCO", "USB / ADB", "Vendor detection", "Firmware flash not implemented"],
  ["OnePlus / OPPO / Realme", "USB / ADB", "Vendor detection", "Firmware flash not implemented"],
  ["Huawei / Honor", "USB", "Vendor detection", "Firmware flash not implemented"],
  ["LG / Sony / HTC / ASUS / Nokia", "USB / ADB", "Vendor detection", "Firmware flash not implemented"],
  ["ZTE / TCL / Alcatel / Vivo", "USB", "Vendor detection", "Firmware flash not implemented"],
  ["MediaTek / Qualcomm / Unisoc", "BROM / EDL / SPRD (PID dependent)", "Transport detection; tool availability varies", "No universal firmware flash path"],
];

export default function FirmwareService() {
  const { device, status, activeAction, runAction, pushLog } = useApp();
  const detectedSamsung = device?.brand?.toLowerCase().includes("samsung");
  const [model, setModel] = useState("SM-A156W");
  const [csc, setCsc] = useState("GLW");

  useEffect(() => {
    if (detectedSamsung && device?.model) setModel(device.model.replaceAll("_", "-"));
  }, [detectedSamsung, device?.model]);

  const lookupFirmware = () => {
    const cleanModel = model.trim().toUpperCase();
    const cleanCsc = csc.trim().toUpperCase();
    if (!/^SM-[A-Z0-9-]+$/.test(cleanModel)) {
      pushLog("ERROR", "Enter the exact Samsung model number (for example, SM-A156W).");
      return;
    }
    if (!/^[A-Z0-9]{3,5}$/.test(cleanCsc)) {
      pushLog("ERROR", "Enter the device sales code / CSC from Settings or the device label.");
      return;
    }
    runAction(
      "samsung_swclone",
      "Look up Samsung firmware",
      { args: ["inform", "--model", cleanModel, "--csc", cleanCsc] },
      "Free",
    );
  };

  return (
    <div data-testid="firmware-service-page" className="h-full min-h-0 flex flex-col gap-3 p-4 overflow-y-auto">
      <header className="bg-[#09090B] border border-white/10 p-5 flex items-center gap-3">
        <HardDriveDownload className="w-6 h-6 text-[#00FF41]" />
        <div>
          <h1 className="text-xl font-bold">Firmware Service</h1>
          <p className="font-mono text-[10px] uppercase tracking-wider text-white/45 mt-1">
            Cross-brand compatibility catalog · exact-variant checks · no guessed writes
          </p>
        </div>
      </header>

      {device && <div className="border border-[#00FF41]/25 bg-[#00FF41]/5 px-4 py-3 text-sm">
        Current target: <span className="text-[#00FF41]">{device.brand} {device.model}</span>
        <span className="text-white/50"> · {device.platform} · {device.android || device.os || "OS not reported"}</span>
      </div>}

      <section className="bg-[#09090B] border border-white/10 p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Known vendor / transport coverage</h2>
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="text-white/40 uppercase font-mono">
            <tr><th className="p-2">Vendor family</th><th className="p-2">Detected transports</th><th className="p-2">Current service</th><th className="p-2">Write status</th></tr>
          </thead>
          <tbody>{VENDOR_COVERAGE.map(([vendor, transport, service, writeStatus]) => (
            <tr key={vendor} className="border-t border-white/10 align-top">
              <td className="p-2 text-white/80">{vendor}</td><td className="p-2 text-white/60">{transport}</td>
              <td className="p-2 text-white/60">{service}</td><td className="p-2 text-yellow-200/70">{writeStatus}</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="text-[11px] text-white/40 mt-3">This is the current repository coverage, not a claim that every model or regional variant is supported. USB detection alone does not establish firmware compatibility.</p>
      </section>

      <section className="bg-[#09090B] border border-white/10 p-4 space-y-3">
        <h2 className="font-semibold">Samsung firmware lookup</h2>
        <p className="text-xs text-white/55">
          Lookup requests firmware metadata from Samsung’s FUS service. Confirm the exact model and CSC before using any firmware.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem_auto] gap-2">
          <label className="text-xs text-white/60">
            Model number
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="SM-A156W"
              className="mt-1 w-full bg-black border border-white/15 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-xs text-white/60">
            CSC / sales code
            <input value={csc} onChange={(e) => setCsc(e.target.value.toUpperCase())} placeholder="e.g. XAC"
              className="mt-1 w-full bg-black border border-white/15 px-3 py-2 text-sm text-white uppercase" />
          </label>
          <button type="button" onClick={lookupFirmware}
            disabled={!!activeAction || status === "working"}
            className="self-end h-10 px-4 border border-[#00FF41]/40 text-[#00FF41] font-mono text-xs uppercase tracking-wider disabled:opacity-40 inline-flex items-center gap-2">
            <Search className="w-4 h-4" /> Lookup
          </button>
        </div>
        <p className="text-[11px] text-white/40">
          {detectedSamsung ? `Detected: ${device.model} · verify the CSC manually.` : "Using the supplied Galaxy A15 profile: SM-A156W · GLW · bootloader bit C. Confirm these match the target before lookup."}
        </p>
      </section>

      <section className="bg-yellow-400/5 border border-yellow-400/30 p-4 flex gap-3 text-sm text-yellow-100/80">
        <ShieldAlert className="w-5 h-5 flex-shrink-0 text-yellow-300" />
        <div>
          <strong>Flashing is not enabled.</strong> Aether does not yet validate Samsung firmware packages against the device PIT,
          bootloader revision, and CSC, or provide a supported flashing backend for this model. A failed or mismatched flash can
          make the phone unusable. Use Samsung Smart Switch / official support for recovery until a verified workflow is available.
        </div>
      </section>

      <a href="https://www.samsung.com/us/support/owners/app/smart-switch" target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-2 text-sm text-[#00FF41] underline underline-offset-4">
        Samsung support and Smart Switch <ExternalLink className="w-4 h-4" />
      </a>

      <div className="flex-1 min-h-[220px]"><Console height="h-full" /></div>
    </div>
  );
}
