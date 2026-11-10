//! Read-only device identity for Samsung, Apple, MediaTek, and Qualcomm.
//!
//! Picks a reader from how the phone is connected, then reports serial, model,
//! firmware/build (or the closest field that mode exposes), and other identity
//! values that reader already prints. Fields that are not in that read are
//! listed under `omitted` instead of being filled from a different tool.
//! See `DIAGNOSTICS.md`.

use anyhow::{anyhow, Result};
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;
use tokio::sync::mpsc::UnboundedSender;

use crate::mtkclient::StreamLine;
use crate::usb::{identities, UsbIdentity, UsbKind};

const ADB_SCRIPT: &str = concat!(
    "echo __PROPS__;",
    "echo model=$(getprop ro.product.model);",
    "echo market=$(getprop ro.product.marketname);",
    "echo brand=$(getprop ro.product.brand);",
    "echo manufacturer=$(getprop ro.product.manufacturer);",
    "echo device=$(getprop ro.product.device);",
    "echo name=$(getprop ro.product.name);",
    "echo serial=$(getprop ro.serialno);",
    "echo boot_serial=$(getprop ro.boot.serialno);",
    "echo build=$(getprop ro.build.display.id);",
    "echo android=$(getprop ro.build.version.release);",
    "echo incremental=$(getprop ro.build.version.incremental);",
    "echo fingerprint=$(getprop ro.build.fingerprint);",
    "echo patch=$(getprop ro.build.version.security_patch);",
    "echo board=$(getprop ro.board.platform);",
    "echo hardware=$(getprop ro.hardware);",
    "echo boot_hardware=$(getprop ro.boot.hardware);",
    "echo baseband=$(getprop gsm.version.baseband);",
    "echo imei=$(getprop persist.radio.imei);",
    "echo imei1=$(getprop persist.radio.imei1);",
    "echo imei2=$(getprop persist.radio.imei2);",
    "echo ril_imei=$(getprop ro.ril.oem.imei);",
    "echo ril_imei1=$(getprop ro.ril.oem.imei1);",
    "echo ril_imei2=$(getprop ro.ril.oem.imei2);",
    "echo __BATTERY__;",
    "dumpsys battery;",
    "echo __CELLS__;",
    "echo full=$(cat /sys/class/power_supply/battery/charge_full 2>/dev/null);",
    "echo design=$(cat /sys/class/power_supply/battery/charge_full_design 2>/dev/null);",
    "echo cycles=$(cat /sys/class/power_supply/battery/cycle_count 2>/dev/null);",
    "echo __STORAGE__;",
    "df -k /data;",
);

const OMIT_IMEI: &str = "IMEI was not in this read. Modem NV is not read.";
const OMIT_BATTERY_MODE: &str = "This connection mode does not expose battery telemetry.";
const OMIT_BUILD_BROM: &str =
    "BROM exposes the preloader software version, not the Android build fingerprint. The build is available from an authorized ADB session when the phone is booted.";
const OMIT_SERIAL_BROM: &str =
    "BROM exposes ME_ID and SOC_ID, not the device serial number. Serial is read from the USB string descriptor when it is present, or from an authorized ADB session.";
const OMIT_BUILD_EDL: &str =
    "The Sahara handshake and GPT do not include the Android build fingerprint.";
const OMIT_BUILD_DOWNLOAD: &str =
    "Download mode exposes USB identity and the partition table, not the Android build fingerprint. The build is available from an authorized ADB session when the phone is booted.";
const OMIT_BATTERY_DFU: &str =
    "DFU and Recovery do not expose battery health. Battery is read with ideviceinfo when the iPhone is connected and trusted.";
const OMIT_STORAGE_DFU: &str =
    "DFU and Recovery do not expose storage capacity. Capacity is read with ideviceinfo when the iPhone is connected and trusted.";
const OMIT_BUILD_USB: &str =
    "The USB descriptor does not include a firmware build. Use Download mode, EDL, BROM, DFU/Recovery, fastboot, or an authorized ADB session for a protocol read.";
const OMIT_ADB_AUTH: &str =
    "USB debugging is not authorized. Accept the prompt on the phone and retry to read firmware, battery, and storage.";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Section {
    Status,
    Identity,
    Firmware,
    Battery,
    Storage,
}

impl Section {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "status" => Some(Self::Status),
            "identity" | "info" | "all" => Some(Self::Identity),
            "firmware" | "build" => Some(Self::Firmware),
            "battery" => Some(Self::Battery),
            "storage" => Some(Self::Storage),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct OmittedField {
    pub field: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct IdentityReport {
    pub report: &'static str,
    pub ok: bool,
    pub no_device: bool,
    pub dry_run: bool,
    pub platform: String,
    pub connection: String,
    pub brand: Option<String>,
    pub model: Option<String>,
    pub serial: Option<String>,
    pub firmware: Option<String>,
    pub chipset: Option<String>,
    pub battery: Option<String>,
    pub storage: Option<String>,
    pub fields: BTreeMap<String, String>,
    pub omitted: Vec<OmittedField>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StatusDevice {
    pub platform: String,
    pub connection: String,
    pub vid: Option<String>,
    pub pid: Option<String>,
    pub bus: Option<u8>,
    pub addr: Option<u8>,
    pub serial: Option<String>,
    pub model: Option<String>,
    pub manufacturer: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StatusReport {
    pub report: &'static str,
    pub ok: bool,
    pub no_device: bool,
    pub dry_run: bool,
    pub count: usize,
    pub devices: Vec<StatusDevice>,
    pub notes: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
struct AdbDevice {
    serial: String,
    state: String,
    model: Option<String>,
    product: Option<String>,
}

#[derive(Debug, Clone)]
struct FastbootDevice {
    serial: String,
}

#[derive(Debug, Clone)]
struct Probe {
    usb: Vec<UsbIdentity>,
    adb: Vec<AdbDevice>,
    fastboot: Vec<FastbootDevice>,
    idevice: Vec<String>,
    notes: Vec<String>,
}

#[derive(Debug)]
struct SelectError {
    message: String,
    no_device: bool,
}

#[derive(Debug, Clone)]
enum Choice {
    Mtk(UsbIdentity),
    Edl(UsbIdentity),
    Heimdall(UsbIdentity),
    Irecovery(UsbIdentity),
    Idevice {
        udid: String,
        usb: Option<UsbIdentity>,
    },
    Adb {
        dev: AdbDevice,
        usb: Option<UsbIdentity>,
    },
    Fastboot {
        dev: FastbootDevice,
        usb: Option<UsbIdentity>,
    },
    UsbOnly(UsbIdentity),
}

#[derive(Debug, Default)]
struct Parsed {
    brand: Option<String>,
    model: Option<String>,
    serial: Option<String>,
    firmware: Option<String>,
    chipset: Option<String>,
    battery: Option<String>,
    storage: Option<String>,
    fields: BTreeMap<String, String>,
    omitted: Vec<OmittedField>,
}

struct ToolOutput {
    exit_ok: bool,
    text: String,
    reader: &'static str,
}

pub async fn run_cli(port: &str, section: &str, json: bool, dry_run: bool) -> Result<()> {
    let section =
        Section::parse(section).ok_or_else(|| anyhow!("unknown diagnostic section '{section}'"))?;
    if section == Section::Status {
        let report = if dry_run {
            status_dry_run()
        } else {
            status_report(port).await
        };
        emit_status(&report, json)?;
        finish(report.ok, report.no_device, report.error)
    } else {
        let report = if dry_run {
            identity_dry_run()
        } else {
            identity_live(port, section).await
        };
        emit_identity(&report, json)?;
        finish(report.ok, report.no_device, report.error)
    }
}

pub async fn run_streaming(
    port: &str,
    section: &str,
    dry_run: bool,
    tx: UnboundedSender<StreamLine>,
) -> Result<i32> {
    let Some(section) = Section::parse(section) else {
        let _ = tx.send(StreamLine {
            stream: "stderr",
            line: format!("unknown diagnostic section: {section}"),
        });
        return Ok(1);
    };
    if section == Section::Status {
        let report = if dry_run {
            status_dry_run()
        } else {
            status_report(port).await
        };
        send_lines(&tx, &format_status_lines(&report), &report);
        return Ok(exit_code(report.ok, report.no_device));
    }
    let report = if dry_run {
        identity_dry_run()
    } else {
        identity_live(port, section).await
    };
    send_lines(&tx, &format_identity_lines(&report), &report);
    Ok(exit_code(report.ok, report.no_device))
}

fn send_lines<T: Serialize>(tx: &UnboundedSender<StreamLine>, lines: &[String], report: &T) {
    for line in lines {
        let _ = tx.send(StreamLine {
            stream: "stdout",
            line: line.clone(),
        });
    }
    if let Ok(payload) = serde_json::to_string(report) {
        let _ = tx.send(StreamLine {
            stream: "stdout",
            line: format!("AETHER_DIAG {payload}"),
        });
    }
}

fn emit_identity(report: &IdentityReport, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(report)?);
    } else {
        for line in format_identity_lines(report) {
            println!("  {line}");
        }
    }
    Ok(())
}

fn emit_status(report: &StatusReport, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(report)?);
    } else {
        for line in format_status_lines(report) {
            println!("  {line}");
        }
    }
    Ok(())
}

fn finish(ok: bool, no_device: bool, error: Option<String>) -> Result<()> {
    if ok {
        Ok(())
    } else if no_device {
        std::process::exit(2);
    } else {
        Err(anyhow!(
            error.unwrap_or_else(|| "diagnostic read failed".into())
        ))
    }
}

fn exit_code(ok: bool, no_device: bool) -> i32 {
    if ok {
        0
    } else if no_device {
        2
    } else {
        1
    }
}

pub fn tool_status_lines() -> Vec<(bool, String)> {
    vec![
        sync_tool("adb", &["version"]),
        sync_tool("fastboot", &["version"]),
        match crate::apple::ideviceinfo_bin() {
            Ok(bin) => (true, format!("ideviceinfo ({bin})")),
            Err(err) => (false, format!("ideviceinfo: {err}")),
        },
    ]
}

fn sync_tool(program: &str, args: &[&str]) -> (bool, String) {
    match std::process::Command::new(program).args(args).output() {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            let line = text
                .lines()
                .find(|l| !l.trim().is_empty())
                .unwrap_or(program);
            (true, format!("{line}"))
        }
        Ok(_) => (false, format!("{program}: command failed")),
        Err(_) => (false, format!("{program}: not installed")),
    }
}

