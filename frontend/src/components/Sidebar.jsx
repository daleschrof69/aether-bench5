import React, { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Cpu,
  Radio,
  Smartphone,
  Tablet,
  ScrollText,
  Settings,
  CreditCard,
  Coins,
  BookOpen,
  HardDriveDownload,
  ShoppingCart,
  Menu,
  X,
  Usb,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { BuyCreditsModal } from "./BuyCreditsModal";
import { UserProfile } from "./UserProfile";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
  { to: "/mtk", label: "MTK Service", icon: Cpu, testid: "nav-mtk" },
  { to: "/qualcomm", label: "Qualcomm Service", icon: Radio, testid: "nav-qualcomm" },
  { to: "/iphone", label: "iPhone Service", icon: Smartphone, testid: "nav-iphone" },
  { to: "/samsung", label: "Samsung Service", icon: Tablet, testid: "nav-samsung" },
  { to: "/mtp", label: "MTP Mode", icon: Usb, testid: "nav-mtp" },
  { to: "/drivers", label: "Drivers & Tools", icon: HardDriveDownload, testid: "nav-drivers" },
  { to: "/logs", label: "Logs", icon: ScrollText, testid: "nav-logs" },
  { to: "/docs", label: "Documentation", icon: BookOpen, testid: "nav-docs" },
  { to: "/pricing", label: "Pricing & Credits", icon: CreditCard, testid: "nav-pricing" },
  { to: "/settings", label: "Settings", icon: Settings, testid: "nav-settings" },
];

const LOGO_URL =
  "https://static.prod-images.emergentagent.com/jobs/540cc9df-c50a-4a07-a460-6c88ca22b1a7/images/2d4119f8e681e91c440e01928176b55e52818652e44fd72f5f424ba935136d9c.png";

const BrandHeader = () => (
  <div className="px-5 py-5 border-b border-white/10">
    <div className="flex items-center gap-3 pr-10 lg:pr-0">
      <div className="w-11 h-11 border border-[#00FF41]/40 bg-black flex items-center justify-center relative overflow-hidden">
        <img
          src={LOGO_URL}
          alt="Aether"
          data-testid="brand-logo"
          className="w-full h-full object-contain p-0.5"
        />
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#00FF41] rounded-full animate-pulse-glow" />
      </div>
      <div className="leading-none">
        <div className="text-white font-semibold text-sm tracking-wide">AETHER</div>
        <div className="text-[10px] text-[#00FF41] font-mono tracking-[0.3em] mt-1">REPAIR.SUITE</div>
      </div>
    </div>
  </div>
);

const CreditsWidget = ({ credits }) => (
  <div className="mx-3 mt-3 mb-1 px-3 py-2.5 border border-[#00FF41]/30 bg-[#00FF41]/5 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <Coins className="w-4 h-4 text-[#00FF41]" strokeWidth={2} />
      <div className="leading-tight">
        <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-white/50">Balance</div>
        <div data-testid="credits-balance" className="text-[#00FF41] font-bold text-sm">
          {credits} Credits
        </div>
      </div>
    </div>
  </div>
);

const BuyCreditsCta = ({ onClick }) => (
  <button
    data-testid="sidebar-buy-credits-btn"
    onClick={onClick}
    className="mx-3 mb-2 h-11 lg:h-9 bg-[#00FF41] hover:bg-[#00CC33] text-black font-mono text-[10px] tracking-[0.22em] uppercase font-bold flex items-center justify-center gap-1.5 transition-colors"
  >
    <ShoppingCart className="w-3 h-3" />
    Buy Credits
  </button>
);

const NavItem = ({ item }) => (
  <li>
    <NavLink
      to={item.to}
      end={item.end}
      data-testid={item.testid}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-3 min-h-11 py-2.5 text-sm transition-colors ${
          isActive
            ? "bg-[#00FF41]/10 text-[#00FF41] border-l-2 border-[#00FF41]"
            : "text-white/60 hover:text-white hover:bg-white/5 border-l-2 border-transparent"
        }`
      }
    >
      <item.icon className="w-4 h-4" strokeWidth={1.8} />
      <span className="font-medium">{item.label}</span>
    </NavLink>
  </li>
);

const NavList = () => (
  <nav className="flex-1 py-3 px-2 overflow-y-auto overscroll-contain">
    <div className="px-3 mb-2 text-[10px] uppercase tracking-[0.25em] text-white/30 font-mono">
      Navigation
    </div>
    <ul className="space-y-0.5">
      {NAV_ITEMS.map((item) => (
        <NavItem key={item.to} item={item} />
      ))}
    </ul>
  </nav>
);

const LicenseBadge = ({ plan }) => (
  <div className="border-t border-white/10 px-4 py-2 font-mono text-[10px] text-white/30 space-y-0.5">
    <div className="flex justify-between">
      <span>LICENSE</span>
      <span className="text-[#00FF41] uppercase">{plan?.replace(/_/g, " ") || "free"}</span>
    </div>
  </div>
);

const AuthorCredit = () => (
  <a
    href="https://github.com/braidenbarker"
    target="_blank"
    rel="noreferrer"
    data-testid="sidebar-author-credit"
    className="group border-t border-white/5 px-4 py-2 flex items-center justify-between font-mono text-[9px] tracking-[0.25em] uppercase text-white/25 hover:text-[#00FF41] hover:bg-[#00FF41]/[0.03] transition-colors"
    title="Made by Braiden Barker — view on GitHub"
  >
    <span>Made by</span>
    <span className="text-white/40 group-hover:text-[#00FF41]">Braiden&nbsp;Barker</span>
  </a>
);

export const Sidebar = () => {
  const { user } = useAuth();
  const localCredits = useApp().credits;
  const credits = user?.credits ?? localCredits;
  const [buyOpen, setBuyOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the user navigates to a new route.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const drawerCls = mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0";

  return (
    <>
      <button
        data-testid="sidebar-mobile-toggle"
        onClick={() => setMobileOpen((open) => !open)}
        className="lg:hidden fixed top-0 left-0 z-[60] h-10 w-11 flex items-center justify-center text-white/80 hover:text-[#00FF41] hover:bg-white/5 transition-colors"
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={mobileOpen}
        aria-controls="app-sidebar"
      >
        {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {mobileOpen && (
        <div
          data-testid="sidebar-mobile-backdrop"
          className="lg:hidden fixed inset-0 bg-black/70 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        id="app-sidebar"
        data-testid="app-sidebar"
        className={`w-[min(18rem,calc(100vw-2.75rem))] lg:w-60 flex-shrink-0 bg-[#070709] border-r border-white/10 flex flex-col fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:relative lg:translate-x-0 lg:transition-none ${drawerCls}`}
      >
        <button
          data-testid="sidebar-mobile-close"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden absolute top-0 right-0 w-11 h-11 flex items-center justify-center text-white/50 hover:text-white transition-colors"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>

        <BrandHeader />
        <CreditsWidget credits={credits} />
        <BuyCreditsCta onClick={() => setBuyOpen(true)} />
        <NavList />
        <LicenseBadge plan={user?.plan} />
        <AuthorCredit />
        <UserProfile />
      </aside>

      <BuyCreditsModal open={buyOpen} onClose={() => setBuyOpen(false)} />
    </>
  );
};
