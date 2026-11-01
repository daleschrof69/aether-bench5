import React from "react";
import { Shield } from "lucide-react";

export default function Privacy() {
  return (
    <div data-testid="privacy-page" className="h-full overflow-y-auto p-4">
      <div className="bg-[#09090B] border border-white/10 p-5 flex items-center gap-4 mb-4">
        <div className="w-12 h-12 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center">
          <Shield className="w-6 h-6 text-[#00FF41]" strokeWidth={1.8} />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/40 mt-1">
            Effective 01 Feb 2026 · Aether Labs
          </p>
        </div>
      </div>

      <article className="max-w-3xl mx-auto bg-[#09090B] border border-white/10 p-6 md:p-8 space-y-5 text-sm text-white/75 leading-relaxed">
        <section>
          <h2 className="text-base font-semibold text-white mb-2">1. Data we collect</h2>
          <ul className="list-disc list-inside space-y-1.5">
            <li>Account: email, hashed password, optional name and avatar (Google OAuth).</li>
            <li>Billing: Stripe customer ID, transaction history. Card data is held by Stripe, not Aether.</li>
            <li>Operational telemetry: anonymized chipset detections, exploit success rates — used to improve the CVE feed.</li>
            <li>No collection of customer device data (IMEI, serial, file system) is sent to Aether servers.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">2. How we use data</h2>
          <ul className="list-disc list-inside space-y-1.5">
            <li>Authenticate and authorize your sessions.</li>
            <li>Process payments and grant credits / licenses.</li>
            <li>Send service-critical email (account, payment receipts).</li>
            <li>Improve the exploit database and live CVE intel feed.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">3. Sharing</h2>
          <p>
            We share data only with sub-processors required to operate the service: Stripe (payments), Resend (email), and
            our cloud provider. We never sell personal data.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">4. Retention</h2>
          <ul className="list-disc list-inside space-y-1.5">
            <li>Account records: while your account is active + 24 months after deletion (for audit / chargeback windows).</li>
            <li>Payment transactions: 7 years (legal requirement).</li>
            <li>Session tokens: 7 days after issue, auto-expired.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">5. Your rights</h2>
          <p>
            You may request export or deletion of your personal data at any time by writing to{" "}
            <span className="text-[#00FF41]">privacy@aether.dev</span>. We respond within 30 days.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">6. Cookies</h2>
          <p>
            Aether uses httpOnly authentication cookies only. No analytics, no marketing trackers.
          </p>
        </section>
      </article>
    </div>
  );
}
