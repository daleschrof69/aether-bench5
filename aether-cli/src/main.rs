//! Aether CLI — entry point.
//!
//! Subcommand layout:
//!     aether-cli devices            list USB targets currently attached
//!     aether-cli scan               watch for new device hot-plug events
//!     aether-cli info <port>        read chipset / IMEI / serial from target
//!     aether-cli bypass-frp <port>  (NOT IMPLEMENTED) MTK BROM / Qualcomm EDL FRP bypass
//!     aether-cli repair-imei <port> --imei1 <i> [--imei2 <i>]  (NOT IMPLEMENTED)
//!     aether-cli unlock-bootloader <port>  (NOT IMPLEMENTED)
//!     aether-cli samsung-factory-reset
//!     aether-cli edl-detect          detect Qualcomm EDL / 9008 devices
//!     aether-cli serve              run local WebSocket bridge for the Aether web dashboard

mod exploits;
mod usb;
mod bridge;
mod mtkclient;
mod heimdall;
mod edl;
mod qualcomm;
mod apple;

use clap::{Parser, Subcommand};
use colored::Colorize;

const BANNER: &str = r#"
   ▄▄▄       ▓█████ ▄▄▄█████▓ ██░ ██ ▓█████  ██▀███
  ▒████▄     ▓█   ▀ ▓  ██▒ ▓▒▓██░ ██▒▓█   ▀ ▓██ ▒ ██▒
  ▒██  ▀█▄   ▒███   ▒ ▓██░ ▒░▒██▀▀██░▒███   ▓██ ░▄█ ▒
  ░██▄▄▄▄██  ▒▓█  ▄ ░ ▓██▓ ░ ░▓█ ░██ ▒▓█  ▄ ▒██▀▀█▄
   ▓█   ▓██▒ ░▒████▒  ▒██▒ ░ ░▓█▒░██▓░▒████▒░██▓ ▒██▒
"#;

#[derive(Parser, Debug)]
#[command(
    name = "aether-cli",
    version,
    about = "Aether Repair Tool — unified CLI for MTK / Qualcomm / Apple / Samsung device repair",
    long_about = None,
)]
struct Cli {
    /// Verbose output (also enable with RUST_LOG=debug)
    #[arg(short, long, global = true)]
    verbose: bool,

    /// Skip the banner.
    #[arg(long, global = true)]
    no_banner: bool,

    #[command(subcommand)]
    cmd: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// List all USB devices currently visible.
    Devices,
    /// Continuously watch for device hot-plug events.
    Scan,
    /// Read chipset / IMEI / serial from the target.
    Info {
        /// USB port identifier (e.g. "COM5", "/dev/ttyUSB0", or "auto").
        #[arg(default_value = "auto")]
        port: String,
    },
    /// Bypass Factory Reset Protection via mtkclient (erases the FRP partition).
    BypassFrp {
        #[arg(default_value = "auto")]
        port: String,
    },
    /// Restore / write IMEI to the modem NV partition via mtkclient.
    /// LEGAL: only for restoring an OEM-printed IMEI after a flash — see NOTICE.md.
    RepairImei {
        #[arg(default_value = "auto")]
        port: String,
        #[arg(long)]
        imei1: String,
        #[arg(long)]
        imei2: Option<String>,
    },
    /// Unlock OEM bootloader via mtkclient seccfg patch. Destructive — wipes userdata.
    UnlockBootloader {
        #[arg(default_value = "auto")]
        port: String,
    },
    /// Detect a Samsung device in Download Mode via Heimdall.
    SamsungDetect,
    /// Read the Samsung device's Partition Information Table (PIT).
    SamsungReadPit,
    /// Real factory reset on a Samsung device — erases USERDATA + CACHE + METADATA via Heimdall.
    /// Phone must be in Download Mode (Vol-Down + Bixby + Power, then Vol-Up).
    /// Works on Galaxy S9 / Note 9 / older A-series. Newer Knox 3.x models may reject writes.
    SamsungFactoryReset,
    /// Detect Qualcomm EDL / 9008 devices currently attached.
    EdlDetect,
    /// Detect Android MTP (file transfer) devices currently attached.
    MtpDetect,
    /// Run a local WebSocket bridge so the Aether web dashboard can talk to attached devices.
    Serve {
        /// Bind address.
        #[arg(long, default_value = "127.0.0.1:8765")]
        addr: String,
    },
    /// First-launch setup — installs Python dependencies (mtkclient) via pip.
    /// Safe to re-run; pip-upgrades if a newer mtkclient is published.
    Setup,
    /// Print the version of the bundled / detected mtkclient (Python tool).
    Doctor,
}

