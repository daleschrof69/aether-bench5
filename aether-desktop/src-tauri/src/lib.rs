//! Aether Desktop: installed UI, local API and CLI, owned by one native window.
mod runtime;
use std::sync::Mutex;
use tauri::Manager;
static OWNED: Mutex<Option<runtime::Runtime>> = Mutex::new(None);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let resources = app.path().resource_dir()?;
            let data = app.path().app_local_data_dir()?;
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut owned = OWNED.lock().unwrap();
                let token = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
                match runtime::Runtime::start(&resources, &data, &token) {
                    Ok((runtime, url)) => {
                        *owned = Some(runtime);
                        if let Some(window) = handle.get_webview_window("main") {
                            if let Ok(url) = url.parse() { let _ = window.navigate(url); }
                        }
                    }
                    Err(error) => {
                        if let Some(window) = handle.get_webview_window("main") {
                            let error = serde_json::to_string(&error).unwrap();
                            let _ = window.eval(format!("window.aetherStartupError={error}; document.getElementById('msg').textContent={error}; document.getElementById('spinner').hidden=true;"));
                        }
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Aether Desktop")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                OWNED.lock().unwrap().take();
            }
        });
}
