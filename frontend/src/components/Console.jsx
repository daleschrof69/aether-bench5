import React, { useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { Terminal, Trash2, Pause, Play, PlayCircle } from "lucide-react";

const LEVEL_COLORS = {
  INFO: "text-cyan-400",
  SUCCESS: "text-[#00FF41]",
  WARN: "text-yellow-400",
  ERROR: "text-red-400",
};

const LEVEL_BG = {
  INFO: "bg-cyan-400",
  SUCCESS: "bg-[#00FF41]",
  WARN: "bg-yellow-400",
  ERROR: "bg-red-400",
};

export const Console = ({ height = "h-64", limit }) => {
  const { logs, clearLogs, startSearch, status } = useApp();
  const scrollRef = useRef(null);
  const [paused, setPaused] = React.useState(false);

  const visible = limit ? logs.slice(-limit) : logs;
  const isEmpty = visible.length === 0;

  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, paused]);

  return (
    <div
      data-testid="console-panel"
      className={`relative flex flex-col bg-[#050505] border border-white/10 ${height} overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black/40 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-[#00FF41]" strokeWidth={2} />
          <span className="font-mono text-[10px] tracking-[0.25em] text-white/70 uppercase">
            Console — /dev/aether0
          </span>
          <span className="font-mono text-[10px] text-white/30">
            {logs.length} lines
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            data-testid="console-pause"
            onClick={() => setPaused((p) => !p)}
            className="w-7 h-7 flex items-center justify-center text-white/50 hover:text-[#00FF41] hover:bg-white/5 transition-colors"
            title={paused ? "Resume autoscroll" : "Pause autoscroll"}
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>
          <button
            data-testid="console-clear"
            onClick={clearLogs}
            className="w-7 h-7 flex items-center justify-center text-white/50 hover:text-red-400 hover:bg-white/5 transition-colors"
            title="Clear console"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        ref={scrollRef}
        data-testid="console-output"
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-[1.55] terminal-scan relative"
      >
        {isEmpty && (
          <div
            data-testid="console-empty-state"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6"
          >
            <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-white/30">
              Console is quiet — awaiting operations
            </div>
            <button
              data-testid="console-empty-cta"
              onClick={() => startSearch()}
              disabled={status === "searching" || status === "working"}
              className="h-9 px-4 border border-[#00FF41]/40 bg-[#00FF41]/5 hover:bg-[#00FF41]/15 text-[#00FF41] font-mono text-[10px] tracking-[0.22em] uppercase transition-colors flex items-center gap-2 disabled:opacity-40"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              Run demo scan · free
            </button>
            <div className="font-mono text-[9px] tracking-[0.22em] uppercase text-white/25 max-w-xs leading-relaxed">
              First time here? A scan streams live logs so you can see how the app talks to real hardware.
            </div>
          </div>
        )}
        {visible.map((log) => (
          <div key={log.id} className="flex gap-3 group hover:bg-white/[0.02]">
            <span className="text-white/30 select-none">[{log.ts}]</span>
            <span className={`flex items-center gap-1 ${LEVEL_COLORS[log.level]} w-20 flex-shrink-0`}>
              <span className={`inline-block w-1 h-1 ${LEVEL_BG[log.level]}`} />
              {log.level}
            </span>
            <span className="text-white/85 break-all">{log.text}</span>
          </div>
        ))}
        {!isEmpty && (
          <div className="flex items-center text-[#00FF41]">
            <span className="select-none">aether@target:~$ </span>
            <span className="ml-1 inline-block w-2 h-3.5 bg-[#00FF41] animate-blink" />
          </div>
        )}
      </div>
    </div>
  );
};
