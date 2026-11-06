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

    // Gradasi sayap bercahaya neon magis
    const grad = ctx.createRadialGradient(40, 256, 15, 256, 256, 310);
    if (isCyanTheme) {
        grad.addColorStop(0.0, '#e0faff');
        grad.addColorStop(0.18, '#67e8f9');
        grad.addColorStop(0.45, '#06b6d4');
        grad.addColorStop(0.75, '#0891b2');
        grad.addColorStop(1.0, '#042f2e');
    } else {
        grad.addColorStop(0.0, '#e0f2fe');
        grad.addColorStop(0.18, '#38bdf8');
        grad.addColorStop(0.45, '#0284c7');
        grad.addColorStop(0.75, '#1e3a8a');
        grad.addColorStop(1.0, '#0f172a');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Pola urat sayap bercahaya neon (Electric Glow Veins)
    ctx.strokeStyle = isCyanTheme ? 'rgba(224, 254, 255, 0.95)' : 'rgba(224, 242, 254, 0.95)';
    ctx.shadowColor = isCyanTheme ? '#00f2fe' : '#38bdf8';
    ctx.shadowBlur = 14;

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

// ============================================================
// GENERATOR TEKSTUR & MATERIAL BLOOM GLOW FANTASI
// Multi-layer Additive bioluminescent halo untuk efek bloom
// ============================================================
let sharedBloomTextureBlue = null;
let sharedBloomTextureCyan = null;

function createButterflyBloomTexture(theme = 'blue') {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    const isCyanTheme = (theme === 'cyan');
    const rBase = isCyanTheme ? 180 : 190;
    const gBase = isCyanTheme ? 245 : 225;
    const bBase = 255;

    const half = size / 2;
    const maxR = half * 0.95;

    // Menghasilkan gradien Gaussian sejati berbasis piksel yang sangat halus,
    // tanpa banding, tanpa lingkaran kasar, dan menghilang secara samar ke 0
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = x - half;
            const dy = y - half;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const idx = (y * size + x) * 4;

            if (dist >= maxR) {
                data[idx] = 0;
                data[idx + 1] = 0;
                data[idx + 2] = 0;
                data[idx + 3] = 0;
                continue;
            }

            const rNorm = dist / maxR; // 0..1
            // Formula Gaussian Super-Smooth & Samar: exp(-4.8 * r^2) * (1 - r^2)^2
            // Memberikan falloff sempurna C^2 dengan turunan 0 di batas luar (tidak ada artefak garis)
            const tail = 1.0 - rNorm * rNorm;
            const gVal = Math.exp(-4.8 * rNorm * rNorm) * tail * tail;

            data[idx] = Math.round(rBase);
            data[idx + 1] = Math.round(gBase);
            data[idx + 2] = Math.round(bBase);
            data[idx + 3] = Math.round(gVal * 255);
        }
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
}

function getButterflyBloomTexture(theme = 'blue') {
    if (theme === 'cyan') {
        if (!sharedBloomTextureCyan) sharedBloomTextureCyan = createButterflyBloomTexture('cyan');
        return sharedBloomTextureCyan;
    }
    if (!sharedBloomTextureBlue) sharedBloomTextureBlue = createButterflyBloomTexture('blue');
    return sharedBloomTextureBlue;
}

let sharedBloomCoreMaterialBlue = null;
let sharedBloomCoreMaterialCyan = null;
let sharedBloomAuraMaterialBlue = null;
let sharedBloomAuraMaterialCyan = null;

function getBloomMaterials(theme = 'blue') {
    const isCyanTheme = (theme === 'cyan');
    if (isCyanTheme) {
        if (!sharedBloomCoreMaterialCyan) {
            sharedBloomCoreMaterialCyan = new THREE.SpriteMaterial({
                map: getButterflyBloomTexture('cyan'),
                color: 0xffffff,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                opacity: 0.18 // Halus & samar, tidak menyilaukan
            });
            sharedBloomAuraMaterialCyan = new THREE.SpriteMaterial({
                map: getButterflyBloomTexture('cyan'),
                color: 0x67e8f9,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                opacity: 0.08 // Kabut pendaran tipis magis
            });
        }
        return { core: sharedBloomCoreMaterialCyan, aura: sharedBloomAuraMaterialCyan };
    } else {
        if (!sharedBloomCoreMaterialBlue) {
            sharedBloomCoreMaterialBlue = new THREE.SpriteMaterial({
                map: getButterflyBloomTexture('blue'),
                color: 0xffffff,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                opacity: 0.18 // Halus & samar, tidak menyilaukan
            });
            sharedBloomAuraMaterialBlue = new THREE.SpriteMaterial({
                map: getButterflyBloomTexture('blue'),
                color: 0x7dd3fc,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                opacity: 0.08 // Kabut pendaran tipis magis
            });
        }
        return { core: sharedBloomCoreMaterialBlue, aura: sharedBloomAuraMaterialBlue };
    }
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
    emissive: 0x0284c7,
    emissiveIntensity: 0.65,
    roughness: 0.20,
    metalness: 0.6
});

const sharedEyeMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.8,
    roughness: 0.05
});

// Cache wing materials
const wingMaterialCache = {};
function getWingMaterial(theme = 'blue') {
    if (wingMaterialCache[theme]) return wingMaterialCache[theme];

    const mat = new THREE.MeshStandardMaterial({
        map: getWingTexture(theme),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.94,
        roughness: 0.12,
        metalness: 0.15,
        blending: THREE.NormalBlending,
        emissive: theme === 'cyan' ? 0x22d3ee : 0x38bdf8,
        emissiveIntensity: 0.35
    });
    wingMaterialCache[theme] = mat;
    return mat;
}

// 3. MODEL KUPU-KUPU
// Semua kupu-kupu digambar bersama: badan, mata, sayap (per tema) memakai InstancedMesh dan pendarannya
// memakai Points. Dulu satu kupu-kupu = 19 draw call (17 mesh + 2 sprite); sekarang seluruh kawanan
// hanya beberapa draw call, jadi beban CPU per frame tidak bertambah seiring jumlah kupu-kupu.
const BUTTERFLY_THEMES = ['blue', 'cyan'];
const BUTTERFLY_BLOOM_OFFSET = new THREE.Vector3(0, 0.04, 0.06);
const BUTTERFLY_BLOOM_CORE = 1.9;
const BUTTERFLY_BLOOM_AURA = 3.6;

// Gabungkan beberapa geometri (posisi + normal) menjadi satu, masing-masing dengan matriksnya
function mergeButterflyParts(parts) {
    let vertexCount = 0;
    let indexCount = 0;
    parts.forEach(({ geometry }) => {
        vertexCount += geometry.attributes.position.count;
        indexCount += geometry.index ? geometry.index.count : geometry.attributes.position.count;
    });
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(indexCount);
    const point = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();
    let vertexOffset = 0;
    let indexOffset = 0;
    parts.forEach(({ geometry, matrix }) => {
        const position = geometry.attributes.position;
        const normal = geometry.attributes.normal;
        normalMatrix.getNormalMatrix(matrix);
        for (let i = 0; i < position.count; i++) {
            point.fromBufferAttribute(position, i).applyMatrix4(matrix);
            positions.set([point.x, point.y, point.z], (vertexOffset + i) * 3);
            point.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
            normals.set([point.x, point.y, point.z], (vertexOffset + i) * 3);
        }
        const count = geometry.index ? geometry.index.count : position.count;
        for (let i = 0; i < count; i++) {
            indices[indexOffset + i] = (geometry.index ? geometry.index.getX(i) : i) + vertexOffset;
        }
        vertexOffset += position.count;
        indexOffset += count;
    });
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
    merged.computeBoundingSphere();
    return merged;
}

function createButterflyBatchGeometries() {
    const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
    const body = [
        { geometry: sharedThoraxGeom, matrix: at(0, 0, 0.05) },
        { geometry: sharedHeadGeom, matrix: at(0, 0.02, 0.32) },
        { geometry: leftAntennaData.tube, matrix: new THREE.Matrix4() },
        { geometry: rightAntennaData.tube, matrix: new THREE.Matrix4() }
    ];
    // Perut sedikit menekuk ke bawah, seperti pose rata-rata kepakan sebelumnya
    const abdomen = new THREE.Matrix4().makeRotationX(-0.08);
    for (let i = 0; i < 5; i++) {
        body.push({ geometry: sharedSegGeoms[i], matrix: abdomen.clone().multiply(at(0, -0.01 * i, -0.15 - (i * 0.11))) });
    }
    const eyes = [
        { geometry: sharedEyeGeom, matrix: at(0.055, 0.05, 0.36) },
        { geometry: sharedEyeGeom, matrix: at(-0.055, 0.05, 0.36) },
        { geometry: sharedAntennaTipGeom, matrix: at(leftAntennaData.tipPos.x, leftAntennaData.tipPos.y, leftAntennaData.tipPos.z) },
        { geometry: sharedAntennaTipGeom, matrix: at(rightAntennaData.tipPos.x, rightAntennaData.tipPos.y, rightAntennaData.tipPos.z) }
    ];
    // Sayap kanan dicerminkan langsung di geometri (urutan segitiga dibalik), supaya matriks
    // instance tidak bernilai negatif dan pencahayaan sisi sayap tetap benar
    const rightWing = sharedWingGeom.clone();
    rightWing.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
    const index = rightWing.index;
    for (let i = 0; i < index.count; i += 3) {
        const second = index.getX(i + 1);
        index.setX(i + 1, index.getX(i + 2));
        index.setX(i + 2, second);
    }
    return { body: mergeButterflyParts(body), eyes: mergeButterflyParts(eyes), leftWing: sharedWingGeom, rightWing };
}

