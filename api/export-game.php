<?php
/**
 * Pandora Editor - Standalone Game Exporter
 * POST { name } membuat game mandiri di <folder induk project>/pandora-builds/<slug>/
 * berisi hanya kode gameplay, stage yang terhubung, serta karakter dan attachment yang dipakai.
 */

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Gunakan POST']);
    exit;
}

// Wajib JSON: halaman web lain tidak bisa memicu export tanpa lolos preflight CORS
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
    http_response_code(415);
    echo json_encode(['success' => false, 'error' => 'Content-Type harus application/json']);
    exit;
}

set_time_limit(0);

const BUILD_MARKER = 'pandora-build.json';

// Baris JSON dikirim bertahap selama proses; baris terakhir adalah hasilnya
function reportProgress($value, $label) {
    global $progressStreaming;
    if (!$progressStreaming) {
        $progressStreaming = true;
        ini_set('zlib.output_compression', '0');
        ini_set('display_errors', '0');
        header('Content-Type: application/x-ndjson; charset=utf-8');
        header('X-Accel-Buffering: no');
        header('Cache-Control: no-cache');
        while (ob_get_level() > 0) ob_end_flush();
    }
    echo json_encode(['progress' => $value, 'label' => $label], JSON_UNESCAPED_UNICODE) . "\n";
    flush();
}

function fail($message, $code = 500) {
    global $progressStreaming;
    if (!$progressStreaming) http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function slugify($name) {
    $slug = strtolower(trim(preg_replace('/[^a-zA-Z0-9]+/', '-', $name), '-'));
    return $slug !== '' ? $slug : 'pandora-game';
}

function removeTree($dir) {
    foreach (scandir($dir) as $item) {
        if ($item === '.' || $item === '..') continue;
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path) && !is_link($path)) {
            removeTree($path);
        } else {
            unlink($path);
        }
    }
    rmdir($dir);
}

function copyTree($src, $dest, $skip = []) {
    if (!is_dir($dest)) mkdir($dest, 0777, true);
    foreach (scandir($src) as $item) {
        if ($item === '.' || $item === '..' || in_array($item, $skip, true)) continue;
        $from = $src . DIRECTORY_SEPARATOR . $item;
        $to = $dest . DIRECTORY_SEPARATOR . $item;
        if (is_dir($from)) {
            copyTree($from, $to, $skip);
        } elseif (!copy($from, $to)) {
            fail('Gagal menyalin ' . $from);
        }
    }
}

function treeStats($dir) {
    $count = 0;
    $bytes = 0;
    $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($iter as $file) {
        if ($file->isFile()) {
            $count++;
            $bytes += $file->getSize();
        }
    }
    return [$count, $bytes];
}

// heroes.php mencetak manifest ke output; ditangkap agar tidak ada logika pemindaian ganda
function buildHeroManifest($projectRoot) {
    ob_start();
    include $projectRoot . '/api/heroes.php';
    $data = json_decode((string) ob_get_clean(), true);
    header_remove('Access-Control-Allow-Origin');
    header_remove('Access-Control-Allow-Methods');
    header_remove('Access-Control-Allow-Headers');
    return is_array($data) ? $data : null;
}

/** Scene cinematic ikut ke build jika ada trigger atau musuh yang memutarnya saat mati. */
function stageUsesCinematic($data) {
    if (!empty($data['triggers'])) return true;
    foreach ((array) ($data['foxes'] ?? []) as $fox) {
        if (($fox['deathMode'] ?? '') === 'scene') return true;
    }
    return false;
}

/** Salin daftar file relatif dari project ke build. */
function copyFiles($root, $dest, $files) {
    foreach ($files as $rel) {
        $from = $root . '/' . $rel;
        if (!is_file($from)) fail('File runtime tidak ditemukan: ' . $rel);
        $to = $dest . '/' . $rel;
        if (!is_dir(dirname($to))) mkdir(dirname($to), 0777, true);
        copy($from, $to);
    }
}

/** Potongan index.html dari penanda $start sampai sebelum penanda $end dibuang. */
function cutBlock($html, $start, $end) {
    $a = strpos($html, $start);
    $b = $a === false ? false : strpos($html, $end, $a);
    if ($b === false) fail("Penanda HTML tidak ditemukan: {$start}");
    return substr($html, 0, $a) . substr($html, $b);
}

