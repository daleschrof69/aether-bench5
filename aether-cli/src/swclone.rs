//! Smart Switch transport — shells out to `backend/swclone.py`.
//!
//! The Python module owns FUS lookup/download/decrypt and the ADB content
//! backup. Heimdall remains the flasher; the original script was cut off
//! before its Loke path.

use anyhow::{anyhow, Context, Result};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc::UnboundedSender;

use crate::mtkclient::{python_bin, StreamLine};

fn walk_for_script(start: &Path) -> Option<PathBuf> {
    let mut dir = Some(start);
    while let Some(current) = dir {
        let candidate = current.join("backend").join("swclone.py");
        if candidate.is_file() {
            return Some(candidate);
        }
        dir = current.parent();
    }
    None
}

/// Find `backend/swclone.py` by walking up from the cwd and from the executable.
pub fn find_script() -> Result<PathBuf> {
    let mut starts = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        starts.push(cwd);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            starts.push(parent.to_path_buf());
        }
    }
    for start in starts {
        if let Some(found) = walk_for_script(&start) {
            return Ok(found);
        }
    }
    Err(anyhow!(
        "backend/swclone.py not found. Run aether-cli from the aether-bench5 checkout."
    ))
}

/// Spawn `python backend/swclone.py ARGS...` and stream both pipes.
/// Firmware fetches can run a long time, so the timeout is two hours.
pub async fn run_streaming(args: &[&str], tx: UnboundedSender<StreamLine>) -> Result<i32> {
    let python = python_bin()?;
    let script = find_script()?;
    let mut cmd = Command::new(&python);
    cmd.arg(&script);
    for arg in args {
        cmd.arg(arg);
    }
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .kill_on_drop(true);

    let cmd_line = format!("swclone {}", args.join(" "));
    let mut child: Child = cmd
        .spawn()
        .with_context(|| format!("failed to spawn {cmd_line}"))?;

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

    let timeout = tokio::time::Duration::from_secs(7200);
    let status = match tokio::time::timeout(timeout, child.wait()).await {
        Ok(Ok(status)) => status,
        Ok(Err(err)) => {
            let _ = child.kill().await;
            return Err(anyhow!("swclone wait failed ({cmd_line}): {err}"));
        }
        Err(_) => {
            let _ = child.kill().await;
            return Err(anyhow!(
                "swclone timed out after {}s ({cmd_line})",
                timeout.as_secs()
            ));
        }
    };

    let _ = stdout_task.await;
    let _ = stderr_task.await;
    drop(tx);

    let code = status.code().unwrap_or(-1);
    if code != 0 {
        tracing::warn!("swclone exited {code} ({cmd_line})");
    }
    Ok(code)
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
    let code = join.await.context("swclone task panicked")??;
    Ok((code, text))
}
