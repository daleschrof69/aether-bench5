import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "./AuthContext";
import { useCliBridge } from "../hooks/useCliBridge";
import { useWebUsb } from "../hooks/useWebUsb";
import { quoteOp } from "../lib/opCosts";
import { SEARCH_HINTS, platformFromDevice } from "../lib/usbSignatures";

const WALLET_KEY = "aether.bench.credits";

function readWallet() {
  try {
    const raw = window.localStorage.getItem(WALLET_KEY);
    if (raw == null) return 100;
    const amount = Number(raw);
    return Number.isFinite(amount) && amount >= 0 ? Math.floor(amount) : 100;
  } catch {
    return 100;
  }
}

function writeWallet(amount) {
  try {
    window.localStorage.setItem(WALLET_KEY, String(amount));
  } catch {
    /* Storage can be blocked in private windows. The on-screen balance still updates. */
  }
}

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

// Mapping from a UI action key to the JSON-RPC method on the local CLI bridge.
// Every entry here maps to a REAL operation that the native aether-cli executes
// via mtkclient / heimdall / edlclient / checkm8 on the connected device. There
// is no simulation / demo fallback — operations only run when the local CLI
// bridge is live. Keys NOT listed here are not yet backed by a real tool and
// are reported honestly as unavailable (never faked).
const BRIDGE_METHODS = {
  // MediaTek (mtkclient)
  bypass_frp:             { method: "mtk.frp_bypass" },
  repair_imei:            { method: "mtk.repair_imei" },
  unlock_bootloader:      { method: "mtk.unlock_bootloader" },
  erase_userdata:         { method: "mtk.erase_userdata" },
  read_info:              { method: "mtk.read_info" },
  universal_unlock:       { method: "unlock.auto" },
  remove_screen_lock:     { method: "android.remove_screen_lock" },
  disable_auth:           { method: "mtk.disable_auth" },
  read_frp_token:         { method: "mtk.read_frp" },
  mdm_bypass:             { method: "android.remove_screen_lock" },
  // Qualcomm (edlclient — Sahara/Firehose)
  enter_edl:              { method: "qualcomm.enter_edl" },
  edl_auth_unlock:        { method: "qualcomm.edl_auth_unlock" },
  cert_repair:            { method: "qualcomm.cert_repair" },
  safe_format:            { method: "qualcomm.safe_format" },
  // Samsung (heimdall — Odin/Loke)
  samsung_detect:         { method: "samsung.detect" },
  samsung_read_pit:       { method: "samsung.read_pit" },
  samsung_factory_reset:  { method: "samsung.factory_reset" },
  samsung_swclone:        { method: "samsung.swclone", params: { args: ["devices"] } },
  // Apple (libimobiledevice). Recovery query, lockdown info, diagnostics, and
  // an Apple-signed erase restore. None of these skip Activation Lock.
  apple_info:             { method: "apple.read_info" },
  diag_identity:          { method: "diag.read", params: { section: "identity" } },
  icloud_check:           { method: "apple.read_info" },
  apple_lockdown:         { method: "apple.lockdown_info" },
  apple_diagnostics:      { method: "apple.diagnostics" },
  apple_list:             { method: "apple.list" },
  apple_restore:          { method: "apple.restore_latest" },
  hello_screen_bypass:    { method: "apple.pwn_dfu" },
  // MTP
  mtp_detect:             { method: "mtp.report" },
  mtp_list:               { method: "mtp.list" },
  mtp_pull:               { method: "mtp.pull" },
  mtp_info:               { method: "mtp.info" },
  // Documented vendor commands. Existing repair actions stay on the keys above.
  official_adb_devices:    { method: "official.run", params: { tool: "adb", args: ["devices", "-l"] } },
  official_adb_state:      { method: "official.run", params: { tool: "adb", args: ["get-state"] } },
  official_adb_reboot:     { method: "official.run", params: { tool: "adb", args: ["reboot"] } },
  official_adb_recovery:   { method: "official.run", params: { tool: "adb", args: ["reboot", "recovery"] } },
  official_adb_bootloader: { method: "official.run", params: { tool: "adb", args: ["reboot", "bootloader"] } },
  official_adb_download:   { method: "official.run", params: { tool: "adb", args: ["reboot", "download"] } },
  official_fastboot_devices: { method: "official.run", params: { tool: "fastboot", args: ["devices"] } },
  official_fastboot_getvar:  { method: "official.run", params: { tool: "fastboot", args: ["getvar", "all"] } },
  official_heimdall_version: { method: "official.run", params: { tool: "heimdall", args: ["version"] } },
  official_heimdall_close:   { method: "official.run", params: { tool: "heimdall", args: ["close-pc-screen"] } },
  official_heimdall_pit:     { method: "official.run", params: { tool: "heimdall", args: ["download-pit"] } },
  official_apple_id:         { method: "official.run", params: { tool: "apple", args: ["id"] } },
  official_apple_info:       { method: "official.run", params: { tool: "apple", args: ["info"] } },
  official_apple_diagnostics:{ method: "official.run", params: { tool: "apple", args: ["diagnostics"] } },
  official_apple_recovery:   { method: "official.run", params: { tool: "apple", args: ["recovery"] } },
  official_apple_pair:       { method: "official.run", params: { tool: "apple", args: ["pair", "validate"] } },
};

