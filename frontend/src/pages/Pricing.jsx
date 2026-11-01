import React from "react";
import { useApp } from "../context/AppContext";
import { Check, Coins, Crown, Zap, ShieldOff, Hash, Smartphone as SmartphoneIcon, Lock, Sparkles, Infinity as InfinityIcon } from "lucide-react";

const PLAN = {
  name: "Solo Builder Edition",
  price: "$89",
  cycle: "/year",
  tagline: "For independent technicians and small-shop builders.",
  features: [
    "Unlimited device scans (MTK / Qualcomm / iPhone)",
    "Standard Aegis Unlock — included free",
    "Full session logs + audit export",
    "Exploit DB updates for 12 months",
    "Single-seat license · 2 active devices",
    "Email support (48h response)",
  ],
};

const SERVICES = [
  {
    key: "frp",
    name: "Standard Aegis Unlock",
    cost: "FREE",
    cost_value: 0,
    icon: ShieldOff,
    desc: "Post-reset account guard release for MTK & Qualcomm devices on stock firmware.",
    free: true,
    testid: "service-frp",
  },
  {
    key: "imei",
    name: "IMEI Repair",
    cost: "5 Credits",
    cost_value: 5,
    icon: Hash,
    desc: "Restore or rewrite IMEI/MEID on modem partition. Includes Luhn checksum validation.",
    testid: "service-imei",
  },
  {
    key: "kg_suspend",
    name: "Samsung KG Suspend",
    cost: "15 Credits",
    cost_value: 15,
    icon: Lock,
    desc: "Suspend Knox Guard / Carrier Lock on Samsung devices via privileged token push.",
    testid: "service-kg",
  },
  {
    key: "iphone_diag",
    name: "iPhone Modern Diagnostic",
    cost: "20 Credits",
    cost_value: 20,
    icon: SmartphoneIcon,
    desc: "Full hardware fingerprint, Activation Lock probe & SoC trust-cache audit (A12 → A18).",
    testid: "service-iphone",
  },
];

