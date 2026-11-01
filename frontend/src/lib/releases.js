// Shared release version + base URLs for native binaries.
// When CI bumps these via git tag, update both constants here — and only here.
//
//   • DESKTOP_VERSION matches the `package.json` version in /aether-desktop and
//     the workflow tag `desktop-vX.Y.Z` (e.g. desktop-v0.1.0).
//   • CLI_VERSION matches the `Cargo.toml` version in /aether-cli and the
//     workflow tag `vX.Y.Z` (e.g. v0.1.0).
//
// The download buttons (DownloadDesktopButton, DownloadCliButton,
// GetDesktopHeroCard) import these to construct GitHub Release URLs.

export const DESKTOP_VERSION = "0.1.1";
export const CLI_VERSION = "0.2.1";

export const DESKTOP_RELEASES_BASE =
  process.env.REACT_APP_GITHUB_RELEASES_URL ||
  "https://github.com/braidenbarker/aether/releases/latest/download";

export const CLI_RELEASES_BASE =
  process.env.REACT_APP_CLI_RELEASES_URL ||
  "https://github.com/braidenbarker/aether/releases/latest/download";