pub fn identity_dry_run() -> IdentityReport {
    let mut fields = BTreeMap::new();
    fields.insert("reader".into(), "dry-run".into());
    fields.insert(
        "note".into(),
        "Synthetic report for offline checks. No device was queried.".into(),
    );
    IdentityReport {
        report: "identity",
        ok: true,
        no_device: false,
        dry_run: true,
        platform: "Samsung".into(),
        connection: "dry-run".into(),
        brand: Some("Samsung".into()),
        model: Some("SM-G960F".into()),
        serial: Some("DRYRUN123456".into()),
        firmware: Some("QP1A.190711.020".into()),
        chipset: Some("exynos9810".into()),
        battery: Some("90% · health good".into()),
        storage: Some("58.2 GiB data partition".into()),
        fields,
        omitted: Vec::new(),
        error: None,
    }
}

pub fn status_dry_run() -> StatusReport {
    StatusReport {
        report: "status",
        ok: true,
        no_device: false,
        dry_run: true,
        count: 1,
        devices: vec![StatusDevice {
            platform: "Samsung".into(),
            connection: "dry-run".into(),
            vid: Some("04e8".into()),
            pid: Some("685d".into()),
            bus: Some(1),
            addr: Some(2),
            serial: Some("DRYRUN123456".into()),
            model: Some("SM-G960F".into()),
            manufacturer: Some("Samsung".into()),
        }],
        notes: vec!["Synthetic status. No device was queried.".into()],
        error: None,
    }
}

async fn identity_live(port: &str, section: Section) -> IdentityReport {
    let probe = probe().await;
    match select(&probe, port) {
        Err(err) => error_report(&err),
        Ok(choice) => {
            if !should_query(&choice, section) {
                report_without_tool(&choice, section, &probe.notes)
            } else {
                match run_reader(&choice).await {
                    Ok(tool) => assemble(&choice, parse_tool(&choice, &tool.text), tool),
                    Err(err) => {
                        let mut report = report_without_tool(&choice, section, &probe.notes);
                        report.ok = false;
                        report.error = Some(trim_err(&err));
                        report
                    }
                }
            }
        }
    }
}

pub async fn status_report(port: &str) -> StatusReport {
    let probe = probe().await;
    status_from_probe(&probe, port)
}

async fn probe() -> Probe {
    let usb = identities();
    let (adb, fastboot, idevice) = tokio::join!(list_adb(), list_fastboot(), list_idevice());
    let mut notes = Vec::new();
    if let Some(note) = adb.1 {
        notes.push(note);
    }
    if let Some(note) = fastboot.1 {
        notes.push(note);
    }
    if let Some(note) = idevice.1 {
        notes.push(note);
    }
    Probe {
        usb,
        adb: adb.0,
        fastboot: fastboot.0,
        idevice: idevice.0,
        notes,
    }
}

async fn list_adb() -> (Vec<AdbDevice>, Option<String>) {
    match capture("adb", &["devices", "-l"], 8).await {
        Ok((code, text)) => {
            let devices = parse_adb_devices(&text);
            if code != 0 && devices.is_empty() {
                (devices, Some(format!("adb devices exited {code}")))
            } else {
                (devices, None)
            }
        }
        Err(err) => (Vec::new(), Some(err)),
    }
}

async fn list_fastboot() -> (Vec<FastbootDevice>, Option<String>) {
    match capture("fastboot", &["devices"], 8).await {
        Ok((code, text)) => {
            let devices = parse_fastboot_devices(&text);
            if code != 0 && devices.is_empty() {
                (devices, Some(format!("fastboot devices exited {code}")))
            } else {
                (devices, None)
            }
        }
        Err(err) => (Vec::new(), Some(err)),
    }
}

async fn list_idevice() -> (Vec<String>, Option<String>) {
    let bin = match crate::apple::idevice_id_bin() {
        Ok(bin) => bin,
        Err(err) => return (Vec::new(), Some(err.to_string())),
    };
    match capture(&bin, &["-l"], 8).await {
        Ok((_, text)) => (parse_udids(&text), None),
        Err(err) => (Vec::new(), Some(err)),
    }
}

async fn capture(program: &str, args: &[&str], timeout_secs: u64) -> Result<(i32, String), String> {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .kill_on_drop(true);
    let child = match cmd.spawn() {
        Ok(child) => child,
        Err(_) => return Err(format!("{program} is not installed")),
    };
    // Dropping the child on timeout kills it because kill_on_drop is set.
    match tokio::time::timeout(Duration::from_secs(timeout_secs), child.wait_with_output()).await {
        Ok(Ok(out)) => {
            let mut text = String::from_utf8_lossy(&out.stdout).into_owned();
            let err = String::from_utf8_lossy(&out.stderr);
            if !err.trim().is_empty() {
                if !text.is_empty() && !text.ends_with('\n') {
                    text.push('\n');
                }
                text.push_str(&err);
            }
            Ok((out.status.code().unwrap_or(-1), text))
        }
        Ok(Err(err)) => Err(format!("{program} failed: {err}")),
        Err(_) => Err(format!("{program} timed out after {timeout_secs}s")),
    }
}

fn parse_adb_devices(text: &str) -> Vec<AdbDevice> {
    let mut out = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("List of devices") || line.starts_with('*') {
            continue;
        }
        let mut parts = line.split_whitespace();
        let (Some(serial), Some(state)) = (parts.next(), parts.next()) else {
            continue;
        };
        if !matches!(state, "device" | "unauthorized" | "offline" | "recovery") {
            continue;
        }
        let mut model = None;
        let mut product = None;
        for tok in parts {
            if let Some(value) = tok.strip_prefix("model:") {
                model = Some(value.replace('_', " "));
            } else if let Some(value) = tok.strip_prefix("product:") {
                product = Some(value.to_string());
            }
        }
        out.push(AdbDevice {
            serial: serial.to_string(),
            state: state.to_string(),
            model,
            product,
        });
    }
    out
}

fn parse_fastboot_devices(text: &str) -> Vec<FastbootDevice> {
    text.lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let serial = parts.next()?.to_string();
            let state = parts.next()?;
            if state == "fastboot" {
                Some(FastbootDevice { serial })
            } else {
                None
            }
        })
        .collect()
}

fn parse_udids(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|line| {
            !line.is_empty()
                && !line.to_ascii_lowercase().contains("error")
                && !line.starts_with("Usage")
                && !line.starts_with("No device")
        })
        .map(str::to_string)
        .collect()
}

fn is_strong(kind: UsbKind) -> bool {
    matches!(
        kind,
        UsbKind::Mtk
            | UsbKind::QualcommEdl
            | UsbKind::SamsungDownload
            | UsbKind::AppleDfu
            | UsbKind::AppleRecovery
            | UsbKind::AppleNormal
            | UsbKind::Fastboot
            | UsbKind::Adb
    )
}

fn host_busy(probe: &Probe) -> bool {
    !probe.adb.is_empty() || !probe.fastboot.is_empty() || !probe.idevice.is_empty()
}

fn select(probe: &Probe, port: &str) -> Result<Choice, SelectError> {
    let spec = port.trim();
    if spec.is_empty() || spec.eq_ignore_ascii_case("auto") {
        select_auto(probe)
    } else {
        select_filtered(probe, spec)
    }
}

fn select_auto(probe: &Probe) -> Result<Choice, SelectError> {
    let strong: Vec<_> = probe
        .usb
        .iter()
        .filter(|dev| is_strong(dev.kind))
        .cloned()
        .collect();
    if strong.len() > 1 {
        return Err(ambiguous(probe));
    }
    if let Some(dev) = strong.first() {
        return choice_for_usb(dev, probe);
    }
    let hosts = probe.adb.len() + probe.fastboot.len() + probe.idevice.len();
    if hosts > 1 {
        return Err(ambiguous(probe));
    }
    if let [dev] = probe.adb.as_slice() {
        return Ok(Choice::Adb {
            dev: dev.clone(),
            usb: companion_usb(probe, &dev.serial),
        });
    }
    if let [dev] = probe.fastboot.as_slice() {
        let usb = probe
            .usb
            .iter()
            .find(|dev| dev.kind == UsbKind::Fastboot)
            .cloned();
        return Ok(Choice::Fastboot {
            dev: dev.clone(),
            usb,
        });
    }
    if let [udid] = probe.idevice.as_slice() {
        let usb = probe
            .usb
            .iter()
            .find(|dev| dev.kind == UsbKind::AppleNormal)
            .cloned();
        return Ok(Choice::Idevice {
            udid: udid.clone(),
            usb,
        });
    }
    let weak: Vec<_> = probe
        .usb
        .iter()
        .filter(|dev| dev.kind != UsbKind::Unknown && dev.platform.is_some())
        .cloned()
        .collect();
    match weak.as_slice() {
        [dev] => Ok(Choice::UsbOnly(dev.clone())),
        [] => Err(no_device(probe)),
        _ => Err(ambiguous(probe)),
    }
}

fn select_filtered(probe: &Probe, spec: &str) -> Result<Choice, SelectError> {
    let usb_hits: Vec<_> = probe
        .usb
        .iter()
        .filter(|dev| usb_matches(dev, spec))
        .cloned()
        .collect();
    let adb_hits: Vec<_> = probe
        .adb
        .iter()
        .filter(|dev| serial_matches(&dev.serial, spec) || platform_word(spec, Some("Android")))
        .cloned()
        .collect();
    let fb_hits: Vec<_> = probe
        .fastboot
        .iter()
        .filter(|dev| serial_matches(&dev.serial, spec) || spec.eq_ignore_ascii_case("fastboot"))
        .cloned()
        .collect();
    let id_hits: Vec<_> = probe
        .idevice
        .iter()
        .filter(|udid| serial_matches(udid, spec) || platform_word(spec, Some("Apple")))
        .cloned()
        .collect();

    if usb_hits.len() > 1 {
        return Err(ambiguous(probe));
    }
    if let Some(dev) = usb_hits.first() {
        if spec_is_usb_id(spec) || serial_matches(&dev.serial, spec) {
            return choice_for_specific_usb(dev, probe);
        }
        return choice_for_usb(dev, probe);
    }
    match (adb_hits.as_slice(), fb_hits.as_slice(), id_hits.as_slice()) {
        ([dev], [], []) => Ok(Choice::Adb {
            dev: dev.clone(),
            usb: companion_usb(probe, &dev.serial),
        }),
        ([], [dev], []) => Ok(Choice::Fastboot {
            dev: dev.clone(),
            usb: probe
                .usb
                .iter()
                .find(|d| d.kind == UsbKind::Fastboot)
                .cloned(),
        }),
        ([], [], [udid]) => Ok(Choice::Idevice {
            udid: udid.clone(),
            usb: probe
                .usb
                .iter()
                .find(|d| d.kind == UsbKind::AppleNormal)
                .cloned(),
        }),
        ([], [], []) => {
            if supported_count(probe) == 0 {
                Err(no_device(probe))
            } else {
                Err(SelectError {
                    message: format!(
                        "No attached device matches '{spec}'.\n{}",
                        attached_list(probe)
                    ),
                    no_device: false,
                })
            }
        }
        _ => Err(ambiguous(probe)),
    }
}

