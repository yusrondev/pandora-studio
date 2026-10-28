<?php
/**
 * Pandora Editor - Hitbox & Hurtbox Configuration API
 * Menyimpan dan memuat konfigurasi hitbox per-animasi (bone attachment, radius, offset, damage, hurtbox)
 * ke file config/hitboxes.json agar langsung digunakan saat Play Mode maupun di Hit Tool.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$configDir = __DIR__ . '/../config';
if (!is_dir($configDir)) {
    @mkdir($configDir, 0777, true);
}
$configFile = $configDir . '/hitboxes.json';

if ($method === 'GET') {
    if (file_exists($configFile)) {
        $content = @file_get_contents($configFile);
        $decoded = @json_decode($content, true);
        if ($decoded && is_array($decoded)) {
            echo json_encode([
                'success' => true,
                'config' => $decoded
            ]);
            exit;
        }
    }

    echo json_encode([
        'success' => true,
        'config' => null,
        'message' => 'Menggunakan konfigurasi default hitbox'
    ]);
    exit;
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);

    if (!$payload || !is_array($payload)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Payload konfigurasi hitbox tidak valid'
        ]);
        exit;
    }

    $configData = isset($payload['config']) && is_array($payload['config']) ? $payload['config'] : $payload;
    $configData['updatedAt'] = date('c');

    $saved = @file_put_contents($configFile, json_encode($configData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    if ($saved !== false) {
        echo json_encode([
            'success' => true,
            'updatedAt' => $configData['updatedAt'],
            'message' => 'Konfigurasi Hitbox berhasil disimpan ke config/hitboxes.json'
        ]);
        exit;
    } else {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Gagal menulis file config/hitboxes.json'
        ]);
        exit;
    }
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method tidak didukung']);

