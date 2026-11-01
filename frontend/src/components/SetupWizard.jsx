import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { useApp } from "../context/AppContext";
import { CLI_RELEASES_BASE, CLI_VERSION } from "../lib/releases";
import {
  Terminal,
  Cpu,
  Smartphone,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Download,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Wrench,
  ExternalLink,
} from "lucide-react";

const detectOS = () => {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent || "";
  if (/Win/i.test(ua)) return "windows";
  if (/Mac/i.test(ua)) return "macos";
  return "linux";
};

const OS_LABELS = { windows: "Windows", macos: "macOS", linux: "Linux" };

const computeDepState = (connected, value) => {
  if (!connected) return "unknown";
  return value ? "ok" : "missing";
};

const computeCliVersionLabel = (connected, cliVersion) => {
  if (!connected) return undefined;
  return cliVersion ? `v${cliVersion}` : "LIVE";
};

const overallStatusCls = (allReady, connected) => {
  if (allReady) return "text-[#00FF41] border-[#00FF41]/40 bg-[#00FF41]/5";
  if (connected) return "text-yellow-400 border-yellow-400/40 bg-yellow-400/5";
  return "text-white/50 border-white/15";
};

const overallStatusLabel = (allReady, connected) => {
  if (allReady) return "All set";
  if (connected) return "Action needed";
  return "CLI offline";
};

// OS-specific install commands per dependency.
const CMDS = {
  cli: {
    windows: "aether-cli.exe serve",
    macos: "aether-cli serve",
    linux: "aether-cli serve",
  },
  mtkclient: {
    windows: "py -m pip install --user --upgrade mtkclient",
    macos: "pip3 install --user --upgrade mtkclient",
    linux: "pip3 install --user --upgrade mtkclient",
  },
  heimdall: {
    windows: "https://glassechidna.com.au/heimdall/",
    macos: "brew install heimdall",
    linux: "sudo apt install heimdall-flash",
  },
  edl: {
    windows: "py -m pip install --user --upgrade edlclient",
    macos: "pip3 install --user --upgrade edlclient",
    linux: "pip3 install --user --upgrade edlclient",
  },
  apple: {
    windows: "https://github.com/libimobiledevice-win32/imobiledevice-net/releases/download/v1.3.17/libimobiledevice.1.2.1-r1122-win-x64.zip",
    macos: "brew install libimobiledevice",
    linux: "sudo apt install libimobiledevice-utils libirecovery-utils",
  },
};

