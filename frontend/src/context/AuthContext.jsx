import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Axios instance: always send cookies
const http = axios.create({ baseURL: API, withCredentials: true });

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// FastAPI 422 returns {detail: [{msg,...}]} — normalize to string
export const formatApiError = (detail) => {
  if (detail == null) return "Something went wrong.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);          // null = unknown, false = signed-out, object = signed-in
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await http.get("/auth/me");
      setUser(data);
      return data;
    } catch {
      setUser(false);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // If returning from Emergent OAuth callback, AuthCallback handles the exchange first.
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    refresh();
  }, [refresh]);

  const loginEmail = async (email, password) => {
    const { data } = await http.post("/auth/login", { email, password });
    setUser(data);
    return data;
  };

  const signupEmail = async (email, password, name) => {
    const { data } = await http.post("/auth/signup", { email, password, name });
    setUser(data);
    return data;
  };

  const exchangeEmergentSession = async (session_id) => {
    const { data } = await http.post("/auth/session", { session_id });
    setUser(data);
    return data;
  };

  const logout = async () => {
    try {
      await http.post("/auth/logout");
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        // Server unavailable or already-expired session — proceed to clear local state.
        console.warn("Logout request failed; clearing local state anyway.", e?.response?.status || e?.message);
      }
    }
    setUser(false);
  };

  // Hard refresh credits/plan/etc from server (call after Stripe success)
  const syncProfile = useCallback(async () => {
    try {
      const { data } = await http.get("/auth/me");
      setUser(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      refresh,
      syncProfile,
      loginEmail,
      signupEmail,
      exchangeEmergentSession,
      logout,
      http,
    }),
    [user, loading, refresh, syncProfile]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
