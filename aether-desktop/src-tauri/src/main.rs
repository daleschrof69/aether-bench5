// Aether Desktop — Tauri v2 entry.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    aether_desktop_lib::run();
}
