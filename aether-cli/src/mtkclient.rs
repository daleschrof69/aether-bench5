//! `mtkclient` subprocess wrapper.
//!
//! `mtkclient` (https://github.com/bkerler/mtkclient — GPL-3.0) is the
//! battle-tested open-source MediaTek BROM/DA exploit suite. Rather than
//! re-implement BROM exploits from scratch (~weeks of work), Aether shells
//! out to mtkclient as a subprocess and streams its stdout/stderr back to
//! the Aether web dashboard over the JSON-RPC bridge.
//!
//! See `/app/aether-cli/NOTICE.md` for the license / attribution.
//!
//! Reasons we keep mtkclient as a subprocess rather than embedding:
//!   1. GPL-3.0 compatibility — `mere aggregation` via subprocess is widely
//!      accepted as not requiring derivative-work licensing. Linking
//!      mtkclient's code directly would force Aether-CLI to GPL.
//!   2. mtkclient evolves rapidly — keeping it as an external dep means
//!      `pip install --upgrade mtkclient` picks up new chipset support
//!      without an Aether release.
//!   3. Python is already required on Windows for most repair shop toolchains.

use anyhow::{anyhow, Context, Result};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc::UnboundedSender;

/// One line streamed from a running mtkclient invocation.
#[derive(Debug, Clone, serde::Serialize)]
pub struct StreamLine {
    /// "stdout" | "stderr"
    pub stream: &'static str,
    pub line: String,
}

/// Resolved Python interpreter path (e.g. `python3` on Linux/macOS, `python`
/// on Windows after Python.org installer, or `py -3` on systems with the
/// Python launcher). Cached on first call.
fn find_python() -> Result<String> {
    for candidate in ["python3", "python", "py"] {
        if let Ok(out) = std::process::Command::new(candidate)
            .arg("--version")
            .output()
        {
            if out.status.success() {
                return Ok(candidate.to_string());
            }
        }
    }
    Err(anyhow!(
        "python not found on PATH — install Python 3.8+ from https://www.python.org/downloads/ \
         (on Windows, tick 'Add python.exe to PATH' in the installer), then run \
         `aether-cli setup` to install mtkclient."
    ))
}

/// Public accessor for the resolved Python interpreter path. Used by sibling
/// modules (e.g. qualcomm) that pip-install their own Python dependencies.
pub fn python_bin() -> Result<String> {
    find_python()
}

/// Return the detected Python interpreter version string (e.g. "Python 3.11.4").
/// Used by the Setup Wizard `setup.doctor` bridge method.
pub fn check_python() -> Result<String> {
    let python = find_python()?;
    let out = std::process::Command::new(&python)
        .arg("--version")
        .output()
        .context("failed to spawn python")?;
    if !out.status.success() {
        return Err(anyhow!("python --version failed"));
    }
    let mut text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() {
        // Some older Python builds print the version banner to stderr.
        text = String::from_utf8_lossy(&out.stderr).trim().to_string();
    }
    Ok(text)
}

/// Verify mtkclient is importable. Returns its installed version string,
/// e.g. "2.0.2", on success.
pub fn check_mtkclient() -> Result<String> {
    let python = find_python()?;
    let out = std::process::Command::new(&python)
        .args(["-c", "import mtkclient, sys; print(getattr(mtkclient, '__version__', 'unknown'))"])
        .output()
        .context("failed to spawn python")?;
    if !out.status.success() {
        return Err(anyhow!(
            "mtkclient not installed — run `aether-cli setup` (uses `pip install --user mtkclient`)."
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Install mtkclient via `pip install --user`. Returns the captured combined
/// stdout/stderr so the caller can stream it to the user.
pub async fn install_mtkclient() -> Result<String> {
    let python = find_python()?;
    let out = Command::new(&python)
        .args(["-m", "pip", "install", "--user", "--upgrade", "mtkclient"])
        .output()
        .await
        .context("failed to spawn pip")?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    if !out.status.success() {
        return Err(anyhow!("pip install failed:\n{}", text));
    }
    Ok(text)
}

/// Stream `python -m pip install --user --upgrade mtkclient` line-by-line so
/// the Setup Wizard in the dashboard can show live install progress in the
/// console. Returns the pip exit code (0 = success).
pub async fn install_mtkclient_streaming(tx: UnboundedSender<StreamLine>) -> Result<i32> {
    let python = find_python()?;
    let mut cmd = Command::new(&python);
    cmd.args(["-m", "pip", "install", "--user", "--upgrade", "mtkclient"]);
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    let mut child: Child = cmd.spawn().context("failed to spawn pip")?;
    let stdout = child.stdout.take().ok_or_else(|| anyhow!("no stdout"))?;
    let stderr = child.stderr.take().ok_or_else(|| anyhow!("no stderr"))?;

    let tx_out = tx.clone();
    let stdout_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = tx_out.send(StreamLine { stream: "stdout", line });
        }
    });
    let tx_err = tx.clone();
    let stderr_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = tx_err.send(StreamLine { stream: "stderr", line });
        }
    });

    let status = child.wait().await.context("pip exited abnormally")?;
    let _ = stdout_task.await;
    let _ = stderr_task.await;
    drop(tx);
    Ok(status.code().unwrap_or(-1))
}

/// Spawn `python -m mtkclient ARGS...` and stream each stdout/stderr line
/// through the provided channel until the process exits. Returns the exit
/// code (0 = success).
///
/// Execution is hardened with:
/// - 10-minute hard timeout (kills the child on expiry)
/// - richer error context including the full command line
/// - graceful handling of missing stdout/stderr pipes
pub async fn run_mtkclient_streaming(
    args: &[&str],
    tx: UnboundedSender<StreamLine>,
) -> Result<i32> {
    let python = find_python()?;
    let mut cmd = Command::new(&python);
    cmd.arg("-m").arg("mtkclient");
    for a in args {
        cmd.arg(a);
    }
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .kill_on_drop(true);

    let cmd_line = format!("python -m mtkclient {}", args.join(" "));
    let mut child: Child = cmd
        .spawn()
        .with_context(|| format!("failed to spawn mtkclient ({cmd_line})"))?;

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

    // Hard timeout so a hung BROM handshake cannot block forever.
    let timeout = tokio::time::Duration::from_secs(600);
    let status = match tokio::time::timeout(timeout, child.wait()).await {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => {
            let _ = child.kill().await;
            return Err(anyhow!("mtkclient wait failed ({cmd_line}): {e}"));
        }
        Err(_) => {
            let _ = child.kill().await;
            return Err(anyhow!(
                "mtkclient timed out after {}s ({cmd_line})",
                timeout.as_secs()
            ));
        }
    };

    let _ = stdout_task.await;
    let _ = stderr_task.await;
    drop(tx);

    let code = status.code().unwrap_or(-1);
    if code != 0 {
        tracing::warn!("mtkclient exited {code} ({cmd_line})");
    }
    Ok(code)
}

/// Collect the streamed output into a single string. Useful for the
/// non-streaming CLI subcommands (`aether-cli bypass-frp`) — the bridge
/// uses the streaming variant directly.
pub async fn run_mtkclient_collect(args: &[&str]) -> Result<(i32, String)> {
    let owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<StreamLine>();
    let join = tokio::spawn(async move {
        let refs: Vec<&str> = owned.iter().map(|s| s.as_str()).collect();
        run_mtkclient_streaming(&refs, tx).await
    });
    let mut buf = String::new();
    while let Some(line) = rx.recv().await {
        buf.push_str(&line.line);
        buf.push('\n');
    }
    let exit = join.await.context("mtkclient task panicked")??;
    Ok((exit, buf))
}
