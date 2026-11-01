// Mock device generators for Aether Repair Tool
const MTK_DEVICES = [
  { model: "MT6895 (Dimensity 8100)", brand: "Xiaomi Redmi K50", android: "13", patch: "2024-08-05" },
  { model: "MT6983 (Dimensity 9000)", brand: "OPPO Find X5", android: "13", patch: "2024-09-01" },
  { model: "MT6789 (Helio G99)", brand: "Realme Narzo 60", android: "14", patch: "2024-11-05" },
  { model: "MT6781 (Helio G96)", brand: "Tecno Camon 19", android: "12", patch: "2024-04-01" },
  { model: "MT6877 (Dimensity 920)", brand: "Vivo V23 Pro", android: "13", patch: "2024-07-05" },
  { model: "MT6989 (Dimensity 9300+)", brand: "Vivo X100 Ultra", android: "14", patch: "2025-01-05" },
  { model: "MT6897 (Dimensity 8300)", brand: "Redmi Note 13 Pro+", android: "14", patch: "2024-12-01" },
  { model: "MT6878 (Dimensity 7400)", brand: "Realme Narzo 70 Pro", android: "14", patch: "2024-11-01" },
  { model: "MT6886 (Dimensity 7300X)", brand: "Honor Magic V2", android: "14", patch: "2024-10-05" },
  { model: "MT8676 (Dimensity 9400)", brand: "OPPO Find X8 Pro", android: "15", patch: "2025-02-01" },
  { model: "MT6833 (Dimensity 700)", brand: "Samsung Galaxy A23 5G", android: "13", patch: "2024-03-05" },
  { model: "MT6768 (Helio G85)", brand: "Redmi Note 11", android: "12", patch: "2023-11-01" },
  { model: "MT6785 (Helio G90T)", brand: "Redmi Note 8 Pro", android: "11", patch: "2022-06-01" },
  { model: "MT6853 (Dimensity 720)", brand: "Realme 7 5G", android: "12", patch: "2023-02-05" },
  { model: "MT6885 (Dimensity 1000+)", brand: "OPPO Reno 5 Pro", android: "12", patch: "2023-04-01" },
  { model: "MT6893 (Dimensity 1200)", brand: "Redmi K40 Gaming", android: "13", patch: "2024-01-05" },
  { model: "MT6771 (Helio P60)", brand: "OPPO F7", android: "10", patch: "2021-09-01" },
  { model: "MT6765 (Helio P35)", brand: "Infinix Hot 12", android: "12", patch: "2023-07-01" },
  { model: "MT6580 (Quad Cortex-A7)", brand: "Nokia 1", android: "8.1", patch: "2019-05-01" },
  { model: "MT6739 (Quad Cortex-A53)", brand: "Tecno Spark 4", android: "9", patch: "2020-11-01" },
  { model: "MT6873 (Dimensity 800)", brand: "Redmi 10X 5G", android: "12", patch: "2023-03-01" },
  { model: "MT6833V (Dimensity 700)", brand: "POCO M4 Pro 5G", android: "13", patch: "2024-02-01" },
  { model: "MT6886 (Dimensity 7200 Pro)", brand: "Nothing Phone (2a)", android: "14", patch: "2024-10-01" },
  { model: "MT6891 (Dimensity 1100)", brand: "iQOO Z3", android: "12", patch: "2023-05-01" },
  { model: "MT6785V (Helio G95)", brand: "Realme 7", android: "11", patch: "2022-08-01" },
  { model: "MT6763 (Helio P23)", brand: "Lenovo K5 Pro", android: "9", patch: "2020-07-01" },
];

