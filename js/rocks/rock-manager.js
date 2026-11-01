/* ========================================================
   GENSHIN-STYLE ROCK BRUSH & SHADER MANAGER
   Based on low-poly deformed dodecahedron geometry +
   anime-style vertical toon gradient shader.
   ======================================================== */

// Global state for Rocks
const rocksGroup = new THREE.Group();
rocksGroup.name = 'rocksGroup';
if (typeof scene !== 'undefined') {
    scene.add(rocksGroup);
}

const rocksList = [];
window.rocksList = rocksList;

// Parameter brush bebatuan
const rockParams = {
    brushRadius: 4.0,
    rockDensity: 4,
    minSize: 0.8,
    maxSize: 2.0,
    heightScale: 1.0,
    currentTheme: 'reference'
};

// 1. MATERIAL BATU: tekstur datang dari model GLB
const rockMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });

rockMaterial.userData = { shader: null };

// Lumut digambar pengguna pada peta dari atas; shader membacanya menurut posisi dunia
const ROCK_MOSS_EXTENT = 400;
const ROCK_MOSS_SIZE = 1024;
const rockMossCanvas = document.createElement('canvas');
rockMossCanvas.width = rockMossCanvas.height = ROCK_MOSS_SIZE;
const rockMossContext = rockMossCanvas.getContext('2d');
rockMossContext.fillRect(0, 0, ROCK_MOSS_SIZE, ROCK_MOSS_SIZE);
const rockMossTexture = new THREE.CanvasTexture(rockMossCanvas);
rockMossTexture.flipY = false;
let rockMossStrokes = [];

function drawRockMossStroke(x, z, radius, erase) {
    const scale = ROCK_MOSS_SIZE / ROCK_MOSS_EXTENT;
    const cx = (x + ROCK_MOSS_EXTENT / 2) * scale;
    const cy = (z + ROCK_MOSS_EXTENT / 2) * scale;
    const r = Math.max(2, radius * scale);
    const ctx = rockMossContext;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const color = erase ? '0,0,0' : '255,255,255';
    gradient.addColorStop(0, `rgba(${color},0.9)`);
    gradient.addColorStop(0.7, `rgba(${color},0.55)`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    rockMossTexture.needsUpdate = true;
}

function paintRockMoss(point, radius, erase) {
    const stroke = [+point.x.toFixed(2), +point.z.toFixed(2), +radius.toFixed(2), erase ? 1 : 0];
    // Menahan kuas di satu tempat tidak perlu menambah data
    const last = rockMossStrokes[rockMossStrokes.length - 1];
    if (last && last[3] === stroke[3] && Math.hypot(last[0] - stroke[0], last[1] - stroke[1]) < radius * 0.2) return;
    rockMossStrokes.push(stroke);
    drawRockMossStroke(stroke[0], stroke[1], stroke[2], erase);
}

function setRockMossStrokes(strokes) {
    rockMossStrokes = Array.isArray(strokes) ? strokes.slice() : [];
    rockMossContext.fillStyle = '#000';
    rockMossContext.fillRect(0, 0, ROCK_MOSS_SIZE, ROCK_MOSS_SIZE);
    rockMossStrokes.forEach(stroke => drawRockMossStroke(stroke[0], stroke[1], stroke[2], stroke[3] === 1));
    rockMossTexture.needsUpdate = true;
}

function getRockMossStrokes() {
    return rockMossStrokes;
}
window.paintRockMoss = paintRockMoss;
window.setRockMossStrokes = setRockMossStrokes;
window.getRockMossStrokes = getRockMossStrokes;

rockMaterial.onBeforeCompile = (shader) => {
    rockMaterial.userData.shader = shader;
    shader.uniforms.uMossMap = { value: rockMossTexture };

    shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vRockWorld;\nvarying vec3 vRockUp;`
    );
    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 rockWorld = vec4(transformed, 1.0);
        vec3 rockUp = objectNormal;
        #ifdef USE_INSTANCING
            rockWorld = instanceMatrix * rockWorld;
            rockUp = mat3(instanceMatrix) * rockUp;
        #endif
        vRockWorld = (modelMatrix * rockWorld).xyz;
        vRockUp = normalize(mat3(modelMatrix) * rockUp);`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uMossMap;
        varying vec3 vRockWorld;
        varying vec3 vRockUp;
        float rockHash(vec3 p) {
            p = fract(p * 0.3183099 + 0.1);
            p *= 17.0;
            return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float rockNoise(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(mix(rockHash(i), rockHash(i + vec3(1, 0, 0)), f.x), mix(rockHash(i + vec3(0, 1, 0)), rockHash(i + vec3(1, 1, 0)), f.x), f.y),
                mix(mix(rockHash(i + vec3(0, 0, 1)), rockHash(i + vec3(1, 0, 1)), f.x), mix(rockHash(i + vec3(0, 1, 1)), rockHash(i + vec3(1, 1, 1)), f.x), f.y),
                f.z);
        }
        float rockFbm(vec3 p) {
            return rockNoise(p) * 0.55 + rockNoise(p * 2.3) * 0.3 + rockNoise(p * 5.1) * 0.15;
        }`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Lumut hanya ada di tempat yang digambar dengan kuas lumut
        float mossPaint = texture2D(uMossMap, (vRockWorld.xz + ${ROCK_MOSS_EXTENT.toFixed(1)} * 0.5) / ${ROCK_MOSS_EXTENT.toFixed(1)}).r;
        // Noise mahal hanya dihitung di tempat yang benar-benar dicat lumut
        if (mossPaint > 0.01) {
            float mossFine = rockFbm(vRockWorld * 3.1);
            float moss = smoothstep(0.32, 0.6, mossPaint + (rockFbm(vRockWorld * 1.7) - 0.5) * 0.5 + (mossFine - 0.5) * 0.25) * smoothstep(-0.35, 0.25, vRockUp.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.03, 0.06, 0.015), vec3(0.1, 0.15, 0.03), mossFine), moss);
        }`
    );
};