fn spec_is_usb_id(spec: &str) -> bool {
    let spec = spec.trim().to_ascii_lowercase();
    spec.contains(':') || spec.starts_with("bus")
}

/// A vid:pid, bus:addr, or serial selector names one USB device. Other phones
/// on ADB or fastboot are not a conflict for that selection.
fn choice_for_specific_usb(usb: &UsbIdentity, probe: &Probe) -> Result<Choice, SelectError> {
    match usb.kind {
        UsbKind::Mtk => Ok(Choice::Mtk(usb.clone())),
        UsbKind::QualcommEdl => Ok(Choice::Edl(usb.clone())),
        UsbKind::SamsungDownload => Ok(Choice::Heimdall(usb.clone())),
        UsbKind::AppleDfu | UsbKind::AppleRecovery => Ok(Choice::Irecovery(usb.clone())),
        UsbKind::AppleNormal => match probe.idevice.as_slice() {
            [udid] => Ok(Choice::Idevice {
                udid: udid.clone(),
                usb: Some(usb.clone()),
            }),
            [] => Ok(Choice::UsbOnly(usb.clone())),
            _ => Err(ambiguous(probe)),
        },
        UsbKind::Fastboot => match probe.fastboot.as_slice() {
            [dev] => Ok(Choice::Fastboot {
                dev: dev.clone(),
                usb: Some(usb.clone()),
            }),
            [] => Ok(Choice::UsbOnly(usb.clone())),
            _ => Err(ambiguous(probe)),
        },
        UsbKind::Adb | UsbKind::Mtp | UsbKind::DescriptorOnly => pick_host_or_usb(usb, probe),
        UsbKind::QualcommDiag | UsbKind::Unknown => Ok(Choice::UsbOnly(usb.clone())),
    }
}

fn choice_for_usb(usb: &UsbIdentity, probe: &Probe) -> Result<Choice, SelectError> {
    match usb.kind {
        UsbKind::Mtk => only_usb(probe, Choice::Mtk(usb.clone())),
        UsbKind::QualcommEdl => only_usb(probe, Choice::Edl(usb.clone())),
        UsbKind::SamsungDownload => only_usb(probe, Choice::Heimdall(usb.clone())),
        UsbKind::AppleDfu | UsbKind::AppleRecovery => {
            only_usb(probe, Choice::Irecovery(usb.clone()))
        }
        UsbKind::AppleNormal => {
            if !probe.adb.is_empty() || !probe.fastboot.is_empty() {
                return Err(ambiguous(probe));
            }
            match probe.idevice.as_slice() {
                [udid] => Ok(Choice::Idevice {
                    udid: udid.clone(),
                    usb: Some(usb.clone()),
                }),
                [] => Ok(Choice::UsbOnly(usb.clone())),
                _ => Err(ambiguous(probe)),
            }
        }
        UsbKind::Fastboot => {
            if !probe.adb.is_empty() || !probe.idevice.is_empty() {
                return Err(ambiguous(probe));
            }
            match probe.fastboot.as_slice() {
                [dev] => Ok(Choice::Fastboot {
                    dev: dev.clone(),
                    usb: Some(usb.clone()),
                }),
                [] => Ok(Choice::UsbOnly(usb.clone())),
                _ => Err(ambiguous(probe)),
            }
        }
        UsbKind::Adb | UsbKind::Mtp | UsbKind::DescriptorOnly => pick_host_or_usb(usb, probe),
        UsbKind::QualcommDiag | UsbKind::Unknown => {
            if host_busy(probe) {
                Err(ambiguous(probe))
            } else {
                Ok(Choice::UsbOnly(usb.clone()))
            }
        }
    }
}

fn only_usb(probe: &Probe, choice: Choice) -> Result<Choice, SelectError> {
    if host_busy(probe) {
        Err(ambiguous(probe))
    } else {
        Ok(choice)
    }
}

fn pick_host_or_usb(usb: &UsbIdentity, probe: &Probe) -> Result<Choice, SelectError> {
    match (
        probe.adb.as_slice(),
        probe.fastboot.as_slice(),
        probe.idevice.as_slice(),
    ) {
        ([dev], [], []) => Ok(Choice::Adb {
            dev: dev.clone(),
            usb: Some(usb.clone()),
        }),
        ([], [dev], []) => Ok(Choice::Fastboot {
            dev: dev.clone(),
            usb: Some(usb.clone()),
        }),
        ([], [], [udid]) if usb.platform == Some("Apple") => Ok(Choice::Idevice {
            udid: udid.clone(),
            usb: Some(usb.clone()),
        }),
        ([], [], []) => Ok(Choice::UsbOnly(usb.clone())),
        _ => Err(ambiguous(probe)),
    }
}

fn companion_usb(probe: &Probe, serial: &str) -> Option<UsbIdentity> {
    probe
        .usb
        .iter()
        .find(|dev| serial_matches(&dev.serial, serial))
        .cloned()
        .or_else(|| {
            let weak: Vec<_> = probe
                .usb
                .iter()
                .filter(|dev| {
                    matches!(
                        dev.kind,
                        UsbKind::Mtp | UsbKind::Adb | UsbKind::DescriptorOnly
                    )
                })
                .cloned()
                .collect();
            if weak.len() == 1 {
                weak.into_iter().next()
            } else {
                None
            }
        })
}

fn usb_matches(dev: &UsbIdentity, spec: &str) -> bool {
    let spec_l = spec.trim().to_ascii_lowercase();
    spec_l == format!("{}:{}", dev.vid, dev.pid)
        || spec_l == format!("{}:{}", dev.bus, dev.addr)
        || spec_l == format!("bus{}.addr{}", dev.bus, dev.addr)
        || serial_matches(&dev.serial, spec)
        || platform_word(spec, dev.platform)
}

fn serial_matches(serial: &str, spec: &str) -> bool {
    let serial = serial.trim();
    !serial.is_empty() && serial != "—" && serial.eq_ignore_ascii_case(spec.trim())
}

fn platform_word(spec: &str, platform: Option<&str>) -> bool {
    let Some(platform) = platform else {
        return false;
    };
    match spec.trim().to_ascii_lowercase().as_str() {
        "mediatek" | "mtk" => platform == "MediaTek",
        "qualcomm" | "qc" | "edl" => platform == "Qualcomm",
        "samsung" => platform == "Samsung",
        "apple" | "iphone" | "ios" => platform == "Apple",
        "android" => platform == "Android",
        other => other == platform.to_ascii_lowercase(),
    }
}

fn supported_count(probe: &Probe) -> usize {
    let usb = probe
        .usb
        .iter()
        .filter(|dev| dev.kind != UsbKind::Unknown)
        .count();
    usb + probe.adb.len() + probe.fastboot.len() + probe.idevice.len()
}

fn no_device(probe: &Probe) -> SelectError {
    let mut message = "No supported device is attached. Plug in a Samsung phone (Download mode or ADB), an iPhone (DFU, Recovery, or a trusted USB session), a MediaTek device (BROM or preloader), a Qualcomm device (EDL 9008), or an Android phone in ADB or fastboot, then retry.".to_string();
    if !probe.notes.is_empty() {
        message.push(' ');
        message.push_str(&probe.notes.join("; "));
    }
    SelectError {
        message,
        no_device: true,
    }
}

fn ambiguous(probe: &Probe) -> SelectError {
    SelectError {
        message: format!(
            "More than one device is attached. Re-run with a selector, for example `aether-cli info 04e8:685d` or `aether-cli info <serial>`.\n{}",
            attached_list(probe)
        ),
        no_device: false,
    }
}

fn attached_list(probe: &Probe) -> String {
    let mut lines = Vec::new();
    for dev in &probe.usb {
        if dev.kind == UsbKind::Unknown {
            continue;
        }
        lines.push(format!(
            "  - {} {} {}:{} serial {}",
            dev.platform.unwrap_or("USB"),
            dev.mode.unwrap_or("USB"),
            dev.vid,
            dev.pid,
            dev.serial
        ));
    }
    for dev in &probe.adb {
        lines.push(format!(
            "  - ADB {} serial {} model {}",
            dev.state,
            dev.serial,
            dev.model.as_deref().unwrap_or("—")
        ));
    }
    for dev in &probe.fastboot {
        lines.push(format!("  - fastboot serial {}", dev.serial));
    }
    for udid in &probe.idevice {
        lines.push(format!("  - Apple lockdown {udid}"));
    }
    if lines.is_empty() {
        "Attached: none".to_string()
    } else {
        format!("Attached:\n{}", lines.join("\n"))
    }
}

fn should_query(choice: &Choice, section: Section) -> bool {
    if matches!(choice, Choice::UsbOnly(_)) {
        return false;
    }
    if let Choice::Adb { dev, .. } = choice {
        if !matches!(dev.state.as_str(), "device" | "recovery") {
            return false;
        }
    }
    match section {
        Section::Status => false,
        Section::Identity => true,
        Section::Firmware => matches!(
            choice,
            Choice::Adb { .. }
                | Choice::Idevice { .. }
                | Choice::Fastboot { .. }
                | Choice::Mtk(_)
                | Choice::Irecovery(_)
        ),
        Section::Battery => matches!(choice, Choice::Adb { .. } | Choice::Idevice { .. }),
        Section::Storage => matches!(
            choice,
            Choice::Adb { .. }
                | Choice::Idevice { .. }
                | Choice::Mtk(_)
                | Choice::Edl(_)
                | Choice::Heimdall(_)
                | Choice::Fastboot { .. }
        ),
    }
}

fn error_report(err: &SelectError) -> IdentityReport {
    IdentityReport {
        report: "identity",
        ok: false,
        no_device: err.no_device,
        dry_run: false,
        platform: "—".into(),
        connection: "not attached".into(),
        brand: None,
        model: None,
        serial: None,
        firmware: None,
        chipset: None,
        battery: None,
        storage: None,
        fields: BTreeMap::new(),
        omitted: Vec::new(),
        error: Some(err.message.clone()),
    }
}

fn blank_report() -> IdentityReport {
    IdentityReport {
        report: "identity",
        ok: true,
        no_device: false,
        dry_run: false,
        platform: "USB".into(),
        connection: "USB".into(),
        brand: None,
        model: None,
        serial: None,
        firmware: None,
        chipset: None,
        battery: None,
        storage: None,
        fields: BTreeMap::new(),
        omitted: Vec::new(),
        error: None,
    }
}

