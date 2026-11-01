# Registers the exploit layer in an existing checkout (Windows).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$server = "backend\server.py"
if (-not (Select-String -Path $server -Pattern "exploits_router" -Quiet)) {
    $text = Get-Content $server -Raw
    $text = $text -replace "app = FastAPI\(", "from exploits import router as exploits_router`r`n`r`napp = FastAPI("
    $text = $text -replace "(app = FastAPI\([^\r\n]*\))", "`$1`r`napp.include_router(exploits_router)"
    Set-Content $server $text -NoNewline
    Write-Host "patched $server"
} else {
    Write-Host "already wired"
}

$main = "aether-cli\src\main.rs"
if (-not (Select-String -Path $main -Pattern "mod exploit;" -Quiet)) {
    $t = Get-Content $main -Raw
    Set-Content $main ("mod exploit;`r`n" + $t) -NoNewline
    Write-Host "added mod exploit; — apply exploit_cmd.patch for the enum arm"
}

Push-Location backend
python -c "from exploits import loader; print(loader.validate())"
Pop-Location
python -m pytest backend\tests\test_exploits.py -q
Write-Host "done."