// 3. MODEL BATU: tiap mesh di dalam GLB menjadi satu pilihan batu (A, B, C, dst.)
const ROCK_MODEL_FILE = 'assets/rocks/rocks-stylized.glb';
const rockVariants = [];
let rockAssetsPromise = null;
let rocksPendingLoad = [];
let rockBakeAfterLoad = false;

function rockVariantLabel(index) {
    return 'Batu ' + String.fromCharCode(65 + index);
}

// Pivot di tengah, ukuran terpanjang menjadi 2 satuan, proporsi tiap batu tetap seperti modelnya
function normalizeRockGeometry(mesh) {
    mesh.updateWorldMatrix(true, false);
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    const scale = 2 / Math.max(size.x, size.y, size.z);
    geometry.scale(scale, scale, scale);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry._isShared = true;
    return geometry;
}

function ensureRockAssets() {
    if (rockAssetsPromise) return rockAssetsPromise;
    rockAssetsPromise = (async () => {
        const buffer = window.PandoraAssetCache
            ? await PandoraAssetCache.getAssetBuffer(ROCK_MODEL_FILE)
            : await (await fetch(ROCK_MODEL_FILE)).arrayBuffer();
        const gltf = await new Promise((resolve, reject) => new THREE.GLTFLoader().parse(buffer, '', resolve, reject));
        const meshes = [];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((child) => {
            if (child.isMesh) meshes.push(child);
        });
        meshes.sort((a, b) => a.name.localeCompare(b.name));
        meshes.forEach(mesh => rockVariants.push(normalizeRockGeometry(mesh)));
        rockMaterial.map = meshes[0].material.map;
        rockMaterial.needsUpdate = true;

        const pending = rocksPendingLoad;
        rocksPendingLoad = [];
        pending.forEach(recreateRock);
        if (rockBakeAfterLoad) {
            rockBakeAfterLoad = false;
            bakeRocksForRuntime();
        }
        if (!window.PANDORA_RUNTIME) renderRockThumbnails();
    })().catch((err) => {
        console.error('[Rocks] Model batu gagal dimuat:', err);
    });
    return rockAssetsPromise;
}
window.ensureRockAssets = ensureRockAssets;

