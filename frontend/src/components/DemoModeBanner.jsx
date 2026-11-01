import React, { useState } from "react";
import { Info, X, Download, ExternalLink } from "lucide-react";
import { useApp } from "../context/AppContext";
import { useCliBridge } from "../hooks/useCliBridge";

// Persistent (session-local) demo notice for end users.
// Makes it crystal-clear that the web app is a preview / showcase,
// and the real device repair happens through the Aether CLI / desktop build.
const STORAGE_KEY = "aether.demo_banner.dismissed";

export const DemoModeBanner = () => {
  const { pushLog } = useApp();
  const { status: cliStatus } = useCliBridge();
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) !== "1";
    } catch (e) {
      console.debug("[DemoModeBanner] sessionStorage read blocked:", e);
      return true;
    }
  });

  // Auto-hide whenever the local CLI bridge is connected — we're live, not demo.
  if (!open || cliStatus === "connected") return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch (e) {
      console.debug("[DemoModeBanner] sessionStorage write blocked:", e);
    }
    setOpen(false);
  };

  const handleDownload = (e) => {
    e.preventDefault();
    pushLog("INFO", "Opening Aether CLI download — required for real device repair.");
    // Scroll to / trigger the existing CLI download popover via top-bar button
    const trigger = document.querySelector('[data-testid="cli-download-trigger"]');
    if (trigger) trigger.click();
  };

  return (
    <div
      data-testid="demo-mode-banner"
      className="relative bg-[#0a0a0d] border border-yellow-400/30 overflow-hidden"
    >
      {/* Diagonal hazard stripe accent — left edge */}
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{
          background:
            "repeating-linear-gradient(45deg, rgba(250, 204, 21, 0.9) 0 6px, transparent 6px 12px)",
        }}
      />
      <div className="relative flex flex-col md:flex-row md:items-center gap-3 p-3 pl-5">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 border border-yellow-400/40 bg-yellow-400/10 flex items-center justify-center flex-shrink-0">
            <Info className="w-4 h-4 text-yellow-400" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-yellow-400 font-semibold">
                Hardware Not Connected
              </span>
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/40">
                Local CLI bridge offline
              </span>
            </div>
            <div className="text-sm text-white/85 mt-1 leading-snug">
              Real device repair runs through the{" "}
              <span className="text-[#00FF41] font-semibold">Aether CLI</span> (native Rust binary)
              on your own machine. Start it (or launch the Aether desktop app) and this dashboard
              auto-connects — then plug a phone into BROM / EDL / DFU / Download mode. Operations are
              executed on real hardware; nothing here is simulated.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            data-testid="demo-banner-download-cli"
            onClick={handleDownload}
            className="h-9 px-3 border border-[#00FF41]/40 hover:bg-[#00FF41]/10 text-[#00FF41] font-mono text-[10px] tracking-[0.22em] uppercase flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3 h-3" />
            Get the CLI
          </button>
          <a
            href="/docs"
            data-testid="demo-banner-learn-more"
            className="h-9 px-3 border border-white/15 hover:border-white/30 text-white/70 hover:text-white font-mono text-[10px] tracking-[0.22em] uppercase flex items-center gap-1.5 transition-colors"
          >
            Learn more
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            data-testid="demo-banner-dismiss"
            onClick={dismiss}
            className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            title="Dismiss for this session"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
