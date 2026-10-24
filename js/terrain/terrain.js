/* Terrain mesh, sculpt & road brush */
// ==========================================
// 4. TERRAIN & SEAMLESS ROAD BRUSH
// ==========================================
let groundSize = 80;
window.groundSize = groundSize;
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

// ========================================================
// GENERATOR TEKSTUR TANAH LIAT & TANAH ALAMI FOTOREALISTIS
// Membangun 350.000+ butiran tanah, silt, agregat lempung, dan kerikil mikro
// dengan Albedo & Normal Map 1024x1024 (Bebas dari artefak garis gelombang matematis)
// ========================================================
function generateAuthenticClayTextures() {
    const size = 1024;
    const aCanvas = document.createElement('canvas');
    aCanvas.width = size;
    aCanvas.height = size;
    const aCtx = aCanvas.getContext('2d');
    const aImg = aCtx.createImageData(size, size);
    const aData = aImg.data;

    const nCanvas = document.createElement('canvas');
    nCanvas.width = size;
    nCanvas.height = size;
    const nCtx = nCanvas.getContext('2d');
    const nImg = nCtx.createImageData(size, size);
    const nData = nImg.data;

    const heightMap = new Float32Array(size * size);

    // Multi-oktaf Value Noise seamless (mencegah artefak garis trigonometris/spirograf)
    function createSeamlessNoise(gridSize) {
        const table = new Float32Array(gridSize * gridSize);
        for (let i = 0; i < table.length; i++) {
            table[i] = Math.random();
        }
        return function sample(x, y) {
            const gx = (x % size + size) % size;
            const gy = (y % size + size) % size;
            const fx = (gx / size) * gridSize;
            const fy = (gy / size) * gridSize;
            const x0 = Math.floor(fx) % gridSize;
            const y0 = Math.floor(fy) % gridSize;
            const x1 = (x0 + 1) % gridSize;
            const y1 = (y0 + 1) % gridSize;
            const tx = fx - Math.floor(fx);
            const ty = fy - Math.floor(fy);
            const sx = tx * tx * (3.0 - 2.0 * tx);
            const sy = ty * ty * (3.0 - 2.0 * ty);

            const v00 = table[y0 * gridSize + x0];
            const v10 = table[y0 * gridSize + x1];
            const v01 = table[y1 * gridSize + x0];
            const v11 = table[y1 * gridSize + x1];

            const top = v00 + sx * (v10 - v00);
            const bot = v01 + sx * (v11 - v01);
            return top + sy * (bot - top);
        };
    }

    const n16  = createSeamlessNoise(16);
    const n32  = createSeamlessNoise(32);
    const n64  = createSeamlessNoise(64);
    const n128 = createSeamlessNoise(128);

    // 1. Fondasi Makro & Meso Lapisan Lempung (Variasi kelembapan & kontur tanah alami)
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = y * size + x;
            const h = n16(x, y) * 0.44 + n32(x, y) * 0.28 + n64(x, y) * 0.18 + n128(x, y) * 0.10;
            heightMap[idx] = h;
        }
    }

    // 2. 25.000+ Agregat Tanah & Gumpalan Lempung Mikro (Soil Peds & Crumbs)
    const numClods = 25000;
    for (let c = 0; c < numClods; c++) {
        const cx = (Math.random() * size) | 0;
        const cy = (Math.random() * size) | 0;
        const cRad = 1 + ((Math.random() * 3) | 0);
        const cH = 0.08 + Math.random() * 0.14;

        for (let dy = -cRad; dy <= cRad; dy++) {
            for (let dx = -cRad; dx <= cRad; dx++) {
                const dSq = dx * dx + dy * dy;
                if (dSq <= cRad * cRad) {
                    const gx = (cx + dx + size) % size;
                    const gy = (cy + dy + size) % size;
                    const gIdx = gy * size + gx;
                    const falloff = 1.0 - Math.sqrt(dSq) / (cRad + 0.1);
                    heightMap[gIdx] = Math.min(1.0, heightMap[gIdx] + falloff * cH);
                }
            }
        }
    }

    // 3. 4.000+ Butiran Kerikil Halus Alami (Micro-Pebbles / Coarse Sand)
    const numPebbles = 4000;
    for (let p = 0; p < numPebbles; p++) {
        const px = (Math.random() * size) | 0;
        const py = (Math.random() * size) | 0;
        const pRad = 2 + ((Math.random() * 3) | 0);
        const pH = 0.14 + Math.random() * 0.18;

        for (let dy = -pRad; dy <= pRad; dy++) {
            for (let dx = -pRad; dx <= pRad; dx++) {
                const dSq = dx * dx + dy * dy;
                if (dSq <= pRad * pRad) {
                    const gx = (px + dx + size) % size;
                    const gy = (py + dy + size) % size;
                    const gIdx = gy * size + gx;
                    const falloff = Math.cos((Math.sqrt(dSq) / pRad) * Math.PI * 0.5);
                    heightMap[gIdx] = Math.min(1.0, heightMap[gIdx] + falloff * pH);
                }
            }
        }
    }

    // 4. 350.000+ Butiran Pasir & Silt Mikro (Ratusan Ribu Partikel Granular Tanah)
    const grainTypes = new Uint8Array(size * size); // 0: Normal, 1: Humus/Gelap, 2: Silika/Terang
    const numGrains = 350000;
    for (let g = 0; g < numGrains; g++) {
        const gx = (Math.random() * size) | 0;
        const gy = (Math.random() * size) | 0;
        const gIdx = gy * size + gx;
        const gH = 0.05 + Math.random() * 0.12;
        heightMap[gIdx] = Math.min(1.0, heightMap[gIdx] + gH);

        const roll = Math.random();
        if (roll < 0.14) {
            grainTypes[gIdx] = 1; // Serat humus/organik gelap
        } else if (roll > 0.86) {
            grainTypes[gIdx] = 2; // Butiran pasir silika/mineral terang
        }
    }

    // 5. Sintesis Warna Tanah Fotorealistis (Albedo) & Relief Normal Map 3x3 Sobel
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = y * size + x;
            const pIdx = idx * 4;
            const h = heightMap[idx];

            let r, g, b;
            if (h < 0.40) {
                // Lekukan tanah lembap/celah basah
                const t = h / 0.40;
                r = 68 + t * (124 - 68);
                g = 36 + t * (66 - 36);
                b = 20 + t * (34 - 20);
            } else if (h < 0.70) {
                // Badan utama lempung terakota hangat
                const t = (h - 0.40) / 0.30;
                r = 124 + t * (178 - 124);
                g = 66  + t * (98 - 66);
                b = 34  + t * (54 - 34);
            } else {
                // Debu permukaan kering & butiran silt halus terpapar sinar
                const t = (h - 0.70) / 0.30;
                r = 178 + t * (222 - 178);
                g = 98  + t * (142 - 98);
                b = 54  + t * (86 - 54);
            }

            // Terapkan identitas tipe partikel granular
            const gType = grainTypes[idx];
            if (gType === 1) {
                // Partikel humus gelap
                r = Math.floor(r * 0.55);
                g = Math.floor(g * 0.55);
                b = Math.floor(b * 0.55);
            } else if (gType === 2) {
                // Silika/butiran pasir mineral
                r = Math.min(255, Math.floor(r * 1.25 + 30));
                g = Math.min(255, Math.floor(g * 1.20 + 25));
                b = Math.min(255, Math.floor(b * 1.15 + 20));
            }

            aData[pIdx]     = Math.floor(r);
            aData[pIdx + 1] = Math.floor(g);
            aData[pIdx + 2] = Math.floor(b);
            aData[pIdx + 3] = 255;

            // Sobel 3x3 Filter untuk Normal Map Beresolusi Tinggi
            const xL = (x - 1 + size) % size;
            const xR = (x + 1) % size;
            const yU = (y - 1 + size) % size;
            const yD = (y + 1) % size;

            const tl = heightMap[yU * size + xL];
            const t  = heightMap[yU * size + x];
            const tr = heightMap[yU * size + xR];
            const l  = heightMap[y * size + xL];
            const rVal = heightMap[y * size + xR];
            const bl = heightMap[yD * size + xL];
            const bVal = heightMap[yD * size + x];
            const br = heightMap[yD * size + xR];

            const dX = (tr + 2.0 * rVal + br) - (tl + 2.0 * l + bl);
            const dY = (bl + 2.0 * bVal + br) - (tl + 2.0 * t + tr);

            const nX = -dX * 3.8;
            const nY = -dY * 3.8;
            const nZ = 1.0;
            const invLen = 1.0 / Math.sqrt(nX * nX + nY * nY + nZ * nZ);

            nData[pIdx]     = Math.floor((nX * invLen * 0.5 + 0.5) * 255);
            nData[pIdx + 1] = Math.floor((nY * invLen * 0.5 + 0.5) * 255);
            nData[pIdx + 2] = Math.floor((nZ * invLen * 0.5 + 0.5) * 255);
            nData[pIdx + 3] = 255;
        }
    }

    aCtx.putImageData(aImg, 0, 0);
    nCtx.putImageData(nImg, 0, 0);

    const albedoTex = new THREE.CanvasTexture(aCanvas);
    albedoTex.wrapS = THREE.RepeatWrapping;
    albedoTex.wrapT = THREE.RepeatWrapping;
    albedoTex.minFilter = THREE.LinearMipmapLinearFilter;
    albedoTex.magFilter = THREE.LinearFilter;
    albedoTex.generateMipmaps = true;

    const normalTex = new THREE.CanvasTexture(nCanvas);
    normalTex.wrapS = THREE.RepeatWrapping;
    normalTex.wrapT = THREE.RepeatWrapping;
    normalTex.minFilter = THREE.LinearMipmapLinearFilter;
    normalTex.magFilter = THREE.LinearFilter;
    normalTex.generateMipmaps = true;

    return { albedo: albedoTex, normal: normalTex };
}

