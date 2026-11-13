//! Local WebSocket / JSON-RPC bridge.
//!
//! The Aether web dashboard connects here over WebSocket (ws://127.0.0.1:8765)
//! and sends JSON-RPC 2.0 requests. The bridge uses `tokio-tungstenite` so
//! browser `new WebSocket()` calls work directly — no protocol translator
//! needed in front of it.
//!
//!   --> {"jsonrpc":"2.0","id":1,"method":"hello","params":{}}
//!   <-- {"jsonrpc":"2.0","id":1,"result":{"name":"aether-cli","version":"0.1.0",...}}
//!
//!   --> {"jsonrpc":"2.0","id":2,"method":"mtk.frp_bypass","params":{}}
//!   <-- {"jsonrpc":"2.0","id":2,"result":{"job_id":"f0b1a2","status":"started"}}
//!   <-- {"jsonrpc":"2.0","method":"event","params":{"job_id":"f0b1a2","stream":"stdout","line":"Connecting..."}}
//!   <-- {"jsonrpc":"2.0","method":"event","params":{"job_id":"f0b1a2","stream":"done","exit_code":0}}

use anyhow::Result;
use colored::Colorize;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::Message;

use crate::heimdall;
use crate::mtkclient;
use crate::edl;
use crate::qualcomm;
use crate::apple;

const CLI_VERSION: &str = env!("CARGO_PKG_VERSION");
const BRIDGE_VERSION: &str = "2";

/// One end of a WebSocket connection (write half) shared between the main
/// request-dispatch loop and any background `event` notification tasks.
type WsSink = Arc<
    Mutex<
        futures_util::stream::SplitSink<
            tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
            Message,
        >,
    >,
>;

#[derive(Debug, Deserialize)]
struct RpcRequest {
    #[allow(dead_code)]
    jsonrpc: Option<String>,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize)]
struct RpcResponse {
    jsonrpc: &'static str,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcError>,
}

#[derive(Debug, Serialize)]
struct RpcError {
    code: i32,
    message: String,
}

pub async fn serve(addr: &str) -> Result<()> {
    let listener = TcpListener::bind(addr).await?;
    println!(
        "  {} aether bridge listening on ws://{} (JSON-RPC v{})",
        "○".bright_green(),
        addr.bright_white(),
        BRIDGE_VERSION,
    );
    println!(
        "  {} the Aether web dashboard auto-connects on its next reload.",
        "↳".dimmed(),
    );
    println!();
    loop {
        let (sock, peer) = listener.accept().await?;
        println!("  {} client connected: {}", "+".bright_green(), peer);
        tokio::spawn(async move {
            match tokio_tungstenite::accept_async(sock).await {
                Ok(ws) => handle_client(ws).await,
                Err(e) => eprintln!("  ws handshake failed: {}", e),
            }
        });
    }
}

async fn handle_client(ws: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>) {
    let (write, mut read) = ws.split();
    let write: WsSink = Arc::new(Mutex::new(write));
    while let Some(msg) = read.next().await {
        let text = match msg {
            Ok(Message::Text(t)) => t,
            Ok(Message::Close(_)) | Err(_) => break,
            _ => continue,
        };
        let trimmed = text.trim();
        if trimmed.is_empty() {
            continue;
        }
        let request: RpcRequest = match serde_json::from_str(trimmed) {
            Ok(r) => r,
            Err(e) => {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "id": Value::Null,
                        "error": { "code": -32700, "message": format!("parse error: {}", e) }
                    }),
                )
                .await;
                continue;
            }
        };
        let id = request.id.clone().unwrap_or(Value::Null);
        let result = dispatch(&request.method, &request.params, &write).await;
        let response = match result {
            Ok(value) => RpcResponse {
                jsonrpc: "2.0",
                id,
                result: Some(value),
                error: None,
            },
            Err(msg) => RpcResponse {
                jsonrpc: "2.0",
                id,
                result: None,
                error: Some(RpcError { code: -32000, message: msg }),
            },
        };
        let payload = serde_json::to_value(&response).unwrap_or(Value::Null);
        send_json(&write, payload).await;
    }
    println!("  {} client disconnected", "-".red());
}

async fn send_json(write: &WsSink, payload: Value) {
    let s = serde_json::to_string(&payload).unwrap_or_else(|_| "{}".into());
    let mut g = write.lock().await;
    let _ = g.send(Message::Text(s)).await;
}

/// Generate a short unique-enough job id from system time.
fn new_job_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}", nanos & 0xFFFFFFFF)
}

/// Spawn an mtkclient invocation and stream its lines back over the
/// connected WebSocket as JSON-RPC `event` notifications. Returns the
/// job_id so the dashboard can correlate the events with the original
/// request.
fn spawn_mtkclient_job(args: Vec<String>, write: WsSink) -> String {
    {
        let tool = JobTool::Mtkclient;
        let job_id = new_job_id();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<mtkclient::StreamLine>();
            let args_owned = args;
            let run_task = tokio::spawn(async move {
                let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                match tool {
                    JobTool::Mtkclient => mtkclient::run_mtkclient_streaming(&refs, tx).await,
                    JobTool::Heimdall => heimdall::run_heimdall_streaming(&refs, tx).await,
                    JobTool::PipMtkclient => mtkclient::install_mtkclient_streaming(tx).await,
                    JobTool::PipEdl => qualcomm::install_edl_streaming(tx).await,
                    JobTool::EnterEdl => edl::enter_edl_streaming(tx).await,
                    JobTool::Edl => qualcomm::run_edl_streaming(&refs, tx).await,
                    JobTool::AppleInfo => apple::read_info_streaming(tx).await,
                    JobTool::ApplePwn => apple::pwn_dfu_streaming(tx).await,
                    JobTool::AppleLockdown => apple::lockdown_info_streaming(tx).await,
                    JobTool::AppleDiagnostics => apple::diagnostics_streaming(tx).await,
                    JobTool::AppleList => apple::list_devices_streaming(tx).await,
                    JobTool::AppleRestore => apple::restore_latest_streaming(tx).await,
                    JobTool::Swclone => crate::swclone::run_streaming(&refs, tx).await,
                    JobTool::Mtp => crate::mtp::run_streaming(&refs, tx).await,
                    JobTool::Official => {
                        let (tool, rest) = refs.split_first().unwrap_or((&"", &[]));
                        let rest_owned: Vec<String> = rest.iter().map(|s| (*s).to_string()).collect();
                        crate::official::run_streaming(tool, &rest_owned, tx).await
                    }
                }
            });
            while let Some(sl) = rx.recv().await {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": { "job_id": jid, "stream": sl.stream, "line": sl.line },
                    }),
                )
                .await;
            }
            let exit = match run_task.await {
                Ok(Ok(code)) => code,
                Ok(Err(e)) => {
                    send_json(
                        &write,
                        json!({
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": { "job_id": jid, "stream": "stderr", "line": format!("aether: {}", e) },
                        }),
                    )
                    .await;
                    -1
                }
                Err(_) => -1,
            };
            send_json(
                &write,
                json!({
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": { "job_id": jid, "stream": "done", "exit_code": exit },
                }),
            )
            .await;
        });
        job_id
    }
}

