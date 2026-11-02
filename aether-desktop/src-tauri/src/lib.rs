// Aether Desktop — native window for the local repair bench.
//
// The window loads the dashboard at http://localhost:3000.
// On launch this process starts the CLI bridge, the API, and the dashboard
// only when their ports are closed. A server that is already running is left
// alone, and it is not stopped when the window closes.

use serde::Serialize;
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const UI_PORT: u16 = 3000;
const API_PORT: u16 = 8001;
const CLI_PORT: u16 = 8765;
const STATIC_PORT: u16 = 4173;

static OWNED: Mutex<Vec<Child>> = Mutex::new(Vec::new());

#[derive(Serialize)]
struct AppInfo {
    name: &'static str,
    version: &'static str,
    platform: &'static str,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "aether-desktop",
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
    }
}

fn port_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(250),
    )
    .is_ok()
}

fn wait_port(port: u16, limit: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < limit {
        if port_open(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    port_open(port)
}

fn search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            push_ancestors(&mut roots, dir);
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        push_ancestors(&mut roots, &cwd);
    }
    roots
}

fn push_ancestors(out: &mut Vec<PathBuf>, start: &Path) {
    let mut cur = start.to_path_buf();
    for _ in 0..8 {
        if !out.iter().any(|p| p == &cur) {
            out.push(cur.clone());
        }
        if !cur.pop() {
            break;
        }
    }
}

fn log_file(name: &str) -> Stdio {
    let path = std::env::temp_dir().join(name);
    match OpenOptions::new().create(true).append(true).open(path) {
        Ok(file) => Stdio::from(file),
        Err(_) => Stdio::null(),
    }
}

