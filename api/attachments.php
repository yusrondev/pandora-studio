<?php
/**
 * Pandora Editor - Character 3D Socket & Attachment Configuration API
 * Digunakan oleh Hit Tool (Character Manager) dan Demo Mode
 * untuk membaca dan menyimpan data penempelan objek 3D (senjata, perisai, armor, topi)
 * ke bagian tubuh (Bone Socket) tiap karakter.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$configFile = realpath(__DIR__ . '/../config/attachments.json');
if (!$configFile) {
    $configFile = __DIR__ . '/../config/attachments.json';
}

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
        'characters' => new stdClass()
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    $data = @json_decode($rawInput, true);

    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Invalid JSON input data'
        ]);
        exit;
    }

    $data['version'] = 1;
    $data['updatedAt'] = date('c');

    $configDir = dirname($configFile);
    if (!is_dir($configDir)) {
        @mkdir($configDir, 0777, true);
    }

    $jsonStr = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    $bytes = @file_put_contents($configFile, $jsonStr);

    if ($bytes === false) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Gagal menulis ke config/attachments.json'
        ]);
        exit;
    }

    echo json_encode([
        'success' => true,
        'message' => 'Konfigurasi 3D Attachment berhasil disimpan',
        'updatedAt' => $data['updatedAt']
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);

