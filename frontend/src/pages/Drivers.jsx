import React, { useState, useMemo } from "react";
import { DRIVERS, DRIVER_CATEGORIES } from "../lib/drivers";
import {
  HardDriveDownload,
  Download,
  Cpu,
  Smartphone,
  Wrench,
  Search,
  ShieldCheck,
  Globe,
  Boxes,
  ExternalLink,
} from "lucide-react";

const CATEGORY_ICON = { Chipset: Cpu, "OEM USB": Smartphone, Tools: Wrench };

const SOURCE_STYLE = {
  Official: { cls: "text-[#00FF41] border-[#00FF41]/40 bg-[#00FF41]/5", Icon: ShieldCheck },
  "MS Update Catalog": { cls: "text-[#4d8bff] border-[#4d8bff]/40 bg-[#4d8bff]/5", Icon: Boxes },
  Community: { cls: "text-yellow-400 border-yellow-400/40 bg-yellow-400/5", Icon: Globe },
};

const PlatformBadge = ({ p }) => (
  <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-white/45 border border-white/10 px-1.5 py-0.5">
    {p}
  </span>
);

const DriverCard = ({ d }) => {
  const Icon = CATEGORY_ICON[d.category] || Wrench;
  const src = SOURCE_STYLE[d.source] || SOURCE_STYLE.Community;
  const SrcIcon = src.Icon;
  return (
    <div
      data-testid={`driver-card-${d.id}`}
      className="border border-white/10 bg-[#09090B] p-4 flex flex-col gap-3 hover:border-[#00FF41]/30 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 border border-white/10 flex items-center justify-center text-white/70 flex-shrink-0 group-hover:text-[#00FF41] transition-colors">
          <Icon className="w-4.5 h-4.5" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white leading-snug">{d.name}</div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {d.platforms.map((p) => (
              <PlatformBadge key={p} p={p} />
            ))}
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-1 border font-mono text-[9px] tracking-[0.12em] uppercase flex-shrink-0 ${src.cls}`}
          title={`Source: ${d.source}`}
        >
          <SrcIcon className="w-2.5 h-2.5" strokeWidth={2.2} />
          {d.source === "MS Update Catalog" ? "MS Catalog" : d.source}
        </span>
      </div>

      <p className="font-mono text-[11px] text-white/45 leading-relaxed flex-1">{d.desc}</p>

      {d.urls ? (
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(d.urls).map(([os, url]) => (
            <a
              key={os}
              href={url}
              target="_blank"
              rel="noreferrer"
              data-testid={`driver-download-${d.id}-${os.toLowerCase()}`}
              className="inline-flex items-center gap-1.5 h-8 px-3 border border-[#00FF41]/40 hover:bg-[#00FF41]/10 text-[#00FF41] font-mono text-[10px] tracking-[0.18em] uppercase transition-colors"
            >
              <Download className="w-3 h-3" />
              {os}
            </a>
          ))}
        </div>
      ) : (
        <a
          href={d.url}
          target="_blank"
          rel="noreferrer"
          data-testid={`driver-download-${d.id}`}
          className="inline-flex items-center justify-center gap-2 h-9 px-3 border border-[#00FF41]/40 hover:bg-[#00FF41]/10 text-[#00FF41] font-mono text-[10px] tracking-[0.2em] uppercase transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download
          <ExternalLink className="w-3 h-3 opacity-60" />
        </a>
      )}
    </div>
  );
};

export default function Drivers() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DRIVERS.filter((d) => {
      const catOk = cat === "All" || d.category === cat;
      const qOk =
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.desc.toLowerCase().includes(q) ||
        d.platforms.join(" ").toLowerCase().includes(q);
      return catOk && qOk;
    });
  }, [query, cat]);

  return (
    <div data-testid="drivers-page" className="h-full overflow-y-auto p-4">
      <div className="space-y-6 pb-10">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center flex-shrink-0">
            <HardDriveDownload className="w-6 h-6 text-[#00FF41]" strokeWidth={1.6} />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Drivers &amp; Tools</h1>
            <p className="text-sm text-white/50 mt-1 max-w-2xl">
              Every USB driver and flashing tool you need to connect a real device — chipset drivers,
              per-brand OEM drivers, and the adb/fastboot + WinUSB tooling. Downloads open on the vendor&apos;s page.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 bg-black border border-white/15 focus-within:border-[#00FF41]/40 px-3 h-10 flex-1 max-w-md transition-colors">
            <Search className="w-4 h-4 text-white/30" />
            <input
              data-testid="drivers-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search drivers (e.g. Qualcomm, Samsung, adb) ..."
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/25"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {DRIVER_CATEGORIES.map((c) => (
              <button
                key={c}
                data-testid={`drivers-filter-${c.replace(/\s+/g, "-").toLowerCase()}`}
                onClick={() => setCat(c)}
                className={`h-8 px-3 font-mono text-[10px] tracking-[0.18em] uppercase border transition-colors ${
                  cat === c
                    ? "border-[#00FF41]/50 bg-[#00FF41]/10 text-[#00FF41]"
                    : "border-white/10 text-white/50 hover:text-white hover:border-white/25"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((d) => (
            <DriverCard key={d.id} d={d} />
          ))}
        </div>
        {filtered.length === 0 && (
          <div data-testid="drivers-empty" className="text-center py-16 font-mono text-sm text-white/40">
            No drivers match &quot;{query}&quot;.
          </div>
        )}

        <p className="font-mono text-[10px] text-white/30 border-t border-white/5 pt-4 leading-relaxed">
          Tip: on Windows, run <span className="text-white/50">Zadig</span> after installing a driver to bind the
          WinUSB backend for BROM / EDL modes. On macOS / Linux use <span className="text-white/50">libusb</span>.
          Community mirrors are provided where the vendor has no public direct link — verify checksums before installing.
        </p>
      </div>
    </div>
  );
}
