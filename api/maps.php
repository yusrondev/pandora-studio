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

        if ($targetFile && file_exists($targetFile)) {
            $content = file_get_contents($targetFile);
            $decoded = json_decode($content, true);
            if ($decoded) {
                echo json_encode(['success' => true, 'map' => $decoded]);
                exit;
            }
        }

        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Map tidak ditemukan']);
        exit;
    }

    // Ambil daftar list map
    $maps = [];
    $files = glob($mapsDir . '/*.json');
    if ($files) {
        foreach ($files as $file) {
            $filename = basename($file);
            $id = basename($file, '.json');
            $content = @file_get_contents($file);
            $data = @json_decode($content, true);

            if ($data && is_array($data)) {
                $maps[] = [
                    'id' => $data['id'] ?? $id,
                    'name' => $data['name'] ?? $id,
                    'filename' => $filename,
                    'createdAt' => $data['createdAt'] ?? date('c', filectime($file)),
                    'updatedAt' => $data['updatedAt'] ?? date('c', filemtime($file)),
                    'treeCount' => isset($data['trees']) ? count($data['trees']) : ($data['meta']['treeCount'] ?? 0),
                    'grassCount' => isset($data['activeGrass']) ? count($data['activeGrass']) : ($data['meta']['grassCount'] ?? 0),
                    'fileSize' => filesize($file)
                ];
            } else {
                $maps[] = [
                    'id' => $id,
                    'name' => $id,
                    'filename' => $filename,
                    'createdAt' => date('c', filectime($file)),
                    'updatedAt' => date('c', filemtime($file)),
                    'treeCount' => 0,
                    'grassCount' => 0,
                    'fileSize' => filesize($file)
                ];
            }
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
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);

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

    $saved = file_put_contents($filePath, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    if ($saved !== false) {
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
