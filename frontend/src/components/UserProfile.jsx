import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { LogOut, User as UserIcon, Crown, Calendar } from "lucide-react";

const initials = (s) =>
  (s || "?")
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
};

export const UserProfile = () => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        data-testid="user-profile-trigger"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 border-t border-white/10 hover:bg-white/5 transition-colors text-left"
      >
        <div className="w-9 h-9 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center overflow-hidden flex-shrink-0">
          {user.picture ? (
            <img src={user.picture} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="font-mono text-xs text-[#00FF41]">{initials(user.name || user.email)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div data-testid="user-profile-name" className="text-sm text-white truncate">
            {user.name || user.email.split("@")[0]}
          </div>
          <div className="font-mono text-[10px] text-[#00FF41] truncate">
            {user.credits} credits
          </div>
        </div>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            data-testid="user-profile-popover"
            className="absolute bottom-full left-2 right-2 mb-1 bg-[#0A0A0D] border border-[#00FF41]/30 z-50 shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
          >
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center overflow-hidden">
                  {user.picture ? (
                    <img src={user.picture} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-mono text-sm text-[#00FF41]">{initials(user.name || user.email)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white truncate">{user.name || "Aether User"}</div>
                  <div className="font-mono text-[11px] text-white/50 truncate">{user.email}</div>
                </div>
              </div>
            </div>

            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="flex items-center gap-1.5 text-white/40">
                  <Calendar className="w-3 h-3" /> Member since
                </span>
                <span data-testid="user-profile-member-since" className="text-white">{formatDate(user.member_since)}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="flex items-center gap-1.5 text-white/40">
                  <Crown className="w-3 h-3" /> Plan
                </span>
                <span className="text-[#00FF41] uppercase">{user.plan?.replace(/_/g, " ") || "free"}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="flex items-center gap-1.5 text-white/40">
                  <UserIcon className="w-3 h-3" /> Provider
                </span>
                <span className="text-white">{user.provider}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-white/40">Credits</span>
                <span data-testid="user-profile-credits" className="text-[#00FF41] font-bold">{user.credits}</span>
              </div>
            </div>

            <button
              data-testid="user-profile-logout"
              onClick={async () => {
                setOpen(false);
                await logout();
                window.location.href = "/login";
              }}
              className="w-full px-4 py-3 border-t border-white/10 hover:bg-red-500/5 text-red-400 hover:text-red-300 text-sm flex items-center gap-2 font-mono tracking-[0.18em] uppercase text-[11px]"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
};
