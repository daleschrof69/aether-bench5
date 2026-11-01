import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { Crown, Sparkles, X, Zap } from "lucide-react";

// Banner CTA that promotes the limited Founding Builder lifetime offer.
// Dismissible per-session. Used at the top of Dashboard.
export const FoundingBuilderBanner = () => {
  const { pushLog, setCredits } = useApp();
  const [open, setOpen] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  if (!open) return null;

  const claim = () => {
    setClaiming(true);
    pushLog("INFO", "Initiating Founding Builder claim flow ...");
    setTimeout(() => {
      pushLog("SUCCESS", "Founding Builder seat reserved · lifetime license issued.");
      setCredits((c) => c + 500);
      setClaimed(true);
      setClaiming(false);
    }, 1400);
  };

  return (
    <div
      data-testid="founding-builder-banner"
      className="relative bg-[#09090B] border border-[#00FF41]/40 overflow-hidden"
    >
      {/* Faint scan accent */}
      <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[#00FF41]/[0.04] to-transparent pointer-events-none" />
      <div className="relative flex flex-col md:flex-row md:items-center gap-4 p-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-11 h-11 border border-[#00FF41]/40 bg-[#00FF41]/10 flex items-center justify-center flex-shrink-0 animate-pulse-glow">
            <Crown className="w-5 h-5 text-[#00FF41]" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#00FF41]">
                ● Limited · 100 seats
              </span>
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/40">
                Founding Builder Tier
              </span>
            </div>
            <div className="text-lg md:text-xl font-bold tracking-tight text-white mt-1 leading-tight">
              Lock in <span className="text-[#00FF41]">Aether Lifetime</span> for $299
              <span className="text-white/30 line-through font-normal text-base ml-2">$890</span>
            </div>
            <div className="font-mono text-[11px] text-white/50 mt-1">
              One-time payment · all current + future modules · +500 starter credits
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            data-testid="founding-builder-claim"
            disabled={claiming || claimed}
            onClick={claim}
            className={`h-10 px-5 font-mono text-xs tracking-[0.22em] uppercase font-semibold transition-colors flex items-center gap-2 ${
              claimed
                ? "bg-[#00FF41]/15 text-[#00FF41] border border-[#00FF41]/40 cursor-default"
                : "bg-[#00FF41] hover:bg-[#00CC33] text-black"
            }`}
          >
            {claimed ? (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Seat Reserved
              </>
            ) : claiming ? (
              <>
                <Zap className="w-3.5 h-3.5 animate-pulse" />
                Reserving ...
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                Claim $299 Lifetime
              </>
            )}
          </button>
          <button
            data-testid="founding-builder-dismiss"
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
