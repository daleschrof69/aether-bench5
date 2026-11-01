import React from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DOCS } from "../content/docs/index";
import { ArrowLeft, Clock, Coins } from "lucide-react";

// Hoisted to module scope so ReactMarkdown receives a stable reference and
// doesn't re-initialise the markdown processor on every render.
const REMARK_PLUGINS = [remarkGfm];

const PLATFORM_COLOR = {
  Samsung: "border-blue-400/40 text-blue-300 bg-blue-400/5",
  MediaTek: "border-orange-400/40 text-orange-300 bg-orange-400/5",
  Qualcomm: "border-red-400/40 text-red-300 bg-red-400/5",
};

export default function DocArticle() {
  const { slug } = useParams();
  const doc = DOCS.find((d) => d.slug === slug);

  if (!doc) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-2xl font-bold text-white">Guide not found</div>
          <Link to="/docs" className="font-mono text-xs text-[#00FF41] mt-3 inline-block hover:underline">
            ← Back to docs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div data-testid={`doc-article-${doc.slug}`} className="h-full overflow-y-auto">
      <article className="max-w-3xl mx-auto p-6 md:p-10">
        <Link
          to="/docs"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.22em] uppercase text-white/50 hover:text-[#00FF41] mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Aether Academy
        </Link>

        <div className="flex items-center gap-3 mb-3">
          <span className={`font-mono text-[10px] tracking-[0.25em] uppercase px-1.5 py-0.5 border ${PLATFORM_COLOR[doc.platform]}`}>
            {doc.platform}
          </span>
          <span className="flex items-center gap-1 font-mono text-[10px] tracking-[0.2em] uppercase text-white/40">
            <Clock className="w-3 h-3" />
            {doc.minutes} min read
          </span>
          <span className="flex items-center gap-1 font-mono text-[10px] tracking-[0.2em] uppercase text-[#00FF41]">
            <Coins className="w-3 h-3" />
            {doc.cost}
          </span>
        </div>

        <div className="prose prose-invert max-w-none aether-markdown">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{doc.body}</ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
