#!/usr/bin/env bash
# Registers the exploit layer in an existing checkout.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "==> backend router"
if ! grep -q "from exploits import router" backend/server.py; then
  python - <<'PY'
import pathlib
p = pathlib.Path("backend/server.py")
s = p.read_text()
s = s.replace("app = FastAPI(", "from exploits import router as exploits_router  # exploit layer\n\napp = FastAPI(", 1)
anchor = s.index("app = FastAPI(")
end = s.index("\n", s.index(")", anchor))
s = s[:end + 1] + "\napp.include_router(exploits_router)\n" + s[end + 1:]
p.write_text(s)
print("   patched backend/server.py")
PY
else
  echo "   already wired"
fi

echo "==> cli subcommand"
if ! grep -q "mod exploit;" aether-cli/src/main.rs; then
  sed -i '1i mod exploit;' aether-cli/src/main.rs
  echo "   added mod exploit; — apply exploit_cmd.patch for the enum arm"
fi

echo "==> frontend panel"
echo "   import ExploitPanel from '../components/ExploitPanel';  # add to Dashboard.jsx"
echo "   <ExploitPanel profile={deviceProfile} />"

echo "==> deps"
grep -q pydantic backend/requirements.txt || echo "pydantic>=2" >> backend/requirements.txt

echo
echo "==> verify"
python -c "import sys; sys.path.insert(0,'backend'); from exploits import loader; print(loader.validate())"
pytest backend/tests/test_exploits.py -q
echo "done."
