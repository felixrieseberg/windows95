New-Item -ItemType Directory .\images > $null
Set-Location -Path .\images

(New-Object System.Net.WebClient).DownloadFile($env:DISK_URL, "$(Resolve-Path .)\images.zip")

7z x images.zip -y -aoa
Remove-Item -Recurse -Path __MACOSX, images.zip -ErrorAction Ignore
Set-Location -Path ..
tree.com .\ /F
