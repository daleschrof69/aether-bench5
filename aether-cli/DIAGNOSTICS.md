# Diagnostic reads

`aether-cli info` and `aether-cli diag` only read device identity and status.
They do not write partitions, change firmware, or change lock state.

## Commands

```bash
aether-cli devices
aether-cli diag status
aether-cli info                  # same as: diag identity
aether-cli diag firmware
aether-cli diag battery
aether-cli diag storage
aether-cli info --json --no-banner
aether-cli info --dry-run --json --no-banner
```

Selectors replace `auto` when more than one phone is attached:

```bash
aether-cli info 04e8:685d        # USB vendor:product
aether-cli info 1:5              # bus:address
aether-cli info R58M123456       # serial
aether-cli info samsung          # platform name, if only one matches
```

Exit status `0` means the read finished. Exit status `2` means no supported device is attached. Any other non-zero status means the device was seen but the reader failed (missing tool, driver, or the phone left the expected mode).

The desktop bridge exposes the same reads:

- `devices` — USB descriptor identity (serial, product, manufacturer, platform, mode)
- `diag.status` — USB plus ADB, fastboot, and a trusted iPhone, without a firmware query
- `diag.read` / `info` — streamed identity read. The last stdout line is `AETHER_DIAG ` plus one JSON object

## What each connection can report

| Connection | Reader | Serial | Model | Firmware / build | Also reported | Not in this read |
| --- | --- | --- | --- | --- | --- | --- |
| MediaTek BROM / preloader | `mtkclient printgpt` | USB serial if the descriptor has one. ME_ID is separate and is not treated as the device serial | Chip name (`CPU`) | Preloader software version | HW code, HW/SW ver, SOC_ID, partition-table size estimate | Android build fingerprint, battery, IMEI |
| Qualcomm EDL / QDLoader | `edl printgpt` | Sahara chip serial | USB product string, or CPU when the tool prints one | Not available | MSM/HW id, OEM id, model id, PK hash, partition-table size estimate | Android build fingerprint, battery, IMEI |
| Samsung Download mode | `heimdall detect`, `heimdall print-pit --no-reboot` | USB serial | USB product string when it is not a generic gadget name | Not available | PIT entry count, partition-table size estimate | Android build fingerprint, battery, IMEI |
| Apple DFU / Recovery | `irecovery -q` | `SRNM` or `SERIAL` | Product type, with a marketing name when it is known | iBoot string (`SRTG`) | ECID, CPID, board id. IMEI only if irecovery prints it | Battery, storage capacity |
| Trusted iPhone | `ideviceinfo` (libimobiledevice) | Serial number | Product type / marketing name | iOS version and build | ECID, UDID, board id, activation state, battery, disk capacity. IMEI when lockdown already exposes it | — |
| Authorized ADB | `adb shell` getprop, dumpsys battery, df | `ro.serialno` | `ro.product.model` (market name when set) | `ro.build.display.id` | Android version, security patch, chipset platform, battery, data-partition size. IMEI only from getprop | Modem NV |
| Fastboot | `fastboot getvar all` (allowlisted keys) | `serialno` | `product` | Bootloader version | Baseband, HW revision, userdata size | Battery, IMEI |
| MTP / descriptor only | USB strings | Serial string | Product string | Not available | Vendor id, product id, USB device release | Firmware build, battery, storage |

Storage figures taken from a GPT or PIT are labeled as estimates at 512-byte sectors. ADB storage is the `/data` filesystem, not the whole chip. Fastboot storage is the userdata partition size.

Qualcomm diagnostic USB (PID `900e`) and Samsung upload mode are identified from the descriptor only. This CLI does not send further commands in those modes.

`--dry-run` prints one synthetic Samsung-shaped report so the JSON shape can be checked without a phone. It does not open USB.

## Tools

| Mode | Install |
| --- | --- |
| MediaTek | `aether-cli setup` (Python `mtkclient`) |
| Qualcomm EDL | `aether-cli setup` (Python `edlclient`) |
| Samsung Download | Heimdall (`heimdall-flash` / the Heimdall installer) |
| Apple DFU / Recovery | `irecovery` from libimobiledevice |
| Trusted iPhone | `ideviceinfo` and `idevice_id` from libimobiledevice |
| ADB / fastboot | Android platform-tools |

`aether-cli doctor` reports which of these are on `PATH`. A missing tool is an error only when a connected device needs that reader.

## Hardware needed to verify a live read

A supported phone in the matching mode, plus the reader for that mode. USB enumeration itself (`aether-cli devices`, `diag status`) can be checked with any of those connections and does not require the external readers. Parser coverage for each reader is in `cargo test` and does not need hardware. `--dry-run` checks the CLI output path with no device attached.