fn report_without_tool(choice: &Choice, section: Section, notes: &[String]) -> IdentityReport {
    let mut report = blank_report();
    apply_choice_usb(&mut report, choice);
    match choice {
        Choice::Adb { dev, .. } if !matches!(dev.state.as_str(), "device" | "recovery") => {
            report.connection = format!("ADB ({})", dev.state);
            report.serial = Some(dev.serial.clone());
            if let Some(model) = dev.model.clone() {
                report.model = Some(model);
            }
            omit(&mut report, "firmware", OMIT_ADB_AUTH);
            omit(&mut report, "battery", OMIT_ADB_AUTH);
            omit(&mut report, "storage", OMIT_ADB_AUTH);
        }
        Choice::UsbOnly(_) => {
            let firmware_reason = if report.platform == "Apple" {
                if notes
                    .iter()
                    .any(|note| note.to_lowercase().contains("idevice"))
                {
                    "ideviceinfo is not installed, so a trusted iPhone cannot be queried. DFU and Recovery are read with irecovery."
                } else {
                    "No trusted iPhone session was found. ideviceinfo reads the model, firmware build, battery, and storage when the phone is connected and trusted."
                }
            } else {
                OMIT_BUILD_USB
            };
            omit(&mut report, "firmware", firmware_reason);
            omit(&mut report, "battery", OMIT_BATTERY_MODE);
            omit(
                &mut report,
                "storage",
                "The USB descriptor does not include storage capacity.",
            );
        }
        Choice::Edl(_) if matches!(section, Section::Firmware | Section::Battery) => {
            omit(&mut report, "firmware", OMIT_BUILD_EDL);
            omit(&mut report, "battery", OMIT_BATTERY_MODE);
        }
        Choice::Heimdall(_) if matches!(section, Section::Firmware | Section::Battery) => {
            omit(&mut report, "firmware", OMIT_BUILD_DOWNLOAD);
            omit(&mut report, "battery", OMIT_BATTERY_MODE);
        }
        Choice::Irecovery(_) if matches!(section, Section::Battery | Section::Storage) => {
            omit(&mut report, "battery", OMIT_BATTERY_DFU);
            omit(&mut report, "storage", OMIT_STORAGE_DFU);
        }
        Choice::Mtk(_) if section == Section::Battery => {
            omit(&mut report, "battery", OMIT_BATTERY_MODE)
        }
        Choice::Fastboot { .. } if section == Section::Battery => {
            omit(&mut report, "battery", OMIT_BATTERY_MODE)
        }
        _ => {}
    }
    if report.model.is_none() {
        omit(
            &mut report,
            "model",
            "This connection did not report a model name.",
        );
    }
    if report.serial.is_none() {
        omit(
            &mut report,
            "serial",
            "This connection did not report a serial number.",
        );
    }
    report
}

fn apply_choice_usb(report: &mut IdentityReport, choice: &Choice) {
    let usb = match choice {
        Choice::Mtk(usb)
        | Choice::Edl(usb)
        | Choice::Heimdall(usb)
        | Choice::Irecovery(usb)
        | Choice::UsbOnly(usb) => Some(usb),
        Choice::Idevice { usb, .. } | Choice::Adb { usb, .. } | Choice::Fastboot { usb, .. } => {
            usb.as_ref()
        }
    };
    if let Some(usb) = usb {
        apply_usb(report, usb);
    }
    match choice {
        Choice::Mtk(_) => report.platform = "MediaTek".into(),
        Choice::Edl(_) => report.platform = "Qualcomm".into(),
        Choice::Heimdall(_) => report.platform = "Samsung".into(),
        Choice::Irecovery(_) | Choice::Idevice { .. } => report.platform = "Apple".into(),
        Choice::Adb { dev, usb } => {
            if usb.as_ref().and_then(|dev| dev.platform).is_none() {
                report.platform = "Android".into();
            }
            report.connection = format!("ADB ({})", dev.state);
            if report.serial.is_none() {
                report.serial = Some(dev.serial.clone());
            }
            if report.model.is_none() {
                report.model = dev.model.clone().or_else(|| dev.product.clone());
            }
        }
        Choice::Fastboot { dev, .. } => {
            if report.platform == "USB" {
                report.platform = "Android".into();
            }
            report.connection = "Fastboot".into();
            if report.serial.is_none() {
                report.serial = Some(dev.serial.clone());
            }
        }
        _ => {}
    }
}

fn apply_usb(report: &mut IdentityReport, usb: &UsbIdentity) {
    report.platform = usb.platform.unwrap_or("USB").to_string();
    report.connection = usb.mode.unwrap_or("USB").to_string();
    report.brand = usable_brand(&usb.manufacturer).or_else(|| usb.brand.map(str::to_string));
    if report.model.is_none() {
        report.model = usable_product(&usb.product);
    }
    if report.serial.is_none() {
        report.serial = usable_serial(&usb.serial);
    }
    insert(&mut report.fields, "usb_vid", &usb.vid);
    insert(&mut report.fields, "usb_pid", &usb.pid);
    insert(&mut report.fields, "usb_bus", &usb.bus.to_string());
    insert(&mut report.fields, "usb_addr", &usb.addr.to_string());
    insert(&mut report.fields, "usb_bcd_device", &usb.bcd_device);
    if usb.manufacturer != "—" {
        insert(&mut report.fields, "usb_manufacturer", &usb.manufacturer);
    }
    if usb.product != "—" {
        insert(&mut report.fields, "usb_product", &usb.product);
    }
}

async fn run_reader(choice: &Choice) -> Result<ToolOutput, String> {
    match choice {
        Choice::Mtk(_) => {
            let (code, text) = crate::mtkclient::run_mtkclient_collect(&["printgpt"])
                .await
                .map_err(|err| err.to_string())?;
            Ok(ToolOutput {
                exit_ok: code == 0,
                text,
                reader: "mtkclient printgpt",
            })
        }
        Choice::Edl(_) => {
            let (code, text) = crate::qualcomm::run_edl_collect(&["printgpt"])
                .await
                .map_err(|err| err.to_string())?;
            Ok(ToolOutput {
                exit_ok: code == 0,
                text,
                reader: "edl printgpt",
            })
        }
        Choice::Heimdall(_) => run_heimdall().await,
        Choice::Irecovery(_) => {
            let bin = crate::apple::irecovery_bin().map_err(|err| err.to_string())?;
            let (code, text) = capture(&bin, &["-q"], 45).await?;
            Ok(ToolOutput {
                exit_ok: code == 0,
                text,
                reader: "irecovery -q",
            })
        }
        Choice::Idevice { udid, .. } => run_ideviceinfo(udid).await,
        Choice::Adb { dev, .. } => {
            let (code, text) =
                capture("adb", &["-s", &dev.serial, "shell", ADB_SCRIPT], 25).await?;
            Ok(ToolOutput {
                exit_ok: code == 0,
                text,
                reader: "adb",
            })
        }
        Choice::Fastboot { dev, .. } => {
            let (code, text) =
                capture("fastboot", &["-s", &dev.serial, "getvar", "all"], 25).await?;
            Ok(ToolOutput {
                exit_ok: code == 0,
                text,
                reader: "fastboot getvar",
            })
        }
        Choice::UsbOnly(_) => Err("USB descriptor only".into()),
    }
}

async fn run_heimdall() -> Result<ToolOutput, String> {
    let (code, detect) = crate::heimdall::run_heimdall_collect(&["detect"])
        .await
        .map_err(|err| err.to_string())?;
    if code != 0 {
        return Ok(ToolOutput {
            exit_ok: false,
            text: detect,
            reader: "heimdall detect",
        });
    }
    let (pit_code, pit) = crate::heimdall::run_heimdall_collect(&["print-pit", "--no-reboot"])
        .await
        .map_err(|err| err.to_string())?;
    let mut text = detect;
    text.push('\n');
    text.push_str(&pit);
    if pit_code != 0 {
        text.push_str("\npit_status: failed\n");
    } else {
        text.push_str("\npit_status: ok\n");
    }
    Ok(ToolOutput {
        exit_ok: true,
        text,
        reader: "heimdall print-pit",
    })
}

async fn run_ideviceinfo(udid: &str) -> Result<ToolOutput, String> {
    let bin = crate::apple::ideviceinfo_bin().map_err(|err| err.to_string())?;
    let (code, info) = capture(&bin, &["-u", udid], 20).await?;
    let mut text = format!("__INFO__\n{info}\n");
    if let Ok((_, battery)) =
        capture(&bin, &["-u", udid, "-q", "com.apple.mobile.battery"], 20).await
    {
        text.push_str("__BATTERY__\n");
        text.push_str(&battery);
        text.push('\n');
    }
    if let Ok((_, disk)) = capture(&bin, &["-u", udid, "-q", "com.apple.disk_usage"], 20).await {
        text.push_str("__DISK__\n");
        text.push_str(&disk);
        text.push('\n');
    }
    Ok(ToolOutput {
        exit_ok: code == 0,
        text,
        reader: "ideviceinfo",
    })
}

fn parse_tool(choice: &Choice, text: &str) -> Parsed {
    match choice {
        Choice::Mtk(_) => parse_mtk(text),
        Choice::Edl(_) => parse_edl(text),
        Choice::Heimdall(_) => parse_heimdall(text),
        Choice::Irecovery(_) => parse_irecovery(text),
        Choice::Idevice { .. } => parse_ideviceinfo(text),
        Choice::Adb { .. } => parse_adb_script(text),
        Choice::Fastboot { .. } => parse_fastboot(text),
        Choice::UsbOnly(_) => Parsed::default(),
    }
}