const QC_DEVICES = [
  { model: "SM8650 (Snapdragon 8 Gen 3)", brand: "Samsung S24 Ultra", android: "14", patch: "2024-12-01" },
  { model: "SM8550 (Snapdragon 8 Gen 2)", brand: "OnePlus 11", android: "14", patch: "2024-10-05" },
  { model: "SM7475 (Snapdragon 7+ Gen 2)", brand: "Realme GT Neo 5", android: "13", patch: "2024-06-01" },
  { model: "SM6375 (Snapdragon 695)", brand: "Motorola G73", android: "13", patch: "2024-05-05" },
  { model: "SM8475 (Snapdragon 8+ Gen 1)", brand: "ASUS ROG 6", android: "13", patch: "2024-08-05" },
  { model: "SM8750 (Snapdragon 8 Gen 4)", brand: "Samsung S25 Ultra", android: "15", patch: "2025-02-01" },
  { model: "SM7675 (Snapdragon 7 Gen 3)", brand: "OnePlus Nord 4", android: "14", patch: "2024-11-05" },
  { model: "SM7650 (Snapdragon 7s Gen 3)", brand: "Xiaomi Redmi Note 14 Pro", android: "14", patch: "2024-12-05" },
  { model: "SM8635 (Snapdragon 8s Gen 3)", brand: "iQOO Neo 9 Pro", android: "14", patch: "2024-09-05" },
  { model: "SM4450 (Snapdragon 4 Gen 2)", brand: "Motorola Moto G35", android: "14", patch: "2024-10-01" },
  { model: "SM8450 (Snapdragon 8 Gen 1)", brand: "Samsung S22 Ultra", android: "14", patch: "2024-08-01" },
  { model: "SM8350 (Snapdragon 888)", brand: "Xiaomi Mi 11", android: "13", patch: "2023-12-01" },
  { model: "SM8250 (Snapdragon 865)", brand: "OnePlus 8 Pro", android: "13", patch: "2023-05-01" },
  { model: "SM7325 (Snapdragon 778G)", brand: "Realme GT Master", android: "13", patch: "2024-01-05" },
  { model: "SM6225 (Snapdragon 680)", brand: "Redmi 12", android: "13", patch: "2024-03-01" },
  { model: "SM6115 (Snapdragon 662)", brand: "Motorola G9 Play", android: "11", patch: "2022-05-01" },
  { model: "SM7250 (Snapdragon 765G)", brand: "Google Pixel 5", android: "14", patch: "2024-10-05" },
  { model: "SM7150 (Snapdragon 730G)", brand: "POCO X2", android: "11", patch: "2022-01-01" },
  { model: "SM6350 (Snapdragon 690)", brand: "OnePlus Nord N10", android: "12", patch: "2023-02-01" },
  { model: "SM8150 (Snapdragon 855)", brand: "ASUS ZenFone 6", android: "12", patch: "2022-11-01" },
  { model: "SM7435 (Snapdragon 6 Gen 1)", brand: "Samsung Galaxy A35", android: "14", patch: "2024-11-01" },
  { model: "SM8550 (Snapdragon 8 Gen 2)", brand: "Sony Xperia 1 V", android: "14", patch: "2024-09-01" },
  { model: "SM7550 (Snapdragon 7 Gen 3)", brand: "Nothing Phone (2)", android: "14", patch: "2024-12-01" },
  { model: "SM4375 (Snapdragon 4 Gen 1)", brand: "Redmi 12C", android: "13", patch: "2024-04-01" },
  { model: "SM6450 (Snapdragon 6s Gen 3)", brand: "Redmi 13", android: "14", patch: "2024-12-15" },
];

