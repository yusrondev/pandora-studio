<?php
/**
 * Pandora Editor - 3D Attachment File Upload API
 * Menerima file 3D (.glb, .gltf, .fbx) untuk disimpan ke folder assets/attachments/
 * sehingga dapat dimuat di Hit Tool (Character Manager) dan Demo Mode (index.html).
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$uploadDir = __DIR__ . '/../assets/attachments';
if (!is_dir($uploadDir)) {
    @mkdir($uploadDir, 0777, true);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Helper penghapusan berkas fisik di assets/attachments/
function handleDeleteAttachmentFile($targetName, $uploadDir) {
    if (empty($targetName)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Nama file atau URL tidak boleh kosong.']);
        exit;
    }

    $baseName = basename($targetName);
    $fullPath = realpath($uploadDir) . DIRECTORY_SEPARATOR . $baseName;
    $realUploadDir = realpath($uploadDir);

    // Keamanan path traversal
    if (!$realUploadDir || strpos(realpath(dirname($fullPath)) ?: '', $realUploadDir) !== 0) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Akses ditolak: File di luar direktori aman.']);
        exit;
    }

    if (!file_exists($fullPath) || !is_file($fullPath)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'File tidak ditemukan di direktori project: ' . $baseName]);
        exit;
    }

    $deleted = @unlink($fullPath);
    if (!$deleted) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Gagal menghapus file dari disk server.']);
        exit;
    }

    // Bersihkan juga dari config/attachments.json jika file ini terpasang di karakter
    $configFile = __DIR__ . '/../config/attachments.json';
    if (file_exists($configFile)) {
        $cfgJson = @json_decode(file_get_contents($configFile), true);
        if ($cfgJson && isset($cfgJson['characters']) && is_array($cfgJson['characters'])) {
            $changed = false;
            foreach ($cfgJson['characters'] as $cKey => $atts) {
                if (is_array($atts)) {
                    $filtered = array_values(array_filter($atts, function($att) use ($baseName) {
                        $attUrl = isset($att['fileUrl']) ? basename($att['fileUrl']) : '';
                        $attFile = isset($att['fileName']) ? basename($att['fileName']) : '';
                        return ($attUrl !== $baseName && $attFile !== $baseName);
                    }));
                    if (count($filtered) !== count($atts)) {
                        $cfgJson['characters'][$cKey] = $filtered;
                        $changed = true;
                    }
                }
            }
            if ($changed) {
                @file_put_contents($configFile, json_encode($cfgJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            }
        }
    }

    echo json_encode([
        'success' => true,
        'message' => 'Berkas model 3D berhasil dihapus dari project.',
        'deletedFile' => $baseName
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// 1. GET: List file 3D yang tersedia di folder assets/attachments
if ($method === 'GET') {
    $files = [];
    if (is_dir($uploadDir)) {
        $entries = scandir($uploadDir);
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') continue;
            $fullPath = $uploadDir . '/' . $entry;
            if (is_file($fullPath)) {
                $ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
                if (in_array($ext, ['glb', 'gltf', 'fbx'])) {
                    $files[] = [
                        'fileName' => $entry,
                        'fileUrl' => 'assets/attachments/' . $entry,
                        'fileType' => $ext,
                        'fileSize' => filesize($fullPath),
                        'modifiedAt' => date('c', filemtime($fullPath))
                    ];
                }
            }
        }
    }
    echo json_encode([
        'success' => true,
        'count' => count($files),
        'files' => $files
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// 2. DELETE: Hapus file 3D fisik dari folder assets/attachments
if ($method === 'DELETE') {
    $rawInput = file_get_contents('php://input');
    $payload = @json_decode($rawInput, true) ?: [];
    $target = $payload['file'] ?? $payload['fileName'] ?? $payload['fileUrl'] ?? $_GET['file'] ?? $_GET['fileName'] ?? '';
    handleDeleteAttachmentFile($target, $uploadDir);
}

// 3. POST: Upload File 3D (.glb, .gltf, .fbx) atau Hapus via action=delete
if ($method === 'POST') {
    // Cek jika request adalah JSON POST untuk delete
    $rawInput = file_get_contents('php://input');
    if ($rawInput) {
        $jsonPayload = @json_decode($rawInput, true);
        if ($jsonPayload && isset($jsonPayload['action']) && $jsonPayload['action'] === 'delete') {
            $target = $jsonPayload['file'] ?? $jsonPayload['fileName'] ?? $jsonPayload['fileUrl'] ?? '';
            handleDeleteAttachmentFile($target, $uploadDir);
        }
    }

    if (empty($_FILES['file']) && empty($_FILES['attachment_file'])) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Tidak ada file 3D yang dikirim. Pastikan field form adalah "file".'
        ]);
        exit;
    }

    $fileInfo = $_FILES['file'] ?? $_FILES['attachment_file'];
    if ($fileInfo['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Gagal mengunggah file. Kode error upload: ' . $fileInfo['error']
        ]);
        exit;
    }

    $origName = basename($fileInfo['name']);
    $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
    $allowedExts = ['glb', 'gltf', 'fbx'];

    if (!in_array($ext, $allowedExts)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Format file tidak didukung. Harap upload file berekstensi .glb, .gltf, atau .fbx.'
        ]);
        exit;
    }

    // Buat nama file bersih dan unik
    $cleanBase = preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', pathinfo($origName, PATHINFO_FILENAME));
    $uniqueName = $cleanBase . '_' . substr(md5(uniqid(mt_rand(), true)), 0, 6) . '.' . $ext;
    $targetPath = $uploadDir . '/' . $uniqueName;

    if (!move_uploaded_file($fileInfo['tmp_name'], $targetPath)) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Gagal memindahkan file ke direktori tujuan assets/attachments/.'
        ]);
        exit;
    }

    $relativeUrl = 'assets/attachments/' . $uniqueName;

    echo json_encode([
        'success' => true,
        'message' => 'File 3D berhasil diunggah.',
        'fileName' => $origName,
        'savedName' => $uniqueName,
        'fileUrl' => $relativeUrl,
        'fileType' => $ext,
        'fileSize' => filesize($targetPath)
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);

