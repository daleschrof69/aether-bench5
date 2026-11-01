import React, { useState } from "react";
import { useAuth, formatApiError } from "../context/AuthContext";
import { X, Loader2, Coins, Crown, ShieldCheck, ArrowRight, Infinity as InfinityIcon } from "lucide-react";

const PACKS = [
  { tier_id: "credits_impulse",  price: 9,   credits: 15,   label: "Impulse", tagline: "1 op = $0.60" },
  { tier_id: "credits_starter",  price: 19,  credits: 50,   label: "Starter" },
  { tier_id: "credits_builder",  price: 49,  credits: 150,  label: "Builder", popular: true },
  { tier_id: "credits_workshop", price: 149, credits: 500,  label: "Workshop" },
  { tier_id: "credits_wholesale",price: 499, credits: 2000, label: "Wholesale" },
];

const PLANS = [
  {
    tier_id: "solo_annual",
    price: 89,
    cycle: "/year",
    label: "Solo Builder",
    icon: Crown,
    desc: "Annual license · all current modules · 50 bonus credits.",
  },
  {
    tier_id: "founding_lifetime",
    price: 299,
    cycle: "lifetime",
    label: "Founding Builder",
    icon: InfinityIcon,
    featured: true,
    desc: "One-time payment · everything forever · 500 bonus credits.",
  },
];

const PlanCard = ({ plan, isBusy, disabled, onClick }) => {
  const Icon = plan.icon;
  const wrapperCls = plan.featured
    ? "border-[#00FF41] bg-[#00FF41]/5 hover:bg-[#00FF41]/10"
    : "border-white/15 hover:border-[#00FF41]/40 hover:bg-[#00FF41]/5";
  const iconCls = plan.featured ? "text-[#00FF41]" : "text-white/70";
  const priceCls = plan.featured ? "text-[#00FF41]" : "text-white";
  const ctaCls = plan.featured
    ? "bg-[#00FF41] text-black font-semibold"
    : "border border-white/15 text-white group-hover:border-[#00FF41]/40 group-hover:text-[#00FF41]";

  return (
    <button
      data-testid={`buy-plan-${plan.tier_id}`}
      onClick={onClick}
      disabled={disabled}
      className={`group text-left p-5 border transition-colors disabled:opacity-50 ${wrapperCls}`}
    >
      <div className="flex items-start justify-between mb-3">
        <Icon className={`w-6 h-6 ${iconCls}`} strokeWidth={1.8} />
        {plan.featured && (
          <span className="font-mono text-[9px] tracking-[0.25em] uppercase bg-[#00FF41] text-black px-1.5 py-0.5 font-semibold">
            Best Value
          </span>
        )}
      </div>
      <div className="text-base font-semibold text-white">{plan.label}</div>
      <div className="font-mono text-[11px] text-white/40 mt-1 leading-snug">{plan.desc}</div>
      <div className="flex items-baseline gap-1 mt-3">
        <span className={`text-2xl font-bold ${priceCls} font-mono`}>${plan.price}</span>
        <span className="text-xs text-white/40 font-mono">{plan.cycle}</span>
      </div>
      <div className={`mt-3 h-9 flex items-center justify-center gap-1.5 font-mono text-[10px] tracking-[0.22em] uppercase ${ctaCls}`}>
        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
        {isBusy ? "Redirecting ..." : "Checkout"}
      </div>
    </button>
  );
};

const PackCard = ({ pack, isBusy, disabled, onClick }) => (
  <button
    data-testid={`buy-pack-${pack.tier_id}`}
    disabled={disabled}
    onClick={onClick}
    className="text-left bg-[#09090B] p-4 flex flex-col gap-2 hover:bg-[#00FF41]/5 transition-colors disabled:opacity-50 relative"
  >
    {pack.popular && (
      <span className="absolute top-2 right-2 font-mono text-[9px] tracking-[0.2em] uppercase bg-[#00FF41]/15 text-[#00FF41] px-1.5 py-0.5">
        Popular
      </span>
    )}
    <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-white/40">
      {pack.label}
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-xl font-bold text-[#00FF41] font-mono">+{pack.credits}</span>
      <span className="text-[10px] text-white/40 font-mono">CR</span>
    </div>
    <div className="text-sm text-white/70">${pack.price}</div>
    {pack.tagline && (
      <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-white/40">
        {pack.tagline}
      </div>
    )}
    <div className="mt-1 h-8 flex items-center justify-center font-mono text-[10px] tracking-[0.22em] uppercase border border-[#00FF41]/30 text-[#00FF41]">
      {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Buy"}
    </div>
  </button>
);

export const BuyCreditsModal = ({ open, onClose }) => {
  const { http, user } = useAuth();
  const [busy, setBusy] = useState(null); // tier_id while creating session
  const [err, setErr] = useState("");

  if (!open) return null;

  const startCheckout = async (tier_id) => {
    setErr("");
    setBusy(tier_id);
    try {
      const { data } = await http.post("/stripe/checkout", {
        tier_id,
        origin_url: window.location.origin,
      });
      window.location.href = data.url;
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
      setBusy(null);
    }
  };

  return (
    <div
      data-testid="buy-credits-modal"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-[#09090B] border border-[#00FF41]/30 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#09090B] z-10">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-[#00FF41]" />
            <span className="font-mono text-[11px] tracking-[0.25em] uppercase text-white/80">
              Buy Credits & Licenses
            </span>
          </div>
          <button
            data-testid="buy-credits-close"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/40 mb-3">
              License plans
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PLANS.map((p) => (
                <PlanCard
                  key={p.tier_id}
                  plan={p}
                  isBusy={busy === p.tier_id}
                  disabled={!!busy}
                  onClick={() => startCheckout(p.tier_id)}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/40 mb-3">
              Credit top-up packs
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-white/5">
              {PACKS.map((pack) => (
                <PackCard
                  key={pack.tier_id}
                  pack={pack}
                  isBusy={busy === pack.tier_id}
                  disabled={!!busy}
                  onClick={() => startCheckout(pack.tier_id)}
                />
              ))}
            </div>
          </div>

          {err && (
            <div data-testid="buy-credits-error" className="px-3 py-2 border border-red-500/30 bg-red-500/5 text-red-300 text-xs">
              {err}
            </div>
          )}

          <div className="flex items-center gap-2 font-mono text-[10px] text-white/40 leading-relaxed border-t border-white/5 pt-3">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00FF41]" />
            Payments secured by Stripe. Current balance:{" "}
            <span className="text-[#00FF41] font-semibold">{user?.credits ?? 0} credits</span>.
          </div>
        </div>
      </div>
    </div>
  );
};
