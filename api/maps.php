<?php
/**
 * Pandora Editor - Map Storage API
 * Menyimpan, memuat, dan menghapus map 3D ke folder maps/
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$mapsDir = realpath(__DIR__ . '/../maps');
if (!$mapsDir) {
    $dirPath = __DIR__ . '/../maps';
    if (!is_dir($dirPath)) {
        mkdir($dirPath, 0777, true);
    }
    $mapsDir = realpath($dirPath);
}

// Map besar (terrain, rumput, cinematic) bisa 20+ MB; di PHP satu json_decode-nya memakan ratusan MB.
// Batas ini hanya terpakai oleh operasi yang memang mengurai map penuh (simpan & ringkasan pertama kali).
const MAP_DECODE_MEMORY = '1024M';

// Ringkasan kecil per map (nama, tanggal, jumlah objek) disimpan di maps/.index/<id>.json supaya
// daftar map tidak perlu mengurai seluruh file setiap kali Studio dibuka.
function mapIndexDir($mapsDir) {
    $dir = $mapsDir . '/.index';
    if (!is_dir($dir)) @mkdir($dir, 0777, true);
    return $dir;
}

function buildMapSummary($data, $id, $file) {
    return [
        'id' => $data['id'] ?? $id,
        'name' => $data['name'] ?? $id,
        'filename' => basename($file),
        'createdAt' => $data['createdAt'] ?? date('c', filectime($file)),
        'updatedAt' => $data['updatedAt'] ?? date('c', filemtime($file)),
        'treeCount' => isset($data['trees']) ? count($data['trees']) : ($data['meta']['treeCount'] ?? 0),
        'grassCount' => isset($data['activeGrass']) ? count($data['activeGrass']) : ($data['meta']['grassCount'] ?? 0),
        'character' => $data['character'] ?? null,
        'portalCount' => isset($data['portals']) ? count($data['portals']) : 0,
        'fileSize' => filesize($file)
    ];
}

function writeMapSummary($mapsDir, $id, $summary, $file) {
    clearstatcache(true, $file);
    $summary['fileSize'] = filesize($file);
    $entry = ['mtime' => filemtime($file), 'size' => filesize($file), 'summary' => $summary];
    @file_put_contents(mapIndexDir($mapsDir) . '/' . $id . '.json', json_encode($entry, JSON_UNESCAPED_UNICODE));
}

function readMapSummary($mapsDir, $id, $file) {
    $cache = $mapsDir . '/.index/' . $id . '.json';
    if (is_file($cache)) {
        $entry = json_decode((string) @file_get_contents($cache), true);
        if (is_array($entry) && ($entry['mtime'] ?? 0) === filemtime($file) && ($entry['size'] ?? -1) === filesize($file)) {
            return $entry['summary'];
        }
    }
    // Belum ada / file berubah di luar Studio: urai sekali, lalu simpan ringkasannya
    ini_set('memory_limit', MAP_DECODE_MEMORY);
    $data = json_decode((string) @file_get_contents($file), true);
    if (!is_array($data)) {
        return [
            'id' => $id, 'name' => $id, 'filename' => basename($file),
            'createdAt' => date('c', filectime($file)), 'updatedAt' => date('c', filemtime($file)),
            'treeCount' => 0, 'grassCount' => 0, 'fileSize' => filesize($file)
        ];
    }
    $summary = buildMapSummary($data, $id, $file);
    unset($data);
    writeMapSummary($mapsDir, $id, $summary, $file);
    return $summary;
}

function sanitizeSlug($string) {
    $slug = preg_replace('/[^\p{L}\p{N}]+/u', '-', $string);
    $slug = trim($slug, '-');
    $slug = strtolower($slug);
    if (empty($slug)) {
        $slug = 'untitled-map-' . time();
    }
    return $slug;
}

// 1. GET: Daftar semua map atau detail satu map
if ($method === 'GET') {
    $id = isset($_GET['id']) ? trim($_GET['id']) : '';

    if (!empty($id)) {
        // Ambil data spesifik map
        $targetFile = null;
        $files = glob($mapsDir . '/*.json');
        foreach ($files as $file) {
            $base = basename($file, '.json');
            if ($base === $id) {
                $targetFile = $file;
                break;
            }
        }

        // File map ditulis oleh endpoint ini sendiri, jadi isinya dikirim apa adanya tanpa diurai ulang
        // (mengurai lalu meng-encode ulang map 20 MB menghabiskan memori). Cek ringan: harus objek JSON.
        if ($targetFile && file_exists($targetFile)) {
            $fh = fopen($targetFile, 'rb');
            $head = $fh ? ltrim((string) fread($fh, 64)) : '';
            if ($fh) fclose($fh);
            if ($head !== '' && $head[0] === '{') {
                header('Content-Length: ' . (filesize($targetFile) + strlen('{"success":true,"map":}')));
                echo '{"success":true,"map":';
                readfile($targetFile);
                echo '}';
                exit;
            }
        }

        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Map tidak ditemukan']);
        exit;
    }

    // Ambil daftar list map (dari ringkasan, bukan isi map penuh)
    $maps = [];
    $files = glob($mapsDir . '/*.json');
    if ($files) {
        foreach ($files as $file) {
            $maps[] = readMapSummary($mapsDir, basename($file, '.json'), $file);
        }

        // Urutkan berdasarkan updatedAt terbaru
        usort($maps, function ($a, $b) {
            return strcmp($b['updatedAt'], $a['updatedAt']);
        });
    }

    echo json_encode(['success' => true, 'maps' => $maps]);
    exit;
}

// 2. POST: Simpan atau update map
if ($method === 'POST') {
    ini_set('memory_limit', MAP_DECODE_MEMORY);
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    unset($raw);

    if (!$payload || !isset($payload['name'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Data map atau nama tidak valid']);
        exit;
    }

    $name = trim($payload['name']);
    $existingId = isset($payload['id']) ? trim($payload['id']) : '';

    if (!empty($existingId)) {
        $id = sanitizeSlug($existingId);
    } else {
        $id = sanitizeSlug($name);
    }

    $filename = $id . '.json';
    $filePath = $mapsDir . '/' . $filename;

    $now = date('c');
    $payload['id'] = $id;
    $payload['name'] = $name;
    $payload['filename'] = $filename;
    $payload['updatedAt'] = $now;
    if (!isset($payload['createdAt']) || empty($payload['createdAt'])) {
        $payload['createdAt'] = $now;
    }

    // JSON rapat: pretty print membuat map berisi ribuan angka (terrain, rumput) berlipat-lipat ukurannya
    $saved = file_put_contents($filePath, json_encode($payload, JSON_UNESCAPED_UNICODE), LOCK_EX);

    if ($saved !== false) {
        writeMapSummary($mapsDir, $id, buildMapSummary($payload, $id, $filePath), $filePath);
        echo json_encode([
            'success' => true,
            'id' => $id,
            'name' => $name,
            'filename' => $filename,
            'updatedAt' => $now,
            'message' => "Map '{$name}' berhasil disimpan ke folder maps/{$filename}"
        ]);
        exit;
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Gagal menulis file map ke disk']);
        exit;
    }
}

// 3. DELETE: Hapus map dari folder maps/
if ($method === 'DELETE') {
    $id = isset($_GET['id']) ? trim($_GET['id']) : '';
    if (empty($id)) {
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw, true);
        if ($payload && isset($payload['id'])) {
            $id = trim($payload['id']);
        }
    }

    if (empty($id)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'ID map wajib disertakan']);
        exit;
    }

    $targetFile = null;
    $files = glob($mapsDir . '/*.json');
    foreach ($files as $file) {
        $base = basename($file, '.json');
        if ($base === $id) {
            $targetFile = $file;
            break;
        }
    }

    if ($targetFile && file_exists($targetFile)) {
        if (@unlink($targetFile)) {
            @unlink($mapsDir . '/.index/' . $id . '.json');
            echo json_encode([
                'success' => true,
                'id' => $id,
                'message' => "Map berhasil dihapus dari folder maps/"
            ]);
            exit;
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Gagal menghapus file map dari disk']);
            exit;
        }
    }

    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'File map tidak ditemukan']);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Metode HTTP tidak didukung']);