fn print_banner() {
    println!("{}", BANNER.bright_green());
    println!(
        "  {} {}  ·  {}",
        "Aether Repair Tool CLI".bright_white().bold(),
        format!("v{}", env!("CARGO_PKG_VERSION")).bright_green(),
        "MTK · Qualcomm · Apple · Samsung".dimmed(),
    );
    println!(
        "  {}\n",
        "For licensed technicians only. https://aether.dev/legal".dimmed()
    );
}

fn init_tracing(verbose: bool) {
    let filter = if verbose {
        tracing_subscriber::EnvFilter::new("debug")
    } else {
        tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"))
    };
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .compact()
        .init();
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    init_tracing(cli.verbose);
    if !cli.no_banner {
        print_banner();
    }
    match cli.cmd {
        Command::Devices => usb::list_devices()?,
        Command::Scan => usb::watch_hotplug().await?,
        Command::Info { port } => exploits::info::read_device_info(&port).await?,
        Command::BypassFrp { port } => exploits::frp::bypass_frp(&port).await?,
        Command::RepairImei { port, imei1, imei2 } => {
            exploits::imei::repair_imei(&port, &imei1, imei2.as_deref()).await?
        }
        Command::UnlockBootloader { port } => exploits::bootloader::unlock(&port).await?,
        Command::SamsungDetect => exploits::samsung::detect().await?,
        Command::SamsungReadPit => exploits::samsung::read_pit().await?,
        Command::SamsungFactoryReset => exploits::samsung::factory_reset().await?,
        Command::EdlDetect => usb::report_edl_detection()?,
        Command::MtpDetect => usb::report_mtp_detection()?,
        Command::Serve { addr } => bridge::serve(&addr).await?,
        Command::Setup => {
            println!("  {} installing mtkclient via pip (requires Python 3.8+) ...", "→".bright_green());
            let out = mtkclient::install_mtkclient().await?;
            println!("{}", out.dimmed());
            let ver = mtkclient::check_mtkclient()?;
            println!("  {} mtkclient {} ready", "✓".bright_green(), ver.bright_white());
            println!("  {} installing edlclient (Qualcomm Firehose) via pip ...", "→".bright_green());
            match qualcomm::install_edl_once().await {
                Ok(_) => println!("  {} edlclient ready", "✓".bright_green()),
                Err(e) => println!("  {} edlclient: {}", "✗".bright_red(), e),
            }
        }
        Command::Doctor => {
            match mtkclient::check_mtkclient() {
                Ok(v) => println!("  {} mtkclient {}", "✓".bright_green(), v.bright_white()),
                Err(e) => println!("  {} mtkclient: {}", "✗".bright_red(), e),
            }
            match heimdall::check_heimdall() {
                Ok(v) => println!("  {} {}", "✓".bright_green(), v.bright_white()),
                Err(e) => println!("  {} heimdall: {}", "✗".bright_red(), e),
            }
            match qualcomm::check_edl() {
                Ok(v) => println!("  {} {}", "✓".bright_green(), v.bright_white()),
                Err(e) => println!("  {} edl: {}", "✗".bright_red(), e),
            }
            match apple::check_apple() {
                Ok(v) => println!("  {} apple: {}", "✓".bright_green(), v.bright_white()),
                Err(e) => println!("  {} apple: {}", "✗".bright_red(), e),
            }
        }
    }
    Ok(())
}