fn hidden(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

fn remember(child: Child) {
    if let Ok(mut owned) = OWNED.lock() {
        owned.push(child);
    }
}

fn stop_owned() {
    if let Ok(mut owned) = OWNED.lock() {
        for child in owned.iter_mut() {
            let _ = child.kill();
        }
        owned.clear();
    }
}

fn find_cli() -> Option<PathBuf> {
    for root in search_roots() {
        for rel in [
            "aether-cli/target/debug/aether-cli.exe",
            "aether-cli/target/release/aether-cli.exe",
            "aether-cli.exe",
        ] {
            let path = root.join(rel);
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

fn find_backend() -> Option<(PathBuf, PathBuf)> {
    for root in search_roots() {
        let backend = root.join("backend");
        let server = backend.join("server.py");
        let python = backend.join(".venv").join("Scripts").join("python.exe");
        if server.is_file() && python.is_file() {
            return Some((backend, python));
        }
    }
    None
}

fn find_frontend() -> Option<PathBuf> {
    for root in search_roots() {
        let frontend = root.join("frontend");
        let start = frontend
            .join("node_modules")
            .join("@craco")
            .join("craco")
            .join("dist")
            .join("scripts")
            .join("start.js");
        if start.is_file() {
            return Some(frontend);
        }
    }
    None
}

fn find_frontend_build() -> Option<PathBuf> {
    for root in search_roots() {
        let build = root.join("frontend").join("build");
        if build.join("index.html").is_file() {
            return Some(build);
        }
    }
    None
}

fn ensure_cli() {
    if port_open(CLI_PORT) {
        eprintln!("aether-cli already listening on {CLI_PORT}");
        return;
    }
    let Some(exe) = find_cli() else {
        eprintln!("aether-cli.exe was not found; the dashboard bridge stays offline");
        return;
    };
    let mut cmd = Command::new(&exe);
    cmd.arg("--no-banner")
        .arg("serve")
        .current_dir(exe.parent().unwrap_or(Path::new(".")))
        .stdin(Stdio::null())
        .stdout(log_file("aether-desktop-cli.log"))
        .stderr(log_file("aether-desktop-cli.log"));
    match hidden(&mut cmd).spawn() {
        Ok(child) => {
            eprintln!("started {}", exe.display());
            remember(child);
        }
        Err(err) => eprintln!("could not start aether-cli: {err}"),
    }
}

fn ensure_api() {
    if port_open(API_PORT) {
        eprintln!("API already listening on {API_PORT}");
        return;
    }
    let Some((backend, python)) = find_backend() else {
        eprintln!("backend/.venv was not found; API stays offline");
        return;
    };
    let mut cmd = Command::new(python);
    cmd.args(["-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8001"])
        .current_dir(backend)
        .stdin(Stdio::null())
        .stdout(log_file("aether-desktop-api.log"))
        .stderr(log_file("aether-desktop-api.log"));
    match hidden(&mut cmd).spawn() {
        Ok(child) => {
            eprintln!("started API on {API_PORT}");
            remember(child);
        }
        Err(err) => eprintln!("could not start API: {err}"),
    }
}

fn ensure_frontend() {
    if port_open(UI_PORT) {
        eprintln!("dashboard already listening on {UI_PORT}");
        return;
    }
    let Some(frontend) = find_frontend() else {
        eprintln!("frontend dev server was not found");
        return;
    };
    let script = frontend
        .join("node_modules")
        .join("@craco")
        .join("craco")
        .join("dist")
        .join("scripts")
        .join("start.js");
    let mut cmd = Command::new("node");
    cmd.arg(script)
        .current_dir(&frontend)
        .env("BROWSER", "none")
        .stdin(Stdio::null())
        .stdout(log_file("aether-desktop-ui.log"))
        .stderr(log_file("aether-desktop-ui.log"));
    match hidden(&mut cmd).spawn() {
        Ok(child) => {
            eprintln!("started dashboard on {UI_PORT}");
            remember(child);
        }
        Err(err) => eprintln!("could not start dashboard: {err}"),
    }
}

fn content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "txt" => "text/plain; charset=utf-8",
        "webmanifest" => "application/manifest+json",
        _ => "application/octet-stream",
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16) {
                out.push(hex);
                i += 3;
                continue;
            }
        }
        out.push(if bytes[i] == b'+' { b' ' } else { bytes[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn resolve_asset(root: &Path, req_path: &str) -> Option<PathBuf> {
    let raw = req_path.split('?').next().unwrap_or("/");
    let decoded = percent_decode(raw);
    let rel = decoded.trim_start_matches('/');
    if rel.split(['/', '\\']).any(|part| part == "..") {
        return None;
    }
    let candidate = if rel.is_empty() {
        root.join("index.html")
    } else {
        root.join(rel)
    };
    if candidate.is_file() {
        return Some(candidate);
    }
    let last = Path::new(rel)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    if !last.contains('.') {
        let index = root.join("index.html");
        if index.is_file() {
            return Some(index);
        }
    }
    None
}

fn serve_build(root: PathBuf) {
    let listener = match std::net::TcpListener::bind(("127.0.0.1", STATIC_PORT)) {
        Ok(listener) => listener,
        Err(err) => {
            eprintln!("UI fallback port {STATIC_PORT} is unavailable: {err}");
            return;
        }
    };
    eprintln!("serving {} on http://localhost:{STATIC_PORT}", root.display());
    for conn in listener.incoming() {
        let mut stream = match conn {
            Ok(stream) => stream,
            Err(_) => continue,
        };
        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
        let mut buf = [0_u8; 4096];
        let n = stream.read(&mut buf).unwrap_or(0);
        let head = String::from_utf8_lossy(&buf[..n]);
        let req_path = head
            .split_whitespace()
            .nth(1)
            .unwrap_or("/");
        let (status, body, mime) = if let Some(path) = resolve_asset(&root, req_path) {
            match std::fs::read(&path) {
                Ok(body) => ("200 OK", body, content_type(&path)),
                Err(_) => ("404 Not Found", b"not found".to_vec(), "text/plain"),
            }
        } else {
            ("404 Not Found", b"not found".to_vec(), "text/plain")
        };
        let header = format!(
            "HTTP/1.1 {status}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        let _ = stream.write_all(header.as_bytes());
        let _ = stream.write_all(&body);
    }
}

fn open_dashboard(app: &tauri::App) {
    let ui_was_up = port_open(UI_PORT);
    ensure_frontend();
    if ui_was_up {
        return;
    }
    if wait_port(UI_PORT, Duration::from_secs(90)) {
        if let Some(window) = app.get_webview_window("main") {
            if let Ok(url) = "http://localhost:3000".parse() {
                let _ = window.navigate(url);
            }
        }
        return;
    }
    if port_open(STATIC_PORT) {
        return;
    }
    let Some(build) = find_frontend_build() else {
        eprintln!("dashboard is not on {UI_PORT} and frontend/build is missing");
        return;
    };
    std::thread::spawn(move || serve_build(build));
    if wait_port(STATIC_PORT, Duration::from_secs(3)) {
        if let Some(window) = app.get_webview_window("main") {
            if let Ok(url) = format!("http://localhost:{STATIC_PORT}").parse() {
                let _ = window.navigate(url);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            ensure_cli();
            ensure_api();
            open_dashboard(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_info])
        .build(tauri::generate_context!())
        .expect("error while building Aether Desktop")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                stop_owned();
            }
        });
}
