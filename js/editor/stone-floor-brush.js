/* ===================================================================
   PANDORA CUSTOMIZABLE 3D FLOOR BRUSH MODULE
   - Ultra-Lightweight 3D model compression upon import (textures & geometry).
   - Real-time progress bar following project design (.generate-overlay).
   - In-project persistence (assets/imported/*.glb + config/floor-models.json).
   - Manages a library of 3D floor models (add, edit, delete, switch active).
   - Spawns modular 3D floor tiles in customizable grids (4x4, 2x2, 1x1).
   - Snaps to modular tile coordinates so multiple strokes align seamlessly.
   - Ensures the floor is always flat/horizontal so sculpted terrain
     naturally penetrates through the stone slabs / floor tiles.
   =================================================================== */

const DEFAULT_FLOOR_MODEL = {
    id: 'default_stone_floor',
    name: 'Batu Klasik (Garden)',
    file: 'assets/imported/69ab65c708bfc610331ef699.glb',
    baseName: 'stone_floor',
    scale: 0.00916018575191774,
    tileSize: 3.50, // 3.5m x 3.5m
    yOffset: 0.04,
    isBuiltin: true
};

const STORAGE_KEYS = {
    MODELS: 'pandora_floor_models_v2',
    ACTIVE_ID: 'pandora_active_floor_id_v2'
};

let floorModelsList = [];
let activeFloorModelId = DEFAULT_FLOOR_MODEL.id;

let stoneFloorGridSize = 4; // 4x4 default
let stoneFloorAlwaysFlat = true;
let activeFloorStrokeY = null;

const loadedModelsCache = new Map();
let isFloorModelLoading = false;

// Format ukuran byte ke string human-readable
function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Inisialisasi daftar model lantai dari server (config/floor-models.json) & localStorage
async function initFloorModelsStorage() {
    let hasBlob = false;
    // 1. Baca dari localStorage sebagai cache instan
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.MODELS);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                floorModelsList = parsed;
                floorModelsList.forEach(m => {
                    if (m && typeof m.file === 'string' && m.file.startsWith('blob:')) {
                        sanitizeFloorModelRecord(m);
                        hasBlob = true;
                    }
                });
            }
        }
    } catch (e) {
        console.warn('[StoneFloorBrush] Gagal membaca local storage model lantai:', e);
    }

    // Pastikan model default selalu ada di daftar
    const hasDefault = floorModelsList.some(m => m.id === DEFAULT_FLOOR_MODEL.id);
    if (!hasDefault) {
        floorModelsList.unshift({ ...DEFAULT_FLOOR_MODEL });
    }

    try {
        const savedActive = localStorage.getItem(STORAGE_KEYS.ACTIVE_ID);
        if (savedActive && floorModelsList.some(m => m.id === savedActive)) {
            activeFloorModelId = savedActive;
        } else {
            activeFloorModelId = DEFAULT_FLOOR_MODEL.id;
        }
    } catch (e) {
        activeFloorModelId = DEFAULT_FLOOR_MODEL.id;
    }

    if (hasBlob) {
        saveFloorModelsStorage(false);
    }

    // 2. Sinkronkan dengan file project di server: config/floor-models.json
    try {
        const res = await fetch('api/floor-models.php');
        if (res.ok) {
            const json = await res.json();
            if (json && Array.isArray(json.models) && json.models.length > 0) {
                floorModelsList = json.models;
                floorModelsList.forEach(m => sanitizeFloorModelRecord(m));
                if (json.activeId && floorModelsList.some(m => m.id === json.activeId)) {
                    activeFloorModelId = json.activeId;
                }
                saveFloorModelsStorage(false); // Simpan ke local cache tanpa post ulang
                renderFloorModelsUI();
                syncActiveModelParamsUI();
                updateStoneFloorCountUI();
            }
        }
    } catch (err) {
        console.warn('[StoneFloorBrush] Gagal fetch config/floor-models.json:', err);
    }
}

// Sanitasi record model jika terdapat URL blob sementara yang sudah kadaluarsa
function sanitizeFloorModelRecord(m) {
    if (!m) return m;
    if (typeof m.file === 'string' && m.file.startsWith('blob:')) {
        console.warn(`[StoneFloorBrush] Terdeteksi URL blob mati "${m.file}" pada model "${m.name}". Mengalihkan ke file permanen project.`);
        m.file = DEFAULT_FLOOR_MODEL.file;
    }
    return m;
}

// Simpan daftar model ke localStorage dan server config/floor-models.json
async function saveFloorModelsStorage(syncServer = true) {
    try {
        localStorage.setItem(STORAGE_KEYS.MODELS, JSON.stringify(floorModelsList));
        localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, activeFloorModelId);
    } catch (e) {
        console.warn('[StoneFloorBrush] Gagal menyimpan storage model lantai:', e);
    }

    if (syncServer) {
        try {
            await fetch('api/floor-models.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    activeId: activeFloorModelId,
                    models: floorModelsList
                })
            });
        } catch (err) {
            console.warn('[StoneFloorBrush] Gagal menyimpan ke api/floor-models.php:', err);
        }
    }
}

// Dapatkan model lantai aktif
function getActiveFloorModel() {
    const found = floorModelsList.find(m => m.id === activeFloorModelId);
    return found || floorModelsList[0] || DEFAULT_FLOOR_MODEL;
}

// Ganti model lantai aktif
async function setActiveFloorModel(id) {
    const model = floorModelsList.find(m => m.id === id);
    if (!model) return;
    activeFloorModelId = id;
    saveFloorModelsStorage(true);
    renderFloorModelsUI();
    syncActiveModelParamsUI();
    updateStoneFloorCountUI();
    await preloadFloorModel(model);
    if (typeof updateBrushReticle === 'function' && window.brushReticleGroup && window.brushReticleGroup.visible) {
        // Trigger pembaruan reticle kuas
    }
}

// Tambah model baru ke koleksi
function addFloorModel(modelObj) {
    if (!modelObj || !modelObj.file) return;
    floorModelsList.push(modelObj);
    activeFloorModelId = modelObj.id;
    saveFloorModelsStorage(true);
    renderFloorModelsUI();
    syncActiveModelParamsUI();
    updateStoneFloorCountUI();
}

// Perbarui parameter model aktif (scale, tileSize, yOffset, name)
function updateActiveModelParams(partialProps) {
    const active = getActiveFloorModel();
    if (!active) return;
    Object.assign(active, partialProps);
    saveFloorModelsStorage(true);
    renderFloorModelsUI();
    syncActiveModelParamsUI();
    updateStoneFloorCountUI();
}

