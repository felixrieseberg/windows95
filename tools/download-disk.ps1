$ErrorActionPreference = "Stop"

# Pulls the disk image from a private GitHub release.
# Requires DISK_REPO, DISK_TAG, GH_TOKEN.

if (-not $env:DISK_REPO) { Write-Host "::error::DISK_REPO not set"; exit 1 }
if (-not $env:DISK_TAG)  { Write-Host "::error::DISK_TAG not set";  exit 1 }
if (-not $env:GH_TOKEN)  { Write-Host "::error::GH_TOKEN not set";  exit 1 }

New-Item -ItemType Directory -Force -Path images | Out-Null
Set-Location images

gh release download $env:DISK_TAG -R $env:DISK_REPO -p '*.zip' -O images.zip --clobber
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

7z t images.zip | Out-Null
if ($LASTEXITCODE -ne 0) {
  $size = (Get-Item images.zip).Length
  Write-Host "::error::Downloaded file is not a valid zip (size: $size bytes)."
  exit 1
}

7z x images.zip -y -aoa
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Remove-Item images.zip
Remove-Item __MACOSX -Recurse -ErrorAction Ignore
Set-Location ..

if (-not (Test-Path images/windows95.img)) {
  Write-Host "::error::images/windows95.img not found after extraction"
  Get-ChildItem images
  exit 1
}

Get-ChildItem images