/// Spawn a heimdall invocation. Same protocol as spawn_mtkclient_job.
fn spawn_heimdall_job(args: Vec<String>, write: WsSink) -> String {
    {
        let tool = JobTool::Heimdall;
        let job_id = new_job_id();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<mtkclient::StreamLine>();
            let args_owned = args;
            let run_task = tokio::spawn(async move {
                let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                match tool {
                    JobTool::Mtkclient => mtkclient::run_mtkclient_streaming(&refs, tx).await,
                    JobTool::Heimdall => heimdall::run_heimdall_streaming(&refs, tx).await,
                    JobTool::PipMtkclient => mtkclient::install_mtkclient_streaming(tx).await,
                    JobTool::PipEdl => qualcomm::install_edl_streaming(tx).await,
                    JobTool::EnterEdl => edl::enter_edl_streaming(tx).await,
                    JobTool::Edl => qualcomm::run_edl_streaming(&refs, tx).await,
                    JobTool::AppleInfo => apple::read_info_streaming(tx).await,
                    JobTool::ApplePwn => apple::pwn_dfu_streaming(tx).await,
                    JobTool::AppleLockdown => apple::lockdown_info_streaming(tx).await,
                    JobTool::AppleDiagnostics => apple::diagnostics_streaming(tx).await,
                    JobTool::AppleList => apple::list_devices_streaming(tx).await,
                    JobTool::AppleRestore => apple::restore_latest_streaming(tx).await,
                    JobTool::Swclone => crate::swclone::run_streaming(&refs, tx).await,
                    JobTool::Mtp => crate::mtp::run_streaming(&refs, tx).await,
                    JobTool::Official => {
                        let (tool, rest) = refs.split_first().unwrap_or((&"", &[]));
                        let rest_owned: Vec<String> = rest.iter().map(|s| (*s).to_string()).collect();
                        crate::official::run_streaming(tool, &rest_owned, tx).await
                    }
                }
            });
            while let Some(sl) = rx.recv().await {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": { "job_id": jid, "stream": sl.stream, "line": sl.line },
                    }),
                )
                .await;
            }
            let exit = match run_task.await {
                Ok(Ok(code)) => code,
                Ok(Err(e)) => {
                    send_json(
                        &write,
                        json!({
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": { "job_id": jid, "stream": "stderr", "line": format!("aether: {}", e) },
                        }),
                    )
                    .await;
                    -1
                }
                Err(_) => -1,
            };
            send_json(
                &write,
                json!({
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": { "job_id": jid, "stream": "done", "exit_code": exit },
                }),
            )
            .await;
        });
        job_id
    }
}

/// Spawn a `pip install --user --upgrade mtkclient` job (Setup Wizard
/// auto-install). Streams pip output back as `event` notifications.
fn spawn_pip_mtkclient_job(write: WsSink) -> String {
    {
        let args: Vec<String> = Vec::new();
        let tool = JobTool::PipMtkclient;
        let job_id = new_job_id();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<mtkclient::StreamLine>();
            let args_owned = args;
            let run_task = tokio::spawn(async move {
                let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                match tool {
                    JobTool::Mtkclient => mtkclient::run_mtkclient_streaming(&refs, tx).await,
                    JobTool::Heimdall => heimdall::run_heimdall_streaming(&refs, tx).await,
                    JobTool::PipMtkclient => mtkclient::install_mtkclient_streaming(tx).await,
                    JobTool::PipEdl => qualcomm::install_edl_streaming(tx).await,
                    JobTool::EnterEdl => edl::enter_edl_streaming(tx).await,
                    JobTool::Edl => qualcomm::run_edl_streaming(&refs, tx).await,
                    JobTool::AppleInfo => apple::read_info_streaming(tx).await,
                    JobTool::ApplePwn => apple::pwn_dfu_streaming(tx).await,
                    JobTool::AppleLockdown => apple::lockdown_info_streaming(tx).await,
                    JobTool::AppleDiagnostics => apple::diagnostics_streaming(tx).await,
                    JobTool::AppleList => apple::list_devices_streaming(tx).await,
                    JobTool::AppleRestore => apple::restore_latest_streaming(tx).await,
                    JobTool::Swclone => crate::swclone::run_streaming(&refs, tx).await,
                    JobTool::Mtp => crate::mtp::run_streaming(&refs, tx).await,
                    JobTool::Official => {
                        let (tool, rest) = refs.split_first().unwrap_or((&"", &[]));
                        let rest_owned: Vec<String> = rest.iter().map(|s| (*s).to_string()).collect();
                        crate::official::run_streaming(tool, &rest_owned, tx).await
                    }
                }
            });
            while let Some(sl) = rx.recv().await {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": { "job_id": jid, "stream": sl.stream, "line": sl.line },
                    }),
                )
                .await;
            }
            let exit = match run_task.await {
                Ok(Ok(code)) => code,
                Ok(Err(e)) => {
                    send_json(
                        &write,
                        json!({
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": { "job_id": jid, "stream": "stderr", "line": format!("aether: {}", e) },
                        }),
                    )
                    .await;
                    -1
                }
                Err(_) => -1,
            };
            send_json(
                &write,
                json!({
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": { "job_id": jid, "stream": "done", "exit_code": exit },
                }),
            )
            .await;
        });
        job_id
    }
}

