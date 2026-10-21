/* Terrain mesh, sculpt & road brush */
// ==========================================
// 4. TERRAIN & SEAMLESS ROAD BRUSH
// ==========================================
const groundSize = 80;
const groundSegments = 100;
const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, groundSegments, groundSegments);
groundGeo.rotateX(-Math.PI / 2);

const vertexCount = groundGeo.attributes.position.count;
const terrainColors = new Float32Array(vertexCount * 3);
const defaultBaseGrassColor = new THREE.Color(0xcbb6b8);
for (let i = 0; i < vertexCount; i++) {
    terrainColors[i * 3] = defaultBaseGrassColor.r;
    terrainColors[i * 3 + 1] = defaultBaseGrassColor.g;
    terrainColors[i * 3 + 2] = defaultBaseGrassColor.b;
}
groundGeo.setAttribute('color', new THREE.BufferAttribute(terrainColors, 3));

// ==========================================
// PROCEDURAL CLAY BRUSH NOISE ALGORITHMS
// ==========================================
function hash(x, y) {
    let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
}

function smoothNoise(x, y) {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const u = fx * fx * (3.0 - 2.0 * fx);
    const v = fy * fy * (3.0 - 2.0 * fy);

    return (
        hash(i, j) * (1.0 - u) * (1.0 - v) +
        hash(i + 1, j) * u * (1.0 - v) +
        hash(i, j + 1) * (1.0 - u) * v +
        hash(i + 1, j + 1) * u * v
    );
}

function fbm(x, y) {
    let val = 0.0;
    let amp = 0.5;
    let freq = 1.0;
    for (let o = 0; o < 6; o++) {
        val += amp * smoothNoise(x * freq, y * freq);
        freq *= 2.05;
        amp *= 0.5;
    }
    return val;
}

const groundMat = new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = false; // Bayangan hanya ditampilkan di atas bidang air sesuai permintaan
scene.add(ground);

// Studio Canvas Grid Lines (seperti new-character.html)
const studioGrid = new THREE.GridHelper(groundSize, groundSize, 0x6e5d5f, 0x8c797b);
studioGrid.position.y = 0.008;
studioGrid.material.opacity = 0.32;
studioGrid.material.transparent = true;
scene.add(studioGrid);

function setTerrainPlaneColor(colorHex) {
    const col = new THREE.Color(colorHex);
    defaultBaseGrassColor.copy(col);
    const colors = groundGeo.attributes.color.array;
    const count = groundGeo.attributes.position.count;
    for (let i = 0; i < count; i++) {
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
    }
    groundGeo.attributes.color.needsUpdate = true;
}

function getTerrainHeightFast(x, z) {
    const halfSize = groundSize / 2;
    const gx = ((x + halfSize) / groundSize) * groundSegments;
    const gz = ((z + halfSize) / groundSize) * groundSegments;

    // Indeks grid 4 titik sudut terdekat untuk interpolasi bilinear mulus
    const x0 = Math.max(0, Math.min(groundSegments, Math.floor(gx)));
    const x1 = Math.max(0, Math.min(groundSegments, x0 + 1));
    const z0 = Math.max(0, Math.min(groundSegments, Math.floor(gz)));
    const z1 = Math.max(0, Math.min(groundSegments, z0 + 1));

    const tx = Math.max(0, Math.min(1, gx - Math.floor(gx)));
    const tz = Math.max(0, Math.min(1, gz - Math.floor(gz)));

    const stride = groundSegments + 1;
    const posAttr = groundGeo.attributes.position;
    if (!posAttr) return 0;

    const i00 = z0 * stride + x0;
    const i10 = z0 * stride + x1;
    const i01 = z1 * stride + x0;
    const i11 = z1 * stride + x1;

    const h00 = i00 < posAttr.count ? posAttr.getY(i00) : 0;
    const h10 = i10 < posAttr.count ? posAttr.getY(i10) : 0;
    const h01 = i01 < posAttr.count ? posAttr.getY(i01) : 0;
    const h11 = i11 < posAttr.count ? posAttr.getY(i11) : 0;

    // Interpolasi mulus (bilinear) untuk menghilangkan efek patah-patah seperti tangga
    const hTop = h00 * (1 - tx) + h10 * tx;
    const hBottom = h01 * (1 - tx) + h11 * tx;
    return hTop * (1 - tz) + hBottom * tz;
}

function getTerrainNormalAt(x, z) {
    const delta = 0.15;
    const hL = getTerrainHeightFast(x - delta, z);
    const hR = getTerrainHeightFast(x + delta, z);
    const hD = getTerrainHeightFast(x, z - delta);
    const hU = getTerrainHeightFast(x, z + delta);

    const normal = new THREE.Vector3(hL - hR, 2.0 * delta, hD - hU);
    return normal.normalize();
}

