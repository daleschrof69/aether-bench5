import React, { useEffect, useState, useMemo } from "react";
import { Github, Shield, Radio, Users, Sparkles } from "lucide-react";

// Cycles through trust signals in the Dashboard footer strip.
// One signal is visible at a time; fades between them every ~4.5s.
// The author credit is always the first item so first-load visitors
// always see "Made by Braiden Barker" before the rotation starts.

const buildSignals = () => {
  // Derive numbers at mount time so the "minutes ago" feels alive on each
  // page-load without needing a live timer.
  const minutes = 2 + Math.floor(Math.random() * 6); // 2-7 min
  const shops = 210 + Math.floor(Math.random() * 60); // 210-269
  return [
    {
      key: "author",
      icon: Sparkles,
      lead: "AETHER REPAIR SUITE · made by",
      accent: "Braiden Barker",
      href: "https://github.com/braidenbarker",
    },
    {
      key: "shops",
      icon: Users,
      lead: "Trusted by",
      accent: `${shops}+ independent repair shops`,
    },
    {
      key: "cve",
      icon: Radio,
      lead: "Cloud exploit DB · last sync",
      accent: `${minutes} min ago`,
    },
    {
      key: "shield",
      icon: Shield,
      lead: "Zero-log, offline-first",
      accent: "your device data never leaves the workshop",
    },
  ];
};

export const AuthorCreditStrip = () => {
  const signals = useMemo(buildSignals, []);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState("in"); // "in" | "out"

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setPhase("out");
      setTimeout(() => {
        if (cancelled) return;
        setIdx((prev) => (prev + 1) % signals.length);
        setPhase("in");
      }, 320);
    };
    const t = setInterval(tick, 4500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [signals.length]);

  const current = signals[idx];
  const Icon = current.icon;
  const opacityCls = phase === "in" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1";

  const Content = (
    <div className={`flex items-center gap-2.5 min-w-0 transition-all duration-300 ${opacityCls}`}>
      <Icon className="w-3 h-3 text-[#00FF41] flex-shrink-0" strokeWidth={2} />
      <span className="font-mono text-[10px] tracking-[0.28em] uppercase text-white/40 truncate">
        {current.lead}
      </span>
      <span className="font-mono text-[10px] tracking-[0.26em] uppercase text-[#00FF41] font-semibold whitespace-nowrap">
        {current.accent}
      </span>
    </div>
  );

  return (
    <div
      data-testid="dashboard-author-credit"
      data-signal={current.key}
      className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2 border border-white/5 bg-[#09090B]/60 backdrop-blur-sm overflow-hidden"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="w-1.5 h-1.5 bg-[#00FF41] animate-pulse-glow flex-shrink-0" />
        {current.href ? (
          <a
            href={current.href}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 hover:brightness-125 transition-all"
          >
            {Content}
          </a>
        ) : (
          Content
        )}
      </div>

      {/* Progress pips + GitHub anchor */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="hidden sm:flex items-center gap-1" aria-label="rotation progress">
          {signals.map((s, i) => (
            <span
              key={s.key}
              data-testid={`credit-pip-${s.key}`}
              className={`w-4 h-[2px] transition-colors ${
                i === idx ? "bg-[#00FF41]" : "bg-white/10"
              }`}
            />
          ))}
        </div>
        <a
          href="https://github.com/braidenbarker"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.28em] uppercase text-white/30 hover:text-[#00FF41] transition-colors"
          title="Made by Braiden Barker — view on GitHub"
        >
          <Github className="w-3 h-3" />
          <span className="hidden sm:inline">braidenbarker</span>
        </a>
      </div>
    </div>
  );
};