/// Spawn a cable-free EDL entry job (adb/fastboot reboot to 9008).
fn spawn_enter_edl_job(write: WsSink) -> String {
    {
        let args: Vec<String> = Vec::new();
        let tool = JobTool::EnterEdl;
        let job_id = new_job_id();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<mtkclient::StreamLine>();
            let args_owned = args;
            let run_task = tokio::spawn(async move {
                let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                match tool {
                    JobTool::Mtkclient => mtkclient::run_mtkclient_streaming(&refs, tx).await,
                    JobTool::Heimdall => heimdall::run_heimdall_streaming(&refs, tx).await,
                    JobTool::PipMtkclient => mtkclient::install_mtkclient_streaming(tx).await,
                    JobTool::PipEdl => qualcomm::install_edl_streaming(tx).await,
                    JobTool::EnterEdl => edl::enter_edl_streaming(tx).await,
                    JobTool::Edl => qualcomm::run_edl_streaming(&refs, tx).await,
                    JobTool::AppleInfo => apple::read_info_streaming(tx).await,
                    JobTool::ApplePwn => apple::pwn_dfu_streaming(tx).await,
                    JobTool::AppleLockdown => apple::lockdown_info_streaming(tx).await,
                    JobTool::AppleDiagnostics => apple::diagnostics_streaming(tx).await,
                    JobTool::AppleList => apple::list_devices_streaming(tx).await,
                    JobTool::AppleRestore => apple::restore_latest_streaming(tx).await,
                    JobTool::Swclone => crate::swclone::run_streaming(&refs, tx).await,
                    JobTool::Mtp => crate::mtp::run_streaming(&refs, tx).await,
                    JobTool::Official => {
                        let (tool, rest) = refs.split_first().unwrap_or((&"", &[]));
                        let rest_owned: Vec<String> = rest.iter().map(|s| (*s).to_string()).collect();
                        crate::official::run_streaming(tool, &rest_owned, tx).await
                    }
                }
            });
            while let Some(sl) = rx.recv().await {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": { "job_id": jid, "stream": sl.stream, "line": sl.line },
                    }),
                )
                .await;
            }
            let exit = match run_task.await {
                Ok(Ok(code)) => code,
                Ok(Err(e)) => {
                    send_json(
                        &write,
                        json!({
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": { "job_id": jid, "stream": "stderr", "line": format!("aether: {}", e) },
                        }),
                    )
                    .await;
                    -1
                }
                Err(_) => -1,
            };
            send_json(
                &write,
                json!({
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": { "job_id": jid, "stream": "done", "exit_code": exit },
                }),
            )
            .await;
        });
        job_id
    }
}

/// Spawn an `edl ARGS...` (Qualcomm Firehose) job.
fn spawn_edl_job(args: Vec<String>, write: WsSink) -> String {
    {
        let tool = JobTool::Edl;
        let job_id = new_job_id();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<mtkclient::StreamLine>();
            let args_owned = args;
            let run_task = tokio::spawn(async move {
                let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                match tool {
                    JobTool::Mtkclient => mtkclient::run_mtkclient_streaming(&refs, tx).await,
                    JobTool::Heimdall => heimdall::run_heimdall_streaming(&refs, tx).await,
                    JobTool::PipMtkclient => mtkclient::install_mtkclient_streaming(tx).await,
                    JobTool::PipEdl => qualcomm::install_edl_streaming(tx).await,
                    JobTool::EnterEdl => edl::enter_edl_streaming(tx).await,
                    JobTool::Edl => qualcomm::run_edl_streaming(&refs, tx).await,
                    JobTool::AppleInfo => apple::read_info_streaming(tx).await,
                    JobTool::ApplePwn => apple::pwn_dfu_streaming(tx).await,
                    JobTool::AppleLockdown => apple::lockdown_info_streaming(tx).await,
                    JobTool::AppleDiagnostics => apple::diagnostics_streaming(tx).await,
                    JobTool::AppleList => apple::list_devices_streaming(tx).await,
                    JobTool::AppleRestore => apple::restore_latest_streaming(tx).await,
                    JobTool::Swclone => crate::swclone::run_streaming(&refs, tx).await,
                    JobTool::Mtp => crate::mtp::run_streaming(&refs, tx).await,
                    JobTool::Official => {
                        let (tool, rest) = refs.split_first().unwrap_or((&"", &[]));
                        let rest_owned: Vec<String> = rest.iter().map(|s| (*s).to_string()).collect();
                        crate::official::run_streaming(tool, &rest_owned, tx).await
                    }
                }
            });
            while let Some(sl) = rx.recv().await {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": { "job_id": jid, "stream": sl.stream, "line": sl.line },
                    }),
                )
                .await;
            }
            let exit = match run_task.await {
                Ok(Ok(code)) => code,
                Ok(Err(e)) => {
                    send_json(
                        &write,
                        json!({
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": { "job_id": jid, "stream": "stderr", "line": format!("aether: {}", e) },
                        }),
                    )
                    .await;
                    -1
                }
                Err(_) => -1,
            };
            send_json(
                &write,
                json!({
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": { "job_id": jid, "stream": "done", "exit_code": exit },
                }),
            )
            .await;
        });
        job_id
    }
}

/// Spawn a `pip install --user --upgrade edlclient` job.
fn spawn_pip_edl_job(write: WsSink) -> String {
    {
        let args: Vec<String> = Vec::new();
        let tool = JobTool::PipEdl;
        let job_id = new_job_id();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<mtkclient::StreamLine>();
            let args_owned = args;
            let run_task = tokio::spawn(async move {
                let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                match tool {
                    JobTool::Mtkclient => mtkclient::run_mtkclient_streaming(&refs, tx).await,
                    JobTool::Heimdall => heimdall::run_heimdall_streaming(&refs, tx).await,
                    JobTool::PipMtkclient => mtkclient::install_mtkclient_streaming(tx).await,
                    JobTool::PipEdl => qualcomm::install_edl_streaming(tx).await,
                    JobTool::EnterEdl => edl::enter_edl_streaming(tx).await,
                    JobTool::Edl => qualcomm::run_edl_streaming(&refs, tx).await,
                    JobTool::AppleInfo => apple::read_info_streaming(tx).await,
                    JobTool::ApplePwn => apple::pwn_dfu_streaming(tx).await,
                    JobTool::AppleLockdown => apple::lockdown_info_streaming(tx).await,
                    JobTool::AppleDiagnostics => apple::diagnostics_streaming(tx).await,
                    JobTool::AppleList => apple::list_devices_streaming(tx).await,
                    JobTool::AppleRestore => apple::restore_latest_streaming(tx).await,
                    JobTool::Swclone => crate::swclone::run_streaming(&refs, tx).await,
                    JobTool::Mtp => crate::mtp::run_streaming(&refs, tx).await,
                    JobTool::Official => {
                        let (tool, rest) = refs.split_first().unwrap_or((&"", &[]));
                        let rest_owned: Vec<String> = rest.iter().map(|s| (*s).to_string()).collect();
                        crate::official::run_streaming(tool, &rest_owned, tx).await
                    }
                }
            });
            while let Some(sl) = rx.recv().await {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": { "job_id": jid, "stream": sl.stream, "line": sl.line },
                    }),
                )
                .await;
            }
            let exit = match run_task.await {
                Ok(Ok(code)) => code,
                Ok(Err(e)) => {
                    send_json(
                        &write,
                        json!({
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": { "job_id": jid, "stream": "stderr", "line": format!("aether: {}", e) },
                        }),
                    )
                    .await;
                    -1
                }
                Err(_) => -1,
            };
            send_json(
                &write,
                json!({
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": { "job_id": jid, "stream": "done", "exit_code": exit },
                }),
            )
            .await;
        });
        job_id
    }
}

