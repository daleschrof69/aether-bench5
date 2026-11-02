#!/usr/bin/env python3
"""swclone — Smart Switch transport used by Aether.

The source drop (Downloads/file-vpn.py) ends inside `_tool()`, before any
Loke/Odin flash path. This module keeps the parts that were complete:

  1. FUS transport — firmware lookup, parallel fetch, AES decrypt
  2. ADB data plane — contacts, SMS, call log, calendar, media paths, APKs

Flashing stays on Heimdall (`aether-cli samsung-factory-reset` and the
Samsung page). This file does not invent an emergency-init bypass.

Requires: adb on PATH for `pull`, and pycryptodome or cryptography for
`decrypt` (cryptography is already in backend/requirements.txt).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import re
import shlex
import subprocess
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

VERSION = "0.1.0"
# Form posts to the old icc.eu name no longer resolve. The sslcs host answers
# the legacy form body with HTTP 500. Version lookup uses the firmware catalog.
FUS_HOSTS = (
    "https://neofussvr.sslcs.cdngc.net",
)
FOTA_VERSION = "https://fota-cloud-dn.ospserver.net/firmware"
UA = "SMART_SWITCH_PC/4.3.23062_7"
PEPPER = "h0oxr3s1"
CHUNK = 1 << 20


def _aes_cbc(key: bytes, iv: bytes):
    try:
        from Crypto.Cipher import AES
        return AES.new(key, AES.MODE_CBC, iv).decrypt
    except ImportError:
        pass
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        d = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
        return d.update
    except ImportError:
        sys.exit("need pycryptodome or cryptography: pip install pycryptodome")


def adb(*args, serial=None, binary=False, check=True, timeout=1800):
    cmd = ["adb"] + (["-s", serial] if serial else []) + list(args)
    p = subprocess.run(cmd, capture_output=True, timeout=timeout)
    if check and p.returncode:
        raise RuntimeError(p.stderr.decode("utf-8", "replace").strip() or f"adb {args[0]} failed")
    return p.stdout if binary else p.stdout.decode("utf-8", "replace")


def devices():
    return [line.split("\t")[0] for line in adb("devices").splitlines()[1:] if "\tdevice" in line]


_FIELD = re.compile(r",\s*(?=[a-zA-Z_][a-zA-Z0-9_]*=)")

DATASETS = {
    "sms": ("content://sms",
            ["address", "date", "date_sent", "type", "body", "read", "status"]),
    "calllog": ("content://call_log/calls",
                ["number", "date", "duration", "type", "name", "new"]),
    "contacts": ("content://com.android.contacts/data",
                 ["raw_contact_id", "mimetype", "data1", "data2", "data3", "data4"]),
    "calendar": ("content://com.android.calendar/events",
                 ["calendar_id", "title", "dtstart", "dtend", "allDay", "eventTimezone"]),
}


def query(name, serial=None, limit=None):
    uri, proj = DATASETS[name]
    if limit:
        uri = f"{uri}?limit={limit}"
    raw = adb("shell", f"content query --uri {shlex.quote(uri)} "
                       f"--projection {':'.join(proj)}", serial=serial, check=False)
    for line in raw.splitlines():
        if not line.startswith("Row:"):
            continue
        payload = line.partition(" ")[2]
        rec = {}
        for chunk in _FIELD.split(payload):
            k, _, v = chunk.partition("=")
            rec[k.strip()] = v
        yield rec


def media_paths(serial=None):
    out = []
    for bucket in ("images", "video", "audio"):
        raw = adb("shell", f"content query --uri content://media/external/{bucket}/media "
                           f"--projection _data", serial=serial, check=False)
        for line in raw.splitlines():
            if "_data=" in line:
                out.append(line.split("_data=", 1)[1].strip())
    return out


def apk_map(serial=None):
    found = {}
    for line in adb("shell", "pm list packages -3", serial=serial, check=False).splitlines():
        pkg = line.removeprefix("package:").strip()
        if not pkg:
            continue
        for path in adb("shell", f"pm path {pkg}", serial=serial, check=False).splitlines():
            if path.startswith("package:"):
                found.setdefault(pkg, []).append(path.removeprefix("package:").strip())
    return found


def _post(path, fields):
    body = urllib.parse.urlencode(fields).encode()
    errors = []
    for base in FUS_HOSTS:
        req = urllib.request.Request(
            base + path,
            data=body,
            headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded"},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                return response.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            detail = exc.read(180).decode("utf-8", "replace").strip()
            errors.append(f"{base} HTTP {exc.code} {detail}")
        except (OSError, urllib.error.URLError) as exc:
            errors.append(f"{base} {exc}")
    raise RuntimeError("FUS request failed: " + "; ".join(errors))


def _tag(xml, tag):
    match = re.search(rf"<{tag}>(.*?)</{tag}>", xml, re.S)
    return match.group(1) if match else None


def gen_imei(seed=None):
    rnd = random.Random(seed)
    body = "".join(str(rnd.randint(0, 9)) for _ in range(14))
    total = sum(int(d) * (2 if i % 2 else 1) for i, d in enumerate(body))
    total += sum(int(d) for i, d in enumerate(body) if i % 2)
    return body + str((10 - total % 10) % 10)


def fus_inform(model, csc, imei):
    # `imei` remains in the signature for the CLI. The public catalog is keyed
    # by model and CSC. Samsung rejects the old form-encoded inform body.
    _ = imei
    url = f"{FOTA_VERSION}/{urllib.parse.quote(csc, safe='')}/{urllib.parse.quote(model, safe='')}/version.xml"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            xml = response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        detail = exc.read(180).decode("utf-8", "replace").strip()
        raise RuntimeError(f"firmware catalog HTTP {exc.code} for {model}/{csc}: {detail}") from exc
    except (OSError, urllib.error.URLError) as exc:
        raise RuntimeError(f"firmware catalog failed for {model}/{csc}: {exc}") from exc
    found = re.search(r"<latest\b[^>]*>(.*?)</latest>", xml, re.S)
    latest = found.group(1).strip() if found else ""
    if not latest:
        raise RuntimeError(f"no firmware for {model}/{csc}")
    size = 0
    sized = re.search(rf"fwsize='(\d+)'>\s*{re.escape(latest)}\s*</value>", xml)
    if sized:
        size = int(sized.group(1))
    return latest, url, size


def fus_nonce(url):
    xml = _post("/NF_DownloadBinaryInitForMass.do",
                {"BINARY_FILE_NAME": url.rsplit("/", 1)[-1]})
    nonce = _tag(xml, "NONCE")
    if not nonce:
        raise RuntimeError("BinaryInit returned no nonce")
    return nonce


def fetch(url, dest: Path, size=0, workers=8):
    """Parallel ranged fetch. FUS throttles per connection, not globally."""
    part = dest.with_suffix(".part")
    if size <= 0:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req) as response:
            size = int(response.headers["Content-Length"])

    seg = size // workers + 1
    lock = threading.Lock()
    done = [0]

    def grab(i):
        lo, hi = i * seg, min(size, (i + 1) * seg) - 1
        if lo > hi:
            return
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Range": f"bytes={lo}-{hi}"})
        with urllib.request.urlopen(req, timeout=120) as response, open(f"{part}.{i}", "wb") as fh:
            while chunk := response.read(CHUNK):
                fh.write(chunk)
                with lock:
                    done[0] += len(chunk)
                    pct = done[0] * 100 // size
                    print(f"\r  {pct:3d}%  {done[0] >> 20}/{size >> 20} MiB", end="", flush=True)

    with ThreadPoolExecutor(workers) as pool:
        list(pool.map(grab, range(workers)))

    with open(part, "wb") as out:
        for i in range(workers):
            piece = Path(f"{part}.{i}")
            if piece.exists():
                out.write(piece.read_bytes())
                piece.unlink()
    print()
    part.replace(dest)
    return dest


def decrypt(src: Path, dst: Path, nonce: str):
    """Key = md5(nonce + pepper)[:16], AES-CBC/zero-IV, strip 0x64 header + CRC32."""
    key = hashlib.md5((nonce + PEPPER).encode()).digest()[:16]
    dec = _aes_cbc(key, b"\x00" * 16)
    tail = b""
    with open(src, "rb") as fi, open(dst, "wb") as fo:
        first = True
        while chunk := fi.read(CHUNK * 4):
            data = dec(chunk)
            if first:
                data, first = data[0x64:], False
            if tail:
                data = tail + data
            tail, data = data[-16:], data[:-16]
            fo.write(data)
    return dst


def _emit(payload):
    print(json.dumps(payload, indent=2))


def _cmd_devices(_args):
    found = devices()
    _emit({"devices": found, "count": len(found)})
    if not found:
        print("no adb device in 'device' state — enable USB debugging and accept the prompt", file=sys.stderr)


def _cmd_inform(args):
    imei = args.imei or gen_imei(args.seed)
    version, url, size = fus_inform(args.model, args.csc, imei)
    _emit({
        "model": args.model,
        "csc": args.csc,
        "version": version,
        "url": url,
        "bytes": size,
    })


def _cmd_fetch(args):
    dest = args.dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    fetch(args.url, dest, workers=args.workers)
    nonce = args.nonce
    if args.decrypt:
        nonce = nonce or fus_nonce(args.url)
        plain = dest.with_suffix(dest.suffix + ".dec")
        decrypt(dest, plain, nonce)
        _emit({"encrypted": str(dest), "decrypted": str(plain), "nonce": nonce})
    else:
        _emit({"saved": str(dest), "bytes": dest.stat().st_size})


def _cmd_decrypt(args):
    decrypt(args.src, args.dst, args.nonce)
    _emit({"decrypted": str(args.dst), "bytes": args.dst.stat().st_size})


def _cmd_pull(args):
    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    names = [n.strip() for n in args.datasets.split(",") if n.strip()]
    summary = {"out": str(out), "serial": args.serial}
    for name in names:
        if name not in DATASETS:
            raise SystemExit(f"unknown dataset {name}; choose from {', '.join(DATASETS)}")
        rows = list(query(name, serial=args.serial, limit=args.limit))
        (out / f"{name}.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
        summary[name] = len(rows)
        print(f"  {name}: {len(rows)} rows", flush=True)
    if args.media:
        paths = media_paths(serial=args.serial)
        (out / "media.txt").write_text("\n".join(paths), encoding="utf-8")
        summary["media"] = len(paths)
        print(f"  media paths: {len(paths)}", flush=True)
    if args.apks:
        mapping = apk_map(serial=args.serial)
        (out / "apks.json").write_text(json.dumps(mapping, indent=2), encoding="utf-8")
        summary["apks"] = len(mapping)
        print(f"  user apks: {len(mapping)}", flush=True)
    _emit(summary)


def build_parser():
    parser = argparse.ArgumentParser(
        prog="swclone",
        description="Aether Smart Switch transport (FUS download + ADB backup). Firmware flash uses Heimdall.",
    )
    parser.add_argument("--version", action="version", version=VERSION)
    sub = parser.add_subparsers(dest="cmd", required=True)

    devices_cmd = sub.add_parser("devices", help="list adb devices in the 'device' state")
    devices_cmd.set_defaults(func=_cmd_devices)

    inform = sub.add_parser("inform", help="ask Samsung FUS for the latest firmware for a model/CSC")
    inform.add_argument("--model", required=True, help="model, e.g. SM-G973F")
    inform.add_argument("--csc", required=True, help="sales code, e.g. XEF")
    inform.add_argument("--imei", help="15-digit IMEI; generated when omitted")
    inform.add_argument("--seed", type=int, help="seed for the generated IMEI")
    inform.set_defaults(func=_cmd_inform)

    fetch_cmd = sub.add_parser("fetch", help="download a FUS binary")
    fetch_cmd.add_argument("--url", required=True)
    fetch_cmd.add_argument("--dest", type=Path, required=True)
    fetch_cmd.add_argument("--workers", type=int, default=8)
    fetch_cmd.add_argument("--decrypt", action="store_true", help="also AES-decrypt with the FUS nonce")
    fetch_cmd.add_argument("--nonce", help="nonce from BinaryInit; fetched when --decrypt and omitted")
    fetch_cmd.set_defaults(func=_cmd_fetch)

    decrypt_cmd = sub.add_parser("decrypt", help="decrypt a firmware blob already on disk")
    decrypt_cmd.add_argument("--src", type=Path, required=True)
    decrypt_cmd.add_argument("--dst", type=Path, required=True)
    decrypt_cmd.add_argument("--nonce", required=True)
    decrypt_cmd.set_defaults(func=_cmd_decrypt)

    pull = sub.add_parser("pull", help="export contacts/SMS/call log/calendar over an authorized adb session")
    pull.add_argument("--out", type=Path, required=True)
    pull.add_argument("--serial")
    pull.add_argument("--datasets", default="sms,calllog,contacts,calendar")
    pull.add_argument("--limit", type=int)
    pull.add_argument("--media", action="store_true", help="also write on-device media paths")
    pull.add_argument("--apks", action="store_true", help="also write user-installed APK paths")
    pull.set_defaults(func=_cmd_pull)
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        args.func(args)
    except (RuntimeError, OSError, urllib.error.URLError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
