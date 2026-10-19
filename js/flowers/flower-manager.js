/* ========================================================
   GENSHIN / GHIBLI STYLIZED LOTUS FLOWER MANAGER
   High-performance GPU InstancedMesh system (Zero framedrops)
   with anime cel-shaded foliage shader, matte watercolor
   gradient, alpha cutout, and wind-responsive vertex sway
   matching the dynamic grass system perfectly.
   ======================================================== */

// Global state for Flowers
const flowersList = [];
window.flowersList = flowersList;

const maxFlowerCapacity = 10000;
let instancedFlowerMesh = null;
let flowerSystem = null;

// Parameter kuas bunga (Ukuran static kecil, tidak ada slider ukuran di UI)
// Parameter kuas bunga (Ukuran proporsional, bervolume, dan serasi dengan rumput & bebatuan)
const flowerParams = {
    brushRadius: 3.5,
    flowerDensity: 3,
    staticScale: 1.0
};

// 1. TEMA WARNA BUNGA GENSHIN (CEL-SHADED ANIME PALETTE)
const FLOWER_THEMES = {
    cyan: {
        id: 'spawn_flower_cyan',
        name: 'Nilotpala Cyan',
        color: new THREE.Color(0x38bdf8),
        stamenColor: new THREE.Color(0xfacc15)
    },
    blue: {
        id: 'spawn_flower_blue',
        name: 'Mystic Blue',
        color: new THREE.Color(0x3b82f6),
        stamenColor: new THREE.Color(0xfb923c)
    },
    violet: {
        id: 'spawn_flower_violet',
        name: 'Lunar Violet',
        color: new THREE.Color(0xc084fc),
        stamenColor: new THREE.Color(0xfde047)
    },
    solar: {
        id: 'spawn_flower_solar',
        name: 'Solar Amber',
        color: new THREE.Color(0xfbbf24),
        stamenColor: new THREE.Color(0xef4444)
    }
};