/// Spawn an `irecovery -q` (Apple device info) job.
fn spawn_apple_info_job(write: WsSink) -> String {
    {
        let args: Vec<String> = Vec::new();
        let tool = JobTool::AppleInfo;
        let job_id = new_job_id();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<mtkclient::StreamLine>();
            let args_owned = args;
            let run_task = tokio::spawn(async move {
                let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                match tool {
                    JobTool::Mtkclient => mtkclient::run_mtkclient_streaming(&refs, tx).await,
                    JobTool::Heimdall => heimdall::run_heimdall_streaming(&refs, tx).await,
                    JobTool::PipMtkclient => mtkclient::install_mtkclient_streaming(tx).await,
                    JobTool::PipEdl => qualcomm::install_edl_streaming(tx).await,
                    JobTool::EnterEdl => edl::enter_edl_streaming(tx).await,
                    JobTool::Edl => qualcomm::run_edl_streaming(&refs, tx).await,
                    JobTool::AppleInfo => apple::read_info_streaming(tx).await,
                    JobTool::ApplePwn => apple::pwn_dfu_streaming(tx).await,
                    JobTool::AppleLockdown => apple::lockdown_info_streaming(tx).await,
                    JobTool::AppleDiagnostics => apple::diagnostics_streaming(tx).await,
                    JobTool::AppleList => apple::list_devices_streaming(tx).await,
                    JobTool::AppleRestore => apple::restore_latest_streaming(tx).await,
                    JobTool::Swclone => crate::swclone::run_streaming(&refs, tx).await,
                    JobTool::Mtp => crate::mtp::run_streaming(&refs, tx).await,
                    JobTool::Official => {
                        let (tool, rest) = refs.split_first().unwrap_or((&"", &[]));
                        let rest_owned: Vec<String> = rest.iter().map(|s| (*s).to_string()).collect();
                        crate::official::run_streaming(tool, &rest_owned, tx).await
                    }
                }
            });
            while let Some(sl) = rx.recv().await {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": { "job_id": jid, "stream": sl.stream, "line": sl.line },
                    }),
                )
                .await;
            }
            let exit = match run_task.await {
                Ok(Ok(code)) => code,
                Ok(Err(e)) => {
                    send_json(
                        &write,
                        json!({
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": { "job_id": jid, "stream": "stderr", "line": format!("aether: {}", e) },
                        }),
                    )
                    .await;
                    -1
                }
                Err(_) => -1,
            };
            send_json(
                &write,
                json!({
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": { "job_id": jid, "stream": "done", "exit_code": exit },
                }),
            )
            .await;
        });
        job_id
    }
}

/// Spawn a `gaster pwn` (checkm8 pwned-DFU) job.
fn spawn_apple_pwn_job(write: WsSink) -> String {
    {
        let args: Vec<String> = Vec::new();
        let tool = JobTool::ApplePwn;
        let job_id = new_job_id();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<mtkclient::StreamLine>();
            let args_owned = args;
            let run_task = tokio::spawn(async move {
                let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                match tool {
                    JobTool::Mtkclient => mtkclient::run_mtkclient_streaming(&refs, tx).await,
                    JobTool::Heimdall => heimdall::run_heimdall_streaming(&refs, tx).await,
                    JobTool::PipMtkclient => mtkclient::install_mtkclient_streaming(tx).await,
                    JobTool::PipEdl => qualcomm::install_edl_streaming(tx).await,
                    JobTool::EnterEdl => edl::enter_edl_streaming(tx).await,
                    JobTool::Edl => qualcomm::run_edl_streaming(&refs, tx).await,
                    JobTool::AppleInfo => apple::read_info_streaming(tx).await,
                    JobTool::ApplePwn => apple::pwn_dfu_streaming(tx).await,
                    JobTool::AppleLockdown => apple::lockdown_info_streaming(tx).await,
                    JobTool::AppleDiagnostics => apple::diagnostics_streaming(tx).await,
                    JobTool::AppleList => apple::list_devices_streaming(tx).await,
                    JobTool::AppleRestore => apple::restore_latest_streaming(tx).await,
                    JobTool::Swclone => crate::swclone::run_streaming(&refs, tx).await,
                    JobTool::Mtp => crate::mtp::run_streaming(&refs, tx).await,
                    JobTool::Official => {
                        let (tool, rest) = refs.split_first().unwrap_or((&"", &[]));
                        let rest_owned: Vec<String> = rest.iter().map(|s| (*s).to_string()).collect();
                        crate::official::run_streaming(tool, &rest_owned, tx).await
                    }
                }
            });
            while let Some(sl) = rx.recv().await {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": { "job_id": jid, "stream": sl.stream, "line": sl.line },
                    }),
                )
                .await;
            }
            let exit = match run_task.await {
                Ok(Ok(code)) => code,
                Ok(Err(e)) => {
                    send_json(
                        &write,
                        json!({
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": { "job_id": jid, "stream": "stderr", "line": format!("aether: {}", e) },
                        }),
                    )
                    .await;
                    -1
                }
                Err(_) => -1,
            };
            send_json(
                &write,
                json!({
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": { "job_id": jid, "stream": "done", "exit_code": exit },
                }),
            )
            .await;
        });
        job_id
    }
}

fn spawn_apple_lockdown_job(write: WsSink) -> String {
    {
        let args: Vec<String> = Vec::new();
        let tool = JobTool::AppleLockdown;
        let job_id = new_job_id();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<mtkclient::StreamLine>();
            let args_owned = args;
            let run_task = tokio::spawn(async move {
                let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                match tool {
                    JobTool::Mtkclient => mtkclient::run_mtkclient_streaming(&refs, tx).await,
                    JobTool::Heimdall => heimdall::run_heimdall_streaming(&refs, tx).await,
                    JobTool::PipMtkclient => mtkclient::install_mtkclient_streaming(tx).await,
                    JobTool::PipEdl => qualcomm::install_edl_streaming(tx).await,
                    JobTool::EnterEdl => edl::enter_edl_streaming(tx).await,
                    JobTool::Edl => qualcomm::run_edl_streaming(&refs, tx).await,
                    JobTool::AppleInfo => apple::read_info_streaming(tx).await,
                    JobTool::ApplePwn => apple::pwn_dfu_streaming(tx).await,
                    JobTool::AppleLockdown => apple::lockdown_info_streaming(tx).await,
                    JobTool::AppleDiagnostics => apple::diagnostics_streaming(tx).await,
                    JobTool::AppleList => apple::list_devices_streaming(tx).await,
                    JobTool::AppleRestore => apple::restore_latest_streaming(tx).await,
                    JobTool::Swclone => crate::swclone::run_streaming(&refs, tx).await,
                    JobTool::Mtp => crate::mtp::run_streaming(&refs, tx).await,
                    JobTool::Official => {
                        let (tool, rest) = refs.split_first().unwrap_or((&"", &[]));
                        let rest_owned: Vec<String> = rest.iter().map(|s| (*s).to_string()).collect();
                        crate::official::run_streaming(tool, &rest_owned, tx).await
                    }
                }
            });
            while let Some(sl) = rx.recv().await {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": { "job_id": jid, "stream": sl.stream, "line": sl.line },
                    }),
                )
                .await;
            }
            let exit = match run_task.await {
                Ok(Ok(code)) => code,
                Ok(Err(e)) => {
                    send_json(
                        &write,
                        json!({
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": { "job_id": jid, "stream": "stderr", "line": format!("aether: {}", e) },
                        }),
                    )
                    .await;
                    -1
                }
                Err(_) => -1,
            };
            send_json(
                &write,
                json!({
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": { "job_id": jid, "stream": "done", "exit_code": exit },
                }),
            )
            .await;
        });
        job_id
    }
}

