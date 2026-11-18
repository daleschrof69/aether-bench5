import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useCliBridge } from "./useCliBridge";

class Socket {
  static OPEN = 1;
  static instances = [];
  constructor(url) { this.url = url; this.readyState = 0; Socket.instances.push(this); }
  send = jest.fn();
  close = jest.fn(() => { this.readyState = 3; this.onclose?.(); });
  open() { this.readyState = 1; this.onopen?.(); }
  message(payload) { this.onmessage?.({ data: JSON.stringify(payload) }); }
}

let root, bridge, previousSocket;
function Harness() { bridge = useCliBridge(); return null; }
function respond(socket, result) {
  const req = JSON.parse(socket.send.mock.calls.at(-1)[0]);
  socket.message({ id: req.id, result });
}
beforeEach(() => {
  jest.useFakeTimers();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  previousSocket = global.WebSocket;
  global.WebSocket = Socket;
  Socket.instances = [];
  localStorage.clear();
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
  global.WebSocket = previousSocket;
  delete window.__AETHER_DESKTOP__;
});
function connect() {
  const socket = Socket.instances.at(-1);
  act(() => { socket.open(); respond(socket, { version: "test" }); });
  return socket;
}
test("unmount closes the connection without reconnecting", () => {
  const socket = connect();
  act(() => root.unmount());
  root = { unmount() {} };
  act(() => jest.advanceTimersByTime(30000));
  expect(socket.close).toHaveBeenCalledTimes(1);
  expect(Socket.instances).toHaveLength(1);
});
test("disconnect settles pending requests and active jobs", async () => {
  const socket = connect();
  const onEvent = jest.fn();
  let job;
  await act(async () => { job = bridge.runJob("read", {}, onEvent); respond(socket, { job_id: "job" }); });
  const pending = bridge.call("status").catch(e => e.message);
  act(() => socket.close());
  await expect(pending).resolves.toBe("CLI offline");
  await expect(job).resolves.toBe(-1);
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({stream: "done", exit_code: -1}));
});
test("early completion is delivered once and removed from subscribers", async () => {
  const socket = connect();
  const onEvent = jest.fn();
  let job;
  await act(async () => {
    job = bridge.runJob("read", {}, onEvent);
    respond(socket, { job_id: "early" });
    socket.message({ method: "event", params: { job_id: "early", stream: "done", exit_code: 0 } });
  });
  await expect(job).resolves.toBe(0);
  act(() => socket.close());
  expect(onEvent).toHaveBeenCalledTimes(1);
});
test("a silent server times out an RPC", async () => {
  connect();
  const result = bridge.call("status").catch(e => e.message);
  act(() => jest.advanceTimersByTime(20000));
  await expect(result).resolves.toBe("CLI timeout");
});
test("a missing handshake response closes and retries the connection", () => {
  const socket = Socket.instances[0];
  act(() => socket.open());
  act(() => jest.advanceTimersByTime(20000));
  expect(socket.close).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(5000));
  expect(Socket.instances).toHaveLength(2);
});
test("stale socket events cannot close the replacement connection", () => {
  const old = connect();
  const staleClose = old.onclose;
  act(() => old.close());
  act(() => jest.advanceTimersByTime(5000));
  connect();
  act(() => staleClose());
  expect(bridge.status).toBe("connected");
});

test("unmount rejects outstanding requests immediately", async () => {
  connect();
  const pending = bridge.call("status").catch(e => e.message);
  act(() => root.unmount());
  root = { unmount() {} };
  await expect(pending).resolves.toBe("CLI offline");
});
test("malformed messages do not prevent the next response", async () => {
  const socket = connect();
  const result = bridge.call("status");
  act(() => { socket.message(null); socket.onmessage({ data: "invalid" }); respond(socket, { ok: true }); });
  await expect(result).resolves.toEqual({ ok: true });
});


test("desktop uses the launcher bridge credential instead of a saved address", () => {
  localStorage.setItem("aether.bridge", "ws://old-machine:8765");
  window.__AETHER_DESKTOP__ = { bridgeUrl: "ws://127.0.0.1:12345/?token=synthetic" };
  act(() => root.render(<Harness />));
  expect(Socket.instances.at(-1).url).toBe(window.__AETHER_DESKTOP__.bridgeUrl);
});
