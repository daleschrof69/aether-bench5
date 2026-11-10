//! USB enumeration + hot-plug watching via `rusb`.
//!
//! Real and functional — talks to libusb on the host. On machines without a
//! USB subsystem (Docker containers, headless CI) `libusb_init` fails; instead
//! of panicking or bubbling an error, we degrade gracefully to an empty device
//! list so `aether-cli devices` / the bridge stay usable everywhere.

use anyhow::Result;
use colored::Colorize;
use rusb::{Context, Device, DeviceDescriptor, UsbContext};
use serde_json::{json, Value};
use std::time::Duration;

/// Create a libusb context, returning `None` when no USB subsystem is available
/// (Docker/headless CI). Never panics.
fn usb_context() -> Option<Context> {
    match Context::new() {
        Ok(ctx) => Some(ctx),
        Err(e) => {
            tracing::debug!("libusb unavailable ({e}) — USB features disabled on this host");
            None
        }
    }
}

/// Enumerate attached USB devices as (device, descriptor) pairs. Returns an
/// empty vec on hosts without USB — never panics, never errors.
fn enumerate() -> Vec<(Device<Context>, DeviceDescriptor)> {
    let Some(ctx) = usb_context() else {
        return Vec::new();
    };
    let list = match ctx.devices() {
        Ok(l) => l,
        Err(e) => {
            tracing::debug!("libusb device enumeration failed: {e}");
            return Vec::new();
        }
    };
    let mut out = Vec::new();
    for d in list.iter() {
        if let Ok(desc) = d.device_descriptor() {
            out.push((d, desc));
        }
    }
    out
}

/// How a supported phone presents on USB. Used to choose a read-only identity
/// query. Modes that only expose the USB descriptor stay descriptor-only.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UsbKind {
    Mtk,
    QualcommEdl,
    QualcommDiag,
    SamsungDownload,
    AppleDfu,
    AppleRecovery,
    AppleNormal,
    Fastboot,
    Adb,
    Mtp,
    DescriptorOnly,
    Unknown,
}

/// VID/PID classification aligned with `frontend/src/lib/usbSignatures.js`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UsbSignature {
    pub platform: &'static str,
    pub brand: &'static str,
    pub mode: &'static str,
    pub kind: UsbKind,
}