// Gambar kecil tiap batu untuk kartu kuas di panel Studio
function renderRockThumbnails() {
    const cards = document.querySelectorAll('[data-rock-thumb]');
    if (cards.length === 0) return;
    const size = 96;
    const thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    thumbRenderer.setSize(size, size);
    thumbRenderer.outputEncoding = THREE.sRGBEncoding;
    const thumbScene = new THREE.Scene();
    thumbScene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.1));
    const light = new THREE.DirectionalLight(0xffffff, 1.3);
    light.position.set(2, 3, 2.5);
    thumbScene.add(light);
    const thumbCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    thumbCamera.position.set(2.8, 2.0, 3.6);
    thumbCamera.lookAt(0, 0, 0);
    const thumbMaterial = new THREE.MeshStandardMaterial({ map: rockMaterial.map, roughness: 0.95 });
    cards.forEach((card) => {
        const geometry = rockVariants[Number(card.dataset.rockThumb)];
        if (!geometry) return;
        const mesh = new THREE.Mesh(geometry, thumbMaterial);
        thumbScene.add(mesh);
        thumbRenderer.render(thumbScene, thumbCamera);
        thumbScene.remove(mesh);
        card.style.backgroundImage = `url(${thumbRenderer.domElement.toDataURL('image/png')})`;
        card.style.backgroundSize = 'contain';
        card.style.backgroundPosition = 'center';
        card.style.backgroundRepeat = 'no-repeat';
    });
    thumbRenderer.forceContextLoss();
    thumbRenderer.dispose();
}

// Tebing: lempeng ditumpuk berlapis, tiap lapis mundur sedikit dari kamera
const CLIFF_LAYER_HEIGHT = 1.75;
const CLIFF_LAYER_SETBACK = 0.55;
const CLIFF_SLAB_WIDTH = 3.6;
function placeCliffAt(point) {
    if (rockVariants.length === 0) return;
    const toCamera = new THREE.Vector3(camera.position.x - point.x, 0, camera.position.z - point.z);
    if (toCamera.lengthSq() < 0.01) toCamera.set(0, 0, 1);
    toCamera.normalize();
    const tangent = new THREE.Vector3(toCamera.z, 0, -toCamera.x);
    const facingYaw = Math.atan2(tangent.z, -tangent.x);
    const width = Math.max(CLIFF_SLAB_WIDTH, rockParams.brushRadius * 2);
    const slabsPerRow = Math.max(1, Math.round(width / CLIFF_SLAB_WIDTH));
    const layers = Math.max(3, Math.round(rockParams.heightScale * 2.2));
    const bound = (typeof groundSize !== 'undefined' ? groundSize / 2 : 75) - 1.0;

    for (let layer = 0; layer < layers; layer++) {
        for (let i = 0; i < slabsPerRow; i++) {
            const along = (i - (slabsPerRow - 1) / 2) * CLIFF_SLAB_WIDTH + (Math.random() - 0.5) * 0.9;
            const back = layer * CLIFF_LAYER_SETBACK + (Math.random() - 0.4) * 1.6;
            const x = point.x + tangent.x * along - toCamera.x * back;
            const z = point.z + tangent.z * along - toCamera.z * back;
            if (Math.abs(x) > bound || Math.abs(z) > bound) continue;
            const y = getTerrainHeightFast(x, z) + 0.2 + layer * CLIFF_LAYER_HEIGHT;
            recreateRock({
                posX: x, posY: y, posZ: z,
                rotX: (Math.random() - 0.5) * 0.12,
                rotY: facingYaw + (Math.random() - 0.5) * 0.7,
                rotZ: (Math.random() - 0.5) * 0.12,
                scaleX: 2.0 + Math.random() * 1.5,
                scaleY: 1.3 + Math.random() * 1.1,
                scaleZ: 1.7 + Math.random() * 1.0,
                variant: Math.floor(Math.random() * rockVariants.length)
            });
        }
    }
}