fn spawn_apple_diagnostics_job(write: WsSink) -> String {
    {
        let args: Vec<String> = Vec::new();
        let tool = JobTool::AppleDiagnostics;
        let job_id = new_job_id();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<mtkclient::StreamLine>();
            let args_owned = args;
            let run_task = tokio::spawn(async move {
                let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                match tool {
                    JobTool::Mtkclient => mtkclient::run_mtkclient_streaming(&refs, tx).await,
                    JobTool::Heimdall => heimdall::run_heimdall_streaming(&refs, tx).await,
                    JobTool::PipMtkclient => mtkclient::install_mtkclient_streaming(tx).await,
                    JobTool::PipEdl => qualcomm::install_edl_streaming(tx).await,
                    JobTool::EnterEdl => edl::enter_edl_streaming(tx).await,
                    JobTool::Edl => qualcomm::run_edl_streaming(&refs, tx).await,
                    JobTool::AppleInfo => apple::read_info_streaming(tx).await,
                    JobTool::ApplePwn => apple::pwn_dfu_streaming(tx).await,
                    JobTool::AppleLockdown => apple::lockdown_info_streaming(tx).await,
                    JobTool::AppleDiagnostics => apple::diagnostics_streaming(tx).await,
                    JobTool::AppleList => apple::list_devices_streaming(tx).await,
                    JobTool::AppleRestore => apple::restore_latest_streaming(tx).await,
                    JobTool::Swclone => crate::swclone::run_streaming(&refs, tx).await,
                    JobTool::Mtp => crate::mtp::run_streaming(&refs, tx).await,
                    JobTool::Official => {
                        let (tool, rest) = refs.split_first().unwrap_or((&"", &[]));
                        let rest_owned: Vec<String> = rest.iter().map(|s| (*s).to_string()).collect();
                        crate::official::run_streaming(tool, &rest_owned, tx).await
                    }
                }
            });
            while let Some(sl) = rx.recv().await {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": { "job_id": jid, "stream": sl.stream, "line": sl.line },
                    }),
                )
                .await;
            }
            let exit = match run_task.await {
                Ok(Ok(code)) => code,
                Ok(Err(e)) => {
                    send_json(
                        &write,
                        json!({
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": { "job_id": jid, "stream": "stderr", "line": format!("aether: {}", e) },
                        }),
                    )
                    .await;
                    -1
                }
                Err(_) => -1,
            };
            send_json(
                &write,
                json!({
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": { "job_id": jid, "stream": "done", "exit_code": exit },
                }),
            )
            .await;
        });
        job_id
    }
}

fn spawn_apple_list_job(write: WsSink) -> String {
    {
        let args: Vec<String> = Vec::new();
        let tool = JobTool::AppleList;
        let job_id = new_job_id();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<mtkclient::StreamLine>();
            let args_owned = args;
            let run_task = tokio::spawn(async move {
                let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                match tool {
                    JobTool::Mtkclient => mtkclient::run_mtkclient_streaming(&refs, tx).await,
                    JobTool::Heimdall => heimdall::run_heimdall_streaming(&refs, tx).await,
                    JobTool::PipMtkclient => mtkclient::install_mtkclient_streaming(tx).await,
                    JobTool::PipEdl => qualcomm::install_edl_streaming(tx).await,
                    JobTool::EnterEdl => edl::enter_edl_streaming(tx).await,
                    JobTool::Edl => qualcomm::run_edl_streaming(&refs, tx).await,
                    JobTool::AppleInfo => apple::read_info_streaming(tx).await,
                    JobTool::ApplePwn => apple::pwn_dfu_streaming(tx).await,
                    JobTool::AppleLockdown => apple::lockdown_info_streaming(tx).await,
                    JobTool::AppleDiagnostics => apple::diagnostics_streaming(tx).await,
                    JobTool::AppleList => apple::list_devices_streaming(tx).await,
                    JobTool::AppleRestore => apple::restore_latest_streaming(tx).await,
                    JobTool::Swclone => crate::swclone::run_streaming(&refs, tx).await,
                    JobTool::Mtp => crate::mtp::run_streaming(&refs, tx).await,
                    JobTool::Official => {
                        let (tool, rest) = refs.split_first().unwrap_or((&"", &[]));
                        let rest_owned: Vec<String> = rest.iter().map(|s| (*s).to_string()).collect();
                        crate::official::run_streaming(tool, &rest_owned, tx).await
                    }
                }
            });
            while let Some(sl) = rx.recv().await {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": { "job_id": jid, "stream": sl.stream, "line": sl.line },
                    }),
                )
                .await;
            }
            let exit = match run_task.await {
                Ok(Ok(code)) => code,
                Ok(Err(e)) => {
                    send_json(
                        &write,
                        json!({
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": { "job_id": jid, "stream": "stderr", "line": format!("aether: {}", e) },
                        }),
                    )
                    .await;
                    -1
                }
                Err(_) => -1,
            };
            send_json(
                &write,
                json!({
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": { "job_id": jid, "stream": "done", "exit_code": exit },
                }),
            )
            .await;
        });
        job_id
    }
}

