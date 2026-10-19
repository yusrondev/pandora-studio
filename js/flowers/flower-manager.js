/* ========================================================
   MAGICAL BLUE LOTUS / NILOTPALA FLOWER BRUSH & MANAGER
   Based on procedural lotus petals, curved stem anatomy,
   translucent bioluminescent glowing materials, and gentle swaying.
   ======================================================== */

// Global state for Flowers
const flowersGroup = new THREE.Group();
flowersGroup.name = 'flowersGroup';
if (typeof scene !== 'undefined') {
    scene.add(flowersGroup);
}

const flowersList = [];
window.flowersList = flowersList;

// Parameter kuas bunga (Ukuran static kecil, tidak ada slider ukuran di UI)
const flowerParams = {
    brushRadius: 3.5,
    flowerDensity: 3,
    staticScale: 0.28 // Ukuran mungil proporsional yang cantik di antara rumput
};

// 1. PALET TEMA WARNA BUNGA (DARI sample.flower.html)
const FLOWER_THEMES = {
    cyan: {
        id: 'spawn_flower_cyan',
        name: 'Nilotpala Cyan',
        petalBase: 0x0284c7,
        petalEmissive: 0x0369a1,
        coreLight: 0x00f0ff,
        stamen: 0xffb703
    },
    blue: {
        id: 'spawn_flower_blue',
        name: 'Mystic Blue',
        petalBase: 0x1d4ed8,
        petalEmissive: 0x1e40af,
        coreLight: 0x3b82f6,
        stamen: 0xf97316
    },
    violet: {
        id: 'spawn_flower_violet',
        name: 'Lunar Violet',
        petalBase: 0x7e22ce,
        petalEmissive: 0x6b21a8,
        coreLight: 0xd946ef,
        stamen: 0xfacc15
    },
    solar: {
        id: 'spawn_flower_solar',
        name: 'Solar Amber',
        petalBase: 0xb45309,
        petalEmissive: 0x92400e,
        coreLight: 0xf59e0b,
        stamen: 0xef4444
    }
};

// 2. GEOMETRI PETAL & ANATOMI (SHARED ACROSS INSTANCES UNTUK PERFORMA TINGGI)
function createLotusPetalShape(width, length) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(width * 0.5, length * 0.15, width, length * 0.55, width * 0.2, length);
    shape.bezierCurveTo(0, length * 1.05, -width * 0.2, length, -width, length * 0.55);
    shape.bezierCurveTo(-width * 0.5, length * 0.15, 0, 0, 0, 0);
    return shape;
}

function applyPetalCurvature(geo, curveAmount) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const curve = Math.pow(Math.max(0, y), 1.8) * curveAmount;
        pos.setZ(i, pos.getZ(i) + curve);
    }
    geo.computeVertexNormals();
}

const petalExtrudeOpts = {
    depth: 0.008,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.005,
    bevelThickness: 0.005
};

const outerPetalShape = createLotusPetalShape(0.32, 0.9);
const midPetalShape = createLotusPetalShape(0.26, 0.75);
const innerPetalShape = createLotusPetalShape(0.2, 0.58);

const sharedOuterPetalGeo = new THREE.ExtrudeGeometry(outerPetalShape, petalExtrudeOpts);
const sharedMidPetalGeo = new THREE.ExtrudeGeometry(midPetalShape, petalExtrudeOpts);
const sharedInnerPetalGeo = new THREE.ExtrudeGeometry(innerPetalShape, petalExtrudeOpts);

applyPetalCurvature(sharedOuterPetalGeo, 0.12);
applyPetalCurvature(sharedMidPetalGeo, 0.16);
applyPetalCurvature(sharedInnerPetalGeo, 0.22);

// Stem leaf geometry
function createLeafMeshShape() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.06, 0.08, 0.12, 0.22, 0, 0.42);
    shape.bezierCurveTo(-0.12, 0.22, -0.06, 0.08, 0, 0);
    return new THREE.ExtrudeGeometry(shape, {
        depth: 0.005,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.003,
        bevelThickness: 0.003
    });
}
const sharedLeafGeo = createLeafMeshShape();

