mkdir images
cd images

$wc = New-Object System.Net.WebClient
$wc.DownloadFile($env:DISK_URL, "$(Resolve-Path .)\images.zip")

7z x images.zip -y -aoa
Remove-Item images.zip
Remove-Item __MACOSX -Recurse -ErrorAction Ignore
cd ..
Tree ./ /F
