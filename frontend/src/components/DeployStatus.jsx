import React, { useEffect, useState, useCallback } from "react";
import { Activity, GitCommit, Database, Clock } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const POLL_MS = 30_000;

/**
 * Live deployment status widget.
 * Polls /api/health (Mongo ping) and /api/version (build metadata) every 30s.
 * Shows a green/amber/red dot at a glance so founders can eyeball prod health
 * without leaving the Settings page.
 */
export default function DeployStatus() {
  const [health, setHealth] = useState(null);
  const [version, setVersion] = useState(null);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const [hRes, vRes] = await Promise.all([
        fetch(`${API}/health`, { credentials: "omit" }),
        fetch(`${API}/version`, { credentials: "omit" }),
      ]);
      const h = await hRes.json();
      const v = await vRes.json();
      setHealth({ ...h, http: hRes.status });
      setVersion(v);
    } catch (e) {
      setError(e.message || "Unreachable");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Overall state
  const state = error
    ? "down"
    : health?.status === "ok"
    ? "ok"
    : health?.status === "degraded"
    ? "degraded"
    : "unknown";

  const dot =
    state === "ok"
      ? "bg-[#00FF41] shadow-[0_0_8px_#00FF41]"
      : state === "degraded"
      ? "bg-yellow-400 shadow-[0_0_8px_#facc15]"
      : state === "down"
      ? "bg-red-500 shadow-[0_0_8px_#ef4444]"
      : "bg-white/30";

  const label =
    state === "ok"
      ? "Operational"
      : state === "degraded"
      ? "Degraded"
      : state === "down"
      ? "Unreachable"
      : "Checking…";

  const labelColor =
    state === "ok"
      ? "text-[#00FF41]"
      : state === "degraded"
      ? "text-yellow-300"
      : state === "down"
      ? "text-red-400"
      : "text-white/60";

  const fmtUptime = (s) => {
    if (!s && s !== 0) return "—";
    const days = Math.floor(s / 86400);
    const hrs = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    if (days > 0) return `${days}d ${hrs}h`;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <div data-testid="deploy-status" className="bg-[#09090B] border border-white/10 lg:col-span-2">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/50">
          Deployment Status
        </span>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          <span
            data-testid="deploy-status-label"
            className={`font-mono text-[10px] tracking-[0.2em] uppercase ${labelColor}`}
          >
            {label}
          </span>
          <button
            data-testid="deploy-status-refresh"
            onClick={refresh}
            disabled={checking}
            className="ml-2 h-6 px-2 border border-white/15 hover:border-[#00FF41]/40 hover:text-[#00FF41] font-mono text-[9px] tracking-[0.2em] uppercase text-white/60 transition-colors disabled:opacity-40"
          >
            {checking ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
        <StatCell
          icon={GitCommit}
          label="Build"
          value={
            version?.commit && version.commit !== "unknown"
              ? version.commit
              : version?.version || "—"
          }
          testid="deploy-status-commit"
          accent
        />
        <StatCell
          icon={Database}
          label="Database"
          value={health?.database || "—"}
          testid="deploy-status-db"
          tone={health?.database === "ok" ? "green" : health?.database ? "red" : "muted"}
        />
        <StatCell
          icon={Clock}
          label="Uptime"
          value={fmtUptime(health?.uptime_seconds)}
          testid="deploy-status-uptime"
        />
        <StatCell
          icon={Activity}
          label="API"
          value={error ? "offline" : health?.http ? `HTTP ${health.http}` : "…"}
          testid="deploy-status-api"
          tone={error ? "red" : health?.http === 200 ? "green" : "muted"}
        />

        {error && (
          <div className="col-span-2 md:col-span-4 text-red-300 leading-relaxed">
            {error}
          </div>
        )}
        <div className="col-span-2 md:col-span-4 text-white/40 text-[10px] leading-relaxed">
          Auto-refreshes every 30s · pings <span className="text-white/60">/api/health</span> and{" "}
          <span className="text-white/60">/api/version</span>. Point an uptime monitor at the same
          endpoints for out-of-app alerting.
        </div>
      </div>
    </div>
  );
}

const StatCell = ({ icon: Icon, label, value, testid, accent, tone }) => {
  const valueColor =
    tone === "green"
      ? "text-[#00FF41]"
      : tone === "red"
      ? "text-red-400"
      : tone === "muted"
      ? "text-white/50"
      : accent
      ? "text-[#00FF41]"
      : "text-white";
  return (
    <div>
      <div className="text-white/40 text-[10px] tracking-[0.2em] uppercase mb-1 flex items-center gap-1.5">
        <Icon className="w-3 h-3" strokeWidth={1.8} />
        {label}
      </div>
      <div data-testid={testid} className={valueColor}>
        {value}
      </div>
    </div>
  );
};