// Stamen shared geometries
const sharedFilamentGeo = new THREE.CylinderGeometry(0.005, 0.008, 0.2, 6);
const sharedAntherGeo = new THREE.SphereGeometry(0.02, 8, 8);
sharedAntherGeo.scale(1, 1.4, 1);
const sharedSeedPodGeo = new THREE.CylinderGeometry(0.07, 0.04, 0.08, 12);

// Stem Tube Geometry
const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.2, 0),
    new THREE.Vector3(0.05, 0.15, 0.02),
    new THREE.Vector3(-0.03, 0.55, -0.02),
    new THREE.Vector3(0, 0.9, 0)
]);
const sharedStemGeo = new THREE.TubeGeometry(stemCurve, 16, 0.035, 8, false);

// 3. MATERIAL CACHE PER THEME
const flowerMaterialCache = {};

function getFlowerMaterials(themeKey) {
    if (flowerMaterialCache[themeKey]) return flowerMaterialCache[themeKey];

    const conf = FLOWER_THEMES[themeKey] || FLOWER_THEMES.cyan;

    const petalMat = new THREE.MeshStandardMaterial({
        color: conf.petalBase,
        emissive: conf.petalEmissive,
        emissiveIntensity: 1.8,
        roughness: 0.2,
        metalness: 0.08,
        transparent: true,
        opacity: 0.94,
        side: THREE.DoubleSide
    });

    const stemMat = new THREE.MeshStandardMaterial({
        color: 0x0f766e,
        roughness: 0.4,
        metalness: 0.1
    });

    const leafMat = new THREE.MeshStandardMaterial({
        color: 0x0d9488,
        emissive: 0x042f2e,
        emissiveIntensity: 0.35,
        roughness: 0.35
    });

    const filMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const antMat = new THREE.MeshStandardMaterial({
        color: conf.stamen,
        emissive: conf.stamen,
        emissiveIntensity: 2.2
    });

    const podMat = new THREE.MeshStandardMaterial({
        color: conf.petalBase,
        emissive: conf.coreLight,
        emissiveIntensity: 1.5,
        roughness: 0.25
    });

    flowerMaterialCache[themeKey] = {
        petalMat,
        stemMat,
        leafMat,
        filMat,
        antMat,
        podMat,
        coreColor: conf.coreLight
    };

    return flowerMaterialCache[themeKey];
}

