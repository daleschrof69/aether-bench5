//! Official vendor-tool commands.
//!
//! These are the documented adb, fastboot, heimdall, and libimobiledevice
//! invocations. The whitelist is the whole command. Anything else is refused,
//! including adb shell and heimdall flash. The existing repair actions stay
//! on their own bridge methods.

use anyhow::{anyhow, Context, Result};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc::UnboundedSender;

use crate::mtkclient::StreamLine;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Planned {
    pub bin_names: &'static [&'static str],
    pub args: Vec<String>,
}

pub fn plan(tool: &str, args: &[String]) -> Result<Planned, String> {
    let words: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    match tool {
        "adb" => adb_plan(&words),
        "fastboot" => fastboot_plan(&words),
        "heimdall" => heimdall_plan(&words),
        "apple" => apple_plan(&words),
        other => Err(format!("unknown official tool: {other}")),
    }
}

fn planned(bin_names: &'static [&'static str], args: &[&str]) -> Result<Planned, String> {
    Ok(Planned {
        bin_names,
        args: args.iter().map(|s| (*s).to_string()).collect(),
    })
}

fn adb_plan(args: &[&str]) -> Result<Planned, String> {
    match args {
        ["devices"] | ["devices", "-l"] | ["get-state"] | ["reboot"] => planned(ADB, args),
        ["reboot", "recovery" | "bootloader" | "download" | "sideload"] => planned(ADB, args),
        _ => Err("adb command is not in the official set (devices, get-state, reboot, reboot recovery|bootloader|download|sideload)".into()),
    }
}

fn fastboot_plan(args: &[&str]) -> Result<Planned, String> {
    match args {
        ["devices"] => planned(FASTBOOT, args),
        ["getvar", "all" | "product" | "version" | "version-bootloader" | "secure" | "unlocked"] => {
            planned(FASTBOOT, args)
        }
        _ => Err("fastboot command is not in the official set (devices, getvar all|product|version|version-bootloader|secure|unlocked)".into()),
    }
}

fn heimdall_plan(args: &[&str]) -> Result<Planned, String> {
    match args {
        ["version"] | ["detect"] | ["print-pit"] | ["close-pc-screen"] => planned(HEIMDALL, args),
        ["download-pit"] => {
            let home = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".into());
            let dir = std::path::PathBuf::from(home).join("aether-pit");
            std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
            let output = dir.join("device.pit");
            Ok(Planned {
                bin_names: HEIMDALL,
                args: vec![
                    "download-pit".into(),
                    "--output".into(),
                    output.display().to_string(),
                    "--no-reboot".into(),
                ],
            })
        }
        _ => Err("heimdall command is not in the official set (version, detect, print-pit, download-pit, close-pc-screen)".into()),
    }
}

fn apple_plan(args: &[&str]) -> Result<Planned, String> {
    match args {
        ["id"] => Ok(Planned { bin_names: &["idevice_id", "idevice_id.exe"], args: vec!["-l".into()] }),
        ["info"] => planned(&["ideviceinfo", "ideviceinfo.exe"], &[]),
        ["diagnostics"] => planned(&["idevicediagnostics", "idevicediagnostics.exe"], &["diagnostics"]),
        ["recovery"] => planned(&["irecovery", "irecovery.exe"], &["-q"]),
        ["pair", "validate"] => planned(&["idevicepair", "idevicepair.exe"], &["validate"]),
        _ => Err("apple command is not in the official set (id, info, diagnostics, recovery, pair validate)".into()),
    }
}

const ADB: &[&str] = &["adb", "adb.exe"];
const FASTBOOT: &[&str] = &["fastboot", "fastboot.exe"];
const HEIMDALL: &[&str] = &["heimdall", "heimdall.exe"];

