import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { Download, Monitor, ExternalLink, Apple } from "lucide-react";
import { DESKTOP_VERSION as VERSION, DESKTOP_RELEASES_BASE as RELEASES_BASE } from "../lib/releases";

// Standalone download popover for the native Aether Repair Tool desktop app
// (.msi for Windows, .dmg for macOS, .AppImage for Linux). Points at the
// GitHub Releases artefacts produced by .github/workflows/aether-desktop-release.yml.

const BUILDS = [
  {
    key: "windows-x64",
    label: "Windows (x64)",
    sub: ".msi installer · 6.4 MB",
    file: `Aether_${VERSION}_x64_en-US.msi`,
    icon: Monitor,
  },
  {
    key: "macos-universal",
    label: "macOS (Universal)",
    sub: ".dmg · Intel + Apple Silicon · 12.3 MB",
    file: `Aether_${VERSION}_universal.dmg`,
    icon: Apple,
  },
  {
    key: "linux-x64",
    label: "Linux (x64)",
    sub: ".AppImage · 14.7 MB",
    file: `aether-desktop_${VERSION}_amd64.AppImage`,
    icon: Monitor,
  },
];

const DesktopTrigger = ({ variant, onClick }) =>
  variant === "primary" ? (
    <button
      data-testid="desktop-download-trigger"
      onClick={onClick}
      className="h-10 px-4 bg-[#00FF41] hover:bg-[#00CC33] text-black font-mono text-xs tracking-[0.22em] uppercase font-semibold flex items-center gap-2 transition-colors"
    >
      <Download className="w-3.5 h-3.5" />
      Download Desktop App
    </button>
  ) : (
    <button
      data-testid="desktop-download-trigger"
      onClick={onClick}
      className="h-7 px-2.5 bg-[#00FF41] hover:bg-[#00CC33] text-black font-mono text-[10px] tracking-[0.22em] uppercase font-semibold flex items-center gap-1.5 transition-colors"
    >
      <Monitor className="w-3 h-3" />
      Get Desktop
    </button>
  );

const BuildRow = ({ build, onSelect }) => {
  const Icon = build.icon;
  return (
    <button
      data-testid={`desktop-download-${build.key}`}
      onClick={() => onSelect(build)}
      className="w-full px-3 py-2 border border-white/10 hover:border-[#00FF41]/40 hover:bg-[#00FF41]/5 flex items-center justify-between gap-3 transition-colors group"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className="w-3.5 h-3.5 text-white/60 group-hover:text-[#00FF41] flex-shrink-0" />
        <div className="text-left min-w-0">
          <div className="font-mono text-[11px] text-white group-hover:text-[#00FF41] tracking-wide truncate">
            {build.label}
          </div>
          <div className="font-mono text-[9px] text-white/40 truncate">{build.sub}</div>
        </div>
      </div>
      <ExternalLink className="w-3 h-3 text-white/30 group-hover:text-[#00FF41] flex-shrink-0" />
    </button>
  );
};

const DesktopPopover = ({ onClose, onSelect }) => (
  <>
    <div className="fixed inset-0 z-40" onClick={onClose} />
    <div
      data-testid="desktop-download-popover"
      className="absolute right-0 top-full mt-1.5 w-96 z-50 bg-[#0A0A0D] border border-[#00FF41]/30 shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
    >
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="w-3.5 h-3.5 text-[#00FF41]" />
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/80">
            aether desktop · native build
          </span>
        </div>
        <span className="font-mono text-[9px] text-white/40">v{VERSION}</span>
      </div>

      <div className="p-4 space-y-3">
        <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/50 leading-relaxed">
          Standalone .exe / .dmg / .AppImage. Bundles the dashboard with
          the local CLI bridge so it talks to USB devices directly —
          no browser, no Demo Mode.
        </div>

        <div>
          <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-white/40 mb-1.5">
            Pick your platform
          </div>
          <div className="space-y-1">
            {BUILDS.map((b) => (
              <BuildRow key={b.key} build={b} onSelect={onSelect} />
            ))}
          </div>
        </div>

        <div className="font-mono text-[10px] text-white/40 leading-relaxed pt-1 border-t border-white/5">
          Tauri 2 · WebView2 / WebKit · ~6 MB installer · auto-updater enabled
        </div>
      </div>
    </div>
  </>
);

export const DownloadDesktopButton = ({ variant = "compact" }) => {
  const { pushLog } = useApp();
  const [open, setOpen] = useState(false);

  const handleDownload = (b) => {
    const url = `${RELEASES_BASE}/${b.file}`;
    pushLog("INFO", `Fetching Aether desktop · ${b.label} ...`);
    pushLog("SUCCESS", `Opening release: ${b.file}`);
    window.open(url, "_blank", "noopener");
    setOpen(false);
  };

  return (
    <div className="relative">
      <DesktopTrigger variant={variant} onClick={() => setOpen((o) => !o)} />
      {open && <DesktopPopover onClose={() => setOpen(false)} onSelect={handleDownload} />}
    </div>
  );
};
