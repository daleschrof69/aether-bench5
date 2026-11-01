import React, { useState, useEffect } from "react";
import { Download, X, Monitor, Apple, Cpu, Check, Bell, Loader2 } from "lucide-react";
import { DESKTOP_VERSION as VERSION } from "../lib/releases";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const STORAGE_KEY = "aether.hero.getDesktop.dismissed";
const WAITLIST_STORAGE_KEY = "aether.hero.getDesktop.waitlisted";

const ScanLineOverlay = () => (
  <div
    className="absolute inset-0 opacity-[0.04] pointer-events-none"
    style={{
      backgroundImage:
        "repeating-linear-gradient(0deg, rgba(0,255,65,0.5) 0px, rgba(0,255,65,0.5) 1px, transparent 1px, transparent 3px)",
    }}
  />
);

const HeroInfo = () => (
  <div className="flex items-start md:items-center gap-3 md:gap-5 flex-1 min-w-0">
    <div className="hidden sm:flex w-11 h-11 md:w-12 md:h-12 border border-[#00FF41]/40 bg-black flex-shrink-0 items-center justify-center">
      <Cpu className="w-5 h-5 md:w-6 md:h-6 text-[#00FF41]" />
    </div>

    <div className="flex-1 min-w-0 pr-8 md:pr-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
        <span className="font-mono text-[9px] tracking-[0.32em] uppercase text-[#00FF41]/80 whitespace-nowrap">
          Native build · v{VERSION} · coming soon
        </span>
        <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-white/30 whitespace-nowrap">
          Tauri 2 · WebView2
        </span>
      </div>
      <h3 className="font-mono text-sm tracking-[0.2em] uppercase text-white mb-1">
        Aether for Windows — beta launching soon
      </h3>
      <p className="font-mono text-[11px] text-white/60 leading-relaxed">
        The native installer talks to MTK BROM, Qualcomm Sahara / Firehose, Apple DFU and Samsung KG
        directly over USB — no browser, no bridge process. Drop your email to get the .msi the moment
        the build lands.
      </p>
    </div>
  </div>
);

const WaitlistForm = ({ onDone }) => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [message, setMessage] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!email || status === "loading") return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch(`${API}/waitlist/desktop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), platform: "windows" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.detail?.[0]?.msg || data?.detail || "Please enter a valid email.");
        return;
      }
      try {
        localStorage.setItem(WAITLIST_STORAGE_KEY, email.trim().toLowerCase());
      } catch (err) {
        console.debug("[waitlist] localStorage blocked:", err);
      }
      setStatus("success");
      setMessage(`You're on the list. We'll email you the .msi at launch.`);
      onDone?.();
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "Network error — try again.");
    }
  };

  if (status === "success") {
    return (
      <div
        data-testid="get-desktop-hero-waitlist-success"
        className="flex items-center gap-2 h-9 px-3 border border-[#00FF41]/40 bg-[#00FF41]/[0.05] font-mono text-[11px] tracking-[0.15em] uppercase text-[#00FF41]"
      >
        <Check className="w-3.5 h-3.5" />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5 flex-shrink-0 w-full md:w-auto">
      <div className="flex flex-col sm:flex-row gap-1.5 md:w-[420px]">
        <input
          data-testid="get-desktop-hero-email"
          type="email"
          required
          placeholder="you@workshop.dev"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "loading"}
          className="flex-1 h-9 px-3 bg-black border border-white/15 focus:border-[#00FF41]/60 focus:outline-none font-mono text-[11px] text-white placeholder:text-white/25 tracking-wide"
        />
        <button
          data-testid="get-desktop-hero-waitlist-submit"
          type="submit"
          disabled={status === "loading"}
          className="h-9 px-4 bg-[#00FF41] hover:bg-[#00CC33] disabled:opacity-60 text-black font-mono text-[11px] tracking-[0.22em] uppercase font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
        >
          {status === "loading" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Bell className="w-3.5 h-3.5" />
          )}
          Notify me
        </button>
      </div>
      {status === "error" && (
        <div
          data-testid="get-desktop-hero-waitlist-error"
          className="font-mono text-[10px] text-red-400"
        >
          {message}
        </div>
      )}
      <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/30 flex items-center gap-2 justify-center md:justify-start">
        <Download className="w-3 h-3" />
        <span>Windows .msi first · macOS &amp; Linux to follow</span>
      </div>
    </form>
  );
};

// One-time dismissible conversion card. Windows CTA is currently a waitlist form
// because the native .msi has not been published yet (see /app/.github/workflows/
// desktop-release.yml — fires on `desktop-vX.Y.Z` tag push). Once builds are live,
// swap this back to the direct download link scheme.
export const GetDesktopHeroCard = () => {
  const [dismissed, setDismissed] = useState(true);
  const [alreadyOnList, setAlreadyOnList] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
      setAlreadyOnList(Boolean(localStorage.getItem(WAITLIST_STORAGE_KEY)));
    } catch (e) {
      console.debug("[GetDesktopHeroCard] localStorage read blocked:", e);
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch (e) {
      console.debug("[GetDesktopHeroCard] localStorage write blocked:", e);
    }
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div
      data-testid="get-desktop-hero"
      className="relative overflow-hidden bg-gradient-to-br from-[#00FF41]/[0.06] via-transparent to-transparent border border-[#00FF41]/30"
    >
      <ScanLineOverlay />
      <button
        data-testid="get-desktop-hero-dismiss"
        onClick={dismiss}
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-white/30 hover:text-white/70 transition-colors z-10"
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="relative px-4 py-4 md:px-5 flex flex-col md:flex-row md:items-center gap-4 md:gap-5">
        <HeroInfo />
        {alreadyOnList ? (
          <div
            data-testid="get-desktop-hero-waitlist-existing"
            className="flex items-center gap-2 h-9 px-3 border border-[#00FF41]/40 bg-[#00FF41]/[0.05] font-mono text-[11px] tracking-[0.15em] uppercase text-[#00FF41] flex-shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
            You&apos;re on the Windows waitlist
          </div>
        ) : (
          <WaitlistForm onDone={() => setAlreadyOnList(true)} />
        )}
      </div>

      <div className="relative px-4 pb-3 md:px-5 flex flex-col gap-2">
        <div className="flex items-center gap-3 justify-center md:justify-start font-mono text-[10px] tracking-[0.18em] uppercase text-white/30">
          <Apple className="w-3 h-3" />
          <span>macOS .dmg</span>
          <span className="text-white/20">·</span>
          <Monitor className="w-3 h-3" />
          <span>Linux .AppImage</span>
          <span className="text-white/20">·</span>
          <span>coming with the same tag</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-center md:justify-start font-mono text-[10px] tracking-[0.18em] uppercase">
          <a
            data-testid="get-desktop-hero-download-source"
            href={`${API}/download/source`}
            className="inline-flex items-center gap-1.5 text-[#00FF41] hover:text-[#00CC33] transition-colors"
          >
            <Download className="w-3 h-3" />
            Download full source (.zip) now
          </a>
          <span className="text-white/20">·</span>
          <span className="text-white/30">Authorized personal use only</span>
        </div>
      </div>
    </div>
  );
};
