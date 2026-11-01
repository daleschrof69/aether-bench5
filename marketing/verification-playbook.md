# Aether Repair Suite — Verification Playbook

**Purpose**: Take Aether from "impressive-looking mockup" to "verified real operation on real hardware" — the single biggest conversion lever left on the roadmap.

> ⚠️ **This work cannot be done in the cloud container** — no USB access. It must be done on a physical Windows 11 (or Linux) workbench with real target devices.

---

## Why this matters

Right now the dashboard is powered by mock data when the local CLI bridge is offline. The web preview shows a beautiful UI but simulated device detection and simulated action logs. **A repair shop owner will spot this in 30 seconds and bounce.**

One video of *one real operation on one real device* is worth more than every UI polish combined.

---

## Hardware bill of materials (~$180 total)

| Item | Est. cost | Notes |
|---|---|---|
| **Redmi Note 12 (unlocked, MTK Helio G88)** | ~$110 used | Best test device — cheap, popular, FRP-lockable |
| **USB-C data cable, short (≤ 1 m)** | ~$8 | Signal integrity matters at BROM |
| **USB 2.0 hub (powered)** | ~$20 | Some laptops don't provide enough current at BROM |
| **Windows 11 laptop or spare Windows install** | already have | Windows is the biggest FRP demo audience |
| **OBS Studio** | free | Screen + webcam capture for the demo video |

## Software prerequisites

- Python 3.11+ installed
- `mtkclient` cloned + working (`pip install mtkclient`)
- Aether desktop native app installed (`.msi` from Releases)
- Aether CLI (`aether-cli.exe`) on PATH
- Real Aether account with Founding Builder license or > 50 credits

---

## Verification steps

### Step 1 — Prove the CLI bridge lights up

1. Open cmd/PowerShell → `aether-cli serve`
2. Should see: `listening on ws://127.0.0.1:8765`
3. Open the Aether desktop app OR web dashboard
4. Look at the status bar (bottom-left): should switch from `CLI · offline` to `CLI · live v0.1.0` (green dot)
5. Look at the top of the dashboard: **Demo Mode banner should auto-hide**

✅ **Gate**: if this step doesn't work, stop. Fix the CLI bridge before touching devices.

### Step 2 — Prove real device detection

1. Power off the Redmi Note 12
2. Hold **Vol-** and plug USB-C into the laptop
3. Windows will detect a `MediaTek PreLoader USB VCOM Port (COMx)`
4. The Aether dashboard **DeviceStatus** panel should switch:
   - `Ready to scan` → `Device detected · COMx` (green pulse)
   - Model line reads `POCO M5 (Redmi Note 12) · Xiaomi · MediaTek platform`

✅ **Gate**: if the dashboard doesn't detect the real device automatically, the WebUSB filter or CLI bridge probe is broken. Fix before step 3.

### Step 3 — Prove one real FRP operation end-to-end

**Prerequisites**: device is genuinely FRP-locked (add a Google account, factory-reset, hit the sync-screen).

1. From the dashboard MTK service tab, click **`BYPASS FRP`**
2. Confirm the credit charge dialog (`-15 CR` for a real op)
3. Watch the Console panel — every log line should be a **real** `mtkclient` output line, not a template
   - `[BROM] handshake DA_v6 ... OK`
   - `[DA] switching to DA mode ... OK`
   - `[FRP] locating partition ... offset 0x480000`
   - `[FRP] writing zero-fill ... 512 bytes ok`
   - `[FRP] partition zeroed. rebooting ...`
4. Device should reboot on its own within 10 seconds
5. **The FRP-lock screen should be gone** — go straight to setup wizard

✅ **Gate**: if the device is still FRP-locked, the operation didn't actually run. Check that `runAction` in `AppContext.jsx` truly took the CLI-bridge path (not the mock `ACTION_LOG_TEMPLATES` fallback).

### Step 4 — Prove idempotency + safety

1. Repeat step 3 on the same device (already unlocked)
2. Operation should complete without side-effects — no bootloop, no data wipe, no partition corruption
3. Try step 3 with the wrong device (e.g., a Samsung in Odin mode) — Aether should **refuse** with a clear "Wrong platform" warning, not attempt the operation

✅ **Gate**: if either safety check fails, put a hold on public launch until fixed.

### Step 5 — Record the demo video

Follow `youtube-demo-script.md` — same laptop, same device, one continuous take from `aether-cli serve` all the way to unlocked home screen.

---

## Bug playbook (what usually breaks)

| Symptom | Likely cause | Where to look |
|---|---|---|
| CLI bridge shows offline | Firewall blocked port 8765 | Windows Defender / macOS gatekeeper |
| Device not detected | Wrong USB port (must be USB-2 for BROM on some MTK) | Try rear USB-A + hub |
| Detected but wrong model | Signature catalog missing entry | `/app/frontend/src/lib/usbSignatures.js` |
| FRP op errors "not authenticated" | mtkclient auth key file missing | `~/.mtkclient/auth.txt` |
| Op runs but device unchanged | Actually took the mock path | Add a `console.log("BRIDGE PATH")` in `runAction` — verify not "DEMO PATH" |
| Op runs correctly but no credit deducted | Backend `_grant_purchase` not called on `operation.success` webhook | Check MongoDB `user_ops` collection |

---

## After successful verification

1. **Immediately** post the demo video on:
   - YouTube (main)
   - GSM-Forum (thread as replies with `[VIDEO]` prefix)
   - Aether Docs page (embed inside the "Getting Started · MTK FRP" doc)
2. **Update the landing page hero**: replace mock GIF with the real demo video
3. **Add a "Verified operation" badge** on the ActionGrid button — a small green checkmark next to any operation that has a public verification video
4. **Notify all beta signups** by email: "Aether just performed its first real operation — [VIDEO LINK] — your credits are ready to use"

## Repeat for the next 4 operations (in this priority order)

1. ~~MTK FRP bypass~~ ← above
2. Qualcomm EDL Sahara login + partition dump (Xiaomi 11T Pro)
3. Samsung Knox reset (Galaxy A24)
4. Apple DFU verify (iPhone 8 — checkm8-vulnerable)
5. IMEI repair (any dual-SIM MTK — this is the highest-margin operation for a real shop)

**Each verified operation** = one demo video = one more thread on GSM-Forum = one more revenue channel unlocked. Ship one per week for 5 weeks and you have your first real cohort of paying users.
