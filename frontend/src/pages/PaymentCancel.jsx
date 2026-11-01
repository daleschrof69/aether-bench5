import React from "react";
import { Link } from "react-router-dom";
import { XCircle, ArrowLeft } from "lucide-react";

export default function PaymentCancel() {
  return (
    <div className="min-h-screen w-screen bg-black flex items-center justify-center p-4">
      <div className="bg-[#09090B] border border-white/10 max-w-md w-full p-8 text-center">
        <XCircle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold tracking-tight">Checkout cancelled</h1>
        <p className="font-mono text-xs text-white/50 mt-2">
          No charge was made. You can return to pricing whenever you&apos;re ready.
        </p>
        <Link
          to="/pricing"
          data-testid="payment-cancel-back"
          className="mt-6 inline-flex items-center gap-2 h-11 px-5 bg-[#00FF41] hover:bg-[#00CC33] text-black font-mono text-xs tracking-[0.22em] uppercase font-bold transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to pricing
        </Link>
      </div>
    </div>
  );
}