fn command_starts(name: &str) -> bool {
    std::process::Command::new(name)
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok()
        || std::process::Command::new(name)
            .arg("version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok()
        || std::process::Command::new(name)
            .arg("help")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok()
}

pub fn find_bin(names: &[&str]) -> Option<String> {
    for name in names {
        if command_starts(name) {
            return Some((*name).to_string());
        }
    }
    // libimobiledevice on Windows lives in %TEMP%\aether-apple-tools, not PATH.
    crate::apple::locate_tool(names)
}

fn send(tx: &UnboundedSender<StreamLine>, stream: &'static str, line: impl Into<String>) {
    let _ = tx.send(StreamLine { stream, line: line.into() });
}

pub async fn run_streaming(tool: &str, args: &[String], tx: UnboundedSender<StreamLine>) -> Result<i32> {
    let planned = plan(tool, args).map_err(|err| anyhow!(err))?;
    let Some(bin) = find_bin(planned.bin_names) else {
        send(&tx, "stderr", format!("{} is not on PATH", planned.bin_names[0]));
        return Ok(1);
    };
    send(&tx, "stdout", format!("$ {bin} {}", planned.args.join(" ")));
    let mut cmd = Command::new(&bin);
    cmd.args(&planned.args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .kill_on_drop(true);
    let mut child = cmd.spawn().with_context(|| format!("failed to spawn {bin}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let tx_out = tx.clone();
    let stdout_task = tokio::spawn(async move {
        if let Some(stdout) = stdout {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = tx_out.send(StreamLine { stream: "stdout", line });
            }
        }
    });
    let tx_err = tx.clone();
    let stderr_task = tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = tx_err.send(StreamLine { stream: "stderr", line });
            }
        }
    });
    let status = match tokio::time::timeout(tokio::time::Duration::from_secs(180), child.wait()).await {
        Ok(Ok(status)) => status,
        Ok(Err(err)) => return Err(anyhow!("{bin} wait failed: {err}")),
        Err(_) => {
            let _ = child.kill().await;
            return Err(anyhow!("{bin} timed out"));
        }
    };
    let _ = stdout_task.await;
    let _ = stderr_task.await;
    Ok(status.code().unwrap_or(-1))
}

pub async fn run_collect(tool: &str, args: &[String]) -> Result<(i32, String)> {
    let tool = tool.to_string();
    let args = args.to_vec();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<StreamLine>();
    let join = tokio::spawn(async move { run_streaming(&tool, &args, tx).await });
    let mut text = String::new();
    while let Some(line) = rx.recv().await {
        text.push_str(&line.line);
        text.push('\n');
    }
    let code = join.await.context("official command panicked")??;
    Ok((code, text))
}

pub fn tool_status(label: &str, names: &[&str]) -> String {
    match find_bin(names) {
        Some(bin) => format!("{label} {bin}"),
        None => format!("{label} not on PATH"),
    }
}

pub fn adb_names() -> &'static [&'static str] { ADB }
pub fn fastboot_names() -> &'static [&'static str] { FASTBOOT }

#[cfg(test)]
mod tests {
    use super::*;

    fn words(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).to_string()).collect()
    }

    #[test]
    fn accepts_official_adb_fastboot_and_heimdall_commands() {
        assert!(plan("adb", &words(&["devices", "-l"])).is_ok());
        assert!(plan("adb", &words(&["reboot", "download"])).is_ok());
        assert!(plan("fastboot", &words(&["getvar", "unlocked"])).is_ok());
        assert!(plan("heimdall", &words(&["close-pc-screen"])).is_ok());
        assert!(plan("apple", &words(&["pair", "validate"])).is_ok());
    }

    #[test]
    fn refuses_commands_outside_the_official_set() {
        assert!(plan("adb", &words(&["shell", "rm", "-rf", "/"])).is_err());
        assert!(plan("adb", &words(&["reboot", "edl"])).is_err());
        assert!(plan("fastboot", &words(&["oem", "unlock"])).is_err());
        assert!(plan("heimdall", &words(&["flash", "--AP", "firmware.tar"])).is_err());
        assert!(plan("apple", &words(&["restore", "custom.ipsw"])).is_err());
    }
}
