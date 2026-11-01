import React from "react";
import { Minus, Square, X, Wrench, FileArchive } from "lucide-react";
import { DownloadCliButton } from "./DownloadCliButton";
import { DownloadDesktopButton } from "./DownloadDesktopButton";
import { useApp } from "../context/AppContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LOGO_URL =
  "https://static.prod-images.emergentagent.com/jobs/540cc9df-c50a-4a07-a460-6c88ca22b1a7/images/2d4119f8e681e91c440e01928176b55e52818652e44fd72f5f424ba935136d9c.png";

export const WindowChrome = () => {
  const { setSetupOpen, cliBridge } = useApp();
  const live = cliBridge?.status === "connected";
  return (
    <div
      data-testid="window-chrome"
      className="h-10 bg-black border-b border-white/10 flex items-center justify-between pl-12 pr-1 sm:pr-2 lg:px-3 select-none flex-shrink-0 gap-2 min-w-0"
    >
      <div className="flex items-center gap-2 min-w-0 shrink">
        <img src={LOGO_URL} alt="Aether" className="w-4 h-4 object-contain shrink-0" />
        <span className="font-mono text-[11px] tracking-[0.18em] sm:tracking-[0.25em] text-white/80 uppercase truncate">
          <span className="sm:hidden">Aether</span>
          <span className="hidden sm:inline">Aether Phone Repair Tools</span>
        </span>
        <span className="hidden md:inline font-mono text-[10px] text-white/30 shrink-0">v4.8.0</span>
        <span
          data-testid="window-bridge-badge"
          className={`hidden sm:inline font-mono text-[9px] tracking-[0.25em] uppercase px-1.5 py-0.5 border shrink-0 ${
            live
              ? "text-[#00FF41] border-[#00FF41]/40 bg-[#00FF41]/5"
              : "text-yellow-400 border-yellow-400/40 bg-yellow-400/5"
          }`}
          title={
            live
              ? "Local Aether CLI bridge connected — real hardware mode"
              : "Local Aether CLI bridge offline — start aether-cli for real device repair"
          }
        >
          {live ? "Live" : "Offline"}
        </span>
      </div>
      <div className="flex items-center gap-1 sm:gap-3 min-w-0">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            data-testid="window-setup-trigger"
            onClick={() => setSetupOpen(true)}
            className="h-7 shrink-0 px-2.5 border border-white/15 hover:border-[#00FF41]/40 hover:text-[#00FF41] text-white/70 font-mono text-[10px] tracking-[0.22em] uppercase flex items-center gap-1.5 transition-colors"
            title="Environment Setup Wizard — install mtkclient / Heimdall / CLI"
          >
            <Wrench className="w-3 h-3" />
            Setup
          </button>
          <DownloadDesktopButton variant="compact" />
          <DownloadCliButton variant="compact" />
          <a
            data-testid="window-download-source"
            href={`${API}/download/source`}
            className="h-7 shrink-0 px-2.5 border border-[#00FF41]/30 hover:bg-[#00FF41]/10 text-[#00FF41] font-mono text-[10px] tracking-[0.22em] uppercase flex items-center gap-1.5 transition-colors"
            title="Download full source (.zip) — authorized personal use only"
          >
            <FileArchive className="w-3 h-3" />
            Source
          </a>
        </div>
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          <button
            data-testid="window-minimize"
            className="w-8 h-10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Minus className="w-3.5 h-3.5" strokeWidth={2.4} />
          </button>
          <button
            data-testid="window-maximize"
            className="w-8 h-10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Square className="w-3 h-3" strokeWidth={2.4} />
          </button>
          <button
            data-testid="window-close"
            className="w-8 h-10 flex items-center justify-center text-white/40 hover:text-white hover:bg-red-500 transition-colors"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </div>
  );
};
