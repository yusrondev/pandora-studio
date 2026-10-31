<?php
/**
 * Pandora Editor - Simpan file GLB/GLTF impor ke assets/imported/
 * POST isi file mentah (nama asli di ?name=). Nama file diambil dari isi, jadi model yang sama tidak tersimpan dua kali.
 */

header('Content-Type: application/json; charset=utf-8');

function respond($code, $data) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    respond(405, ['success' => false, 'error' => 'Gunakan POST']);
}
// Tipe khusus: halaman web lain tidak bisa mengirim ini tanpa lolos preflight CORS
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/x-pandora-model') !== 0) {
    respond(415, ['success' => false, 'error' => 'Content-Type tidak didukung']);
}

$data = (string) file_get_contents('php://input');
$isBinary = strncmp($data, 'glTF', 4) === 0;
$isJson = !$isBinary && substr(ltrim(substr($data, 0, 64)), 0, 1) === '{';
if (!$isBinary && !$isJson) {
    respond(400, ['success' => false, 'error' => 'File bukan GLB atau GLTF yang valid']);
}

$dir = __DIR__ . '/../assets/imported';
if (!is_dir($dir) && !mkdir($dir, 0777, true)) {
    respond(500, ['success' => false, 'error' => 'Gagal membuat folder assets/imported']);
}

$fileName = substr(hash('sha256', $data), 0, 24) . ($isBinary ? '.glb' : '.gltf');
$path = $dir . '/' . $fileName;
if (!is_file($path) && file_put_contents($path, $data) === false) {
    respond(500, ['success' => false, 'error' => 'Gagal menyimpan file model']);
}

respond(200, ['success' => true, 'file' => 'assets/imported/' . $fileName]);