/// Exact VID:PID match. Vendor-only fallbacks are handled separately so a
/// random accessory with a known vendor id is not treated as a phone mode.
pub fn exact_signature(vid: u16, pid: u16) -> Option<UsbSignature> {
    let (platform, brand, mode, kind) = match (vid, pid) {
        (0x0e8d, 0x0003) => ("MediaTek", "MediaTek", "Preloader", UsbKind::Mtk),
        (0x0e8d, 0x2000) => ("MediaTek", "MediaTek", "BROM (Boot ROM)", UsbKind::Mtk),
        (0x0e8d, 0x2001) => ("MediaTek", "MediaTek", "Preloader (DA)", UsbKind::Mtk),
        (0x0e8d, 0x201c) => ("MediaTek", "MediaTek", "BROM (secure)", UsbKind::Mtk),

        (0x05c6, 0x9008) => (
            "Qualcomm",
            "Qualcomm",
            "EDL 9008 (Sahara)",
            UsbKind::QualcommEdl,
        ),
        (0x05c6, 0x9006) => (
            "Qualcomm",
            "Qualcomm",
            "QDLoader (mass storage)",
            UsbKind::QualcommEdl,
        ),
        (0x05c6, 0x676c) => (
            "Qualcomm",
            "Qualcomm",
            "QDLoader HS-USB",
            UsbKind::QualcommEdl,
        ),
        (0x05c6, 0x9091) => (
            "Qualcomm",
            "Qualcomm",
            "EDL (Firehose)",
            UsbKind::QualcommEdl,
        ),
        (0x05c6, 0x90b8) => (
            "Qualcomm",
            "Qualcomm",
            "EDL (OEM 90b8)",
            UsbKind::QualcommEdl,
        ),
        (0x05c6, 0x900e) => (
            "Qualcomm",
            "Qualcomm",
            "Diagnostic (DIAG)",
            UsbKind::QualcommDiag,
        ),

        (0x05ac, 0x1227) => ("Apple", "Apple", "DFU mode", UsbKind::AppleDfu),
        (0x05ac, 0x1338) => ("Apple", "Apple", "Restore (DFU)", UsbKind::AppleDfu),
        (0x05ac, 0x1281) => ("Apple", "Apple", "Recovery mode", UsbKind::AppleRecovery),
        (0x05ac, 0x12a8) => ("Apple", "Apple", "Normal (iPhone)", UsbKind::AppleNormal),
        (0x05ac, 0x12aa) => ("Apple", "Apple", "Normal (iPod/iPad)", UsbKind::AppleNormal),

        (0x04e8, 0x685d) => (
            "Samsung",
            "Samsung",
            "Download mode (Odin)",
            UsbKind::SamsungDownload,
        ),
        (0x04e8, 0x6601) => ("Samsung", "Samsung", "Upload mode", UsbKind::DescriptorOnly),
        (0x04e8, 0x685e) => ("Samsung", "Samsung", "Kies", UsbKind::DescriptorOnly),
        (0x04e8, 0x6860) | (0x04e8, 0x6865) | (0x04e8, 0x6866) => {
            ("Samsung", "Samsung", "Normal (MTP)", UsbKind::Mtp)
        }

        (0x18d1, 0x4ee0) | (0x18d1, 0xd00d) => {
            ("Android", "Google / Android", "Fastboot", UsbKind::Fastboot)
        }
        (0x18d1, 0x4ee7) => ("Android", "Google / Android", "ADB", UsbKind::Adb),
        (0x18d1, 0x4ee1) => ("Android", "Google / Android", "Normal (MTP)", UsbKind::Mtp),
        (0x18d1, 0x4ee2)
        | (0x18d1, 0x4ee3)
        | (0x18d1, 0x4ee4)
        | (0x18d1, 0x4ee5)
        | (0x18d1, 0x4ee6) => ("Android", "Google / Android", "ADB / MTP", UsbKind::Adb),

        (0x2717, 0xff40) | (0x2717, 0xff48) => ("Android", "Xiaomi", "Normal (MTP)", UsbKind::Mtp),
        (0x2a45, 0x4ee0) => ("Android", "Meizu", "Normal (MTP)", UsbKind::Mtp),
        (0x22b8, 0x2e76) | (0x22b8, 0x2e80) => {
            ("Android", "Motorola", "Fastboot", UsbKind::Fastboot)
        }
        _ => return None,
    };
    Some(UsbSignature {
        platform,
        brand,
        mode,
        kind,
    })
}

fn vendor_fallback(vid: u16) -> Option<UsbSignature> {
    let (platform, brand) = match vid {
        0x0e8d => ("MediaTek", "MediaTek"),
        0x05c6 => ("Qualcomm", "Qualcomm"),
        // Apple keyboards and trackpads share 05ac. Only the exact phone
        // PIDs above are treated as iPhone/iPad connections.
        0x04e8 => ("Samsung", "Samsung"),
        0x18d1 => ("Android", "Google / Android"),
        0x2717 | 0x2b4c => ("Android", "Xiaomi"),
        0x22b8 => ("Android", "Motorola"),
        0x1004 => ("Android", "LG"),
        0x12d1 => ("Android", "Huawei"),
        0x0bb4 => ("Android", "HTC / OnePlus"),
        0x2a70 => ("Android", "OnePlus"),
        0x22d9 => ("Android", "OPPO / Realme"),
        0x2d95 => ("Android", "Vivo"),
        0x1782 => ("Unisoc", "Spreadtrum / Unisoc"),
        0x0fce | 0x0489 => ("Android", "Sony"),
        0x19d2 => ("Android", "ZTE"),
        0x0b05 => ("Android", "ASUS"),
        _ => return None,
    };
    Some(UsbSignature {
        platform,
        brand,
        mode: "USB",
        kind: UsbKind::DescriptorOnly,
    })
}

