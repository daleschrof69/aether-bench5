//! Apple wrappers for the official libimobiledevice tools.
//!
//!   * `irecovery -q` reads ECID / board / mode from Recovery or DFU.
//!   * `ideviceinfo` reads lockdown identity when the phone is paired and trusted.
//!   * `idevicediagnostics diagnostics` reads the hardware diagnostic report.
//!   * `idevice_id -l` lists usbmux devices.
//!   * `idevicerestore -e -y -l` downloads the latest Apple-signed IPSW and
//!     erase-restores. It does not skip Activation Lock.
//!
//! `gaster` remains available for the existing pwned-DFU call. New iPhone
//! actions in the dashboard use the libimobiledevice tools above.

use anyhow::{anyhow, Context, Result};
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc::UnboundedSender;

use crate::mtkclient::StreamLine;

const LIBIMOBILEDEVICE_HINT: &str = "install libimobiledevice (macOS `brew install libimobiledevice`, \
     Linux `apt install libimobiledevice-utils libirecovery-utils`, \
     Windows: the imobiledevice-net win-x64 zip). Put the tools on PATH or in %TEMP%\\aether-apple-tools.";

fn tool_search_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(custom) = std::env::var("AETHER_APPLE_TOOLS") {
        if !custom.is_empty() {
            dirs.push(PathBuf::from(custom));
        }
    }
    dirs.push(std::env::temp_dir().join("aether-apple-tools"));
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            dirs.push(parent.join("apple-tools"));
        }
    }
    dirs
}

fn find_tool(names: &[&str], install_hint: &str) -> Result<String> {
    for candidate in names {
        if std::process::Command::new(candidate)
            .arg("--help")
            .output()
            .is_ok()
        {
            return Ok((*candidate).to_string());
        }
    }
    for dir in tool_search_dirs() {
        for name in names {
            let path = dir.join(name);
            if path.is_file() {
                return Ok(path.to_string_lossy().to_string());
            }
        }
    }
    Err(anyhow!("{} not found on PATH — {}", names[0], install_hint))
}

fn find_named(names: &[&str]) -> Result<String> {
    find_tool(names, LIBIMOBILEDEVICE_HINT)
}

/// Path to a libimobiledevice binary on PATH or in the Aether Apple tools folder.
pub fn locate_tool(names: &[&str]) -> Option<String> {
    find_named(names).ok()
}

fn find_irecovery() -> Result<String> {
    find_named(&["irecovery", "irecovery.exe"])
}

fn find_gaster() -> Result<String> {
    find_tool(
        &["gaster", "gaster.exe"],
        "build it from https://github.com/0x7ff/gaster (`make`) and place the \
         binary on PATH. checkm8 supports A5–A11 devices only.",
    )
}

/// Report which official Apple tools are available. Names only, not full paths.
pub fn check_apple() -> Result<String> {
    let catalog = [
        ("irecovery", &["irecovery", "irecovery.exe"][..]),
        ("ideviceinfo", &["ideviceinfo", "ideviceinfo.exe"][..]),
        ("idevicediagnostics", &["idevicediagnostics", "idevicediagnostics.exe"][..]),
        ("idevice_id", &["idevice_id", "idevice_id.exe"][..]),
        ("idevicerestore", &["idevicerestore", "idevicerestore.exe"][..]),
    ];
    let mut parts = Vec::new();
    for (label, names) in catalog {
        if find_named(names).is_ok() {
            parts.push(label.to_string());
        }
    }
    if parts.is_empty() {
        return Err(anyhow!(
            "no Apple tools found — install libimobiledevice (irecovery, ideviceinfo, idevicerestore)."
        ));
    }
    Ok(parts.join(", "))
}

async fn run_streaming(bin: &str, args: &[&str], tx: UnboundedSender<StreamLine>) -> Result<i32> {
    let mut cmd = Command::new(bin);
    for a in args {
        cmd.arg(a);
    }
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    let mut child: Child = cmd.spawn().with_context(|| format!("failed to spawn {bin}"))?;
    if let Some(stdout) = child.stdout.take() {
        let tx2 = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = tx2.send(StreamLine { stream: "stdout", line });
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let tx2 = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = tx2.send(StreamLine { stream: "stderr", line });
            }
        });
    }
    let status = child.wait().await.context("apple tool exited abnormally")?;
    drop(tx);
    Ok(status.code().unwrap_or(-1))
}

/// Read device info from Recovery/DFU (`irecovery -q`).
pub async fn read_info_streaming(tx: UnboundedSender<StreamLine>) -> Result<i32> {
    let bin = find_irecovery()?;
    run_streaming(&bin, &["-q"], tx).await
}

/// Lockdown identity from a paired, trusted device (`ideviceinfo`).
pub async fn lockdown_info_streaming(tx: UnboundedSender<StreamLine>) -> Result<i32> {
    let bin = find_named(&["ideviceinfo", "ideviceinfo.exe"])?;
    run_streaming(&bin, &[], tx).await
}

/// Hardware diagnostic report (`idevicediagnostics diagnostics`).
pub async fn diagnostics_streaming(tx: UnboundedSender<StreamLine>) -> Result<i32> {
    let bin = find_named(&["idevicediagnostics", "idevicediagnostics.exe"])?;
    run_streaming(&bin, &["diagnostics"], tx).await
}

/// List devices attached through usbmuxd (`idevice_id -l`).
pub async fn list_devices_streaming(tx: UnboundedSender<StreamLine>) -> Result<i32> {
    let bin = find_named(&["idevice_id", "idevice_id.exe"])?;
    run_streaming(&bin, &["-l"], tx).await
}

/// Erase-restore the connected device with the latest Apple-signed IPSW.
/// Flags are the official client only: no custom IPSW, no pwn, no third-party signing.
pub async fn restore_latest_streaming(tx: UnboundedSender<StreamLine>) -> Result<i32> {
    let bin = find_named(&["idevicerestore", "idevicerestore.exe"])?;
    run_streaming(&bin, &["-e", "-y", "-l", "-P"], tx).await
}

/// Run the checkm8 BootROM exploit to enter pwned-DFU (`gaster pwn`).
pub async fn pwn_dfu_streaming(tx: UnboundedSender<StreamLine>) -> Result<i32> {
    let bin = find_gaster()?;
    run_streaming(&bin, &["pwn"], tx).await
}
