import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useCliBridge — connect to the local Aether CLI WebSocket bridge.
 *
 * 1. Reads `localStorage.aether.bridge` (default: `ws://127.0.0.1:8765`).
 * 2. Connects when enabled via `localStorage.aether.bridge.enabled = "1"`,
 *    auto-reconnects every 5 s if the CLI goes offline.
 * 3. Performs a JSON-RPC `hello` handshake on connect — returned info
 *    (CLI version, mtkclient version, capabilities) lives on the `info`
 *    field.
 * 4. `call(method, params)` issues a one-shot request/response.
 * 5. `runJob(method, params, onEvent)` starts a streaming mtkclient job
 *    (Aegis Unlock, IMEI repair, bootloader unlock, etc.). The callback
 *    receives every `event` notification — including the final
 *    `{stream:"done", exit_code:N}` payload. Returns a promise that
 *    resolves to the exit code.
 */
const DEFAULT_URL = "ws://127.0.0.1:8765";

let rpcId = 0;

export function useCliBridge() {
  const [status, setStatus] = useState("offline"); // offline | connecting | connected
  const [info, setInfo] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);
  const wsRef = useRef(null);
  const pendingRef = useRef(new Map());
  const jobSubsRef = useRef(new Map()); // job_id → onEvent callback
  const reconnectRef = useRef(null);

  const url =
    (typeof window !== "undefined" &&
      window.localStorage?.getItem("aether.bridge")) ||
    DEFAULT_URL;

  // Bridge is enabled by default (auto-connects to the local CLI). Set
  // localStorage `aether.bridge.enabled = "0"` to opt out.
  const enabledRaw =
    typeof window !== "undefined" ? window.localStorage?.getItem("aether.bridge.enabled") : null;
  const enabled = enabledRaw == null ? true : enabledRaw === "1";

  const cleanup = useCallback(() => {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) { console.debug("[cli-bridge] socket close failed:", e); }
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled) return;
    setStatus("connecting");
    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      setStatus("offline");
      reconnectRef.current = setTimeout(connect, 5000);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      const id = ++rpcId;
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method: "hello", params: {} }));
      pendingRef.current.set(id, (res) => setInfo(res));
    };

    ws.onmessage = (msg) => {
      let payload;
      try { payload = JSON.parse(msg.data); } catch { return; }

      // Response to a previous call() — resolve its promise.
      if (payload.id != null && pendingRef.current.has(payload.id)) {
        const cb = pendingRef.current.get(payload.id);
        pendingRef.current.delete(payload.id);
        cb(payload.result ?? payload.error);
        return;
      }

      // Server-pushed event — route to job subscribers + expose lastEvent.
      if (payload.method === "event" && payload.params?.job_id) {
        setLastEvent(payload.params);
        const sub = jobSubsRef.current.get(payload.params.job_id);
        if (sub) {
          sub(payload.params);
          if (payload.params.stream === "done") {
            jobSubsRef.current.delete(payload.params.job_id);
          }
        }
      }
    };

    ws.onerror = () => { /* will trigger onclose */ };
    ws.onclose = () => {
      setStatus("offline");
      setInfo(null);
      wsRef.current = null;
      // Reject all pending RPCs + job subs so callers don't hang.
      for (const cb of pendingRef.current.values()) cb({ error: "CLI offline" });
      pendingRef.current.clear();
      for (const sub of jobSubsRef.current.values()) {
        sub({ stream: "done", exit_code: -1, line: "bridge disconnected" });
      }
      jobSubsRef.current.clear();
      reconnectRef.current = setTimeout(connect, 5000);
    };
  }, [enabled, url]);

  const call = useCallback((method, params = {}) => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error("CLI offline"));
        return;
      }
      const id = ++rpcId;
      pendingRef.current.set(id, resolve);
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      setTimeout(() => {
        if (pendingRef.current.has(id)) {
          pendingRef.current.delete(id);
          reject(new Error("CLI timeout"));
        }
      }, 8000);
    });
  }, []);

  /**
   * Run a long-lived mtkclient job and stream its output line-by-line.
   *
   *   runJob("mtk.frp_bypass", {}, (ev) => pushLog(ev.line))
   *     .then(exit_code => ...)
   */
  const runJob = useCallback((method, params, onEvent) => {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          const res = await call(method, params);
          if (!res?.job_id) {
            reject(new Error(res?.message || "job did not start"));
            return;
          }
          const jobId = res.job_id;
          jobSubsRef.current.set(jobId, (ev) => {
            try { onEvent?.(ev); } catch (err) { console.error("[cli-bridge] job onEvent callback threw:", err); }
            if (ev.stream === "done") {
              resolve(ev.exit_code);
            }
          });
        } catch (e) {
          reject(e);
        }
      })();
    });
  }, [call]);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return cleanup;
  }, [enabled, connect, cleanup]);

  return { status, info, lastEvent, call, runJob, enabled, url };
}