const ButterflyBatch = {
    capacity: 0,
    meshes: null,
    geometries: null,
    temp: {
        wing: new THREE.Matrix4(),
        pivot: new THREE.Matrix4(),
        rotation: new THREE.Matrix4(),
        euler: new THREE.Euler(),
        point: new THREE.Vector3()
    },

    makeMesh(geometry, material, capacity) {
        const mesh = new THREE.InstancedMesh(geometry, material, capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Kawanan tersebar di seluruh peta; batas instance tidak diketahui, jadi tidak dipotong frustum
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.count = 0;
        butterfliesGroup.add(mesh);
        return mesh;
    },

    makeGlow(theme, capacity, color, opacity) {
        const geometry = new THREE.BufferGeometry();
        const attribute = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
        attribute.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute('position', attribute);
        geometry.setDrawRange(0, 0);
        const material = new THREE.PointsMaterial({
            map: getButterflyBloomTexture(theme),
            color,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity,
            sizeAttenuation: true
        });
        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        butterfliesGroup.add(points);
        return points;
    },

    dispose() {
        if (!this.meshes) return;
        const m = this.meshes;
        [m.body, m.eyes].forEach(mesh => butterfliesGroup.remove(mesh));
        BUTTERFLY_THEMES.forEach((theme) => {
            const t = m.themes[theme];
            [t.leftWing, t.rightWing].forEach(mesh => butterfliesGroup.remove(mesh));
            [t.core, t.aura].forEach((points) => {
                butterfliesGroup.remove(points);
                points.geometry.dispose();
                points.material.dispose();
            });
        });
        this.meshes = null;
    },

    ensure(count) {
        if (this.meshes && count <= this.capacity) return;
        this.dispose();
        if (!this.geometries) this.geometries = createButterflyBatchGeometries();
        const capacity = Math.max(32, Math.ceil(count / 32) * 32);
        const g = this.geometries;
        const themes = {};
        BUTTERFLY_THEMES.forEach((theme) => {
            const wing = getWingMaterial(theme);
            const isCyan = theme === 'cyan';
            themes[theme] = {
                leftWing: this.makeMesh(g.leftWing, wing, capacity),
                rightWing: this.makeMesh(g.rightWing, wing, capacity),
                core: this.makeGlow(theme, capacity, 0xffffff, 0.18),
                aura: this.makeGlow(theme, capacity, isCyan ? 0x67e8f9 : 0x7dd3fc, 0.08),
                count: 0
            };
        });
        this.meshes = {
            body: this.makeMesh(g.body, sharedBodyMaterial, capacity),
            eyes: this.makeMesh(g.eyes, sharedEyeMaterial, capacity),
            themes
        };
        this.capacity = capacity;
    },

    // Matriks satu sayap: badan -> engsel sayap -> putaran kepakan
    wingMatrix(root, x, flex, flap) {
        const t = this.temp;
        t.pivot.makeTranslation(x, 0.02, 0.05);
        t.rotation.makeRotationFromEuler(t.euler.set(flex, 0, flap));
        return t.wing.multiplyMatrices(root, t.pivot).multiply(t.rotation);
    },

    begin(count) {
        this.ensure(count);
        BUTTERFLY_THEMES.forEach((theme) => { this.meshes.themes[theme].count = 0; });
    },

    add(index, b, flapAngle, wingFlex) {
        const m = this.meshes;
        const root = b.root.matrix;
        m.body.setMatrixAt(index, root);
        m.eyes.setMatrixAt(index, root);
        const t = m.themes[b.theme] || m.themes.blue;
        const k = t.count++;
        t.leftWing.setMatrixAt(k, this.wingMatrix(root, 0.065, wingFlex, flapAngle));
        t.rightWing.setMatrixAt(k, this.wingMatrix(root, -0.065, wingFlex, -flapAngle));
        const p = this.temp.point.copy(BUTTERFLY_BLOOM_OFFSET).applyMatrix4(root);
        t.core.geometry.attributes.position.setXYZ(k, p.x, p.y, p.z);
        t.aura.geometry.attributes.position.setXYZ(k, p.x, p.y, p.z);
    },

    end(count) {
        const m = this.meshes;
        [m.body, m.eyes].forEach((mesh) => {
            mesh.count = count;
            mesh.visible = count > 0;
            mesh.instanceMatrix.needsUpdate = true;
        });
        // Ukuran titik setara sprite lama: ukuran dunia dibagi tan(setengah FOV kamera)
        const fov = (typeof camera !== 'undefined' && camera.isPerspectiveCamera) ? camera.fov : 50;
        const perWorld = 1 / Math.tan(THREE.MathUtils.degToRad(fov) * 0.5);
        const scale = butterflyParams.staticScale * perWorld;
        BUTTERFLY_THEMES.forEach((theme) => {
            const t = m.themes[theme];
            [t.leftWing, t.rightWing].forEach((mesh) => {
                mesh.count = t.count;
                mesh.visible = t.count > 0;
                mesh.instanceMatrix.needsUpdate = true;
            });
            [[t.core, BUTTERFLY_BLOOM_CORE], [t.aura, BUTTERFLY_BLOOM_AURA]].forEach(([points, size]) => {
                points.geometry.setDrawRange(0, t.count);
                points.geometry.attributes.position.needsUpdate = true;
                points.material.size = size * scale;
                points.visible = t.count > 0;
            });
        });
    }
};

// Satu kupu-kupu kini hanya titik acuan (posisi + arah); bentuknya digambar oleh ButterflyBatch
function buildButterflyModel(theme = 'blue') {
    const root = new THREE.Group();
    const staticScale = butterflyParams.staticScale; // Selalu kecil & tidak dapat diubah ukurannya
    root.scale.set(staticScale, staticScale, staticScale);
    root.matrixAutoUpdate = false;
    return { root, theme };
}

// 4. PENEMPATAN KUPU-KUPU DENGAN KUAS (PLACE BUTTERFLIES)
function placeButterfliesAt(intersectPoint, butterflyType = 'spawn_butterfly_blue') {
    const isCyan = (butterflyType === 'spawn_butterfly_cyan');
    const theme = isCyan ? 'cyan' : 'blue';

    const radius = butterflyParams.brushRadius;
    const count = (radius < 1.5) ? 1 : Math.max(1, Math.round(butterflyParams.butterflyDensity * (radius / 3.5)));

    const groundBound = (typeof groundSize !== 'undefined' ? groundSize / 2 : 75) - 2.0;

    for (let i = 0; i < count; i++) {
        if (butterfliesList.length >= 120) break; // Batas wajar populasi serangga agar performa selalu 60 FPS

        const r = (count === 1) ? 0 : (radius * 0.75 * Math.sqrt(Math.random()));
        const theta = Math.random() * 2 * Math.PI;

        const centerX = intersectPoint.x + (count === 1 ? 0 : r * Math.cos(theta));
        const centerZ = intersectPoint.z + (count === 1 ? 0 : r * Math.sin(theta));

        if (Math.abs(centerX) > groundBound || Math.abs(centerZ) > groundBound) continue;

        // Cegah penumpukan terlalu rapat di titik yang sama (< 0.6m)
        let tooClose = false;
        for (let j = 0; j < butterfliesList.length; j++) {
            const b = butterfliesList[j];
            if (Math.hypot(b.centerX - centerX, b.centerZ - centerZ) < 0.6) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) continue;

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
    if (!butterfliesList || butterfliesList.length === 0) {
        if (ButterflyBatch.meshes) {
            ButterflyBatch.begin(0);
            ButterflyBatch.end(0);
        }
        return;
    }
    // Kawanan disembunyikan (layer editor): tidak perlu dihitung
    if (!butterfliesGroup.visible) return;
    ButterflyBatch.begin(butterfliesList.length);

    for (let i = 0; i < butterfliesList.length; i++) {
        const b = butterfliesList[i];

        // 1. Kepakan Sayap (Natural Wing Flapping)
        const flapCycle = elapsedTime * b.flapSpeed + b.phase;
        const flapBase = Math.sin(flapCycle);
        const flapAngle = (flapBase + Math.sin(flapCycle * 2) * 0.12) * 0.72;
        const wingFlex = Math.cos(flapCycle) * 0.08;

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
        const nextX = b.centerX + Math.sin(nextT) * b.radiusX;
        const nextZ = b.centerZ + Math.sin(2 * nextT) * b.radiusZ;
        // Tanah di antara dua titik yang sangat dekat dianggap sama tinggi
        const nextY = terrainY + b.hoverHeight + Math.cos(nextT * 1.5) * 0.3;

        b.root.lookAt(nextX, nextY, nextZ);

        // Banking roll
        b.root.rotateZ(-Math.sin(currentT) * 0.32);
        b.root.updateMatrix();

        ButterflyBatch.add(i, b, flapAngle, wingFlex);
    }
    ButterflyBatch.end(butterfliesList.length);
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