// 2. GENERATOR TEKSTUR ATLAS BUNGA ANIME (HAND-PAINTED GHIBLI/GENSHIN STYLE - ZERO BLACK OUTLINE)
function createGenshinFlowerAtlasTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 512);

    // ==========================================
    // BAGIAN BAWAH (y: 256 s/d 512): SATU RANTING & DAUN ALAMI
    // ==========================================
    ctx.save();

    // 1. Batang Utama Tegak Alami (Tepat di tengah x=256, dari tanah y=512 sampai ujung mahkota y=260)
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#059669';
    ctx.beginPath();
    ctx.moveTo(256, 512);
    ctx.quadraticCurveTo(253, 386, 256, 260);
    ctx.stroke();

    ctx.lineWidth = 7;
    ctx.strokeStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(256, 512);
    ctx.quadraticCurveTo(253, 386, 256, 260);
    ctx.stroke();

    // Highlight batang
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#6ee7b7';
    ctx.beginPath();
    ctx.moveTo(255, 508);
    ctx.quadraticCurveTo(252, 386, 255, 265);
    ctx.stroke();

    // 2. Sepasang Daun Bawah (Terhubung langsung ke batang di y=420)
    // Daun kiri bawah
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.moveTo(254, 428);
    ctx.bezierCurveTo(210, 436, 155, 418, 138, 386);
    ctx.bezierCurveTo(152, 360, 208, 372, 254, 404);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(254, 424);
    ctx.bezierCurveTo(212, 430, 164, 414, 150, 388);
    ctx.bezierCurveTo(162, 368, 208, 378, 254, 404);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#6ee7b7';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(254, 412);
    ctx.quadraticCurveTo(200, 398, 148, 386);
    ctx.stroke();

    // Daun kanan bawah
    ctx.fillStyle = '#047857';
    ctx.beginPath();
    ctx.moveTo(258, 418);
    ctx.bezierCurveTo(302, 426, 356, 408, 374, 376);
    ctx.bezierCurveTo(360, 350, 304, 362, 258, 394);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(258, 414);
    ctx.bezierCurveTo(300, 420, 348, 404, 362, 378);
    ctx.bezierCurveTo(350, 358, 304, 368, 258, 394);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#a7f3d0';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(258, 402);
    ctx.quadraticCurveTo(312, 388, 364, 376);
    ctx.stroke();

    // 3. Sepasang Daun Atas (Lebih ramping di y=335)
    // Daun kiri atas
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.moveTo(255, 345);
    ctx.bezierCurveTo(222, 350, 185, 336, 172, 312);
    ctx.bezierCurveTo(182, 294, 220, 304, 255, 328);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(255, 342);
    ctx.bezierCurveTo(224, 346, 192, 334, 182, 314);
    ctx.bezierCurveTo(190, 300, 220, 308, 255, 328);
    ctx.closePath();
    ctx.fill();

    // Daun kanan atas
    ctx.fillStyle = '#047857';
    ctx.beginPath();
    ctx.moveTo(257, 335);
    ctx.bezierCurveTo(290, 340, 326, 326, 340, 302);
    ctx.bezierCurveTo(330, 284, 292, 294, 257, 318);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(257, 332);
    ctx.bezierCurveTo(288, 336, 320, 324, 330, 304);
    ctx.bezierCurveTo(322, 290, 292, 298, 257, 318);
    ctx.closePath();
    ctx.fill();

    // 4. Kelopak Calyx Pelindung di Pucuk Ranting (Membungkus dasar bunga tepat di y=260)
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.moveTo(232, 260);
    ctx.lineTo(244, 276);
    ctx.lineTo(256, 266);
    ctx.lineTo(268, 276);
    ctx.lineTo(280, 260);
    ctx.lineTo(256, 256);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#6ee7b7';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();

    // ==========================================
    // BAGIAN ATAS (y: 0 s/d 256): SATU KEPALA BUNGA MEKAR (SINGLE BLOSSOM)
    // ==========================================
    const centerX = 256;
    const centerY = 128;

    // Helper fungsi menggambar kelopak bunga teratai bergaya anime watercolor (Tanpa outline gelap!)
    function drawPetal(angle, length, width, baseColor, tipColor) {
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-width * 0.45, -length * 0.35, -width * 0.65, -length * 0.75, 0, -length);
        ctx.bezierCurveTo(width * 0.65, -length * 0.75, width * 0.45, -length * 0.35, 0, 0);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, 0, 0, -length);
        grad.addColorStop(0.0, baseColor);
        grad.addColorStop(0.55, tipColor);
        grad.addColorStop(1.0, '#ffffff'); // Ujung kelopak putih bersinar murni
        ctx.fillStyle = grad;
        ctx.fill();

        // Stroke lembut putih translusen sebagai pendaran anime
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1.0;
        ctx.stroke();

        ctx.restore();
    }

    // Layer 1: 12 Kelopak Luar Melingkar Penuh (Outer Petals)
    const outerCount = 12;
    for (let i = 0; i < outerCount; i++) {
        const ang = (i * Math.PI * 2) / outerCount;
        drawPetal(ang, 114, 48, '#cbd5e1', '#f1f5f9');
    }

    // Layer 2: 12 Kelopak Tengah (Mid Petals bersilang 15 derajat)
    for (let i = 0; i < outerCount; i++) {
        const ang = (i * Math.PI * 2) / outerCount + (Math.PI / outerCount);
        drawPetal(ang, 94, 40, '#e2e8f0', '#ffffff');
    }

    // Layer 3: 8 Kelopak Dalam (Inner Petals)
    for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI * 2) / 8 + (Math.PI / 16);
        drawPetal(ang, 70, 32, '#f1f5f9', '#ffffff');
    }

    // Inti Benang Sari Emas Cerah (Golden Stamen & Pod - Tanpa warna gelap)
    ctx.save();

    // 14 Titik Benang Sari Emas
    const stamenRadius = 26;
    for (let i = 0; i < 14; i++) {
        const ang = (i * Math.PI * 2) / 14;
        const px = centerX + Math.cos(ang) * stamenRadius;
        const py = centerY + Math.sin(ang) * stamenRadius;

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(px, py, 3.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.0;
        ctx.stroke();
    }

    // Kantung sari tengah (Warm Honey Golden Seed Pod)
    const podGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 18);
    podGrad.addColorStop(0.0, '#fef9c3');
    podGrad.addColorStop(0.60, '#facc15');
    podGrad.addColorStop(1.0, '#d97706');
    ctx.fillStyle = podGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 18, 0, Math.PI * 2);
    ctx.fill();

    // Bintik halus biji teratai keemasan
    ctx.fillStyle = '#b45309';
    for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI * 2) / 6;
        const bx = centerX + Math.cos(ang) * 9;
        const by = centerY + Math.sin(ang) * 9;
        ctx.beginPath();
        ctx.arc(bx, by, 1.8, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(centerX, centerY, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
}

// 3. GEOMETRI TERATAI 1 RANTING 1 BUNGA (PRESISI DUDUK DI PUNCAK RANTING)
function createGenshinFlowerGeometry() {
    const geometries = [];

    // --- BAGIAN 1: SATU RANTING UTAMA (Single Upright Stem + Attached Leaves) ---
    // 2 kartu bersilang 90 derajat: dasar menempel tanah (y=0.0), puncak tepat di y=0.60m
    const stemHeight = 0.60;
    const stemWidth = 0.40;
    const stemPlane = new THREE.PlaneGeometry(stemWidth, stemHeight);
    stemPlane.translate(0, stemHeight / 2, 0); // Dasar di y = 0.0, puncak di y = 0.60m

    // Remap UV ranting ke separuh bawah tekstur atlas (v: 0.0 s/d 0.5)
    const stemUv = stemPlane.attributes.uv;
    for (let i = 0; i < stemUv.count; i++) {
        stemUv.setY(i, stemUv.getY(i) * 0.5);
    }

    [0, Math.PI / 2].forEach(ang => {
        const g = stemPlane.clone();
        g.rotateY(ang);
        geometries.push(g);
    });

    // --- BAGIAN 2: SATU KEPALA BUNGA TEPAT DI PUNCAK RANTING (Single Blossom Cup) ---
    // Pusat bunga menempel persis di ujung atas ranting (y = 0.60m)
    // Menggunakan grid 4x4 segmen agar kelopak melengkung membentuk cangkang bunga mekar 3D
    const blossomSize = 0.50;
    const blossomPlane = new THREE.PlaneGeometry(blossomSize, blossomSize, 4, 4);
    blossomPlane.rotateX(-Math.PI / 2); // Menghadap ke atas
    blossomPlane.translate(0, stemHeight, 0); // Duduk presisi di puncak ranting (y = 0.60m)

    // Cekungkan kelopak ke atas (Pusat di y=0.60m menempel ranting, ujung kelopak naik melengkung anggun)
    const bPos = blossomPlane.attributes.position;
    for (let i = 0; i < bPos.count; i++) {
        const x = bPos.getX(i);
        const z = bPos.getZ(i);
        const distCenter = Math.hypot(x, z);
        bPos.setY(i, bPos.getY(i) + Math.pow(distCenter / (blossomSize * 0.5), 1.5) * 0.07);
    }
    blossomPlane.computeVertexNormals();

    // Remap UV kelopak ke separuh atas tekstur atlas (v: 0.5 s/d 1.0)
    const blossomUv = blossomPlane.attributes.uv;
    for (let i = 0; i < blossomUv.count; i++) {
        blossomUv.setY(i, 0.5 + blossomUv.getY(i) * 0.5);
    }

    // 3 layer silang mahkota bunga untuk volume rimbun dari segala arah (0, 45, dan 22.5 derajat)
    [0, Math.PI / 4, Math.PI / 8].forEach((ang, idx) => {
        const g = blossomPlane.clone();
        g.rotateY(ang);
        if (idx > 0) g.translate(0, idx * 0.006, 0); // Offset elevasi sangat tipis untuk layer kelopak
        geometries.push(g);
    });

    // Gabungkan seluruh plane ke dalam 1 BufferGeometry tunggal
    let totalVertices = 0;
    let totalIndices = 0;
    geometries.forEach(g => {
        totalVertices += g.attributes.position.count;
        totalIndices += g.index.count;
    });

    const posArray = new Float32Array(totalVertices * 3);
    const uvArray = new Float32Array(totalVertices * 2);
    const indexArray = new Uint32Array(totalIndices);

    let vOffset = 0;
    let iOffset = 0;

    geometries.forEach(g => {
        const pos = g.attributes.position.array;
        const uv = g.attributes.uv.array;
        const idx = g.index.array;

        posArray.set(pos, vOffset * 3);
        uvArray.set(uv, vOffset * 2);

        for (let j = 0; j < idx.length; j++) {
            indexArray[iOffset + j] = idx[j] + vOffset;
        }

        vOffset += g.attributes.position.count;
        iOffset += idx.length;
    });

    const compoundGeo = new THREE.BufferGeometry();
    compoundGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    compoundGeo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
    compoundGeo.setIndex(new THREE.BufferAttribute(indexArray, 1));
    compoundGeo.computeVertexNormals();

    return compoundGeo;
}

const flowerTrampleSegAB = (typeof trampleSegABArray !== 'undefined') ? trampleSegABArray : [];
const flowerTrampleSegData = (typeof trampleSegDataArray !== 'undefined') ? trampleSegDataArray : [];
if (flowerTrampleSegAB.length === 0) {
    for (let i = 0; i < 36; i++) {
        flowerTrampleSegAB.push(new THREE.Vector4(0, 0, 0, 0));
        flowerTrampleSegData.push(new THREE.Vector4(0, 0, 0, 0));
    }
}

// 4. SHADER BUNGA KHAS ANIME GENSHIN IMPACT (CEL-SHADED + MATTE WATERCOLOR + ANGIN + TRAMPLE DEFORM)
const genshinFlowerShader = {
    uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.lights,
        THREE.UniformsLib.fog,
        {
            uTexture: { value: null },
            uTime: { value: 0 },
            uWindSpeed: { value: 1.0 },
            uTrampleSegAB: { value: flowerTrampleSegAB },
            uTrampleSegData: { value: flowerTrampleSegData },
            uTrampleCount: { value: 0 },
            uTrampleCenter: { value: new THREE.Vector2(0, 0) },
            uTrampleRadiusSq: { value: 0.0 }
        }
    ]),
    vertexShader: `
        #include <common>
        #include <shadowmap_pars_vertex>
        #include <fog_pars_vertex>

        #define MAX_TRAMPLE_SEGMENTS 36
        uniform float uTime;
        uniform float uWindSpeed;
        uniform vec4 uTrampleSegAB[MAX_TRAMPLE_SEGMENTS];
        uniform vec4 uTrampleSegData[MAX_TRAMPLE_SEGMENTS];
        uniform int uTrampleCount;
        uniform vec2 uTrampleCenter;
        uniform float uTrampleRadiusSq;

        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vInstanceColor;

        attribute vec3 instanceColor;

        void main() {
            vUv = uv;
            vInstanceColor = instanceColor;
            vec3 pos = position;

            // Hitung injakan rubah (Trample) - kapsul trail jejak langkah
            vec2 instXZ = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
            float totalBend = 0.0;
            vec2 bendDir = vec2(0.0);

            vec2 trailDelta = instXZ - uTrampleCenter;
            if (uTrampleCount > 0 && dot(trailDelta, trailDelta) <= uTrampleRadiusSq) {
                for (int i = 0; i < MAX_TRAMPLE_SEGMENTS; i++) {
                    if (i >= uTrampleCount) break;
                    float rawStrength = uTrampleSegData[i].x;
                    if (rawStrength > 0.005) {
                        vec2 a = uTrampleSegAB[i].xy;
                        vec2 b = uTrampleSegAB[i].zw;
                        float rad = uTrampleSegData[i].y * 1.35; // radius kontak injakan sedikit lebih luas untuk batang bunga

                        vec2 pa = instXZ - a;
                        vec2 ba = b - a;
                        float baLenSq = dot(ba, ba);
                        float h = (baLenSq > 0.0001) ? clamp(dot(pa, ba) / baLenSq, 0.0, 1.0) : 0.0;
                        vec2 diff = pa - ba * h;
                        float distSq = dot(diff, diff);
                        float radSq = rad * rad;

                        if (distSq < radSq) {
                            float dist = sqrt(distSq);
                            float t = 1.0 - (dist / rad);
                            float smoothStrength = rawStrength * rawStrength * (3.0 - 2.0 * rawStrength);
                            float weight = (t * t * (3.0 - 2.0 * t)) * smoothStrength;
                            totalBend = max(totalBend, weight);
                            vec2 dir = (dist > 0.005) ? (diff / dist) : vec2(0.0, 1.0);
                            bendDir += dir * weight;
                        }
                    }
                }
            }

            float bendFactor = clamp(totalBend, 0.0, 1.0);

            // Goyangan hembusan angin organik selaras dengan rumput
            if (uWindSpeed > 0.0) {
                float instX = instanceMatrix[3][0];
                float instZ = instanceMatrix[3][2];

                float waveX = sin(uTime * 2.8 * uWindSpeed + instX * 1.5 + instZ * 1.5) * 0.10 * uWindSpeed;
                float waveZ = cos(uTime * 2.2 * uWindSpeed + instX * 1.2 + instZ * 1.2) * 0.06 * uWindSpeed;

                // Redam goyangan angin saat bunga sedang terinjak/roboh
                waveX *= (1.0 - bendFactor * 0.85);
                waveZ *= (1.0 - bendFactor * 0.85);

                float swayHeight = pow(clamp(pos.y / 0.60, 0.0, 1.0), 1.35);
                pos.x += waveX * swayHeight;
                pos.z += waveZ * swayHeight;

                pos.y += sin(uTime * 2.5 + instX + instZ) * 0.008 * swayHeight;
            }

            // Deformasi Roboh Saat Diinjak & Bangkit Kembali Berdiri
            if (bendFactor > 0.001) {
                float hRatio = clamp(pos.y / 0.60, 0.0, 1.0);
                // Bunga rebah ke tanah (pos.y pipih mendekati tanah)
                float squash = mix(1.0, 0.20, bendFactor * pow(hRatio, 0.85));
                pos.y *= squash;

                // Batang melengkung rebah ke arah langkah injakan
                vec2 leanOffset = (length(bendDir) > 0.001) ? normalize(bendDir) * 0.42 * bendFactor * pow(hRatio, 1.2) : vec2(0.0);
                pos.x += leanOffset.x;
                pos.z += leanOffset.y;
            }

            vec4 worldPosition = modelMatrix * instanceMatrix * vec4(pos, 1.0);
            vWorldPosition = worldPosition.xyz;

            vec3 objectNormal = vec3(0.0, 1.0, 0.0);
            vec3 transformedNormal = normalMatrix * objectNormal;

            vec4 mvPosition = viewMatrix * worldPosition;
            gl_Position = projectionMatrix * mvPosition;

            #include <shadowmap_vertex>
            #include <fog_vertex>
        }
    `,
    fragmentShader: `
        #include <common>
        #include <packing>
        #include <shadowmap_pars_fragment>
        #include <fog_pars_fragment>

        uniform sampler2D uTexture;
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vInstanceColor;

        // Helper non-linear smoothstep untuk gradasi kelopak cat air
        float petalGradSpread(float t) {
            return t * t * (3.0 - 2.0 * t);
        }

        void main() {
            vec4 texColor = texture2D(uTexture, vUv);

            // Cutoff alpha bersih (Mencegah garis tepi buram / halo gelap)
            if (texColor.a < 0.48) discard;

            // Unpremultiply alpha: pulihkan warna murni dari alpha anti-aliasing (Anti-border hitam!)
            vec3 cleanTexRgb = clamp(texColor.rgb / max(texColor.a, 0.001), 0.0, 1.0);

            vec3 finalColor;

            if (vUv.y < 0.5) {
                // Separuh Bawah: Rumpun Batang & Daun (Hijau jade/emerald alami)
                vec3 stemBase = vec3(0.04, 0.36, 0.22);
                vec3 stemTop = vec3(0.10, 0.64, 0.38);
                vec3 greenTone = mix(stemBase, stemTop, vUv.y * 2.0);
                finalColor = greenTone * cleanTexRgb * 1.25;
            } else {
                // Separuh Atas: Kepala Bunga Teratai
                vec2 center = vec2(0.5, 0.75);
                vec2 delta = (vUv - center);
                delta.y *= 2.0; // Koreksi rasio lingkaran
                float dist = length(delta);

                if (dist < 0.12) {
                    // Inti benang sari & putik emas cerah bercahaya
                    vec3 goldCore = vec3(1.0, 0.82, 0.20);
                    finalColor = mix(goldCore, cleanTexRgb, 0.25);
                } else {
                    // Kelopak Teratai: Diwarnai oleh vInstanceColor dengan gradasi cat air bersih tanpa border hitam
                    float petalSpread = smoothstep(0.12, 0.44, dist);
                    vec3 basePetal = vInstanceColor * 0.90;
                    vec3 tipPetal = mix(vInstanceColor * 1.35, vec3(1.0, 1.0, 1.0), 0.45);

                    vec3 watercolor = mix(basePetal, tipPetal, petalGradSpread(petalSpread));
                    // Modulasi halus mempertahankan kecerahan kelopak murni (tidak pernah gelap ke hitam!)
                    finalColor = watercolor * mix(vec3(0.92), vec3(1.08), cleanTexRgb.r);
                }
            }

            // Pencahayaan Cel-Shaded Lembut (Soft Toon Diffuse, bukan plastik mengkilap!)
            float shadowVal = 1.0;
            #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
                shadowVal = getShadow(
                    directionalShadowMap[0],
                    directionalLightShadows[0].shadowMapSize,
                    directionalLightShadows[0].shadowBias,
                    directionalLightShadows[0].shadowRadius,
                    vDirectionalShadowCoord[0]
                );
            #endif

            float softShadow = smoothstep(0.0, 0.9, shadowVal);
            vec3 litColor = mix(finalColor * 0.52, finalColor * 1.08, softShadow);

            // Cahaya pendaran magis tipis pada kelopak teratai saat senja/malam
            if (vUv.y >= 0.5) {
                litColor += vInstanceColor * 0.16;
            }

            gl_FragColor = vec4(litColor, 1.0);
            #include <fog_fragment>
        }
    `
};

