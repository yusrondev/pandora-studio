<?php
/**
 * Pandora Editor - Pembungkus APK Android untuk hasil Generate Game.
 * Dipakai export-game.php saat target "apk": build web disalin ke template WebView di
 * tools/android/template, lalu Gradle membuat APK rilis yang sudah ditandatangani.
 *
 * Toolchain (JDK 17, Android SDK, Gradle) dan keystore disimpan di luar project:
 *   <folder induk project>/pandora-android/toolchain/   (dipasang oleh tools/android/Setup-Android.bat)
 *   <folder induk project>/pandora-android/keystore/    (dibuat otomatis saat build APK pertama)
 */

const ANDROID_PLATFORM = 'android-34';
const ANDROID_BUILD_TOOLS = '34.0.0';
const ANDROID_WEBVIEW_HOST = 'appassets.androidplatform.net';
// File build web yang hanya berguna untuk hosting/PC, dan deploy/ berisi rahasia tanda tangan URL
const ANDROID_EXCLUDED_FILES = ['deploy', 'Deploy-ke-VPS.bat', 'Play.bat', 'play-server.ps1', 'play.sh', 'README.txt', 'pandora-build.json'];

function androidHome($root) {
    return dirname($root) . DIRECTORY_SEPARATOR . 'pandora-android';
}

/** Mengembalikan ['jdk', 'sdk', 'gradle', 'missing' => [...]]. */
function findAndroidToolchain($root) {
    $toolchain = androidHome($root) . '/toolchain';
    $result = ['jdk' => null, 'sdk' => null, 'gradle' => null, 'missing' => []];

    $jdkCandidates = glob($toolchain . '/jdk*', GLOB_ONLYDIR) ?: [];
    if (getenv('JAVA_HOME')) $jdkCandidates[] = rtrim(getenv('JAVA_HOME'), '\\/');
    foreach ($jdkCandidates as $dir) {
        // JRE saja tidak cukup: Gradle butuh javac
        if (is_file($dir . '/bin/javac.exe') || is_file($dir . '/bin/javac')) {
            $result['jdk'] = $dir;
            break;
        }
    }

    $sdkCandidates = [$toolchain . '/sdk'];
    foreach (['ANDROID_HOME', 'ANDROID_SDK_ROOT'] as $var) {
        if (getenv($var)) $sdkCandidates[] = rtrim(getenv($var), '\\/');
    }
    foreach ($sdkCandidates as $dir) {
        if (is_dir($dir . '/platforms/' . ANDROID_PLATFORM) && is_dir($dir . '/build-tools/' . ANDROID_BUILD_TOOLS)) {
            $result['sdk'] = $dir;
            break;
        }
    }

    foreach (glob($toolchain . '/gradle-*', GLOB_ONLYDIR) ?: [] as $dir) {
        if (glob($dir . '/lib/gradle-launcher-*.jar') || is_file($dir . '/bin/gradle.bat')) {
            $result['gradle'] = $dir;
            break;
        }
    }

    if (!$result['jdk']) $result['missing'][] = 'JDK 17';
    if (!$result['sdk']) $result['missing'][] = 'Android SDK (' . ANDROID_PLATFORM . ', build-tools ' . ANDROID_BUILD_TOOLS . ')';
    if (!$result['gradle']) $result['missing'][] = 'Gradle';
    return $result;
}

/** Nama task Gradle diterjemahkan agar pengguna paham tahap yang sedang berjalan. */
function androidTaskLabel($task) {
    $labels = [
        'mergeReleaseAssets' => 'Memasukkan aset game ke APK',
        'compressReleaseAssets' => 'Memadatkan aset game',
        'compileReleaseJavaWithJavac' => 'Mengompilasi kode Android',
        'dexBuilderRelease' => 'Mengonversi kode ke format Android',
        'mergeDexRelease' => 'Menggabungkan kode Android',
        'processReleaseResources' => 'Memproses resource (ikon, nama aplikasi)',
        'lintVitalRelease' => 'Memeriksa kesalahan umum',
        'lintVitalAnalyzeRelease' => 'Memeriksa kesalahan umum',
        'packageRelease' => 'Mengemas dan menandatangani APK',
        'assembleRelease' => 'Menyelesaikan APK'
    ];
    $name = substr($task, strrpos($task, ':') + 1);
    return 'Gradle: ' . ($labels[$name] ?? $name);
}

function androidToolchainHint($missing) {
    return 'Toolchain Android belum lengkap: ' . implode(', ', $missing)
        . '. Jalankan tools/android/Setup-Android.bat sekali (unduh ±1 GB), lalu ulangi Generate APK.';
}

