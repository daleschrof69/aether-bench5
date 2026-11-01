# NOTICE — Third-party software

Aether CLI shells out to the following open-source tools as **separate processes**
(no source or binary linkage). They remain under their original licenses.

## mtkclient

- **Source:** https://github.com/bkerler/mtkclient
- **License:** GPL-3.0
- **How Aether uses it:** Aether CLI invokes `python -m mtkclient` as a
  subprocess and streams its stdout/stderr to the user. No mtkclient code is
  embedded, linked, or modified by Aether.
- **GPL-3.0 § 0 (definitions)** — "modify" includes copying and adapting code.
  Calling a program via subprocess (`exec`/`fork`) is **mere aggregation** and
  does NOT create a combined work under the GPL. See the FSF's guidance:
  https://www.gnu.org/licenses/gpl-faq.html#MereAggregation
- Users must install mtkclient themselves on first launch via
  `aether-cli setup` (runs `pip install --user mtkclient`).
- Full license text: https://www.gnu.org/licenses/gpl-3.0.txt

## Heimdall (Samsung Odin clone)

- **Source:** https://gitlab.com/BenjaminDobell/Heimdall
- **License:** LGPL-3.0
- **How Aether uses it:** Aether CLI invokes the `heimdall` binary as a
  subprocess (for `samsung.detect`, `samsung.read_pit`, `samsung.factory_reset`,
  and partition erase). No Heimdall code is embedded, linked, or modified.
- Subprocess invocation is **mere aggregation** under both GPL and LGPL — see
  the same FSF guidance linked above.
- Users must install Heimdall themselves:
  - Windows: https://glassechidna.com.au/heimdall/ (run the .msi, reboot, then
    bind the libusbK driver via Zadig)
  - macOS: `brew install heimdall`
  - Linux: `sudo apt install heimdall-flash`
- Known limitations (Knox-imposed): Heimdall writes succeed on Galaxy S9 /
  Note 9 / older A-series. Newer Knox 3.x devices (S10+) often reject
  partition writes without Samsung-signed firmware. See `/app/aether-cli/src/heimdall.rs`.

## edlclient (Qualcomm Sahara/Firehose)

- **Source:** https://github.com/bkerler/edl
- **License:** MIT
- **How Aether uses it:** Aether CLI invokes the `edl` command (installed via
  `pip install --user edlclient`) as a subprocess for `qualcomm.read_info`,
  `qualcomm.edl_auth_unlock`, `qualcomm.cert_repair` and `qualcomm.safe_format`.
  No edlclient code is embedded, linked, or modified.
- Firehose operations need the correct signed loader (programmer) for the SoC.
  edlclient bundles a large loader database; OEM-locked (Secure Boot fused)
  devices require an OEM-signed loader that Aether does not ship, and edl
  reports a Sahara/auth error on those. See `/app/aether-cli/src/qualcomm.rs`.

## gaster (checkm8)

- **Source:** https://github.com/0x7ff/gaster
- **License:** BSD-3-Clause
- **How Aether uses it:** Aether CLI invokes the `gaster` binary as a subprocess
  (`gaster pwn`) to run the checkm8 BootROM exploit for `apple.pwn_dfu`. No
  gaster code is embedded, linked, or modified.
- checkm8 covers A5–A11 SoCs only (iPhone 5s … iPhone X). A12+ are not
  exploitable. Pwned-DFU is the entry point; a full activation-lock / Hello
  removal ramdisk workflow is NOT bundled. See `/app/aether-cli/src/apple.rs`.

## libimobiledevice / irecovery

- **Source:** https://github.com/libimobiledevice/libimobiledevice
- **License:** LGPL-2.1
- **How Aether uses it:** Aether CLI invokes the `irecovery` binary as a
  subprocess (`irecovery -q`) to read device info in Recovery/DFU for
  `apple.read_info`. No libimobiledevice code is embedded, linked, or modified.

---

## Legal — IMEI changes

Modifying a device's IMEI is **illegal** in many jurisdictions (United States,
United Kingdom, European Union, India, Australia, and others). Aether's
`repair-imei` subcommand is intended only for legitimate device-repair
scenarios — **restoring the OEM-printed IMEI back to a device that lost it
after a firmware flash, motherboard swap, or partition wipe.**

By using this feature you confirm:
1. You are a licensed mobile repair technician.
2. The IMEI you are writing matches the OEM-printed IMEI on the device's
   physical sticker (under the battery, on the SIM tray, or on the back
   panel).
3. You are not changing the IMEI to evade theft tracking, blacklist
   enforcement, or carrier locks.

Aether logs every IMEI-write operation with timestamp + device serial +
user account for audit purposes.

---

## Legal — Bootloader unlock & FRP bypass

These operations void manufacturer warranty and may violate carrier contracts.
The "bypass FRP" operation specifically should only be used by licensed
repair technicians servicing devices for verified owners (proof of purchase,
device serial matches purchase record, etc.). Aether does not provide tools
for bypassing locks on stolen devices.

---

## Trademarks

- "MediaTek" and "MTK" are trademarks of MediaTek Inc. Aether is not affiliated.
- "Qualcomm" and "Snapdragon" are trademarks of Qualcomm Incorporated. Aether is not affiliated.
- "Apple", "iPhone", and "DFU" are trademarks of Apple Inc. Aether is not affiliated.
- "Samsung" and "Knox Guard" are trademarks of Samsung Electronics. Aether is not affiliated.