// 4. PENEMPATAN BEBATUAN (PLACE ROCKS)
function placeRocksAt(intersectPoint, rockType = 'spawn_rock') {
    if (rockType === 'spawn_cliff') {
        placeCliffAt(intersectPoint);
        updateRockCountUI();
        return;
    }
    if (rockVariants.length === 0) {
        ensureRockAssets();
        return;
    }
    // spawn_rock_a sampai spawn_rock_k memilih satu batu; spawn_rock mengacak semuanya
    const letter = /^spawn_rock_([a-z])$/.exec(rockType);
    const chosenVariant = letter ? letter[1].charCodeAt(0) - 97 : -1;
    const radius = rockParams.brushRadius;
    const count = radius < 1.5 ? 1 : rockParams.rockDensity;

    const groundBound = (typeof groundSize !== 'undefined' ? groundSize / 2 : 75) - 1.0;

    for (let i = 0; i < count; i++) {
        const r = (count === 1) ? 0 : radius * Math.sqrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const offsetX = (count === 1) ? 0 : (r * Math.cos(theta));
        const offsetZ = (count === 1) ? 0 : (r * Math.sin(theta));

        const posX = intersectPoint.x + offsetX;
        const posZ = intersectPoint.z + offsetZ;

        if (Math.abs(posX) > groundBound || Math.abs(posZ) > groundBound) {
            continue;
        }

        const variant = rockVariants[chosenVariant] ? chosenVariant : Math.floor(Math.random() * rockVariants.length);
        const rockGeo = rockVariants[variant];
        const rock = new THREE.Mesh(rockGeo, rockMaterial);

        // Rotasi natural: rotasi penuh pada sumbu vertikal Y, dengan kemiringan organik halus pada X & Z
        rock.rotation.set(
            (Math.random() - 0.5) * 0.2,
            Math.random() * Math.PI * 2,
            (Math.random() - 0.5) * 0.2
        );

        const scaleBase = rockParams.minSize + Math.random() * (rockParams.maxSize - rockParams.minSize);

        // Variasi kecil saja, agar bentuk batu tetap seperti modelnya
        const widthScaleX = scaleBase * (0.92 + Math.random() * 0.16);
        const widthScaleZ = scaleBase * (0.92 + Math.random() * 0.16);
        const heightScale = scaleBase * rockParams.heightScale * (0.9 + Math.random() * 0.3);

        rock.scale.set(widthScaleX, heightScale, widthScaleZ);

        const groundY = (typeof getTerrainHeightFast === 'function')
            ? getTerrainHeightFast(posX, posZ)
            : 0;

        // Posisikan sedikit masuk ke tanah agar kokoh menancap
        rock.position.set(posX, groundY - (rockGeo.boundingBox.min.y + 0.05) * heightScale, posZ);

        rock.castShadow = true;
        rock.receiveShadow = true;

        rock.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(rock);
        const rx = (bb.max.x - bb.min.x) * 0.5 * 1.04;
        const rz = (bb.max.z - bb.min.z) * 0.5 * 1.04;

        rock.userData = {
            isRock: true,
            rockType: rockType,
            rockVariant: variant,
            scaleBase: scaleBase,
            heightScale: heightScale,
            minX: bb.min.x, maxX: bb.max.x,
            minY: bb.min.y, maxY: bb.max.y,
            minZ: bb.min.z, maxZ: bb.max.z,
            centerX: (bb.min.x + bb.max.x) * 0.5,
            centerZ: (bb.min.z + bb.max.z) * 0.5,
            radiusX: rx,
            radiusZ: rz,
            radiusMax: Math.max(rx, rz) * 1.25,
            topY: bb.max.y,
            bottomY: bb.min.y
        };

        rocksGroup.add(rock);
        rocksList.push(rock);
    }

    updateRockCountUI();
}