// Hapus model dari koleksi
function deleteFloorModel(id) {
    if (id === DEFAULT_FLOOR_MODEL.id) {
        alert('Model bawaan "Batu Klasik" tidak dapat dihapus.');
        return false;
    }
    const idx = floorModelsList.findIndex(m => m.id === id);
    if (idx === -1) return false;

    const item = floorModelsList[idx];
    if (!confirm(`Hapus model "${item.name}" dari koleksi kuas lantai?`)) {
        return false;
    }

    floorModelsList.splice(idx, 1);
    if (activeFloorModelId === id) {
        activeFloorModelId = DEFAULT_FLOOR_MODEL.id;
    }
    saveFloorModelsStorage(true);
    renderFloorModelsUI();
    syncActiveModelParamsUI();
    updateStoneFloorCountUI();
    return true;
}

// Preload model GLB ke cache
async function preloadFloorModel(model = null) {
    const targetModel = model || getActiveFloorModel();
    if (!targetModel || !targetModel.file) return null;

    // Self-healing jika URL blob sementara tersimpan
    if (typeof targetModel.file === 'string' && targetModel.file.startsWith('blob:')) {
        sanitizeFloorModelRecord(targetModel);
        saveFloorModelsStorage(true);
    }

    if (loadedModelsCache.has(targetModel.file)) {
        return loadedModelsCache.get(targetModel.file);
    }

    if (isFloorModelLoading) {
        while (isFloorModelLoading) {
            await new Promise(r => setTimeout(r, 50));
        }
        return loadedModelsCache.get(targetModel.file);
    }

    isFloorModelLoading = true;
    try {
        if (window.PandoraImportedObjects) {
            const data = await PandoraImportedObjects.loadModel(targetModel.file);
            if (data && data.scene) {
                loadedModelsCache.set(targetModel.file, data);
                return data;
            }
        }
    } catch (err) {
        console.error('[StoneFloorBrush] Gagal memuat model 3D lantai:', err);
    } finally {
        isFloorModelLoading = false;
    }
    return loadedModelsCache.get(targetModel.file) || null;
}