pub fn signature(vid: u16, pid: u16) -> Option<UsbSignature> {
    exact_signature(vid, pid).or_else(|| vendor_fallback(vid))
}

/// Match a USB device against known repair-mode signatures.
///
/// Returns the mode label only for an exact VID:PID. Vendor-only devices stay
/// untagged so hubs and accessories are not highlighted as phone modes.
fn classify(desc: &DeviceDescriptor) -> Option<&'static str> {
    exact_signature(desc.vendor_id(), desc.product_id()).map(|s| s.mode)
}

/// One attached USB device, including descriptor strings when the host can read them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UsbIdentity {
    pub bus: u8,
    pub addr: u8,
    pub vid: String,
    pub pid: String,
    pub manufacturer: String,
    pub product: String,
    pub serial: String,
    pub bcd_device: String,
    pub platform: Option<&'static str>,
    pub brand: Option<&'static str>,
    pub mode: Option<&'static str>,
    pub kind: UsbKind,
}

fn blank_to_null(value: &str) -> Option<&str> {
    if value.is_empty() || value == "—" {
        None
    } else {
        Some(value)
    }
}

fn dash_if_empty(value: String) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "—".to_string()
    } else {
        trimmed.to_string()
    }
}

fn identity_from(d: &Device<Context>, desc: &DeviceDescriptor) -> UsbIdentity {
    let sig = signature(desc.vendor_id(), desc.product_id());
    let exact = exact_signature(desc.vendor_id(), desc.product_id());
    // Opening every hub and keyboard on Windows stalls the scan. Read
    // descriptor strings only for phone vendors and known modes.
    let readable = exact.is_some() || phone_vendor(desc.vendor_id());
    let (manufacturer, product, serial) = if readable {
        match d.open() {
            Ok(handle) => {
                let manufacturer = handle
                    .read_manufacturer_string_ascii(desc)
                    .unwrap_or_else(|_| "—".into());
                let product = handle
                    .read_product_string_ascii(desc)
                    .unwrap_or_else(|_| "—".into());
                let serial = handle
                    .read_serial_number_string_ascii(desc)
                    .unwrap_or_else(|_| "—".into());
                (manufacturer, product, serial)
            }
            Err(_) => ("—".into(), "—".into(), "—".into()),
        }
    } else {
        ("—".into(), "—".into(), "—".into())
    };
    UsbIdentity {
        bus: d.bus_number(),
        addr: d.address(),
        vid: format!("{:04x}", desc.vendor_id()),
        pid: format!("{:04x}", desc.product_id()),
        manufacturer: dash_if_empty(manufacturer),
        product: dash_if_empty(product),
        serial: dash_if_empty(serial),
        bcd_device: desc.device_version().to_string(),
        platform: sig.map(|s| s.platform),
        brand: sig.map(|s| s.brand),
        mode: exact.map(|s| s.mode),
        kind: sig.map(|s| s.kind).unwrap_or(UsbKind::Unknown),
    }
}

/// Enumerate USB devices with descriptor identity. Empty when libusb is unavailable.
pub fn identities() -> Vec<UsbIdentity> {
    enumerate()
        .iter()
        .map(|(d, desc)| identity_from(d, desc))
        .collect()
}

/// True when the device presents an Android MTP (Media Transfer Protocol) signature.
pub fn is_mtp_device(desc: &DeviceDescriptor) -> bool {
    matches!(
        (desc.vendor_id(), desc.product_id()),
        (0x18d1, 0x4ee1..=0x4ee7)
            | (0x04e8, 0x6860)
            | (0x04e8, 0x6865)
            | (0x04e8, 0x6866)
            | (0x2717, 0xff40)
            | (0x2717, 0xff48)
            | (0x2a45, 0x4ee0)
    ) || classify(desc).map(|s| s.contains("MTP")).unwrap_or(false)
}