// 4. MEMBUAT INSTANCE MODEL BUNGA (TIDAK BISA DIUBAH UKURANNYA DI EDITOR)
function buildFlowerModel(themeKey = 'cyan') {
    const mats = getFlowerMaterials(themeKey);
    const flowerGroup = new THREE.Group();

    // 1. Batang Bunga (Stem)
    const stemMesh = new THREE.Mesh(sharedStemGeo, mats.stemMat);
    stemMesh.castShadow = true;
    stemMesh.receiveShadow = true;
    flowerGroup.add(stemMesh);

    // 2. Daun Batang (2 Leaves)
    const leaf1 = new THREE.Mesh(sharedLeafGeo, mats.leafMat);
    leaf1.position.set(0.04, 0.25, 0.02);
    leaf1.rotation.set(0.1, 0.4, -1.2);
    leaf1.scale.setScalar(0.75);

    const leaf2 = new THREE.Mesh(sharedLeafGeo, mats.leafMat);
    leaf2.position.set(-0.03, 0.45, -0.01);
    leaf2.rotation.set(-0.1, -0.5, 1.2);
    leaf2.scale.setScalar(0.65);

    flowerGroup.add(leaf1, leaf2);

    // 3. Kelopak Teratai (Petal Head)
    const bloomHead = new THREE.Group();
    bloomHead.position.set(0, 0.9, 0);

    // Layer Luar (8 Kelopak mendatar melingkar)
    for (let i = 0; i < 8; i++) {
        const pivot = new THREE.Group();
        const mesh = new THREE.Mesh(sharedOuterPetalGeo, mats.petalMat);
        mesh.rotation.x = -Math.PI / 2;
        pivot.add(mesh);

        pivot.rotation.y = (i * Math.PI * 2) / 8;
        pivot.rotation.x = Math.PI * 0.08;
        bloomHead.add(pivot);
    }

    // Layer Tengah (8 Kelopak sedikit terangkat)
    for (let i = 0; i < 8; i++) {
        const pivot = new THREE.Group();
        const mesh = new THREE.Mesh(sharedMidPetalGeo, mats.petalMat);
        mesh.rotation.x = -Math.PI / 2;
        pivot.add(mesh);

        pivot.rotation.y = (i * Math.PI * 2) / 8 + (Math.PI / 8);
        pivot.rotation.x = Math.PI * 0.18;
        pivot.position.y = 0.02;
        bloomHead.add(pivot);
    }

    // Layer Dalam (6 Kelopak kuncup anggun)
    for (let i = 0; i < 6; i++) {
        const pivot = new THREE.Group();
        const mesh = new THREE.Mesh(sharedInnerPetalGeo, mats.petalMat);
        mesh.rotation.x = -Math.PI / 2;
        pivot.add(mesh);

        pivot.rotation.y = (i * Math.PI * 2) / 6 + (Math.PI / 12);
        pivot.rotation.x = Math.PI * 0.32;
        pivot.position.y = 0.04;
        bloomHead.add(pivot);
    }

    flowerGroup.add(bloomHead);

    // 4. Benang Sari Keemasan (Golden Stamen & Pod)
    const stamenGroup = new THREE.Group();
    stamenGroup.position.set(0, 0.92, 0);

    for (let i = 0; i < 10; i++) {
        const stamen = new THREE.Group();
        const fil = new THREE.Mesh(sharedFilamentGeo, mats.filMat);
        fil.position.y = 0.1;

        const ant = new THREE.Mesh(sharedAntherGeo, mats.antMat);
        ant.position.y = 0.2;

        stamen.add(fil, ant);
        stamen.rotation.y = (i * Math.PI * 2) / 10;
        stamen.rotation.z = -0.24;
        stamenGroup.add(stamen);
    }

    const podMesh = new THREE.Mesh(sharedSeedPodGeo, mats.podMat);
    podMesh.position.y = 0.04;
    stamenGroup.add(podMesh);

    flowerGroup.add(stamenGroup);

    // Root wrapper dengan skala STATIC KECIL
    const root = new THREE.Group();
    const staticScale = flowerParams.staticScale; // Tetap kecil dan seragam
    root.scale.set(staticScale, staticScale, staticScale);
    root.add(flowerGroup);

    return {
        root,
        flowerGroup,
        bloomHead
    };
}

// 5. PENEMPATAN BUNGA DENGAN KUAS (PLACE FLOWERS)
function placeFlowersAt(intersectPoint, flowerType = 'spawn_flower_cyan') {
    let themeKey = 'cyan';
    if (flowerType === 'spawn_flower_blue') themeKey = 'blue';
    else if (flowerType === 'spawn_flower_violet') themeKey = 'violet';
    else if (flowerType === 'spawn_flower_solar') themeKey = 'solar';

    const radius = flowerParams.brushRadius;
    const count = (radius < 1.2) ? 1 : Math.max(1, Math.round(flowerParams.flowerDensity * (radius / 3.0)));

    const groundBound = (typeof groundSize !== 'undefined' ? groundSize / 2 : 75) - 1.0;

    for (let i = 0; i < count; i++) {
        const r = (count === 1) ? 0 : radius * Math.sqrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const posX = intersectPoint.x + (count === 1 ? 0 : r * Math.cos(theta));
        const posZ = intersectPoint.z + (count === 1 ? 0 : r * Math.sin(theta));

        if (Math.abs(posX) > groundBound || Math.abs(posZ) > groundBound) continue;

        // Cegah penumpukan terlalu rapat (< 0.45 unit)
        let tooClose = false;
        for (let j = 0; j < flowersList.length; j++) {
            const f = flowersList[j];
            if (Math.hypot(f.position.x - posX, f.position.z - posZ) < 0.45) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) continue;

        const built = buildFlowerModel(themeKey);
        const flower = built.root;

        const groundY = (typeof getTerrainHeightFast === 'function')
            ? getTerrainHeightFast(posX, posZ)
            : 0;

        flower.position.set(posX, groundY, posZ);
        flower.rotation.y = Math.random() * Math.PI * 2;

        flower.userData = {
            isFlower: true,
            flowerType: flowerType,
            themeKey: themeKey,
            swayOffset: Math.random() * 20.0,
            swaySpeed: 1.2 + Math.random() * 0.5,
            innerGroup: built.flowerGroup,
            bloomHead: built.bloomHead
        };

        flowersGroup.add(flower);
        flowersList.push(flower);
    }

    updateFlowerCountUI();
}

