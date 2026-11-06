<?php
/**
 * Pandora Editor - Simpan file GLB/GLTF impor ke assets/imported/
 * POST isi file mentah, utuh atau per potongan (?upload=<id>&index=<i>&total=<n>, lihat js/editor/model-upload.js). Nama file diambil dari isi, jadi model yang sama tidak tersimpan dua kali.
 */

@ini_set('memory_limit', '512M');
@ini_set('max_execution_time', '300');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

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
// Body melewati post_max_size: PHP membuangnya dan isi yang terbaca kosong
if ($data === '' && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    respond(413, ['success' => false, 'error' => 'Ukuran kiriman melewati batas unggah server (post_max_size ' . ini_get('post_max_size') . ')']);
}

// Mode potongan: ?upload=<id>&index=<i>&total=<n>. Potongan disambung ke file sementara,
// potongan terakhir diproses seperti unggahan tunggal di bawah.
if (isset($_GET['upload'])) {
    $uploadId = (string) $_GET['upload'];
    $index = filter_var($_GET['index'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
    $total = filter_var($_GET['total'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 512]]);
    if (!preg_match('/^[a-f0-9]{16,32}$/', $uploadId) || $index === false || $total === false || $index >= $total) {
        respond(400, ['success' => false, 'error' => 'Parameter potongan unggahan tidak valid']);
    }
    $partPath = rtrim(sys_get_temp_dir(), '/\\') . '/pandora-upload-' . $uploadId . '.part';
    if ($index > 0 && !is_file($partPath)) {
        respond(409, ['success' => false, 'error' => 'Potongan awal unggahan tidak ditemukan, ulangi impor']);
    }
    if (file_put_contents($partPath, $data, $index === 0 ? 0 : FILE_APPEND) === false) {
        respond(500, ['success' => false, 'error' => 'Gagal menyimpan potongan unggahan']);
    }
    if ($index < $total - 1) {
        respond(200, ['success' => true, 'received' => $index]);
    }
    $data = (string) file_get_contents($partPath);
    @unlink($partPath);
}

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
