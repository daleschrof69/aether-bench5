import React, { useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const redirectState = useMemo(() => ({ from: location }), [location]);

  if (loading || user === null) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black">
        <div className="flex items-center gap-3 font-mono text-[#00FF41]">
          <span className="w-2 h-2 bg-[#00FF41] animate-pulse" />
          <span className="text-xs tracking-[0.3em] uppercase">Verifying session ...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={redirectState} />;
  }
  return children;
};
