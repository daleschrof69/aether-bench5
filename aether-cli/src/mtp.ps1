param(
  [Parameter(Mandatory = $true)][string]$Mode,
  [string]$Relative = '',
  [string]$Dest = ''
)
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject Shell.Application
$computer = $shell.NameSpace(17)
$device = $null
foreach ($item in @($computer.Items())) {
  $path = [string]$item.Path
  $type = [string]$item.Type
  if ($path -match 'ms_comp_mtp|samsung_android' -or $type -match 'Mobile Phone|Portable Device') {
    $device = $item
    break
  }
}
if (-not $device) {
  Write-Output 'No MTP phone is visible in File Explorer.'
  exit 2
}
Write-Output ("Phone: " + $device.Name)
$root = $device.GetFolder()
$items = @($root.Items())
if ($items.Count -eq 0) {
  Write-Output 'The phone is connected, but Windows returned no storage folders.'
  Write-Output 'Unlock the phone, choose File Transfer / MTP, and allow access to files.'
  exit 1
}

function Find-Entry($folder, $parts) {
  $current = $folder
  $currentItem = $null
  foreach ($part in $parts) {
    if (-not $part) { continue }
    $found = $null
    foreach ($child in @($current.Items())) {
      if ($child.Name -eq $part) { $found = $child; break }
    }
    if (-not $found) { return $null }
    $currentItem = $found
    if ($found.IsFolder) { $current = $found.GetFolder() }
  }
  return $currentItem
}

if ($Mode -eq 'list') {
  $target = $root
  if ($Relative) {
    $entry = Find-Entry $root ($Relative -split '[\\/]')
    if (-not $entry) { Write-Output ("Not found: " + $Relative); exit 1 }
    if (-not $entry.IsFolder) { Write-Output ("file " + $entry.Name); exit 0 }
    $target = $entry.GetFolder()
  }
  $script:shown = 0
  function Walk($folder, $prefix, $depth) {
    foreach ($child in @($folder.Items())) {
      $script:shown++
      if ($script:shown -gt 200) { return }
      $kind = 'file'
      if ($child.IsFolder) { $kind = 'dir ' }
      Write-Output ($kind + ' ' + $prefix + $child.Name)
      if ($child.IsFolder -and $depth -gt 0) {
        Walk ($child.GetFolder()) ($prefix + $child.Name + '/') ($depth - 1)
      }
    }
  }
  Walk $target '' 1
  if ($script:shown -gt 200) { Write-Output 'Stopped after 200 entries.' }
  Write-Output ("Listed " + $script:shown + " entries.")
  exit 0
}

if ($Mode -eq 'pull') {
  if (-not $Dest) { $Dest = Join-Path $env:USERPROFILE 'aether-mtp' }
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  $source = $null
  if ($Relative) {
    $source = Find-Entry $root ($Relative -split '[\\/]')
    if (-not $source) { Write-Output ("Not found: " + $Relative); exit 1 }
  } else {
    foreach ($child in $items) {
      if ($child.IsFolder -and $child.Name -match '^(DCIM|Download|Pictures|Camera)$') {
        $source = $child
        break
      }
    }
    if (-not $source) {
      foreach ($child in $items) { if ($child.IsFolder) { $source = $child; break } }
    }
  }
  if (-not $source) { Write-Output 'Nothing to copy.'; exit 1 }
  Write-Output ("Copying " + $source.Name + " to " + $Dest)
  $destNs = $shell.NameSpace($Dest)
  if (-not $destNs) { Write-Output ("Cannot open destination " + $Dest); exit 1 }
  $destNs.CopyHere($source, 1040)
  $deadline = (Get-Date).AddMinutes(10)
  do {
    Start-Sleep -Seconds 1
    $copied = @(Get-ChildItem -LiteralPath $Dest -ErrorAction SilentlyContinue)
  } while ($copied.Count -eq 0 -and (Get-Date) -lt $deadline)
  if ($copied.Count -eq 0) { Write-Output 'Copy did not produce any files.'; exit 1 }
  Write-Output ("Copied " + $copied.Count + " item(s) into " + $Dest)
  exit 0
}

Write-Output ("Unknown mode " + $Mode)
exit 2
