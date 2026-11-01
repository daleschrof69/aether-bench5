import React from "react";
import { Link } from "react-router-dom";

export const Footer = () => {
  const year = new Date().getFullYear();
  return (
    <footer
      data-testid="app-footer"
      className="h-9 flex-shrink-0 bg-black border-t border-white/10 flex items-center justify-between px-4 font-mono text-[10px] tracking-[0.18em] uppercase text-white/40"
    >
      <div className="flex items-center gap-4">
        <span>© {year} Aether Labs</span>
        <span className="text-white/20">·</span>
        <span className="hidden md:inline">Authorized personal use only</span>
        <span className="text-white/20 hidden lg:inline">·</span>
        <a
          data-testid="footer-author-credit"
          href="https://github.com/braidenbarker"
          target="_blank"
          rel="noreferrer"
          className="hidden lg:inline hover:text-[#00FF41] transition-colors"
          title="Made by Braiden Barker"
        >
          Made by Braiden Barker
        </a>
      </div>
      <nav className="flex items-center gap-3">
        <Link data-testid="footer-docs" to="/docs" className="hover:text-[#00FF41] transition-colors normal-case tracking-wider">
          Docs
        </Link>
        <span className="text-white/20">·</span>
        <Link data-testid="footer-terms" to="/terms" className="hover:text-[#00FF41] transition-colors normal-case tracking-wider">
          Terms
        </Link>
        <span className="text-white/20">·</span>
        <Link data-testid="footer-privacy" to="/privacy" className="hover:text-[#00FF41] transition-colors normal-case tracking-wider">
          Privacy
        </Link>
      </nav>
    </footer>
  );
};
