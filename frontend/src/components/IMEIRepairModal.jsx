import React, { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { useApp } from "../context/AppContext";
import { Hash, ShieldAlert, Loader2, Check, X, AlertTriangle } from "lucide-react";

// Luhn checksum validation — a valid GSM IMEI is 15 digits whose Luhn sum
// (doubling every 2nd digit from the right) is divisible by 10.
const luhnValid = (num) => {
  if (!/^\d{15}$/.test(num)) return false;
  const digits = num.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits[digits.length - 1 - i];
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
};

const ImeiField = ({ label, value, onChange, optional, testid }) => {
  const touched = value.length > 0;
  const valid = touched && luhnValid(value);
  const invalid = touched && !valid;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/50">
          {label} {optional && <span className="text-white/25">(optional)</span>}
        </label>
        {touched &&
          (valid ? (
            <span className="flex items-center gap-1 font-mono text-[9px] tracking-[0.15em] uppercase text-[#00FF41]">
              <Check className="w-3 h-3" /> Luhn OK
            </span>
          ) : (
            <span className="flex items-center gap-1 font-mono text-[9px] tracking-[0.15em] uppercase text-red-400">
              <X className="w-3 h-3" /> Invalid
            </span>
          ))}
      </div>
      <div
        className={`flex items-center gap-2 bg-black border px-3 h-11 transition-colors ${
          invalid ? "border-red-500/50" : valid ? "border-[#00FF41]/40" : "border-white/15 focus-within:border-white/35"
        }`}
      >
        <Hash className="w-4 h-4 text-white/30 flex-shrink-0" />
        <input
          data-testid={testid}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 15))}
          inputMode="numeric"
          placeholder="15-digit IMEI"
          className="flex-1 bg-transparent outline-none font-mono text-sm text-white tracking-[0.15em] placeholder:text-white/20"
        />
        <span className="font-mono text-[10px] text-white/30">{value.length}/15</span>
      </div>
    </div>
  );
};

export const IMEIRepairModal = () => {
  const { imeiModalOpen, setImeiModalOpen, runAction, status, device } = useApp();
  const [imei1, setImei1] = useState("");
  const [imei2, setImei2] = useState("");
  const [agreed, setAgreed] = useState(false);

  const imei1Valid = luhnValid(imei1);
  const imei2Valid = imei2.length === 0 || luhnValid(imei2);
  const canSubmit = imei1Valid && imei2Valid && agreed && status === "connected";

  const reset = () => {
    setImei1("");
    setImei2("");
    setAgreed(false);
  };

  const handleClose = (open) => {
    setImeiModalOpen(open);
    if (!open) reset();
  };

  const submit = () => {
    if (!canSubmit) return;
    runAction("repair_imei", "Repair IMEI", { imei1, imei2: imei2 || undefined });
    handleClose(false);
  };

  return (
    <Dialog open={imeiModalOpen} onOpenChange={handleClose}>
      <DialogContent
        data-testid="imei-repair-modal"
        className="max-w-md bg-[#0A0A0D] border border-[#00FF41]/25 text-white p-0 gap-0 shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center gap-4">
          <div className="w-11 h-11 border border-[#00FF41]/40 bg-[#00FF41]/5 flex items-center justify-center flex-shrink-0">
            <Hash className="w-5 h-5 text-[#00FF41]" strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-lg font-bold tracking-tight text-white">Repair IMEI</DialogTitle>
            <DialogDescription className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/40 mt-1">
              Write IMEI to the modem NV partition · 5 credits
            </DialogDescription>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {device && (
            <div className="font-mono text-[11px] text-white/50">
              Target: <span className="text-white/80">{device.model}</span>
            </div>
          )}

          <ImeiField label="IMEI 1" value={imei1} onChange={setImei1} testid="imei1-input" />
          <ImeiField label="IMEI 2" value={imei2} onChange={setImei2} optional testid="imei2-input" />

          {/* Legal disclaimer */}
          <div className="bg-yellow-400/5 border border-yellow-400/30 p-3 flex items-start gap-3">
            <ShieldAlert className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" strokeWidth={2} />
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                data-testid="imei-legal-checkbox"
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 accent-[#00FF41] w-4 h-4 flex-shrink-0"
              />
              <span className="font-mono text-[11px] text-yellow-200/80 leading-relaxed">
                I confirm I am <span className="font-bold text-yellow-100">restoring the original OEM-printed IMEI</span> on
                a device I own or am authorized to service. Programming an IMEI that was not assigned to
                this device is illegal in many jurisdictions.
              </span>
            </label>
          </div>

          {status !== "connected" && (
            <div className="flex items-center gap-2 font-mono text-[11px] text-red-300">
              <AlertTriangle className="w-3.5 h-3.5" /> Connect a target device first.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-3">
          <button
            data-testid="imei-cancel"
            onClick={() => handleClose(false)}
            className="h-9 px-4 border border-white/15 hover:border-white/30 text-white/70 hover:text-white font-mono text-[10px] tracking-[0.2em] uppercase transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="imei-submit"
            onClick={submit}
            disabled={!canSubmit}
            className="h-9 px-5 bg-[#00FF41] hover:bg-[#00CC33] text-black font-mono text-[10px] tracking-[0.22em] uppercase font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Loader2 className="w-3.5 h-3.5 hidden" />
            Repair IMEI
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
