//! Cable-free EDL (Emergency Download) entry for Qualcomm devices.
//!
//! An "EDL cable" (deep-flash cable) is only strictly required when a device is
//! hard-bricked and cannot reach ADB or fastboot. For a device that still boots
//! or reaches the bootloader, EDL 9008 can be triggered purely in software:
//!   * `adb reboot edl`       — device booted, USB-debugging enabled
//!   * `fastboot reboot-edl`  — device in bootloader / fastboot mode
//!   * `fastboot oem edl`     — older/vendor fallback
//! If all of those fail, the technician can use the hardware test-point (ISP)
//! method (short the board's EDL point to GND while inserting USB) — still no
//! special cable required.

use anyhow::Result;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc::UnboundedSender;

use crate::mtkclient::StreamLine;

fn note(tx: &UnboundedSender<StreamLine>, line: impl Into<String>) {
    let _ = tx.send(StreamLine {
        stream: "stdout",
        line: line.into(),
    });
}

/// Run `program args...` streaming stdout+stderr. Returns `Some(exit_code)`, or
/// `None` if the binary could not be spawned (not installed / not on PATH).
async fn run_streaming(program: &str, args: &[&str], tx: &UnboundedSender<StreamLine>) -> Option<i32> {
    note(tx, format!("$ {} {}", program, args.join(" ")));
    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(_) => {
            note(tx, format!("  {} not found in PATH — skipping", program));
            return None;
        }
    };
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
    match child.wait().await {
        Ok(status) => Some(status.code().unwrap_or(-1)),
        Err(_) => Some(-1),
    }
}

/// Attempt cable-free EDL entry. Tries adb, then fastboot. Returns 0 on the
/// first method that reports success, else 1 with test-point guidance.
pub async fn enter_edl_streaming(tx: UnboundedSender<StreamLine>) -> Result<i32> {
    note(&tx, "Attempting cable-free EDL entry (no deep-flash cable required) ...");

    // 1) Device booted with USB debugging → adb reboot edl
    if let Some(0) = run_streaming("adb", &["reboot", "edl"], &tx).await {
        note(&tx, "adb reboot edl issued. Device should re-enumerate as 05c6:9008.");
        drop(tx);
        return Ok(0);
    }

    // 2) Device in bootloader → fastboot reboot-edl
    if let Some(0) = run_streaming("fastboot", &["reboot-edl"], &tx).await {
        note(&tx, "fastboot reboot-edl issued. Device should re-enumerate as 05c6:9008.");
        drop(tx);
        return Ok(0);
    }

    // 3) Vendor fallback → fastboot oem edl
    if let Some(0) = run_streaming("fastboot", &["oem", "edl"], &tx).await {
        note(&tx, "fastboot oem edl issued. Device should re-enumerate as 05c6:9008.");
        drop(tx);
        return Ok(0);
    }

    let _ = tx.send(StreamLine {
        stream: "stderr",
        line: "Software EDL entry failed (no adb/fastboot device responded).".to_string(),
    });
    note(
        &tx,
        "Fallback: use the hardware test-point (ISP) method — short the board's EDL point to GND \
         while inserting USB. This forces 9008 without any EDL cable.",
    );
    drop(tx);
    Ok(1)
}
