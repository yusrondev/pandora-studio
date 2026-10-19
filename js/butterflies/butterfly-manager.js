/* ========================================================
   ETHEREAL ANIME BUTTERFLY BRUSH & FLIGHT PATH MANAGER
   Based on procedural anime wing texture, dual flapping pivots,
   delicate body anatomy, and smooth 3D looped flight path
   circling gracefully within the painted brush area.
   ======================================================== */

// Global state for Butterflies
const butterfliesGroup = new THREE.Group();
butterfliesGroup.name = 'butterfliesGroup';
if (typeof scene !== 'undefined') {
    scene.add(butterfliesGroup);
}

const butterfliesList = [];
window.butterfliesList = butterfliesList;

// Parameter kuas kupu-kupu (Ukuran static kecil, tidak bisa diubah ukurannya di editor)
const butterflyParams = {
    brushRadius: 4.0,
    butterflyDensity: 2,
    staticScale: 0.085 // Ukuran mungil serangga anime realistis di arena
};

// 1. GENERATOR TEKSTUR SAYAP BIRU ANIME (DARI sample-butterfly.html)
let sharedWingTexture = null;
let sharedWingTextureCyan = null;

function createAnimeWingTexture(theme = 'blue') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const isCyanTheme = (theme === 'cyan');

    // Gradasi sayap bercahaya
    const grad = ctx.createRadialGradient(40, 256, 15, 256, 256, 310);
    if (isCyanTheme) {
        grad.addColorStop(0.0, '#38bdf8');
        grad.addColorStop(0.25, '#06b6d4');
        grad.addColorStop(0.55, '#0891b2');
        grad.addColorStop(0.82, '#0e7490');
        grad.addColorStop(1.0, '#042f2e');
    } else {
        grad.addColorStop(0.0, '#38bdf8');
        grad.addColorStop(0.25, '#0284c7');
        grad.addColorStop(0.55, '#0369a1');
        grad.addColorStop(0.82, '#1e3a8a');
        grad.addColorStop(1.0, '#0f172a');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Pola urat sayap bercahaya (Electric Veins)
    ctx.strokeStyle = isCyanTheme ? 'rgba(103, 232, 249, 0.88)' : 'rgba(125, 211, 252, 0.88)';
    ctx.shadowColor = isCyanTheme ? '#00f2fe' : '#00e5ff';
    ctx.shadowBlur = 8;

    const scale = 0.5;
    const veins = [
        { c1x: 280 * scale, c1y: 200 * scale, c2x: 620 * scale, c2y: 120 * scale, x: 960 * scale, y: 150 * scale },
        { c1x: 320 * scale, c1y: 320 * scale, c2x: 680 * scale, c2y: 280 * scale, x: 980 * scale, y: 330 * scale },
        { c1x: 350 * scale, c1y: 460 * scale, c2x: 720 * scale, c2y: 450 * scale, x: 990 * scale, y: 480 * scale },
        { c1x: 340 * scale, c1y: 600 * scale, c2x: 700 * scale, c2y: 640 * scale, x: 960 * scale, y: 670 * scale },
        { c1x: 300 * scale, c1y: 740 * scale, c2x: 640 * scale, c2y: 820 * scale, x: 890 * scale, y: 860 * scale },
        { c1x: 240 * scale, c1y: 860 * scale, c2x: 520 * scale, c2y: 930 * scale, x: 780 * scale, y: 960 * scale }
    ];

    veins.forEach((v) => {
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(90 * scale, 512 * scale);
        ctx.bezierCurveTo(v.c1x, v.c1y, v.c2x, v.c2y, v.x, v.y);
        ctx.stroke();

        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo((90 * scale + v.c1x) / 2, (512 * scale + v.c1y) / 2);
        ctx.quadraticCurveTo(v.c1x + 30, v.c1y - 18, v.x - 35, v.y - 22);
        ctx.stroke();
    });

    // Bintik kristal biru terang di sepanjang busur luar
    ctx.shadowBlur = 10;
    for (let i = 0; i < 28; i++) {
        const angle = (i / 28) * Math.PI * 1.6 - Math.PI * 0.8;
        const radius = (425 + Math.sin(i * 1.5) * 45) * scale;
        const x = 250 + Math.cos(angle) * radius;
        const y = 256 + Math.sin(angle) * (radius * 0.95);

        if (x > 75 && x < 505 && y > 15 && y < 495) {
            ctx.fillStyle = '#bae6fd';
            ctx.beginPath();
            ctx.arc(x, y, 2.0 + Math.random() * 2.0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Border pendaran halus
    ctx.lineWidth = 5;
    ctx.strokeStyle = isCyanTheme ? 'rgba(34, 211, 238, 0.7)' : 'rgba(56, 189, 248, 0.7)';
    ctx.strokeRect(0, 0, 512, 512);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
}

function getWingTexture(theme = 'blue') {
    if (theme === 'cyan') {
        if (!sharedWingTextureCyan) sharedWingTextureCyan = createAnimeWingTexture('cyan');
        return sharedWingTextureCyan;
    }
    if (!sharedWingTexture) sharedWingTexture = createAnimeWingTexture('blue');
    return sharedWingTexture;
}

// 2. GEOMETRI SAYAP & BADAN DETAIL (DARI sample-butterfly.html)
function createAnimeWingGeometry() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.4, 0.6, 1.4, 1.9, 2.3, 1.7);
    shape.bezierCurveTo(2.8, 1.55, 3.1, 1.0, 2.4, 0.4);
    shape.bezierCurveTo(2.0, 0.1, 1.6, 0.05, 1.4, 0.0);
    shape.bezierCurveTo(2.1, -0.4, 2.2, -1.3, 1.5, -1.6);
    shape.bezierCurveTo(1.0, -1.8, 0.6, -1.3, 0.35, -0.7);
    shape.bezierCurveTo(0.15, -0.3, 0.05, -0.1, 0, 0);

    const geom = new THREE.ShapeGeometry(shape, 24);
    geom.rotateX(Math.PI / 2);
    return geom;
}

const sharedWingGeom = createAnimeWingGeometry();

// Geometri & Material Tubuh
const sharedThoraxGeom = new THREE.SphereGeometry(0.11, 12, 12);
sharedThoraxGeom.scale(0.85, 0.9, 1.3);

const sharedHeadGeom = new THREE.SphereGeometry(0.085, 10, 10);
const sharedEyeGeom = new THREE.SphereGeometry(0.034, 8, 8);

// Abdomen segments
const sharedSegGeoms = [];
for (let i = 0; i < 5; i++) {
    const radius = 0.085 * (1 - (i / 5) * 0.65);
    const sg = new THREE.SphereGeometry(radius, 8, 8);
    sg.scale(0.9, 0.85, 1.15);
    sharedSegGeoms.push(sg);
}

// Antena
function createAntennaGeometry(isLeft) {
    const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(isLeft ? 0.02 : -0.02, 0.04, 0.35),
        new THREE.Vector3(isLeft ? 0.08 : -0.08, 0.22, 0.52),
        new THREE.Vector3(isLeft ? 0.16 : -0.16, 0.32, 0.68),
        new THREE.Vector3(isLeft ? 0.22 : -0.22, 0.42, 0.76)
    );
    const tube = new THREE.TubeGeometry(curve, 10, 0.008, 6, false);
    return { tube, tipPos: curve.getPoint(1) };
}