// 5. INISIALISASI SISTEM BUNGA INSTANCED
function initGenshinFlowerSystem() {
    const texture = createGenshinFlowerAtlasTexture();
    const geometry = createGenshinFlowerGeometry();

    const material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(genshinFlowerShader.uniforms),
        vertexShader: genshinFlowerShader.vertexShader,
        fragmentShader: genshinFlowerShader.fragmentShader,
        side: THREE.DoubleSide,
        lights: true,
        fog: true
    });
    material.uniforms.uTexture.value = texture;

    instancedFlowerMesh = new THREE.InstancedMesh(geometry, material, maxFlowerCapacity);
    instancedFlowerMesh.receiveShadow = true;
    instancedFlowerMesh.castShadow = true;
    instancedFlowerMesh.count = 0; // Mulai dari 0 instance (Draw call 0 saat belum ada bunga)

    // Material bayangan khusus berbasis alpha atlas: bayangan hanya mengikuti bentuk fisik ranting & kelopak, bukan kotak penuh!
    const flowerDepthMaterial = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        map: texture,
        alphaTest: 0.48,
        side: THREE.DoubleSide
    });

    flowerDepthMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = genshinFlowerShader.uniforms.uTime;
        shader.uniforms.uWindSpeed = genshinFlowerShader.uniforms.uWindSpeed;
        shader.uniforms.uTrampleSegAB = genshinFlowerShader.uniforms.uTrampleSegAB;
        shader.uniforms.uTrampleSegData = genshinFlowerShader.uniforms.uTrampleSegData;
        shader.uniforms.uTrampleCount = genshinFlowerShader.uniforms.uTrampleCount;
        shader.uniforms.uTrampleCenter = genshinFlowerShader.uniforms.uTrampleCenter;
        shader.uniforms.uTrampleRadiusSq = genshinFlowerShader.uniforms.uTrampleRadiusSq;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
            #define MAX_TRAMPLE_SEGMENTS 36
            uniform float uTime;
            uniform float uWindSpeed;
            uniform vec4 uTrampleSegAB[MAX_TRAMPLE_SEGMENTS];
            uniform vec4 uTrampleSegData[MAX_TRAMPLE_SEGMENTS];
            uniform int uTrampleCount;
            uniform vec2 uTrampleCenter;
            uniform float uTrampleRadiusSq;
            `
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            vec3 transformed = vec3( position );

            vec2 instXZ = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
            float totalBend = 0.0;
            vec2 bendDir = vec2(0.0);

            vec2 trailDelta = instXZ - uTrampleCenter;
            if (uTrampleCount > 0 && dot(trailDelta, trailDelta) <= uTrampleRadiusSq) {
                for (int i = 0; i < MAX_TRAMPLE_SEGMENTS; i++) {
                    if (i >= uTrampleCount) break;
                    float rawStrength = uTrampleSegData[i].x;
                    if (rawStrength > 0.005) {
                        vec2 a = uTrampleSegAB[i].xy;
                        vec2 b = uTrampleSegAB[i].zw;
                        float rad = uTrampleSegData[i].y * 1.35;

                        vec2 pa = instXZ - a;
                        vec2 ba = b - a;
                        float baLenSq = dot(ba, ba);
                        float h = (baLenSq > 0.0001) ? clamp(dot(pa, ba) / baLenSq, 0.0, 1.0) : 0.0;
                        vec2 diff = pa - ba * h;
                        float distSq = dot(diff, diff);
                        float radSq = rad * rad;

                        if (distSq < radSq) {
                            float dist = sqrt(distSq);
                            float t = 1.0 - (dist / rad);
                            float smoothStrength = rawStrength * rawStrength * (3.0 - 2.0 * rawStrength);
                            float weight = (t * t * (3.0 - 2.0 * t)) * smoothStrength;
                            totalBend = max(totalBend, weight);
                            vec2 dir = (dist > 0.005) ? (diff / dist) : vec2(0.0, 1.0);
                            bendDir += dir * weight;
                        }
                    }
                }
            }

            float bendFactor = clamp(totalBend, 0.0, 1.0);

            if (uWindSpeed > 0.0) {
                float instX = instanceMatrix[3][0];
                float instZ = instanceMatrix[3][2];
                float waveX = sin(uTime * 2.8 * uWindSpeed + instX * 1.5 + instZ * 1.5) * 0.10 * uWindSpeed * (1.0 - bendFactor * 0.85);
                float waveZ = cos(uTime * 2.2 * uWindSpeed + instX * 1.2 + instZ * 1.2) * 0.06 * uWindSpeed * (1.0 - bendFactor * 0.85);
                float swayHeight = pow(clamp(transformed.y / 0.60, 0.0, 1.0), 1.35);
                transformed.x += waveX * swayHeight;
                transformed.z += waveZ * swayHeight;
            }

            if (bendFactor > 0.001) {
                float hRatio = clamp(transformed.y / 0.60, 0.0, 1.0);
                float squash = mix(1.0, 0.20, bendFactor * pow(hRatio, 0.85));
                transformed.y *= squash;

                vec2 leanOffset = (length(bendDir) > 0.001) ? normalize(bendDir) * 0.42 * bendFactor * pow(hRatio, 1.2) : vec2(0.0);
                transformed.x += leanOffset.x;
                transformed.z += leanOffset.y;
            }
            `
        );
    };

    instancedFlowerMesh.customDepthMaterial = flowerDepthMaterial;

    const colorsArray = new Float32Array(maxFlowerCapacity * 3);
    geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colorsArray, 3));

    if (typeof scene !== 'undefined') {
        scene.add(instancedFlowerMesh);
    }

    return { mesh: instancedFlowerMesh, material: material };
}

