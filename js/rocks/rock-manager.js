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
    heightScale: 1.5,
    colorBottom: new THREE.Color(0x64748b), // Slate Gray gelap
    colorTop: new THREE.Color(0xcbd5e1),    // Abu-abu terang
    currentTheme: 'slate'
};

// 1. DATA TEXTURE UNTUK CEL-SHADED TOON GRADIENT RAMP
const rockColors = new Uint8Array([70, 150, 255]);
const rockGradientMap = new THREE.DataTexture(rockColors, 3, 1, THREE.LuminanceFormat);
rockGradientMap.minFilter = THREE.NearestFilter;
rockGradientMap.magFilter = THREE.NearestFilter;
rockGradientMap.needsUpdate = true;

const rockMaterial = new THREE.MeshToonMaterial({
    gradientMap: rockGradientMap,
    shadowSide: THREE.BackSide
});

rockMaterial.userData = { shader: null };

rockMaterial.onBeforeCompile = (shader) => {
    rockMaterial.userData.shader = shader;
    shader.uniforms.colorBottom = { value: rockParams.colorBottom };
    shader.uniforms.colorTop = { value: rockParams.colorTop };

    shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>\nvarying float vLocalY;`
    );
    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvLocalY = position.y;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform vec3 colorBottom;
        uniform vec3 colorTop;
        varying float vLocalY;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `
        float mixRatio = smoothstep(-1.0, 1.0, vLocalY);
        vec3 finalGradient = mix(colorBottom, colorTop, mixRatio);
        vec4 diffuseColor = vec4( finalGradient, opacity );
        `
    );
};

// 3. FUNGSI GEOMETRI BATU CHUNKY BERBONGKAH DENGAN VARIASI SEED
function createDeformedRockGeometry(variantSeed = 0) {
    let geo = new THREE.DodecahedronGeometry(1, 1);
    const posAttr = geo.attributes.position;
    const vertex = new THREE.Vector3();

    const phase = variantSeed * 1.618;
    for (let i = 0; i < posAttr.count; i++) {
        vertex.fromBufferAttribute(posAttr, i);

        // Distorsi sinusoidal multi-frekuensi agar permukaan bergerigi namun utuh
        const noiseX = Math.sin(vertex.y * 3.0 + phase) * 0.15;
        const noiseY = Math.cos(vertex.z * 3.0 + phase * 0.8) * 0.15;
        const noiseZ = Math.sin(vertex.x * 3.0 + phase * 1.2) * 0.15;

        vertex.x += noiseX;
        vertex.y += noiseY;
        vertex.z += noiseZ;

        posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    if (geo.index) {
        geo = geo.toNonIndexed();
    }
    geo.computeVertexNormals();
    return geo;
}

// Pre-create 6 geometry variations for high performance and visual diversity
const rockGeoVariations = [];
for (let v = 0; v < 6; v++) {
    const g = createDeformedRockGeometry(v);
    g._isShared = true;
    rockGeoVariations.push(g);
}

function getRandomRockGeometry() {
    const idx = Math.floor(Math.random() * rockGeoVariations.length);
    return rockGeoVariations[idx];
}

// 4. PENEMPATAN BEBATUAN (PLACE ROCKS)
function placeRocksAt(intersectPoint, rockType = 'spawn_rock') {
    const isBoulder = (rockType === 'spawn_boulder');
    const radius = rockParams.brushRadius;
    const count = (radius < 1.5 || isBoulder) ? 1 : rockParams.rockDensity;

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

        const rockGeo = getRandomRockGeometry();
        const rock = new THREE.Mesh(rockGeo, rockMaterial);

        // Rotasi natural: rotasi penuh pada sumbu vertikal Y, dengan kemiringan organik halus pada X & Z
        rock.rotation.set(
            (Math.random() - 0.5) * 0.2,
            Math.random() * Math.PI * 2,
            (Math.random() - 0.5) * 0.2
        );

        let scaleBase = rockParams.minSize + Math.random() * (rockParams.maxSize - rockParams.minSize);
        if (isBoulder) {
            scaleBase *= 2.2; // Bongkahan batu besar
        }

        const widthScaleX = scaleBase * (0.7 + Math.random() * 0.6);
        const widthScaleZ = scaleBase * (0.7 + Math.random() * 0.6);
        const heightScale = scaleBase * rockParams.heightScale * (0.9 + Math.random() * 0.3);

        rock.scale.set(widthScaleX, heightScale, widthScaleZ);

        const groundY = (typeof getTerrainHeightFast === 'function')
            ? getTerrainHeightFast(posX, posZ)
            : 0;

        // Posisikan sedikit masuk ke tanah agar kokoh menancap
        rock.position.set(posX, groundY + (heightScale * 0.42), posZ);

        rock.castShadow = true;
        rock.receiveShadow = true;

        rock.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(rock);
        const rx = (bb.max.x - bb.min.x) * 0.5 * 1.04;
        const rz = (bb.max.z - bb.min.z) * 0.5 * 1.04;

        rock.userData = {
            isRock: true,
            rockType: rockType,
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
    updateRockCountUI();
}

// 7. RECREATE ROCK (UNTUK UNDO/REDO & LOAD MAP)
function recreateRock(data) {
    const rockGeo = getRandomRockGeometry();
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
    if (themeName === 'mossy') {
        rockParams.colorBottom.set(0x2d4a3e);
        rockParams.colorTop.set(0x8fa382);
    } else if (themeName === 'desert') {
        rockParams.colorBottom.set(0x78350f);
        rockParams.colorTop.set(0xfcd34d);
    } else {
        // Slate Anime (Default)
        rockParams.colorBottom.set(0x64748b);
        rockParams.colorTop.set(0xcbd5e1);
    }

    if (rockMaterial.userData.shader) {
        rockMaterial.userData.shader.uniforms.colorBottom.value.copy(rockParams.colorBottom);
        rockMaterial.userData.shader.uniforms.colorTop.value.copy(rockParams.colorTop);
    }
}