/** Isi folder/file relatif di build dienkripsi ke data/p/ lalu file aslinya dihapus. */
function sealPaths($dest, $paths, $master, $packDir, $from, $to) {
    $nameKey = bin2hex(hash('sha256', $master . 'n', true));
    if (!is_dir($dest . '/' . $packDir)) mkdir($dest . '/' . $packDir, 0777, true);
    $total = 0;
    foreach ($paths as $rel) {
        $full = $dest . '/' . $rel;
        $total += is_file($full) ? 1 : (is_dir($full) ? treeStats($full)[0] : 0);
    }
    $done = 0;
    $tick = function () use (&$done, $total, $from, $to) {
        $done++;
        reportProgress($from + ($to - $from) * $done / max(1, $total), "Mengenkripsi aset ({$done}/{$total})");
    };
    foreach ($paths as $rel) {
        $full = $dest . '/' . $rel;
        if (is_file($full)) {
            sealFile($dest, $rel, $master, $nameKey, $packDir);
            $tick();
            continue;
        }
        if (!is_dir($full)) continue;
        $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($full, FilesystemIterator::SKIP_DOTS));
        foreach (iterator_to_array($iter) as $file) {
            if ($file->isFile()) {
                sealFile($dest, str_replace('\\', '/', substr($file->getPathname(), strlen($dest) + 1)), $master, $nameKey, $packDir);
                $tick();
            }
        }
        removeTree($full);
    }
}