flowerSystem = initGenshinFlowerSystem();

// 6. REBUILD TRANSFORMS BUNGA (1 PANGGILAN CEPAT UNTUK SEMUA INSTANCE AKTIF)
function rebuildFlowerTransforms() {
    if (!instancedFlowerMesh) return;

    const count = flowersList.length;
    const dummy = new THREE.Object3D();
    const colorAttr = instancedFlowerMesh.geometry.attributes.instanceColor;

    const worldUp = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion();
    const blendedNormal = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
        const f = flowersList[i];

        const terrainY = (typeof getTerrainHeightFast === 'function')
            ? getTerrainHeightFast(f.posX, f.posZ)
            : 0;
        const terrainNormal = (typeof getTerrainNormalAt === 'function')
            ? getTerrainNormalAt(f.posX, f.posZ)
            : worldUp;

        f.posY = terrainY;

        blendedNormal.copy(terrainNormal).lerp(worldUp, 0.35).normalize();
        quat.setFromUnitVectors(worldUp, blendedNormal);

        dummy.position.set(f.posX, terrainY, f.posZ);
        dummy.rotation.setFromQuaternion(quat);
        dummy.rotateY(f.rotY || 0);

        // Skala bervolume proporsional dengan sedikit variasi organik alami (0.92 s/d 1.18)
        const seed = (Math.sin(f.posX * 12.9898 + f.posZ * 78.233) * 43758.5453) % 1;
        const scaleVar = 0.92 + Math.abs(seed) * 0.26;
        const s = flowerParams.staticScale * scaleVar;
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();

        instancedFlowerMesh.setMatrixAt(i, dummy.matrix);

        // Terapkan warna instanced sesuai tema bunga
        const themeKey = f.themeKey || 'cyan';
        const theme = FLOWER_THEMES[themeKey] || FLOWER_THEMES.cyan;
        colorAttr.setXYZ(i, theme.color.r, theme.color.g, theme.color.b);
    }

    instancedFlowerMesh.count = count;
    instancedFlowerMesh.instanceMatrix.needsUpdate = true;
    colorAttr.needsUpdate = true;
}