// ===================================================================
// PROGRESS DIALOG SYSTEM (Mengikuti gaya .generate-dialog project ini)
// ===================================================================
function showFloorImportProgressDialog(title, stages = null) {
    const overlay = document.createElement('div');
    overlay.className = 'generate-overlay';
    overlay.innerHTML = `
        <div class="generate-dialog" role="dialog" aria-modal="true" style="width:min(480px, calc(100vw - 32px));">
            <div class="generate-dialog-title" style="display:flex; align-items:center; justify-content:space-between;">
                <span>${title}</span>
                <span style="font-size:10px; font-weight:600; color:#38bdf8; background:rgba(56,189,248,0.15); padding:2px 6px; border-radius:3px;">
                    Ultra-Lightweight
                </span>
            </div>
            <div class="generate-dialog-body">
                <div class="generate-bar"><i></i><b></b><span>0%</span></div>
                <div class="generate-meta">
                    <span class="generate-step"></span>
                    <span class="generate-time">0:00</span>
                </div>
                <div class="generate-label" style="margin-top:6px; font-weight:500;">Memulai proses...</div>
                <div class="generate-hint" hidden style="margin-top:6px; font-size:10.5px; color:#f59e0b;">
                    Sedang memproses kompresi tekstur & poligon. Jangan tutup halaman ini.
                </div>
                <div class="generate-result" hidden style="margin-top:10px; padding:8px 10px; background:rgba(0,0,0,0.3); border-radius:4px; border:1px solid #334155; line-height:1.5; font-size:11px;"></div>
            </div>
            <div class="generate-dialog-actions" hidden style="padding:8px 12px; border-top:1px solid var(--bl-line, #333); display:flex; justify-content:flex-end; gap:8px;">
                <button type="button" id="btn-dialog-close-action" class="blender-btn blender-btn-primary" style="padding:5px 14px; font-size:11px;">
                    Selesai & Gunakan Model
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const bar = overlay.querySelector('.generate-bar');
    const fill = bar.querySelector('i');
    const percent = bar.querySelector('span');
    const label = overlay.querySelector('.generate-label');
    const result = overlay.querySelector('.generate-result');
    const actions = overlay.querySelector('.generate-dialog-actions');
    const stepEl = overlay.querySelector('.generate-step');
    const timeEl = overlay.querySelector('.generate-time');
    const hint = overlay.querySelector('.generate-hint');

    const startedAt = Date.now();
    let lastUpdate = startedAt;
    const formatTime = (ms) => {
        const total = Math.floor(ms / 1000);
        return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
    };
    const timer = setInterval(() => {
        const now = Date.now();
        timeEl.textContent = formatTime(now - startedAt);
        hint.hidden = (now - lastUpdate < 10000);
    }, 1000);

    const showStep = (val) => {
        if (!stages || stages.length === 0) return;
        const found = stages.findIndex(s => val < s.until);
        const idx = found < 0 ? stages.length - 1 : found;
        const currentStage = stages[idx];
        stepEl.textContent = `Tahap ${idx + 1}/${stages.length} · ${currentStage.name}`;
    };
    showStep(0);

    const update = (val, text) => {
        const pct = Math.min(100, Math.max(0, Math.round(val * 100)));
        fill.style.width = pct + '%';
        percent.textContent = pct + '%';
        if (text) label.textContent = text;
        showStep(val);
        lastUpdate = Date.now();
    };

    const finish = (lines, onCloseCallback = null) => {
        clearInterval(timer);
        update(1.0, 'Kompresi & Simpan Project Selesai!');
        bar.classList.add('done');
        hint.hidden = true;
        result.hidden = false;
        result.innerHTML = '';
        lines.forEach(l => {
            const div = document.createElement('div');
            div.textContent = l;
            if (l.includes('Hemat') || l.includes('Lebih Ringan') || l.includes('Optimal')) {
                div.style.color = '#4ade80';
                div.style.fontWeight = '600';
            }
            result.appendChild(div);
        });
        actions.hidden = false;
        const btnClose = overlay.querySelector('#btn-dialog-close-action');
        if (btnClose) {
            btnClose.onclick = () => {
                overlay.remove();
                if (typeof onCloseCallback === 'function') onCloseCallback();
            };
            btnClose.focus();
        }
    };

    const fail = (msg) => {
        clearInterval(timer);
        bar.classList.add('failed');
        label.textContent = 'Gagal memproses model 3D';
        result.hidden = false;
        result.textContent = '';
        const err = document.createElement('div');
        err.className = 'generate-error-text';
        err.style.cssText = 'color:#ef4444; font-weight:600;';
        err.textContent = String(msg || 'Kesalahan tidak diketahui');
        result.appendChild(err);
        actions.hidden = false;
        const btnClose = overlay.querySelector('#btn-dialog-close-action');
        if (btnClose) {
            btnClose.textContent = 'Tutup';
            btnClose.onclick = () => overlay.remove();
        }
    };

    return {
        update,
        finish,
        fail,
        close: () => {
            clearInterval(timer);
            overlay.remove();
        }
    };
}

// ===================================================================
// ULTRA-LIGHTWEIGHT 3D ASSET COMPRESSION PIPELINE
// Downscales large 4K/2K textures to 1024px WebP/JPEG,
// strips redundant vertex attributes, cleans up geometry,
// and exports into compact binary GLB ArrayBuffer.
// ===================================================================

// Kompresi satu tekstur ke resolusi optimal (max 1024px) via Canvas
async function compressTextureImage(texture, isNormalMap = false, maxDimension = 1024, keepAlpha = false) {
    if (!texture || !texture.image) return false;
    const img = texture.image;
    const w = img.width || img.naturalWidth || 0;
    const h = img.height || img.naturalHeight || 0;
    if (!w || !h) return false;

    // GLTFExporter menulis PNG untuk RGBAFormat dan JPEG untuk RGBFormat. Tekstur tanpa alfa
    // (termasuk normal map) cukup JPEG: PNG 1024px bisa 1-2 MB, JPEG ~150-300 KB.
    if (!keepAlpha) texture.format = THREE.RGBFormat;

    // Jika sudah kecil (misal <= 1024px) dan bukan canvas mentah, lewatkan
    if (w <= maxDimension && h <= maxDimension) {
        return !keepAlpha;
    }

    const scale = Math.min(1.0, maxDimension / Math.max(w, h));
    const targetW = Math.max(16, Math.round(w * scale));
    const targetH = Math.max(16, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Normal map JPEG kualitas tinggi supaya arah normal tidak bergerigi; warna & PBR 0.85
    const mime = keepAlpha ? 'image/png' : 'image/jpeg';
    const quality = isNormalMap ? 0.95 : 0.85;

    const dataUrl = canvas.toDataURL(mime, quality);
    const newImg = new Image();
    await new Promise((resolve) => {
        newImg.onload = resolve;
        newImg.onerror = resolve;
        newImg.src = dataUrl;
    });

    texture.image = newImg;
    texture.needsUpdate = true;
    texture.generateMipmaps = true;
    return true;
}

// Optimasi seluruh tekstur yang terpasang di material scene
async function compressAllSceneTextures(scene, onProgress = null) {
    const texturesToCompress = [];
    scene.traverse((child) => {
        if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
                const hasAlpha = !!(mat.transparent || mat.alphaTest > 0);
                if (mat.map) texturesToCompress.push({ tex: mat.map, isNormal: false, keepAlpha: hasAlpha });
                if (mat.alphaMap) texturesToCompress.push({ tex: mat.alphaMap, isNormal: false });
                if (mat.normalMap) texturesToCompress.push({ tex: mat.normalMap, isNormal: true });
                if (mat.roughnessMap) texturesToCompress.push({ tex: mat.roughnessMap, isNormal: false });
                if (mat.metalnessMap) texturesToCompress.push({ tex: mat.metalnessMap, isNormal: false });
                if (mat.aoMap) texturesToCompress.push({ tex: mat.aoMap, isNormal: false });
                if (mat.emissiveMap) texturesToCompress.push({ tex: mat.emissiveMap, isNormal: false });
            });
        }
    });

    // Hilangkan duplikat tekstur yang sama
    const unique = [];
    const seen = new Set();
    texturesToCompress.forEach(item => {
        if (item.tex && !seen.has(item.tex)) {
            seen.add(item.tex);
            unique.push(item);
        }
    });

    let compressedCount = 0;
    for (let i = 0; i < unique.length; i++) {
        const item = unique[i];
        try {
            const did = await compressTextureImage(item.tex, item.isNormal, 1024, !!item.keepAlpha);
            if (did) compressedCount++;
        } catch (e) {
            console.warn('[StoneFloorBrush] Gagal kompresi tekstur:', e);
        }
        if (typeof onProgress === 'function') {
            onProgress((i + 1) / unique.length);
        }
    }
    return { total: unique.length, compressed: compressedCount };
}

// Konversi BufferAttribute bertipe non-Float32 (misal Int8Array/Int16Array dari KHR_mesh_quantization) ke Float32Array standar.
// Atribut hasil meshopt/quantization sering interleaved (mis. normal Int8 dengan stride 4 byte), jadi elemen dibaca
// lewat stride + offset, bukan urutan array mentah. Membaca array mentah mengacak normal (bercak gelap/terang).
function convertAttributeToFloat32(attr) {
    if (!attr) return attr;
    const interleaved = !!attr.isInterleavedBufferAttribute;
    const src = interleaved ? attr.data.array : attr.array;
    if (!src) return attr;
    if (!interleaved && src instanceof Float32Array) return attr;

    const itemSize = attr.itemSize;
    const stride = interleaved ? attr.data.stride : itemSize;
    const offset = interleaved ? attr.offset : 0;
    const count = attr.count;
    const out = new Float32Array(count * itemSize);

    let denom = 1.0;
    if (attr.normalized) {
        if (src instanceof Int8Array) denom = 127.0;
        else if (src instanceof Uint8Array) denom = 255.0;
        else if (src instanceof Int16Array) denom = 32767.0;
        else if (src instanceof Uint16Array) denom = 65535.0;
    }
    for (let i = 0; i < count; i++) {
        const base = i * stride + offset;
        for (let c = 0; c < itemSize; c++) {
            const v = src[base + c] / denom;
            out[i * itemSize + c] = attr.normalized ? Math.max(-1.0, v) : v;
        }
    }
    return new THREE.BufferAttribute(out, itemSize, false);
}

// Susun ulang atribut agar hanya berisi vertex yang direferensikan index (urutan pertama dipakai)
function compactUnusedVertices(geo) {
    const index = geo.index.array;
    const vertexCount = geo.attributes.position ? geo.attributes.position.count : 0;
    if (!vertexCount) return;
    const remap = new Int32Array(vertexCount).fill(-1);
    let used = 0;
    for (let i = 0; i < index.length; i++) {
        if (remap[index[i]] === -1) remap[index[i]] = used++;
    }
    if (used === vertexCount) return;
    for (const key in geo.attributes) {
        const attr = geo.attributes[key];
        const size = attr.itemSize;
        const out = new attr.array.constructor(used * size);
        for (let v = 0; v < vertexCount; v++) {
            const nv = remap[v];
            if (nv < 0) continue;
            for (let c = 0; c < size; c++) out[nv * size + c] = attr.array[v * size + c];
        }
        geo.setAttribute(key, new THREE.BufferAttribute(out, size, attr.normalized));
    }
    const newIndex = used > 65535 ? new Uint32Array(index.length) : new Uint16Array(index.length);
    for (let i = 0; i < index.length; i++) newIndex[i] = remap[index[i]];
    geo.setIndex(new THREE.BufferAttribute(newIndex, 1));
    geo.clearGroups();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
}

// Bersihkan atribut geometri yang berlebih, lakukan simplifikasi poligon jika terlalu berat, dan hitung statistik mesh
async function optimizeSceneGeometry(scene, targetMaxTriangles = 20000) {
    if (typeof window !== 'undefined' && window.MeshoptSimplifier && window.MeshoptSimplifier.ready) {
        try {
            await window.MeshoptSimplifier.ready;
        } catch (e) {
            console.warn('[StoneFloorBrush] MeshoptSimplifier ready wait warning:', e);
        }
    }
    const simplifier = (typeof window !== 'undefined' && window.MeshoptSimplifier) ? window.MeshoptSimplifier : null;

    let vertexCount = 0;
    let triangleCount = 0;
    let meshCount = 0;
    let simplifiedMeshCount = 0;

    scene.traverse((child) => {
        if (child.isMesh && child.geometry) {
            meshCount++;
            const geo = child.geometry;

            // Bersihkan morph targets / skinning jika model ini ubin statis
            geo.morphAttributes = {}; // dikosongkan, bukan dihapus: three membaca morphAttributes.position
            if (geo.attributes.skinIndex) delete geo.attributes.skinIndex;
            if (geo.attributes.skinWeight) delete geo.attributes.skinWeight;

            // Hapus atribut custom yang tidak esensial
            for (const key in geo.attributes) {
                if (!['position', 'normal', 'uv', 'uv2', 'color'].includes(key)) {
                    delete geo.attributes[key];
                }
            }

            // Normalisasikan semua vertex attributes ke Float32Array agar GLTFExporter kompatibel
            for (const key in geo.attributes) {
                geo.attributes[key] = convertAttributeToFloat32(geo.attributes[key]);
            }

            // Pastikan normals valid
            if (!geo.attributes.normal) {
                geo.computeVertexNormals();
            }

            // Pastikan geometry memiliki index
            let currentTris = 0;
            if (geo.index) {
                currentTris = Math.floor(geo.index.count / 3);
            } else if (geo.attributes.position) {
                currentTris = Math.floor(geo.attributes.position.count / 3);
                const posLen = geo.attributes.position.count;
                const idx = posLen > 65535 ? new Uint32Array(posLen) : new Uint16Array(posLen);
                for (let i = 0; i < posLen; i++) idx[i] = i;
                geo.setIndex(new THREE.BufferAttribute(idx, 1));
            }

            // Poligon Simplifier (Mesh Decimation): jika mesh memiliki segitiga melebihi targetMaxTriangles
            if (simplifier && simplifier.supported && geo.index && currentTris > targetMaxTriangles) {
                try {
                    const posAttr = geo.attributes.position;
                    const positions = new Float32Array(posAttr.count * 3);
                    for (let i = 0; i < posAttr.count; i++) {
                        positions[i * 3] = posAttr.getX(i);
                        positions[i * 3 + 1] = posAttr.getY(i);
                        positions[i * 3 + 2] = posAttr.getZ(i);
                    }
                    const indices = new Uint32Array(geo.index.array);
                    const targetIndexCount = targetMaxTriangles * 3;

                    let [result] = simplifier.simplify(indices, positions, 3, targetIndexCount, 0.05, ['LockBorder']);
                    if ((!result || result.length / 3 > targetMaxTriangles * 1.5) && simplifier.simplifySloppy) {
                        result = simplifier.simplifySloppy(indices, positions, 3, targetIndexCount, 0.15)[0];
                    }

                    if (result && result.length >= 3) {
                        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(result), 1));
                        simplifiedMeshCount++;
                    }
                } catch (decErr) {
                    console.warn('[StoneFloorBrush] Gagal decimate mesh:', decErr);
                }
            }

            // Buang vertex yang tidak lagi dipakai index. Tanpa ini simplifikasi hanya memangkas segitiga,
            // dan seluruh vertex asli (bisa jutaan) tetap ikut ter-export.
            if (geo.index) compactUnusedVertices(geo);

            // Normalisasikan index array ke Uint16 / Uint32
            if (geo.index && geo.index.array) {
                const idxArr = geo.index.array;
                if (!(idxArr instanceof Uint16Array) && !(idxArr instanceof Uint32Array)) {
                    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idxArr), 1));
                }
            }

            if (geo.attributes.position) {
                vertexCount += geo.attributes.position.count;
            }
            if (geo.index) {
                triangleCount += Math.floor(geo.index.count / 3);
            } else if (geo.attributes.position) {
                triangleCount += Math.floor(geo.attributes.position.count / 3);
            }
        }
    });

    return { vertexCount, triangleCount, meshCount, simplifiedMeshCount };
}

// Export Three.js Scene ke Binary GLB (ArrayBuffer) via THREE.GLTFExporter
async function exportSceneToGLB(scene) {
    if (typeof THREE.GLTFExporter === 'undefined') {
        return null;
    }
    try {
        const exporter = new THREE.GLTFExporter();
        return await new Promise((resolve) => {
            try {
                // three r128: parse(input, onDone, options), tanpa callback error. Fungsi tambahan di posisi
                // ketiga dulu membuat semua opsi terabaikan (hasil JSON, bukan GLB) dan file mentah yang tersimpan.
                exporter.parse(
                    scene,
                    (result) => {
                        if (result instanceof ArrayBuffer) {
                            resolve(result);
                        } else if (result instanceof Uint8Array) {
                            resolve(result.buffer);
                        } else {
                            console.warn('[StoneFloorBrush] GLTFExporter tidak menghasilkan binary GLB');
                            resolve(null);
                        }
                    },
                    {
                        binary: true,
                        truncateDrawRange: true,
                        onlyVisible: false,
                        maxTextureSize: 1024
                    }
                );
            } catch (err) {
                console.warn('[StoneFloorBrush] exporter.parse synchronous catch:', err);
                resolve(null);
            }
        });
    } catch (err) {
        console.warn('[StoneFloorBrush] exportSceneToGLB warning:', err);
        return null;
    }
}

// Upload file GLB ke server (assets/imported/), per potongan supaya tidak terbentur batas unggah PHP
function uploadModelFileBuffer(arrayBuffer, onProgress) {
    return window.PandoraModelUpload.upload(arrayBuffer, onProgress);
}

// Import file 3D GLB/GLTF baru dengan kompresi ultra-ringan dan progress bar
async function importCustomFloorGLB(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'glb' && ext !== 'gltf') {
        alert('Harap pilih file berformat .GLB atau .GLTF');
        return;
    }

    const stages = [
        { until: 0.25, name: 'Membaca & Analisis Model 3D' },
        { until: 0.55, name: 'Kompresi Tekstur (WebP/JPEG 1024px)' },
        { until: 0.80, name: 'Optimasi Poligon & Geometri' },
        { until: 1.00, name: 'Export Binary GLB & Simpan Project' }
    ];

    const dialog = showFloorImportProgressDialog('Import & Kompresi Model 3D Lantai', stages);
    const originalBytes = file.size;

    try {
        dialog.update(0.08, `Membaca file "${file.name}" (${formatBytes(originalBytes)})...`);

        const rawBuffer = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });

        dialog.update(0.20, 'Mengurai struktur model 3D...');

        const loader = (window.PandoraImportedObjects && PandoraImportedObjects.getLoader)
            ? PandoraImportedObjects.getLoader()
            : new THREE.GLTFLoader();

        if (window.MeshoptDecoder && loader.setMeshoptDecoder) {
            await window.MeshoptDecoder.ready;
            loader.setMeshoptDecoder(window.MeshoptDecoder);
        }

        const gltf = await new Promise((resolve, reject) => {
            loader.parse(rawBuffer, '', resolve, reject);
        });

        const modelScene = gltf.scene;
        if (!modelScene) {
            throw new Error('File GLB tidak memiliki scene yang valid.');
        }

        // TAHAP 2: Kompresi Tekstur
        dialog.update(0.30, 'Menganalisis dan mengompresi tekstur...');
        const texResult = await compressAllSceneTextures(modelScene, (ratio) => {
            dialog.update(0.30 + ratio * 0.25, `Mengompresi tekstur (${Math.round(ratio * 100)}%)...`);
        });

        // TAHAP 3: Optimasi Geometri & Poligon (Mesh Decimation ke <= 20.000 triangles)
        dialog.update(0.60, 'Mengompresi poligon & membersihkan geometri...');
        const geoResult = await optimizeSceneGeometry(modelScene, 20000);

        // Hitung Bounding Box & Ukuran Ubin Otomatis
        const bbox = new THREE.Box3().setFromObject(modelScene);
        const size = bbox.getSize(new THREE.Vector3());
        const maxHoriz = Math.max(size.x, size.z);

        let autoScale = 1.0;
        let autoTileSize = 3.50;

        if (maxHoriz > 15.0) {
            autoScale = Math.round((3.50 / maxHoriz) * 100000) / 100000;
            autoTileSize = 3.50;
        } else if (maxHoriz < 0.3) {
            autoScale = Math.round((2.0 / maxHoriz) * 100000) / 100000;
            autoTileSize = 2.0;
        } else {
            autoScale = 1.0;
            autoTileSize = Math.max(0.5, Math.round(maxHoriz * 100) / 100);
        }

        // TAHAP 4: Export Binary GLB & Simpan Project
        dialog.update(0.82, 'Membuat file Binary GLB yang ringkas...');
        let finalBuffer = null;
        try {
            finalBuffer = await exportSceneToGLB(modelScene);
        } catch (e) {
            console.warn('[StoneFloorBrush] Gagal export GLB teroptimasi, fallback ke raw buffer:', e);
        }
        let exportNote = '';
        if (!finalBuffer) {
            finalBuffer = rawBuffer; // Fallback jika GLTFExporter tidak tersedia atau gagal
            exportNote = '⚠️ Export GLB teroptimasi gagal, file asli yang disimpan (lihat console)';
        } else if (finalBuffer.byteLength >= rawBuffer.byteLength) {
            finalBuffer = rawBuffer; // Hasil optimasi tidak lebih kecil: simpan yang asli
            exportNote = 'ℹ️ File asli sudah lebih ringkas dari hasil optimasi, file asli yang disimpan';
        }
        const finalBytes = finalBuffer.byteLength;

        dialog.update(0.92, 'Menyimpan file 3D ke folder project (assets/imported/)...');
        const storedFilePath = await uploadModelFileBuffer(finalBuffer, (p) => {
            dialog.update(0.92 + p * 0.04, `Menyimpan file 3D ke folder project (assets/imported/)... ${Math.round(p * 100)}%`);
        });

        dialog.update(0.96, 'Menyimpan ke konfigurasi project (config/floor-models.json)...');

        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' ');
        const baseSlug = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

        const newRecord = {
            id: `floor_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            name: cleanName || 'Lantai 3D Kustom',
            file: storedFilePath,
            baseName: baseSlug || 'custom_floor',
            scale: autoScale,
            tileSize: autoTileSize,
            yOffset: 0.04,
            isBuiltin: false,
            originalBytes,
            compressedBytes: finalBytes,
            triangles: geoResult.triangleCount
        };

        // Cache model di memory agar langsung siap di-spawn
        loadedModelsCache.set(storedFilePath, {
            scene: modelScene,
            animations: gltf.animations || []
        });

        addFloorModel(newRecord);

        // Hitung persentase penghematan
        const savingsPct = originalBytes > 0
            ? Math.max(0, Math.round((1 - finalBytes / originalBytes) * 1000) / 10)
            : 0;

        const summaryLines = [
            `✅ Model 3D berhasil dikompresi & disimpan ke project!`,
            `📦 Ukuran: ${formatBytes(originalBytes)} → ${formatBytes(finalBytes)} (Hemat ${savingsPct}% Lebih Ringan)`,
            `🖼️ Tekstur: ${texResult.total} tekstur dioptimalkan (Maksimal 1024px)`,
            `📐 Poligon: ${geoResult.triangleCount.toLocaleString()} triangles (${geoResult.meshCount} mesh${geoResult.simplifiedMeshCount > 0 ? `, ${geoResult.simplifiedMeshCount} disederhanakan via Meshopt` : ''})`,
            `📁 File Model: ${storedFilePath}`,
            `💾 Konfigurasi: Tersimpan permanen di config/floor-models.json`
        ];
        if (exportNote) summaryLines.splice(1, 0, exportNote);

        dialog.finish(summaryLines);

    } catch (err) {
        console.error('[StoneFloorBrush] Gagal import & kompresi:', err);
        dialog.fail('Terjadi kesalahan: ' + err.message);
    }
}

