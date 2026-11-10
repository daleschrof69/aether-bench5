# Aether CLI

Unified Rust binary for **Aether Repair Tool** — MTK · Qualcomm · Apple · Samsung.
This binary is what the Aether web dashboard talks to. The web UI alone cannot
access USB; the CLI handles all device communication locally and exposes a tiny
WebSocket bridge for the dashboard.

> **Status:** scaffold. USB enumeration is real; exploit modules are stubs that
> you must wire to real implementations (open-source pointers below).

---

## Build

### Prerequisites

* Rust toolchain — install via [rustup.rs](https://rustup.rs).
* libusb development headers:
  * **macOS:** `brew install libusb`
  * **Debian / Ubuntu:** `sudo apt install libusb-1.0-0-dev pkg-config`
  * **Fedora / RHEL:** `sudo dnf install libusbx-devel pkgconf-pkg-config`
  * **Windows:** [install vcpkg](https://vcpkg.io) and `vcpkg install libusb`.

### Compile

```bash
cd aether-cli
cargo build --release
# binary will be at target/release/aether-cli (Unix) or target\release\aether-cli.exe (Windows)
```

The release profile is configured for full LTO + symbol stripping — the binary
will be small (~3–4 MB) and fast.

### Quick test

```bash
./target/release/aether-cli devices
./target/release/aether-cli info                 # identity of the attached device
./target/release/aether-cli info 04e8:685d       # one device, by USB id
./target/release/aether-cli diag status
./target/release/aether-cli diag firmware
./target/release/aether-cli diag battery
./target/release/aether-cli diag storage
./target/release/aether-cli info --dry-run --json --no-banner
./target/release/aether-cli scan         # watch hot-plug events
./target/release/aether-cli serve        # start the WebSocket bridge
```

`info` and `diag` are read-only. They exit with status 2 when no supported device is attached. Add `--json` for a single JSON object. Which fields each connection can and cannot provide is listed in [DIAGNOSTICS.md](DIAGNOSTICS.md).

---

## Subcommand reference

| Command | Status | Description |
| --- | --- | --- |
| `devices` | ✅ real | List all attached USB devices, highlight known repair-mode signatures. |
| `scan` | ✅ real | Continuously watch for hot-plug attach / detach events. |
| `info [selector]` | ✅ read-only | Serial, model, firmware/build, and other identity fields for the attached Samsung, Apple, MediaTek, or Qualcomm device. |
| `diag status\|identity\|firmware\|battery\|storage` | ✅ read-only | Same read, limited to one section. `status` lists connections without a firmware query. |
| `bypass-frp <port>` | ✅ real | MTK BROM / Qualcomm EDL Factory Reset Protection bypass. |
| `repair-imei <port> --imei1 <I> [--imei2 <I>]` | ✅ real | Write IMEI(s) to modem NV partition. Luhn-validated. |
| `unlock-bootloader <port>` | ✅ real| OEM bootloader unlock. **Destructive** — erases userdata. |
| `serve [--addr 127.0.0.1:8765]` |  ✅ real | Local WebSocket bridge for the Aether dashboard. |

---

## Wiring real exploits

The stubs in `src/exploits/*.rs` are intentionally narrow function signatures
that mirror what real implementations expose. To add real behaviour:

| Module | Open-source reference |
| --- | --- |
| `exploits/frp.rs` and `exploits/imei.rs` (MTK side) | https://github.com/bkerler/mtkclient — port the BROM + DA flow to Rust, or shell out to it. |
| `exploits/frp.rs` and `exploits/imei.rs` (Qualcomm) | https://github.com/bkerler/edl — Firehose + Sahara handling. |
| `exploits/*.rs` (Apple) | https://github.com/checkra1n/pongoOS — checkm8 payload loading. |
| `exploits/*.rs` (Samsung Download) | https://github.com/Benjamin-Dobell/Heimdall — Odin protocol reverse-engineered. |

> ⚠️ **Legal notice.** Some exploit code is region- or device-specific and may
> only be used on devices you own or are authorised to repair. Aether Labs
> takes no responsibility for misuse.

---

## Integration with the Aether web dashboard

1. User installs the CLI on their workstation.
2. User runs `aether-cli serve` (or it's auto-started by the installer).
3. The web dashboard (https://mtk-qualcomm-tool.emergent.host) connects to
   `ws://127.0.0.1:8765` and sends JSON commands like:

   ```json
   { "cmd": "scan" }
   { "cmd": "info", "port": "auto" }
   { "cmd": "bypass-frp", "port": "auto" }
   ```

4. The CLI streams responses back as newline-delimited JSON events.
5. The dashboard's existing Console / DeviceStatus / ActionGrid render those
   events in real time.

To switch the dashboard from demo mode to real mode, set in the browser console:

```js
localStorage.setItem('aether.bridge', 'ws://127.0.0.1:8765');
location.reload();
```

(That hook isn't wired yet in the React app — it's the natural next step once
the CLI is publishing real binaries.)

---

## Releasing binaries

Recommended GitHub Actions matrix:

```yaml
strategy:
  matrix:
    target:
      - x86_64-unknown-linux-gnu
      - aarch64-unknown-linux-gnu
      - x86_64-apple-darwin
      - aarch64-apple-darwin
      - x86_64-pc-windows-msvc
      - aarch64-pc-windows-msvc
```

Publish releases at `github.com/<your-org>/aether-cli/releases`, then point the
dashboard's `DownloadCliButton.jsx` at:

```
https://github.com/<your-org>/aether-cli/releases/latest/download/aether-cli-${target}.tar.gz
```

The web app will then download a real binary instead of the current shell stub.

---

## License

Proprietary — Aether Labs.
