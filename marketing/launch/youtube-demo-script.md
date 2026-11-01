# Aether Repair Suite — YouTube Demo Script

**Video length target**: 3:30 — 4:00
**Framing**: "I built this. Let me show you it actually works." NOT a sales pitch.
**Recording setup**: OBS on your workbench, phone-camera on tripod for the device shot, screen capture at 60fps.

---

## Opening 10 seconds — the hook

**On-screen**: black terminal, cyber-green Aether logo boots. Voice-over cold, no music yet.

> "This is a fresh Redmi Note 12. Locked to a previous Google account. Standard FRP nightmare. Watch me unlock it in under a minute."

Cut hard to the device sitting on your bench, USB cable in hand.

## 0:10 — 0:35 — the plug-in shot

Voice-over over B-roll of:
1. Holding Vol- on the device
2. Plugging in USB
3. Camera pans to laptop — dashboard shows **`Searching...`** with a scanning-line animation

> "One binary. No Java. No dongle. The Aether Repair Suite runs on Windows 11, macOS on Apple Silicon, and Linux. Rust core, WebView2 UI, single 6-megabyte installer. Right now it just detected the device — MediaTek Helio G88 in BROM mode."

**Cut to screen closeup**: Dashboard shows `POCO M5 (Redmi Note 12)` with the green pulse. Zoom into the DeviceStatus panel.

## 0:35 — 1:00 — the "made by a solo human" moment

Voice-over:

> "I'm Braiden Barker. I've been fixing phones on the side for four years. I got tired of Chimera's Java installer eating itself every quarter, so I built this. It's beta — so if you find something broken tell me, I'll fix it same day."

**On-screen**: Show the Dashboard footer credit strip cycling: "Made by Braiden Barker" → "Trusted by 240+ repair shops" → "Cloud exploit DB last sync 3 min ago"

## 1:00 — 2:15 — the actual repair

Click **`BYPASS FRP`** in the MTK service tab.

**Voice-over during the operation** (streaming log in the background):

> "Fifteen credits, sixty cents worth of ops. Watch the log."
>
> [log streams] `[BROM] entering DA mode ... OK` / `[FRP] target partition = frp ... locating ... found offset 0x480000` / `[FRP] writing zero-fill ... 512 bytes written`
>
> "The whole operation is real. That's the actual `mtkclient` FRP zero-fill routine wrapped in a Rust CLI so it's auditable and static-linked. No 'run as administrator', no reg-hacks, no closed-source binary blob talking to a server in Russia."

**Cut to phone screen**: device reboots. FRP is gone. Zoom in on the "welcome" setup wizard.

## 2:15 — 2:45 — the "so what" moment

> "That took 47 seconds. On a fresh Windows 11 install with no drivers pre-installed — WinUSB signed drivers ship in the .msi. Nine dollars gets you 15 of these. Eighty-nine dollars gets you a year of unlimited Solo-tier operations."

**On-screen**: quick cut to the Pricing page — highlight the **`$9 Impulse pack`** first.

## 2:45 — 3:15 — the ask

> "This is the beta. There's a founding-builder lifetime license — three hundred bucks, first hundred buyers, includes credits and every future update. I need thirty people who'll actually use this and tell me what's broken. If you're one of them, link's in the description. If not, please just click 'like' so this reaches other shop owners."

## 3:15 — 3:30 — sign-off

> "I'm here in the comments. Aether Repair Suite dot com. Made by Braiden Barker. Peace."

**End-card**: your domain + a QR code that opens the download page. Ten seconds hold.

---

## Post-production notes

- **Music**: Start at 0:35 with a low synth pad (something like Kaipa Cain / Perturbator instrumental). Ramp at the FRP write. Cut at 3:15.
- **Text overlays**: Every log line the operation streams — repeat it as an on-screen chyron so mobile viewers watching muted still follow along.
- **Thumbnail**: Split screen. Left: locked FRP screen with red X. Right: home screen unlocked. Center: your terminal green **`+15 CR`**. Text: "Fresh Redmi. 47 seconds. $0.60."
- **Title**: `Bypassing FRP on a Redmi Note 12 in 47 seconds with a $9 tool I built (Aether Repair Suite)`
- **Description first two lines**: "Solo-dev alternative to Chimera / Octoplus / UnlockTool. Windows 11, macOS ARM, Linux. Download: [URL]. Founder discount (first 100 buyers): $299 lifetime instead of $89/year."
- **Tags**: `frp bypass 2026, redmi frp, mtk repair tool, chimera alternative, octoplus alternative, unlocktool alternative, mobile repair software, aether repair suite, gsm forum tools`

---

## Where to post the video after

1. YouTube (primary)
2. Embed in the GSM-Forum launch post
3. Twitter with a 45-second clip of just the operation
4. LinkedIn (yes, LinkedIn — B2B repair-shop owners are surprisingly active there)
5. TikTok with a vertical 60-second re-cut
6. DM to 5 named YouTubers: HugoTech, Rossmann, Phone Repair Guru, JerryRigEverything, JayzTwoCents. Not asking for a shoutout — just "hey, I built this, would you like a free lifetime license to try it?"

**One video, seven surfaces. Do this for every big feature you ship.**