fn assemble(choice: &Choice, parsed: Parsed, tool: ToolOutput) -> IdentityReport {
    let mut report = blank_report();
    apply_choice_usb(&mut report, choice);
    if let Some(value) = parsed.brand {
        report.brand = Some(value);
    }
    if let Some(value) = parsed.model {
        report.model = usable_product(&value).or(Some(value));
    }
    if let Some(value) = parsed.serial {
        if usable_serial(&value).is_some() {
            report.serial = Some(value);
        }
    }
    report.firmware = parsed.firmware.or(report.firmware);
    report.chipset = parsed.chipset.or(report.chipset);
    report.battery = parsed.battery.or(report.battery);
    report.storage = parsed.storage.or(report.storage);
    for (key, value) in parsed.fields {
        report.fields.insert(key, value);
    }
    report.omitted = parsed.omitted;
    insert(&mut report.fields, "reader", tool.reader);
    if let Some(platform) = refined_platform(&report.platform, &report.fields) {
        report.platform = platform;
    }
    clear_filled_omissions(&mut report);
    if tool.text.contains("pit_status: failed") && report.storage.is_none() {
        omit(
            &mut report,
            "storage",
            "The partition table read failed. USB identity is still reported.",
        );
    }
    if report.firmware.is_none() && !report.omitted.iter().any(|o| o.field == "firmware") {
        omit(&mut report, "firmware", firmware_gap(choice));
    }
    if report.serial.is_none() && !report.omitted.iter().any(|o| o.field == "serial") {
        omit(
            &mut report,
            "serial",
            "This read did not include a serial number.",
        );
    }
    if report.model.is_none() {
        if let Some(chip) = report.chipset.clone() {
            report.model = Some(chip);
        } else if !report.omitted.iter().any(|item| item.field == "model") {
            omit(
                &mut report,
                "model",
                "This read did not include a model name.",
            );
        }
    }
    if report.battery.is_none() && !report.omitted.iter().any(|o| o.field == "battery") {
        omit(&mut report, "battery", OMIT_BATTERY_MODE);
    }
    if !report.fields.contains_key("imei") && !report.omitted.iter().any(|o| o.field == "imei") {
        omit(&mut report, "imei", OMIT_IMEI);
    }
    if !tool.exit_ok {
        report.ok = false;
        let tail = tail_lines(&tool.text, 20);
        report.error = Some(trim_err(&format!(
            "{reader} failed.\n{tail}",
            reader = tool.reader
        )));
    }
    report
}

fn firmware_gap(choice: &Choice) -> &'static str {
    match choice {
        Choice::Mtk(_) => OMIT_BUILD_BROM,
        Choice::Edl(_) => OMIT_BUILD_EDL,
        Choice::Heimdall(_) => OMIT_BUILD_DOWNLOAD,
        Choice::Irecovery(_) => "DFU/Recovery did not include an iBoot or firmware string.",
        _ => "This read did not include a firmware or build string.",
    }
}

fn clear_filled_omissions(report: &mut IdentityReport) {
    report.omitted.retain(|item| match item.field.as_str() {
        "serial" => report.serial.is_none(),
        "model" => report.model.is_none(),
        "firmware" => report.firmware.is_none(),
        "battery" => report.battery.is_none(),
        "storage" => report.storage.is_none(),
        "imei" => !report.fields.contains_key("imei"),
        _ => true,
    });
}

fn parse_mtk(text: &str) -> Parsed {
    let mut parsed = Parsed::default();
    for line in text.lines() {
        let lower = line.to_lowercase();
        if lower.contains("payload") {
            continue;
        }
        if let Some(value) = value_after(line, "cpu:") {
            parsed.chipset = Some(value.clone());
            parsed.model = Some(value);
        } else if let Some(value) = value_after(line, "hw code:") {
            insert(&mut parsed.fields, "hw_code", &value);
        } else if let Some(value) = value_after(line, "hw subcode:") {
            insert(&mut parsed.fields, "hw_subcode", &value);
        } else if let Some(value) = value_after(line, "hw ver:") {
            insert(&mut parsed.fields, "hw_ver", &value);
        } else if let Some(value) = value_after(line, "sw ver:") {
            insert(&mut parsed.fields, "preloader_sw_ver", &value);
            parsed.firmware = Some(format!("preloader SW {value}"));
        } else if let Some(value) = value_after(line, "me_id:") {
            insert(&mut parsed.fields, "me_id", &value);
        } else if let Some(value) = value_after(line, "soc_id:") {
            insert(&mut parsed.fields, "soc_id", &value);
        }
    }
    if let Some(bytes) = sum_hex_lengths(text) {
        parsed.storage = Some(storage_estimate(bytes));
    }
    omit(&mut parsed, "imei", OMIT_IMEI);
    if parsed.serial.is_none() {
        omit(&mut parsed, "serial", OMIT_SERIAL_BROM);
    }
    if parsed
        .firmware
        .as_deref()
        .unwrap_or("")
        .starts_with("preloader")
    {
        omit(&mut parsed, "android_build", OMIT_BUILD_BROM);
    }
    omit(&mut parsed, "battery", OMIT_BATTERY_MODE);
    parsed
}

fn parse_edl(text: &str) -> Parsed {
    let mut parsed = Parsed::default();
    for line in text.lines() {
        let Some((key, value)) = loose_key(line) else {
            continue;
        };
        match key.as_str() {
            "chip serial" | "serial" | "chip_serial" => {
                parsed.serial = Some(value);
            }
            "msm id" | "msm_id" | "hwid" | "hw id" => {
                parsed.chipset = Some(value.clone());
                insert(&mut parsed.fields, "msm_id", &value);
            }
            "oem id" | "oem_id" => insert(&mut parsed.fields, "oem_id", &value),
            "model id" | "model_id" => insert(&mut parsed.fields, "model_id", &value),
            "pk hash" | "pk_hash" => insert(&mut parsed.fields, "pk_hash", &value),
            "cpu" => {
                parsed.chipset = Some(value.clone());
                parsed.model = Some(value);
            }
            _ => {}
        }
    }
    if let Some(bytes) = sum_hex_lengths(text) {
        parsed.storage = Some(storage_estimate(bytes));
    }
    omit(&mut parsed, "firmware", OMIT_BUILD_EDL);
    omit(&mut parsed, "battery", OMIT_BATTERY_MODE);
    omit(&mut parsed, "imei", OMIT_IMEI);
    parsed
}

fn parse_heimdall(text: &str) -> Parsed {
    let mut parsed = Parsed::default();
    let mut names = Vec::new();
    for line in text.lines() {
        if let Some(value) = value_after(line, "partition name:") {
            names.push(value);
        }
    }
    if !names.is_empty() {
        insert(&mut parsed.fields, "pit_entries", &names.len().to_string());
    }
    if let Some(bytes) = sum_pit_blocks(text) {
        parsed.storage = Some(storage_estimate(bytes));
    }
    omit(&mut parsed, "firmware", OMIT_BUILD_DOWNLOAD);
    omit(&mut parsed, "battery", OMIT_BATTERY_MODE);
    omit(&mut parsed, "imei", OMIT_IMEI);
    if parsed.serial.is_none() {
        omit(
            &mut parsed,
            "serial",
            "Download mode did not include a serial in the partition table. The USB serial is used when the descriptor has one.",
        );
    }
    parsed
}

fn parse_irecovery(text: &str) -> Parsed {
    let mut parsed = Parsed::default();
    let mut product = None;
    let mut board = None;
    for line in text.lines() {
        let Some((key, value)) = loose_key(line) else {
            continue;
        };
        match key.as_str() {
            "srnm" | "serial" => parsed.serial = Some(value),
            "product" => product = Some(value),
            "model" => board = Some(value),
            "srtg" => parsed.firmware = Some(value),
            "cpid" => {
                parsed.chipset = Some(format!("CPID {value}"));
                insert(&mut parsed.fields, "cpid", &value);
            }
            "ecid" => insert(&mut parsed.fields, "ecid", &value),
            "bdid" => insert(&mut parsed.fields, "bdid", &value),
            "cprv" => insert(&mut parsed.fields, "cprv", &value),
            "mode" => insert(&mut parsed.fields, "mode", &value),
            "imei" => insert(&mut parsed.fields, "imei", &value),
            _ => {}
        }
    }
    if let Some(product) = product {
        insert(&mut parsed.fields, "product_type", &product);
        parsed.model = Some(apple_model_name(&product));
    }
    if let Some(board) = board {
        insert(&mut parsed.fields, "board_id", &board);
        if parsed.model.is_none() {
            parsed.model = Some(board);
        }
    }
    omit(&mut parsed, "battery", OMIT_BATTERY_DFU);
    omit(&mut parsed, "storage", OMIT_STORAGE_DFU);
    if !parsed.fields.contains_key("imei") {
        omit(&mut parsed, "imei", OMIT_IMEI);
    }
    parsed
}

fn parse_ideviceinfo(text: &str) -> Parsed {
    let mut bag = BTreeMap::new();
    for line in text.lines() {
        let Some((key, value)) = loose_key(line) else {
            continue;
        };
        bag.entry(key).or_insert(value);
    }
    let mut parsed = Parsed::default();
    let product = bag.get("producttype").cloned();
    if let Some(product) = &product {
        insert(&mut parsed.fields, "product_type", product);
        parsed.model = Some(apple_model_name(product));
    } else if let Some(name) = bag.get("devicename") {
        parsed.model = Some(name.clone());
    }
    parsed.serial = bag.get("serialnumber").cloned();
    let version = bag.get("productversion").cloned();
    let build = bag.get("buildversion").cloned();
    parsed.firmware = match (version.clone(), build.clone()) {
        (Some(ver), Some(build)) => Some(format!("iOS {ver} ({build})")),
        (Some(ver), None) => Some(format!("iOS {ver}")),
        (None, Some(build)) => Some(build),
        (None, None) => None,
    };
    if let Some(ver) = version {
        insert(&mut parsed.fields, "product_version", &ver);
    }
    if let Some(build) = build {
        insert(&mut parsed.fields, "build_version", &build);
    }
    copy_bag(&mut parsed, &bag, "devicename", "device_name");
    copy_bag(&mut parsed, &bag, "hardwaremodel", "board_id");
    copy_bag(&mut parsed, &bag, "modelnumber", "model_number");
    copy_bag(&mut parsed, &bag, "uniquechipid", "ecid");
    copy_bag(&mut parsed, &bag, "uniquedeviceid", "udid");
    copy_bag(&mut parsed, &bag, "cpuarchitecture", "cpu_architecture");
    copy_bag(&mut parsed, &bag, "activationstate", "activation_state");
    copy_bag(&mut parsed, &bag, "hardwareplatform", "hardware_platform");
    if let Some(imei) = bag.get("internationalmobileequipmentidentity") {
        insert(&mut parsed.fields, "imei", imei);
    }
    parsed.chipset = bag
        .get("hardwaremodel")
        .cloned()
        .or_else(|| bag.get("cpuarchitecture").cloned());
    parsed.battery = apple_battery(&bag);
    if let Some(bytes) = bag
        .get("totaldiskcapacity")
        .and_then(|v| v.parse::<u64>().ok())
        .or_else(|| {
            bag.get("totaldatacapacity")
                .and_then(|v| v.parse::<u64>().ok())
        })
    {
        parsed.storage = Some(format!("{} total", human_bytes(bytes)));
    }
    if !parsed.fields.contains_key("imei") {
        omit(&mut parsed, "imei", OMIT_IMEI);
    }
    parsed
}

