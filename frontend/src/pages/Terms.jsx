import React from "react";
import { ScrollText } from "lucide-react";

export default function Terms() {
  return (
    <div data-testid="terms-page" className="h-full overflow-y-auto p-4">
      <div className="bg-[#09090B] border border-white/10 p-5 flex items-center gap-4 mb-4">
        <div className="w-12 h-12 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center">
          <ScrollText className="w-6 h-6 text-[#00FF41]" strokeWidth={1.8} />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Terms of Service</h1>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/40 mt-1">
            Effective 01 Feb 2026 · Aether Labs
          </p>
        </div>
      </div>

      <article className="max-w-3xl mx-auto bg-[#09090B] border border-white/10 p-6 md:p-8 space-y-5 text-sm text-white/75 leading-relaxed">
        <section>
          <h2 className="text-base font-semibold text-white mb-2">1. Acceptance</h2>
          <p>
            By creating an account, downloading the Aether CLI, or using any Aether Repair Tool service, you accept these Terms.
            If you do not agree, you may not use the service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">2. Eligible users</h2>
          <p>
            Aether is provided to licensed device technicians and authorized repair operators only. You agree to use Aether
            exclusively on devices you legally own or are authorized in writing to service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">3. Credits & licensing</h2>
          <ul className="list-disc list-inside space-y-1.5">
            <li>Credits and licenses are non-refundable except where required by law.</li>
            <li>The Founding Builder lifetime tier grants access for the operational life of Aether Repair Tool.</li>
            <li>Free Standard Aegis Unlock is included with every paid plan.</li>
            <li>Credits are non-transferable between accounts.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">4. Acceptable use</h2>
          <p>You must not use Aether to:</p>
          <ul className="list-disc list-inside space-y-1.5 mt-2">
            <li>Bypass security on devices you do not own or have written authorization to repair.</li>
            <li>Modify IMEI or modem partitions to evade carrier blacklists.</li>
            <li>Resell, redistribute, or reverse-engineer the Aether exploit databases.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">5. No warranty</h2>
          <p>
            Aether Repair Tool is provided &ldquo;as is&rdquo;. Operations on connected devices may permanently modify or erase data.
            Aether Labs is not liable for hardware damage, data loss, or downstream business impact.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">6. Termination</h2>
          <p>
            We may suspend any account that engages in unauthorized access attempts, payment fraud, or abuse of our infrastructure.
            Founding Builder lifetime licenses surviving such suspension are forfeit without refund.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">7. Contact</h2>
          <p>
            Questions about these Terms: <span className="text-[#00FF41]">legal@aether.dev</span>.
          </p>
        </section>
      </article>
    </div>
  );
}
