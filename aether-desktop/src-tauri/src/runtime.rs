//! Installed runtime discovery and ownership. Never searches the user's checkout
//! or attaches to an arbitrary process already listening on a fixed port.
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

pub struct Runtime {
    children: Vec<Child>,
}
impl Drop for Runtime {
    fn drop(&mut self) {
        for child in self.children.iter_mut().rev() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    Ok(listener.local_addr().map_err(|e| e.to_string())?.port())
}
fn binary(root: &Path, name: &str) -> PathBuf {
    root.join(format!("{name}{}", std::env::consts::EXE_SUFFIX))
}
fn spawn(mut command: Command, log: &Path) -> Result<Child, String> {
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log)
        .map_err(|e| e.to_string())?;
    command
        .stdin(Stdio::null())
        .stdout(file.try_clone().map_err(|e| e.to_string())?)
        .stderr(file);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    command.spawn().map_err(|e| e.to_string())
}
fn ready(port: u16, token: &str) -> bool {
    let addr = ([127, 0, 0, 1], port).into();
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(200)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(300)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(300)));
    if write!(stream, "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Desktop {token}\r\nConnection: close\r\n\r\n").is_err() { return false }
    let mut bytes = [0; 128];
    let Ok(n) = stream.read(&mut bytes) else {
        return false;
    };
    String::from_utf8_lossy(&bytes[..n]).starts_with("HTTP/1.1 200 ")
}
impl Runtime {
    pub fn start(resources: &Path, data: &Path, token: &str) -> Result<(Self, String), String> {
        fs::create_dir_all(data).map_err(|e| e.to_string())?;
        let root = resources.join("runtime");
        let api = binary(&root.join("aether-api"), "aether-api");
        let cli = binary(&root, "aether-cli");
        for path in [&api, &cli, &resources.join("dashboard/index.html")] {
            if !path.is_file() {
                return Err(format!(
                    "Required installed file is missing: {}. Reinstall Aether.",
                    path.display()
                ));
            }
        }
        let api_port = free_port()?;
        let mut cli_port = free_port()?;
        while cli_port == api_port {
            cli_port = free_port()?
        }
        let origin = format!("http://127.0.0.1:{api_port}");
        let mut runtime = Self {
            children: Vec::new(),
        };
        let mut cli_command = Command::new(cli);
        cli_command
            .args([
                "--no-banner",
                "serve",
                "--addr",
                &format!("127.0.0.1:{cli_port}"),
            ])
            .current_dir(data)
            .env("AETHER_BRIDGE_TOKEN", token)
            .env("AETHER_BRIDGE_ORIGIN", &origin);
        runtime
            .children
            .push(spawn(cli_command, &data.join("cli.log"))?);
        let mut api_command = Command::new(api);
        api_command
            .current_dir(data)
            .env("AETHER_DATA_DIR", data)
            .env("AETHER_API_PORT", api_port.to_string())
            .env("AETHER_DESKTOP_TOKEN", token)
            .env("AETHER_UI_ROOT", resources.join("dashboard"))
            .env("APP_ORIGIN", &origin)
            .env(
                "AETHER_BRIDGE_URL",
                format!("ws://127.0.0.1:{cli_port}/?token={token}"),
            );
        runtime
            .children
            .push(spawn(api_command, &data.join("api.log"))?);
        let deadline = Instant::now() + Duration::from_secs(45);
        while Instant::now() < deadline {
            for child in &mut runtime.children {
                if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                    return Err(format!(
                        "Aether service exited ({status}). See logs in {}.",
                        data.display()
                    ));
                }
            }
            if ready(api_port, token) && TcpStream::connect(("127.0.0.1", cli_port)).is_ok() {
                return Ok((runtime, format!("{origin}/desktop/start?token={token}")));
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        Err(format!(
            "Aether services did not become ready. See logs in {}.",
            data.display()
        ))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_installed_resources_fail_clearly() {
        let root = std::env::temp_dir().join(format!("aether-runtime-{}", std::process::id()));
        let error = Runtime::start(&root, &root, "synthetic-token")
            .err()
            .unwrap();
        assert!(error.contains("Required installed file is missing"));
        let _ = fs::remove_dir_all(root);
    }
    #[test]
    fn health_requires_success_response() {
        let port = free_port().unwrap();
        assert!(!ready(port, "synthetic-token"));
    }
}
