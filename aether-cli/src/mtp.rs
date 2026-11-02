//! MTP jobs for the dashboard.
//!
//! Detect and info print the phone Windows already enumerated. List and pull
//! walk that phone through the Windows shell, which is how File Explorer
//! copies MTP storage. libusb cannot read the files while the portable-device
//! driver owns the interface.

use anyhow::{anyhow, Context, Result};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc::UnboundedSender;

use crate::mtkclient::StreamLine;

const SCRIPT: &str = include_str!("mtp.ps1");

fn send(tx: &UnboundedSender<StreamLine>, stream: &'static str, line: impl Into<String>) {
    let _ = tx.send(StreamLine {
        stream,
        line: line.into(),
    });
}

fn report_identity(tx: &UnboundedSender<StreamLine>, verbose: bool) -> i32 {
    let found = crate::usb::detect_mtp_devices();
    if found.is_empty() {
        send(tx, "stderr", "No MTP device detected. Enable File Transfer on the phone.");
        return 1;
    }
    for dev in found {
        send(
            tx,
            "stdout",
            format!(
                "{} {} {} {}:{} bus {} addr {}",
                dev.manufacturer, dev.product, dev.mode, dev.vid, dev.pid, dev.bus, dev.addr
            ),
        );
        if verbose {
            send(
                tx,
                "stdout",
                if dev.serial.is_empty() {
                    "serial: (not exposed by the USB driver)".into()
                } else {
                    format!("serial: {}", dev.serial)
                },
            );
        }
    }
    0
}

async fn run_shell(mode: &str, relative: Option<&str>, dest: Option<&str>, tx: UnboundedSender<StreamLine>) -> Result<i32> {
    let dir = std::env::temp_dir().join("aether-mtp");
    std::fs::create_dir_all(&dir).ok();
    let script = dir.join("mtp.ps1");
    std::fs::write(&script, SCRIPT).context("failed to write the MTP script")?;
    let shell = if Command::new("pwsh")
        .arg("-NoProfile")
        .arg("-Command")
        .arg("exit 0")
        .output()
        .await
        .is_ok()
    {
        "pwsh"
    } else {
        "powershell"
    };
    let mut cmd = Command::new(shell);
    cmd.arg("-NoProfile")
        .arg("-File")
        .arg(&script)
        .arg("-Mode")
        .arg(mode);
    if let Some(relative) = relative.filter(|value| !value.is_empty()) {
        cmd.arg("-Relative").arg(relative);
    }
    if let Some(dest) = dest.filter(|value| !value.is_empty()) {
        cmd.arg("-Dest").arg(dest);
    }
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .kill_on_drop(true);
    let mut child = cmd.spawn().with_context(|| format!("failed to spawn {shell}"))?;
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
    let timeout = tokio::time::Duration::from_secs(15 * 60);
    let status = match tokio::time::timeout(timeout, child.wait()).await {
        Ok(Ok(status)) => status,
        Ok(Err(err)) => return Err(anyhow!("mtp wait failed: {err}")),
        Err(_) => {
            let _ = child.kill().await;
            return Err(anyhow!("mtp timed out"));
        }
    };
    let _ = stdout_task.await;
    let _ = stderr_task.await;
    Ok(status.code().unwrap_or(-1))
}

/// `args` is `detect`, `info`, `list [relative]`, or `pull [relative] [dest]`.
pub async fn run_streaming(args: &[&str], tx: UnboundedSender<StreamLine>) -> Result<i32> {
    match args.first().copied().unwrap_or("list") {
        "detect" => Ok(report_identity(&tx, false)),
        "info" => Ok(report_identity(&tx, true)),
        "list" => run_shell("list", args.get(1).copied(), None, tx).await,
        "pull" => {
            let dest = args.get(2).copied().map(|s| s.to_string()).unwrap_or_else(|| {
                let home = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".into());
                format!("{home}\\aether-mtp")
            });
            run_shell("pull", args.get(1).copied(), Some(&dest), tx).await
        }
        other => {
            send(&tx, "stderr", format!("unknown mtp job: {other}"));
            Ok(2)
        }
    }
}

pub async fn run_collect(args: &[String]) -> Result<(i32, String)> {
    let owned = args.to_vec();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<StreamLine>();
    let join = tokio::spawn(async move {
        let refs: Vec<&str> = owned.iter().map(|s| s.as_str()).collect();
        run_streaming(&refs, tx).await
    });
    let mut text = String::new();
    while let Some(line) = rx.recv().await {
        text.push_str(&line.line);
        text.push('\n');
    }
    let code = join.await.context("mtp task panicked")??;
    Ok((code, text))
}