fn spawn_apple_restore_job(write: WsSink) -> String {
    {
        let args: Vec<String> = Vec::new();
        let tool = JobTool::AppleRestore;
        let job_id = new_job_id();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<mtkclient::StreamLine>();
            let args_owned = args;
            let run_task = tokio::spawn(async move {
                let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                match tool {
                    JobTool::Mtkclient => mtkclient::run_mtkclient_streaming(&refs, tx).await,
                    JobTool::Heimdall => heimdall::run_heimdall_streaming(&refs, tx).await,
                    JobTool::PipMtkclient => mtkclient::install_mtkclient_streaming(tx).await,
                    JobTool::PipEdl => qualcomm::install_edl_streaming(tx).await,
                    JobTool::EnterEdl => edl::enter_edl_streaming(tx).await,
                    JobTool::Edl => qualcomm::run_edl_streaming(&refs, tx).await,
                    JobTool::AppleInfo => apple::read_info_streaming(tx).await,
                    JobTool::ApplePwn => apple::pwn_dfu_streaming(tx).await,
                    JobTool::AppleLockdown => apple::lockdown_info_streaming(tx).await,
                    JobTool::AppleDiagnostics => apple::diagnostics_streaming(tx).await,
                    JobTool::AppleList => apple::list_devices_streaming(tx).await,
                    JobTool::AppleRestore => apple::restore_latest_streaming(tx).await,
                    JobTool::Swclone => crate::swclone::run_streaming(&refs, tx).await,
                    JobTool::Mtp => crate::mtp::run_streaming(&refs, tx).await,
                    JobTool::Official => {
                        let (tool, rest) = refs.split_first().unwrap_or((&"", &[]));
                        let rest_owned: Vec<String> = rest.iter().map(|s| (*s).to_string()).collect();
                        crate::official::run_streaming(tool, &rest_owned, tx).await
                    }
                }
            });
            while let Some(sl) = rx.recv().await {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": { "job_id": jid, "stream": sl.stream, "line": sl.line },
                    }),
                )
                .await;
            }
            let exit = match run_task.await {
                Ok(Ok(code)) => code,
                Ok(Err(e)) => {
                    send_json(
                        &write,
                        json!({
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": { "job_id": jid, "stream": "stderr", "line": format!("aether: {}", e) },
                        }),
                    )
                    .await;
                    -1
                }
                Err(_) => -1,
            };
            send_json(
                &write,
                json!({
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": { "job_id": jid, "stream": "done", "exit_code": exit },
                }),
            )
            .await;
        });
        job_id
    }
}

fn spawn_swclone_job(args: Vec<String>, write: WsSink) -> String {
    {
        let tool = JobTool::Swclone;
        let job_id = new_job_id();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<mtkclient::StreamLine>();
            let args_owned = args;
            let run_task = tokio::spawn(async move {
                let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                match tool {
                    JobTool::Mtkclient => mtkclient::run_mtkclient_streaming(&refs, tx).await,
                    JobTool::Heimdall => heimdall::run_heimdall_streaming(&refs, tx).await,
                    JobTool::PipMtkclient => mtkclient::install_mtkclient_streaming(tx).await,
                    JobTool::PipEdl => qualcomm::install_edl_streaming(tx).await,
                    JobTool::EnterEdl => edl::enter_edl_streaming(tx).await,
                    JobTool::Edl => qualcomm::run_edl_streaming(&refs, tx).await,
                    JobTool::AppleInfo => apple::read_info_streaming(tx).await,
                    JobTool::ApplePwn => apple::pwn_dfu_streaming(tx).await,
                    JobTool::AppleLockdown => apple::lockdown_info_streaming(tx).await,
                    JobTool::AppleDiagnostics => apple::diagnostics_streaming(tx).await,
                    JobTool::AppleList => apple::list_devices_streaming(tx).await,
                    JobTool::AppleRestore => apple::restore_latest_streaming(tx).await,
                    JobTool::Swclone => crate::swclone::run_streaming(&refs, tx).await,
                    JobTool::Mtp => crate::mtp::run_streaming(&refs, tx).await,
                    JobTool::Official => {
                        let (tool, rest) = refs.split_first().unwrap_or((&"", &[]));
                        let rest_owned: Vec<String> = rest.iter().map(|s| (*s).to_string()).collect();
                        crate::official::run_streaming(tool, &rest_owned, tx).await
                    }
                }
            });
            while let Some(sl) = rx.recv().await {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": { "job_id": jid, "stream": sl.stream, "line": sl.line },
                    }),
                )
                .await;
            }
            let exit = match run_task.await {
                Ok(Ok(code)) => code,
                Ok(Err(e)) => {
                    send_json(
                        &write,
                        json!({
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": { "job_id": jid, "stream": "stderr", "line": format!("aether: {}", e) },
                        }),
                    )
                    .await;
                    -1
                }
                Err(_) => -1,
            };
            send_json(
                &write,
                json!({
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": { "job_id": jid, "stream": "done", "exit_code": exit },
                }),
            )
            .await;
        });
        job_id
    }
}

fn spawn_mtp_job(args: Vec<String>, write: WsSink) -> String {
    {
        let tool = JobTool::Mtp;
        let job_id = new_job_id();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<mtkclient::StreamLine>();
            let args_owned = args;
            let run_task = tokio::spawn(async move {
                let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                match tool {
                    JobTool::Mtkclient => mtkclient::run_mtkclient_streaming(&refs, tx).await,
                    JobTool::Heimdall => heimdall::run_heimdall_streaming(&refs, tx).await,
                    JobTool::PipMtkclient => mtkclient::install_mtkclient_streaming(tx).await,
                    JobTool::PipEdl => qualcomm::install_edl_streaming(tx).await,
                    JobTool::EnterEdl => edl::enter_edl_streaming(tx).await,
                    JobTool::Edl => qualcomm::run_edl_streaming(&refs, tx).await,
                    JobTool::AppleInfo => apple::read_info_streaming(tx).await,
                    JobTool::ApplePwn => apple::pwn_dfu_streaming(tx).await,
                    JobTool::AppleLockdown => apple::lockdown_info_streaming(tx).await,
                    JobTool::AppleDiagnostics => apple::diagnostics_streaming(tx).await,
                    JobTool::AppleList => apple::list_devices_streaming(tx).await,
                    JobTool::AppleRestore => apple::restore_latest_streaming(tx).await,
                    JobTool::Swclone => crate::swclone::run_streaming(&refs, tx).await,
                    JobTool::Mtp => crate::mtp::run_streaming(&refs, tx).await,
                    JobTool::Official => {
                        let (tool, rest) = refs.split_first().unwrap_or((&"", &[]));
                        let rest_owned: Vec<String> = rest.iter().map(|s| (*s).to_string()).collect();
                        crate::official::run_streaming(tool, &rest_owned, tx).await
                    }
                }
            });
            while let Some(sl) = rx.recv().await {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": { "job_id": jid, "stream": sl.stream, "line": sl.line },
                    }),
                )
                .await;
            }
            let exit = match run_task.await {
                Ok(Ok(code)) => code,
                Ok(Err(e)) => {
                    send_json(
                        &write,
                        json!({
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": { "job_id": jid, "stream": "stderr", "line": format!("aether: {}", e) },
                        }),
                    )
                    .await;
                    -1
                }
                Err(_) => -1,
            };
            send_json(
                &write,
                json!({
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": { "job_id": jid, "stream": "done", "exit_code": exit },
                }),
            )
            .await;
        });
        job_id
    }
}

