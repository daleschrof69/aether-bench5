// Build installed resources with the host toolchain. Windows installers must
// be built on Windows so PyInstaller and the CLI have the same architecture.
import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(desktop, '..');
const python = process.env.AETHER_BUILD_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env }, shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
const runtime = path.join(desktop, 'src-tauri/runtime');
mkdirSync(runtime, { recursive: true });
const suffix = process.platform === 'win32' ? '.exe' : '';
const yarn = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
run(process.platform === 'win32' ? 'cmd.exe' : yarn,
  process.platform === 'win32' ? ['/d','/s','/c','corepack yarn --cwd frontend build'] : ['yarn','--cwd','frontend','build'], repo,
  { CI: 'true', REACT_APP_DESKTOP: 'true', REACT_APP_BACKEND_URL: '' });
run('cargo', ['build', '--release', '--manifest-path', 'aether-cli/Cargo.toml'], repo);
copyFileSync(path.join(repo, 'aether-cli/target/release/aether-cli' + suffix), path.join(runtime, 'aether-cli' + suffix));
run(python, ['-m','PyInstaller','--noconfirm','--clean','--onedir','--name','aether-api',
  '--distpath',path.join(runtime), '--workpath',path.join(desktop,'build/api'),
  '--specpath',path.join(desktop,'build'), '--paths',path.join(repo,'backend'),
  '--hidden-import','server','--hidden-import','uvicorn.logging','--hidden-import','uvicorn.loops.auto',
  '--hidden-import','uvicorn.protocols.http.auto','--hidden-import','uvicorn.protocols.websockets.auto',
  '--hidden-import','uvicorn.lifespan.on',path.join(repo,'backend/desktop.py')], repo);

// `tauri dev` and unbundled debug builds resolve resources beside the binary.
// Installers copy the same sources using bundle.resources in tauri.conf.json.
const debugResources = path.join(desktop, 'src-tauri/target/debug');
mkdirSync(debugResources, { recursive: true });
cpSync(runtime, path.join(debugResources, 'runtime'), { recursive: true });
cpSync(path.join(repo, 'frontend/build'), path.join(debugResources, 'dashboard'), { recursive: true });
mkdirSync(path.join(debugResources, 'backend'), { recursive: true });
cpSync(path.join(repo, 'aether-cli/backend/exploits'), path.join(debugResources, 'backend/exploits'), { recursive: true });
copyFileSync(path.join(repo, 'backend/swclone.py'), path.join(debugResources, 'backend/swclone.py'));
