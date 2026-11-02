//! Identify phones that are actually attached.
//!
//! USB vendor/product IDs only say "something from Samsung is plugged in".
//! This module asks the phone:
//!   * `adb devices -l` plus `getprop` for Android brand, model, and OS
//!   * `idevice_id` / `ideviceinfo` for a trusted iPhone
//!
//! Missing tools or an unauthorized phone are reported. They are not errors.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::process::Stdio;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdbListed {
    pub serial: String,
    pub state: String,
    pub product: Option<String>,
    pub model: Option<String>,
    pub device: Option<String>,
}

/// Parse `adb devices -l`. The header line is ignored.
pub fn parse_adb_devices(text: &str) -> Vec<AdbListed> {
    let mut out = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("List of devices") {
            continue;
        }
        let mut parts = line.split_whitespace();
        let Some(serial) = parts.next() else { continue };
        let Some(state) = parts.next() else { continue };
        let mut product = None;
        let mut model = None;
        let mut device = None;
        for token in parts {
            if let Some(value) = token.strip_prefix("product:") {
                product = Some(value.to_string());
            } else if let Some(value) = token.strip_prefix("model:") {
                model = Some(value.to_string());
            } else if let Some(value) = token.strip_prefix("device:") {
                device = Some(value.to_string());
            }
        }
        out.push(AdbListed {
            serial: serial.to_string(),
            state: state.to_string(),
            product,
            model,
            device,
        });
    }
    out
}

/// Parse `getprop` lines of the form `[key]: [value]`.
pub fn parse_getprop(text: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in text.lines() {
        let line = line.trim();
        let Some(rest) = line.strip_prefix('[') else { continue };
        let Some((key, value)) = rest.split_once("]: [") else { continue };
        let value = value.strip_suffix(']').unwrap_or(value);
        if !key.is_empty() {
            map.insert(key.to_string(), value.to_string());
        }
    }
    map
}

fn prop<'a>(map: &'a HashMap<String, String>, key: &str) -> Option<&'a str> {
    map.get(key).map(|s| s.as_str()).filter(|s| !s.is_empty())
}

fn first<'a>(map: &'a HashMap<String, String>, keys: &[&str]) -> Option<&'a str> {
    keys.iter().find_map(|key| prop(map, key))
}

pub fn platform_for_brand(brand: &str) -> &'static str {
    let lower = brand.to_ascii_lowercase();
    if lower.contains("samsung") {
        "Samsung"
    } else if lower.contains("apple") {
        "Apple"
    } else if lower.contains("mediatek") {
        "MediaTek"
    } else if lower.contains("qualcomm") {
        "Qualcomm"
    } else {
        "Android"
    }
}

fn android_record(listed: &AdbListed, props: &HashMap<String, String>) -> Value {
    let brand = first(props, &["ro.product.manufacturer", "ro.product.brand"])
        .map(|s| s.to_string())
        .or_else(|| listed.product.clone());
    let model = first(props, &["ro.product.model", "ro.product.marketname"])
        .map(|s| s.to_string())
        .or_else(|| listed.model.clone().map(|m| m.replace('_', " ")));
    let android = prop(props, "ro.build.version.release").map(|s| s.to_string());
    let sdk = prop(props, "ro.build.version.sdk").map(|s| s.to_string());
    let build = first(props, &["ro.build.display.id", "ro.build.id"]).map(|s| s.to_string());
    let patch = prop(props, "ro.build.version.security_patch").map(|s| s.to_string());
    let serial = first(props, &["ro.serialno", "ro.boot.serialno"])
        .map(|s| s.to_string())
        .unwrap_or_else(|| listed.serial.clone());
    let region = first(
        props,
        &[
            "ro.csc.sales_code",
            "ro.boot.carrierid",
            "persist.sys.country",
        ],
    )
    .map(|s| s.to_string());
    let cpu = first(props, &["ro.product.cpu.abi", "ro.hardware", "ro.boot.hardware"])
        .map(|s| s.to_string());
    let device_name = listed
        .device
        .clone()
        .or_else(|| prop(props, "ro.product.device").map(|s| s.to_string()));
    let characteristics = prop(props, "ro.build.characteristics").unwrap_or("phone");
    let brand_text = brand.clone().unwrap_or_else(|| "Android".into());
    let platform = platform_for_brand(&brand_text);
    let os = android
        .as_ref()
        .map(|version| format!("Android {version}"))
        .unwrap_or_else(|| "Android".into());
    json!({
        "source": "adb",
        "state": listed.state,
        "serial": serial,
        "transport": listed.serial,
        "kind": characteristics,
        "brand": brand_text,
        "platform": platform,
        "model": model,
        "product": listed.product,
        "device": device_name,
        "android": android,
        "sdk": sdk,
        "os": os,
        "build": build,
        "security_patch": patch,
        "region": region,
        "cpu": cpu,
    })
}

