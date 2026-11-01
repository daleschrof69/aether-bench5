// Aether Desktop — Tauri v2 library entry.
//
// Today this is a thin wrapper around the deployed web dashboard.
// Tomorrow, when `aether-cli` has real exploit modules, swap the `invoke`
// calls in the frontend to talk to the IPC commands declared below — no
// external WebSocket bridge needed inside the bundled desktop app.

use serde::Serialize;

#[derive(Serialize)]
struct AppInfo {
    name: &'static str,
    version: &'static str,
    platform: &'static str,
}

/// Returns basic app metadata. Called from the React app via
/// `import { invoke } from '@tauri-apps/api/core'; invoke('app_info');`
#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "aether-desktop",
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running Aether Desktop");
}
