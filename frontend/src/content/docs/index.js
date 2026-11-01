const samsungKg = `# Samsung KG Suspend — Carrier Lock Bypass

> **Audience:** Licensed Samsung repair technicians.
> **Cost:** 15 credits per device.
> **Platforms supported:** Samsung Exynos 2200 → 2400, Snapdragon 8 Gen 1 → 3, Knox 3.7 → 3.9.

## Overview

Knox Guard (KG) is Samsung's enterprise device-locking framework. When a leased or financed device is delinquent, the carrier remotely sets the **KG flag** which boots the device into a permanent locked state. The Aether **KG Suspend** module sends a signed suspend token to the modem partition, instructing Knox to enter a maintenance state during which standard repairs (eMMC swap, IMEI restore, factory firmware flash) can be safely performed.

> ⚠️ Suspending KG does **not** remove the lock permanently. The device returns to its locked state on next factory reset unless an unrelated, properly licensed unlock token is also written.

---

## Prerequisites

1. **USB cable** — original Samsung or rated 1A+ data cable.
2. **Battery** — minimum 30% charge.
3. **Aether CLI / Suite** — version 4.6 or later.
4. **Account credits** — 15 available credits.
5. **Driver** — Samsung USB driver v1.7.x installed on host.

## Procedure

1. Connect the device in **Download Mode** (Vol- + Vol+ + Power, then plug USB while holding both volume keys).
2. Aether dashboard should detect: \`Samsung SM-XXXX · Knox 3.x · ONLINE\`.
3. Navigate to **Samsung Service → Carrier Lock → KG Suspend**.
4. Click **Suspend Knox Guard** and confirm.
5. Aether will:
   - Read the current Knox status flag
   - Verify hardware fingerprint vs Samsung ground-truth
   - Push the signed suspend token
   - Wait for handshake acknowledgement
6. The device will reboot to recovery. Boot to normal, complete factory setup, then proceed with intended repair.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| \`E_KNOX_REVOKED\` | Token revoked by Samsung. Open ticket with proof of ownership. |
| \`E_HW_MISMATCH\` | eMMC / SoC swap detected. Restore original hardware first. |
| \`E_USB_TIMEOUT\` | Try a different USB-A 2.0 port; avoid USB-C hubs. |

## Audit logging

Every KG Suspend operation is written to:

- Aether Logs (timestamped, exportable to \`.log\`)
- Local audit DB on host (\`~/.aether/audit.sqlite\`)

Keep these for at least 12 months in case of a Samsung enterprise audit.

## Related guides

- MTK BROM Aegis Unlock
- Qualcomm EDL IMEI Repair
`;

const mtkFrp = `# MTK BROM — Aegis Unlock

> **Audience:** Repair technicians servicing MediaTek devices.
> **Cost:** FREE — included in Solo Builder and above.
> **Platforms:** MT6580 → MT6985 (Dimensity 9300).

## Background

When a Google account is removed from an Android device using a non-standard process (e.g. factory reset before logout), the post-reset account guard flag is left active. The device boots, but blocks setup with a Google account prompt. Aether's MTK Aegis Unlock uses the **BROM (Boot ROM)** download mode to patch the guard flag without re-flashing the entire firmware.

## How it works

1. Aether sends a **Download Agent (DA)** signed payload to BROM over USB.
2. The DA gains direct eMMC access (read/write).
3. The target partition is located by scanning the GPT.
4. Bits in the guard flag are patched (no other data is touched).
5. The device reboots clean.

## Procedure

1. Power off the target device. Disconnect USB.
2. Hold **Vol-** (some models: Vol+), and plug the USB cable into the host.
3. Within 2 seconds Aether will detect: \`MediaTek BROM detected · MT6xxx\`.
4. Go to **MTK Service → Aegis Unlock**.
5. Click **Aegis Unlock**. The console will stream:
   \`\`\`
   [INFO]    Sending DA (Download Agent) to preloader...
   [INFO]    Reading partition table from emmc_user ...
   [INFO]    Locating frp partition @ 0x...
   [WARN]    Anti-rollback counter: 8 — proceeding read-only
   [INFO]    Patching post-reset protection flags ...
   [SUCCESS] Aegis Unlock complete. Reboot device to apply.
   \`\`\`
6. Unplug USB. Power on. Complete setup with no Google account prompt.

## Anti-rollback

Devices with \`anti-rollback counter >= 8\` require an upgraded DA. Aether automatically chooses the right DA — no manual configuration needed.

## Failure modes

- **\`E_DA_VERIFY_FAIL\`** — Host security suite is blocking BROM USB enumeration. Whitelist \`aether-cli.exe\` or run as administrator.
- **\`E_NO_BROM\`** — Device entered Preloader rather than BROM. Hold the opposite Vol key.

## Best practice

Always perform an \`adb backup\` of the customer's data **before** the operation. Aegis Unlock is non-destructive, but unrelated user data can be lost if the wrong DA fires.
`;

