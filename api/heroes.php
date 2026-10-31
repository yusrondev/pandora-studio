<?php
/**
 * Pandora Editor - Dynamic Hero & Character Folder Discovery API (api/heroes.php)
 * Otomatis memindai seluruh sub-folder di dalam hero/ (kecuali general/) beserta seluruh
 * susunan file .fbx di dalamnya. Setiap kali developer menambahkan folder karakter baru
 * di dalam hero/<nama_karakter>/, engine otomatis mendeteksi dan menyinkronkannya ke
 * Map Editor (Spawner, Inspector, Player Spawn) dan Hitbox Studio (hit-tool.html).
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$heroRoot = realpath(__DIR__ . '/../hero');
if (!$heroRoot || !is_dir($heroRoot)) {
    echo json_encode([
        'success' => false,
        'error' => 'Folder hero/ tidak ditemukan'
    ]);
    exit;
}

/**
 * Pindai semua file .fbx secara rekursif di dalam suatu direktori
 * dan kembalikan path relatif dengan forward slash (/).
 */
function scanFbxFilesRecursive($dirPath, $baseDir = null) {
    if ($baseDir === null) {
        $baseDir = $dirPath;
    }
    $results = [];
    if (!is_dir($dirPath)) {
        return $results;
    }

    $items = @scandir($dirPath);
    if (!$items) {
        return $results;
    }

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $fullPath = $dirPath . DIRECTORY_SEPARATOR . $item;
        if (is_dir($fullPath)) {
            $subResults = scanFbxFilesRecursive($fullPath, $baseDir);
            foreach ($subResults as $sub) {
                $results[] = $sub;
            }
        } elseif (is_file($fullPath) && strtolower(pathinfo($item, PATHINFO_EXTENSION)) === 'fbx') {
            $rel = substr($fullPath, strlen($baseDir) + 1);
            $rel = str_replace('\\', '/', $rel);
            $results[] = $rel;
        }
    }

    sort($results, SORT_NATURAL | SORT_FLAG_CASE);
    return $results;
}

/**
 * Petakan daftar file .fbx relatif di dalam folder karakter ke slot animasi standar engine
 */
function mapCharacterFbxSlots($fbxFiles, $allowFallbackFirstAsIdle = true) {
    $slots = [];
    $extraClips = [];

    $standardSlotMatchers = [
        'idle'        => ['idle.fbx', 'stand.fbx', 'breathing.fbx'],
        'idle2'       => ['idle2.fbx', 'idle_2.fbx', 'idle-2.fbx'],
        'idle3'       => ['idle3.fbx', 'idle_3.fbx', 'idle-3.fbx'],
        'walk'        => ['walk.fbx', 'walking.fbx'],
        'backward'    => ['backward.fbx', 'walk-backward.fbx', 'walk_backward.fbx'],
        'run'         => ['run.fbx', 'running.fbx', 'sprint.fbx'],
        'block'       => ['block.fbx', 'shield.fbx', 'guard.fbx'],
        'jump'        => ['jump-withrun.fbx', 'jump_withrun.fbx', 'jump.fbx'],
        'jumpNormal'  => ['jump-normal.fbx', 'jump_normal.fbx', 'backflip.fbx'],
        'kick1'       => ['kick1.fbx', 'kick_1.fbx', 'kick-1.fbx'],
        'kick2'       => ['kick2.fbx', 'kick_2.fbx', 'kick-2.fbx'],
        'kick3'       => ['kick3.fbx', 'kick_3.fbx', 'kick-3.fbx'],
        'flyingKick'  => ['flying-kick.fbx', 'flying_kick.fbx', 'flyingkick.fbx'],
        'punch1'      => ['punch1.fbx', 'punch_1.fbx', 'punch-1.fbx'],
        'punch2'      => ['punch2.fbx', 'punch_2.fbx', 'punch-2.fbx'],
        'punch3'      => ['punch3.fbx', 'punch_3.fbx', 'punch-3.fbx'],
        'flyingPunch' => ['flying-punch.fbx', 'flying_punch.fbx', 'flyingpunch.fbx'],
        'hit1'        => ['hit1.fbx', 'hit_1.fbx', 'hit-1.fbx', 'taking1.fbx'],
        'hit2'        => ['hit2.fbx', 'hit_2.fbx', 'hit-2.fbx', 'taking2.fbx'],
        'dead1'       => ['dead1.fbx', 'dead_1.fbx', 'dead-1.fbx', 'death1.fbx'],
        'dead2'       => ['dead2.fbx', 'dead_2.fbx', 'dead-2.fbx', 'death2.fbx']
    ];

    $usedFiles = [];

    foreach ($standardSlotMatchers as $slotKey => $candidates) {
        foreach ($candidates as $candidate) {
            foreach ($fbxFiles as $relFile) {
                $baseLower = strtolower(basename($relFile));
                if ($baseLower === $candidate) {
                    $slots[$slotKey] = $relFile;
                    $usedFiles[$relFile] = true;
                    break 2;
                }
            }
        }
    }

    // Jika tidak ada file bernama idle.fbx, gunakan file .fbx pertama sebagai base model + idle
    if ($allowFallbackFirstAsIdle && !isset($slots['idle']) && count($fbxFiles) > 0) {
        $slots['idle'] = $fbxFiles[0];
        $usedFiles[$fbxFiles[0]] = true;
    }

    // Daftarkan file .fbx tambahan (custom animasi) yang belum masuk slot standar
    foreach ($fbxFiles as $relFile) {
        if (!isset($usedFiles[$relFile])) {
            $rawName = pathinfo($relFile, PATHINFO_FILENAME);
            $cleanKey = preg_replace('/[^a-zA-Z0-9_]/', '_', $rawName);
            if (!empty($cleanKey) && !isset($slots[$cleanKey])) {
                $extraClips[$cleanKey] = $relFile;
            }
        }
    }

    return [
        'slots' => $slots,
        'extraClips' => $extraClips
    ];
}