function sealFile($dest, $rel, $master, $nameKey, $packDir) {
    $full = $dest . '/' . $rel;
    $iv = random_bytes(12);
    $tag = '';
    $plain = (string) file_get_contents($full);
    $packed = gzencode($plain, 6);
    $body = ($packed !== false && strlen($packed) < strlen($plain)) ? "\x01" . $packed : "\x00" . $plain;
    $sealed = openssl_encrypt($body, 'aes-256-gcm', $master, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
    if ($sealed === false) fail('Gagal mengenkripsi ' . $rel);
    $name = substr(hash('sha256', $nameKey . '|' . $rel), 0, 32);
    file_put_contents($dest . '/' . $packDir . $name . '.bin', $iv . $sealed . $tag);
    if (is_file($full)) unlink($full);
}

/** Modul WebAssembly kecil yang menyusun rahasia build; nilainya tidak tersimpan utuh di dalam file. */
function buildKeyModule($secret, $salt) {
    $mask = random_bytes(32);
    $data = $mask;
    for ($i = 0; $i < 32; $i++) {
        $data .= chr(ord($secret[$i]) ^ ord($mask[$i]) ^ (($i * 167 + $salt) & 255));
    }
    $section = function ($id, $body) { return chr($id) . leb128(strlen($body)) . $body; };
    $code = "\x00"                                // tanpa variabel lokal
        . "\x20\x00\x2d\x00\x00"              // mem[i]
        . "\x20\x00\x2d\x00\x20\x73"          // ^ mem[i + 32]
        . "\x20\x00\x41" . sleb128(167) . "\x6c\x41" . sleb128($salt) . "\x6a\x73" // ^ (i * 167 + salt)
        . "\x41" . sleb128(255) . "\x71\x0b";    // & 255
    return "\x00asm\x01\x00\x00\x00"
        . $section(1, "\x01\x60\x01\x7f\x01\x7f")
        . $section(3, "\x01\x00")
        . $section(5, "\x01\x00\x01")
        . $section(7, "\x01\x01k\x00\x00")
        . $section(10, "\x01" . leb128(strlen($code)) . $code)
        . $section(11, "\x01\x00\x41\x00\x0b" . leb128(strlen($data)) . $data);
}

function leb128($value) {
    $out = '';
    do {
        $byte = $value & 0x7f;
        $value >>= 7;
        if ($value !== 0) $byte |= 0x80;
        $out .= chr($byte);
    } while ($value !== 0);
    return $out;
}

function sleb128($value) {
    $out = '';
    while (true) {
        $byte = $value & 0x7f;
        $value >>= 7;
        if (($value === 0 && !($byte & 0x40)) || ($value === -1 && ($byte & 0x40))) return $out . chr($byte);
        $out .= chr($byte | 0x80);
    }
}

/** Daftar domain dari project: 'https://Game.com/x, *.game.com' menjadi ['game.com', '*.game.com']. */
function parseAllowedDomains($text) {
    $hosts = [];
    foreach (preg_split('/[\s,]+/', (string) $text, -1, PREG_SPLIT_NO_EMPTY) as $entry) {
        $entry = strtolower(preg_replace('#^[a-z]+://#i', '', $entry));
        $host = preg_replace('#[:/].*$#', '', $entry);
        if ($host !== '') $hosts[$host] = true;
    }
    return array_keys($hosts);
}

/** Kunci utama dibungkus per domain, jadi di alamat lain kuncinya memang tidak bisa dibuka. */
function buildLocks($master, $secret, $hosts) {
    $hex = bin2hex($secret);
    $locks = [];
    foreach ($hosts ?: ['*'] as $host) {
        $pad = hash('sha256', $hex . '#' . $host, true);
        $locks[hash('sha256', $hex . '|' . $host)] = bin2hex($master ^ $pad);
    }
    return $locks;
}

/** Halaman game: hanya HUD gameplay dari index.html, tanpa toolbar, panel, dan timeline editor. */
function buildGameHtml($html, $gameName, $vaultFile, $vendorScripts, $scripts, $styles) {
    $html = cutBlock($html, '<!-- TOP COMPACT TOOLBAR -->', '<!-- CRASH NITRO KART');
    $html = cutBlock($html, '<!-- MOBILE SIDEBAR OVERLAY BACKDROP -->', '<!-- MOBILE TOUCH CONTROLS');
    $html = cutBlock($html, '<!-- BOTTOM CINEMATIC', '</body>');

    if (!preg_match('#<body[^>]*>(.*)</body>#s', $html, $m)) fail('Body index.html tidak terbaca');
    $body = $m[1];

    // ?v= memastikan pemain mendapat skrip build terbaru setelah deploy ulang
    $version = date('YmdHis');
    $tags = [];
    foreach ($vendorScripts as $file) $tags[] = '<script src="vendor/' . $file . '?v=' . $version . '"></script>';
    foreach ($scripts as $file) $tags[] = '<script src="' . $file . '?v=' . $version . '"></script>';
    $links = array_map(function ($file) use ($version) {
        return '<link rel="stylesheet" href="' . $file . '?v=' . $version . '">';
    }, $styles);

    // Berlaku juga di hosting statis yang tidak bisa memasang header sendiri
    $policy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'";

    return "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"UTF-8\">\n"
        . '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">' . "\n"
        . '<meta name="apple-mobile-web-app-capable" content="yes">' . "\n"
        . '<meta name="mobile-web-app-capable" content="yes">' . "\n"
        . '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' . "\n"
        . '<meta name="theme-color" content="#000000">' . "\n"
        . '<title>' . htmlspecialchars($gameName, ENT_QUOTES) . "</title>\n"
        . '<link rel="icon" href="data:,">' . "\n"
        . '<meta http-equiv="Content-Security-Policy" content="' . $policy . '">' . "\n"
        . '<script src="' . $vaultFile . '"></script>' . "\n"
        . implode("\n", $links) . "\n</head>\n<body class=\"pandora-game-runtime\">\n"
        . engineStateInputs() . gameBootOverlays() . $body . "\n" . implode("\n", $tags) . "\n</body>\n</html>\n";
}

/** Sudah ada sejak baris pertama HTML agar canvas kosong tidak pernah sempat terlihat. */
function gameBootOverlays() {
    return '<div id="game-cover"></div>' . "\n"
        . '<div id="game-splash"><span>PANDORA STUDIO</span></div>' . "\n";
}

/** Kontrol tersembunyi yang dibaca engine sebagai state lingkungan (nilainya diisi dari stage). */
function engineStateInputs() {
    return <<<HTML
<div hidden>
<select id="select-sky-preset"><option value="day" selected>day</option><option value="sunset">sunset</option><option value="night">night</option></select>
<input type="range" id="slider-azimuth" min="0" max="360" value="300">
<input type="range" id="slider-elevation" min="5" max="85" value="45">
<span id="val-azimuth"></span><span id="val-elevation"></span>
<input type="range" id="slider-wind-speed" min="0" max="3" step="0.1" value="1">
<input type="range" id="slider-leaf-fall" min="0" max="3" step="0.2" value="1">
<select id="select-player-hero-folder"></select>
</div>

HTML;
}

$payload = json_decode((string) file_get_contents('php://input'), true);
$gameName = trim((string) ($payload['name'] ?? ''));
if ($gameName === '') fail('Nama game wajib diisi', 400);

$root = realpath(__DIR__ . '/..');
$vendorDir = $root . '/runtime/vendor';
if (!is_dir($vendorDir)) fail('Folder runtime/vendor tidak ditemukan');

reportProgress(0.02, 'Membaca stage');

// --- Stage ---
$project = json_decode((string) @file_get_contents($root . '/config/project.json'), true) ?: [];
$stages = [];
foreach (glob($root . '/maps/*.json') as $file) {
    $data = json_decode((string) file_get_contents($file), true);
    if (is_array($data)) {
        $id = $data['id'] ?? basename($file, '.json');
        $stages[$id] = ['id' => $id, 'name' => $data['name'] ?? $id, 'file' => $file, 'data' => $data];
    }
}
if (!$stages) fail('Belum ada stage tersimpan', 400);

$startStageId = $project['startStageId'] ?? '';
if (!isset($stages[$startStageId])) {
    $listed = array_values(array_filter((array) ($project['stageOrder'] ?? []), function ($id) use ($stages) {
        return isset($stages[$id]);
    }));
    $startStageId = $listed[0] ?? array_key_first($stages);
}

// Hanya stage yang bisa dicapai dari stage awal lewat portal yang ikut ke game
$order = [$startStageId];
for ($i = 0; $i < count($order); $i++) {
    foreach ((array) ($stages[$order[$i]]['data']['portals'] ?? []) as $portal) {
        $target = $portal['targetStageId'] ?? '';
        if (isset($stages[$target]) && !in_array($target, $order, true)) $order[] = $target;
    }
}
$skippedStages = array_diff(array_keys($stages), $order);
$allStages = $stages;
$stages = array_intersect_key($stages, array_flip($order));

$warnings = [];
$importedModelFiles = [];
foreach ($skippedStages as $id) {
    $warnings[] = "Stage {$allStages[$id]['name']} tidak ikut karena tidak terhubung portal dari stage awal.";
}
foreach ($stages as $stage) {
    foreach ((array) ($stage['data']['portals'] ?? []) as $portal) {
        $target = $portal['targetStageId'] ?? '';
        if ($target === '') {
            $warnings[] = "Portal '{$portal['name']}' di {$stage['name']} belum punya tujuan.";
        } elseif (!isset($allStages[$target])) {
            $warnings[] = "Portal '{$portal['name']}' di {$stage['name']} menuju stage yang tidak ada ({$target}).";
        }
    }
    $importedFiles = [];
    foreach ((array) ($stage['data']['importedObjects'] ?? []) as $object) {
        $file = (string) ($object['file'] ?? '');
        if (preg_match('#^assets/imported/[a-f0-9]+\.(glb|gltf)$#', $file) && is_file($root . '/' . $file)) {
            $importedModelFiles[$file] = true;
        } else {
            $warnings[] = "Objek GLB '{$object['name']}' di {$stage['name']} tidak ikut karena filenya belum tersimpan. Impor ulang file GLB-nya di Studio, lalu simpan stage.";
        }
    }
}

// --- Folder tujuan: selalu di luar project; hanya folder build milik exporter yang boleh ditimpa ---
$buildsRoot = dirname($root) . DIRECTORY_SEPARATOR . 'pandora-builds';
$dest = $buildsRoot . DIRECTORY_SEPARATOR . slugify($gameName);
if (is_dir($dest)) {
    if (!is_file($dest . DIRECTORY_SEPARATOR . BUILD_MARKER)) {
        fail("Folder {$dest} sudah ada dan bukan hasil Generate Game. Gunakan nama lain.", 409);
    }
    removeTree($dest);
}
if (!mkdir($dest, 0777, true)) fail('Gagal membuat folder ' . $dest);

reportProgress(0.08, 'Menyiapkan karakter');

// --- Karakter yang dipakai ---
$manifest = buildHeroManifest($root);
if (!$manifest) fail('Gagal membaca daftar karakter');
$usedCharacters = [];
foreach ($stages as $stage) {
    $usedCharacters[] = $stage['data']['character'] ?? 'red';
    foreach ((array) ($stage['data']['foxes'] ?? []) as $fox) {
        $species = $fox['species'] ?? 'foxtree';
        $usedCharacters[] = $species === 'enemy-foxtree' ? 'foxtree' : $species;
    }
    // Aktor cinematic hanya dihitung jika stage punya trigger yang memutarnya
    if (stageUsesCinematic($stage['data'])) {
        foreach ((array) ($stage['data']['cinematic']['scenes'] ?? []) as $cinScene) {
            if (empty($cinScene['isFoxEnabled'])) continue;
            foreach ((array) ($cinScene['foxes'] ?? []) as $actor) {
                if (!empty($actor['species'])) $usedCharacters[] = $actor['species'];
            }
        }
    }
}
$usedCharacters = array_values(array_unique($usedCharacters));
$manifest['characters'] = array_values(array_filter($manifest['characters'], function ($c) use ($usedCharacters) {
    return in_array($c['id'], $usedCharacters, true);
}));
$bundled = array_column($manifest['characters'], 'id');

// Karakter tanpa animasi lengkap meminjam klip dari hero/red (lihat fallbackSlots di fox-model.js),
// jadi red ikut sebagai sumber animasi. Attachment-nya tidak ikut kecuali red benar-benar dimainkan.
$attachmentOwners = $bundled;
$borrowedSlots = ['walk', 'run', 'jump'];
foreach ($manifest['characters'] as $character) {
    if (array_diff($borrowedSlots, array_keys((array) ($character['slots'] ?? []))) && !in_array('red', $bundled, true)) {
        $bundled[] = 'red';
    }
}
foreach (array_diff($usedCharacters, $bundled) as $missing) {
    $warnings[] = "Karakter {$missing} dipakai stage tetapi foldernya tidak ada di hero/.";
}

// --- Attachment milik karakter yang dipakai ---
$attachments = json_decode((string) @file_get_contents($root . '/config/attachments.json'), true) ?: ['characters' => []];
$attachments['characters'] = array_intersect_key((array) ($attachments['characters'] ?? []), array_flip($attachmentOwners));
$attachmentFiles = [];
array_walk_recursive($attachments['characters'], function ($value, $key) use (&$attachmentFiles) {
    if (is_string($value) && strpos($value, 'assets/attachments/') === 0) $attachmentFiles[$value] = true;
});
$hasAttachments = count($attachmentFiles) > 0 || count($importedModelFiles) > 0;

// --- Engine: hanya file gameplay ---
$gameScripts = [
    'js/core/asset-cache.js', 'js/core/random.js', 'js/core/game-settings.js', 'js/core/scene.js', 'js/core/cinematic-shared.js', 'js/core/cinematic-player.js', 'js/core/imported-objects.js', 'js/core/boss-kill-cam.js', 'js/runtime/game-shim.js',
    'js/environment/sky.js', 'js/terrain/terrain.js', 'js/water/water-manager.js', 'js/environment/fog-manager.js',
    'js/trees/foliage-materials.js', 'js/trees/falling-leaves.js', 'js/trees/tree-generators.js', 'js/grass/grass.js',
    'js/rocks/rock-manager.js', 'js/flowers/flower-manager.js', 'js/ferns/fern-manager.js', 'js/bushes/bush-manager.js',
    'js/butterflies/butterfly-manager.js', 'js/trees/tree-manager.js', 'js/character/play-state.js', 'js/environment/sun.js',
    'js/character/fox-sound.js', 'js/character/fox-species.js', 'js/character/fox-materials.js',
    'js/character/attachment-system.js', 'js/character/hitbox-system.js', 'js/character/fox-model.js',
    'js/character/fox-stats.js', 'js/character/fox-physics.js', 'js/character/fox-spawner.js',
    'js/items/plasma-weapon.js', 'js/items/item-box-manager.js', 'js/items/item-system.js', 'js/character/fox-ai.js',
    'js/character/combat-hud.js', 'js/character/mobile-controls.js', 'js/character/player-spawn.js',
    'js/character/play-mode.js', 'js/core/render-loop.js', 'js/environment/portal-manager.js', 'js/environment/trigger-manager.js',
    'js/core/stage-loader.js', 'js/runtime/game-runtime.js'
];
$gameStyles = ['css/base.css', 'css/icons.css', 'css/play-hud.css', 'css/items.css', 'css/cinematic-fx.css', 'css/settings-panel.css', 'css/mobile-controls.css', 'css/game-runtime.css'];
$vendorScripts = ['three.min.js', 'OrbitControls.js', 'fflate.min.js', 'FBXLoader.js', 'SkeletonUtils.js', 'gsap.min.js'];
if ($hasAttachments) {
    array_splice($vendorScripts, 2, 0, ['GLTFLoader.js', 'DRACOLoader.js', 'meshopt_decoder.js', 'meshopt_simplifier.js']);
}

reportProgress(0.12, 'Menyalin engine dan aset');
copyFiles($root, $dest, $gameStyles);
foreach ($vendorScripts as $file) {
    if (!is_file($vendorDir . '/' . $file)) fail('Vendor runtime tidak lengkap: ' . $file);
    if (!is_dir($dest . '/vendor')) mkdir($dest . '/vendor', 0777, true);
    copy($vendorDir . '/' . $file, $dest . '/vendor/' . $file);
}
if ($hasAttachments) copyTree($vendorDir . '/draco', $dest . '/vendor/draco');
copyTree($root . '/runtime/fonts', $dest . '/runtime/fonts');
copyTree($root . '/runtime/deploy', $dest . '/deploy');
copy($root . '/runtime/deploy/Deploy-ke-VPS.bat', $dest . '/Deploy-ke-VPS.bat');
copy($root . '/runtime/launcher/Play.bat', $dest . '/Play.bat');
copy($root . '/runtime/launcher/play-server.ps1', $dest . '/play-server.ps1');
copy($root . '/runtime/launcher/play.sh', $dest . '/play.sh');

// --- Data game ---
mkdir($dest . '/data/maps', 0777, true);
foreach ($stages as $id => $stage) {
    $data = $stage['data'];
    unset($data['meta']);
    $data['importedObjects'] = array_values(array_filter((array) ($data['importedObjects'] ?? []), function ($object) use ($importedModelFiles) {
        return isset($importedModelFiles[$object['file'] ?? '']);
    }));
    if (!stageUsesCinematic($data)) {
        unset($data['cinematic']);
    } elseif (!empty($data['cinematic']['scenes'])) {
        foreach ($data['cinematic']['scenes'] as &$cinScene) unset($cinScene['treesSnapshot']);
        unset($cinScene);
    }
    // Urutan acak membuat preset rendah cukup menggambar sebagian awal rumput dan tetap merata
    if (!empty($data['activeGrass'])) shuffle($data['activeGrass']);
    file_put_contents($dest . '/data/maps/' . $id . '.json', json_encode($data, JSON_UNESCAPED_UNICODE));
}
file_put_contents($dest . '/data/project.json', json_encode([
    'name' => $gameName,
    'startStageId' => $startStageId,
    'animationDonor' => in_array('red', $bundled, true) ? 'red' : null,
    'stages' => array_map(function ($id) use ($stages) {
        $data = $stages[$id]['data'];
        $enemies = [];
        foreach ((array) ($data['foxes'] ?? []) as $fox) {
            $species = $fox['species'] ?? 'foxtree';
            $enemies[] = $species === 'enemy-foxtree' ? 'foxtree' : $species;
        }
        if (stageUsesCinematic($data)) {
            foreach ((array) ($data['cinematic']['scenes'] ?? []) as $cinScene) {
                if (empty($cinScene['isFoxEnabled'])) continue;
                foreach ((array) ($cinScene['foxes'] ?? []) as $actor) {
                    if (!empty($actor['species'])) $enemies[] = $actor['species'];
                }
            }
        }
        return [
            'id' => $id,
            'name' => $stages[$id]['name'],
            'player' => $data['character'] ?? 'red',
            'others' => array_values(array_unique($enemies))
        ];
    }, $order)
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

mkdir($dest . '/config', 0777, true);
file_put_contents($dest . '/config/heroes.json', json_encode($manifest, JSON_UNESCAPED_UNICODE));
file_put_contents($dest . '/config/attachments.json', json_encode($attachments, JSON_UNESCAPED_UNICODE));
if (is_file($root . '/config/hitboxes.json')) copy($root . '/config/hitboxes.json', $dest . '/config/hitboxes.json');

copyTree($root . '/hero/general', $dest . '/hero/general');
foreach ($bundled as $id) {
    copyTree($root . '/hero/' . $id, $dest . '/hero/' . $id);
}
copyFiles($root, $dest, array_keys($importedModelFiles));
foreach (array_keys($attachmentFiles) as $rel) {
    $from = $root . '/' . $rel;
    if (is_file($from)) {
        copyFiles($root, $dest, [$rel]);
    } else {
        $warnings[] = "Attachment {$rel} tidak ditemukan.";
    }
}

file_put_contents($dest . '/README.txt', str_replace("\n", "\r\n", <<<TXT
{$gameName}

MAIN DI KOMPUTER INI
  Windows    : klik dua kali Play.bat
  macOS/Linux: jalankan ./play.sh (butuh python3)

PERLINDUNGAN
  Aset terenkripsi dan hanya dibuka oleh game ini. Jangan bagikan folder deploy/
  karena berisi rahasia tanda tangan URL. Hosting selain deploy VPS di bawah tidak
  memeriksa tanda tangan URL dan tidak memasang header keamanan.

DEPLOY KE VPS (Ubuntu/Debian)
  Dari Windows, klik dua kali Deploy-ke-VPS.bat lalu masukkan alamat VPS, atau:
    Deploy-ke-VPS.bat root@ip-server
    Deploy-ke-VPS.bat root@ip-server namadomain.com email@anda.com    (dengan HTTPS)

  Sudah ada folder ini di server? Jalankan:
    sudo sh deploy/install-vps.sh namadomain.com email@anda.com

  Hosting statis lain: unggah seluruh isi folder ini.

BERBAGI LEWAT TUNNEL
  Jalankan Play.bat, lalu di terminal lain (port tertulis di jendela Play.bat):
    ngrok http 8765
    cloudflared tunnel --url http://localhost:8765

TXT
));
file_put_contents($dest . '/' . BUILD_MARKER, json_encode([
    'name' => $gameName,
    'generatedAt' => date('c'),
    'stageCount' => count($stages)
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

// --- Perlindungan: aset terenkripsi, kunci per domain, engine diminifikasi, pemuat diobfuscate ---
$buildId = bin2hex(random_bytes(8));
$master = random_bytes(32);
$secret = random_bytes(32);
$linkSecret = bin2hex(random_bytes(24));
$packDir = 'data/p/';
$keyFile = 'data/' . bin2hex(random_bytes(6)) . '.bin';

$allowedHosts = parseAllowedDomains($project['allowedDomains'] ?? '');
reportProgress(0.25, 'Memanggang animasi');
// Animasi dipanggang lebih dulu, karena setelah terenkripsi file tidak bisa diolah lagi
$bakeOutput = [];
$bakeStatus = 1;
if (is_file($root . '/tools/protect/node_modules/three/package.json')) {
    exec('node ' . escapeshellarg($root . '/tools/protect/bake-clips.js') . ' ' . escapeshellarg($dest . '/hero') . ' ' . escapeshellarg($vendorDir) . ' 2>&1', $bakeOutput, $bakeStatus);
}
if ($bakeStatus !== 0) {
    $warnings[] = 'Pemanggangan animasi gagal, jadi ukuran game dan waktu muatnya lebih besar. ' . implode(' ', array_slice($bakeOutput, 0, 2));
} else {
    $bakeResult = json_decode((string) end($bakeOutput), true) ?: [];
    foreach ((array) ($bakeResult['failed'] ?? []) as $failedClip) $warnings[] = 'Animasi tidak dipanggang: ' . $failedClip;
}

reportProgress(0.45, 'Mengoptimalkan attachment');
if (is_dir($dest . '/assets/attachments') && is_file($root . '/tools/protect/node_modules/sharp/package.json')) {
    $optimizeOutput = [];
    $optimizeStatus = 1;
    exec('node ' . escapeshellarg($root . '/tools/protect/optimize-attachments.js') . ' ' . escapeshellarg($dest . '/assets/attachments') . ' 2>&1', $optimizeOutput, $optimizeStatus);
    $optimizeResult = $optimizeStatus === 0 ? json_decode((string) end($optimizeOutput), true) : null;
    if (!$optimizeResult) {
        $warnings[] = 'Attachment gagal dioptimalkan, jadi waktu muat lebih lama. ' . implode(' ', array_slice($optimizeOutput, 0, 2));
    } else {
        foreach ((array) $optimizeResult['failed'] as $failedModel) $warnings[] = 'Attachment tidak dioptimalkan: ' . $failedModel;
    }
}
// Objek stage dilihat dari dekat dan menjadi bentuk collision, jadi batasnya lebih longgar dari attachment
if (is_dir($dest . '/assets/imported') && is_file($root . '/tools/protect/node_modules/sharp/package.json')) {
    reportProgress(0.52, 'Mengoptimalkan objek 3D');
    $importOutput = [];
    $importStatus = 1;
    exec('node ' . escapeshellarg($root . '/tools/protect/optimize-attachments.js') . ' ' . escapeshellarg($dest . '/assets/imported') . ' 80000 2048 2>&1', $importOutput, $importStatus);
    $importResult = $importStatus === 0 ? json_decode((string) end($importOutput), true) : null;
    if (!$importResult) {
        $warnings[] = 'Objek 3D gagal dioptimalkan, jadi waktu muat lebih lama. ' . implode(' ', array_slice($importOutput, 0, 2));
    } else {
        foreach ((array) $importResult['failed'] as $failedModel) $warnings[] = 'Objek 3D tidak dioptimalkan: ' . $failedModel;
    }
}

sealPaths($dest, ['hero', 'assets/attachments', 'assets/imported', 'data/maps', 'data/project.json', 'config'], $master, $packDir, 0.6, 0.85);
if (is_dir($dest . '/assets') && count(scandir($dest . '/assets')) === 2) rmdir($dest . '/assets');
$keySalt = random_int(1, 200);
file_put_contents($dest . '/' . $keyFile, buildKeyModule($secret, $keySalt));

$vaultSource = str_replace('__CONFIG__', json_encode([
    'id' => $buildId,
    'keyFile' => $keyFile,
    'keySalt' => $keySalt,
    'packDir' => $packDir,
    'linkSecret' => $linkSecret,
    'locks' => buildLocks($master, $secret, $allowedHosts),
    'characters' => $bundled
], JSON_UNESCAPED_SLASHES), (string) file_get_contents($root . '/runtime/protect/vault.js'));

reportProgress(0.87, 'Mengecilkan dan melindungi kode');
$engineSource = '';
foreach ($gameScripts as $rel) {
    $engineSource .= (string) file_get_contents($root . '/' . $rel) . "\n;\n";
}

$engineFile = 'app-' . substr($buildId, 0, 8) . '.js';
$vaultFile = 'core-' . substr($buildId, 8) . '.js';
$workDir = sys_get_temp_dir() . '/pandora-export-' . $buildId;
mkdir($workDir, 0777, true);
file_put_contents($workDir . '/engine.js', $engineSource);
file_put_contents($workDir . '/vault.js', $vaultSource);
file_put_contents($workDir . '/job.json', json_encode([
    'engineIn' => $workDir . '/engine.js',
    'engineOut' => $dest . '/' . $engineFile,
    'vaultIn' => $workDir . '/vault.js',
    'vaultOut' => $dest . '/' . $vaultFile
]));
$toolOutput = [];
$toolStatus = 1;
if (is_file($root . '/tools/protect/node_modules/terser/package.json')) {
    exec('node ' . escapeshellarg($root . '/tools/protect/build-js.js') . ' ' . escapeshellarg($workDir . '/job.json') . ' 2>&1', $toolOutput, $toolStatus);
}
if ($toolStatus !== 0) {
    // Game tetap jalan dan aset tetap terenkripsi, tetapi kode terbaca: pengguna harus tahu
    copy($workDir . '/engine.js', $dest . '/' . $engineFile);
    copy($workDir . '/vault.js', $dest . '/' . $vaultFile);
    $warnings[] = 'Minifikasi kode gagal, jadi kode game dan kunci lebih mudah dibaca. Pastikan Node.js terpasang dan jalankan npm install di tools/protect. ' . implode(' ', array_slice($toolOutput, 0, 2));
}
removeTree($workDir);

$html = (string) file_get_contents($root . '/index.html');
file_put_contents($dest . '/index.html', buildGameHtml($html, $gameName, $vaultFile, $vendorScripts, [$engineFile], $gameStyles));

$siteConf = (string) file_get_contents($dest . '/deploy/nginx-site.conf');
file_put_contents($dest . '/deploy/nginx-site.conf', str_replace('__LINK_SECRET__', $linkSecret, $siteConf));

if ($allowedHosts) {
    $warnings[] = 'Build dikunci ke domain: ' . implode(', ', $allowedHosts) . '. Play.bat dan alamat lain akan ditolak.';
}

reportProgress(1, 'Selesai');
[$fileCount, $bytes] = treeStats($dest);
echo json_encode([
    'success' => true,
    'path' => $dest,
    'stageCount' => count($stages),
    'fileCount' => $fileCount,
    'sizeMB' => round($bytes / 1048576, 1),
    'warnings' => array_values(array_unique($warnings))
], JSON_UNESCAPED_UNICODE);