// 5. HAPUS BEBATUAN DALAM RADIUS TERTENTU
function removeRocksInRadius(hitPoint, radius) {
    if (!rocksList || rocksList.length === 0) return false;
    let removedAny = false;

    for (let i = rocksList.length - 1; i >= 0; i--) {
        const rock = rocksList[i];
        const dist = Math.hypot(rock.position.x - hitPoint.x, rock.position.z - hitPoint.z);
        if (dist <= radius) {
            rocksGroup.remove(rock);
            rocksList.splice(i, 1);
            removedAny = true;
        }
    }

    if (removedAny) {
        updateRockCountUI();
    }
    return removedAny;
}

// 6. BERSIHKAN SEMUA BEBATUAN (CLEAR ALL)
function clearAllRocks() {
    if (!rocksList) return;
    for (let i = 0; i < rocksList.length; i++) {
        rocksGroup.remove(rocksList[i]);
    }
    rocksList.length = 0;
    rocksPendingLoad = [];
    clearRockChunks();
    updateRockCountUI();
}

// Build: batu tidak bisa disunting, jadi ratusan mesh digabung menjadi instancing per petak.
// rocksList tetap dipakai untuk tabrakan, hanya tidak lagi digambar satu per satu.
const ROCK_CHUNK_SIZE = 32;
const rockChunks = [];

function clearRockChunks() {
    rockChunks.splice(0).forEach((mesh) => {
        rocksGroup.remove(mesh);
        mesh.geometry.dispose();
        mesh.dispose();
    });
}

function bakeRocksForRuntime() {
    if (rockVariants.length === 0) {
        rockBakeAfterLoad = true;
        ensureRockAssets();
        return;
    }
    clearRockChunks();
    const cells = new Map();
    rocksList.forEach((rock) => {
        const key = rock.geometry.uuid + ':' + Math.floor(rock.position.x / ROCK_CHUNK_SIZE) + ':' + Math.floor(rock.position.z / ROCK_CHUNK_SIZE);
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(rock);
        rocksGroup.remove(rock);
    });
    cells.forEach((rocks) => {
        const geometry = rocks[0].geometry.clone();
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        const local = geometry.boundingSphere.clone();
        const box = new THREE.Box3();
        const rockBox = new THREE.Box3();
        const sphere = new THREE.Sphere();
        const mesh = new THREE.InstancedMesh(geometry, rockMaterial, rocks.length);
        rocks.forEach((rock, i) => {
            rock.updateMatrixWorld(true);
            mesh.setMatrixAt(i, rock.matrixWorld);
            box.union(sphere.copy(local).applyMatrix4(rock.matrixWorld).getBoundingBox(rockBox));
        });
        geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        rocksGroup.add(mesh);
        rockChunks.push(mesh);
    });
}