/** applicationId unik per game, selalu nama paket Java yang sah. */
function androidApplicationId($slug) {
    $segment = preg_replace('/[^a-z0-9_]/', '_', strtolower($slug));
    $reserved = ['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null'];
    if (!preg_match('/^[a-z]/', $segment) || in_array($segment, $reserved, true)) $segment = 'g' . $segment;
    return 'com.pandora.' . $segment;
}

function androidXmlString($text) {
    $text = htmlspecialchars($text, ENT_QUOTES | ENT_XML1, 'UTF-8');
    // Resource string Android memperlakukan ' dan @/? di awal secara khusus
    $text = str_replace(['&apos;', '&#039;'], "\\'", $text);
    if (preg_match('/^[@?]/', $text)) $text = '\\' . $text;
    return $text;
}

/** Keystore rilis dibuat sekali lalu dipakai ulang: APK baru hanya bisa menimpa APK lama dengan kunci yang sama. */
function ensureAndroidKeystore($root, $jdk) {
    $dir = androidHome($root) . '/keystore';
    $file = $dir . '/pandora-release.jks';
    $metaFile = $dir . '/keystore.json';
    if (is_file($file) && is_file($metaFile)) {
        $meta = json_decode((string) file_get_contents($metaFile), true);
        if (!empty($meta['password'])) return ['file' => $file, 'alias' => $meta['alias'] ?? 'pandora', 'password' => $meta['password']];
    }
    if (!is_dir($dir)) mkdir($dir, 0777, true);
    $password = bin2hex(random_bytes(16));
    $alias = 'pandora';
    $keytool = $jdk . '/bin/keytool' . (DIRECTORY_SEPARATOR === '\\' ? '.exe' : '');
    $cmd = [$keytool, '-genkeypair', '-keystore', $file, '-alias', $alias, '-keyalg', 'RSA', '-keysize', '2048',
        '-validity', '10000', '-storepass', $password, '-keypass', $password, '-dname', 'CN=Pandora Studio, O=Pandora Studio'];
    $output = [];
    $status = runAndroidProcess($cmd, [], null, function ($line) use (&$output) { $output[] = $line; });
    if ($status !== 0 || !is_file($file)) fail('Gagal membuat keystore Android: ' . implode(' ', array_slice($output, -3)));
    file_put_contents($metaFile, json_encode([
        'alias' => $alias,
        'password' => $password,
        'createdAt' => date('c'),
        'note' => 'SIMPAN CADANGAN folder ini. Tanpa keystore yang sama, update APK di HP pemain atau Play Store tidak bisa dipasang.'
    ], JSON_PRETTY_PRINT));
    return ['file' => $file, 'alias' => $alias, 'password' => $password];
}

/** Menjalankan proses tanpa shell; setiap baris output diteruskan ke $onLine. */
function runAndroidProcess($cmd, $env, $cwd, $onLine) {
    $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['redirect', 1]];
    $fullEnv = $env ? array_merge(getenv(), $env) : null;
    $process = proc_open($cmd, $descriptors, $pipes, $cwd, $fullEnv);
    if (!is_resource($process)) return -1;
    fclose($pipes[0]);
    while (($line = fgets($pipes[1])) !== false) {
        $onLine(rtrim($line, "\r\n"));
    }
    fclose($pipes[1]);
    return proc_close($process);
}

function copyAndroidTemplate($from, $to) {
    if (!is_dir($to)) mkdir($to, 0777, true);
    foreach (scandir($from) as $item) {
        if ($item === '.' || $item === '..') continue;
        $src = $from . '/' . $item;
        $dst = $to . '/' . $item;
        if (is_dir($src)) {
            copyAndroidTemplate($src, $dst);
        } else {
            copy($src, $dst);
        }
    }
}

/**
 * Membungkus build web $dest menjadi APK.
 * $progress(value 0..1, label) dipanggil selama proses. Mengembalikan ['apk', 'sizeMB', 'applicationId', 'keystore'].
 */