const leftAntennaData = createAntennaGeometry(true);
const rightAntennaData = createAntennaGeometry(false);
const sharedAntennaTipGeom = new THREE.SphereGeometry(0.02, 6, 6);

// Shared Materials
const sharedBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x0a1128,
    emissive: 0x0369a1,
    emissiveIntensity: 0.6,
    roughness: 0.25,
    metalness: 0.7
});

const sharedEyeMaterial = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: 0x00f2fe,
    emissiveIntensity: 1.8,
    roughness: 0.1
});

// Cache wing materials
const wingMaterialCache = {};
function getWingMaterial(theme = 'blue') {
    if (wingMaterialCache[theme]) return wingMaterialCache[theme];

    const mat = new THREE.MeshStandardMaterial({
        map: getWingTexture(theme),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
        roughness: 0.18,
        metalness: 0.2,
        blending: THREE.NormalBlending,
        emissive: theme === 'cyan' ? 0x0891b2 : 0x0284c7,
        emissiveIntensity: 0.55
    });
    wingMaterialCache[theme] = mat;
    return mat;
}

// 3. MEMBUAT MODEL KUPU-KUPU (STATIC KECIL)
function buildButterflyModel(theme = 'blue') {
    const butterflyRoot = new THREE.Group();

    const bodyGroup = new THREE.Group();

    // Dada (Thorax)
    const thorax = new THREE.Mesh(sharedThoraxGeom, sharedBodyMaterial);
    thorax.position.set(0, 0, 0.05);
    bodyGroup.add(thorax);

    // Kepala (Head)
    const head = new THREE.Mesh(sharedHeadGeom, sharedBodyMaterial);
    head.position.set(0, 0.02, 0.32);
    bodyGroup.add(head);

    // Mata Kiri & Kanan
    const leftEye = new THREE.Mesh(sharedEyeGeom, sharedEyeMaterial);
    leftEye.position.set(0.055, 0.05, 0.36);
    bodyGroup.add(leftEye);

    const rightEye = new THREE.Mesh(sharedEyeGeom, sharedEyeMaterial);
    rightEye.position.set(-0.055, 0.05, 0.36);
    bodyGroup.add(rightEye);

    // Perut (Abdomen)
    const abdomenGroup = new THREE.Group();
    for (let i = 0; i < 5; i++) {
        const seg = new THREE.Mesh(sharedSegGeoms[i], sharedBodyMaterial);
        seg.position.set(0, -0.01 * i, -0.15 - (i * 0.11));
        abdomenGroup.add(seg);
    }
    bodyGroup.add(abdomenGroup);

    // Antena Kiri & Kanan
    const leftAntMesh = new THREE.Mesh(leftAntennaData.tube, sharedBodyMaterial);
    const leftTip = new THREE.Mesh(sharedAntennaTipGeom, sharedEyeMaterial);
    leftTip.position.copy(leftAntennaData.tipPos);
    leftAntMesh.add(leftTip);
    bodyGroup.add(leftAntMesh);

    const rightAntMesh = new THREE.Mesh(rightAntennaData.tube, sharedBodyMaterial);
    const rightTip = new THREE.Mesh(sharedAntennaTipGeom, sharedEyeMaterial);
    rightTip.position.copy(rightAntennaData.tipPos);
    rightAntMesh.add(rightTip);
    bodyGroup.add(rightAntMesh);

    butterflyRoot.add(bodyGroup);

    // Sayap Kiri & Kanan (Pivot Flapping)
    const wingMat = getWingMaterial(theme);

    const leftWingPivot = new THREE.Group();
    leftWingPivot.position.set(0.065, 0.02, 0.05);
    const leftWingMesh = new THREE.Mesh(sharedWingGeom, wingMat);
    leftWingPivot.add(leftWingMesh);
    butterflyRoot.add(leftWingPivot);

    const rightWingPivot = new THREE.Group();
    rightWingPivot.position.set(-0.065, 0.02, 0.05);
    const rightWingMesh = new THREE.Mesh(sharedWingGeom, wingMat);
    rightWingMesh.scale.set(-1, 1, 1);
    rightWingPivot.add(rightWingMesh);
    butterflyRoot.add(rightWingPivot);

    // Root Group dengan Skala STATIC KECIL
    const root = new THREE.Group();
    const staticScale = butterflyParams.staticScale; // Selalu kecil & tidak dapat diubah ukurannya
    root.scale.set(staticScale, staticScale, staticScale);
    root.add(butterflyRoot);

    return {
        root,
        butterflyRoot,
        leftWingPivot,
        rightWingPivot,
        abdomenGroup
    };
}