// Samsung devices reachable via Download Mode (Odin/Loke — Heimdall).
// Model strings intentionally contain the "Galaxy ..." name so the
// SamsungService known-good chip cloud highlights the connected model.
const SAMSUNG_DEVICES = [
  { model: "Galaxy S9 (SM-G960F)",     brand: "Samsung Galaxy S9",     android: "10", patch: "2021-05-01" },
  { model: "Galaxy Note 9 (SM-N960F)", brand: "Samsung Galaxy Note 9", android: "10", patch: "2021-08-01" },
  { model: "Galaxy S8 (SM-G950F)",     brand: "Samsung Galaxy S8",     android: "9",  patch: "2020-04-01" },
  { model: "Galaxy A7 (SM-A750F)",     brand: "Samsung Galaxy A7",     android: "10", patch: "2020-11-01" },
  { model: "Galaxy J7 (SM-J730F)",     brand: "Samsung Galaxy J7",     android: "9",  patch: "2019-04-01" },
  { model: "Galaxy Tab S3 (SM-T820)",  brand: "Samsung Galaxy Tab S3", android: "9",  patch: "2019-12-01" },
  { model: "Galaxy S10 (SM-G973F)",    brand: "Samsung Galaxy S10",    android: "12", patch: "2023-02-01" },
  { model: "Galaxy A51 (SM-A515F)",    brand: "Samsung Galaxy A51",    android: "13", patch: "2023-08-01" },
  { model: "Galaxy S7 (SM-G930F)",     brand: "Samsung Galaxy S7",     android: "8",  patch: "2018-08-01" },
  { model: "Galaxy S6 (SM-G920F)",     brand: "Samsung Galaxy S6",     android: "7",  patch: "2017-05-01" },
  { model: "Galaxy Note 8 (SM-N950F)", brand: "Samsung Galaxy Note 8", android: "9",  patch: "2020-01-01" },
  { model: "Galaxy A5 2017 (SM-A520F)",brand: "Samsung Galaxy A5",     android: "8",  patch: "2018-11-01" },
  { model: "Galaxy A10 (SM-A105F)",    brand: "Samsung Galaxy A10",    android: "11", patch: "2021-09-01" },
  { model: "Galaxy A20 (SM-A205F)",    brand: "Samsung Galaxy A20",    android: "11", patch: "2021-10-01" },
  { model: "Galaxy J5 2016 (SM-J510F)",brand: "Samsung Galaxy J5",     android: "7",  patch: "2018-04-01" },
  { model: "Galaxy Tab A (SM-T510)",   brand: "Samsung Galaxy Tab A",  android: "11", patch: "2022-02-01" },
  { model: "Galaxy S5 (SM-G900F)",     brand: "Samsung Galaxy S5",     android: "6",  patch: "2016-06-01" },
  { model: "Galaxy Note 5 (SM-N920F)", brand: "Samsung Galaxy Note 5", android: "7",  patch: "2017-08-01" },
];

const randomHex = (len) =>
  Array.from({ length: len }, () =>
    "0123456789ABCDEF"[Math.floor(Math.random() * 16)]
  ).join("");

const randomIMEI = () => {
  let base = "";
  for (let i = 0; i < 14; i++) base += Math.floor(Math.random() * 10);
  return base + Math.floor(Math.random() * 10);
};

const maskIMEI = (imei) => imei.slice(0, 4) + " ****** " + imei.slice(-3);

const randomSerial = () => "R9F" + randomHex(8);

const POOLS = {
  MTK: { list: MTK_DEVICES, platform: "MediaTek" },
  QC: { list: QC_DEVICES, platform: "Qualcomm" },
  SAMSUNG: { list: SAMSUNG_DEVICES, platform: "Samsung" },
};

// Resolve which device pool to draw from. Accepts an explicit key
// ("MTK" | "QC" | "SAMSUNG"); anything else (including a click event
// object accidentally passed as the arg) falls through to a weighted
// random pick so callers stay safe.
const pickPool = (chipset) => {
  if (typeof chipset === "string" && POOLS[chipset]) return POOLS[chipset];
  const r = Math.random();
  if (r < 0.4) return POOLS.MTK;
  if (r < 0.75) return POOLS.QC;
  return POOLS.SAMSUNG; // Samsung (Download Mode) ~1 in 4 auto scans
};

const bootloaderFor = (platform) => {
  if (platform === "MediaTek") return "BROM v" + (5 + Math.floor(Math.random() * 6)) + ".2104";
  if (platform === "Qualcomm") return "EDL 9008";
  return "Download Mode (Odin/Loke)"; // Samsung
};

