import React, { useState } from "react";
import { Check, Copy, Heart } from "lucide-react";

const RECIPIENT = "katiespellman4@gmail.com";

export default function Donate() {
  const [message, setMessage] = useState("");

  const copyRecipient = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(RECIPIENT);
      setMessage("Email address copied.");
    } catch {
      setMessage("Select the email address above to copy it.");
    }
  };

  return (
    <div data-testid="donate-page" className="h-full overflow-y-auto p-4">
      <div className="max-w-2xl bg-[#09090B] border border-white/10 p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center flex-shrink-0">
            <Heart className="w-6 h-6 text-[#00FF41]" strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Support Aether</h1>
            <p className="text-sm text-white/60 mt-1">Send an optional donation by Interac e-Transfer.</p>
          </div>
        </div>

        <div className="border border-[#00FF41]/30 bg-[#00FF41]/5 p-4 space-y-3">
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/50">Send to</div>
          <div className="flex flex-wrap items-center gap-3">
            <span data-testid="donation-recipient" className="font-mono text-sm text-white break-all select-all">{RECIPIENT}</span>
            <button
              type="button"
              onClick={copyRecipient}
              className="inline-flex items-center gap-2 border border-[#00FF41]/40 px-3 h-9 text-[#00FF41] text-xs hover:bg-[#00FF41]/10"
            >
              {message === "Email address copied." ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              Copy email
            </button>
          </div>
          <p role="status" aria-live="polite" className="text-xs text-white/60">{message}</p>
        </div>

        <ol className="list-decimal pl-5 space-y-2 text-sm text-white/70">
          <li>Open your bank's app or website and select Interac e-Transfer.</li>
          <li>Enter the email address above and the amount you would like to donate.</li>
          <li>Follow your bank's instructions to complete the transfer.</li>
        </ol>
        <p className="text-xs text-white/50">Transfers are completed through your bank. Aether does not process or track donations.</p>
      </div>
    </div>
  );
}