function formatCharacterDisplayName($folderName) {
    $lower = strtolower($folderName);
    if ($lower === 'red') return 'Red Fox';
    if ($lower === 'enemy-foxtree' || $lower === 'foxtree') return 'FoxTree';
    if ($lower === 'tharon') return 'Tharon';

    // Ubah strip/underscore menjadi spasi & Title Case
    $clean = preg_replace('/^enemy[-_]/i', '', $folderName);
    $words = preg_split('/[-_\s]+/', $clean);
    $words = array_map('ucfirst', array_filter($words));
    return !empty($words) ? implode(' ', $words) : ucfirst($folderName);
}

$generalDir = $heroRoot . DIRECTORY_SEPARATOR . 'general';
$generalFiles = is_dir($generalDir) ? scanFbxFilesRecursive($generalDir) : [];
$generalMapped = mapCharacterFbxSlots($generalFiles, false);

$characters = [];
$entries = @scandir($heroRoot);

if ($entries) {
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        if (strtolower($entry) === 'general') continue;
        if (strpos($entry, '.') === 0) continue;

        $charDir = $heroRoot . DIRECTORY_SEPARATOR . $entry;
        if (!is_dir($charDir)) continue;

        $fbxFiles = scanFbxFilesRecursive($charDir);
        if (count($fbxFiles) === 0) continue; // Abaikan folder kosong yang belum memiliki file .fbx

        $mapped = mapCharacterFbxSlots($fbxFiles);
        $displayName = formatCharacterDisplayName($entry);
        $lowerId = strtolower($entry);

        // Kunci kompatibilitas untuk sistem yang sudah ada
        $spawnerKey = ($lowerId === 'enemy-foxtree') ? 'foxtree' : $entry;
        $hitToolKey = ($lowerId === 'red') ? 'hero' : $entry;

        // Opsional: baca character.json jika suatu saat user menaruh metadata kustom di dalam folder
        $metaFile = $charDir . DIRECTORY_SEPARATOR . 'character.json';
        $customMeta = [];
        if (is_file($metaFile)) {
            $decodedMeta = @json_decode(@file_get_contents($metaFile), true);
            if (is_array($decodedMeta)) {
                $customMeta = $decodedMeta;
            }
        }

        $characters[] = [
            'id'          => $entry,
            'folder'      => $entry,
            'spawnerKey'  => $customMeta['spawnerKey'] ?? $spawnerKey,
            'hitToolKey'  => $customMeta['hitToolKey'] ?? $hitToolKey,
            'name'        => $customMeta['name'] ?? $displayName,
            'badge'       => $customMeta['badge'] ?? ($lowerId === 'red' ? '🦊' : ($lowerId === 'enemy-foxtree' ? '👹' : '⚔️')),
            'basePath'    => 'hero/' . $entry . '/',
            'baseScale'   => isset($customMeta['baseScale']) ? floatval($customMeta['baseScale']) : 1.85,
            'yOffset'     => isset($customMeta['yOffset']) ? floatval($customMeta['yOffset']) : 0.05,
            'files'       => $fbxFiles,
            'slots'       => $mapped['slots'],
            'extraClips'  => $mapped['extraClips']
        ];
    }
}

// Urutkan agar karakter utama (red, enemy-foxtree, tharon, dst.) tampil rapi dan konsisten
usort($characters, function ($a, $b) {
    $priority = ['red' => 1, 'enemy-foxtree' => 2, 'tharon' => 3];
    $pa = $priority[strtolower($a['id'])] ?? 10;
    $pb = $priority[strtolower($b['id'])] ?? 10;
    if ($pa !== $pb) return $pa - $pb;
    return strcasecmp($a['name'], $b['name']);
});

$manifest = [
    'success'      => true,
    'updatedAt'    => date('c'),
    'general'      => [
        'basePath' => 'hero/general/',
        'files'    => $generalFiles,
        'slots'    => $generalMapped['slots']
    ],
    'characters'   => $characters
];

// Simpan juga salinan manifest ke config/heroes.json sebagai fallback statis
$configDir = __DIR__ . '/../config';
if (!is_dir($configDir)) {
    @mkdir($configDir, 0777, true);
}
@file_put_contents($configDir . '/heroes.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
