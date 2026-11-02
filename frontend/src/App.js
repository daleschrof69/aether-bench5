import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./context/AuthContext";
import { AppProvider } from "./context/AppContext";
import { WindowChrome } from "./components/WindowChrome";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { Footer } from "./components/Footer";
import { SetupWizard } from "./components/SetupWizard";
import { IMEIRepairModal } from "./components/IMEIRepairModal";
import Dashboard from "./pages/Dashboard";
import MTKService from "./pages/MTKService";
import QualcommService from "./pages/QualcommService";
import IPhoneService from "./pages/IPhoneService";
import SamsungService from "./pages/SamsungService";
import MTPService from "./pages/MTPService";
import Logs from "./pages/Logs";
import Drivers from "./pages/Drivers";
import Pricing from "./pages/Pricing";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import AuthCallback from "./pages/AuthCallback";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancel from "./pages/PaymentCancel";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import DocsHub from "./pages/DocsHub";
import DocArticle from "./pages/DocArticle";

function AppShell() {
  const location = useLocation();
  return (
    <AppProvider>
      <div className="h-dvh w-full min-w-0 flex flex-col bg-black text-white overflow-hidden">
        <WindowChrome />
        <div className="flex-1 flex min-h-0">
          <Sidebar />
          <main
            key={location.pathname}
            className="flex-1 min-w-0 bg-[#040405] bg-noise overflow-hidden animate-in fade-in-0 duration-200"
          >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/mtk" element={<MTKService />} />
              <Route path="/qualcomm" element={<QualcommService />} />
              <Route path="/iphone" element={<IPhoneService />} />
              <Route path="/samsung" element={<SamsungService />} />
              <Route path="/mtp" element={<MTPService />} />
              <Route path="/drivers" element={<Drivers />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/docs" element={<DocsHub />} />
              <Route path="/docs/:slug" element={<DocArticle />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
        <StatusBar />
        <Footer />
        <SetupWizard />
        <IMEIRepairModal />
      </div>
    </AppProvider>
  );
}

// Detect OAuth callback fragment synchronously during render to avoid race conditions
function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/payment/success" element={<PaymentSuccess />} />
      <Route path="/payment/cancel" element={<PaymentCancel />} />
      <Route path="*" element={<AppShell />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "#09090B",
              border: "1px solid rgba(0,255,65,0.25)",
              color: "#fff",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "12px",
              letterSpacing: "0.05em",
              borderRadius: "2px",
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
