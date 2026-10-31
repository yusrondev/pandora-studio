# Server lokal tanpa dependensi untuk menjalankan game (browser memblokir file:// untuk model 3D).
# Mendengarkan di 127.0.0.1 tetapi menerima hostname apa pun, jadi bisa dilewatkan ngrok atau
# cloudflared. Tutup jendela ini untuk mengakhiri game.
param([switch]$NoBrowser)

$root = [System.IO.Path]::GetFullPath($PSScriptRoot)

$listener = $null
foreach ($candidatePort in 8765..8785) {
    $candidate = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $candidatePort)
    try { $candidate.Start(); $listener = $candidate; $port = $candidatePort; break } catch { }
}
if (-not $listener) { Write-Error 'Tidak ada port kosong (8765-8785).'; exit 1 }

$url = "http://localhost:$port/"
Write-Host "Game berjalan di $url"
Write-Host "Akses dari luar: ngrok http $port   atau   cloudflared tunnel --url http://localhost:$port"
Write-Host 'Tutup jendela ini untuk mengakhiri.'

# Mode aplikasi Edge/Chrome agar tampil sebagai jendela game, tanpa tab dan address bar
$browser = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

# Profil terpisah wajib: flag diabaikan jika browser yang sama sudah terbuka. Vsync dilepas agar
# batas FPS di pengaturan game (mis. 120) bisa tercapai di monitor 60Hz.
if (-not $NoBrowser) {
    if ($browser) {
        $browserProfile = Join-Path $env:LocalAppData 'PandoraGames\browser-profile'
        Start-Process $browser @("--app=$url", "--user-data-dir=`"$browserProfile`"", '--no-first-run', '--disable-gpu-vsync', '--disable-frame-rate-limit')
    } else {
        Start-Process $url
    }
}

# Setiap koneksi ditangani paralel: klien lambat di tunnel tidak boleh menahan pemain lain
$serveClient = {
    param($client, $root)

    $types = @{
        '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
        '.json' = 'application/json; charset=utf-8'; '.wasm' = 'application/wasm'; '.woff2' = 'font/woff2'; '.png' = 'image/png'
        '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.svg' = 'image/svg+xml'; '.txt' = 'text/plain; charset=utf-8'
        '.glb' = 'model/gltf-binary'; '.gltf' = 'model/gltf+json'; '.mp3' = 'audio/mpeg'; '.wav' = 'audio/wav'; '.ogg' = 'audio/ogg'
    }
    $rootWithSep = $root.TrimEnd('\') + '\'

    try {
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $requestLine = $reader.ReadLine()
        while ($true) {
            $header = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($header)) { break }
        }
        $parts = "$requestLine" -split ' '
        $method = $parts[0]
        $status = '404 Not Found'
        $path = $null

        if ($parts.Length -ge 2 -and ($method -eq 'GET' -or $method -eq 'HEAD')) {
            $relative = [System.Uri]::UnescapeDataString(($parts[1] -split '\?')[0]).TrimStart('/')
            if ($relative -eq '') { $relative = 'index.html' }
            $candidatePath = [System.IO.Path]::GetFullPath((Join-Path $root $relative))
            if ($candidatePath.StartsWith($rootWithSep, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $candidatePath -PathType Leaf)) {
                $path = $candidatePath
                $status = '200 OK'
            }
        }

        $length = 0
        $contentType = 'text/plain; charset=utf-8'
        if ($path) {
            $length = (Get-Item -LiteralPath $path).Length
            $ext = [System.IO.Path]::GetExtension($path).ToLower()
            $contentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
        }

        $head = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $length`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
        $headBytes = [System.Text.Encoding]::ASCII.GetBytes($head)
        $stream.Write($headBytes, 0, $headBytes.Length)

        if ($path -and $method -eq 'GET') {
            $file = [System.IO.File]::OpenRead($path)
            try { $file.CopyTo($stream) } finally { $file.Dispose() }
        }
        $stream.Flush()
    } catch {
        # Browser memutus koneksi di tengah unduhan adalah hal biasa
    } finally {
        $client.Close()
    }
}

$pool = [System.Management.Automation.Runspaces.RunspaceFactory]::CreateRunspacePool(1, 12)
$pool.Open()
$running = New-Object System.Collections.ArrayList

while ($true) {
    $client = $listener.AcceptTcpClient()
    $job = [PowerShell]::Create()
    $job.RunspacePool = $pool
    [void]$job.AddScript($serveClient).AddArgument($client).AddArgument($root)
    [void]$running.Add(@{ Shell = $job; Handle = $job.BeginInvoke() })

    for ($i = $running.Count - 1; $i -ge 0; $i--) {
        if ($running[$i].Handle.IsCompleted) {
            $running[$i].Shell.Dispose()
            $running.RemoveAt($i)
        }
    }
}