fn apple_battery(bag: &BTreeMap<String, String>) -> Option<String> {
    let level = bag.get("batterycurrentcapacity")?;
    let design = bag
        .get("designcapacity")
        .and_then(|v| v.parse::<u64>().ok());
    let full = bag
        .get("nominalchargecapacity")
        .or_else(|| bag.get("applerawmaxcapacity"))
        .and_then(|v| v.parse::<u64>().ok());
    let cycles = bag.get("cyclecount");
    let mut text = format!("{level}%");
    if let (Some(design), Some(full)) = (design, full) {
        if design > 0 {
            let pct = (full as f64 / design as f64) * 100.0;
            text.push_str(&format!(" · {pct:.0}% of design"));
        }
    }
    if let Some(cycles) = cycles {
        text.push_str(&format!(" · {cycles} cycles"));
    }
    Some(text)
}

fn parse_adb_script(text: &str) -> Parsed {
    let mut section = "props";
    let mut props = BTreeMap::new();
    let mut battery_lines = Vec::new();
    let mut storage_lines = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        match line {
            "__PROPS__" => section = "props",
            "__BATTERY__" => section = "battery",
            "__CELLS__" => section = "cells",
            "__STORAGE__" => section = "storage",
            _ => match section {
                "props" | "cells" => {
                    if let Some((key, value)) = line.split_once('=') {
                        let value = value.trim();
                        if !value.is_empty() {
                            props.insert(key.trim().to_string(), value.to_string());
                        }
                    }
                }
                "battery" => battery_lines.push(line.to_string()),
                "storage" => storage_lines.push(line.to_string()),
                _ => {}
            },
        }
    }
    let mut parsed = Parsed::default();
    parsed.model = props
        .get("market")
        .cloned()
        .filter(|v| usable_product(v).is_some())
        .or_else(|| props.get("model").cloned());
    parsed.brand = props
        .get("manufacturer")
        .cloned()
        .or_else(|| props.get("brand").cloned());
    parsed.serial = props
        .get("serial")
        .cloned()
        .or_else(|| props.get("boot_serial").cloned());
    parsed.firmware = props
        .get("build")
        .cloned()
        .or_else(|| props.get("fingerprint").cloned());
    parsed.chipset = props
        .get("board")
        .cloned()
        .or_else(|| props.get("hardware").cloned());
    copy_prop(&mut parsed, &props, "android", "android_version");
    copy_prop(&mut parsed, &props, "incremental", "build_incremental");
    copy_prop(&mut parsed, &props, "fingerprint", "fingerprint");
    copy_prop(&mut parsed, &props, "patch", "security_patch");
    copy_prop(&mut parsed, &props, "board", "board_platform");
    copy_prop(&mut parsed, &props, "hardware", "hardware");
    copy_prop(&mut parsed, &props, "baseband", "baseband");
    copy_prop(&mut parsed, &props, "device", "device");
    copy_prop(&mut parsed, &props, "name", "product_name");
    if let Some(model) = props.get("model") {
        insert(&mut parsed.fields, "product_model", model);
    }
    let imei = ["imei", "imei1", "ril_imei", "ril_imei1"]
        .iter()
        .find_map(|key| props.get(*key).cloned());
    if let Some(imei) = imei {
        insert(&mut parsed.fields, "imei", &imei);
        if let Some(imei2) = props.get("imei2").or_else(|| props.get("ril_imei2")) {
            if imei2 != &imei {
                insert(&mut parsed.fields, "imei2", imei2);
            }
        }
    } else {
        omit(
            &mut parsed,
            "imei",
            "ADB properties did not include an IMEI. Modem NV is not read.",
        );
    }
    parsed.battery = android_battery(&battery_lines, &props);
    if let Some(bytes) = parse_df_bytes(&storage_lines) {
        parsed.storage = Some(format!("{} data partition", human_bytes(bytes)));
    }
    parsed
}

fn android_battery(lines: &[String], props: &BTreeMap<String, String>) -> Option<String> {
    let mut level = None;
    let mut health = None;
    for line in lines {
        if let Some((key, value)) = loose_key(line) {
            match key.as_str() {
                "level" => level = Some(value),
                "health" => health = Some(value),
                "temperature" => {}
                _ => {}
            }
        }
    }
    let level = level?;
    let mut text = format!("{level}%");
    if let Some(code) = health {
        text.push_str(" · health ");
        text.push_str(android_health_word(&code));
    }
    if let (Some(full), Some(design)) = (props.get("full"), props.get("design")) {
        if let (Ok(full), Ok(design)) = (full.parse::<u64>(), design.parse::<u64>()) {
            if design > 0 {
                let full_mah = cell_mah(full);
                let design_mah = cell_mah(design);
                let pct = (full_mah as f64 / design_mah as f64) * 100.0;
                text.push_str(&format!(" · {pct:.0}% of design"));
            }
        }
    }
    if let Some(cycles) = props.get("cycles") {
        if cycles.chars().all(|c| c.is_ascii_digit()) {
            text.push_str(" · ");
            text.push_str(cycles);
            text.push_str(" cycles");
        }
    }
    Some(text)
}

fn cell_mah(value: u64) -> u64 {
    if value > 20_000 {
        value / 1000
    } else {
        value
    }
}

fn android_health_word(code: &str) -> &'static str {
    match code.trim() {
        "2" => "good",
        "3" => "overheat",
        "4" => "dead",
        "5" => "over-voltage",
        "6" => "failure",
        "7" => "cold",
        _ => "unknown",
    }
}

fn parse_fastboot(text: &str) -> Parsed {
    let mut parsed = Parsed::default();
    let mut userdata = None;
    for line in text.lines() {
        let raw = line.trim().trim_start_matches("(bootloader)").trim();
        if raw.to_lowercase().contains("partition-size:userdata") {
            if let Some(value) = raw.rsplit(':').next() {
                userdata = parse_int(value.trim());
            }
            continue;
        }
        let Some((key, value)) = loose_key(line) else {
            continue;
        };
        match key.as_str() {
            "product" => parsed.model = Some(value.replace('_', " ")),
            "serialno" => parsed.serial = Some(value),
            "version-bootloader" | "version" => {
                if parsed.firmware.is_none() || key == "version-bootloader" {
                    parsed.firmware = Some(value.clone());
                }
                insert(&mut parsed.fields, &key.replace('-', "_"), &value);
            }
            "version-baseband" => insert(&mut parsed.fields, "baseband", &value),
            "hw-revision" => {
                parsed.chipset = Some(value.clone());
                insert(&mut parsed.fields, "hw_revision", &value);
            }
            "variant" => insert(&mut parsed.fields, "variant", &value),
            "sku" => insert(&mut parsed.fields, "sku", &value),
            "storage-type" => insert(&mut parsed.fields, "storage_type", &value),
            "unlocked" => insert(&mut parsed.fields, "bootloader_unlocked", &value),
            _ => {}
        }
    }
    if let Some(bytes) = userdata {
        parsed.storage = Some(format!("{} userdata partition", human_bytes(bytes)));
    }
    omit(&mut parsed, "battery", OMIT_BATTERY_MODE);
    omit(&mut parsed, "imei", OMIT_IMEI);
    parsed
}

fn parse_df_bytes(lines: &[String]) -> Option<u64> {
    for line in lines {
        if line.starts_with("Filesystem") || line.is_empty() {
            continue;
        }
        let cols: Vec<_> = line.split_whitespace().collect();
        if cols.len() >= 2 {
            if let Ok(blocks) = cols[1].parse::<u64>() {
                return Some(blocks.saturating_mul(1024));
            }
        }
    }
    None
}

fn sum_hex_lengths(text: &str) -> Option<u64> {
    let mut total = 0u64;
    let mut hits = 0u32;
    for line in text.lines() {
        let lower = line.to_lowercase();
        let marker = if lower.contains("length 0x") {
            "length 0x"
        } else if lower.contains("size: 0x") {
            "size: 0x"
        } else if lower.contains("sectors: 0x") {
            "sectors: 0x"
        } else {
            continue;
        };
        if let Some(sectors) = hex_after(line, marker) {
            total = total.saturating_add(sectors);
            hits += 1;
        }
    }
    if hits == 0 {
        None
    } else {
        Some(total.saturating_mul(512))
    }
}

fn sum_pit_blocks(text: &str) -> Option<u64> {
    let mut total = 0u64;
    let mut hits = 0u32;
    for line in text.lines() {
        if let Some(value) = value_after(line, "partition block count:") {
            if let Ok(blocks) = value.parse::<u64>() {
                total = total.saturating_add(blocks);
                hits += 1;
            }
        }
    }
    if hits == 0 {
        None
    } else {
        Some(total.saturating_mul(512))
    }
}

fn storage_estimate(bytes: u64) -> String {
    format!("{} (partition table, 512-byte sectors)", human_bytes(bytes))
}

fn human_bytes(bytes: u64) -> String {
    let gib = bytes as f64 / 1024.0 / 1024.0 / 1024.0;
    if gib >= 1.0 {
        format!("{gib:.1} GiB")
    } else {
        let mib = bytes as f64 / 1024.0 / 1024.0;
        format!("{mib:.1} MiB")
    }
}

fn hex_after(line: &str, marker: &str) -> Option<u64> {
    let lower = line.to_lowercase();
    let idx = lower.find(&marker.to_lowercase())?;
    let rest = line[idx + marker.len()..].trim();
    let token = rest.split_whitespace().next().unwrap_or("");
    let token = token
        .trim_end_matches([',', ';'])
        .trim_start_matches("0x")
        .trim_start_matches("0X");
    u64::from_str_radix(token, 16).ok()
}

fn parse_int(token: &str) -> Option<u64> {
    let token = token.trim().trim_end_matches([',', ';']);
    if let Some(hex) = token
        .strip_prefix("0x")
        .or_else(|| token.strip_prefix("0X"))
    {
        u64::from_str_radix(hex, 16).ok()
    } else {
        token.parse::<u64>().ok()
    }
}

fn value_after(line: &str, label: &str) -> Option<String> {
    let lower = line.to_lowercase();
    let label_l = label.to_lowercase();
    let idx = lower.find(&label_l)?;
    let rest = line[idx + label.len()..]
        .trim()
        .trim_start_matches(':')
        .trim();
    let rest = rest.trim_matches('"').trim();
    if rest.is_empty() {
        None
    } else {
        Some(rest.to_string())
    }
}

fn loose_key(line: &str) -> Option<(String, String)> {
    let line = line.trim().trim_start_matches("(bootloader)").trim();
    let (key, value) = line.split_once(':')?;
    let key = key.trim().to_lowercase();
    let value = value.trim().trim_matches('"').to_string();
    if key.is_empty() || value.is_empty() {
        None
    } else {
        Some((key, value))
    }
}