/// Structured description of a detected MTP device.
#[derive(Debug, Clone, serde::Serialize)]
pub struct MtpDevice {
    pub bus: u8,
    pub addr: u8,
    pub vid: String,
    pub pid: String,
    pub product: String,
    pub manufacturer: String,
    pub mode: &'static str,
    #[serde(default)]
    pub serial: String,
}

#[derive(Debug, Clone)]
struct WindowsMtpHint {
    vid: String,
    pid: String,
    name: String,
    class_name: String,
    serial: Option<String>,
    mtp: bool,
}

fn blank(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.is_empty() || trimmed == "—" || trimmed == "-"
}

/// Fill libusb rows that have no string descriptors, and add phones that
/// Windows Portable Devices sees when libusb cannot open the interface.
fn apply_windows_mtp_hints(found: Vec<MtpDevice>, hints: &[WindowsMtpHint]) -> Vec<MtpDevice> {
    let mut out = found;
    for hint in hints.iter().filter(|hint| hint.mtp) {
        if let Some(row) = out.iter_mut().find(|row| row.vid == hint.vid && row.pid == hint.pid) {
            if blank(&row.product) && hint.class_name == "WPD" {
                row.product = hint.name.clone();
            }
            if blank(&row.manufacturer) {
                row.manufacturer = manufacturer_for_vid(&hint.vid).unwrap_or("Android").to_string();
            }
            if blank(&row.serial) {
                if let Some(serial) = hints.iter().find_map(|other| {
                    (other.vid == hint.vid && other.pid == hint.pid)
                        .then_some(other.serial.clone())
                        .flatten()
                }) {
                    row.serial = serial;
                }
            }
        } else if hint.class_name == "WPD" {
            let serial = hints
                .iter()
                .find_map(|other| {
                    (other.vid == hint.vid && other.pid == hint.pid)
                        .then_some(other.serial.clone())
                        .flatten()
                })
                .unwrap_or_default();
            out.push(MtpDevice {
                bus: 0,
                addr: 0,
                vid: hint.vid.clone(),
                pid: hint.pid.clone(),
                product: hint.name.clone(),
                manufacturer: manufacturer_for_vid(&hint.vid).unwrap_or("Phone").to_string(),
                mode: "Windows MTP",
                serial,
            });
        }
    }
    out
}

fn manufacturer_for_vid(vid: &str) -> Option<&'static str> {
    match vid {
        "04e8" => Some("Samsung"),
        "05ac" => Some("Apple"),
        "18d1" => Some("Google"),
        "2717" | "2b4c" => Some("Xiaomi"),
        "22b8" => Some("Motorola"),
        "12d1" => Some("Huawei"),
        "22d9" => Some("OPPO"),
        "2d95" => Some("Vivo"),
        "0bb4" | "2a70" => Some("OnePlus"),
        "2a45" => Some("Meizu"),
        _ => None,
    }
}

#[cfg(windows)]
fn windows_mtp_hints() -> Vec<WindowsMtpHint> {
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$rows = @()
Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_[0-9A-F]{4}&PID_[0-9A-F]{4}' } | ForEach-Object {
  if ($_.InstanceId -match 'VID_([0-9A-F]{4})&PID_([0-9A-F]{4})') {
    $vendor = $Matches[1].ToLower()
    $productId = $Matches[2].ToLower()
    $serial = $null
    if ($_.InstanceId -match '^USB\\VID_[0-9A-F]{4}&PID_[0-9A-F]{4}\\([^\\&]+)$') { $serial = $Matches[1] }
    $mtp = ($_.Class -eq 'WPD') -or ($_.InstanceId -match 'MS_COMP_MTP|SAMSUNG_ANDROID')
    if ($mtp -or $serial) {
      $rows += [pscustomobject]@{ vid = $vendor; pid = $productId; name = $_.FriendlyName; class = $_.Class; serial = $serial; mtp = [bool]$mtp }
    }
  }
}
if ($rows.Count -eq 0) { '[]' } else { $rows | ConvertTo-Json -Compress }
"#;
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    parse_windows_mtp_json(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(not(windows))]
fn windows_mtp_hints() -> Vec<WindowsMtpHint> {
    Vec::new()
}