fn spawn_official_job(args: Vec<String>, write: WsSink) -> String {
    {
        let tool = JobTool::Official;
        let job_id = new_job_id();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<mtkclient::StreamLine>();
            let args_owned = args;
            let run_task = tokio::spawn(async move {
                let refs: Vec<&str> = args_owned.iter().map(|s| s.as_str()).collect();
                match tool {
                    JobTool::Mtkclient => mtkclient::run_mtkclient_streaming(&refs, tx).await,
                    JobTool::Heimdall => heimdall::run_heimdall_streaming(&refs, tx).await,
                    JobTool::PipMtkclient => mtkclient::install_mtkclient_streaming(tx).await,
                    JobTool::PipEdl => qualcomm::install_edl_streaming(tx).await,
                    JobTool::EnterEdl => edl::enter_edl_streaming(tx).await,
                    JobTool::Edl => qualcomm::run_edl_streaming(&refs, tx).await,
                    JobTool::AppleInfo => apple::read_info_streaming(tx).await,
                    JobTool::ApplePwn => apple::pwn_dfu_streaming(tx).await,
                    JobTool::AppleLockdown => apple::lockdown_info_streaming(tx).await,
                    JobTool::AppleDiagnostics => apple::diagnostics_streaming(tx).await,
                    JobTool::AppleList => apple::list_devices_streaming(tx).await,
                    JobTool::AppleRestore => apple::restore_latest_streaming(tx).await,
                    JobTool::Swclone => crate::swclone::run_streaming(&refs, tx).await,
                    JobTool::Mtp => crate::mtp::run_streaming(&refs, tx).await,
                    JobTool::Official => {
                        let (tool, rest) = refs.split_first().unwrap_or((&"", &[]));
                        let rest_owned: Vec<String> = rest.iter().map(|s| (*s).to_string()).collect();
                        crate::official::run_streaming(tool, &rest_owned, tx).await
                    }
                }
            });
            while let Some(sl) = rx.recv().await {
                send_json(
                    &write,
                    json!({
                        "jsonrpc": "2.0",
                        "method": "event",
                        "params": { "job_id": jid, "stream": sl.stream, "line": sl.line },
                    }),
                )
                .await;
            }
            let exit = match run_task.await {
                Ok(Ok(code)) => code,
                Ok(Err(e)) => {
                    send_json(
                        &write,
                        json!({
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": { "job_id": jid, "stream": "stderr", "line": format!("aether: {}", e) },
                        }),
                    )
                    .await;
                    -1
                }
                Err(_) => -1,
            };
            send_json(
                &write,
                json!({
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": { "job_id": jid, "stream": "done", "exit_code": exit },
                }),
            )
            .await;
        });
        job_id
    }
}

#[derive(Clone)]
enum JobTool {
    Mtkclient,
    Heimdall,
    PipMtkclient,
    PipEdl,
    EnterEdl,
    Edl,
    AppleInfo,
    ApplePwn,
    AppleLockdown,
    AppleDiagnostics,
    AppleList,
    AppleRestore,
    Swclone,
    Mtp,
    Official,
}



