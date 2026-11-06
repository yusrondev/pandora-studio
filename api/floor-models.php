<?php
/**
 * Pandora Editor - Floor Models Registry API
 * Menyimpan dan memuat konfigurasi koleksi model 3D lantai ke config/floor-models.json
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$configFile = __DIR__ . '/../config/floor-models.json';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    if (file_exists($configFile)) {
        $content = @file_get_contents($configFile);
        if ($content) {
            echo $content;
            exit;
        }
    }
    echo json_encode([
        'version' => 1,
        'updatedAt' => date('c'),
        'activeId' => 'default_stone_floor',
        'models' => [
            [
                'id' => 'default_stone_floor',
                'name' => 'Batu Klasik (Garden)',
                'file' => 'assets/imported/69ab65c708bfc610331ef699.glb',
                'baseName' => 'stone_floor',
                'scale' => 0.00916018575191774,
                'tileSize' => 3.50,
                'yOffset' => 0.04,
                'isBuiltin' => true
            ]
        ]
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $data = @json_decode($raw, true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Data JSON tidak valid']);
        exit;
    }

    $data['version'] = 1;
    $data['updatedAt'] = date('c');

    $configDir = dirname($configFile);
    if (!is_dir($configDir)) {
        @mkdir($configDir, 0777, true);
    }

    $saved = @file_put_contents($configFile, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    if ($saved === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Gagal menulis file config/floor-models.json']);
        exit;
    }

    echo json_encode(['success' => true, 'updatedAt' => $data['updatedAt']]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method tidak didukung']);

