import { useState, useEffect, useCallback } from "react";
import { USB_REQUEST_FILTERS, classifyUsb } from "../lib/usbSignatures";

const normalize = (d) => {
  const sig = classifyUsb(d.vendorId, d.productId);
  return {
    raw: d,
    vendorId: d.vendorId,
    productId: d.productId,
    vidHex: d.vendorId.toString(16).padStart(4, "0"),
    pidHex: d.productId.toString(16).padStart(4, "0"),
    product: d.productName || "",
    manufacturer: d.manufacturerName || "",
    serial: d.serialNumber || "",
    signature: sig,
  };
};

/**
 * WebUSB access hook.
 * - `supported`: browser exposes navigator.usb (Chromium: Chrome/Edge/Opera).
 * - `secure`: running in a secure context (HTTPS/localhost) — required by WebUSB.
 * - `granted`: devices the user has already authorized (navigator.usb.getDevices()).
 * - `request()`: prompt the browser device chooser and return a normalized device.
 */
export function useWebUsb() {
  const supported = typeof navigator !== "undefined" && !!navigator.usb;
  const secure = typeof window !== "undefined" && window.isSecureContext;
  const [granted, setGranted] = useState([]);

  const refreshGranted = useCallback(async () => {
    if (!supported) return;
    try {
      const list = await navigator.usb.getDevices();
      setGranted(list.map(normalize));
    } catch (e) {
      console.debug("[webusb] getDevices failed:", e);
    }
  }, [supported]);

  useEffect(() => {
    if (!supported) return;
    refreshGranted();
    const handler = () => refreshGranted();
    navigator.usb.addEventListener("connect", handler);
    navigator.usb.addEventListener("disconnect", handler);
    return () => {
      navigator.usb.removeEventListener("connect", handler);
      navigator.usb.removeEventListener("disconnect", handler);
    };
  }, [supported, refreshGranted]);

  const request = useCallback(async () => {
    if (!supported) {
      throw new Error("WebUSB is not supported in this browser. Use Chrome, Edge or Opera on desktop.");
    }
    if (!secure) {
      throw new Error("WebUSB requires a secure (HTTPS) context.");
    }
    // Reads VID/PID + descriptor strings (product/manufacturer/serial) without
    // opening/claiming the interface — safe on BROM/EDL modes that lack a WinUSB
    // driver. Full protocol I/O still requires the native CLI bridge.
    const device = await navigator.usb.requestDevice({ filters: USB_REQUEST_FILTERS });
    await refreshGranted();
    return normalize(device);
  }, [supported, secure, refreshGranted]);

  return { supported, secure, granted, request, refreshGranted };
}