// 7. RECREATE ROCK (UNTUK UNDO/REDO & LOAD MAP)
function recreateRock(data) {
    if (rockVariants.length === 0) {
        rocksPendingLoad.push(data);
        ensureRockAssets();
        return;
    }
    // Map lama belum menyimpan jenis batu: dipilih dari posisinya, jadi hasilnya selalu sama
    const hasVariant = rockVariants[data.variant] !== undefined;
    const variant = hasVariant ? data.variant : Math.abs(Math.floor(data.posX * 73.1 + data.posZ * 37.7)) % rockVariants.length;
    const rockGeo = rockVariants[variant];
    const rock = new THREE.Mesh(rockGeo, rockMaterial);

    rock.position.set(data.posX, data.posY, data.posZ);
    if (data.rotX !== undefined) {
        rock.rotation.set(data.rotX, data.rotY, data.rotZ);
    }
    if (data.scaleX !== undefined) {
        rock.scale.set(data.scaleX, data.scaleY, data.scaleZ);
    } else {
        rock.scale.set(1.5, 1.5, 1.5);
    }
    if (!hasVariant) {
        rock.position.y = getTerrainHeightFast(data.posX, data.posZ) - (rockGeo.boundingBox.min.y + 0.05) * rock.scale.y;
    }

    rock.castShadow = true;
    rock.receiveShadow = true;

    rock.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(rock);
    const rx = (bb.max.x - bb.min.x) * 0.5 * 1.04;
    const rz = (bb.max.z - bb.min.z) * 0.5 * 1.04;

    rock.userData = {
        isRock: true,
        minX: bb.min.x, maxX: bb.max.x,
        minY: bb.min.y, maxY: bb.max.y,
        minZ: bb.min.z, maxZ: bb.max.z,
        centerX: (bb.min.x + bb.max.x) * 0.5,
        centerZ: (bb.min.z + bb.max.z) * 0.5,
        radiusX: rx,
        radiusZ: rz,
        radiusMax: Math.max(rx, rz) * 1.25,
        topY: bb.max.y,
        bottomY: bb.min.y
    };

    rock.userData.rockVariant = variant;
    rocksGroup.add(rock);
    rocksList.push(rock);
    updateRockCountUI();
}

// 8. UPDATE UI COUNTER & LAYER OUTLINER
function updateRockCountUI() {
    const countBadge = document.getElementById('val-rock-count');
    if (countBadge) {
        countBadge.textContent = `${rocksList.length} Batu`;
    }
    if (typeof refreshLayerUI === 'function') {
        refreshLayerUI();
    }
}

// 8B. HAPUS BATU BERDASARKAN INDEX LAYER
function deleteRockByIndex(idx) {
    if (!rocksList || idx < 0 || idx >= rocksList.length) return;
    if (typeof saveState === 'function') saveState();
    const rockToRemove = rocksList[idx];
    if (typeof SelectionOutlineManager !== 'undefined') {
        if (typeof SelectionOutlineManager.clearSelection === 'function') {
            SelectionOutlineManager.clearSelection();
        } else if (typeof SelectionOutlineManager.clear === 'function') {
            SelectionOutlineManager.clear();
        }
    }
    if (rockToRemove && rockToRemove.parent) {
        rockToRemove.parent.remove(rockToRemove);
    } else if (typeof rocksGroup !== 'undefined' && rocksGroup) {
        rocksGroup.remove(rockToRemove);
    }
    rocksList.splice(idx, 1);

    if (typeof window.selectedRockIndex !== 'undefined') {
        if (window.selectedRockIndex === idx) window.selectedRockIndex = -1;
        else if (window.selectedRockIndex > idx) window.selectedRockIndex--;
    }
    if (typeof selectedRockIndex !== 'undefined') {
        if (selectedRockIndex === idx) selectedRockIndex = -1;
        else if (selectedRockIndex > idx) selectedRockIndex--;
    }

    updateRockCountUI();
    if (typeof updateEditorUI === 'function') {
        updateEditorUI();
    }
    if (typeof PandoraToast !== 'undefined' && typeof PandoraToast.show === 'function') {
        PandoraToast.show(`🗑️ Batu #${idx + 1} berhasil dihapus`, 'info');
    }
}
window.deleteRockByIndex = deleteRockByIndex;

// 9. SET TEMA WARNA GRADASI BATU
function setRockTheme(themeName) {
    rockParams.currentTheme = themeName;
    // Warna model dipertahankan; tema hanya memberi rona di atas teksturnya
    const tints = { reference: 0xffffff, slate: 0xcfd6df, mossy: 0xa9b89a, desert: 0xe3b77e };
    rockMaterial.color.setHex(tints[themeName] !== undefined ? tints[themeName] : 0xffffff);
}
