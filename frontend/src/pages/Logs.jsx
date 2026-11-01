import React, { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { Download, Filter, Search, ScrollText } from "lucide-react";

const LEVELS = ["ALL", "INFO", "SUCCESS", "WARN", "ERROR"];
const LEVEL_COLORS = {
  INFO: "text-cyan-400 border-cyan-400/30",
  SUCCESS: "text-[#00FF41] border-[#00FF41]/30",
  WARN: "text-yellow-400 border-yellow-400/30",
  ERROR: "text-red-400 border-red-400/30",
};

export default function Logs() {
  const { logs, clearLogs } = useApp();
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (filter !== "ALL" && l.level !== filter) return false;
      if (query && !l.text.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [logs, filter, query]);

  const exportLogs = () => {
    const text = logs.map((l) => `[${l.ts}] [${l.level}] ${l.text}`).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aether-session-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div data-testid="logs-page" className="h-full flex flex-col gap-3 p-4 overflow-y-auto">
      <div className="bg-[#09090B] border border-white/10 p-5 flex items-center gap-4 flex-shrink-0">
        <div className="w-12 h-12 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center">
          <ScrollText className="w-6 h-6 text-[#00FF41]" strokeWidth={1.8} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Session Logs</h1>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/40 mt-1">
            {filtered.length} of {logs.length} entries · audit-ready
          </p>
        </div>
        <button
          data-testid="logs-export"
          onClick={exportLogs}
          className="h-9 px-4 border border-[#00FF41]/30 hover:bg-[#00FF41]/10 text-[#00FF41] font-mono text-[11px] tracking-[0.2em] uppercase flex items-center gap-2 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export .log
        </button>
        <button
          data-testid="logs-clear"
          onClick={clearLogs}
          className="h-9 px-4 border border-red-500/30 hover:bg-red-500/10 text-red-400 font-mono text-[11px] tracking-[0.2em] uppercase transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-[#09090B] border border-white/10 p-3 flex flex-wrap items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="w-3.5 h-3.5 text-white/40" />
          <input
            data-testid="logs-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="grep logs..."
            className="flex-1 bg-transparent border-0 outline-none font-mono text-xs text-white placeholder:text-white/30"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter className="w-3.5 h-3.5 text-white/40 mr-1" />
          {LEVELS.map((lvl) => (
            <button
              key={lvl}
              data-testid={`logs-filter-${lvl.toLowerCase()}`}
              onClick={() => setFilter(lvl)}
              className={`h-7 px-3 font-mono text-[10px] tracking-[0.2em] uppercase border transition-colors ${
                filter === lvl
                  ? "bg-[#00FF41]/10 text-[#00FF41] border-[#00FF41]/40"
                  : "text-white/50 border-white/10 hover:border-white/30"
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 bg-[#050505] border border-white/10 overflow-hidden flex flex-col">
        <div className="grid grid-cols-[110px_110px_1fr] gap-3 px-4 py-2 border-b border-white/10 bg-black/40 font-mono text-[9px] tracking-[0.25em] uppercase text-white/40 flex-shrink-0">
          <div>Timestamp</div>
          <div>Level</div>
          <div>Message</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-10 text-center font-mono text-xs text-white/30">
              No log entries match the current filter.
            </div>
          ) : (
            filtered.map((log) => (
              <div
                key={log.id}
                className="grid grid-cols-[110px_110px_1fr] gap-3 px-4 py-1.5 border-b border-white/5 font-mono text-[12px] hover:bg-white/[0.02]"
              >
                <div className="text-white/40">[{log.ts}]</div>
                <div>
                  <span className={`px-2 py-0.5 border text-[10px] tracking-[0.18em] uppercase ${LEVEL_COLORS[log.level]}`}>
                    {log.level}
                  </span>
                </div>
                <div className="text-white/85 break-all">{log.text}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