fn android_unauthorized(listed: &AdbListed) -> Value {
    json!({
        "source": "adb",
        "state": listed.state,
        "serial": listed.serial,
        "transport": listed.serial,
        "kind": "phone",
        "brand": "Android",
        "platform": "Android",
        "model": listed.model.clone().map(|m| m.replace('_', " ")),
        "os": null,
        "note": format!("adb state is {} — unlock the phone and accept USB debugging", listed.state),
    })
}

fn parse_ideviceinfo(text: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in text.lines() {
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim();
            let value = value.trim();
            if !key.is_empty() && !value.is_empty() {
                map.insert(key.to_string(), value.to_string());
            }
        }
    }
    map
}

fn apple_record(udid: &str, info: &HashMap<String, String>) -> Value {
    let product_type = info.get("ProductType").cloned();
    let name = info.get("DeviceName").cloned();
    let version = info.get("ProductVersion").cloned();
    let model = name.clone().or_else(|| product_type.clone());
    json!({
        "source": "usbmux",
        "state": "trusted",
        "serial": info.get("SerialNumber").cloned().unwrap_or_else(|| udid.to_string()),
        "transport": udid,
        "kind": product_type.as_ref().map(|t| {
            if t.starts_with("iPad") { "tablet" } else if t.starts_with("iPod") { "ipod" } else { "phone" }
        }).unwrap_or("phone"),
        "brand": "Apple",
        "platform": "Apple",
        "model": model,
        "product": product_type,
        "device": info.get("HardwareModel").cloned(),
        "android": null,
        "os": version.as_ref().map(|v| format!("iOS {v}")).unwrap_or_else(|| "iOS".into()),
        "ios": version,
        "build": info.get("BuildVersion").cloned(),
        "cpu": info.get("CPUArchitecture").cloned(),
        "region": info.get("RegionInfo").cloned(),
    })
}

async fn command_output(bin: &str, args: &[&str], timeout_secs: u64) -> Result<std::process::Output, String> {
    let fut = tokio::process::Command::new(bin)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .output();
    match tokio::time::timeout(Duration::from_secs(timeout_secs), fut).await {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(err)) => Err(err.to_string()),
        Err(_) => Err(format!("{bin} timed out")),
    }
}

fn text_of(output: &std::process::Output) -> String {
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    if text.trim().is_empty() {
        text = String::from_utf8_lossy(&output.stderr).into_owned();
    }
    text
}

async fn adb_bin() -> Option<String> {
    for candidate in ["adb", "adb.exe"] {
        if command_output(candidate, &["version"], 4).await.is_ok() {
            return Some(candidate.to_string());
        }
    }
    None
}

async fn identify_android() -> (Vec<Value>, Option<String>) {
    let Some(adb) = adb_bin().await else {
        return (Vec::new(), Some("adb is not on PATH".into()));
    };
    let listed = match command_output(&adb, &["devices", "-l"], 8).await {
        Ok(output) => parse_adb_devices(&text_of(&output)),
        Err(err) => return (Vec::new(), Some(err)),
    };
    let mut phones = Vec::new();
    for row in listed {
        if row.state != "device" {
            phones.push(android_unauthorized(&row));
            continue;
        }
        match command_output(&adb, &["-s", &row.serial, "shell", "getprop"], 8).await {
            Ok(output) => {
                let props = parse_getprop(&text_of(&output));
                phones.push(android_record(&row, &props));
            }
            Err(err) => {
                let mut record = android_unauthorized(&row);
                if let Some(obj) = record.as_object_mut() {
                    obj.insert("state".into(), json!("device"));
                    obj.insert("note".into(), json!(err));
                }
                phones.push(record);
            }
        }
    }
    (phones, None)
}

async fn tool_bin(names: &[&str]) -> Option<String> {
    for name in names {
        if command_output(name, &["-h"], 3).await.is_ok()
            || command_output(name, &["--help"], 3).await.is_ok()
        {
            return Some((*name).to_string());
        }
    }
    crate::apple::locate_tool(names)
}

