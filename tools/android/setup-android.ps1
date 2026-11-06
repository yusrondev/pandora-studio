# Pandora Studio - pemasang toolchain Android untuk "Generate APK".
# Memasang JDK 17, Gradle, dan Android SDK ke <folder induk project>\pandora-android\toolchain
# (di luar project). Aman dijalankan ulang: bagian yang sudah terpasang dilewati.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$JdkUrl = 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk'
$GradleVersion = '8.7'
$GradleUrl = "https://services.gradle.org/distributions/gradle-$GradleVersion-bin.zip"
$CmdlineToolsUrl = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
$SdkPackages = @('platforms;android-34', 'build-tools;34.0.0', 'platform-tools')

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$AndroidHome = Join-Path (Split-Path $ProjectRoot -Parent) 'pandora-android'
$Toolchain = Join-Path $AndroidHome 'toolchain'
$Sdk = Join-Path $Toolchain 'sdk'
$Downloads = Join-Path $AndroidHome 'downloads'

function Step($text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }

function Download($url, $file) {
    if (Test-Path $file) { Write-Host "    Sudah diunduh: $file"; return }
    $partial = "$file.part"
    & curl.exe -L --fail --retry 3 -o $partial $url
    if ($LASTEXITCODE -ne 0) { throw "Gagal mengunduh $url" }
    Move-Item $partial $file -Force
}

function Extract($zip, $dest) {
    New-Item -ItemType Directory -Force $dest | Out-Null
    & tar.exe -xf $zip -C $dest
    if ($LASTEXITCODE -ne 0) { throw "Gagal mengekstrak $zip" }
}

Write-Host 'Pandora Studio - Setup Android (untuk Generate APK)' -ForegroundColor Yellow
Write-Host "Lokasi pemasangan : $Toolchain"
Write-Host 'Yang akan dipasang: JDK 17 (~190 MB), Gradle (~130 MB), Android SDK command-line tools,'
Write-Host '                    platform android-34, build-tools 34.0.0 (~600 MB total setelah ekstrak)'
Write-Host 'Sumber            : adoptium.net, services.gradle.org, dl.google.com'
$answer = Read-Host 'Lanjutkan? (Y/N)'
if ($answer -notmatch '^[Yy]') { Write-Host 'Dibatalkan.'; exit 1 }

New-Item -ItemType Directory -Force $Toolchain, $Downloads | Out-Null

# 1. JDK 17 (bukan JRE: Gradle butuh javac)
Step 'JDK 17'
$jdk = Get-ChildItem $Toolchain -Directory -Filter 'jdk*' | Where-Object { Test-Path (Join-Path $_.FullName 'bin\javac.exe') } | Select-Object -First 1
if (-not $jdk) {
    $zip = Join-Path $Downloads 'jdk17.zip'
    Download $JdkUrl $zip
    Extract $zip $Toolchain
    $jdk = Get-ChildItem $Toolchain -Directory -Filter 'jdk*' | Where-Object { Test-Path (Join-Path $_.FullName 'bin\javac.exe') } | Select-Object -First 1
    if (-not $jdk) { throw 'JDK tidak ditemukan setelah ekstrak' }
}
Write-Host "    OK: $($jdk.FullName)"
$env:JAVA_HOME = $jdk.FullName
$env:Path = "$($jdk.FullName)\bin;$env:Path"

# 2. Gradle
Step "Gradle $GradleVersion"
$gradleDir = Join-Path $Toolchain "gradle-$GradleVersion"
if (-not (Test-Path (Join-Path $gradleDir 'bin\gradle.bat'))) {
    $zip = Join-Path $Downloads "gradle-$GradleVersion.zip"
    Download $GradleUrl $zip
    Extract $zip $Toolchain
}
Write-Host "    OK: $gradleDir"

# 3. Android SDK command-line tools (harus berada di cmdline-tools\latest)
Step 'Android SDK command-line tools'
$sdkManager = Join-Path $Sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sdkManager)) {
    $zip = Join-Path $Downloads 'cmdline-tools.zip'
    Download $CmdlineToolsUrl $zip
    $tmp = Join-Path $Downloads 'cmdline-tools-extract'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Extract $zip $tmp
    $latest = Join-Path $Sdk 'cmdline-tools\latest'
    New-Item -ItemType Directory -Force (Split-Path $latest -Parent) | Out-Null
    if (Test-Path $latest) { Remove-Item $latest -Recurse -Force }
    Move-Item (Join-Path $tmp 'cmdline-tools') $latest
    Remove-Item $tmp -Recurse -Force
}
Write-Host "    OK: $sdkManager"

# 4. Lisensi SDK: dibaca dan disetujui sendiri oleh pengguna (ketik y)
Step 'Lisensi Android SDK'
Write-Host '    Baca lisensi berikut, lalu ketik y untuk menyetujui masing-masing.'
& $sdkManager "--sdk_root=$Sdk" --licenses
if ($LASTEXITCODE -ne 0) { throw 'Lisensi Android SDK belum disetujui' }

# 5. Paket SDK
Step 'Paket Android SDK'
& $sdkManager "--sdk_root=$Sdk" @SdkPackages
if ($LASTEXITCODE -ne 0) { throw 'Gagal memasang paket Android SDK' }

Write-Host ''
Write-Host 'Setup Android selesai. Kembali ke Pandora Studio lalu klik Generate APK.' -ForegroundColor Green
Write-Host "File unduhan sementara bisa dihapus: $Downloads"