// 4. PENEMPATAN KUPU-KUPU DENGAN KUAS (PLACE BUTTERFLIES)
function placeButterfliesAt(intersectPoint, butterflyType = 'spawn_butterfly_blue') {
    const isCyan = (butterflyType === 'spawn_butterfly_cyan');
    const theme = isCyan ? 'cyan' : 'blue';

    const radius = butterflyParams.brushRadius;
    const count = (radius < 1.5) ? 1 : Math.max(1, Math.round(butterflyParams.butterflyDensity * (radius / 3.5)));

    const groundBound = (typeof groundSize !== 'undefined' ? groundSize / 2 : 75) - 2.0;

    for (let i = 0; i < count; i++) {
        const r = (count === 1) ? 0 : (radius * 0.75 * Math.sqrt(Math.random()));
        const theta = Math.random() * 2 * Math.PI;

        const centerX = intersectPoint.x + (count === 1 ? 0 : r * Math.cos(theta));
        const centerZ = intersectPoint.z + (count === 1 ? 0 : r * Math.sin(theta));

        if (Math.abs(centerX) > groundBound || Math.abs(centerZ) > groundBound) continue;

        // Radius berputar kupu-kupu di sekitar area kuas yang digambar
        const patrolRadiusX = 1.0 + Math.random() * Math.min(2.2, radius * 0.65);
        const patrolRadiusZ = 0.8 + Math.random() * Math.min(1.8, radius * 0.55);
        const hoverHeight = 0.8 + Math.random() * 1.5; // Ketinggian melayang di atas rumput
        const flightSpeed = 0.55 + Math.random() * 0.35;
        const phase = Math.random() * Math.PI * 2;
        const flapSpeed = 9.0 + Math.random() * 2.0;

        const built = buildButterflyModel(theme);
        const bRoot = built.root;

        const groundY = (typeof getTerrainHeightFast === 'function')
            ? getTerrainHeightFast(centerX, centerZ)
            : 0;

        bRoot.position.set(centerX, groundY + hoverHeight, centerZ);

        const butterflyObj = {
            root: bRoot,
            inner: built.butterflyRoot,
            leftWingPivot: built.leftWingPivot,
            rightWingPivot: built.rightWingPivot,
            abdomenGroup: built.abdomenGroup,
            type: butterflyType,
            theme: theme,
            centerX: centerX,
            centerZ: centerZ,
            baseY: groundY,
            hoverHeight: hoverHeight,
            radiusX: patrolRadiusX,
            radiusZ: patrolRadiusZ,
            flightSpeed: flightSpeed,
            phase: phase,
            flapSpeed: flapSpeed
        };

        bRoot.userData = {
            isButterfly: true,
            butterflyData: butterflyObj
        };

        butterfliesGroup.add(bRoot);
        butterfliesList.push(butterflyObj);
    }

    updateButterflyCountUI();
}