const CopyButton = ({ text, testid }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.debug("[SetupWizard] clipboard blocked:", e);
    }
  };
  return (
    <button
      data-testid={testid}
      onClick={copy}
      className="text-white/50 hover:text-[#00FF41] flex-shrink-0 transition-colors"
      title="Copy command"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-[#00FF41]" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

const StatusPill = ({ state, version }) => {
  const map = {
    ok: { cls: "text-[#00FF41] border-[#00FF41]/40 bg-[#00FF41]/5", icon: CheckCircle2, label: version ? version : "READY" },
    missing: { cls: "text-red-400 border-red-500/40 bg-red-500/5", icon: XCircle, label: "NOT FOUND" },
    unknown: { cls: "text-yellow-400 border-yellow-400/40 bg-yellow-400/5", icon: HelpCircle, label: "UNKNOWN" },
  }[state];
  const Icon = map.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 border font-mono text-[10px] tracking-[0.15em] uppercase ${map.cls}`}>
      <Icon className="w-3 h-3" strokeWidth={2.2} />
      {map.label}
    </span>
  );
};

const CommandRow = ({ cmd, isUrl, testid }) => (
  <div className="bg-black border border-white/10 px-3 py-2 flex items-center justify-between gap-2">
    <code className="font-mono text-[11px] text-[#00FF41] truncate">{cmd}</code>
    {isUrl ? (
      <a
        href={cmd}
        target="_blank"
        rel="noreferrer"
        className="text-white/50 hover:text-[#00FF41] flex-shrink-0"
        title="Open link"
        data-testid={testid}
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    ) : (
      <CopyButton text={cmd} testid={testid} />
    )}
  </div>
);

// A single dependency row (CLI / mtkclient / Heimdall) with status pill,
// OS-specific install command and any per-dependency action.
const DependencyCard = ({ d, os, connected, installing, onAutoInstall }) => {
  const Icon = d.icon;
  const cmd = CMDS[d.key][os];
  const isUrl = cmd.startsWith("http");
  const showInstall = d.state !== "ok";
  return (
    <div data-testid={`setup-dep-${d.key}`} className="border border-white/10 bg-[#09090B]">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 border border-white/10 flex items-center justify-center text-white/70 flex-shrink-0">
          <Icon className="w-4 h-4" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white flex items-center gap-2">
            {d.name}
            {d.required && (
              <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-white/30">required</span>
            )}
          </div>
          <div className="font-mono text-[10px] text-white/40 mt-0.5 truncate">{d.subtitle}</div>
        </div>
        <StatusPill state={d.state} version={d.version} />
      </div>

      {showInstall && (
        <div className="px-4 pb-4 pt-1 space-y-2 border-t border-white/5">
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/40 pt-2">
            {d.key === "cli"
              ? "Start the bridge"
              : `Install on ${OS_LABELS[os]}${isUrl ? " (download + Zadig driver)" : ""}`}
          </div>
          <CommandRow cmd={cmd} isUrl={isUrl} testid={`setup-copy-${d.key}`} />
          {d.note && <div className="font-mono text-[10px] text-white/40">{d.note}</div>}

          {d.key === "cli" && !connected && (
            <a
              href={`${CLI_RELEASES_BASE}/aether-cli-${CLI_VERSION}-x86_64-pc-windows-msvc.zip`}
              target="_blank"
              rel="noreferrer"
              data-testid="setup-download-cli"
              className="inline-flex items-center gap-2 h-8 px-3 border border-[#00FF41]/40 hover:bg-[#00FF41]/10 text-[#00FF41] font-mono text-[10px] tracking-[0.2em] uppercase transition-colors"
            >
              <Download className="w-3 h-3" />
              Download Aether CLI
            </a>
          )}
          {(d.key === "mtkclient" || d.key === "edl") && connected && d.state === "missing" && (
            <button
              data-testid={`setup-autoinstall-${d.key}`}
              onClick={() => onAutoInstall(d.key)}
              disabled={installing}
              className="inline-flex items-center gap-2 h-8 px-3 bg-[#00FF41] hover:bg-[#00CC33] text-black font-mono text-[10px] tracking-[0.2em] uppercase font-bold transition-colors disabled:opacity-50"
            >
              {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              {installing ? "Installing…" : "Auto-install via CLI"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const SetupWizard = () => {
  const { setupOpen, setSetupOpen, cliBridge, pushLog } = useApp();
  const [os, setOs] = useState(detectOS);
  const [live, setLive] = useState(null); // setup.doctor result
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  const bridge = cliBridge || {};
  const connected = bridge.status === "connected";
  const info = live || bridge.info || {};
  const cliVersion = bridge.info?.version;

  const deps = useMemo(
    () => [
      {
        key: "cli",
        icon: Terminal,
        name: "Aether CLI bridge",
        subtitle: "Rust binary · connects the dashboard to real USB hardware",
        state: connected ? "ok" : "missing",
        version: computeCliVersionLabel(connected, cliVersion),
        required: true,
      },
      {
        key: "mtkclient",
        icon: Cpu,
        name: "mtkclient (MediaTek)",
        subtitle: "Python BROM/DA exploit suite · powers MTK operations",
        state: computeDepState(connected, info.mtkclient),
        version: info.mtkclient || undefined,
        note: info.python ? `Python detected: ${info.python}` : "Requires Python 3.8+",
      },
      {
        key: "heimdall",
        icon: Smartphone,
        name: "Heimdall (Samsung)",
        subtitle: "Odin/Loke protocol tool · powers Samsung operations",
        state: computeDepState(connected, info.heimdall),
        version: info.heimdall || undefined,
      },
      {
        key: "edl",
        icon: Cpu,
        name: "edlclient (Qualcomm)",
        subtitle: "Sahara/Firehose client · powers Qualcomm EDL operations",
        state: computeDepState(connected, info.edl),
        version: info.edl || undefined,
      },
      {
        key: "apple",
        icon: Smartphone,
        name: "checkm8 tools (iPhone)",
        subtitle: "irecovery + gaster · powers Apple DFU / pwned-DFU (A5–A11)",
        state: computeDepState(connected, info.apple),
        version: info.apple || undefined,
      },
    ],
    [connected, cliVersion, info.mtkclient, info.heimdall, info.edl, info.apple, info.python]
  );

  const allReady = connected && info.mtkclient && info.heimdall;

  const recheck = async () => {
    if (!connected) {
      pushLog("WARN", "Setup: start the Aether CLI first (run `aether-cli serve`).");
      return;
    }
    setChecking(true);
    try {
      const res = await bridge.call("setup.doctor", {});
      if (res && !res.error) {
        setLive(res);
        pushLog("SUCCESS", "Setup: environment re-checked.");
      } else {
        pushLog("WARN", "Setup: this CLI build has no `setup.doctor` — update the CLI.");
      }
    } catch (e) {
      pushLog("ERROR", `Setup: re-check failed — ${e?.message || e}`);
    } finally {
      setChecking(false);
    }
  };

  const autoInstallMtk = async () => {
    if (!connected || installing) return;
    setInstalling(true);
    pushLog("INFO", ">>> Setup: installing mtkclient via pip ...");
    try {
      await bridge.runJob("setup.install_mtkclient", {}, (ev) => {
        if (ev.line) pushLog(ev.stream === "stderr" ? "WARN" : "INFO", ev.line);
      });
      pushLog("SUCCESS", "Setup: mtkclient install finished. Re-checking ...");
      await recheck();
    } catch (e) {
      pushLog("ERROR", `Setup: mtkclient install failed — ${e?.message || e}`);
    } finally {
      setInstalling(false);
    }
  };

  const autoInstallEdl = async () => {
    if (!connected || installing) return;
    setInstalling(true);
    pushLog("INFO", ">>> Setup: installing edlclient via pip ...");
    try {
      await bridge.runJob("setup.install_edl", {}, (ev) => {
        if (ev.line) pushLog(ev.stream === "stderr" ? "WARN" : "INFO", ev.line);
      });
      pushLog("SUCCESS", "Setup: edlclient install finished. Re-checking ...");
      await recheck();
    } catch (e) {
      pushLog("ERROR", `Setup: edlclient install failed — ${e?.message || e}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleAutoInstall = (key) => {
    if (key === "edl") return autoInstallEdl();
    return autoInstallMtk();
  };

  // Proactively surface the wizard the first time a live CLI reports a
  // missing dependency (real desktop/CLI scenario). Never fires in the
  // pure web demo because the bridge stays disconnected there.
  useEffect(() => {
    if (connected && bridge.info && (!bridge.info.mtkclient || !bridge.info.heimdall)) {
      try {
        if (localStorage.getItem("aether.setup.autoshown") !== "1") {
          setSetupOpen(true);
          localStorage.setItem("aether.setup.autoshown", "1");
        }
      } catch (e) {
        console.debug("[setup-wizard] autoshow flag unavailable:", e);
      }
    }
  }, [connected, bridge.info, setSetupOpen]);

  return (
    <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
      <DialogContent
        data-testid="setup-wizard"
        className="max-w-2xl bg-[#0A0A0D] border border-[#00FF41]/25 text-white p-0 gap-0 shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center gap-4">
          <div className="w-11 h-11 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center flex-shrink-0">
            <Wrench className="w-5 h-5 text-[#00FF41]" strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-lg font-bold tracking-tight text-white">Environment Setup Wizard</DialogTitle>
            <DialogDescription className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/40 mt-1">
              Get your machine ready for real device repair
            </DialogDescription>
          </div>
          <span
            data-testid="setup-overall-status"
            className={`font-mono text-[10px] tracking-[0.18em] uppercase px-2.5 py-1 border ${overallStatusCls(allReady, connected)}`}
          >
            {overallStatusLabel(allReady, connected)}
          </span>
        </div>

        {/* Bridge-offline hint */}
        {!connected && (
          <div
            data-testid="setup-cli-offline-hint"
            className="mx-6 mt-4 bg-yellow-400/5 border border-yellow-400/30 px-4 py-3 font-mono text-[11px] text-yellow-200/80 leading-relaxed"
          >
            The Aether CLI bridge isn&apos;t running, so dependency versions can&apos;t be auto-detected.
            Install the CLI, run <code className="bg-black/50 px-1 text-[#00FF41]">aether-cli serve</code>,
            then reload the dashboard. Manual install commands for each tool are shown below.
          </div>
        )}

        {/* OS switcher */}
        <div className="px-6 pt-4 flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/40 mr-1">Platform</span>
          {Object.keys(OS_LABELS).map((k) => (
            <button
              key={k}
              data-testid={`setup-os-${k}`}
              onClick={() => setOs(k)}
              className={`h-7 px-3 font-mono text-[10px] tracking-[0.18em] uppercase border transition-colors ${
                os === k
                  ? "border-[#00FF41]/50 bg-[#00FF41]/10 text-[#00FF41]"
                  : "border-white/10 text-white/50 hover:text-white hover:border-white/25"
              }`}
            >
              {OS_LABELS[k]}
            </button>
          ))}
        </div>

        {/* Dependency cards */}
        <div className="px-6 py-4 space-y-3 max-h-[46vh] overflow-y-auto">
          {deps.map((d) => (
            <DependencyCard
              key={d.key}
              d={d}
              os={os}
              connected={connected}
              installing={installing}
              onAutoInstall={handleAutoInstall}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between gap-3">
          <button
            data-testid="setup-wizard-recheck"
            onClick={recheck}
            disabled={checking || !connected}
            className="inline-flex items-center gap-2 h-9 px-4 border border-white/15 hover:border-[#00FF41]/40 hover:text-[#00FF41] text-white/70 font-mono text-[10px] tracking-[0.2em] uppercase transition-colors disabled:opacity-40"
            title={connected ? "Re-run detection via the CLI" : "Start the CLI to enable detection"}
          >
            {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Re-check
          </button>
          <button
            data-testid="setup-wizard-done"
            onClick={() => setSetupOpen(false)}
            className="h-9 px-5 bg-[#00FF41] hover:bg-[#00CC33] text-black font-mono text-[10px] tracking-[0.22em] uppercase font-bold transition-colors"
          >
            {allReady ? "Done" : "Close"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