fn refined_platform(current: &str, fields: &BTreeMap<String, String>) -> Option<String> {
    if current != "Android" && current != "USB" {
        return None;
    }
    let board = fields
        .get("board_platform")
        .or_else(|| fields.get("hardware"))
        .map(|v| v.to_ascii_lowercase())?;
    if board.starts_with("mt") {
        Some("MediaTek".into())
    } else if board.contains("qcom")
        || board.contains("msm")
        || board.contains("sdm")
        || board.starts_with("taro")
        || board.starts_with("lahaina")
        || board.starts_with("kalama")
        || board.starts_with("pineapple")
        || board.starts_with("kona")
    {
        Some("Qualcomm".into())
    } else if board.contains("exynos") || board.starts_with("s5e") || board.contains("universal") {
        Some("Samsung".into())
    } else {
        None
    }
}

fn apple_model_name(product_type: &str) -> String {
    let name = match product_type.trim() {
        "iPhone8,1" => "iPhone 6s",
        "iPhone8,2" => "iPhone 6s Plus",
        "iPhone8,4" => "iPhone SE",
        "iPhone9,1" | "iPhone9,3" => "iPhone 7",
        "iPhone9,2" | "iPhone9,4" => "iPhone 7 Plus",
        "iPhone10,1" | "iPhone10,4" => "iPhone 8",
        "iPhone10,2" | "iPhone10,5" => "iPhone 8 Plus",
        "iPhone10,3" | "iPhone10,6" => "iPhone X",
        "iPhone11,2" => "iPhone XS",
        "iPhone11,4" | "iPhone11,6" => "iPhone XS Max",
        "iPhone11,8" => "iPhone XR",
        "iPhone12,1" => "iPhone 11",
        "iPhone12,3" => "iPhone 11 Pro",
        "iPhone12,5" => "iPhone 11 Pro Max",
        "iPhone12,8" => "iPhone SE (2nd)",
        "iPhone13,1" => "iPhone 12 mini",
        "iPhone13,2" => "iPhone 12",
        "iPhone13,3" => "iPhone 12 Pro",
        "iPhone13,4" => "iPhone 12 Pro Max",
        "iPhone14,4" => "iPhone 13 mini",
        "iPhone14,5" => "iPhone 13",
        "iPhone14,2" => "iPhone 13 Pro",
        "iPhone14,3" => "iPhone 13 Pro Max",
        "iPhone14,6" => "iPhone SE (3rd)",
        "iPhone14,7" => "iPhone 14",
        "iPhone14,8" => "iPhone 14 Plus",
        "iPhone15,2" => "iPhone 14 Pro",
        "iPhone15,3" => "iPhone 14 Pro Max",
        "iPhone15,4" => "iPhone 15",
        "iPhone15,5" => "iPhone 15 Plus",
        "iPhone16,1" => "iPhone 15 Pro",
        "iPhone16,2" => "iPhone 15 Pro Max",
        "iPhone17,3" => "iPhone 16",
        "iPhone17,4" => "iPhone 16 Plus",
        "iPhone17,1" => "iPhone 16 Pro",
        "iPhone17,2" => "iPhone 16 Pro Max",
        _ => return product_type.to_string(),
    };
    format!("{name} ({product_type})")
}

fn copy_bag(parsed: &mut Parsed, bag: &BTreeMap<String, String>, src: &str, dest: &str) {
    if let Some(value) = bag.get(src) {
        insert(&mut parsed.fields, dest, value);
    }
}

fn copy_prop(parsed: &mut Parsed, props: &BTreeMap<String, String>, src: &str, dest: &str) {
    if let Some(value) = props.get(src) {
        insert(&mut parsed.fields, dest, value);
    }
}

fn insert(map: &mut BTreeMap<String, String>, key: &str, value: &str) {
    let value = value.trim();
    if !value.is_empty() && value != "—" {
        map.insert(key.to_string(), value.to_string());
    }
}

fn omit(target: &mut impl OmitList, field: &str, reason: &str) {
    target.push_omit(field, reason);
}

trait OmitList {
    fn push_omit(&mut self, field: &str, reason: &str);
}

impl OmitList for Parsed {
    fn push_omit(&mut self, field: &str, reason: &str) {
        if !self.omitted.iter().any(|item| item.field == field) {
            self.omitted.push(OmittedField {
                field: field.to_string(),
                reason: reason.to_string(),
            });
        }
    }
}

impl OmitList for IdentityReport {
    fn push_omit(&mut self, field: &str, reason: &str) {
        if !self.omitted.iter().any(|item| item.field == field) {
            self.omitted.push(OmittedField {
                field: field.to_string(),
                reason: reason.to_string(),
            });
        }
    }
}

fn usable_serial(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() || value == "—" || value == "-" {
        None
    } else {
        Some(value.to_string())
    }
}

fn usable_brand(value: &str) -> Option<String> {
    let value = value.trim();
    let lower = value.to_ascii_lowercase();
    if value.is_empty() || value == "—" || lower == "android" || lower == "unknown" {
        None
    } else {
        Some(value.to_string())
    }
}

fn usable_product(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() || value == "—" || value == "-" {
        return None;
    }
    let lower = value.to_ascii_lowercase();
    const GENERIC: &[&str] = &[
        "qhusb",
        "qhsusb",
        "gadget",
        "composite",
        "preloader",
        "mediatek",
        "apple mobile device",
        "usb modem",
        "samsung mobile",
        "adb interface",
        "fastboot",
        "mtp",
    ];
    if GENERIC.iter().any(|item| lower.contains(item)) || lower == "android" {
        None
    } else {
        Some(value.to_string())
    }
}

fn tail_lines(text: &str, n: usize) -> String {
    let lines: Vec<_> = text
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    let start = lines.len().saturating_sub(n);
    lines[start..].join("\n")
}

fn trim_err(text: &str) -> String {
    let mut out = text.trim().to_string();
    if out.chars().count() > 800 {
        out = out.chars().take(800).collect();
        out.push('…');
    }
    out
}

fn format_identity_lines(report: &IdentityReport) -> Vec<String> {
    let mut lines = Vec::new();
    if report.dry_run {
        lines.push("Dry run — no device was queried.".into());
    }
    lines.push(format!("Platform     {}", report.platform));
    lines.push(format!("Connection   {}", report.connection));
    lines.push(format!("Brand        {}", show(&report.brand)));
    lines.push(format!("Model        {}", show(&report.model)));
    lines.push(format!("Serial       {}", show(&report.serial)));
    lines.push(format!("Firmware     {}", show(&report.firmware)));
    lines.push(format!("Chipset      {}", show(&report.chipset)));
    lines.push(format!("Battery      {}", show(&report.battery)));
    lines.push(format!("Storage      {}", show(&report.storage)));
    if !report.fields.is_empty() {
        lines.push("Fields".into());
        for (key, value) in &report.fields {
            lines.push(format!("  {key:<18} {value}"));
        }
    }
    if !report.omitted.is_empty() {
        lines.push("Not available from this read".into());
        for item in &report.omitted {
            lines.push(format!("  {} — {}", item.field, item.reason));
        }
    }
    if let Some(error) = &report.error {
        lines.push(format!("Error        {error}"));
    }
    lines
}

fn format_status_lines(report: &StatusReport) -> Vec<String> {
    if report.count == 0 {
        return vec![report
            .error
            .clone()
            .unwrap_or_else(|| "No supported device is attached.".into())];
    }
    let mut lines = vec![format!("{} supported connection(s).", report.count)];
    for dev in &report.devices {
        lines.push(format!(
            "{} · {} · {} {} · serial {} · model {}",
            dev.platform,
            dev.connection,
            dev.vid.as_deref().unwrap_or("—"),
            dev.pid.as_deref().unwrap_or("—"),
            dev.serial.as_deref().unwrap_or("—"),
            dev.model.as_deref().unwrap_or("—"),
        ));
    }
    for note in &report.notes {
        lines.push(format!("note: {note}"));
    }
    if let Some(error) = &report.error {
        lines.push(error.clone());
    }
    lines
}

fn show(value: &Option<String>) -> String {
    value.clone().unwrap_or_else(|| "—".into())
}

fn status_from_probe(probe: &Probe, port: &str) -> StatusReport {
    let spec = port.trim();
    let filtered = !spec.is_empty() && !spec.eq_ignore_ascii_case("auto");
    let mut devices = Vec::new();
    for dev in &probe.usb {
        if dev.kind == UsbKind::Unknown {
            continue;
        }
        if filtered && !usb_matches(dev, spec) {
            continue;
        }
        devices.push(StatusDevice {
            platform: dev.platform.unwrap_or("USB").to_string(),
            connection: dev.mode.unwrap_or("USB").to_string(),
            vid: Some(dev.vid.clone()),
            pid: Some(dev.pid.clone()),
            bus: Some(dev.bus),
            addr: Some(dev.addr),
            serial: usable_serial(&dev.serial),
            model: usable_product(&dev.product),
            manufacturer: usable_brand(&dev.manufacturer).or_else(|| dev.brand.map(str::to_string)),
        });
    }
    for dev in &probe.adb {
        if filtered && !serial_matches(&dev.serial, spec) && !platform_word(spec, Some("Android")) {
            continue;
        }
        devices.push(StatusDevice {
            platform: "Android".into(),
            connection: format!("ADB ({})", dev.state),
            vid: None,
            pid: None,
            bus: None,
            addr: None,
            serial: Some(dev.serial.clone()),
            model: dev.model.clone().or_else(|| dev.product.clone()),
            manufacturer: None,
        });
    }
    for dev in &probe.fastboot {
        if filtered && !serial_matches(&dev.serial, spec) && !spec.eq_ignore_ascii_case("fastboot")
        {
            continue;
        }
        devices.push(StatusDevice {
            platform: "Android".into(),
            connection: "Fastboot".into(),
            vid: None,
            pid: None,
            bus: None,
            addr: None,
            serial: Some(dev.serial.clone()),
            model: None,
            manufacturer: None,
        });
    }
    for udid in &probe.idevice {
        if filtered && !serial_matches(udid, spec) && !platform_word(spec, Some("Apple")) {
            continue;
        }
        devices.push(StatusDevice {
            platform: "Apple".into(),
            connection: "trusted USB".into(),
            vid: None,
            pid: None,
            bus: None,
            addr: None,
            serial: Some(udid.clone()),
            model: None,
            manufacturer: Some("Apple".into()),
        });
    }
    let count = devices.len();
    if count == 0 {
        let err = if supported_count(probe) == 0 {
            no_device(probe)
        } else {
            SelectError {
                message: format!(
                    "No attached device matches '{port}'.\n{}",
                    attached_list(probe)
                ),
                no_device: false,
            }
        };
        return StatusReport {
            report: "status",
            ok: false,
            no_device: err.no_device,
            dry_run: false,
            count: 0,
            devices,
            notes: probe.notes.clone(),
            error: Some(err.message),
        };
    }
    StatusReport {
        report: "status",
        ok: true,
        no_device: false,
        dry_run: false,
        count,
        devices,
        notes: probe.notes.clone(),
        error: None,
    }
}

