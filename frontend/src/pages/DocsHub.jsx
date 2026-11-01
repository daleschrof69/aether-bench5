import React from "react";
import { Link } from "react-router-dom";
import { DOCS } from "../content/docs/index";
import { BookOpen, ArrowRight, Clock, Coins } from "lucide-react";

const PLATFORM_COLOR = {
  Samsung: "border-blue-400/40 text-blue-300 bg-blue-400/5",
  MediaTek: "border-orange-400/40 text-orange-300 bg-orange-400/5",
  Qualcomm: "border-red-400/40 text-red-300 bg-red-400/5",
};

export default function DocsHub() {
  return (
    <div data-testid="docs-hub-page" className="h-full overflow-y-auto p-4 space-y-4">
      <div className="bg-[#09090B] border border-white/10 p-5 flex items-center gap-4 relative overflow-hidden">
        <div className="w-12 h-12 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-6 h-6 text-[#00FF41]" strokeWidth={1.8} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Aether Academy</h1>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/40 mt-1">
            Operator-grade documentation · {DOCS.length} guides
          </p>
        </div>
        <div className="font-mono text-[10px] text-white/40 hidden md:block">
          Updated weekly · curated by Aether Labs
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {DOCS.map((d) => (
          <Link
            key={d.slug}
            to={`/docs/${d.slug}`}
            data-testid={`docs-card-${d.slug}`}
            className="group bg-[#09090B] border border-white/10 hover:border-[#00FF41]/40 p-5 flex flex-col gap-3 transition-colors min-h-[200px]"
          >
            <div className="flex items-center justify-between">
              <span className={`font-mono text-[9px] tracking-[0.25em] uppercase px-1.5 py-0.5 border ${PLATFORM_COLOR[d.platform]}`}>
                {d.platform}
              </span>
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/40 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {d.minutes} min
              </span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white group-hover:text-[#00FF41] transition-colors">
                {d.title}
              </h2>
              <p className="font-mono text-[11px] text-white/50 mt-1.5 leading-snug">{d.summary}</p>
            </div>
            <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between font-mono text-[10px] tracking-[0.18em] uppercase">
              <span className="flex items-center gap-1 text-[#00FF41]">
                <Coins className="w-3 h-3" />
                {d.cost}
              </span>
              <span className="text-white/40 group-hover:text-[#00FF41] flex items-center gap-1">
                Read <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