const claySoilTextures = generateAuthenticClayTextures();

const groundMat = new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide });

// Kustomisasi shader tanah: Mengembalikan bayangan pada seluruh landscape,
// namun secara cerdas menghilangkan bayangan pada area tanah yang memiliki air
// agar bayangan tidak ganda (karena bayangan sudah tampil di permukaan air).
groundMat.customProgramCacheKey = function () {
    return 'groundMat_waterShadow_v11';
};

groundMat.onBeforeCompile = function (shader) {
    shader.uniforms.uGroundWaterMask = { value: (typeof waterMaskTexture !== 'undefined') ? waterMaskTexture : new THREE.Texture() };
    shader.uniforms.uGroundWaterLevel = { value: (typeof waterCurrentLevel === 'number') ? waterCurrentLevel : 0.0 };
    shader.uniforms.uGroundWaterGroundSize = { value: groundSize };
    shader.uniforms.uGroundWaterTime = { value: 0.0 };
    shader.uniforms.uGroundWaterAmp = { value: 0.70 };
    shader.uniforms.uGroundWaterSpeed = { value: 1.00 };
    shader.uniforms.uClaySoilAlbedo = { value: claySoilTextures.albedo };
    shader.uniforms.uClaySoilNormal = { value: claySoilTextures.normal };

    shader.vertexShader = `
        varying vec3 vGroundWorldPos;
        ${shader.vertexShader}
    `.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        #if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP )
            vGroundWorldPos = worldPosition.xyz;
        #else
            vGroundWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        #endif`
    );

    let frag = `
        uniform sampler2D uGroundWaterMask;
        uniform float uGroundWaterLevel;
        uniform float uGroundWaterGroundSize;
        uniform float uGroundWaterTime;
        uniform float uGroundWaterAmp;
        uniform float uGroundWaterSpeed;
        uniform sampler2D uClaySoilAlbedo;
        uniform sampler2D uClaySoilNormal;
        varying vec3 vGroundWorldPos;

        // Simulasi elevasi gelombang Gerstner dinamis (100% sinkron realtime dengan air)
        float getDynamicWaterWaveH(vec2 xz, float t, float amp, float speed) {
            float py = 0.0;
            for(int i = 0; i < 9; i++){
                float fi = float(i);
                float a = 0.5 + sin(fi * 12.9898 + 1.3) * 0.85;
                vec2 d = vec2(cos(a), sin(a));
                float L = 95.0 * pow(0.64, fi);
                float k = 6.28318 / L;
                float A = amp * L * 0.014;
                float ph = dot(d, xz) * k + t * sqrt(9.8 * k) * speed + fi * 1.7;
                py += A * sin(ph);
            }
            return py;
        }

        ${shader.fragmentShader}
    `.replace(
        '#include <shadowmap_pars_fragment>',
        THREE.ShaderChunk.shadowmap_pars_fragment.replace(
            'float getShadow(',
            'float getOriginalThreeShadow('
        ) + `
        float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
            float origShadow = getOriginalThreeShadow( shadowMap, shadowMapSize, shadowBias, shadowRadius, shadowCoord );

            // Periksa apakah posisi dunia berada dalam jangkauan mask kuas air
            float halfG = uGroundWaterGroundSize * 0.5;
            vec2 wUv = vec2((vGroundWorldPos.x + halfG) / uGroundWaterGroundSize, (vGroundWorldPos.z + halfG) / uGroundWaterGroundSize);
            if (wUv.x < 0.0 || wUv.x > 1.0 || wUv.y < 0.0 || wUv.y > 1.0) {
                return origShadow;
            }

            vec4 rawW = texture2D(uGroundWaterMask, wUv);
            float wMask = max(rawW.r, rawW.a);
            // Jika area ini bukan air (daratan kering di luar kuas air), bayangan selalu penuh
            if (wMask <= 0.01) {
                return origShadow;
            }

            // Hitung ketinggian dinamis ombak air di koordinat ini secara realtime
            float dynamicWaveH = getDynamicWaterWaveH(vGroundWorldPos.xz, uGroundWaterTime, uGroundWaterAmp, uGroundWaterSpeed);
            float dynamicWaterSurfaceY = uGroundWaterLevel + dynamicWaveH;

            // Kedalaman tanah terhadap ombak air yang bergerak dinamis
            float waterDepth = dynamicWaterSurfaceY - vGroundWorldPos.y;

            // Jika tanah berada di atas air / saat ombak surut menjauhi pantai:
            // Bayangan tanah tetap utuh 100% mengikuti kontur air yang bergerak
            if (waterDepth <= 0.005) {
                return origShadow;
            }

            // Jika tanah tenggelam di bawah air, secara halus hilangkan bayangan di dasar air
            // agar tidak terjadi bayangan ganda (karena bayangan sudah diterima di permukaan air)
            float depthWeight = smoothstep(0.005, 0.12, waterDepth);
            float maskWeight = smoothstep(0.01, 0.20, wMask);
            float removeWeight = depthWeight * maskWeight;
            return mix(origShadow, 1.0, removeWeight);
        }
        `
    );

    // ========================================================
    // REALISTIC PROCEDURAL SOIL TEXTURE (350.000+ Butiran & Agregat Tanah)
    // Menghasilkan tekstur tanah lempung asli dengan normal map berkedalaman tinggi
    // ========================================================
    frag = frag.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Deteksi pixel jalan tanah liat (terracotta warm reddish-brown hue)
        float clayDet = clamp((diffuseColor.r - diffuseColor.b * 1.20) * 2.5, 0.0, 1.0)
                      * smoothstep(0.24, 0.65, diffuseColor.r)
                      * smoothstep(0.10, 0.50, diffuseColor.g);
        if (clayDet > 0.02) {
            // Sampling albedo skala makro & mikro untuk tekstur butiran tanah alami
            vec2 soilUV = vGroundWorldPos.xz * 0.35;
            vec4 clayTex = texture2D(uClaySoilAlbedo, soilUV);

            vec2 microUV = vGroundWorldPos.xz * 1.20;
            vec4 microTex = texture2D(uClaySoilAlbedo, microUV);

            vec3 blendedSoil = clayTex.rgb * 0.75 + microTex.rgb * 0.35;
            diffuseColor.rgb = mix(diffuseColor.rgb, blendedSoil, clayDet);
        }`
    );

    frag = frag.replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        #ifdef USE_COLOR
            float cDetNorm = clamp((vColor.r - vColor.b * 1.20) * 2.5, 0.0, 1.0)
                           * smoothstep(0.24, 0.65, vColor.r);
            if (cDetNorm > 0.03) {
                vec2 soilUV = vGroundWorldPos.xz * 0.35;
                vec3 clayNormalRaw = texture2D(uClaySoilNormal, soilUV).xyz * 2.0 - 1.0;

                vec2 microUV = vGroundWorldPos.xz * 1.20;
                vec3 microNormalRaw = texture2D(uClaySoilNormal, microUV).xyz * 2.0 - 1.0;

                vec3 combinedN = normalize(clayNormalRaw + microNormalRaw * 0.65);
                vec3 clayWorldN = vec3(combinedN.x * 0.85, combinedN.z, combinedN.y * 0.85);
                vec3 clayViewN = normalize((viewMatrix * vec4(clayWorldN, 0.0)).xyz);
                normal = normalize(mix(normal, clayViewN, cDetNorm * 0.90));
            }
        #endif`
    );

    shader.fragmentShader = frag;
    groundMat.userData.shader = shader;
};