// Buka dialog untuk memilih model 3D dari object yang sudah ada di map / scene
function pickModelFromSceneObjects() {
    const list = window.importedObjectsList || (window.PandoraImportedObjects ? PandoraImportedObjects.list() : []);
    const available = [];
    const seenFiles = new Set();

    list.forEach(item => {
        if (item && item.file && !seenFiles.has(item.file)) {
            seenFiles.add(item.file);
            available.push(item);
        }
    });

    if (available.length === 0) {
        alert('Belum ada objek 3D impor di map ini. Silakan gunakan tombol "+ Import GLB Baru".');
        return;
    }

    let menu = 'Pilih objek 3D dari map untuk dijadikan model lantai modular:\n\n';
    available.forEach((item, i) => {
        menu += `${i + 1}. ${item.name} (${item.file})\n`;
    });
    menu += `\nKetik nomor pilihan (1 - ${available.length}):`;

    const choice = prompt(menu, '1');
    if (!choice) return;
    const idx = parseInt(choice, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= available.length) {
        alert('Pilihan tidak valid.');
        return;
    }

    const selectedItem = available[idx];
    const existing = floorModelsList.find(m => m.file === selectedItem.file);
    if (existing) {
        setActiveFloorModel(existing.id);
        alert(`Model "${existing.name}" sudah ada di koleksi dan kini diaktifkan.`);
        return;
    }

    const cleanName = selectedItem.name.replace(/\.\d{3}$/, '').replace(/[-_]/g, ' ');
    const baseSlug = selectedItem.name.replace(/\.\d{3}$/, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const size = selectedItem.baseSize || { x: 3.5, y: 0.5, z: 3.5 };
    const maxHoriz = Math.max(size.x, size.z);
    const scale = selectedItem.scale || 1.0;
    const autoTileSize = Math.max(0.5, Math.round(maxHoriz * scale * 100) / 100);

    const newRecord = {
        id: `floor_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: cleanName || 'Lantai dari Map',
        file: selectedItem.file,
        baseName: baseSlug || 'floor_map',
        scale: scale,
        tileSize: autoTileSize,
        yOffset: 0.04,
        isBuiltin: false
    };

    addFloorModel(newRecord);
    alert(`Model "${newRecord.name}" berhasil ditambahkan ke koleksi kuas lantai & disimpan ke project!`);
}

// Reset stroke saat mouseup / pointerup agar klik berikutnya bisa menyesuaikan elevasi baru
function resetStoneFloorStroke() {
    activeFloorStrokeY = null;
}

// Cek apakah suatu imported object adalah ubin lantai (dari salah satu model terdaftar)
function isFloorTileObject(item) {
    if (!item || !item.name || !item.root) return false;
    if (item.userData && item.userData.isFloorTile) return true;
    return floorModelsList.some(m => {
        if (m.baseName && item.name.startsWith(m.baseName)) return true;
        if (m.file && item.file === m.file) return true;
        return false;
    });
}

// Hitung jumlah ubin lantai di scene saat ini
function getStoneFloorCount(onlyActive = false) {
    const list = window.importedObjectsList || (window.PandoraImportedObjects ? PandoraImportedObjects.list() : []);
    if (!onlyActive) {
        return list.filter(isFloorTileObject).length;
    }
    const active = getActiveFloorModel();
    return list.filter(item => {
        if (!item || !item.name) return false;
        if (item.userData && item.userData.floorModelId === active.id) return true;
        return item.name.startsWith(active.baseName) || (active.file && item.file === active.file);
    }).length;
}

// Perbarui badge jumlah lantai di UI
function updateStoneFloorCountUI() {
    const badge = document.getElementById('val-stone-floor-count');
    if (badge) {
        const activeCount = getStoneFloorCount(true);
        const totalCount = getStoneFloorCount(false);
        const active = getActiveFloorModel();
        badge.textContent = `${activeCount} ubin · ${totalCount} total`;
        badge.title = `${activeCount} ubin ${active.name}, total ${totalCount} ubin lantai di map`;
    }
}

// Render list model 3D di UI panel kuas jalan (outliner gaya Blender)
const FLOOR_ROW_ICON_CUBE = '<svg class="bl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
const FLOOR_ROW_ICON_TRASH = '<svg class="bl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

function renderFloorModelsUI() {
    const container = document.getElementById('floor-models-list');
    if (!container) return;
    container.textContent = '';

    if (floorModelsList.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'floor-lib-empty';
        empty.textContent = 'Belum ada model lantai. Klik Import GLB di atas.';
        container.appendChild(empty);
        return;
    }

    const span = (cls, text) => {
        const el = document.createElement('span');
        el.className = cls;
        if (text !== undefined) el.textContent = text;
        return el;
    };

    floorModelsList.forEach(model => {
        const isActive = (model.id === activeFloorModelId);
        const count = getTileCountForModel(model);

        const row = document.createElement('div');
        row.className = 'floor-lib-row' + (isActive ? ' selected' : '');
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', isActive ? 'true' : 'false');
        row.tabIndex = 0;
        row.title = `${model.name}\n${model.file || ''}`;
        row.onclick = () => window.StoneFloorBrush.setActive(model.id);
        row.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.StoneFloorBrush.setActive(model.id); }
        };

        const icon = span('floor-lib-row-icon');
        icon.innerHTML = FLOOR_ROW_ICON_CUBE;
        row.appendChild(icon);
        row.appendChild(span('floor-lib-row-name', model.name));

        const meta = [`${model.tileSize} m`];
        if (model.compressedBytes) meta.push(formatBytes(model.compressedBytes));
        row.appendChild(span('floor-lib-row-meta', meta.join(' · ')));

        const tiles = span('floor-lib-row-tiles', String(count));
        tiles.title = `${count} ubin di map`;
        row.appendChild(tiles);

        if (!model.isBuiltin) {
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'floor-lib-row-del';
            del.title = 'Hapus model dari koleksi project';
            del.setAttribute('aria-label', `Hapus ${model.name}`);
            del.innerHTML = FLOOR_ROW_ICON_TRASH;
            del.onclick = (e) => { e.stopPropagation(); window.StoneFloorBrush.deleteModel(model.id); };
            row.appendChild(del);
        } else {
            row.appendChild(span('floor-lib-row-spacer'));
        }

        container.appendChild(row);
    });
}

// Hitung jumlah ubin untuk model tertentu di scene
function getTileCountForModel(model) {
    if (!model) return 0;
    const list = window.importedObjectsList || (window.PandoraImportedObjects ? PandoraImportedObjects.list() : []);
    return list.filter(item => {
        if (!item || !item.name) return false;
        if (item.userData && item.userData.floorModelId === model.id) return true;
        return (model.baseName && item.name.startsWith(model.baseName)) || (model.file && item.file === model.file);
    }).length;
}

// Sinkronisasi input form parameter model aktif
function syncActiveModelParamsUI() {
    const active = getActiveFloorModel();
    if (!active) return;

    const lblName = document.getElementById('lbl-active-floor-name');
    const lblFile = document.getElementById('lbl-active-floor-file');
    const inTileSize = document.getElementById('in-floor-tile-size');
    const inScale = document.getElementById('in-floor-scale');
    const inYOffset = document.getElementById('in-floor-y-offset');
    const inBaseName = document.getElementById('in-floor-base-name');

    if (lblName) lblName.innerText = active.name;
    if (lblFile) {
        const fileName = (active.file || '').split('/').pop() || '';
        lblFile.textContent = fileName;
        lblFile.title = active.file;
    }
    if (inTileSize && document.activeElement !== inTileSize) inTileSize.value = active.tileSize;
    if (inScale && document.activeElement !== inScale) inScale.value = active.scale;
    if (inYOffset && document.activeElement !== inYOffset) inYOffset.value = active.yOffset;
    if (inBaseName && document.activeElement !== inBaseName) inBaseName.value = active.baseName;
}

// Spawn grid ubin modular dari model lantai aktif (mis. 4x4 ubin)
async function spawnStoneFloorGrid(centerPoint, customGridSize = null, elevationY = null) {
    if (!centerPoint) return;

    const activeModel = getActiveFloorModel();
    const modelData = await preloadFloorModel(activeModel);
    if (!modelData || !modelData.scene) {
        console.warn('[StoneFloorBrush] Model lantai 3D belum siap dimuat:', activeModel.file);
        return;
    }

    const size = (customGridSize !== null && customGridSize > 0) ? customGridSize : stoneFloorGridSize;
    const list = window.importedObjectsList || (window.PandoraImportedObjects ? PandoraImportedObjects.list() : []);
    const TILE = activeModel.tileSize || 3.50;

    // Ketinggian Y lantai:
    // Selama mouse ditekan (drag), pertahankan activeFloorStrokeY agar seluruh area lantai
    // yang digambar dalam satu goresan kuas selalu rata/datar sempurna!
    let targetY;
    if (elevationY !== null && !isNaN(elevationY)) {
        targetY = elevationY;
    } else if (stoneFloorAlwaysFlat && activeFloorStrokeY !== null) {
        targetY = activeFloorStrokeY;
    } else {
        targetY = Math.round((centerPoint.y + (activeModel.yOffset || 0.04)) * 100) / 100;
        activeFloorStrokeY = targetY;
    }

    // Snap posisi pusat ke kelipatan grid tile aktif
    const centerSnapX = Math.round(centerPoint.x / TILE) * TILE;
    const centerSnapZ = Math.round(centerPoint.z / TILE) * TILE;

    const startOffset = -((size - 1) * 0.5) * TILE;
    let placedAny = false;
    const duplicateToleranceSq = (TILE * 0.45) * (TILE * 0.45);

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const tx = Math.round((centerSnapX + startOffset + c * TILE) * 100) / 100;
            const tz = Math.round((centerSnapZ + startOffset + r * TILE) * 100) / 100;

            // Cek apakah di koordinat ini sudah ada ubin lantai (toleransi 45% tile size)
            const alreadyExists = list.some(item => {
                if (!item || !isFloorTileObject(item) || !item.root) return false;
                const dx = item.root.position.x - tx;
                const dz = item.root.position.z - tz;
                return (dx * dx + dz * dz) < duplicateToleranceSq;
            });
            if (alreadyExists) continue;

            // Buat record imported object baru
            const floorCount = list.filter(o => o && o.name && o.name.startsWith(activeModel.baseName)).length;
            const name = floorCount === 0 ? activeModel.baseName : `${activeModel.baseName}.${String(floorCount).padStart(3, '0')}`;
            const record = PandoraImportedObjects.createRecord(modelData.scene, modelData.animations, name, activeModel.file);

            // Tandai metadata sebagai ubin lantai modular
            if (!record.userData) record.userData = {};
            record.userData.isFloorTile = true;
            record.userData.floorModelId = activeModel.id;

            // Pasang posisi: rotX = 0, rotZ = 0 (SELALU DATAR HORIZONTAL)
            PandoraImportedObjects.placeRecord(record, {
                posX: tx,
                posY: targetY,
                posZ: tz,
                rotX: 0,
                rotY: 0,
                rotZ: 0,
                scale: activeModel.scale,
                hasCollision: true
            });

            PandoraImportedObjects.container().add(record.root);
            list.push(record);

            if (window.PandoraGLBCollision) {
                PandoraGLBCollision.prebuild(record);
            }

            // Bersihkan rumput di bawah ubin yang baru dipasang
            const clearRad = TILE * 0.60;
            if (typeof removeGrassInRadius === 'function') {
                removeGrassInRadius({ x: tx, z: tz }, clearRad);
            }
            if (typeof removeFernsInRadius === 'function') {
                removeFernsInRadius({ x: tx, z: tz }, clearRad, true);
            }

            placedAny = true;
        }
    }

    if (placedAny) {
        PandoraImportedObjects.refreshEditor();
        updateStoneFloorCountUI();
        renderFloorModelsUI();
        if (typeof updateFoxSpawnRaycasts === 'function') updateFoxSpawnRaycasts();
    }
}

// Hapus ubin lantai dalam radius tertentu (klik kanan atau kuas hapus)
function removeStoneFloorInRadius(hitPoint, radius = 4.0) {
    if (!hitPoint) return 0;
    const list = window.importedObjectsList || (window.PandoraImportedObjects ? PandoraImportedObjects.list() : []);
    const radSq = radius * radius;
    let removed = 0;

    for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i];
        if (item && isFloorTileObject(item) && item.root) {
            const dx = item.root.position.x - hitPoint.x;
            const dz = item.root.position.z - hitPoint.z;
            if (dx * dx + dz * dz <= radSq) {
                if (item.root.parent) item.root.parent.remove(item.root);
                list.splice(i, 1);
                removed++;
            }
        }
    }

    if (removed > 0) {
        PandoraImportedObjects.refreshEditor();
        updateStoneFloorCountUI();
        renderFloorModelsUI();
        if (typeof updateFoxSpawnRaycasts === 'function') updateFoxSpawnRaycasts();
    }
    return removed;
}

// Hapus hanya ubin dari model lantai yang sedang aktif
function clearActiveModelTiles() {
    const active = getActiveFloorModel();
    const count = getTileCountForModel(active);
    if (count === 0) {
        alert(`Tidak ada ubin "${active.name}" di map.`);
        return 0;
    }

    if (!confirm(`Hapus ${count} ubin "${active.name}" dari map?`)) return 0;

    if (typeof saveState === 'function') saveState();

    const list = window.importedObjectsList || (window.PandoraImportedObjects ? PandoraImportedObjects.list() : []);
    let removed = 0;

    for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i];
        if (item && item.root) {
            const match = (item.userData && item.userData.floorModelId === active.id) ||
                          item.name.startsWith(active.baseName) ||
                          (active.file && item.file === active.file);
            if (match) {
                if (item.root.parent) item.root.parent.remove(item.root);
                list.splice(i, 1);
                removed++;
            }
        }
    }

    if (removed > 0) {
        PandoraImportedObjects.refreshEditor();
        updateStoneFloorCountUI();
        renderFloorModelsUI();
        if (typeof updateFoxSpawnRaycasts === 'function') updateFoxSpawnRaycasts();
    }
    return removed;
}

// Hapus seluruh ubin lantai batu (semua model) dari peta
function clearAllStoneFloor() {
    const count = getStoneFloorCount(false);
    if (count === 0) {
        alert('Tidak ada ubin lantai 3D di map.');
        return 0;
    }

    if (!confirm(`Hapus seluruh ${count} ubin lantai 3D (semua model) dari map?`)) return 0;

    if (typeof saveState === 'function') saveState();

    const list = window.importedObjectsList || (window.PandoraImportedObjects ? PandoraImportedObjects.list() : []);
    let removed = 0;

    for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i];
        if (item && isFloorTileObject(item) && item.root) {
            if (item.root.parent) item.root.parent.remove(item.root);
            list.splice(i, 1);
            removed++;
        }
    }

    if (removed > 0) {
        PandoraImportedObjects.refreshEditor();
        updateStoneFloorCountUI();
        renderFloorModelsUI();
        if (typeof updateFoxSpawnRaycasts === 'function') updateFoxSpawnRaycasts();
    }
    return removed;
}

// Inisialisasi event listener panel UI kuas lantai batu
function initStoneFloorUI() {
    initFloorModelsStorage();

    const select = document.getElementById('select-road-brush');
    const controlsBox = document.getElementById('road-stone-floor-controls');

    function syncVisibility() {
        if (!controlsBox || !select) return;
        const isFloor = select.value === 'road_stone_floor';
        controlsBox.style.display = isFloor ? 'block' : 'none';
        if (isFloor) {
            preloadFloorModel();
            renderFloorModelsUI();
            syncActiveModelParamsUI();
            updateStoneFloorCountUI();
        }
    }

    if (select) {
        select.addEventListener('change', syncVisibility);
        syncVisibility();
    }

    // Tombol Import GLB Baru
    const btnImport = document.getElementById('btn-import-floor-glb');
    const inputImport = document.getElementById('input-import-floor-glb');
    if (btnImport && inputImport) {
        btnImport.addEventListener('click', () => {
            inputImport.click();
        });
        inputImport.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                importCustomFloorGLB(e.target.files[0]);
                inputImport.value = '';
            }
        });
    }

    // Tombol Pilih dari Objek Map Terimpor
    const btnPickScene = document.getElementById('btn-pick-scene-floor');
    if (btnPickScene) {
        btnPickScene.addEventListener('click', pickModelFromSceneObjects);
    }

    // Form parameter model aktif
    const inTileSize = document.getElementById('in-floor-tile-size');
    if (inTileSize) {
        inTileSize.addEventListener('change', (e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0) updateActiveModelParams({ tileSize: v });
        });
    }

    const inScale = document.getElementById('in-floor-scale');
    if (inScale) {
        inScale.addEventListener('change', (e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0) updateActiveModelParams({ scale: v });
        });
    }

    const inYOffset = document.getElementById('in-floor-y-offset');
    if (inYOffset) {
        inYOffset.addEventListener('change', (e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) updateActiveModelParams({ yOffset: v });
        });
    }

    const inBaseName = document.getElementById('in-floor-base-name');
    if (inBaseName) {
        inBaseName.addEventListener('change', (e) => {
            const v = e.target.value.trim();
            if (v) updateActiveModelParams({ baseName: v });
        });
    }

    // Toggle ukuran grid (4x4, 2x2, 1x1)
    const gridBtns = document.querySelectorAll('.stone-floor-grid-btn');
    gridBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            gridBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const sz = parseInt(btn.getAttribute('data-size'), 10) || 4;
            stoneFloorGridSize = sz;
        });
    });

    // Checkbox selalu datar
    const flatChk = document.getElementById('chk-stone-floor-flat');
    if (flatChk) {
        flatChk.addEventListener('change', (e) => {
            stoneFloorAlwaysFlat = !!e.target.checked;
        });
    }

    // Tombol hapus ubin model aktif saja
    const btnClearActive = document.getElementById('btn-clear-active-stone-floor');
    if (btnClearActive) {
        btnClearActive.addEventListener('click', clearActiveModelTiles);
    }

    // Tombol hapus semua ubin lantai batu
    const btnClearAll = document.getElementById('btn-clear-all-stone-floor');
    if (btnClearAll) {
        btnClearAll.addEventListener('click', clearAllStoneFloor);
    }

    renderFloorModelsUI();
    syncActiveModelParamsUI();
    updateStoneFloorCountUI();
}

// Pasang saat DOM siap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initStoneFloorUI();
        preloadFloorModel();
    });
} else {
    initStoneFloorUI();
    preloadFloorModel();
}

// Export ke window
window.StoneFloorBrush = {
    DEFAULT_MODEL: DEFAULT_FLOOR_MODEL,
    preload: preloadFloorModel,
    spawn: spawnStoneFloorGrid,
    removeInRadius: removeStoneFloorInRadius,
    clearActive: clearActiveModelTiles,
    clearAll: clearAllStoneFloor,
    getCount: getStoneFloorCount,
    updateUI: updateStoneFloorCountUI,
    resetStroke: resetStoneFloorStroke,
    setGridSize: (sz) => { stoneFloorGridSize = sz; },
    getGridSize: () => stoneFloorGridSize,
    getActiveModel: getActiveFloorModel,
    getActiveTileSize: () => (getActiveFloorModel().tileSize || 3.50),
    getModelsList: () => floorModelsList,
    setActive: setActiveFloorModel,
    addModel: addFloorModel,
    deleteModel: deleteFloorModel,
    updateParams: updateActiveModelParams,
    importGLB: importCustomFloorGLB,
    pickFromScene: pickModelFromSceneObjects,
    formatBytes: formatBytes
};

window.spawnStoneFloorGrid = spawnStoneFloorGrid;
window.removeStoneFloorInRadius = removeStoneFloorInRadius;
window.resetStoneFloorStroke = resetStoneFloorStroke;
window.updateStoneFloorCountUI = updateStoneFloorCountUI;
window.clearAllStoneFloor = clearAllStoneFloor;