// 6. HAPUS BUNGA DALAM RADIUS TERTENTU
function removeFlowersInRadius(hitPoint, radius) {
    if (!flowersList || flowersList.length === 0) return false;
    let removedAny = false;

    for (let i = flowersList.length - 1; i >= 0; i--) {
        const flower = flowersList[i];
        const dist = Math.hypot(flower.position.x - hitPoint.x, flower.position.z - hitPoint.z);
        if (dist <= radius) {
            flowersGroup.remove(flower);
            flowersList.splice(i, 1);
            removedAny = true;
        }
    }

    if (removedAny) {
        updateFlowerCountUI();
    }
    return removedAny;
}

// 7. BERSIHKAN SEMUA BUNGA (CLEAR ALL)
function clearAllFlowers() {
    if (!flowersList) return;
    for (let i = 0; i < flowersList.length; i++) {
        flowersGroup.remove(flowersList[i]);
    }
    flowersList.length = 0;
    updateFlowerCountUI();
}

// 8. RECREATE FLOWER (UNTUK UNDO/REDO & LOAD MAP)
function recreateFlower(data) {
    const themeKey = data.themeKey || (data.flowerType ? data.flowerType.replace('spawn_flower_', '') : 'cyan');
    const built = buildFlowerModel(themeKey);
    const flower = built.root;

    flower.position.set(data.posX, data.posY, data.posZ);
    if (data.rotY !== undefined) {
        flower.rotation.y = data.rotY;
    }

    flower.userData = {
        isFlower: true,
        flowerType: data.flowerType || ('spawn_flower_' + themeKey),
        themeKey: themeKey,
        swayOffset: Math.random() * 20.0,
        swaySpeed: 1.2 + Math.random() * 0.5,
        innerGroup: built.flowerGroup,
        bloomHead: built.bloomHead
    };

    flowersGroup.add(flower);
    flowersList.push(flower);
    updateFlowerCountUI();
}

// 9. ANIMASI GOYANGAN ALAMI (UPDATE LOOP DI RENDER LOOP)
function updateFlowers(delta, elapsedTime) {
    if (!flowersList || flowersList.length === 0) return;

    for (let i = 0; i < flowersList.length; i++) {
        const f = flowersList[i];
        const inner = f.userData.innerGroup;
        if (!inner) continue;

        const offset = f.userData.swayOffset;
        const spd = f.userData.swaySpeed || 1.4;

        // Goyangan lembut dihembus angin
        const swayX = Math.sin(elapsedTime * spd + offset) * 0.035;
        const swayZ = Math.cos(elapsedTime * (spd * 0.85) + offset) * 0.025;
        inner.rotation.z = swayX;
        inner.rotation.x = swayZ;

        // Denyut halus kelopak (subtle breath)
        if (f.userData.bloomHead) {
            const breath = 1.0 + Math.sin(elapsedTime * 2.2 + offset) * 0.015;
            f.userData.bloomHead.scale.set(breath, breath, breath);
        }
    }
}

// 10. UPDATE UI COUNTER
function updateFlowerCountUI() {
    const countBadge = document.getElementById('val-flower-count');
    if (countBadge) {
        countBadge.textContent = `${flowersList.length} Bunga`;
    }
    if (typeof refreshLayerUI === 'function') {
        refreshLayerUI();
    }
}

window.placeFlowersAt = placeFlowersAt;
window.removeFlowersInRadius = removeFlowersInRadius;
window.clearAllFlowers = clearAllFlowers;
window.recreateFlower = recreateFlower;
window.updateFlowers = updateFlowers;
window.updateFlowerCountUI = updateFlowerCountUI;
window.flowerParams = flowerParams;