const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true; // Seluruh landscape menerima bayangan secara normal
scene.add(ground);

// Studio Canvas Grid Lines (seperti new-character.html)
let studioGrid = new THREE.GridHelper(groundSize, groundSize, 0x6e5d5f, 0x8c797b);
studioGrid.position.y = 0.008;
studioGrid.material.opacity = 0.32;
studioGrid.material.transparent = true;
scene.add(studioGrid);
window.studioGrid = studioGrid;

function setCanvasSize(newSize) {
    newSize = Math.max(30, Math.min(300, parseFloat(newSize) || 80));
    if (Math.abs(newSize - groundSize) < 0.001) return;

    const oldSize = groundSize;
    const scaleFactor = newSize / oldSize;
    groundSize = newSize;
    window.groundSize = newSize;

    // 1. Rescale vertices groundGeo (X & Z) sambil mempertahankan sculpt Y (ketinggian)
    if (typeof groundGeo !== 'undefined' && groundGeo && groundGeo.attributes && groundGeo.attributes.position) {
        const pos = groundGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            pos.setX(i, pos.getX(i) * scaleFactor);
            pos.setZ(i, pos.getZ(i) * scaleFactor);
        }
        pos.needsUpdate = true;
        groundGeo.computeVertexNormals();
        groundGeo.computeBoundingBox();
        groundGeo.computeBoundingSphere();
    }

    // 2. Buat ulang Studio Canvas Grid Helper agar ukurannya pas
    if (typeof studioGrid !== 'undefined' && studioGrid && typeof scene !== 'undefined') {
        const isVisible = studioGrid.visible;
        scene.remove(studioGrid);
        if (studioGrid.geometry) studioGrid.geometry.dispose();
        if (studioGrid.material) studioGrid.material.dispose();

        studioGrid = new THREE.GridHelper(groundSize, groundSize, 0x6e5d5f, 0x8c797b);
        studioGrid.position.y = 0.008;
        studioGrid.material.opacity = 0.32;
        studioGrid.material.transparent = true;
        studioGrid.visible = isVisible;
        scene.add(studioGrid);
        window.studioGrid = studioGrid;
    }

    // 3. Update uniform uGroundWaterGroundSize pada custom shader groundMat
    if (typeof groundMat !== 'undefined' && groundMat.userData && groundMat.userData.shader) {
        if (groundMat.userData.shader.uniforms && groundMat.userData.shader.uniforms.uGroundWaterGroundSize) {
            groundMat.userData.shader.uniforms.uGroundWaterGroundSize.value = newSize;
        }
    }

    // 4. Update water system (water plane, outer ocean rings, tebing skirt)
    if (typeof updateWaterCanvasSize === 'function') {
        updateWaterCanvasSize(newSize);
    }

    // 5. Sinkronkan tinggi kontur tanah ke water shader & cliff skirt
    if (typeof syncTerrainHeightToWater === 'function') {
        syncTerrainHeightToWater();
    }

    // 6. Update UI Slider & Badge
    const slider = document.getElementById('slider-canvas-size');
    const badge = document.getElementById('label-canvas-size');
    if (slider && Math.abs(parseFloat(slider.value) - newSize) > 0.1) {
        slider.value = newSize;
    }
    if (badge) {
        badge.textContent = `${Math.round(newSize)}m x ${Math.round(newSize)}m`;
    }

    // 7. Update active state tombol preset
    document.querySelectorAll('.btn-canvas-preset').forEach(btn => {
        const sz = parseFloat(btn.getAttribute('data-size'));
        if (Math.abs(sz - newSize) < 1.0) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}
window.setCanvasSize = setCanvasSize;

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
    if (typeof clearClayPebbles === 'function') {
        clearClayPebbles();
    }
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

// ========================================================
// 4C. VOLUMETRIC PROCEDURAL CLAY CLODS & PEBBLES (3D Scatter Components)
// Ribuan komponen fisik 3D gumpalan lempung tebal & kerikil alami
// ========================================================
const maxClayPebbles = 5000;
const pebbleGeo = new THREE.DodecahedronGeometry(0.046, 0);
pebbleGeo.scale(1.15, 0.75, 1.0); // Proporsi batu kerikil dan gumpalan lempung

const pebbleMat = new THREE.MeshToonMaterial({
    color: 0x9e5b38,
    roughness: 0.78
});

const clayPebblesMesh = new THREE.InstancedMesh(pebbleGeo, pebbleMat, maxClayPebbles);
clayPebblesMesh.visible = false; // Dinonaktifkan: Tekstur tanah dibangun dengan 350.000+ butiran & agregat mikro di shader
clayPebblesMesh.castShadow = false;
clayPebblesMesh.receiveShadow = false;

const _dummyPebbleMatrix = new THREE.Matrix4();
const _dummyPebblePos = new THREE.Vector3();
const _dummyPebbleScale = new THREE.Vector3(0, 0, 0);
const _dummyPebbleQuat = new THREE.Quaternion();
const _dummyPebbleEuler = new THREE.Euler();

const clayPebbleActive = new Uint8Array(maxClayPebbles);
const clayPebblePos = new Float32Array(maxClayPebbles * 3);
let nextPebbleIdx = 0;

for (let i = 0; i < maxClayPebbles; i++) {
    _dummyPebbleMatrix.makeScale(0, 0, 0);
    clayPebblesMesh.setMatrixAt(i, _dummyPebbleMatrix);
}
clayPebblesMesh.instanceMatrix.needsUpdate = true;

// Palet warna lempung terakota beraneka ragam
const pebblePalette = [
    new THREE.Color(0x5a2f1a),
    new THREE.Color(0x7a3d22),
    new THREE.Color(0x9e5430),
    new THREE.Color(0xb2643a),
    new THREE.Color(0xc67c4e),
    new THREE.Color(0xd99564)
];
for (let i = 0; i < maxClayPebbles; i++) {
    clayPebblesMesh.setColorAt(i, pebblePalette[i % pebblePalette.length]);
}
if (clayPebblesMesh.instanceColor) clayPebblesMesh.instanceColor.needsUpdate = true;
scene.add(clayPebblesMesh);
window.clayPebblesMesh = clayPebblesMesh;

function spawnClayPebblesAround(hitX, hitZ, radius) {
    // No-op: Tekstur tanah sekarang dibangun mikroskopis langsung pada Albedo & Normal Map shader
}

function removeClayPebblesAround(hitX, hitZ, radius) {
    // No-op
}

function clearClayPebbles() {
    if (typeof clayPebblesMesh === 'undefined' || !clayPebblesMesh) return;
    for (let i = 0; i < maxClayPebbles; i++) {
        clayPebbleActive[i] = 0;
        _dummyPebbleMatrix.makeScale(0, 0, 0);
        clayPebblesMesh.setMatrixAt(i, _dummyPebbleMatrix);
    }
    clayPebblesMesh.instanceMatrix.needsUpdate = true;
}
window.clearClayPebbles = clearClayPebbles;
window.spawnClayPebblesAround = spawnClayPebblesAround;
window.removeClayPebblesAround = removeClayPebblesAround;

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

    let colorModified = false;
    let posModified = false;

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
                    colorModified = true;
                } else if (roadType === 'road_clay') {
                    // ========================================================
                    // 1. ELEVASI TANAH LIAT TERPADATKAN (Compacted Soil Profile)
                    // ========================================================
                    // Sangat tipis (~0.010 - 0.014 unit) dan konvergen (tidak menumpuk berlebihan)
                    const domeShape = Math.cos(edgeFactor * Math.PI * 0.5); // 1.0 di tengah -> 0.0 di tepian
                    const targetLift = domeShape * 0.012 * factor;
                    const curY = posAttr.getY(idx);
                    const targetY = hitPoint.y + targetLift;
                    const diffY = targetY - curY;
                    if (Math.abs(diffY) > 0.0005) {
                        posAttr.setY(idx, curY + diffY * 0.12 * factor);
                        posModified = true;
                    }

                    // ========================================================
                    // 2. TEKSTUR TANAH LIAT MULTI-LAYER (Rich Terracotta Clay)
                    // ========================================================
                    const nx = (vx + halfSize) / groundSize;
                    const nz = (vz + halfSize) / groundSize;

                    // Multi-frekuensi variasi lempung (FBM + Smooth Noise berdensitas tinggi)
                    let clayNoise = fbm(nx * 28.0, nz * 28.0) * 0.65;
                    clayNoise += smoothNoise(nx * 95.0, nz * 95.0) * 0.25;
                    clayNoise += (smoothNoise(nx * 240.0, nz * 240.0) - 0.5) * 0.15;

                    // Rekahan / celah pori lempung (crevice cracks)
                    const crevice = Math.pow(Math.abs(smoothNoise(nx * 65.0 + 1.2, nz * 65.0 + 4.5) - 0.5) * 2.0, 4.0);

                    // Butiran pasir / silt mineral
                    const mineralGrain = (hash(Math.floor(vx * 16.0), Math.floor(vz * 16.0)) - 0.5) * (18.0 / 255.0);

                    const t = Math.min(1.0, Math.max(0.0, clayNoise * 1.1));

                    let targetR, targetG, targetB;
                    if (t < 0.5) {
                        const subT = t * 2.0;
                        targetR = THREE.MathUtils.lerp(82 / 255, 164 / 255, subT);
                        targetG = THREE.MathUtils.lerp(46 / 255, 88 / 255, subT);
                        targetB = THREE.MathUtils.lerp(30 / 255, 48 / 255, subT);
                    } else {
                        const subT = (t - 0.5) * 2.0;
                        targetR = THREE.MathUtils.lerp(164 / 255, 210 / 255, subT);
                        targetG = THREE.MathUtils.lerp(88 / 255, 138 / 255, subT);
                        targetB = THREE.MathUtils.lerp(48 / 255, 80 / 255, subT);
                    }

                    // Padukan rekahan pori lempung & butiran mineral silt
                    targetR = Math.min(1.0, Math.max(0.0, targetR * (1.0 - crevice * 0.22) + mineralGrain));
                    targetG = Math.min(1.0, Math.max(0.0, targetG * (1.0 - crevice * 0.22) + mineralGrain * 0.8));
                    targetB = Math.min(1.0, Math.max(0.0, targetB * (1.0 - crevice * 0.20) + mineralGrain * 0.6));

                    const curR = colAttr.getX(idx);
                    const curG = colAttr.getY(idx);
                    const curB = colAttr.getZ(idx);

                    const blendedR = THREE.MathUtils.lerp(curR, targetR, factor);
                    const blendedG = THREE.MathUtils.lerp(curG, targetG, factor);
                    const blendedB = THREE.MathUtils.lerp(curB, targetB, factor);

                    colAttr.setXYZ(idx, blendedR, blendedG, blendedB);
                    colorModified = true;
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
                    colorModified = true;
                }
            }
        }
    }

    if (colorModified) {
        colAttr.needsUpdate = true;
    }
    if (posModified) {
        posAttr.needsUpdate = true;
        groundGeo.computeVertexNormals();
        groundGeo.computeBoundingBox();
        groundGeo.computeBoundingSphere();
        if (typeof syncTerrainHeightToWater === 'function') {
            syncTerrainHeightToWater();
        }
    }
}
