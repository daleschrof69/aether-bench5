#!/usr/bin/env bash
# aether 0.4.0 — adds DFU state machine + payload bridge
set -euo pipefail

BIN=/usr/local/bin/aether
RULE=/etc/udev/rules.d/51-aether.rules
if [ "$EUID" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi
say() { printf '\033[32m[aether]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[aether]\033[0m %s\n' "$*" >&2; exit 1; }
command -v apt-get >/dev/null || die "needs apt"
[ "$(uname -s)" = Linux ] || die "needs Linux"

say "installing deps"
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq python3 python3-usb libirecovery-utils usbmuxd >/dev/null

say "udev rules"
$SUDO tee "$RULE" >/dev/null <<'RULE'
SUBSYSTEM=="usb", ATTR{idVendor}=="0e8d", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="05c6", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="05ac", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="12d1", MODE="0666", GROUP="plugdev"
RULE
$SUDO udevadm control --reload-rules && $SUDO udevadm trigger

say "fetching palera1n"
if ! command -v palera1n >/dev/null; then
  TMP=$(mktemp -d)
  if curl -fsSL -o "$TMP/p.deb" https://github.com/palera1n/palera1n/releases/latest/download/palera1n.deb 2>/dev/null; then
    $SUDO dpkg -i "$TMP/p.deb" >/dev/null 2>&1 || say "palera1n deb failed — install manually, pwn will still shell out if present"
  else
    say "palera1n download failed — pwn unavailable until installed"
  fi
  rm -rf "$TMP"
fi

say "installing $BIN"
$SUDO tee "$BIN" >/dev/null <<'PYEOF'
#!/usr/bin/env python3
"""aether — MTK BROM / Qualcomm Sahara / Apple DFU operator CLI."""
import argparse, os, shutil, struct, subprocess, sys, time

try:
    import usb.core, usb.util
except ImportError:
    sys.exit("pyusb missing: sudo apt install python3-usb")

VERSION = "0.4.0"
VIDS = {0x0E8D: "mtk", 0x05C6: "qcom", 0x05AC: "apple", 0x12D1: "hisi"}
PIDS = {(0x0E8D, 0x0003): "BROM", (0x0E8D, 0x2000): "PRELOADER",
        (0x05C6, 0x9008): "EDL", (0x05AC, 0x1227): "DFU", (0x05AC, 0x1281): "RECOVERY"}
OP = {"RD32": 0xD1, "WR32": 0xD3, "JUMP": 0xD5}
WDOG, WDOG_VAL = 0x10007000, 0x22000064
HW = {0x6765: "MT6765", 0x6768: "MT6768", 0x6833: "MT6833", 0x6853: "MT6853",
      0x6873: "MT6873", 0x6877: "MT6877", 0x6893: "MT6893", 0x6983: "MT6983", 0x6985: "MT6985"}

DFU = dict(DETACH=0x00, DNLOAD=0x01, UPLOAD=0x02, GETSTATUS=0x03, CLRSTATUS=0x04, ABORT=0x06)
DSTAT = {0: "OK", 1: "errTarget", 2: "errFile", 3: "errWrite", 4: "errErase", 5: "errCheckErased",
         6: "errProg", 7: "errVerify", 8: "errAddress", 9: "errNotDnload", 10: "errVendor",
         11: "errUsbr", 12: "errPor", 13: "errUnknown", 14: "errStalledPkt"}
DSTATE = {0: "appIDLE", 1: "appDETACH", 2: "dfuIDLE", 3: "dfuDNLOAD-SYNC", 4: "dfuDNBUSY",
          5: "dfuDNLOAD-IDLE", 6: "dfuMANIFEST-SYNC", 7: "dfuMANIFEST", 8: "dfuMANIFEST-WAIT-RESET",
          9: "dfuUPLOAD-IDLE", 10: "dfuERROR"}


class Err(Exception):
    def __init__(self, code, detail, exit_=60):
        super().__init__(detail)
        self.code, self.exit = code, exit_


class Trace:
    on = False

    @classmethod
    def show(cls, tag, data):
        if cls.on and data:
            print(f"    {tag} {bytes(data)[:32].hex(' ')}", file=sys.stderr)


class Link:
    def __init__(self, dev):
        self.dev = dev
        try:
            dev.set_configuration()
        except usb.core.USBError as e:
            raise Err("AETH-USB-002", f"cannot configure: {e}", 22) from e
        cfg = dev.get_active_configuration()
        iface = cfg[(0, 0)]
        self.ep_out = usb.util.find_descriptor(iface, custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_OUT)
        self.ep_in = usb.util.find_descriptor(iface, custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_IN)
        if not self.ep_out or not self.ep_in:
            raise Err("AETH-CAP-001", "no bulk pair on interface 0", 30)

    def write(self, d, timeout=4000):
        Trace.show("tx", d); self.ep_out.write(d, timeout)

    def read(self, n, timeout=4000):
        d = bytes(self.ep_in.read(n, timeout)); Trace.show("rx", d); return d


def find(vid=None, pid=None):
    kw = {}
    if vid: kw["idVendor"] = vid
    if pid: kw["idProduct"] = pid
    return [d for d in usb.core.find(find_all=True, **kw) if d.idVendor in VIDS]


class Brom:
    def __init__(self, link): self.link, self.sector, self.gpt = link, 512, []

    def handshake(self):
        for _ in range(6):
            try:
                self.link.write(b"\xa0", 1200)
                if self.link.read(1, 1200) == b"\x5f":
                    self.link.write(b"\x0a", 1200); self.kick(); return
            except usb.core.USBTimeoutError:
                continue
        raise Err("AETH-MOD-001", "BROM sync failed — hold vol+/vol- and re-plug", 25)

    def kick(self):
        try: self.write32(WDOG, WDOG_VAL)
        except Err: pass

    def _hdr(self, op, addr, size):
        return bytes([op]) + addr.to_bytes(4, "little") + size.to_bytes(4, "little")

    def _status(self):
        st = int.from_bytes(self.link.read(2), "little")
        if st:
            hint = " (SLA/DAA active — needs DA)" if st == 0x1F else ""
            raise Err("AETH-BRM-001", f"status {st:#06x}{hint}", 36)

    def read32(self, a):
        self.link.write(self._hdr(OP["RD32"], a, 4)); self._status()
        return int.from_bytes(self.link.read(4), "little")

    def write32(self, a, v):
        self.kick(); self.link.write(self._hdr(OP["WR32"], a, 4))
        self.link.write(v.to_bytes(4, "little")); self._status()

    def xread(self, a, size):
        out = bytearray()
        while len(out) < size:
            n = min(4, size - len(out))
            self.link.write(self._hdr(OP["RD32"], a + len(out), 4)); self._status()
            out += self.link.read(n)
        return bytes(out)

    def xwrite(self, a, data):
        off = 0
        while off < len(data):
            n = min(4, len(data) - off)
            self.kick(); self.link.write(self._hdr(OP["WR32"], a + off, 4))
            self.link.write(data[off:off + n]); self._status(); off += n

    def identify(self):
        hw = self.read32(0x08000000)
        return hw, HW.get(hw & 0xFFFF, f"MT{(hw & 0xFFFF):04X}")

    def gpt_read(self):
        hdr = self.xread(0x200, 92)
        if hdr[:8] != b"EFI PART":
            raise Err("AETH-DA-001", "no GPT signature at LBA1", 40)
        elba = int.from_bytes(hdr[72:76], "little")
        count = int.from_bytes(hdr[80:84], "little")
        esize = int.from_bytes(hdr[84:88], "little")
        if count > 128 or esize < 128:
            raise Err("AETH-DA-001", "implausible GPT geometry", 40)
        raw = self.xread(elba * self.sector, count * esize)
        self.gpt = []
        for i in range(count):
            e = raw[i * esize:(i + 1) * esize]
            name = e[56:128].decode("utf-16-le", "ignore").rstrip("\x00")
            if not name: continue
            start = int.from_bytes(e[32:36], "little")
            end = int.from_bytes(e[40:44], "little")
            self.gpt.append((name, start, (end - start + 1) * self.sector))
        return self.gpt

    def part(self, name):
        hit = next((p for p in self.gpt if p[0] == name), None) or next((p for p in self.gpt if p[0].startswith(name)), None)
        if not hit: raise Err("AETH-ART-001", f'partition "{name}" not in GPT', 48)
        return hit

    def zero(self, name, block=4096, yes=False):
        nm, start, size = self.part(name)
        print(f"  zeroing {nm} · {size} bytes @ {start * self.sector:#x}")
        if not yes: input("  enter to start, ^C to abort ")
        off, t0 = 0, time.time()
        while off < size:
            n = min(block, size - off)
            self.xwrite(start * self.sector + off, b"\x00" * n)
            off += n
            print(f"\r  {off * 100 // size:3d}%  {off}/{size}", end="", flush=True)
        print(f"\n  done in {time.time() - t0:.1f}s")

    def dump(self, name, path, block=8192):
        nm, start, size = self.part(name)
        with open(path, "wb") as fh:
            off = 0
            while off < size:
                n = min(block, size - off)
                fh.write(self.xread(start * self.sector + off, n)); off += n
                print(f"\r  {off * 100 // size:3d}%  {path}", end="", flush=True)
        print(f"\n  wrote {path} ({size} bytes)")

    def reset(self):
        try:
            self.write32(0x10007000, 0)
            self.link.write(bytes([OP["JUMP"]]) + (0).to_bytes(4, "little"))
        except Err: pass


# ---------- apple ----------
class Dfu:
    def __init__(self, dev):
        self.dev = dev

    def _in(self, req, val, n, timeout=3000):
        b = self.dev.ctrl_transfer(0xA1, req, val, 0, n, timeout=timeout)
        Trace.show("rx", bytes(b)); return bytes(b)

    def _out(self, req, val, data=None, timeout=3000):
        Trace.show("tx", data or b"")
        return self.dev.ctrl_transfer(0x21, req, val, 0, data, timeout=timeout)

    def status(self):
        raw = self._in(DFU["GETSTATUS"], 0, 6)
        if len(raw) < 6: raise Err("AETH-MOD-002", "short status block", 26)
        return raw[0], int.from_bytes(raw[1:4], "little"), raw[4]

    def wait_idle(self, timeout=8.0):
        end = time.time() + timeout
        while time.time() < end:
            st, poll, state = self.status()
            if st not in (0,): raise Err("AETH-MOD-002", f"DFU {DSTAT.get(st, st)}", 26)
            if state in (2, 5, 9): return state
            if state == 10: raise Err("AETH-MOD-002", "device entered dfuERROR — run `aether dfu --clrstatus`", 26)
            time.sleep(max(poll, 10) / 1000)
        raise Err("AETH-MOD-001", "device never returned to idle", 25)

    def ident(self):
        try: raw = self._in(DFU["UPLOAD"], 0, 0x100)
        except usb.core.USBError: raw = self._in(DFU["GETSTATUS"], 0, 0x100)
        if len(raw) < 20: raise Err("AETH-MOD-002", "short ident block", 26)
        return struct.unpack_from("<HHIIQ", raw)

    def upload(self, path, block=0x800):
        data = open(path, "rb").read()
        if not data: raise Err("AETH-CAP-001", "empty payload", 30)
        print(f"  DNLOAD {path} · {len(data)} bytes in {block}-byte blocks")
        blk, off = 0, 0
        while off < len(data):
            chunk = data[off:off + block]
            self._out(DFU["DNLOAD"], blk, chunk, 5000)
            self.wait_idle()
            off += len(chunk); blk += 1
            print(f"\r  {off * 100 // len(data):3d}%", end="", flush=True)
        self._out(DFU["DNLOAD"], blk, b"", 3000)
        print("\n  payload accepted")

    def detach(self, ms=1000):
        try: self._out(DFU["DETACH"], ms, None, 3000)
        except usb.core.USBError: pass
        print(f"  detach issued ({ms}ms) — device should re-enumerate")

    def abort(self):
        self._out(DFU["ABORT"], 0, None, 3000); print("  aborted")

    def clrstatus(self):
        self._out(DFU["CLRSTATUS"], 0, None, 3000); print("  status cleared")


def need_one(vid=None):
    devs = find(vid)
    if not devs:
        raise Err("AETH-USB-001", "no device — is it in BROM/EDL/DFU and is the udev rule loaded?", 20)
    if len(devs) > 1:
        raise Err("AETH-USB-002", f"{len(devs)} devices attached — unplug all but one", 22)
    return devs[0]


def brom_link():
    d = need_one(0x0E8D)
    return Brom(Link(d))


def dfu_dev():
    d = need_one(0x05AC)
    if d.idProduct == 0x1281:
        raise Err("AETH-MOD-002", "in recovery, not DFU — vol up, vol down, hold side 10s, then +vol down 5s", 26)
    if d.idProduct != 0x1227:
        raise Err("AETH-MOD-002", f"not DFU ({d.idProduct:#06x})", 26)
    return Dfu(d)


def run_stream(cmd, root=False):
    exe = cmd[0]
    if not shutil.which(exe):
        raise Err("AETH-CAP-001", f"{exe} not installed", 30)
    if root and os.geteuid() != 0: cmd = ["sudo"] + cmd
    print(f"  $ {' '.join(cmd)}")
    p = subprocess.Popen(cmd)
    rc = p.wait()
    if rc: raise Err("AETH-DA-001", f"{exe} exited {rc}", 40)
    return rc


# ---------- commands ----------
def c_doctor(a):
    print(f"aether {VERSION} — self test\n")
    checks = [("pyusb", lambda: usb.core.find(find_all=True) is not None),
              ("udev rule", lambda: os.path.exists("/etc/udev/rules.d/51-aether.rules")),
              ("irecovery", lambda: shutil.which("irecovery")),
              ("palera1n", lambda: shutil.which("palera1n")),
              ("usbmuxd", lambda: subprocess.run(["systemctl", "is-active", "--quiet", "usbmuxd"]).returncode == 0)]
    for label, fn in checks:
        try: print(f"  [ok]   {label}" if fn() else f"  [warn] {label}")
        except Exception as e: print(f"  [fail] {label}: {e}")
    devs = find()
    print(f"\n  devices: {len(devs)}")
    for d in devs:
        print(f"    {d.idVendor:04x}:{d.idProduct:04x}  {PIDS.get((d.idVendor, d.idProduct), '?')}")
    return 0


def c_scan(a):
    devs = find()
    if not devs: print("no matching devices"); return 1
    for d in devs:
        print(f"{d.idVendor:04x}:{d.idProduct:04x}  {PIDS.get((d.idVendor, d.idProduct), '?')}  bus {d.bus} addr {d.address}")
    return 0


def c_info(a):
    b = brom_link(); b.handshake()
    hw, soc = b.identify()
    print(f"  hw code {hw:#010x} → {soc}")
    return 0


def c_parts(a):
    b = brom_link(); b.handshake()
    for name, start, size in b.gpt_read():
        print(f"  {name:<20} @ {start * 512:#012x}  {size:>10} bytes")
    return 0


def c_frp(a):
    b = brom_link(); b.handshake(); b.gpt_read(); b.zero("frp", yes=a.yes); b.reset()
    print("  frp cleared — boot to system"); return 0


def c_persist(a):
    b = brom_link(); b.handshake(); b.gpt_read(); b.zero("persist", yes=a.yes); b.reset(); return 0


def c_dump(a):
    b = brom_link(); b.handshake(); b.gpt_read(); b.dump(a.partition, a.out); return 0


def c_edl(a):
    d = need_one(0x05C6)
    if d.idProduct != 0x9008: raise Err("AETH-MOD-002", "not in EDL (05c6:9008)", 26)
    link = Link(d)
    cmd, ln = struct.unpack_from("<II", link.read(8, 3000))
    if cmd != 0x01: raise Err("AETH-QCM-003", f"expected HELLO, got {cmd:#x}", 42)
    body = link.read(ln - 8, 3000)
    ver, _mn, _mx, mode = struct.unpack_from("<IIII", body, 0)
    link.write(struct.pack("<IIIIII", 0x02, 48, 2, min(ver, 2), 2, mode) + b"\x00" * 24)
    print(f"  hello ok · ver {ver} mode {mode}")
    p = link.read(8, 5000); cmd, ln = struct.unpack_from("<II", p)
    if cmd == 0x03:
        iid, off = struct.unpack_from("<II", link.read(ln - 8, 3000))
        print(f"  device requests programmer image_id {iid:#x} @ {off:#x}")
    return 0


def c_dfu(a):
    d = dfu_dev()
    if a.detach: d.detach(a.detach); return 0
    if a.abort: d.abort(); return 0
    if a.clrstatus: d.clrstatus(); return 0
    if a.status:
        st, poll, state = d.status()
        print(f"  bStatus {DSTAT.get(st, st)} · poll {poll}ms · state {DSTATE.get(state, state)}")
        return 0 if st == 0 else 1
    if a.upload:
        d.upload(a.upload, a.block); return 0
    bcd, _, cpid, bdid, ecid = d.ident()
    print(f"  bcd {bcd:#x} cpid {cpid:#x} bdid {bdid:#x} ecid {ecid:#x}")
    print(f"  soc T{cpid & 0xFFFF:04X}")
    if cpid >= 0x8012:
        print("  A12+ → BlackHound path; A11 and below → checkm8")
    return 0


def c_pwn(a):
    if a.boot: run_stream(["palera1n", "-l"], root=True)
    else: run_stream(["palera1n", "-D"], root=True)
    return 0


def c_ssh(a):
    port = str(a.port)
    if not a.cmd:
        print(f"  ssh -p {port} root@127.0.0.1"); return 0
    run_stream(["ssh", "-o", "StrictHostKeyChecking=no", "-p", port, "root@127.0.0.1"] + a.cmd, root=True)
    return 0


def c_irec(a):
    run_stream(["irecovery"] + a.args, root=True)
    return 0


def main():
    p = argparse.ArgumentParser(prog="aether", description=f"aether {VERSION}")
    p.add_argument("-t", "--trace", action="store_true")
    p.add_argument("-y", "--yes", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name, fn, hlp in [("doctor", c_doctor, "self test"), ("scan", c_scan, "list devices"),
                          ("info", c_info, "BROM chip id"), ("parts", c_parts, "read GPT"),
                          ("frp", c_frp, "zero frp"), ("persist", c_persist, "zero persist"),
                          ("edl", c_edl, "Sahara hello")]:
        s = sub.add_parser(name, help=hlp); s.set_defaults(fn=fn)
        if name in ("frp", "persist"): s.add_argument("-y", "--yes", action="store_true")

    d = sub.add_parser("dump", help="dump partition"); d.add_argument("partition"); d.add_argument("out"); d.set_defaults(fn=c_dump)

    f = sub.add_parser("dfu", help="DFU ident / control")
    f.add_argument("--detach", nargs="?", const=1000, type=int, metavar="MS")
    f.add_argument("--status", action="store_true")
    f.add_argument("--upload", metavar="FILE")
    f.add_argument("--block", type=lambda x: int(x, 0), default=0x800)
    f.add_argument("--abort", action="store_true")
    f.add_argument("--clrstatus", action="store_true")
    f.set_defaults(fn=c_dfu)

    w = sub.add_parser("pwn", help="checkm8 via palera1n")
    w.add_argument("-D", "--ramdisk", dest="rd", action="store_true", default=True)
    w.add_argument("--boot", action="store_true")
    w.set_defaults(fn=c_pwn)

    s2 = sub.add_parser("ssh", help="ramdisk shell"); s2.add_argument("-p", "--port", type=int, default=44)
    s2.add_argument("cmd", nargs="*"); s2.set_defaults(fn=c_ssh)

    i = sub.add_parser("irecovery", help="irecovery passthrough"); i.add_argument("args", nargs="*"); i.set_defaults(fn=c_irec)

    a = p.parse_args()
    Trace.on = a.trace
    try:
        return a.fn(a)
    except Err as e:
        print(f"\n  {e.code}  {e}\n", file=sys.stderr); return e.exit
    except KeyboardInterrupt:
        print("\n  aborted"); return 130
    except usb.core.USBError as e:
        print(f"\n  AETH-USB-001  {e}\n  check cable, udev rule, and that nothing else holds the device\n", file=sys.stderr)
        return 20


if __name__ == "__main__":
    sys.exit(main())
PYEOF

$SUDO chmod 0755 "$BIN"
say "self test"
"$BIN" doctor || true
cat <<'DONE'

  aether 0.4.0 installed.

  apple flow:
    aether scan                    expect 05ac:1227
    aether dfu                     ident (cpid/ecid)
    aether dfu --status            bStatus + state
    aether dfu --upload p.bin      raw DNLOAD
    aether dfu --detach            leave DFU
    aether dfu --clrstatus         recover from dfuERROR

    aether pwn                     checkm8 + ramdisk (palera1n)
    aether ssh                     prints the port
    aether ssh -p 44 "ls /mnt1"    command on ramdisk

DONE