// 7. PENEMPATAN BUNGA DENGAN KUAS (PLACE FLOWERS)
function placeFlowersAt(intersectPoint, flowerType = 'spawn_flower_cyan') {
    let themeKey = 'cyan';
    if (flowerType === 'spawn_flower_blue') themeKey = 'blue';
    else if (flowerType === 'spawn_flower_violet') themeKey = 'violet';
    else if (flowerType === 'spawn_flower_solar') themeKey = 'solar';

    const radius = flowerParams.brushRadius;
    const count = (radius < 1.2) ? 1 : Math.max(1, Math.round(flowerParams.flowerDensity * (radius / 3.0)));
    const groundBound = (typeof groundSize !== 'undefined' ? groundSize / 2 : 75) - 1.0;

    let addedAny = false;

    for (let i = 0; i < count; i++) {
        if (flowersList.length >= maxFlowerCapacity) break;

        const r = (count === 1) ? 0 : radius * Math.sqrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const posX = intersectPoint.x + (count === 1 ? 0 : r * Math.cos(theta));
        const posZ = intersectPoint.z + (count === 1 ? 0 : r * Math.sin(theta));

        if (Math.abs(posX) > groundBound || Math.abs(posZ) > groundBound) continue;

        // Cegah penumpukan terlalu rapat (< 0.50 unit untuk rumpun bervolume)
        let tooClose = false;
        for (let j = 0; j < flowersList.length; j++) {
            const existing = flowersList[j];
            if (Math.hypot(existing.posX - posX, existing.posZ - posZ) < 0.50) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) continue;

        flowersList.push({
            posX: posX,
            posY: 0,
            posZ: posZ,
            rotY: Math.random() * Math.PI * 2,
            flowerType: flowerType,
            themeKey: themeKey
        });

        addedAny = true;
    }

    if (addedAny) {
        rebuildFlowerTransforms();
        updateFlowerCountUI();
    }
}