async fn dispatch(method: &str, params: &Value, write: &WsSink) -> Result<Value, String> {
    match method {
        "hello" => {
            let mtk_version = mtkclient::check_mtkclient().ok();
            let heimdall_version = heimdall::check_heimdall().ok();
            let edl_version = qualcomm::check_edl().ok();
            let apple_version = apple::check_apple().ok();
            Ok(json!({
                "name": "aether-cli",
                "version": CLI_VERSION,
                "bridge": BRIDGE_VERSION,
                "mtkclient": mtk_version,
                "heimdall": heimdall_version,
                "edl": edl_version,
                "apple": apple_version,
                "capabilities": [
                    "devices",
                    "info",
                    "mtk.frp_bypass",
                    "mtk.repair_imei",
                    "mtk.unlock_bootloader",
                    "mtk.erase_userdata",
                    "mtk.read_info",
                    "mtk.disable_auth",
                    "mtk.read_frp",
                    "unlock.auto",
                    "android.remove_screen_lock",
                    "samsung.detect",
                    "samsung.read_pit",
                    "samsung.factory_reset",
                    "samsung.swclone",
                    "phones.identify",
                    "mtp.detect",
                    "mtp.report",
                    "mtp.list",
                    "mtp.pull",
                    "mtp.info",
                    "official.run",
                    "qualcomm.enter_edl",
                    "qualcomm.read_info",
                    "qualcomm.edl_auth_unlock",
                    "qualcomm.cert_repair",
                    "qualcomm.safe_format",
                    "apple.read_info",
                    "apple.lockdown_info",
                    "apple.diagnostics",
                    "apple.list",
                    "apple.restore_latest",
                    "apple.pwn_dfu",
                    "setup.doctor",
                    "setup.install_mtkclient",
                    "setup.install_edl"
                ],
            }))
        }
        "devices" => Ok(json!({ "devices": crate::usb::devices_as_json().unwrap_or_default() })),
        "phones.identify" => Ok(crate::identify::identify().await),
        // Explicit Qualcomm EDL / 9008 mode detection.
        "qualcomm.detect_edl" => {
            let devices = crate::usb::detect_edl_devices();
            Ok(json!({
                "detected": !devices.is_empty(),
                "count": devices.len(),
                "devices": devices,
            }))
        }
        // Android MTP (file transfer) detection.
        "mtp.detect" => {
            let devices = crate::usb::detect_mtp_devices();
            Ok(json!({
                "detected": !devices.is_empty(),
                "count": devices.len(),
                "devices": devices,
            }))
        }
        "mtp.report" => {
            let job_id = spawn_mtp_job(vec!["detect".into()], write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "mtp.list" => {
            let mut args = vec!["list".into()];
            if let Some(path) = params.get("path").and_then(|v| v.as_str()) {
                if !path.is_empty() {
                    args.push(path.to_string());
                }
            }
            let job_id = spawn_mtp_job(args, write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "mtp.pull" => {
            let mut args = vec!["pull".into()];
            let path = params.get("path").and_then(|v| v.as_str()).unwrap_or("");
            args.push(path.to_string());
            if let Some(dest) = params.get("dest").and_then(|v| v.as_str()) {
                if !dest.is_empty() {
                    args.push(dest.to_string());
                }
            }
            let job_id = spawn_mtp_job(args, write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "mtp.info" => {
            let job_id = spawn_mtp_job(vec!["info".into()], write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "official.run" => {
            let tool = params.get("tool").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let mut args = vec![tool];
            if let Some(list) = params.get("args").and_then(|v| v.as_array()) {
                args.extend(list.iter().filter_map(|v| v.as_str().map(|s| s.to_string())));
            }
            let job_id = spawn_official_job(args, write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }

        // Cable-free EDL entry: reboot an ADB/fastboot device into Qualcomm 9008.
        "qualcomm.enter_edl" => {
            let job_id = spawn_enter_edl_job(write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        // Qualcomm Firehose read: dump the GPT partition table.
        "qualcomm.read_info" => {
            let job_id = spawn_edl_job(vec!["printgpt".into()], write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        // Qualcomm auth/FRP removal: erase the FRP (frp) partition over Firehose.
        "qualcomm.edl_auth_unlock" => {
            let job_id = spawn_edl_job(vec!["e".into(), "frp".into()], write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        // Cert / IMEI repair first step: back up the modem NV (modemst1) partition.
        "qualcomm.cert_repair" => {
            let job_id = spawn_edl_job(
                vec!["r".into(), "modemst1".into(), "modemst1.bin".into()],
                write.clone(),
            );
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        // Qualcomm safe format: erase userdata over Firehose.
        "qualcomm.safe_format" => {
            let job_id = spawn_edl_job(vec!["e".into(), "userdata".into()], write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }

        // ─── Apple (checkm8 / libimobiledevice) operations ────────────────
        "apple.read_info" => {
            let job_id = spawn_apple_info_job(write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "apple.pwn_dfu" => {
            let job_id = spawn_apple_pwn_job(write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "apple.lockdown_info" => {
            let job_id = spawn_apple_lockdown_job(write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "apple.diagnostics" => {
            let job_id = spawn_apple_diagnostics_job(write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "apple.list" => {
            let job_id = spawn_apple_list_job(write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        // Official Apple-signed erase restore. Does not skip Activation Lock.
        "apple.restore_latest" => {
            let job_id = spawn_apple_restore_job(write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }

        // ─── MTK extra operations (mtkclient) ─────────────────────────────
        // Disable BootROM DA auth (SLA/DAA) by sending mtkclient's payload.
        "mtk.disable_auth" => {
            let job_id = spawn_mtkclient_job(vec!["payload".into()], write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        // Read / back up the FRP partition to a file.
        "mtk.read_frp" => {
            let job_id = spawn_mtkclient_job(
                vec!["r".into(), "frp".into(), "frp.bin".into()],
                write.clone(),
            );
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }

        "mtk.read_info" => {
            let job_id = spawn_mtkclient_job(vec!["printgpt".into()], write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "mtk.frp_bypass" => {
            let job_id = spawn_mtkclient_job(vec!["e".into(), "frp".into()], write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "mtk.repair_imei" => {
            let imei1 = params
                .get("imei1")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "imei1 is required".to_string())?
                .to_string();
            let imei2 = params.get("imei2").and_then(|v| v.as_str()).map(|s| s.to_string());
            let mut args = vec!["w".into(), "imei".into(), imei1];
            if let Some(i2) = imei2 {
                args.push(i2);
            }
            let job_id = spawn_mtkclient_job(args, write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "mtk.unlock_bootloader" => {
            let job_id = spawn_mtkclient_job(
                vec!["da".into(), "seccfg".into(), "unlock".into()],
                write.clone(),
            );
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "mtk.erase_userdata" => {
            let job_id = spawn_mtkclient_job(
                vec!["e".into(), "userdata,metadata".into()],
                write.clone(),
            );
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }

        // Universal auto-unlock: erase the FRP partition (Google account lock)
        // — the most common one-tap unlock for MediaTek targets in BROM.
        "unlock.auto" => {
            let job_id = spawn_mtkclient_job(vec!["e".into(), "frp".into()], write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }

        // Remove screen lock (pattern / PIN / password) by wiping the
        // locksettings in userdata + metadata. Destructive to user data.
        "android.remove_screen_lock" => {
            let job_id = spawn_mtkclient_job(
                vec!["e".into(), "userdata,metadata".into()],
                write.clone(),
            );
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }

        // ─── Samsung (Heimdall) operations ────────────────────────────────
        "samsung.detect" => {
            let job_id = spawn_heimdall_job(vec!["detect".into()], write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "samsung.read_pit" => {
            let job_id = spawn_heimdall_job(vec!["print-pit".into()], write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "samsung.swclone" => {
            let args = match params.get("args").and_then(|v| v.as_array()) {
                Some(list) => list
                    .iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>(),
                None => vec!["devices".into()],
            };
            let args = if args.is_empty() {
                vec!["devices".into()]
            } else {
                args
            };
            let job_id = spawn_swclone_job(args, write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "samsung.factory_reset" => {
            // Erase USERDATA — the core factory-reset operation.
            // CACHE and METADATA are handled by separate calls so the
            // dashboard can stream them individually; for the
            // single-button UX we fire just USERDATA here (the largest /
            // most user-facing partition).
            let job_id = spawn_heimdall_job(
                vec!["erase".into(), "--partition".into(), "USERDATA".into()],
                write.clone(),
            );
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }

        // ─── Setup Wizard ─────────────────────────────────────────────────
        "setup.doctor" => Ok(json!({
            "python": mtkclient::check_python().ok(),
            "mtkclient": mtkclient::check_mtkclient().ok(),
            "heimdall": heimdall::check_heimdall().ok(),
            "edl": qualcomm::check_edl().ok(),
            "apple": apple::check_apple().ok(),
        })),
        "setup.install_mtkclient" => {
            let job_id = spawn_pip_mtkclient_job(write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }
        "setup.install_edl" => {
            let job_id = spawn_pip_edl_job(write.clone());
            Ok(json!({ "job_id": job_id, "status": "started" }))
        }

        "doctor" => match mtkclient::check_mtkclient() {
            Ok(v) => Ok(json!({
                "mtkclient": v,
                "heimdall": heimdall::check_heimdall().ok(),
                "edl": qualcomm::check_edl().ok(),
                "apple": apple::check_apple().ok(),
                "ok": true
            })),
            Err(e) => Ok(json!({
                "mtkclient": null,
                "heimdall": heimdall::check_heimdall().ok(),
                "edl": qualcomm::check_edl().ok(),
                "apple": apple::check_apple().ok(),
                "ok": false,
                "error": e.to_string()
            })),
        },

        other => Err(format!("unknown method: {}", other)),
    }
}
