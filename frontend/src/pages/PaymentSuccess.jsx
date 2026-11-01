import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { CheckCircle2, Loader2, XCircle, ArrowRight } from "lucide-react";

const POLL_MAX = 8;
const POLL_INTERVAL = 2000;

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const navigate = useNavigate();
  const { http, syncProfile } = useAuth();
  const [status, setStatus] = useState("polling"); // polling | paid | failed | expired
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus("failed");
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const { data } = await http.get(`/stripe/status/${sessionId}`);
        setResult(data);
        if (data.payment_status === "paid") {
          setStatus("paid");
          await syncProfile();
          return;
        }
        if (data.status === "expired") {
          setStatus("expired");
          return;
        }
        if (attempts >= POLL_MAX) {
          setStatus("failed");
          return;
        }
        setTimeout(poll, POLL_INTERVAL);
      } catch {
        if (attempts >= POLL_MAX) setStatus("failed");
        else setTimeout(poll, POLL_INTERVAL);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [sessionId, http, syncProfile]);

  return (
    <div className="min-h-screen w-screen bg-black flex items-center justify-center p-4">
      <div className="bg-[#09090B] border border-white/10 max-w-md w-full p-8 text-center">
        {status === "polling" && (
          <>
            <Loader2 className="w-12 h-12 text-[#00FF41] animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold tracking-tight">Confirming payment ...</h1>
            <p className="font-mono text-xs text-white/40 mt-2">
              Polling Stripe — usually 1–4 seconds.
            </p>
          </>
        )}
        {status === "paid" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-[#00FF41] mx-auto mb-4" />
            <h1 className="text-xl font-bold tracking-tight">Payment confirmed</h1>
            <p className="font-mono text-xs text-white/60 mt-2">
              {result?.amount_total ? `$${(result.amount_total / 100).toFixed(2)} ${result.currency?.toUpperCase()}` : "Purchase fulfilled"} · your account has been credited.
            </p>
            {result?.user && (
              <div className="mt-5 font-mono text-xs grid grid-cols-2 gap-2 text-left bg-black/40 border border-white/10 p-3">
                <span className="text-white/40">Plan</span>
                <span className="text-[#00FF41]">{result.user.plan}</span>
                <span className="text-white/40">Credits</span>
                <span className="text-white">{result.user.credits}</span>
              </div>
            )}
            <button
              data-testid="payment-success-continue"
              onClick={() => navigate("/", { replace: true })}
              className="mt-6 w-full h-11 bg-[#00FF41] hover:bg-[#00CC33] text-black font-mono text-xs tracking-[0.22em] uppercase font-bold transition-colors flex items-center justify-center gap-2"
            >
              Back to Dashboard <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        {(status === "failed" || status === "expired") && (
          <>
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold tracking-tight">
              {status === "expired" ? "Session expired" : "Could not confirm payment"}
            </h1>
            <p className="font-mono text-xs text-white/50 mt-2">
              {status === "expired"
                ? "The Stripe session timed out. You can try again."
                : "If you were charged, the credits will sync shortly. Refresh the dashboard."}
            </p>
            <Link
              to="/pricing"
              className="mt-6 inline-block h-11 px-5 border border-white/15 hover:border-[#00FF41]/40 hover:bg-[#00FF41]/5 text-white font-mono text-xs tracking-[0.22em] uppercase transition-colors leading-[44px]"
            >
              Try again
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