/// JSON status for the bridge. `port` filters the same way as the CLI.
pub async fn status_value(port: &str) -> Value {
    serde_json::to_value(status_report(port).await).unwrap_or(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::usb::{exact_signature, signature, UsbKind};

    fn usb(vid: &str, pid: &str, serial: &str) -> UsbIdentity {
        let vid_n = u16::from_str_radix(vid, 16).unwrap();
        let pid_n = u16::from_str_radix(pid, 16).unwrap();
        let sig = signature(vid_n, pid_n);
        let exact = exact_signature(vid_n, pid_n);
        UsbIdentity {
            bus: 1,
            addr: 5,
            vid: vid.into(),
            pid: pid.into(),
            manufacturer: "—".into(),
            product: "—".into(),
            serial: serial.into(),
            bcd_device: "4.00".into(),
            platform: sig.as_ref().map(|s| s.platform),
            brand: sig.as_ref().map(|s| s.brand),
            mode: exact.map(|s| s.mode),
            kind: sig.map(|s| s.kind).unwrap_or(UsbKind::Unknown),
        }
    }

    fn empty_probe() -> Probe {
        Probe {
            usb: vec![],
            adb: vec![],
            fastboot: vec![],
            idevice: vec![],
            notes: vec![],
        }
    }

    #[test]
    fn empty_probe_reports_no_device() {
        let err = select(&empty_probe(), "auto").unwrap_err();
        assert!(err.no_device);
        assert!(err.message.contains("No supported device"));
    }

    #[test]
    fn brom_is_selected_for_an_identity_read() {
        let mut probe = empty_probe();
        probe.usb.push(usb("0e8d", "2000", "—"));
        let choice = select(&probe, "auto").unwrap();
        assert!(matches!(choice, Choice::Mtk(_)));
    }

    #[test]
    fn two_repair_devices_ask_for_a_selector() {
        let mut probe = empty_probe();
        probe.usb.push(usb("0e8d", "2000", "—"));
        probe.usb.push(usb("04e8", "685d", "R58M"));
        let err = select(&probe, "auto").unwrap_err();
        assert!(!err.no_device);
        assert!(err.message.contains("04e8:685d"));
    }

    #[test]
    fn vid_pid_selects_samsung_download() {
        let mut probe = empty_probe();
        probe.usb.push(usb("0e8d", "2000", "—"));
        probe.usb.push(usb("04e8", "685d", "R58M"));
        let choice = select(&probe, "04e8:685d").unwrap();
        assert!(matches!(choice, Choice::Heimdall(_)));
    }

    #[test]
    fn mtp_with_one_adb_device_uses_adb() {
        let mut probe = empty_probe();
        probe.usb.push(usb("04e8", "6860", "R58M"));
        probe.adb.push(AdbDevice {
            serial: "R58M".into(),
            state: "device".into(),
            model: Some("SM-G960F".into()),
            product: None,
        });
        let choice = select(&probe, "auto").unwrap();
        assert!(matches!(choice, Choice::Adb { .. }));
    }

    #[test]
    fn qhusb_product_is_not_a_model_name() {
        assert!(usable_product("QHSUSB__BULK").is_none());
        assert_eq!(usable_product("SM-G960F").as_deref(), Some("SM-G960F"));
    }

    #[test]
    fn mtk_printgpt_keeps_chip_identity_and_skips_payload_lines() {
        let text = "\
Preloader - CPU:            MT6768
Preloader - HW code:        0x707
Preloader - HW Ver:         0xca00
Preloader - SW Ver:         0x0001
Preloader - ME_ID:          ABCDEF
Preloader - Brom payload addr: 0x100A00
userdata Offset 0x10, Length 0x2000
";
        let parsed = parse_mtk(text);
        assert_eq!(parsed.chipset.as_deref(), Some("MT6768"));
        assert_eq!(parsed.model.as_deref(), Some("MT6768"));
        assert_eq!(parsed.firmware.as_deref(), Some("preloader SW 0x0001"));
        assert_eq!(
            parsed.fields.get("me_id").map(String::as_str),
            Some("ABCDEF")
        );
        assert!(parsed.serial.is_none());
        assert!(!parsed.fields.contains_key("payload"));
        assert!(parsed
            .omitted
            .iter()
            .any(|item| item.field == "android_build"));
        assert!(parsed.storage.is_some());
    }

    #[test]
    fn edl_text_reports_chip_serial_without_a_build_string() {
        let text = "\
Chip serial: 0x00abc123
MSM ID: 0x000460e1
OEM ID: 0x0001
Model ID: 0x0004
userdata Offset 0x100, Length 0x1000
";
        let parsed = parse_edl(text);
        assert_eq!(parsed.serial.as_deref(), Some("0x00abc123"));
        assert_eq!(parsed.chipset.as_deref(), Some("0x000460e1"));
        assert!(parsed.firmware.is_none());
        assert!(parsed.omitted.iter().any(|item| item.field == "firmware"));
        assert!(parsed.fields.get("oem_id").is_some());
    }

    #[test]
    fn heimdall_pit_sums_blocks_and_omits_android_build() {
        let text = "\
Device detected
--- Entry #0 ---
Partition Block Count: 1024
Partition Name: BOOT
--- Entry #1 ---
Partition Block Count: 2048
Partition Name: USERDATA
";
        let parsed = parse_heimdall(text);
        assert_eq!(
            parsed.fields.get("pit_entries").map(String::as_str),
            Some("2")
        );
        assert!(parsed.firmware.is_none());
        let bytes = 3072u64 * 512;
        assert_eq!(
            parsed.storage.as_deref(),
            Some(storage_estimate(bytes).as_str())
        );
    }

    #[test]
    fn irecovery_query_maps_model_serial_and_iboot() {
        let text = "\
CPID: 0x8010
ECID: 0x1234
SRTG: iBoot-2696.0.0.1.33
SRNM: F2LABC123
PRODUCT: iPhone9,1
MODE: DFU
";
        let parsed = parse_irecovery(text);
        assert_eq!(parsed.serial.as_deref(), Some("F2LABC123"));
        assert_eq!(parsed.firmware.as_deref(), Some("iBoot-2696.0.0.1.33"));
        assert_eq!(parsed.model.as_deref(), Some("iPhone 7 (iPhone9,1)"));
        assert!(parsed.omitted.iter().any(|item| item.field == "battery"));
        assert!(!parsed.fields.keys().any(|key| key.contains("nonc")));
    }

    #[test]
    fn ideviceinfo_reports_ios_build_and_serial() {
        let text = "\
DeviceName: Desk phone
ProductType: iPhone14,5
ProductVersion: 17.6.1
BuildVersion: 21G93
SerialNumber: F4GSERIAL
HardwareModel: d17ap
InternationalMobileEquipmentIdentity: 490154203237518
BatteryCurrentCapacity: 88
DesignCapacity: 3000
NominalChargeCapacity: 2700
CycleCount: 120
TotalDiskCapacity: 128000000000
";
        let parsed = parse_ideviceinfo(text);
        assert_eq!(parsed.serial.as_deref(), Some("F4GSERIAL"));
        assert_eq!(parsed.firmware.as_deref(), Some("iOS 17.6.1 (21G93)"));
        assert_eq!(parsed.model.as_deref(), Some("iPhone 13 (iPhone14,5)"));
        assert_eq!(
            parsed.fields.get("imei").map(String::as_str),
            Some("490154203237518")
        );
        assert!(parsed.battery.as_deref().unwrap().contains("88%"));
        assert!(parsed.storage.as_deref().unwrap().contains("GiB"));
    }

    #[test]
    fn adb_script_reports_model_serial_build_battery_and_storage() {
        let text = "\
__PROPS__
model=SM-G973F
manufacturer=samsung
serial=R58M123456
build=QP1A.190711.020
android=12
board=exynos9820
patch=2024-01-01
__BATTERY__
  level: 80
  health: 2
__CELLS__
full=4000000
design=4100000
cycles=50
__STORAGE__
Filesystem 1K-blocks Used Available Use% Mounted on
/dev/block/data 100000000 10 20 1% /data
";
        let parsed = parse_adb_script(text);
        assert_eq!(parsed.model.as_deref(), Some("SM-G973F"));
        assert_eq!(parsed.serial.as_deref(), Some("R58M123456"));
        assert_eq!(parsed.firmware.as_deref(), Some("QP1A.190711.020"));
        assert_eq!(parsed.chipset.as_deref(), Some("exynos9820"));
        assert!(parsed.battery.as_deref().unwrap().contains("80%"));
        assert!(parsed.battery.as_deref().unwrap().contains("health good"));
        assert!(parsed.storage.is_some());
        let platform = refined_platform("Android", &{
            let mut fields = BTreeMap::new();
            fields.insert("board_platform".into(), "exynos9820".into());
            fields
        });
        assert_eq!(platform.as_deref(), Some("Samsung"));
    }

    #[test]
    fn fastboot_getvar_reports_product_serial_and_bootloader() {
        let text = "\
(bootloader) product: oriole
(bootloader) serialno: 1A2B3C4D
(bootloader) version-bootloader: slider-1.2-999
(bootloader) version-baseband: g5123b
(bootloader) unlocked: no
(bootloader) partition-size:userdata: 0x40000000
(bootloader) token: should-not-copy
";
        let parsed = parse_fastboot(text);
        assert_eq!(parsed.model.as_deref(), Some("oriole"));
        assert_eq!(parsed.serial.as_deref(), Some("1A2B3C4D"));
        assert_eq!(parsed.firmware.as_deref(), Some("slider-1.2-999"));
        assert_eq!(
            parsed.fields.get("bootloader_unlocked").map(String::as_str),
            Some("no")
        );
        assert!(!parsed
            .fields
            .values()
            .any(|v| v.contains("should-not-copy")));
        assert!(parsed.storage.is_some());
    }

    #[test]
    fn dry_run_identity_includes_serial_model_and_firmware() {
        let report = identity_dry_run();
        assert!(report.ok);
        assert!(report.dry_run);
        assert!(report.serial.is_some());
        assert!(report.model.is_some());
        assert!(report.firmware.is_some());
        let lines = format_identity_lines(&report);
        assert!(lines.iter().any(|line| line.contains("DRYRUN123456")));
    }

    #[test]
    fn adb_listing_parses_authorized_and_unauthorized() {
        let text = "\
List of devices attached
R58M123 device usb:1-2 product:beyond1 model:SM_G973F device:beyond1
ZZZ unauthorized
";
        let devices = parse_adb_devices(text);
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].model.as_deref(), Some("SM G973F"));
        assert_eq!(devices[1].state, "unauthorized");
    }
}
