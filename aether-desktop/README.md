<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:3a965eebe81e04cfca5d4ee7a0a68f197d73928a0194bcd7c6c9647668f7ce65 -->

# Aether Desktop for Windows

Aether launches as an installed desktop application. The installer includes the
React interface, a frozen Python API and the native Rust CLI. It does not search
for a development checkout, run Yarn, start MongoDB or open a separate browser.
The interface uses the existing Aether design and original device operations.

## Build a Windows installer

Run on a Windows x64 build machine with Python 3.11, Node.js 22/Corepack,
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:6cdf95097168eb314f1961cea4b75245abaeaa3e68e9c24b37496720b87c257c -->

Rust stable/MSVC, Visual Studio C++ build tools and vcpkg installed. Configure
libusb in the same PowerShell session before building:

```powershell
vcpkg install libusb:x64-windows-static-md
$env:VCPKG_ROOT = $env:VCPKG_INSTALLATION_ROOT
$env:VCPKGRS_TRIPLET = "x64-windows-static-md"
```

Then prepare the application and build:

<!-- /coderabbit-ai-generated:v1 -->

```powershell
corepack enable
corepack yarn --cwd frontend install --frozen-lockfile
corepack yarn --cwd aether-desktop install --frozen-lockfile
python -m pip install -r backend/requirements.txt -r aether-desktop/requirements-build.txt
cd aether-desktop
corepack yarn build
```

`build:msi` and `build:nsis` select one installer format. The Tauri build hook
runs `scripts/prepare.mjs`: compiles the desktop UI, builds the CLI, freezes the
API with PyInstaller, and stages those files as installer resources. Build the
API on the target OS; a Linux-frozen executable cannot be shipped for Windows.
Set `AETHER_BUILD_PYTHON` to use a specific build interpreter.

Installers appear under `src-tauri/target/release/bundle/msi/` and `nsis/`.
The Windows workflow builds and uploads artifacts without publishing a release.
Signing and Windows clean-machine installation must be verified before release.
WebView2 is required; the installer can download Microsoft's bootstrapper if it
is missing. Device drivers and vendor repair utilities remain setup dependencies.
Python is bundled for the local API; optional repair utilities that require a
Python interpreter still need their documented setup.

## Local workspace and lifecycle

The native window starts two owned services on available loopback ports and
waits for API/database health before opening its bundled interface. Each launch
uses a random credential for both API access and the CLI handshake. Browser
requests from other origins are rejected by the packaged services. No fixed
localhost service is trusted or reused. Closing the app stops its two services.

SQLite data, the persistent JWT signing key, and service logs live in Tauri's
per-user local application data directory (`dev.aether.repair` on Windows).
The data stays after restart. Back up the database while the app is closed.
Existing hosted MongoDB accounts are separate and are not automatically copied
into this local workspace. Existing operation pricing is preserved: operations
remain free. Purchase/refund calculations and donation details are preserved.

The application can open without an internet connection. Internet-dependent
firmware lookups, downloads, optional provider sign-in and payments still need
their services and configuration. The app reports missing hardware/tool support;
an installer build does not verify physical phone operations.

## Verification

```powershell
cd backend
python -m unittest discover -s tests -p test_desktop_runtime.py
```

These checks exercise the SQLite contracts, authentication, persistence across
process restarts, signatures, credit reconciliation and local-service access
controls. See the workspace validation record for observed build/device results.

Existing LICENSE.md and NOTICE.md terms remain applicable.


<!-- /coderabbit-ai-generated:v1 -->