fn parse_windows_mtp_json(text: &str) -> Vec<WindowsMtpHint> {
    let trimmed = text.trim();
    let text = trimmed
        .find(['{', '['])
        .map(|start| &trimmed[start..])
        .unwrap_or(trimmed);
    if text.is_empty() || text == "[]" {
        return Vec::new();
    }
    let value: serde_json::Value = serde_json::from_str(text).unwrap_or(serde_json::Value::Null);
    let rows = match value {
        serde_json::Value::Array(rows) => rows,
        serde_json::Value::Object(_) => vec![value],
        _ => return Vec::new(),
    };
    rows.into_iter()
        .filter_map(|row| {
            Some(WindowsMtpHint {
                vid: row.get("vid")?.as_str()?.to_string(),
                pid: row.get("pid")?.as_str()?.to_string(),
                name: row.get("name").and_then(|v| v.as_str()).unwrap_or("MTP device").to_string(),
                class_name: row.get("class").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                serial: row.get("serial").and_then(|v| v.as_str()).map(|s| s.to_string()),
                mtp: row.get("mtp").and_then(|v| v.as_bool()).unwrap_or(false),
            })
        })
        .collect()
}

/// Scan currently attached USB devices and return every MTP target.
pub fn detect_mtp_devices() -> Vec<MtpDevice> {
    let mut out = Vec::new();
    for (d, desc) in enumerate() {
        if !is_mtp_device(&desc) {
            continue;
        }
        let mode = classify(&desc).unwrap_or("MTP");
        let manufacturer = d
            .open()
            .ok()
            .and_then(|h| h.read_manufacturer_string_ascii(&desc).ok())
            .unwrap_or_else(|| "—".into());
        let product = d
            .open()
            .ok()
            .and_then(|h| h.read_product_string_ascii(&desc).ok())
            .unwrap_or_else(|| "—".into());
        out.push(MtpDevice {
            bus: d.bus_number(),
            addr: d.address(),
            vid: format!("{:04x}", desc.vendor_id()),
            pid: format!("{:04x}", desc.product_id()),
            product,
            manufacturer,
            mode,
            serial: String::new(),
        });
    }
    apply_windows_mtp_hints(out, &windows_mtp_hints())
}

/// Pretty-print MTP detection results to the terminal.
pub fn report_mtp_detection() -> Result<()> {
    let found = detect_mtp_devices();
    if found.is_empty() {
        println!(
            "  {} No MTP (file transfer) device detected.",
            "✗".bright_red()
        );
        println!(
            "  {}",
            "Enable File Transfer / MTP on the phone and retry.".dimmed()
        );
        return Ok(());
    }
    println!(
        "  {} {} MTP device(s) detected:",
        "✓".bright_green(),
        found.len()
    );
    for dev in &found {
        println!(
            "    bus {:>3} · addr {:>3} | {}:{} | {} | {} {}",
            dev.bus,
            dev.addr,
            dev.vid,
            dev.pid,
            dev.mode.bright_green().bold(),
            dev.manufacturer.dimmed(),
            dev.product
        );
        if !dev.serial.is_empty() {
            println!("      serial {}", dev.serial);
        }
    }
    Ok(())
}

/// True when the device presents a Qualcomm EDL / 9008 (Sahara or Firehose) signature.
pub fn is_edl_device(desc: &DeviceDescriptor) -> bool {
    is_edl_device_ids(desc.vendor_id(), desc.product_id())
}

fn is_edl_device_ids(vid: u16, pid: u16) -> bool {
    exact_signature(vid, pid)
        .map(|s| s.kind == UsbKind::QualcommEdl)
        .unwrap_or(false)
}

/// Structured description of a detected EDL device.
#[derive(Debug, Clone, serde::Serialize)]
pub struct EdlDevice {
    pub bus: u8,
    pub addr: u8,
    pub vid: String,
    pub pid: String,
    pub product: String,
    pub manufacturer: String,
    pub mode: &'static str,
}