// 8. HAPUS BUNGA DALAM RADIUS TERTENTU (KLIK KANAN ATAU KUAS REMOVE)
function removeFlowersInRadius(hitPoint, radius) {
    if (!flowersList || flowersList.length === 0) return false;
    let removedAny = false;

    for (let i = flowersList.length - 1; i >= 0; i--) {
        const f = flowersList[i];
        const dist = Math.hypot(f.posX - hitPoint.x, f.posZ - hitPoint.z);
        if (dist <= radius) {
            flowersList.splice(i, 1);
            removedAny = true;
        }
    }

    if (removedAny) {
        rebuildFlowerTransforms();
        updateFlowerCountUI();
    }
    return removedAny;
}

// 9. BERSIHKAN SEMUA BUNGA (CLEAR ALL)
function clearAllFlowers() {
    if (!flowersList || flowersList.length === 0) return;
    flowersList.length = 0;
    rebuildFlowerTransforms();
    updateFlowerCountUI();
}

// 10. RECREATE FLOWER (UNTUK UNDO/REDO & LOAD MAP)
function recreateFlower(data) {
    const themeKey = data.themeKey || (data.flowerType ? data.flowerType.replace('spawn_flower_', '') : 'cyan');

    flowersList.push({
        posX: data.posX !== undefined ? data.posX : (data.position ? data.position.x : 0),
        posY: data.posY !== undefined ? data.posY : 0,
        posZ: data.posZ !== undefined ? data.posZ : (data.position ? data.position.z : 0),
        rotY: data.rotY !== undefined ? data.rotY : (data.rotation ? data.rotation.y : Math.random() * Math.PI * 2),
        flowerType: data.flowerType || ('spawn_flower_' + themeKey),
        themeKey: themeKey
    });

    rebuildFlowerTransforms();
    updateFlowerCountUI();
}