const formatTime = (d = new Date()) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

let logIdCounter = 0;

export const AppProvider = ({ children }) => {
  const [status, setStatus] = useState("idle"); // idle | searching | connected | working
  const [device, setDevice] = useState(null);
  const [comPort, setComPort] = useState(null);
  const [logs, setLogs] = useState([]);
  const [activeAction, setActiveAction] = useState(null);
  const [progress, setProgress] = useState(0);
  const [autoConnect, setAutoConnect] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [credits, setCredits] = useState(readWallet);
  const { user, http, noteCredits } = useAuth();
  const [setupOpen, setSetupOpen] = useState(false);
  const [imeiModalOpen, setImeiModalOpen] = useState(false);
  const timersRef = useRef([]);
  const scanGen = useRef(0);
  const chargingRef = useRef(false);
  useEffect(() => {
    if (user && typeof user === "object" && typeof user.credits === "number") {
      setCredits(user.credits);
    }
  }, [user]);
  const cliBridge = useCliBridge();
  const webusb = useWebUsb();

  const pushLog = useCallback((level, text) => {
    setLogs((prev) => {
      const next = [
        ...prev,
        { id: ++logIdCounter, ts: formatTime(), level, text },
      ];
      return next.length > 500 ? next.slice(-500) : next;
    });
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    pushLog("INFO", "Console cleared by user.");
  }, [pushLog]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);

  const maskImei = (imei) => {
    const digits = String(imei || "").replace(/\D/g, "");
    if (digits.length < 8) return "";
    return `${digits.slice(0, 2)}•••••••${digits.slice(-4)}`;
  };

  const applyIdentityReport = (prev, report) => {
    if (!prev || !report || report.report !== "identity") return prev;
    const next = { ...prev };
    const fill = (key, value) => {
      if (value && value !== "—") next[key] = value;
    };
    fill("platform", report.platform);
    fill("brand", report.brand);
    fill("model", report.model);
    fill("serial", report.serial);
    fill("firmware", report.firmware);
    fill("battery", report.battery);
    fill("cpuId", report.chipset);
    fill("storage", report.storage);
    if (report.firmware && (!next.os || next.os === "—")) next.os = report.firmware;
    if (report.connection && (!next.bootloader || next.bootloader === "—")) {
      next.bootloader = report.connection;
    }
    const fields = report.fields || {};
    if (fields.android_version) next.android = fields.android_version;
    if (fields.security_patch) next.patch = fields.security_patch;
    const masked = maskImei(fields.imei);
    if (masked) {
      next.imei = masked;
      next.imei_masked = masked;
    }
    const masked2 = maskImei(fields.imei2);
    if (masked2) {
      next.imei2 = masked2;
      next.imei2_masked = masked2;
    }
    return next;
  };

  // Real device scan via the local Aether CLI bridge (libusb enumeration on the
  // host). No simulation: if the bridge is offline we tell the user how to
  // bring it online instead of inventing a fake device.
  const startSearch = useCallback(async (hint) => {
    clearTimers();
    const generation = ++scanGen.current;
    setStatus("searching");
    setDevice(null);
    setComPort(null);
    const want = SEARCH_HINTS[hint] || null;
    pushLog("INFO", want
      ? `Scanning USB bus for a ${want} repair target ...`
      : "Scanning USB bus via local Aether bridge ...");

    if (cliBridge.status !== "connected" || typeof cliBridge.call !== "function") {
      pushLog("ERROR", "Local Aether CLI bridge is offline — no real USB access.");
      pushLog("INFO", "Start aether-cli on this machine (or launch the Aether desktop app), then retry.");
      pushLog("INFO", "Or click 'Connect via WebUSB' to pair a device directly in Chrome / Edge / Opera over HTTPS.");
      setStatus("idle");
      toast.error("CLI bridge offline", { description: "Start the Aether CLI to detect real devices." });
      return;
    }

    try {
      const [res, identified] = await Promise.all([
        cliBridge.call("devices", {}),
        cliBridge.call("phones.identify", {}).catch((err) => {
          pushLog("WARN", `Phone identify unavailable: ${err?.message || err}`);
          return { phones: [] };
        }),
      ]);
      if (scanGen.current !== generation) return;
      const list = Array.isArray(res?.devices) ? res.devices : [];
      const classified = list.map((raw) => ({ raw, ...platformFromDevice(raw) }));
      const phones = Array.isArray(identified?.phones) ? identified.phones : [];
      if (identified?.note) pushLog("WARN", identified.note);
      phones.forEach((phone) => {
        const brand = phone.brand || "Phone";
        const model = phone.model || "unknown model";
        const os = phone.os || "unknown OS";
        const kind = phone.kind || "phone";
        pushLog("INFO", `${brand} ${model} · ${kind} · ${os} · ${phone.state || "unknown"} · ${phone.serial || "—"}`);
        if (phone.note) pushLog("WARN", phone.note);
      });
      const phoneMatches = (phone) => {
        if (!want) return true;
        const blob = `${phone.brand || ""} ${phone.platform || ""} ${phone.model || ""}`.toLowerCase();
        return blob.includes(String(want).toLowerCase());
      };
      const pool = want ? classified.filter((d) => d.platform === want) : classified;
      const target = pool.find((d) => d.repair) || pool[0];
      const phonePool = phones.filter(phoneMatches);
      const phone = phonePool.find((p) => p.state === "device" || p.state === "trusted")
        || phonePool[0]
        || (!target && phones.length === 1 ? phones[0] : null);
      if (!phone && !target) {
        pushLog("WARN", want
          ? `No ${want} device found. Plug the phone in and accept USB debugging, or put it in Download / BROM / EDL mode.`
          : "No phone found. Plug it in and accept USB debugging, or put it in a repair mode.");
        setStatus("idle");
        toast.warning(want ? `No ${want} device` : "No device detected");
        return;
      }
      const dev = phone
        ? {
            model: phone.model || target?.mode || "Unknown model",
            brand: phone.brand || target?.brand || "Phone",
            platform: phone.platform || target?.platform || "Android",
            kind: phone.kind || "phone",
            imei: "—", imei_masked: "—", imei2: "—", imei2_masked: "—",
            serial: phone.serial || target?.raw?.serial || "—",
            firmware: "—",
            battery: "—",
            bootloader: phone.build || target?.mode || "—",
            cpuId: phone.cpu || "—", storage: "—", ram: "—",
            region: phone.region || "—",
            vid: target?.raw?.vid, pid: target?.raw?.pid,
            android: phone.android || "—",
            os: phone.os || "—",
            patch: phone.security_patch || "—",
            repair: !!target?.repair,
            source: phone.source || "bridge",
            detectedAt: new Date(),
          }
        : {
            model: target.raw?.product || target.mode || `USB ${target.raw.vid}:${target.raw.pid}`,
            brand: target.raw?.manufacturer || target.brand || "USB device",
            platform: target.platform,
            kind: target.repair ? "repair" : "usb",
            imei: "—", imei_masked: "—", imei2: "—", imei2_masked: "—",
            serial: target.raw?.serial && target.raw.serial !== "—" ? target.raw.serial : "—",
            firmware: "—",
            battery: "—",
            bootloader: target.mode || "Interface mode",
            cpuId: "—", storage: "—", ram: "—", region: "—",
            vid: target.raw.vid, pid: target.raw.pid,
            android: "—", os: "—", patch: "—",
            repair: !!target.repair,
            source: "bridge",
            detectedAt: new Date(),
          };
      setDevice(dev);
      setComPort(phone?.transport
        ? phone.transport
        : target ? `bus ${target.raw.bus} · addr ${target.raw.addr}` : "—");
      setStatus("connected");
      pushLog("SUCCESS", `Device detected: ${dev.brand} ${dev.model} · ${dev.os && dev.os !== "—" ? dev.os : dev.platform}`);
      if (phone && phone.state !== "device" && phone.state !== "trusted") {
        pushLog("WARN", "The phone is connected, but Aether could not read its full identity yet.");
      } else if (!phone && target && !target.repair) {
        pushLog("WARN", "USB name only. Enable USB debugging to read the model and OS version.");
      } else if (target?.repair) {
        pushLog("INFO", `${dev.platform} repair mode is available for this device.`);
      }
      toast.success(`Connected · ${dev.model}`, { description: `${dev.brand} · ${dev.os && dev.os !== "—" ? dev.os : dev.platform}` });

      const knownUsb = target && target.platform && target.platform !== "Unknown";
      const selector = phone?.serial && phone.serial !== "—"
        ? phone.serial
        : knownUsb && target.raw?.vid && target.raw?.pid
          ? `${target.raw.vid}:${target.raw.pid}`
          : "auto";
      if (typeof cliBridge.runJob === "function" && (phone || knownUsb)) {
        pushLog("INFO", "Reading serial, model, and firmware ...");
        cliBridge
          .runJob("diag.read", { port: selector, section: "identity" }, (ev) => {
            if (scanGen.current !== generation) return;
            const line = ev?.line || "";
            if (line.startsWith("AETHER_DIAG ")) {
              try {
                const report = JSON.parse(line.slice("AETHER_DIAG ".length));
                setDevice((prev) => applyIdentityReport(prev, report));
                if (report.ok) {
                  pushLog(
                    "SUCCESS",
                    `Identity · ${report.model || dev.model} · serial ${report.serial || "n/a"} · firmware ${report.firmware || "n/a"}`
                  );
                }
              } catch (err) {
                pushLog("WARN", `Identity report could not be parsed: ${err?.message || err}`);
              }
              return;
            }
            if (ev.stream === "stdout" && line && !line.startsWith("AETHER_DIAG")) pushLog("INFO", line);
            else if (ev.stream === "stderr" && line) pushLog("WARN", line);
            else if (ev.stream === "done" && ev.exit_code && ev.exit_code !== 0) {
              pushLog("ERROR", `Identity read failed (exit ${ev.exit_code}).`);
            }
          })
          .catch((err) => {
            if (scanGen.current !== generation) return;
            pushLog("ERROR", `Identity read failed: ${err?.message || err}`);
          });
      }
    } catch (e) {
      if (scanGen.current !== generation) return;
      pushLog("ERROR", `Bridge device scan failed: ${e?.message || e}`);
      setStatus("idle");
    }
  }, [cliBridge, pushLog, clearTimers]);

  const connectMtp = useCallback((raw) => {
    if (!raw) return;
    const model = raw.product && raw.product !== "—" ? raw.product : "MTP device";
    const brand = raw.manufacturer && raw.manufacturer !== "—" ? raw.manufacturer : "Android";
    const dev = {
      model,
      brand,
      platform: "MTP",
      kind: "phone",
      imei: "—", imei_masked: "—", imei2: "—", imei2_masked: "—",
      serial: raw.serial || "—",
      bootloader: raw.mode || "MTP",
      cpuId: "—", storage: "—", ram: "—", region: "—",
      vid: raw.vid, pid: raw.pid,
      android: "—",
      os: "MTP",
      patch: "—",
      repair: false,
      source: "mtp",
      detectedAt: new Date(),
    };
    clearTimers();
    setDevice(dev);
    setComPort(raw.serial || `bus ${raw.bus} · addr ${raw.addr}`);
    setStatus("connected");
    pushLog("SUCCESS", `MTP connected: ${brand} ${model}${raw.serial ? ` · ${raw.serial}` : ""}`);
    toast.success(`MTP · ${model}`, { description: `${brand} · ${raw.vid}:${raw.pid}` });
  }, [clearTimers, pushLog]);

  const disconnect = useCallback(() => {
    clearTimers();
    scanGen.current += 1;
    pushLog("WARN", "Device disconnected by user.");
    setStatus("idle");
    setDevice(null);
    setComPort(null);
    setActiveAction(null);
    setProgress(0);
  }, [pushLog, clearTimers]);

  // Real in-browser device detection via WebUSB (Chromium + HTTPS). Enumerates
  // and classifies the connected device by VID/PID. Note: running full exploit
  // protocols still requires the native aether-cli bridge.
  const connectWebUsb = useCallback(async () => {
    scanGen.current += 1;
    if (!webusb.supported) {
      pushLog("ERROR", "WebUSB unavailable — use Chrome, Edge or Opera on desktop.");
      return;
    }
    pushLog("INFO", "Requesting USB device access (WebUSB) ...");
    try {
      const d = await webusb.request();
      const sig = d.signature;
      const dev = {
        model: d.product || `USB Device ${d.vidHex}:${d.pidHex}`,
        brand: d.manufacturer || sig?.brand || "Unknown vendor",
        platform: sig?.platform || "USB",
        imei: "N/A (WebUSB)",
        imei_masked: "N/A (WebUSB)",
        imei2: "N/A",
        imei2_masked: "N/A",
        serial: d.serial || "—",
        firmware: "—",
        battery: "—",
        bootloader: sig?.mode || "Interface mode",
        cpuId: "—",
        storage: "—",
        ram: "—",
        region: "—",
        vid: d.vidHex,
        pid: d.pidHex,
        android: "—",
        patch: "—",
        source: "webusb",
        detectedAt: new Date(),
      };
      clearTimers();
      setDevice(dev);
      setComPort("WebUSB");
      setStatus("connected");
      pushLog("SUCCESS", `WebUSB authorized: ${dev.brand} ${dev.model}`);
      pushLog("INFO", `USB ${d.vidHex}:${d.pidHex}${d.serial ? ` · SN ${d.serial}` : ""}`);
      if (sig?.repair) {
        pushLog("SUCCESS", `Repair-mode target recognized: ${sig.platform} — ${sig.mode}`);
      } else if (sig) {
        pushLog(
          "WARN",
          `${sig.brand || sig.platform} detected in ${sig.mode}. Switch to BROM / EDL / DFU / Download mode for repair operations.`
        );
      } else {
        pushLog("WARN", `Unrecognized USB vendor ${d.vidHex}:${d.pidHex}. Put the device in a known repair mode and retry.`);
      }
      pushLog("INFO", "USB descriptors do not include the firmware build. Scan with the CLI bridge for a protocol identity read.");
    } catch (e) {
      if (e?.name === "NotFoundError") {
        pushLog("WARN", "WebUSB: no device selected.");
      } else if (e?.name === "SecurityError") {
        pushLog("ERROR", "WebUSB blocked by permissions policy — open the app in its own Chromium tab.");
      } else {
        pushLog("ERROR", `WebUSB error: ${e?.message || e}`);
      }
    }
  }, [webusb, pushLog, clearTimers]);

  const applyBalance = useCallback((amount) => {
    setCredits(amount);
    if (user && typeof user === "object") noteCredits(amount);
    else writeWallet(amount);
  }, [user, noteCredits]);

  const refundCharge = useCallback(async (charge) => {
    if (!charge || charge.cost <= 0 || charge.refunded) return;
    charge.refunded = true;
    if (charge.where === "server") {
      try {
        const { data } = await http.post("/credits/refund", { op_id: charge.opId });
        applyBalance(data.credits);
        pushLog("INFO", `Returned ${charge.cost} credits because ${charge.label} did not complete.`);
      } catch (e) {
        pushLog("ERROR", e?.response?.data?.detail || "Credit refund failed. The charge is still on the account.");
      }
      return;
    }
    const next = readWallet() + charge.cost;
    writeWallet(next);
    setCredits(next);
    pushLog("INFO", `Returned ${charge.cost} credits because ${charge.label} did not complete.`);
  }, [http, applyBalance, pushLog]);

  const runAction = useCallback(
    (actionKey, label, params = {}, costLabel) => {
      const allowDisconnected = actionKey.startsWith("official_");
      if (activeAction || chargingRef.current) return;
      if (!allowDisconnected && status !== "connected") {
        pushLog("ERROR", `Connect a device before running ${label}. No credits were charged.`);
        toast.error("Connect a device first", { description: `${label} was not charged.` });
        return;
      }

      const bridgeMap = BRIDGE_METHODS[actionKey];
      const bridgeLive =
        cliBridge.status === "connected" && typeof cliBridge.runJob === "function";

      // No bridge → no operation. We never fake success.
      if (!bridgeLive) {
        pushLog("ERROR", `Cannot run "${label}" — local Aether CLI bridge is offline.`);
        pushLog("INFO", "Start aether-cli on this machine (or launch the Aether desktop app) to run operations on real hardware.");
        toast.error("Bridge offline", { description: `Start the Aether CLI to run ${label}.` });
        return;
      }

      // Bridge live but this operation needs tooling the CLI doesn't expose yet.
      if (!bridgeMap) {
        pushLog("WARN", `"${label}" is not yet wired to a local CLI operation — skipping.`);
        pushLog("INFO", "This operation requires an additional loader/module in aether-cli. No credits were charged.");
        toast.warning(`${label} · unavailable`, { description: "Not yet supported by the local CLI. No credits were charged." });
        return;
      }

      let cost = 0;
      try {
        cost = quoteOp(actionKey, costLabel);
      } catch (e) {
        pushLog("ERROR", e.message);
        toast.error(e.message);
        return;
      }

      const returnStatus = status === "connected" ? "connected" : "idle";
      const startJob = (charge) => {
        chargingRef.current = false;
        setActiveAction(label);
        setStatus("working");
        setProgress(0);
        pushLog("INFO", `>>> EXECUTING (LIVE): ${label}`);
        pushLog("INFO", `aether-cli → ${bridgeMap.method}`);
        if (charge?.cost > 0) {
          pushLog("INFO", `Charged ${charge.cost} credits for ${label}.`);
        }

        cliBridge
          .runJob(bridgeMap.method, { ...(bridgeMap.params || {}), ...params }, (ev) => {
            const line = ev?.line || "";
            if (line.startsWith("AETHER_DIAG ")) {
              try {
                const report = JSON.parse(line.slice("AETHER_DIAG ".length));
                setDevice((prev) => applyIdentityReport(prev, report));
              } catch (err) {
                pushLog("WARN", `Identity report could not be parsed: ${err?.message || err}`);
              }
              return;
            }
            if (ev.stream === "stdout" && line) {
              pushLog("INFO", line);
            } else if (ev.stream === "stderr" && line) {
              pushLog("WARN", ev.line);
            } else if (ev.stream === "done") {
              if (ev.exit_code === 0) {
                pushLog("SUCCESS", `${label} completed (exit 0).`);
                toast.success(`${label} · done`, { description: "Operation completed successfully." });
              } else {
                pushLog("ERROR", `${label} failed (exit ${ev.exit_code}).`);
                toast.error(`${label} · failed`, { description: `Exit code ${ev.exit_code}` });
                refundCharge(charge);
              }
              const finishT = setTimeout(() => {
                setActiveAction(null);
                setStatus(returnStatus);
                setProgress(0);
              }, 600);
              timersRef.current.push(finishT);
            }
          })
          .catch((e) => {
            const message = e?.message || String(e);
            const hint = /unknown method/i.test(message)
              ? `${message}. Quit aether-cli and start it again so this button reaches the new build.`
              : message;
            pushLog("ERROR", hint);
            toast.error(hint);
            refundCharge(charge);
            setActiveAction(null);
            setStatus(returnStatus);
            setProgress(0);
          });
      };

      if (cost === 0) {
        startJob(null);
        return;
      }

      const opId = (window.crypto?.randomUUID?.() || `op_${Date.now()}_${Math.random().toString(16).slice(2)}`);
      if (user && typeof user === "object") {
        chargingRef.current = true;
        http.post("/credits/spend", { action_key: actionKey, op_id: opId, cost })
          .then(({ data }) => {
            applyBalance(data.credits);
            startJob({ where: "server", opId, cost: data.charged || cost, label, refunded: false });
          })
          .catch((e) => {
            chargingRef.current = false;
            const denied = e?.response?.status === 402;
            const detail = e?.response?.data?.detail;
            const message = denied
              ? `Not enough credits. ${label} costs ${cost}.`
              : (typeof detail === "string" ? detail : "Could not charge credits.");
            pushLog("ERROR", message);
            toast.error(message);
          });
        return;
      }

      const balance = readWallet();
      if (balance < cost) {
        pushLog("ERROR", `Not enough credits. ${label} costs ${cost}. Wallet has ${balance}.`);
        toast.error("Not enough credits", { description: "Buy a credit pack, then run the operation again." });
        return;
      }
      const next = balance - cost;
      writeWallet(next);
      setCredits(next);
      startJob({ where: "local", opId, cost, label, refunded: false });
    },
    [status, activeAction, pushLog, cliBridge, user, http, applyBalance, refundCharge]
  );

  // Boot sequence — honest init banner (no fake engine loading).
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    pushLog("INFO", "[Aether] Phone Repair Tools initializing ...");
    pushLog("INFO", "[Aether] Looking for local CLI bridge on ws://127.0.0.1:8765 ...");
    pushLog("INFO", "[Aether] Plug a device into BROM / EDL / DFU / Download mode, or pair via WebUSB.");
    return () => clearTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to the local CLI bridge coming online/offline. When it connects and
  // auto-connect is on, immediately scan for a real device.
  const prevBridgeStatus = useRef("offline");
  useEffect(() => {
    if (cliBridge.status === "connected" && prevBridgeStatus.current !== "connected") {
      pushLog(
        "SUCCESS",
        `Local Aether CLI bridge connected${cliBridge.info?.version ? ` (v${cliBridge.info.version})` : ""}.`
      );
      if (cliBridge.info?.mtkclient) pushLog("INFO", `mtkclient ${cliBridge.info.mtkclient} ready.`);
      if (cliBridge.info?.heimdall) pushLog("INFO", `heimdall ${cliBridge.info.heimdall} ready.`);
      if (autoConnect && status === "idle") startSearch();
    }
    if (cliBridge.status === "offline" && prevBridgeStatus.current === "connected") {
      pushLog("WARN", "Local Aether CLI bridge disconnected.");
    }
    prevBridgeStatus.current = cliBridge.status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliBridge.status]);

  const value = {
    status,
    device,
    comPort,
    logs,
    activeAction,
    progress,
    autoConnect,
    soundEnabled,
    credits,
    setCredits,
    setAutoConnect,
    setSoundEnabled,
    startSearch,
    connectMtp,
    disconnect,
    connectWebUsb,
    webusb,
    runAction,
    pushLog,
    clearLogs,
    cliBridge,
    setupOpen,
    setSetupOpen,
    imeiModalOpen,
    setImeiModalOpen,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
