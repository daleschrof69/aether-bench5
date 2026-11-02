import React from "react";
import { useApp } from "../context/AppContext";
import {
  ShieldOff,
  Hash,
  Unlock,
  Eraser,
  Loader2,
  Zap,
  KeyRound,
  Cloud,
  Lock,
  Tag,
  Wifi,
  Save,
  Wrench,
  Fingerprint,
  ShieldCheck,
  Activity,
  Search,
  Sparkles,
  Smartphone,
  Building2,
  FileCheck2,
  Signal,
  Layers,
} from "lucide-react";

const ICONS = {
  ShieldOff,
  Hash,
  Unlock,
  Eraser,
  KeyRound,
  Cloud,
  Lock,
  Tag,
  Wifi,
  Save,
  Wrench,
  Fingerprint,
  ShieldCheck,
  Activity,
  Search,
  Zap,
  Sparkles,
  Smartphone,
  Building2,
  FileCheck2,
  Signal,
  Layers,
};

const DEFAULT_ACTIONS = [
  { key: "universal_unlock",  label: "Auto-Unlock (All-in-One)", icon: "Sparkles", danger: false, testid: "action-universal-unlock", cost: "Free" },
  { key: "bypass_frp",        label: "Aegis Unlock",        icon: "ShieldOff", danger: false, testid: "action-bypass-frp", cost: "Free" },
  { key: "remove_screen_lock",label: "Remove Screen Lock",  icon: "KeyRound",  danger: false, testid: "action-remove-screen-lock", cost: "Free" },
  { key: "repair_imei",       label: "Repair IMEI",         icon: "Hash",      danger: false, testid: "action-repair-imei", cost: "Free" },
  { key: "unlock_bootloader", label: "Unlock Bootloader",   icon: "Unlock",    danger: true,  testid: "action-unlock-bootloader", cost: "Free" },
  { key: "erase_userdata",    label: "Erase Userdata",      icon: "Eraser",    danger: true,  testid: "action-erase-userdata", cost: "Free" },
];

const ActionButton = ({ action, isActive, isDisabled, onClick }) => {
  const Icon = ICONS[action.icon] || Zap;
  const hoverClass = action.danger ? "hover:bg-red-500/5" : "hover:bg-[#00FF41]/5";
  const stateClass = isDisabled ? "opacity-40 cursor-not-allowed" : hoverClass;
  const activeBg = isActive ? "bg-[#00FF41]/10" : "";
  const iconBorder = action.danger
    ? "border-red-500/30 text-red-400 group-hover:border-red-500"
    : "border-[#00FF41]/30 text-[#00FF41] group-hover:border-[#00FF41]";
  const costColor = action.cost === "Free" ? "text-[#00FF41]/70" : "text-white/40";
  const kindLabel = action.danger ? "Destructive" : "Safe op";

  return (
    <button
      data-testid={action.testid}
      disabled={isDisabled}
      onClick={onClick}
      className={`group relative bg-[#09090B] p-3 flex flex-col items-start gap-2 transition-colors min-h-[92px] text-left ${stateClass} ${activeBg}`}
    >
      <div className="flex items-center justify-between w-full">
        <div className={`w-9 h-9 border flex items-center justify-center ${iconBorder} transition-colors`}>
          {isActive ? (
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
          ) : (
            <Icon className="w-4 h-4" strokeWidth={2} />
          )}
        </div>
        {action.cost && (
          <span className={`font-mono text-[9px] tracking-[0.2em] uppercase ${costColor}`}>
            {action.cost}
          </span>
        )}
      </div>
      <div className="text-left w-full min-w-0">
        <div className="text-white text-sm font-semibold tracking-tight leading-snug break-words">
          {action.label}
        </div>
        <div className="font-mono text-[10px] text-white/40 mt-1 uppercase tracking-[0.15em]">
          {kindLabel}
        </div>
      </div>
      {isActive && (
        <span className="absolute top-2 right-2 font-mono text-[9px] text-[#00FF41] tracking-[0.2em]">
          RUNNING
        </span>
      )}
    </button>
  );
};