export const generateDevice = (chipset = "auto") => {
  const { list, platform } = pickPool(chipset);
  const base = list[Math.floor(Math.random() * list.length)];
  const imei = randomIMEI();
  const imei2 = randomIMEI();
  return {
    ...base,
    platform,
    imei,
    imei_masked: maskIMEI(imei),
    imei2,
    imei2_masked: maskIMEI(imei2),
    serial: randomSerial(),
    bootloader: bootloaderFor(platform),
    cpuId: randomHex(16),
    storage: ["128GB UFS 3.1", "256GB UFS 3.1", "512GB UFS 4.0", "64GB eMMC 5.1"][Math.floor(Math.random() * 4)],
    ram: ["4GB", "6GB", "8GB", "12GB", "16GB"][Math.floor(Math.random() * 5)],
    region: ["EU", "GLOBAL", "INDIA", "CN", "MEA"][Math.floor(Math.random() * 5)],
    detectedAt: new Date(),
  };
};

export const COM_PORTS = ["COM3", "COM5", "COM7", "USB-Serial CH340", "USB Mass Storage"];

export const ACTION_LOG_TEMPLATES = {
  bypass_frp: [
    { level: "INFO", text: "Initiating Aegis Unlock sequence ..." },
    { level: "INFO", text: "Loading auth file: $PLATFORM_auth_v3.bin" },
    { level: "INFO", text: "Sending DA (Download Agent) to preloader..." },
    { level: "INFO", text: "Reading partition table from emmc_user ..." },
    { level: "INFO", text: "Locating frp partition @ 0x{HEX} ..." },
    { level: "WARN", text: "Anti-rollback counter: 8 — proceeding read-only" },
    { level: "INFO", text: "Patching post-reset protection flags ..." },
    { level: "SUCCESS", text: "Aegis Unlock complete. Reboot device to apply." },
  ],
  repair_imei: [
    { level: "INFO", text: "Reading current IMEI from NV partition ..." },
    { level: "INFO", text: "Backing up md1img → /backup/md1img_{TS}.bin" },
    { level: "INFO", text: "Calculating Luhn checksum ..." },
    { level: "INFO", text: "Writing IMEI1: {IMEI}" },
    { level: "INFO", text: "Writing IMEI2: {IMEI2}" },
    { level: "SUCCESS", text: "IMEI repair complete. Verify with *#06#" },
  ],
  unlock_bootloader: [
    { level: "WARN", text: "WARNING: This will erase all userdata." },
    { level: "INFO", text: "Requesting unlock token from device ..." },
    { level: "INFO", text: "Token: {HEX} — verifying signature ..." },
    { level: "INFO", text: "Sending fastboot oem unlock-go ..." },
    { level: "INFO", text: "Erasing locked partition headers ..." },
    { level: "SUCCESS", text: "Bootloader unlocked. OEM lock = 0" },
  ],
  erase_userdata: [
    { level: "WARN", text: "Beginning destructive operation: format userdata" },
    { level: "INFO", text: "Unmounting /data ..." },
    { level: "INFO", text: "Issuing TRIM on userdata partition ..." },
    { level: "INFO", text: "Wiping metadata + dalvik-cache ..." },
    { level: "SUCCESS", text: "Userdata erased. Device will boot to setup wizard." },
  ],
  read_info: [
    { level: "INFO", text: "Probing chipset over USB ..." },
    { level: "INFO", text: "Detected: {MODEL}" },
    { level: "INFO", text: "CPU ID: {CPUID}" },
    { level: "INFO", text: "Serial: {SERIAL}" },
    { level: "SUCCESS", text: "Device fingerprint captured." },
  ],
  // ──────────── QUALCOMM · CABLE-FREE EDL ENTRY ────────────
  enter_edl: [
    { level: "INFO", text: "Looking for ADB / fastboot device on the USB bus ..." },
    { level: "INFO", text: "$ adb reboot edl   (no deep-flash cable required)" },
    { level: "INFO", text: "Device acknowledged · rebooting to Emergency Download ..." },
    { level: "INFO", text: "Re-enumerating USB → 05c6:9008 Qualcomm HS-USB QDLoader 9008" },
    { level: "SUCCESS", text: "EDL 9008 active. Sahara handshake ready — no EDL cable used." },
  ],
  // ──────────── SAMSUNG · HEIMDALL (ODIN/LOKE) ────────────
  samsung_detect: [
    { level: "INFO", text: "Initializing Loke protocol handshake ..." },
    { level: "INFO", text: "Waiting for Download Mode device on USB bus ..." },
    { level: "INFO", text: "Handshake ACK · session opened @ 115200 baud" },
    { level: "INFO", text: "Reading device header · {MODEL}" },
    { level: "SUCCESS", text: "Samsung device detected in Download Mode. Ready." },
  ],
  samsung_read_pit: [
    { level: "INFO", text: "Requesting Partition Information Table (PIT) ..." },
    { level: "INFO", text: "Downloading PIT · {HEX} bytes ..." },
    { level: "INFO", text: "Parsing 28 partition entries ..." },
    { level: "INFO", text: "  BOOT · RECOVERY · SYSTEM · USERDATA · METADATA" },
    { level: "SUCCESS", text: "PIT table dumped → /backup/{SERIAL}_pit.bin" },
  ],
  samsung_factory_reset: [
    { level: "WARN", text: "Destructive op · erasing USERDATA on {MODEL}" },
    { level: "INFO", text: "Entering Odin flash session ..." },
    { level: "INFO", text: "Erasing USERDATA partition ..." },
    { level: "INFO", text: "Erasing CACHE partition ..." },
    { level: "INFO", text: "Erasing METADATA partition (skipped if absent) ..." },
    { level: "SUCCESS", text: "Factory reset complete. Device reboots to setup wizard." },
  ],
  // ──────────── EXPANDED EXPLOIT CATALOG ────────────
  read_codes: [
    { level: "INFO", text: "Mounting /data via DA sideload ..." },
    { level: "INFO", text: "Reading gesture.key + locksettings.db ..." },
    { level: "INFO", text: "Decoding pattern checksum @ 0x{HEX} ..." },
    { level: "INFO", text: "Lockscreen type detected: PIN/Pattern/Password" },
    { level: "SUCCESS", text: "Lockscreen credentials recovered. Hash: {HEX}" },
  ],
  read_frp_token: [
    { level: "INFO", text: "Locating persistent partition ..." },
    { level: "INFO", text: "Extracting Google ID token blob ..." },
    { level: "INFO", text: "Decrypting token with hardware-bound key ..." },
    { level: "SUCCESS", text: "Aegis token captured: {HEX}{HEX}" },
  ],
  mi_account_bypass: [
    { level: "INFO", text: "Detecting Xiaomi Mi Cloud lock state ..." },
    { level: "INFO", text: "Mi Account locked: cloud verification required" },
    { level: "INFO", text: "Pushing community auth payload via BROM ..." },
    { level: "INFO", text: "Patching mi_account flag in misc partition ..." },
    { level: "WARN", text: "This may trip Mi Cloud server flags on next sync." },
    { level: "SUCCESS", text: "Mi Account locally cleared. Device fully usable." },
  ],
  knox_suspend: [
    { level: "INFO", text: "Reading Knox status from sec_efs partition ..." },
    { level: "INFO", text: "Current Knox flag: 0x1 (TRIPPED)" },
    { level: "WARN", text: "Knox warranty bit cannot be reset — only suspended." },
    { level: "INFO", text: "Pushing signed suspend token ..." },
    { level: "INFO", text: "Updating Knox enforcement state → 0x0 (SUSPENDED)" },
    { level: "SUCCESS", text: "Knox suspended. Maintenance window opened." },
  ],
  demo_unit_disable: [
    { level: "INFO", text: "Detecting retail demo configuration ..." },
    { level: "INFO", text: "Demo mode active · model: {MODEL}" },
    { level: "INFO", text: "Disabling RetailMode service ..." },
    { level: "INFO", text: "Clearing demo provisioning flag ..." },
    { level: "SUCCESS", text: "Device converted to consumer firmware profile." },
  ],
  carrier_unlock: [
    { level: "INFO", text: "Reading SIM lock status from NV ..." },
    { level: "INFO", text: "Carrier: detected (locked) · SIM-Lock = 1" },
    { level: "INFO", text: "Backing up modem partition → md1img_{TS}.bin" },
    { level: "INFO", text: "Patching NV item 550 (carrier_id) ..." },
    { level: "INFO", text: "Resetting unlock attempt counter ..." },
    { level: "SUCCESS", text: "Network unlock complete. All carriers accepted." },
  ],
  safe_format: [
    { level: "INFO", text: "Beginning non-destructive format ..." },
    { level: "INFO", text: "Preserving /data/app and /data/media partitions ..." },
    { level: "INFO", text: "Wiping cache + dalvik-cache + frp ..." },
    { level: "SUCCESS", text: "Safe format complete. User apps preserved." },
  ],
  boot_repair: [
    { level: "INFO", text: "Reading boot + recovery partition headers ..." },
    { level: "WARN", text: "Boot magic mismatch · partition appears corrupted." },
    { level: "INFO", text: "Pulling matching boot.img from Aether DB ..." },
    { level: "INFO", text: "Flashing boot.img @ 0x{HEX} ..." },
    { level: "INFO", text: "Verifying SHA-256 ..." },
    { level: "SUCCESS", text: "Boot partition repaired. Device will boot normally." },
  ],
  icloud_check: [
    { level: "INFO", text: "Establishing DFU pipeline · checkm8 mode ..." },
    { level: "INFO", text: "Querying Apple Activation Lock service ..." },
    { level: "INFO", text: "ECID: {HEX}{HEX} · SoC: {CPUID}" },
    { level: "INFO", text: "Activation status: CLEAN / LOCKED — see panel" },
    { level: "SUCCESS", text: "iCloud probe complete." },
  ],
  passcode_recover: [
    { level: "WARN", text: "Beginning DFU-mode passcode recovery ..." },
    { level: "INFO", text: "Loading pongoOS payload ..." },
    { level: "INFO", text: "Dumping locked SEP keybag ..." },
    { level: "INFO", text: "Bruteforce-tolerant attempt sequence engaged ..." },
    { level: "INFO", text: "Iteration 1 of 10000 ..." },
    { level: "SUCCESS", text: "Passcode recovered: ●●●●●●  (shown on device)" },
  ],
  trust_audit: [
    { level: "INFO", text: "Loading Apple ground-truth trust cache (rev 2.4.1) ..." },
    { level: "INFO", text: "Hashing on-device SecureROM ..." },
    { level: "INFO", text: "Comparing 1284 binary signatures ..." },
    { level: "WARN", text: "3 mismatched hashes detected — likely jailbreak artefacts." },
    { level: "SUCCESS", text: "Trust cache audit complete. Report saved." },
  ],
  // ──────────── UNLOCK-MAXIMIZER CATALOG ────────────
  universal_unlock: [
    { level: "INFO", text: "Auto-Unlock engaged · profiling {MODEL} ..." },
    { level: "INFO", text: "Detected platform: $PLATFORM · bootloader {HEX}" },
    { level: "INFO", text: "Stage 1/5 · Aegis (FRP) lock ......... clearing" },
    { level: "INFO", text: "Stage 2/5 · Screen lock (PIN/pattern) . removing" },
    { level: "INFO", text: "Stage 3/5 · MDM / enterprise policy ... stripping" },
    { level: "INFO", text: "Stage 4/5 · Carrier / SIM lock ........ patching NV" },
    { level: "INFO", text: "Stage 5/5 · Account (Mi/Samsung/iCloud) probe" },
    { level: "WARN", text: "Some layers are account-server bound — local state cleared." },
    { level: "SUCCESS", text: "Auto-Unlock complete. Reboot to apply all changes." },
  ],
  remove_screen_lock: [
    { level: "INFO", text: "Mounting /data via DA sideload (no wipe) ..." },
    { level: "INFO", text: "Locating locksettings.db + gatekeeper blob ..." },
    { level: "INFO", text: "Nulling password/pattern/PIN records @ 0x{HEX} ..." },
    { level: "INFO", text: "Rebuilding synthetic-password chain ..." },
    { level: "SUCCESS", text: "Screen lock removed — user data preserved." },
  ],
  disable_auth: [
    { level: "INFO", text: "Handshaking BROM on {MODEL} ..." },
    { level: "INFO", text: "Uploading exploit payload (kamakiri/hashimoto) ..." },
    { level: "INFO", text: "Neutralising DAA + SLA + SBC signature checks ..." },
    { level: "INFO", text: "Secure boot enforcement → bypassed for session" },
    { level: "SUCCESS", text: "Auth disabled. Full read/write DA access granted." },
  ],
  mdm_bypass: [
    { level: "INFO", text: "Scanning for enrolled MDM / EMM profile ..." },
    { level: "INFO", text: "Provider: DeviceOwner / KME enrollment detected" },
    { level: "INFO", text: "Disabling DevicePolicyManager receivers ..." },
    { level: "INFO", text: "Clearing enterprise provisioning flags ..." },
    { level: "SUCCESS", text: "MDM/enterprise lock removed. Consumer profile active." },
  ],
  edl_auth_unlock: [
    { level: "INFO", text: "Sahara session open · 05c6:9008 QDLoader ..." },
    { level: "INFO", text: "Loading signed authorized firehose programmer ..." },
    { level: "INFO", text: "Requesting OEM auth challenge · nonce {HEX} ..." },
    { level: "INFO", text: "Signing with Aether server key (authorized) ..." },
    { level: "SUCCESS", text: "EDL authorized. Read/write + unlock enabled." },
  ],
  cert_repair: [
    { level: "INFO", text: "Reading EFS / NVRAM certificate region ..." },
    { level: "WARN", text: "IMEI cert / QCN appears corrupted (null baseband)." },
    { level: "INFO", text: "Restoring signed cert backup for {MODEL} ..." },
    { level: "INFO", text: "Rebuilding modem provisioning · SN {SERIAL} ..." },
    { level: "SUCCESS", text: "Certificate repaired. Network + IMEI restored." },
  ],
  samsung_mdm_remove: [
    { level: "INFO", text: "Reading Knox Guard / MDM state on {MODEL} ..." },
    { level: "INFO", text: "KG state: LOCKED · carrier-financed device" },
    { level: "INFO", text: "Injecting signed KG release token via Odin ..." },
    { level: "INFO", text: "Removing SPR/CARRIER MDM package ..." },
    { level: "SUCCESS", text: "Samsung MDM / Knox Guard removed. Device released." },
  ],
  sim_unlock: [
    { level: "INFO", text: "Reading SIM-lock policy from modem NV ..." },
    { level: "INFO", text: "IMEI {IMEI} · locked to originating carrier" },
    { level: "INFO", text: "Generating NCK/unlock code from Aether DB ..." },
    { level: "INFO", text: "Applying permanent network unlock ..." },
    { level: "SUCCESS", text: "Network unlocked. Any SIM / carrier now accepted." },
  ],
  hello_screen_bypass: [
    { level: "INFO", text: "Entering DFU · checkm8 pipeline ..." },
    { level: "INFO", text: "ECID {HEX}{HEX} · patching activation ramdisk ..." },
    { level: "INFO", text: "Bypassing 'Hello' / activation setup screen ..." },
    { level: "WARN", text: "Signal/menu bypass — no iCloud credentials altered." },
    { level: "SUCCESS", text: "Activation screen bypassed. Springboard reachable." },
  ],
};

export const fillTemplate = (text, device) =>
  text
    .replace("{HEX}", "0x" + randomHex(8))
    .replace("{IMEI}", device?.imei || randomIMEI())
    .replace("{IMEI2}", device?.imei2 || randomIMEI())
    .replace("{TS}", Date.now())
    .replace("{MODEL}", device?.model || "Unknown")
    .replace("{CPUID}", device?.cpuId || randomHex(16))
    .replace("{SERIAL}", device?.serial || randomSerial())
    .replace("$PLATFORM", device?.platform === "MediaTek" ? "mtk" : "qcom");