function sculptTerrain(hitPoint, mode, radius) {
    const posAttr = groundGeo.attributes.position;
    const delta = mode === 'raise' ? 0.15 : -0.15;

    const halfSize = groundSize / 2;
    const centerGX = ((hitPoint.x + halfSize) / groundSize) * groundSegments;
    const centerGZ = ((hitPoint.z + halfSize) / groundSize) * groundSegments;
    const gridRadius = Math.ceil((radius / groundSize) * groundSegments);

    const minX = Math.max(0, Math.floor(centerGX - gridRadius));
    const maxX = Math.min(groundSegments, Math.ceil(centerGX + gridRadius));
    const minZ = Math.max(0, Math.floor(centerGZ - gridRadius));
    const maxZ = Math.min(groundSegments, Math.ceil(centerGZ + gridRadius));

    let modified = false;

    for (let gz = minZ; gz <= maxZ; gz++) {
        for (let gx = minX; gx <= maxX; gx++) {
            const idx = gz * (groundSegments + 1) + gx;
            const vx = posAttr.getX(idx);
            const vz = posAttr.getZ(idx);

            const dist = Math.hypot(vx - hitPoint.x, vz - hitPoint.z);
            if (dist <= radius) {
                const factor = Math.cos((dist / radius) * (Math.PI / 2));
                posAttr.setY(idx, posAttr.getY(idx) + delta * factor);
                modified = true;
            }
        }
    }

    if (modified) {
        posAttr.needsUpdate = true;
        if (typeof syncTerrainHeightToWater === 'function') {
            syncTerrainHeightToWater();
        }
    }
}

function smoothstep(min, max, value) {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
}

function paintRoadOnTerrain(hitPoint, roadType, radius) {
    const posAttr = groundGeo.attributes.position;
    const colAttr = groundGeo.attributes.color;

    const halfSize = groundSize / 2;
    const centerGX = ((hitPoint.x + halfSize) / groundSize) * groundSegments;
    const centerGZ = ((hitPoint.z + halfSize) / groundSize) * groundSegments;
    const gridRadius = Math.ceil((radius / groundSize) * groundSegments);

    const minX = Math.max(0, Math.floor(centerGX - gridRadius));
    const maxX = Math.min(groundSegments, Math.ceil(centerGX + gridRadius));
    const minZ = Math.max(0, Math.floor(centerGZ - gridRadius));
    const maxZ = Math.min(groundSegments, Math.ceil(centerGZ + gridRadius));

    const dirtPathBase = new THREE.Color(0xd9b882);
    const mossyPathBase = new THREE.Color(0x6e8f52);

    let modified = false;

    for (let gz = minZ; gz <= maxZ; gz++) {
        for (let gx = minX; gx <= maxX; gx++) {
            const idx = gz * (groundSegments + 1) + gx;
            const vx = posAttr.getX(idx);
            const vz = posAttr.getZ(idx);

            const dist = Math.hypot(vx - hitPoint.x, vz - hitPoint.z);
            if (dist <= radius) {
                const edgeFactor = dist / radius;
                const factor = Math.pow(1.0 - smoothstep(0.4, 1.0, edgeFactor), 1.2);

                if (roadType === 'remove') {
                    colAttr.setXYZ(idx, defaultBaseGrassColor.r, defaultBaseGrassColor.g, defaultBaseGrassColor.b);
                } else if (roadType === 'road_clay') {
                    // Palet Albedo: Gradasi tanah liat kering ke lembap (Flat High-Detail Clay PBR)
                    const cDarkR = 108 / 255;
                    const cDarkG = 86 / 255;
                    const cDarkB = 64 / 255;
                    const cLightR = 168 / 255;
                    const cLightG = 142 / 255;
                    const cLightB = 112 / 255;

                    const nx = (vx + halfSize) / groundSize;
                    const nz = (vz + halfSize) / groundSize;

                    let h = fbm(nx * 16.0, nz * 16.0) * 0.65;
                    h += smoothNoise(nx * 100.0, nz * 100.0) * 0.25;
                    h += (Math.random() - 0.5) * 0.1;

                    const t = Math.min(1.0, Math.max(0.0, h * 1.15));
                    const grainNoise = ((Math.random() - 0.5) * 12) / 255;

                    const targetR = Math.min(1.0, Math.max(0.0, cDarkR + (cLightR - cDarkR) * t + grainNoise));
                    const targetG = Math.min(1.0, Math.max(0.0, cDarkG + (cLightG - cDarkG) * t + grainNoise * 0.85));
                    const targetB = Math.min(1.0, Math.max(0.0, cDarkB + (cLightB - cDarkB) * t + grainNoise * 0.65));

                    const curR = colAttr.getX(idx);
                    const curG = colAttr.getY(idx);
                    const curB = colAttr.getZ(idx);

                    const blendedR = THREE.MathUtils.lerp(curR, targetR, factor);
                    const blendedG = THREE.MathUtils.lerp(curG, targetG, factor);
                    const blendedB = THREE.MathUtils.lerp(curB, targetB, factor);

                    colAttr.setXYZ(idx, blendedR, blendedG, blendedB);
                } else {
                    const organicNoise = (Math.sin(vx * 1.8) * Math.cos(vz * 1.8) * 0.04) +
                        (Math.sin(vx * 5.2) * Math.cos(vz * 5.2) * 0.02) +
                        ((Math.random() - 0.5) * 0.03);

                    const targetCol = roadType === 'road_brown' ? dirtPathBase : mossyPathBase;

                    const curR = colAttr.getX(idx);
                    const curG = colAttr.getY(idx);
                    const curB = colAttr.getZ(idx);

                    const blendedR = THREE.MathUtils.lerp(curR, targetCol.r + organicNoise, factor);
                    const blendedG = THREE.MathUtils.lerp(curG, targetCol.g + organicNoise, factor);
                    const blendedB = THREE.MathUtils.lerp(curB, targetCol.b + organicNoise, factor);

                    colAttr.setXYZ(idx, blendedR, blendedG, blendedB);
                }
                modified = true;
            }
        }
    }

    if (modified) {
        colAttr.needsUpdate = true;
    }
}
