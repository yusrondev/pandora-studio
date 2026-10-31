<?php
/**
 * Pandora Editor - Pengaturan Project (config/project.json)
 * Nama game, stage awal, dan urutan stage. Isi tiap stage ada di maps/.
 */

header('Content-Type: application/json; charset=utf-8');

$projectFile = __DIR__ . '/../config/project.json';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $project = is_file($projectFile) ? json_decode((string) file_get_contents($projectFile), true) : null;
    echo json_encode(['success' => true, 'project' => $project ?: null], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    $payload = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($payload)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Data project tidak valid']);
        exit;
    }

    $project = [
        'name' => trim((string) ($payload['name'] ?? 'Pandora Game')) ?: 'Pandora Game',
        'startStageId' => (string) ($payload['startStageId'] ?? ''),
        'stageOrder' => array_values(array_map('strval', (array) ($payload['stageOrder'] ?? []))),
        'allowedDomains' => trim((string) ($payload['allowedDomains'] ?? ''))
    ];
    $saved = file_put_contents($projectFile, json_encode($project, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['success' => $saved !== false, 'project' => $project], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method tidak didukung']);