function buildAndroidApk($root, $dest, $gameName, $buildsRoot, $progress) {
    $tools = findAndroidToolchain($root);
    if ($tools['missing']) fail(androidToolchainHint($tools['missing']));

    $slug = basename($dest);
    $work = $buildsRoot . '/.android/' . $slug;
    $progress(0.0, 'Menyiapkan project Android');

    // Template disalin ulang tiap build; folder .gradle dan build Gradle dipertahankan agar build berikutnya cepat
    copyAndroidTemplate($root . '/tools/android/template', $work);
    $assets = $work . '/app/src/main/assets/game';
    if (is_dir($assets)) removeTree($assets);
    mkdir($assets, 0777, true);
    copyTree($dest, $assets, ANDROID_EXCLUDED_FILES);

    $applicationId = androidApplicationId($slug);
    $versionCode = (int) floor((time() - 1700000000) / 60); // Naik setiap menit, jadi APK baru selalu bisa menimpa yang lama
    $versionName = date('Y.m.d.Hi');
    $gradleFile = $work . '/app/build.gradle';
    file_put_contents($gradleFile, str_replace(
        ['__APP_ID__', '__VERSION_CODE__', '__VERSION_NAME__'],
        [$applicationId, (string) $versionCode, $versionName],
        (string) file_get_contents($gradleFile)
    ));
    $stringsFile = $work . '/app/src/main/res/values/strings.xml';
    file_put_contents($stringsFile, str_replace('__APP_NAME__', androidXmlString($gameName), (string) file_get_contents($stringsFile)));
    file_put_contents($work . '/local.properties', 'sdk.dir=' . str_replace('\\', '/', $tools['sdk']) . "\n");

    $keystore = ensureAndroidKeystore($root, $tools['jdk']);

    $isWindows = DIRECTORY_SEPARATOR === '\\';
    $java = $tools['jdk'] . '/bin/java' . ($isWindows ? '.exe' : '');
    $gradleHome = androidHome($root) . '/gradle-home';
    $env = [
        'JAVA_HOME' => $tools['jdk'],
        'ANDROID_HOME' => $tools['sdk'],
        'ANDROID_SDK_ROOT' => $tools['sdk'],
        'GRADLE_USER_HOME' => $gradleHome,
        'PATH' => $tools['jdk'] . '/bin' . PATH_SEPARATOR . (getenv('PATH') ?: '')
    ];
    $args = [
        '-p', $work, 'assembleRelease', '--console=plain', '--no-daemon', '--stacktrace',
        '-Pandroid.injected.signing.store.file=' . $keystore['file'],
        '-Pandroid.injected.signing.store.password=' . $keystore['password'],
        '-Pandroid.injected.signing.key.alias=' . $keystore['alias'],
        '-Pandroid.injected.signing.key.password=' . $keystore['password']
    ];
    // Gradle dijalankan langsung lewat java (tanpa gradle.bat) agar argumen tidak diolah ulang oleh cmd.exe
    $launcher = glob($tools['gradle'] . '/lib/gradle-launcher-*.jar');
    if ($launcher) {
        $cmd = array_merge([$java, '-Xmx64m', '-Dorg.gradle.appname=gradle', '-classpath', $launcher[0], 'org.gradle.launcher.GradleMain'], $args);
    } else {
        $cmd = array_merge([$isWindows ? 'cmd.exe' : 'sh', $isWindows ? '/c' : '-c', $tools['gradle'] . '/bin/gradle' . ($isWindows ? '.bat' : '')], $args);
    }

    $progress(0.05, 'Gradle: memulai (build pertama mengunduh plugin Android, bisa beberapa menit)');
    $log = [];
    $tasks = 0;
    $expectedTasks = 55; // jumlah task assembleRelease AGP 8.5 untuk template ini
    $status = runAndroidProcess($cmd, $env, $work, function ($line) use (&$log, &$tasks, $expectedTasks, $progress) {
        $log[] = $line;
        if (count($log) > 60) array_shift($log);
        if (preg_match('/^> Task (:\S+)/', $line, $m)) {
            $tasks++;
            $progress(0.05 + 0.9 * min(1, $tasks / $expectedTasks), androidTaskLabel($m[1]));
        } elseif (stripos($line, 'Download') === 0) {
            $progress(0.05 + 0.9 * min(1, $tasks / $expectedTasks), 'Gradle: mengunduh dependensi');
        }
    });
    if ($status !== 0) {
        $errors = array_values(array_filter($log, function ($line) {
            return preg_match('/(error|failed|wrong|exception|cause)/i', $line);
        }));
        fail('Build APK gagal (Gradle kode ' . $status . '). ' . implode(' | ', array_slice($errors ?: $log, -6)));
    }

    $built = $work . '/app/build/outputs/apk/release/app-release.apk';
    if (!is_file($built)) fail('Gradle selesai tetapi APK tidak ditemukan di ' . $built);
    $apk = $buildsRoot . DIRECTORY_SEPARATOR . $slug . '.apk';
    if (!copy($built, $apk)) fail('Gagal menyalin APK ke ' . $apk);

    $progress(1.0, 'APK siap');
    return [
        'apk' => $apk,
        'sizeMB' => round(filesize($apk) / 1048576, 1),
        'applicationId' => $applicationId,
        'versionName' => $versionName,
        'keystore' => dirname($keystore['file'])
    ];
}