// 5. HAPUS KUPU-KUPU DALAM RADIUS TERTENTU
function removeButterfliesInRadius(hitPoint, radius) {
    if (!butterfliesList || butterfliesList.length === 0) return false;
    let removedAny = false;

    for (let i = butterfliesList.length - 1; i >= 0; i--) {
        const b = butterfliesList[i];
        const dist = Math.hypot(b.centerX - hitPoint.x, b.centerZ - hitPoint.z);
        if (dist <= radius) {
            butterfliesGroup.remove(b.root);
            butterfliesList.splice(i, 1);
            removedAny = true;
        }
    }

    if (removedAny) {
        updateButterflyCountUI();
    }
    return removedAny;
}

// 6. BERSIHKAN SEMUA KUPU-KUPU (CLEAR ALL)
function clearAllButterflies() {
    if (!butterfliesList) return;
    for (let i = 0; i < butterfliesList.length; i++) {
        butterfliesGroup.remove(butterfliesList[i].root);
    }
    butterfliesList.length = 0;
    updateButterflyCountUI();
}

// 7. RECREATE BUTTERFLY (UNTUK UNDO/REDO & LOAD MAP)
function recreateButterfly(data) {
    const theme = data.theme || (data.type === 'spawn_butterfly_cyan' ? 'cyan' : 'blue');
    const built = buildButterflyModel(theme);
    const bRoot = built.root;

    const centerX = data.centerX !== undefined ? data.centerX : data.posX;
    const centerZ = data.centerZ !== undefined ? data.centerZ : data.posZ;
    const hoverHeight = data.hoverHeight !== undefined ? data.hoverHeight : (data.posY || 1.2);
    const radiusX = data.radiusX || 1.8;
    const radiusZ = data.radiusZ || 1.3;
    const flightSpeed = data.flightSpeed || 0.65;
    const phase = data.phase !== undefined ? data.phase : Math.random() * Math.PI * 2;
    const flapSpeed = data.flapSpeed || 9.5;

    const groundY = (typeof getTerrainHeightFast === 'function')
        ? getTerrainHeightFast(centerX, centerZ)
        : 0;

    bRoot.position.set(centerX, groundY + hoverHeight, centerZ);

    const butterflyObj = {
        root: bRoot,
        inner: built.butterflyRoot,
        leftWingPivot: built.leftWingPivot,
        rightWingPivot: built.rightWingPivot,
        abdomenGroup: built.abdomenGroup,
        type: data.type || ('spawn_butterfly_' + theme),
        theme: theme,
        centerX: centerX,
        centerZ: centerZ,
        baseY: groundY,
        hoverHeight: hoverHeight,
        radiusX: radiusX,
        radiusZ: radiusZ,
        flightSpeed: flightSpeed,
        phase: phase,
        flapSpeed: flapSpeed
    };

    bRoot.userData = {
        isButterfly: true,
        butterflyData: butterflyObj
    };

    butterfliesGroup.add(bRoot);
    butterfliesList.push(butterflyObj);
    updateButterflyCountUI();
}