async fn identify_apple() -> Vec<Value> {
    let Some(id_bin) = tool_bin(&["idevice_id", "idevice_id.exe"]).await else {
        return Vec::new();
    };
    let output = match command_output(&id_bin, &["-l"], 5).await {
        Ok(output) => output,
        Err(_) => return Vec::new(),
    };
    let udids: Vec<String> = text_of(&output)
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty() && !line.contains(' '))
        .collect();
    let Some(info_bin) = tool_bin(&["ideviceinfo", "ideviceinfo.exe"]).await else {
        return udids
            .into_iter()
            .map(|udid| {
                json!({
                    "source": "usbmux",
                    "state": "present",
                    "serial": udid,
                    "kind": "phone",
                    "brand": "Apple",
                    "platform": "Apple",
                    "model": "iPhone",
                    "os": "iOS",
                    "note": "ideviceinfo is not installed, so the iOS version could not be read",
                })
            })
            .collect();
    };
    let mut phones = Vec::new();
    for udid in udids {
        match command_output(&info_bin, &["-u", &udid], 8).await {
            Ok(output) if output.status.success() => {
                phones.push(apple_record(&udid, &parse_ideviceinfo(&text_of(&output))));
            }
            Ok(output) => {
                phones.push(json!({
                    "source": "usbmux",
                    "state": "untrusted",
                    "serial": udid,
                    "kind": "phone",
                    "brand": "Apple",
                    "platform": "Apple",
                    "model": "iPhone",
                    "os": "iOS",
                    "note": text_of(&output).trim().to_string(),
                }));
            }
            Err(err) => {
                phones.push(json!({
                    "source": "usbmux",
                    "state": "present",
                    "serial": udid,
                    "kind": "phone",
                    "brand": "Apple",
                    "platform": "Apple",
                    "model": "iPhone",
                    "os": "iOS",
                    "note": err,
                }));
            }
        }
    }
    phones
}

/// Phones visible to adb or libimobiledevice. Always returns; `note` explains a miss.
pub async fn identify() -> Value {
    let (mut phones, adb_note) = identify_android().await;
    phones.extend(identify_apple().await);
    json!({
        "phones": phones,
        "count": phones.len(),
        "note": adb_note,
    })
}

/// One-line description for the CLI and the dashboard log.
pub fn summary_line(phone: &Value) -> String {
    let brand = phone.get("brand").and_then(|v| v.as_str()).unwrap_or("Phone");
    let model = phone.get("model").and_then(|v| v.as_str()).unwrap_or("unknown model");
    let os = phone.get("os").and_then(|v| v.as_str()).unwrap_or("unknown OS");
    let kind = phone.get("kind").and_then(|v| v.as_str()).unwrap_or("phone");
    let state = phone.get("state").and_then(|v| v.as_str()).unwrap_or("unknown");
    let serial = phone.get("serial").and_then(|v| v.as_str()).unwrap_or("—");
    format!("{brand} {model} · {kind} · {os} · {state} · {serial}")
}

pub async fn print_phones() -> anyhow::Result<()> {
    let report = identify().await;
    let phones = report.get("phones").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    if phones.is_empty() {
        println!("  no phones reported by adb or libimobiledevice");
        if let Some(note) = report.get("note").and_then(|v| v.as_str()) {
            println!("  {note}");
        }
        return Ok(());
    }
    println!("  {} phone(s):", phones.len());
    for phone in phones {
        println!("  {}", summary_line(&phone));
        if let Some(note) = phone.get("note").and_then(|v| v.as_str()) {
            if !note.is_empty() {
                println!("    {note}");
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_adb_devices_table() {
        let text = "\
List of devices attached\n\
R5CR10ABCDE            device product:beyond1lte model:SM_G973F device:beyond1 transport_id:4\n\
emulator-5554          unauthorized\n";
        let rows = parse_adb_devices(text);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].serial, "R5CR10ABCDE");
        assert_eq!(rows[0].model.as_deref(), Some("SM_G973F"));
        assert_eq!(rows[1].state, "unauthorized");
    }

    #[test]
    fn parses_getprop_and_builds_a_samsung_record() {
        let props = parse_getprop(
            "[ro.product.manufacturer]: [samsung]\n[ro.product.model]: [SM-G973F]\n[ro.build.version.release]: [12]\n[ro.build.characteristics]: [phone]\n",
        );
        let listed = AdbListed {
            serial: "R5".into(),
            state: "device".into(),
            product: Some("beyond1lte".into()),
            model: Some("SM_G973F".into()),
            device: Some("beyond1".into()),
        };
        let record = android_record(&listed, &props);
        assert_eq!(record["model"], "SM-G973F");
        assert_eq!(record["platform"], "Samsung");
        assert_eq!(record["os"], "Android 12");
        assert_eq!(record["kind"], "phone");
    }
}