/// Scan currently attached USB devices and return every Qualcomm EDL / 9008 target.
/// Returns an empty vec when no USB subsystem is available or no EDL device is present.
pub fn detect_edl_devices() -> Vec<EdlDevice> {
    let mut out = Vec::new();
    for (d, desc) in enumerate() {
        if !is_edl_device(&desc) {
            continue;
        }
        let mode = classify(&desc).unwrap_or("Qualcomm EDL");
        let manufacturer = d
            .open()
            .ok()
            .and_then(|h| h.read_manufacturer_string_ascii(&desc).ok())
            .unwrap_or_else(|| "—".into());
        let product = d
            .open()
            .ok()
            .and_then(|h| h.read_product_string_ascii(&desc).ok())
            .unwrap_or_else(|| "—".into());
        out.push(EdlDevice {
            bus: d.bus_number(),
            addr: d.address(),
            vid: format!("{:04x}", desc.vendor_id()),
            pid: format!("{:04x}", desc.product_id()),
            product,
            manufacturer,
            mode,
        });
    }
    out
}

/// Pretty-print EDL detection results to the terminal.
pub fn report_edl_detection() -> Result<()> {
    let found = detect_edl_devices();
    if found.is_empty() {
        println!(
            "  {} No Qualcomm EDL / 9008 device detected.",
            "✗".bright_red()
        );
        println!(
            "  {}",
            "Put the device into EDL mode (test-point, adb reboot edl, or fastboot reboot-edl) and retry.".dimmed()
        );
        return Ok(());
    }
    println!(
        "  {} {} Qualcomm EDL device(s) detected:",
        "✓".bright_green(),
        found.len()
    );
    for dev in &found {
        println!(
            "    bus {:>3} · addr {:>3} | {}:{} | {} | {} {}",
            dev.bus,
            dev.addr,
            dev.vid,
            dev.pid,
            dev.mode.bright_green().bold(),
            dev.manufacturer.dimmed(),
            dev.product
        );
    }
    Ok(())
}

fn phone_vendor(vid: u16) -> bool {
    matches!(
        vid,
        0x04e8 | 0x18d1 | 0x05ac | 0x2717 | 0x2b4c | 0x22b8 | 0x1004 | 0x12d1
            | 0x0bb4 | 0x2a70 | 0x22d9 | 0x2d95 | 0x0e8d | 0x05c6 | 0x1782
            | 0x0fce | 0x0b05 | 0x19d2 | 0x2a45
    )
}

/// JSON representation of the current USB device list — used by the bridge.
///
/// `platform` is the family name the desktop pages match (`MediaTek`,
/// `Qualcomm`, `Samsung`, `Apple`, `Android`). `mode` / `repair_mode` describe
/// how the device is connected. Serial, product, and manufacturer come from
/// the USB string descriptor when the host allows that read.
pub fn devices_as_json() -> Result<Vec<Value>> {
    let mut out = Vec::new();
    for dev in identities() {
        out.push(json!({
            "bus": dev.bus,
            "addr": dev.addr,
            "vid": dev.vid,
            "pid": dev.pid,
            "manufacturer": blank_to_null(&dev.manufacturer),
            "product": blank_to_null(&dev.product),
            "serial": blank_to_null(&dev.serial),
            "bcd_device": dev.bcd_device,
            "platform": dev.platform,
            "brand": dev.brand,
            "mode": dev.mode,
            "repair_mode": dev.mode,
        }));
    }
    Ok(out)
}

