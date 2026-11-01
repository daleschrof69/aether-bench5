# Code-Signing Guide — Aether Repair Tool

Signing removes the **Windows SmartScreen** ("unrecognized app") and **macOS
Gatekeeper** ("cannot be opened because the developer cannot be verified")
warnings that scare users away from installing.

Both the desktop CI (`.github/workflows/aether-desktop-release.yml`) already
reference the secrets below — they are **no-ops until you add the secrets**, so
unsigned builds keep working in the meantime.

---

## 1. macOS — Developer ID + Notarization

### What you need
1. Apple Developer Program membership ($99/yr).
2. A **Developer ID Application** certificate:
   - Xcode → Settings → Accounts → Manage Certificates → `+` → *Developer ID Application*.
   - Or create it at https://developer.apple.com/account/resources/certificates.
3. An **app-specific password** for notarization:
   - https://appleid.apple.com → Sign-In & Security → App-Specific Passwords.
4. Your **Team ID** (10 chars) from https://developer.apple.com/account (Membership).

### Export the cert to base64
```bash
# Export the Developer ID Application cert + private key from Keychain as a .p12
# (set a strong password when prompted), then:
base64 -i DeveloperIDApplication.p12 | pbcopy
```

### GitHub repo secrets to add
(Settings → Secrets and variables → Actions → New repository secret)

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | the base64 string from above |
| `APPLE_CERTIFICATE_PASSWORD` | the .p12 export password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | your Apple ID email |
| `APPLE_PASSWORD` | the app-specific password |
| `APPLE_TEAM_ID` | your 10-char Team ID |

`tauri-action` auto-detects these, imports the cert into a temp keychain, signs
the `.app`, then notarizes + staples the `.dmg`. No further config needed.

---

## 2. Windows — Authenticode

Two supported paths:

### Option A — Azure Trusted Signing (recommended, no physical token)
Follow https://v2.tauri.app/distribute/sign/windows/#azure-code-signing and set
`bundle.windows.signCommand` in `aether-desktop/src-tauri/tauri.conf.json`.

### Option B — Certificate thumbprint (EV or OV cert already in the store)
1. Buy an OV/EV code-signing cert (DigiCert, Sectigo, SSL.com …).
2. Add these to `aether-desktop/src-tauri/tauri.conf.json`:
   ```json
   "bundle": {
     "windows": {
       "certificateThumbprint": "YOUR_CERT_SHA1_THUMBPRINT",
       "digestAlgorithm": "sha256",
       "timestampUrl": "http://timestamp.digicert.com"
     }
   }
   ```
3. In CI, add a step (before the `tauri-action` build) that imports the `.pfx`
   from a `WINDOWS_CERTIFICATE` (base64) secret into the runner's cert store:
   ```powershell
   $pfx = [System.Convert]::FromBase64String("${{ secrets.WINDOWS_CERTIFICATE }}")
   Set-Content cert.pfx -Value $pfx -Encoding Byte
   Import-PfxCertificate -FilePath cert.pfx -CertStoreLocation Cert:\CurrentUser\My `
     -Password (ConvertTo-SecureString "${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}" -AsPlainText -Force)
   ```
   `tauri build` then picks up the matching `certificateThumbprint` and signs the `.msi`.

> The workflow already forwards `TAURI_SIGNING_PRIVATE_KEY` /
> `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — those are for **Tauri updater artifact
> signing** (a separate concern from Authenticode) if you enable auto-updates.

---

## 3. aether-cli binaries (optional)

The raw CLI binaries in `aether-cli-release.yml` are unsigned. If you want to
sign them too:
- **macOS:** `codesign --force --options runtime --sign "Developer ID Application: …" aether-cli`
  then notarize the `.tar.gz` contents.
- **Windows:** `signtool sign /fd sha256 /tr http://timestamp.digicert.com /td sha256 aether-cli.exe`.

Installer signing (section 1 & 2) matters far more for user trust than signing
the standalone CLI, so prioritise the desktop `.msi` / `.dmg`.