// 8. ANIMASI TERBANG BERPUTAR DI DAERAH KUAS (LOOP FLIGHT PATH DI RENDER LOOP)
function updateButterflies(delta, elapsedTime) {
    if (!butterfliesList || butterfliesList.length === 0) return;

    for (let i = 0; i < butterfliesList.length; i++) {
        const b = butterfliesList[i];

        // 1. Kepakan Sayap (Natural Wing Flapping)
        const flapCycle = elapsedTime * b.flapSpeed + b.phase;
        const flapBase = Math.sin(flapCycle);
        const flapAngle = (flapBase + Math.sin(flapCycle * 2) * 0.12) * 0.72;

        b.leftWingPivot.rotation.z = flapAngle;
        b.rightWingPivot.rotation.z = -flapAngle;

        const wingFlex = Math.cos(flapCycle) * 0.08;
        b.leftWingPivot.rotation.x = wingFlex;
        b.rightWingPivot.rotation.x = wingFlex;

        // Gerak lentur perut
        b.abdomenGroup.rotation.x = Math.sin(flapCycle) * 0.1 - 0.08;

        // 2. Lintasan Berputar-putar Halus di Area Digambar (Smooth Looped Flight Curve)
        const currentT = elapsedTime * b.flightSpeed + b.phase;

        const relX = Math.sin(currentT) * b.radiusX;
        const relZ = Math.sin(2 * currentT) * b.radiusZ; // Kurva angka 8 / lemniscate mulus

        const posX = b.centerX + relX;
        const posZ = b.centerZ + relZ;

        const terrainY = (typeof getTerrainHeightFast === 'function')
            ? getTerrainHeightFast(posX, posZ)
            : 0;

        const posY = terrainY + b.hoverHeight + Math.cos(currentT * 1.5) * 0.3;
        b.root.position.set(posX, posY, posZ);

        // 3. Orientasi Hadap (Look At arah terbang ke depan) & Miring Menikung (Banking Roll)
        const deltaT = 0.04;
        const nextT = currentT + deltaT;
        const nextRelX = Math.sin(nextT) * b.radiusX;
        const nextRelZ = Math.sin(2 * nextT) * b.radiusZ;
        const nextX = b.centerX + nextRelX;
        const nextZ = b.centerZ + nextRelZ;
        const nextTerrainY = (typeof getTerrainHeightFast === 'function')
            ? getTerrainHeightFast(nextX, nextZ)
            : 0;
        const nextY = nextTerrainY + b.hoverHeight + Math.cos(nextT * 1.5) * 0.3;

        b.root.lookAt(nextX, nextY, nextZ);

        // Banking roll
        const curvatureX = -Math.sin(currentT);
        b.root.rotateZ(curvatureX * 0.32);
    }
}

// 9. UPDATE UI COUNTER
function updateButterflyCountUI() {
    const countBadge = document.getElementById('val-butterfly-count');
    if (countBadge) {
        countBadge.textContent = `${butterfliesList.length} Kupu-kupu`;
    }
    if (typeof refreshLayerUI === 'function') {
        refreshLayerUI();
    }
}

window.placeButterfliesAt = placeButterfliesAt;
window.removeButterfliesInRadius = removeButterfliesInRadius;
window.clearAllButterflies = clearAllButterflies;
window.recreateButterfly = recreateButterfly;
window.updateButterflies = updateButterflies;
window.updateButterflyCountUI = updateButterflyCountUI;
window.butterflyParams = butterflyParams;