const qcImei = `# Qualcomm EDL — IMEI Repair

> **Audience:** Trained network-equipment technicians.
> **Cost:** 5 credits per device per IMEI written.
> **Platforms:** Snapdragon 660 → 8 Gen 3 (SDM660 → SM8650).
> **Protocols:** Sahara / Firehose v3.0 · QFIL · 9008.

## When to use

- Hardware NV partition corruption (after a failed flash)
- IMEI shows as \`000000000000000\` or \`null\` in \`*#06#\`
- Replacement of the modem chipset (rare)

> ⚠️ Writing an IMEI that does not match the original-equipment label is illegal in most jurisdictions. Always verify ownership and original IMEI via box / receipt before proceeding.

## Procedure

1. Boot the target device into **EDL 9008 mode** — methods vary by OEM:
   - Xiaomi / POCO: Hold Vol- + Vol+ + Power for ~10 seconds while USB is connected.
   - Realme / Oppo: Use a deep-flash cable, or short test points.
   - Samsung: Not applicable — use Download Mode + Odin instead.
2. Aether dashboard: \`Qualcomm EDL 9008 detected · SMxxxx\` should appear.
3. Open **Qualcomm Service → Repair IMEI**.
4. Enter the **original IMEI** (and IMEI2 for dual-SIM). Aether validates the Luhn checksum live.
5. Click **Repair IMEI**. Console output:
   \`\`\`
   [INFO]    Reading current IMEI from NV partition ...
   [INFO]    Backing up md1img → /backup/md1img_<ts>.bin
   [INFO]    Calculating Luhn checksum ...
   [INFO]    Writing IMEI1: ...
   [INFO]    Writing IMEI2: ...
   [SUCCESS] IMEI repair complete. Verify with *#06#
   \`\`\`
6. Reboot the device. Confirm with \`*#06#\`.

## Verification

Always confirm the dial-code result matches both IMEIs you intended to write. If \`*#06#\` shows \`null\` after reboot:

- The device may have NV-protection enabled (sometimes called *RPMB lock*) — see Aether Academy → "NV Unlock" guide.
- Some Snapdragon 8 Gen 3 devices require **Firehose v3.0+**. Update the Aether exploit DB via **Settings → Update**.

## Audit-trail

- All IMEI writes are logged with timestamp, operator account, original IMEI, and target IMEI.
- Exportable as \`.log\` via the **Logs → Export** view.

## Related guides

- MTK BROM Aegis Unlock
- Samsung KG Suspend
`;

export const DOCS = [
  {
    slug: "samsung-kg-suspend",
    title: "Samsung KG Suspend",
    summary: "Carrier-lock suspend procedure for Knox 3.7 → 3.9.",
    platform: "Samsung",
    minutes: 7,
    cost: "15 credits",
    body: samsungKg,
  },
  {
    slug: "mtk-brom-frp-bypass",
    title: "MTK BROM — Aegis Unlock",
    summary: "Patch the protection flag over BROM. Standard Aegis Unlock — included free.",
    platform: "MediaTek",
    minutes: 5,
    cost: "Free",
    body: mtkFrp,
  },
  {
    slug: "qualcomm-edl-imei-repair",
    title: "Qualcomm EDL — IMEI Repair",
    summary: "Restore the modem NV partition over Sahara/Firehose 9008.",
    platform: "Qualcomm",
    minutes: 8,
    cost: "5 credits",
    body: qcImei,
  },
];