export default function Pricing() {
  const { credits, setCredits, pushLog } = useApp();

  const topUp = (amount) => {
    setCredits((c) => c + amount);
    pushLog("SUCCESS", `Account credited with +${amount} credits.`);
  };

  return (
    <div data-testid="pricing-page" className="h-full overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="bg-[#09090B] border border-white/10 p-5 flex flex-col md:flex-row md:items-center gap-4">
        <div className="w-12 h-12 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center flex-shrink-0">
          <Coins className="w-6 h-6 text-[#00FF41]" strokeWidth={1.8} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Pricing & Credits</h1>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/40 mt-1">
            License plans · pay-as-you-go credit operations
          </p>
        </div>
        <div className="border border-[#00FF41]/40 bg-[#00FF41]/5 px-5 py-3 flex items-center gap-3">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/50">
            Wallet
          </div>
          <div className="text-2xl font-bold text-[#00FF41] font-mono">{credits}</div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-white/40 font-mono">
            CR
          </div>
        </div>
      </div>

      {/* Plan cards row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Founding Builder — limited lifetime tier */}
        <div
          data-testid="plan-founding-builder"
          className="bg-[#09090B] border border-[#00FF41] p-6 relative overflow-hidden animate-pulse-glow"
        >
          <div className="absolute top-3 right-3 px-2 py-1 bg-[#00FF41] text-black font-mono text-[9px] tracking-[0.25em] uppercase font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Limited · 100 seats
          </div>
          <InfinityIcon className="w-7 h-7 text-[#00FF41] mb-4" strokeWidth={1.8} />
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#00FF41]">
            Founding Builder
          </div>
          <div className="text-xl font-bold mt-1 tracking-tight text-white">Lifetime Access</div>
          <p className="text-xs text-white/60 mt-2">
            One-time payment. All current and future modules — forever.
          </p>

          <div className="flex items-baseline gap-2 mt-5">
            <span className="text-4xl font-bold text-[#00FF41] font-mono">$299</span>
            <span className="text-sm text-white/30 line-through font-mono">$890</span>
          </div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/40 mt-1">
            One time · no recurring
          </div>

          <ul className="mt-5 space-y-2">
            {[
              "Everything in Solo Builder",
              "All future modules included",
              "500 starter credits",
              "Priority CVE feed access",
              "Founding member Discord",
              "Lifetime CLI updates",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-xs text-white/80">
                <Check className="w-3.5 h-3.5 text-[#00FF41] flex-shrink-0 mt-0.5" strokeWidth={2.4} />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <button
            data-testid="founding-builder-pricing-cta"
            className="mt-6 w-full h-11 bg-[#00FF41] hover:bg-[#00CC33] text-black font-mono text-xs tracking-[0.22em] uppercase font-bold transition-colors flex items-center justify-center gap-2"
          >
            <Zap className="w-3.5 h-3.5" />
            Claim Lifetime Seat
          </button>
        </div>

        <div
          data-testid="plan-solo"
          className="bg-[#09090B] border border-white/10 p-6 relative overflow-hidden"
        >
          <div className="absolute top-3 right-3 px-2 py-1 bg-white/5 text-white/60 font-mono text-[9px] tracking-[0.25em] uppercase">
            Current Plan
          </div>
          <Crown className="w-7 h-7 text-[#00FF41] mb-4" strokeWidth={1.8} />
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/50">
            License
          </div>
          <div className="text-xl font-bold mt-1 tracking-tight">{PLAN.name}</div>
          <p className="text-xs text-white/50 mt-2">{PLAN.tagline}</p>

          <div className="flex items-baseline gap-1 mt-5">
            <span className="text-4xl font-bold text-white">{PLAN.price}</span>
            <span className="text-sm text-white/40">{PLAN.cycle}</span>
          </div>

          <ul className="mt-5 space-y-2">
            {PLAN.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-xs text-white/70">
                <Check className="w-3.5 h-3.5 text-[#00FF41] flex-shrink-0 mt-0.5" strokeWidth={2.4} />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <button
            data-testid="plan-renew"
            className="mt-6 w-full h-10 bg-[#00FF41] hover:bg-[#00CC33] text-black font-mono text-xs tracking-[0.2em] uppercase font-semibold transition-colors"
          >
            Renew License
          </button>
        </div>

        {/* (services section moved below) */}
      </div>

      {/* Services pricing — full width */}
      <div className="bg-[#09090B] border border-white/10">
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-[#00FF41]" strokeWidth={2} />
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/70">
              Pay-per-Operation
            </span>
          </div>
          <span className="font-mono text-[10px] text-white/40">4 services</span>
        </div>

        <div className="divide-y divide-white/5">
          {SERVICES.map((s) => {
            const canAfford = s.free || credits >= s.cost_value;
            return (
              <div
                key={s.key}
                data-testid={s.testid}
                className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-5 py-4 items-center hover:bg-white/[0.02]"
              >
                <div
                  className={`w-10 h-10 border flex items-center justify-center ${
                    s.free
                      ? "border-[#00FF41]/40 text-[#00FF41] bg-[#00FF41]/5"
                      : "border-white/15 text-white/70"
                  }`}
                >
                  <s.icon className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{s.name}</div>
                  <div className="font-mono text-[11px] text-white/50 mt-1 leading-snug">
                    {s.desc}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`font-mono text-sm font-bold ${
                      s.free ? "text-[#00FF41]" : "text-white"
                    }`}
                  >
                    {s.cost}
                  </div>
                  <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-white/30 mt-0.5">
                    {s.free ? "Included" : "per execution"}
                  </div>
                </div>
                <button
                  data-testid={`${s.testid}-buy`}
                  disabled={!canAfford && !s.free}
                  className={`h-9 px-4 font-mono text-[10px] tracking-[0.2em] uppercase border transition-colors ${
                    s.free
                      ? "border-[#00FF41]/30 text-[#00FF41] hover:bg-[#00FF41]/10"
                      : canAfford
                        ? "border-white/15 text-white hover:border-[#00FF41]/40 hover:text-[#00FF41]"
                        : "border-white/10 text-white/30 cursor-not-allowed"
                  }`}
                >
                  {s.free ? "Use Now" : canAfford ? "Run" : "Need Credits"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top-up packs */}
      <div className="bg-[#09090B] border border-white/10">
        <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2">
          <Coins className="w-3.5 h-3.5 text-[#00FF41]" strokeWidth={2} />
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/70">
            Credit Top-up Packs
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-white/5">
          {[
            { credits: 15, price: 9, label: "Impulse", tagline: "1 op = $0.60" },
            { credits: 50, price: 19, label: "Starter" },
            { credits: 150, price: 49, label: "Builder", popular: true },
            { credits: 500, price: 149, label: "Workshop" },
            { credits: 2000, price: 499, label: "Wholesale" },
          ].map((pack) => (
            <div
              key={pack.credits}
              className="bg-[#09090B] p-5 flex flex-col gap-3 hover:bg-[#00FF41]/5 transition-colors relative"
            >
              {pack.popular && (
                <span className="absolute top-2 right-2 px-2 py-0.5 bg-[#00FF41]/15 text-[#00FF41] font-mono text-[9px] tracking-[0.2em] uppercase">
                  Popular
                </span>
              )}
              <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/40">
                {pack.label}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-[#00FF41] font-mono">+{pack.credits}</span>
                <span className="text-xs text-white/40 font-mono">CR</span>
              </div>
              <div className="text-sm text-white/70">${pack.price} USD</div>
              {pack.tagline && (
                <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-white/40">
                  {pack.tagline}
                </div>
              )}
              <button
                data-testid={`topup-${pack.credits}`}
                onClick={() => topUp(pack.credits)}
                className="mt-auto h-9 border border-[#00FF41]/30 hover:bg-[#00FF41]/10 text-[#00FF41] font-mono text-[10px] tracking-[0.2em] uppercase transition-colors"
              >
                Buy Pack
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