export const ActionGrid = ({ platform = "MediaTek", actions, title, columns = 1, requireDevice = true }) => {
  const { runAction, activeAction, status, device, setImeiModalOpen } = useApp();
  const platformOk = !device || device.platform === platform || platform === "ALL";
  const list = actions && actions.length ? actions : DEFAULT_ACTIONS;
  const disabled = (requireDevice && status !== "connected") || !platformOk;
  const cols = columns >= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1";

  const handleAction = (a) => {
    // IMEI repair needs user input — open the dedicated modal instead of
    // firing the action immediately.
    if (a.key === "repair_imei") {
      setImeiModalOpen(true);
      return;
    }
    runAction(a.key, a.label, {}, a.cost);
  };

  const headerLabel = title || (platform === "ALL" ? "Quick Actions" : `${platform} Operations`);

  return (
    <div
      data-testid="action-grid-panel"
      className="bg-[#09090B] border border-white/10 flex flex-col h-full min-h-0"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-[#00FF41]" strokeWidth={2} />
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/70">
            {headerLabel}
          </span>
          <span className="font-mono text-[10px] text-white/30">· {list.length}</span>
        </div>
        {!platformOk && device && (
          <span className="font-mono text-[10px] text-yellow-400/80 tracking-[0.15em] uppercase">
            ⚠ Wrong platform
          </span>
        )}
      </div>

      <div className={`grid ${cols} gap-px bg-white/5 flex-1 min-h-0 overflow-y-auto`}>
        {list.map((a) => (
          <ActionButton
            key={a.key}
            action={a}
            isActive={activeAction === a.label}
            isDisabled={disabled || !!activeAction}
            onClick={() => handleAction(a)}
          />
        ))}
      </div>
    </div>
  );
};

// Pre-built action lists for each platform module
export const MTK_ACTIONS = [
  ...DEFAULT_ACTIONS,
  { key: "disable_auth",      label: "Disable Auth (BROM)", icon: "Layers",    danger: false, testid: "action-disable-auth", cost: "Free" },
  { key: "mi_account_bypass", label: "Mi Account Bypass", icon: "Cloud",     danger: false, testid: "action-mi-account",   cost: "Free" },
  { key: "mdm_bypass",        label: "MDM Bypass",         icon: "Building2", danger: false, testid: "action-mdm-bypass",   cost: "Free" },
  { key: "read_codes",        label: "Read Lockscreen",    icon: "KeyRound",  danger: false, testid: "action-read-codes",   cost: "Free" },
  { key: "read_frp_token",    label: "Read Aegis Token",   icon: "Fingerprint", danger: false, testid: "action-read-frp",   cost: "Free" },
  { key: "boot_repair",       label: "Boot Repair",        icon: "Wrench",    danger: false, testid: "action-boot-repair",  cost: "Free" },
];

export const QC_ACTIONS = [
  { key: "enter_edl",         label: "Enter EDL (no cable)", icon: "Zap",     danger: false, testid: "action-enter-edl",    cost: "Free" },
  { key: "edl_auth_unlock",   label: "EDL Auth Unlock",    icon: "Unlock",    danger: false, testid: "action-edl-auth",     cost: "Free" },
  ...DEFAULT_ACTIONS,
  { key: "cert_repair",       label: "Cert / IMEI Repair", icon: "FileCheck2", danger: false, testid: "action-cert-repair", cost: "Free" },
  { key: "knox_suspend",      label: "Samsung KG Suspend", icon: "Lock",      danger: false, testid: "action-knox-suspend", cost: "Free" },
  { key: "carrier_unlock",    label: "Carrier Unlock",     icon: "Wifi",      danger: false, testid: "action-carrier-unlock", cost: "Free" },
  { key: "demo_unit_disable", label: "Disable Demo Mode",  icon: "Tag",       danger: false, testid: "action-demo-disable", cost: "Free" },
  { key: "safe_format",       label: "Safe Format",        icon: "Save",      danger: false, testid: "action-safe-format",  cost: "Free" },
];

export const IPHONE_ACTIONS = [
  { key: "apple_info",        label: "Modern Diagnostic",  icon: "Activity",     danger: false, testid: "iphone-action-diag",     cost: "Free" },
  { key: "icloud_check",      label: "Activation Probe",   icon: "Search",       danger: false, testid: "iphone-action-probe",    cost: "Free" },
  { key: "hello_screen_bypass", label: "Hello Screen Bypass (pwned-DFU)", icon: "Smartphone", danger: false, testid: "iphone-action-hello", cost: "Free" },
  { key: "sim_unlock",        label: "SIM / Network Unlock", icon: "Signal",     danger: false, testid: "iphone-action-sim",     cost: "Free" },
  { key: "passcode_recover",  label: "Passcode Recovery",  icon: "Lock",         danger: true,  testid: "iphone-action-passcode", cost: "Free" },
  { key: "trust_audit",       label: "Trust Cache Audit",  icon: "ShieldCheck",  danger: false, testid: "iphone-action-trust",    cost: "Free" },
  { key: "apple_lockdown",    label: "Lockdown Info",      icon: "Activity",     danger: false, testid: "iphone-action-lockdown",    cost: "Free" },
  { key: "apple_diagnostics", label: "Diagnostics",        icon: "ShieldCheck",  danger: false, testid: "iphone-action-diagnostics", cost: "Free" },
  { key: "apple_list",        label: "List Devices",       icon: "Smartphone",   danger: false, testid: "iphone-action-list",        cost: "Free" },
  { key: "apple_restore",     label: "Official Restore",   icon: "AlertTriangle", danger: true, testid: "iphone-action-restore",     cost: "Free" },
];

// Samsung — Heimdall (Odin protocol) operations.
// `factory_reset` is the headline action: erases USERDATA partition, which
// drops the device to its setup-wizard state. Works on Galaxy S9 / Note 9
// and older A-series; newer Knox 3.x models may reject the write.
export const SAMSUNG_ACTIONS = [
  { key: "samsung_detect",        label: "Detect Device",      icon: "Search",       danger: false, testid: "action-samsung-detect",  cost: "Free" },
  { key: "samsung_swclone",       label: "Smart Switch",       icon: "Smartphone",   danger: false, testid: "action-samsung-swclone", cost: "Free" },
  { key: "samsung_read_pit",      label: "Read PIT Table",     icon: "Hash",         danger: false, testid: "action-samsung-pit",     cost: "Free" },
  { key: "bypass_frp",            label: "Aegis Unlock",       icon: "ShieldOff",    danger: false, testid: "action-samsung-frp",     cost: "Free" },
  { key: "remove_screen_lock",    label: "Remove Screen Lock", icon: "KeyRound",     danger: false, testid: "action-samsung-screen",  cost: "Free" },
  { key: "samsung_mdm_remove",    label: "MDM / KG Remove",    icon: "Building2",    danger: false, testid: "action-samsung-mdm",     cost: "Free" },
  { key: "samsung_factory_reset", label: "Factory Reset",      icon: "Eraser",       danger: true,  testid: "action-samsung-reset",   cost: "Free" },
];

// MTP — file-transfer mode operations (detection + basic file ops).
export const OFFICIAL_ACTIONS = [
  { key: "official_adb_devices",     label: "ADB Devices",        icon: "Search",     danger: false, testid: "official-adb-devices", cost: "Free" },
  { key: "official_adb_state",       label: "ADB State",          icon: "Activity",   danger: false, testid: "official-adb-state", cost: "Free" },
  { key: "official_adb_reboot",      label: "ADB Reboot",         icon: "Zap",        danger: false, testid: "official-adb-reboot", cost: "Free" },
  { key: "official_adb_recovery",    label: "ADB Recovery",       icon: "Wrench",     danger: false, testid: "official-adb-recovery", cost: "Free" },
  { key: "official_adb_bootloader",  label: "ADB Bootloader",     icon: "Unlock",     danger: false, testid: "official-adb-bootloader", cost: "Free" },
  { key: "official_adb_download",    label: "ADB Download Mode",  icon: "Smartphone", danger: false, testid: "official-adb-download", cost: "Free" },
  { key: "official_fastboot_devices", label: "Fastboot Devices",  icon: "Search",     danger: false, testid: "official-fastboot-devices", cost: "Free" },
  { key: "official_fastboot_getvar", label: "Fastboot Getvar",    icon: "Hash",       danger: false, testid: "official-fastboot-getvar", cost: "Free" },
  { key: "official_heimdall_version", label: "Heimdall Version",  icon: "Activity",   danger: false, testid: "official-heimdall-version", cost: "Free" },
  { key: "official_heimdall_close",  label: "Close Download Screen", icon: "Wrench",  danger: false, testid: "official-heimdall-close", cost: "Free" },
  { key: "official_heimdall_pit",    label: "Save PIT File",      icon: "Hash",       danger: false, testid: "official-heimdall-pit", cost: "Free" },
];

export const MTP_ACTIONS = [
  { key: "mtp_detect",    label: "Detect MTP",     icon: "Usb",      danger: false, testid: "action-mtp-detect",  cost: "Free" },
  { key: "mtp_list",      label: "List Files",     icon: "Folder",   danger: false, testid: "action-mtp-list",    cost: "Free" },
  { key: "mtp_pull",      label: "Pull File",      icon: "Download", danger: false, testid: "action-mtp-pull",    cost: "Free" },
  { key: "mtp_info",      label: "Device Info",    icon: "Info",     danger: false, testid: "action-mtp-info",    cost: "Free" },
];