pub fn list_devices() -> Result<()> {
    let devices = identities();
    let mut shown = 0;
    let mut repair_targets = 0;
    for dev in &devices {
        shown += 1;
        let line = format!(
            "  bus {:>3} · addr {:>3} | {} {} | {} {} | sn {}",
            dev.bus,
            dev.addr,
            dev.vid,
            dev.pid,
            dev.manufacturer.dimmed(),
            dev.product,
            dev.serial,
        );
        if let Some(tag) = dev.mode {
            repair_targets += 1;
            println!("{}", format!("{line}  ← {tag}").bright_green().bold());
        } else {
            println!("{line}");
        }
    }
    println!();
    println!(
        "  {} {} USB devices · {} repair-mode targets detected.",
        "→".bright_green(),
        shown,
        repair_targets,
    );
    if shown == 0 {
        println!(
            "  {}",
            "No USB subsystem detected (or no devices attached). On a real \
             technician machine, plug in a device in BROM / EDL / DFU / Download mode."
                .dimmed()
        );
    } else if repair_targets == 0 {
        println!(
            "  {}",
            "Plug in a device in BROM / EDL / DFU / Download mode and retry.".dimmed()
        );
    }
    Ok(())
}

pub async fn watch_hotplug() -> Result<()> {
    println!(
        "  {} watching for hot-plug events ... (Ctrl-C to stop)",
        "○".bright_green()
    );
    let mut last = collect_keys();
    loop {
        tokio::time::sleep(Duration::from_millis(750)).await;
        let now = collect_keys();
        for k in now.difference(&last) {
            println!("  {} attached  {}", "+".bright_green().bold(), k);
        }
        for k in last.difference(&now) {
            println!("  {} detached  {}", "-".red().bold(), k);
        }
        last = now;
    }
}

fn collect_keys() -> std::collections::HashSet<String> {
    let mut out = std::collections::HashSet::new();
    for (d, desc) in enumerate() {
        out.insert(format!(
            "{:04x}:{:04x} bus{}.addr{}",
            desc.vendor_id(),
            desc.product_id(),
            d.bus_number(),
            d.address()
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repair_modes_map_to_read_kinds() {
        let mtk = exact_signature(0x0e8d, 0x2000).unwrap();
        assert_eq!(mtk.platform, "MediaTek");
        assert_eq!(mtk.kind, UsbKind::Mtk);

        let edl = exact_signature(0x05c6, 0x9008).unwrap();
        assert_eq!(edl.platform, "Qualcomm");
        assert_eq!(edl.kind, UsbKind::QualcommEdl);

        let download = exact_signature(0x04e8, 0x685d).unwrap();
        assert_eq!(download.platform, "Samsung");
        assert_eq!(download.kind, UsbKind::SamsungDownload);

        let dfu = exact_signature(0x05ac, 0x1227).unwrap();
        assert_eq!(dfu.platform, "Apple");
        assert_eq!(dfu.kind, UsbKind::AppleDfu);

        let phone = exact_signature(0x05ac, 0x12a8).unwrap();
        assert_eq!(phone.kind, UsbKind::AppleNormal);
    }

    #[test]
    fn apple_accessories_are_not_phones() {
        assert!(exact_signature(0x05ac, 0x024f).is_none());
        assert!(signature(0x05ac, 0x024f).is_none());
    }

    #[test]
    fn diagnostic_pid_is_not_edl() {
        assert!(!is_edl_device_ids(0x05c6, 0x900e));
        assert!(is_edl_device_ids(0x05c6, 0x9008));
        assert!(is_edl_device_ids(0x05c6, 0x676c));
    }

    #[test]
    fn windows_wpd_name_fills_a_blank_libusb_row() {
        let hints = parse_windows_mtp_json(
            r#"[{"vid":"04e8","pid":"6860","name":"Galaxy S24 Ultra","class":"WPD","serial":null,"mtp":true},{"vid":"04e8","pid":"6860","name":"SAMSUNG Mobile USB Composite Device","class":"USB","serial":"R3CX802V2VY","mtp":false}]"#,
        );
        let found = vec![MtpDevice {
            bus: 1,
            addr: 61,
            vid: "04e8".into(),
            pid: "6860".into(),
            product: "—".into(),
            manufacturer: "—".into(),
            mode: "Samsung MTP",
            serial: String::new(),
        }];
        let merged = apply_windows_mtp_hints(found, &hints);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].product, "Galaxy S24 Ultra");
        assert_eq!(merged[0].manufacturer, "Samsung");
        assert_eq!(merged[0].serial, "R3CX802V2VY");
    }
}
