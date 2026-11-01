import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth, formatApiError } from "../context/AuthContext";
import { Mail, Lock, ArrowRight, AlertCircle, Loader2 } from "lucide-react";

const LOGO_URL =
  "https://static.prod-images.emergentagent.com/jobs/540cc9df-c50a-4a07-a460-6c88ca22b1a7/images/2d4119f8e681e91c440e01928176b55e52818652e44fd72f5f424ba935136d9c.png";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
const startGoogleAuth = () => {
  const redirectUrl = window.location.origin + "/auth/callback";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const from = location.state?.from?.pathname || "/";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await loginEmail(email.trim(), password);
      navigate(from, { replace: true });
    } catch (e2) {
      setErr(formatApiError(e2.response?.data?.detail) || e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-black flex flex-col">
      <div className="absolute inset-0 bg-grid opacity-40 pointer-events-none" />
      <div className="absolute inset-0 bg-noise opacity-30 pointer-events-none" />

      <main className="relative flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-3 mb-8 justify-center">
            <div className="w-12 h-12 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center">
              <img src={LOGO_URL} alt="Aether" className="w-9 h-9 object-contain" />
            </div>
            <div className="leading-none">
              <div className="text-white font-semibold tracking-wide">AETHER</div>
              <div className="text-[10px] text-[#00FF41] font-mono tracking-[0.3em] mt-1">REPAIR.SUITE</div>
            </div>
          </Link>

          <div className="bg-[#09090B] border border-white/10 p-8">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
              <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/40 mt-1.5">
                Access your repair console
              </p>
            </div>

            <button
              data-testid="login-google-btn"
              onClick={startGoogleAuth}
              className="w-full h-11 border border-white/15 hover:border-[#00FF41]/40 hover:bg-[#00FF41]/5 text-white font-medium text-sm flex items-center justify-center gap-3 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4c-7.7 0-14.4 4.3-17.7 10.1z" />
                <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2 14-5.4l-6.5-5.5C29.6 34.6 26.9 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.7 16.3 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4 5.8l6.5 5.5c-.5.4 7-5.1 7-15.3 0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continue with Google
            </button>

            <div className="my-5 flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/50">Email</label>
                <div className="mt-1.5 flex items-center bg-black border border-white/10 focus-within:border-[#00FF41]/50 transition-colors">
                  <Mail className="w-4 h-4 text-white/30 ml-3" />
                  <input
                    data-testid="login-email-input"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-white px-3 h-11 outline-none placeholder:text-white/30"
                    placeholder="you@workshop.dev"
                  />
                </div>
              </div>
              <div>
                <label className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/50">Password</label>
                <div className="mt-1.5 flex items-center bg-black border border-white/10 focus-within:border-[#00FF41]/50 transition-colors">
                  <Lock className="w-4 h-4 text-white/30 ml-3" />
                  <input
                    data-testid="login-password-input"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-white px-3 h-11 outline-none placeholder:text-white/30"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {err && (
                <div
                  data-testid="login-error"
                  role="alert"
                  className="error flex items-start gap-2 px-3 py-2 border border-red-500/30 bg-red-500/5 text-red-300 text-xs"
                >
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{err}</span>
                </div>
              )}

              <button
                data-testid="login-submit-btn"
                type="submit"
                disabled={busy}
                className="w-full h-11 bg-[#00FF41] hover:bg-[#00CC33] disabled:opacity-50 text-black font-mono text-xs tracking-[0.22em] uppercase font-bold transition-colors flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in ...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            <div className="text-center mt-5 font-mono text-[11px] text-white/50">
              Don&apos;t have an account?{" "}
              <Link to="/signup" data-testid="goto-signup-link" className="text-[#00FF41] hover:underline">
                Create one →
              </Link>
            </div>
          </div>

          <div className="mt-6 text-center font-mono text-[10px] text-white/30 space-x-4">
            <Link to="/terms" className="hover:text-white/60">Terms</Link>
            <span>·</span>
            <Link to="/privacy" className="hover:text-white/60">Privacy</Link>
            <span>·</span>
            <Link to="/docs" className="hover:text-white/60">Docs</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
