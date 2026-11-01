import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loader2, AlertCircle } from "lucide-react";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { exchangeEmergentSession } = useAuth();
  const processed = useRef(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const hash = window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    const session_id = m ? decodeURIComponent(m[1]) : null;
    if (!session_id) {
      setErr("No session_id in callback URL");
      setTimeout(() => navigate("/login", { replace: true }), 1500);
      return;
    }
    (async () => {
      try {
        await exchangeEmergentSession(session_id);
        // strip hash and route home
        window.history.replaceState(null, "", "/");
        navigate("/", { replace: true });
      } catch (e) {
        setErr(e.response?.data?.detail || e.message || "OAuth exchange failed");
        setTimeout(() => navigate("/login", { replace: true }), 2000);
      }
    })();
  }, [exchangeEmergentSession, navigate]);

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-3">
        {err ? (
          <>
            <AlertCircle className="w-6 h-6 text-red-400" />
            <div className="font-mono text-xs text-red-300">{err}</div>
            <div className="font-mono text-[10px] text-white/40">Returning to login ...</div>
          </>
        ) : (
          <>
            <Loader2 className="w-6 h-6 text-[#00FF41] animate-spin" />
            <div className="font-mono text-xs tracking-[0.3em] uppercase text-[#00FF41]">
              Establishing session
            </div>
          </>
        )}
      </div>
    </div>
  );
}