// 11. UPDATE RENDER LOOP (ANIMASI WAKTU, ANGIN, DAN RESPON INJAKAN)
function updateFlowers(delta, elapsedTime) {
    if (flowerSystem && flowerSystem.material && flowerSystem.material.uniforms) {
        const u = flowerSystem.material.uniforms;
        if (u.uTime) u.uTime.value = elapsedTime;

        if (typeof grassSystem !== 'undefined' && grassSystem && grassSystem.material && grassSystem.material.uniforms) {
            const gu = grassSystem.material.uniforms;
            if (u.uTrampleCount && gu.uTrampleCount) u.uTrampleCount.value = gu.uTrampleCount.value;
            if (u.uTrampleCenter && gu.uTrampleCenter) u.uTrampleCenter.value.copy(gu.uTrampleCenter.value);
            if (u.uTrampleRadiusSq && gu.uTrampleRadiusSq) u.uTrampleRadiusSq.value = gu.uTrampleRadiusSq.value;
        }
    }
}

// 12. UPDATE UI COUNTER
function updateFlowerCountUI() {
    const countBadge = document.getElementById('val-flower-count');
    if (countBadge) {
        countBadge.textContent = `${flowersList.length} Bunga`;
    }
    if (typeof refreshLayerUI === 'function') {
        refreshLayerUI();
    }
}

// Export ke window global
window.flowerSystem = flowerSystem;
window.instancedFlowerMesh = instancedFlowerMesh;
window.placeFlowersAt = placeFlowersAt;
window.removeFlowersInRadius = removeFlowersInRadius;
window.clearAllFlowers = clearAllFlowers;
window.recreateFlower = recreateFlower;
window.rebuildFlowerTransforms = rebuildFlowerTransforms;
window.updateFlowers = updateFlowers;
window.updateFlowerCountUI = updateFlowerCountUI;
window.flowerParams = flowerParams;
