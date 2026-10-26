/* Water Manager - Genshin Impact Serene Glassy Water v2 (Brushable & Interactive) */
// ==========================================
// 4B. GENSHIN SERENE GLASSY WATER MANAGER
// ==========================================

let waterGroundSize = (typeof groundSize !== 'undefined') ? groundSize : 80;
window.waterGroundSize = waterGroundSize;
const waterMaskResolution = 1024; // Resolusi tinggi agar tepian air sangat halus

// Canvas untuk dynamic brush mask
const waterCanvas = document.createElement('canvas');
waterCanvas.width = waterMaskResolution;
waterCanvas.height = waterMaskResolution;
const waterCtx = waterCanvas.getContext('2d');

// Inisialisasi canvas transparan
waterCtx.clearRect(0, 0, waterMaskResolution, waterMaskResolution);

const waterMaskTexture = new THREE.CanvasTexture(waterCanvas);
waterMaskTexture.wrapS = THREE.ClampToEdgeWrapping;
waterMaskTexture.wrapT = THREE.ClampToEdgeWrapping;
waterMaskTexture.minFilter = THREE.LinearFilter;
waterMaskTexture.magFilter = THREE.LinearFilter;
waterMaskTexture.generateMipmaps = false;
// PENTING: flipY = false agar sumbu Z dunia berpadanan 1:1 dengan sumbu Y canvas tanpa terbalik!
waterMaskTexture.flipY = false;

if (typeof groundMat !== 'undefined' && groundMat && groundMat.userData && groundMat.userData.shader && groundMat.userData.shader.uniforms) {
    if (groundMat.userData.shader.uniforms.uGroundWaterMask) {
        groundMat.userData.shader.uniforms.uGroundWaterMask.value = waterMaskTexture;
    }
}

// ============================================================
// DATA TEXTURE TINGGI TANAH (Auto-deteksi air menyentuh sculpt tanah / landscape)
// ============================================================
const terrainGridStride = (typeof groundSegments !== 'undefined' ? groundSegments : 100) + 1;
const terrainHeightData = new Float32Array(terrainGridStride * terrainGridStride);
const terrainHeightTexture = new THREE.DataTexture(
    terrainHeightData,
    terrainGridStride,
    terrainGridStride,
    THREE.RedFormat,
    THREE.FloatType
);
terrainHeightTexture.minFilter = THREE.LinearFilter;
terrainHeightTexture.magFilter = THREE.LinearFilter;
terrainHeightTexture.wrapS = THREE.ClampToEdgeWrapping;
terrainHeightTexture.wrapT = THREE.ClampToEdgeWrapping;
terrainHeightTexture.generateMipmaps = false;
terrainHeightTexture.flipY = false;
terrainHeightTexture.needsUpdate = true;

function syncTerrainHeightToWater() {
    if (typeof groundGeo === 'undefined' || !groundGeo || !groundGeo.attributes.position) return;
    const posAttr = groundGeo.attributes.position;
    const count = Math.min(posAttr.count, terrainHeightData.length);
    for (let i = 0; i < count; i++) {
        terrainHeightData[i] = posAttr.getY(i);
    }
    terrainHeightTexture.needsUpdate = true;
    if (typeof syncIslandCliffSkirt === 'function') {
        syncIslandCliffSkirt();
    }
}
window.syncTerrainHeightToWater = syncTerrainHeightToWater;
setTimeout(syncTerrainHeightToWater, 100);

// ============================================================
// REALTIME SCENE DEPTH PASS UNTUK PERPOTONGAN FISIKA AIR 100% PRESISI
// Mengikuti bentuk 3D polygon mesh asli (Batu, Pohon, Rumput, Sculpt)
// ============================================================
let waterDepthTarget = null;
const _drawingBufferSize = new THREE.Vector2();

function getWaterDepthTarget(width, height) {
    if (!waterDepthTarget || waterDepthTarget.width !== width || waterDepthTarget.height !== height) {
        if (waterDepthTarget) waterDepthTarget.dispose();
        const depthTexture = new THREE.DepthTexture();
        depthTexture.type = THREE.UnsignedShortType;
        waterDepthTarget = new THREE.WebGLRenderTarget(width, height, {
            depthTexture: depthTexture,
            depthBuffer: true,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            generateMipmaps: false
        });
    }
    return waterDepthTarget;
}

function renderWaterDepthPass(renderer, scene, camera) {
    const isWaterActive = (waterMesh && waterMesh.visible && hasAnyWaterDrawn);
    const isOuterActive = (outerOceanMesh && outerOceanMesh.visible && isOuterOceanEnabled);
    if (!isWaterActive && !isOuterActive) return;
    
    renderer.getDrawingBufferSize(_drawingBufferSize);
    const width = Math.floor(_drawingBufferSize.x);
    const height = Math.floor(_drawingBufferSize.y);
    if (width <= 0 || height <= 0) return;

    const target = getWaterDepthTarget(width, height);

    const prevWaterVisible = waterMesh ? waterMesh.visible : false;
    const prevOuterVisible = outerOceanMesh ? outerOceanMesh.visible : false;
    const prevCliffVisible = islandCliffMesh ? islandCliffMesh.visible : false;
    if (waterMesh) waterMesh.visible = false;
    if (outerOceanMesh) outerOceanMesh.visible = false;
    if (islandCliffMesh) islandCliffMesh.visible = false;

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(prevTarget);

    if (waterMesh) waterMesh.visible = prevWaterVisible;
    if (outerOceanMesh) outerOceanMesh.visible = prevOuterVisible;
    if (islandCliffMesh) islandCliffMesh.visible = prevCliffVisible;

    if (waterMat && waterMat.uniforms) {
        if (waterMat.uniforms.uSceneDepth) waterMat.uniforms.uSceneDepth.value = target.depthTexture;
        if (waterMat.uniforms.uResolution) waterMat.uniforms.uResolution.value.set(width, height);
        if (waterMat.uniforms.uCameraNear) waterMat.uniforms.uCameraNear.value = camera.near;
        if (waterMat.uniforms.uCameraFar)  waterMat.uniforms.uCameraFar.value = camera.far;
    }
}
window.renderWaterDepthPass = renderWaterDepthPass;

// Geometry bidang air horizontal datar (flat surface) dengan performa optimal 60 FPS
const waterSegments = 100;
let waterGeo = new THREE.PlaneGeometry(waterGroundSize, waterGroundSize, waterSegments, waterSegments);
waterGeo.rotateX(-Math.PI / 2);

// Preset Palet Warna Air Berdasarkan Suasana Waktu (Siang, Sore, Malam)
const waterAtmospherePresets = {
    day: {
        deep:       new THREE.Color(0x02162e), // Biru tua danau tenang di kedalaman
        shallow:    new THREE.Color(0x12a0b0), // Biru toska cerah berkilau di perairan dangkal
        skyReflect: new THREE.Color(0x78bcf5), // Pantulan langit siang cerah
        foam:       new THREE.Color(0xffffff)  // Busa putih bersih
    },
    sunset: {
        deep:       new THREE.Color(0x0c2238), // Biru laut senja hangat alami (bukan ungu!)
        shallow:    new THREE.Color(0xb86338), // Rona hangat tembaga keemasan di perairan dangkal
        skyReflect: new THREE.Color(0xf08852), // Pantulan mega merah & cahaya sore
        foam:       new THREE.Color(0xffeedb)  // Busa bernuansa krem hangat keemasan senja
    },
    night: {
        deep:       new THREE.Color(0x010812), // Obsidian navy pekat malam
        shallow:    new THREE.Color(0x081f33), // Sapphire biru malam tenang
        skyReflect: new THREE.Color(0x0d2238), // Pantulan langit malam bertabur bintang & aurora
        foam:       new THREE.Color(0x9ed3ff)  // Pendar buih rembulan sejuk
    }
};

// Target suasana aktif untuk transisi lerp halus antar preset
let currentWaterPresetKey = 'day';
const targetAtmosphere = {
    deep:       waterAtmospherePresets.day.deep.clone(),
    shallow:    waterAtmospherePresets.day.shallow.clone(),
    skyReflect: waterAtmospherePresets.day.skyReflect.clone(),
    foam:       waterAtmospherePresets.day.foam.clone()
};

// Fungsi beralih preset suasana air (dipanggil saat preset langit berubah)
function setWaterAtmospherePreset(presetKey) {
    const p = waterAtmospherePresets[presetKey] || waterAtmospherePresets.day;
    currentWaterPresetKey = presetKey;
    targetAtmosphere.deep.copy(p.deep);
    targetAtmosphere.shallow.copy(p.shallow);
    targetAtmosphere.skyReflect.copy(p.skyReflect);
    targetAtmosphere.foam.copy(p.foam);

    if (waterMat && waterMat.uniforms) {
        if (waterMat.uniforms.uWaterDeepColor)    waterMat.uniforms.uWaterDeepColor.value.copy(p.deep);
        if (waterMat.uniforms.uWaterShallowColor) waterMat.uniforms.uWaterShallowColor.value.copy(p.shallow);
        if (waterMat.uniforms.uWaterSkyColor)     waterMat.uniforms.uWaterSkyColor.value.copy(p.skyReflect);
        if (waterMat.uniforms.uWaterFoamColor)    waterMat.uniforms.uWaterFoamColor.value.copy(p.foam);
    }
}

// ============================================================
// OCEAN.HTML ENGINE — Realistic Ocean Water Shader (v4 Ocean)
// 100% ported from ocean.html: Gerstner Waves, Kelvin Wake,
// Hull SDF, Multi-layer Foam, ACES Tonemap, Fresnel Sky, Shadow
// ============================================================

// Jejak riak rubah: tiap sampel memantulkan riak melingkar (Kelvin Wake)
const OCEAN_TRAIL_MAX = 20;
const oceanTrailPos = [];
const oceanTrailDir = [];
for (let i = 0; i < OCEAN_TRAIL_MAX; i++) {
    oceanTrailPos.push(new THREE.Vector4(0, 0, -9999, 0)); // x, z, spawnTime, intensitas
    oceanTrailDir.push(new THREE.Vector2(0, 1));
}
let oceanTrailIdx = 0;
const oceanLastTrailSpawnPos = new THREE.Vector2(9999, 9999);

// Shader common functions (100% dari ocean.html + quintic smooth noise)
const oceanCommonGLSL = `
float sq(float x){ return x * x; }
float ohash(vec2 p){
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
// Quintic Hermite interpolation curve (C2 continuous) - Menghilangkan artefak grid kotak-kotak pada turunan normal
float onoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(ohash(i), ohash(i + vec2(1.0, 0.0)), f.x),
               mix(ohash(i + vec2(0.0, 1.0)), ohash(i + vec2(1.0, 1.0)), f.x), f.y);
}
const mat2 om2 = mat2(0.8, -0.6, 0.6, 0.8);
float ofbm(vec2 p){
    float a = 0.5, s = 0.0;
    for(int i=0; i<4; i++){ s += a * onoise(p); p = om2 * p * 2.04 + vec2(7.1, 3.7); a *= 0.5; }
    return s;
}

// ── NOISE UTILITIES ───

// SDF badan objek (rubah / kapal) - 100% ocean.html
float hullSDF(vec2 worldXZ, vec2 centerXZ, vec2 fwd, vec2 halfSize, out vec2 localPos){
    vec2 right = vec2(fwd.y, -fwd.x);
    vec2 rel = worldXZ - centerXZ;
    localPos = vec2(dot(rel, right), dot(rel, fwd));
    float taper = smoothstep(halfSize.y, -halfSize.y * 0.2, localPos.y);
    float hw = halfSize.x * (0.15 + 0.85 * sin(taper * 1.57079));
    vec2 d = vec2(abs(localPos.x) - hw, abs(localPos.y) - halfSize.y * 0.95);
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Air di sekitar lambung / badan: HANYA meniskus kontak air bulu tepat di badan, TIDAK menjalar ke belakang
vec2 hullField(vec2 q, vec3 objPos, vec2 objDir, vec2 objSize, float objSpd, float submerge){
    vec2 lp;
    float sdf = hullSDF(q, objPos.xz, objDir, objSize, lp);
    if(sdf > 3.0) return vec2(0.0);
    float spd = clamp(objSpd * 0.12, 0.0, 1.4);
    float hy = objSize.y * 0.95;
    float bow = smoothstep(-hy, hy, lp.y);
    float h = 0.0, foam = 0.0;

    // Meniskus halus dan kontak air tepat di sekeliling rubah
    h += exp(-sq((sdf - 0.08) / 0.25)) * (0.04 + 0.08 * spd * bow) * submerge;

    // Riak dada sangat halus di depan badan saat berenang
    vec2 bp = vec2(lp.x * 0.85, lp.y - hy - 0.10);
    float bowBump = exp(-dot(bp, bp) / (0.4 + spd * 0.4));
    h += bowBump * spd * 0.12 * submerge;

    // Buih kontak HANYA di garis air tepat menempel pada bulu rubah (tidak menjalar ke belakang mengikuti posisi rubah)
    foam += exp(-sq(max(0.0, sdf) / 0.12)) * (0.20 + 0.35 * spd * bow) * submerge;
    foam += bowBump * spd * 0.35 * submerge;
    return vec2(h, clamp(foam, 0.0, 1.0));
}

// Gerstner wave height & normal (9 harmonics, 100% dari ocean.html)
vec3 gerstnerWaveNormal(vec2 xz, float t, float amp, float speed, float chop) {
    float nx = 0.0, ny = 1.0, nz = 0.0;
    float S = chop * 0.9 / 9.0 * clamp(amp, 0.0, 1.2);
    for(int i = 0; i < 9; i++){
        float fi = float(i);
        float a = 0.5 + sin(fi * 12.9898 + 1.3) * 0.85;
        vec2 d = vec2(cos(a), sin(a));
        float L = 95.0 * pow(0.64, fi), k = 6.28318 / L;
        float A = amp * L * 0.014;
        float ph = dot(d, xz) * k + t * sqrt(9.8 * k) * speed + fi * 1.7;
        float s = sin(ph), c = cos(ph);
        nx -= d.x * k * A * c;
        nz -= d.y * k * A * c;
        ny -= S * s;
    }
    float len = length(vec3(nx, ny, nz));
    return normalize(vec3(nx, ny, nz) / max(len, 0.001));
}

// Mikro-detail normal kapiler halus isotropik (2 rotated noise octaves - halus dan bebas aliasing kotak-kotak)
float mhgt(vec2 p){ 
    return onoise(p) * 0.65 + onoise(om2 * p * 2.2 + 3.0) * 0.35; 
}
vec2 mdN(vec2 p){ float e = 0.07, c = mhgt(p); return vec2(mhgt(p + vec2(e, 0.0)) - c, mhgt(p + vec2(0.0, e)) - c) / e; }

// Fox/rubah wake (Multi-harmonic concentric circular dispersion ripples & cellular foam trail)
vec4 foxWakeField(vec2 q, vec4 trailPos[${OCEAN_TRAIL_MAX}], float t) {
    float h = 0.0, foam = 0.0;
    vec2 g = vec2(0.0);
    for(int i = 0; i < ${OCEAN_TRAIL_MAX}; i++){
        float age = t - trailPos[i].z;
        if(age <= 0.0 || age >= 3.8) continue;
        vec2 rel = q - trailPos[i].xy;
        float d = length(rel);
        if(d > 8.5) continue;
        float R = age * 2.2;
        float w = 0.85 + age * 0.48;
        float u = (d - R) / w;
        float k = 3.2;
        float a = 1.0 - age / 3.8;
        float fa = pow(a, 1.15) * trailPos[i].w;

        // Buih jejak tertinggal di posisi dunia (world-anchored trail):
        float rFoam = 0.45 + age * 0.35;
        float trailCenterFoam = exp(-sq(d / rFoam)) * fa * 0.85;
        float ringFoam = exp(-u * u) * fa * 0.52 * smoothstep(0.0, 0.30, age);
        foam = max(foam, trailCenterFoam + ringFoam);

        if(abs(u) < 2.8){
            float amp = a * a * trailPos[i].w * 0.075 / sqrt(1.0 + R * 0.55);
            float e = exp(-u * u);
            // Riak dispersi multi-harmonik (gelombang utama + harmonik kapiler konsentris)
            float ph1 = k * (d - R);
            float ph2 = (k * 2.1) * (d - R * 0.78);
            float waveShape = cos(ph1) * 0.72 + cos(ph2) * 0.32;
            h += amp * e * waveShape;
            float dWave = (-k * sin(ph1) * 0.72 - k * 2.1 * sin(ph2) * 0.32);
            float dd = amp * e * (dWave - 2.0 * u / w * waveShape);
            g += dd * rel / max(d, 0.04);
        }
    }
    float sc = 1.0 / (1.0 + 1.2 * abs(h));
    g *= sc * sc; h *= sc;
    return vec4(h, clamp(foam, 0.0, 1.0), g);
}

// Interpolasi Hermite bilineer halus untuk ketinggian tanah (menghilangkan 100% artefak kotak-kotak/waffle)
float sampleTerrainHeightSmooth(sampler2D tex, vec2 uv, float gridStride) {
    vec2 coord = clamp(uv * (gridStride - 1.0), 0.0, gridStride - 1.001);
    vec2 f = fract(coord);
    vec2 i = floor(coord);
    float texel = 1.0 / gridStride;
    vec2 uv00 = (i + 0.5) * texel;
    float h00 = texture2D(tex, uv00).r;
    float h10 = texture2D(tex, uv00 + vec2(texel, 0.0)).r;
    float h01 = texture2D(tex, uv00 + vec2(0.0, texel)).r;
    float h11 = texture2D(tex, uv00 + vec2(texel, texel)).r;
    vec2 s = f * f * (3.0 - 2.0 * f);
    return mix(mix(h00, h10, s.x), mix(h01, h11, s.x), s.y);
}

// Pola buih wake & foam alami di permukaan air (fluffy aerated froth lembut, bebas garis retakan)
float wakeFoamPattern(vec2 p, float t){
    vec2 warp = vec2(onoise(p * 0.75 + t * 0.14), onoise(p * 0.75 - t * 0.12 + 4.1));
    vec2 pw = p + (warp - 0.5) * 0.85;
    float n1 = onoise(pw * 2.2);
    float n2 = onoise(om2 * pw * 4.6 - t * 0.20);
    float n3 = onoise(om2 * pw * 9.5 + t * 0.28);
    float froth = n1 * 0.50 + n2 * 0.32 + n3 * 0.18;
    return smoothstep(0.18, 0.72, froth);
}

// Sky color dinamis mengikuti suasana atmosfer (Siang, Sore, Malam)
vec3 oceanSkyFast(vec3 d, vec3 sunDir, vec3 skyTint){
    float h = clamp(d.y, 0.0, 1.0);
    float low = pow(1.0 - clamp(sunDir.y * 2.5, 0.0, 1.0), 2.0);
    vec3 horizon = mix(skyTint * 1.15, vec3(1.0, 0.72, 0.5), low * 0.7);
    vec3 zenith  = mix(skyTint * 0.45, vec3(0.14, 0.2, 0.45), low * 0.5);
    vec3 c = mix(horizon, zenith, pow(h, 0.4));
    float s = max(dot(d, sunDir), 0.0);
    c += vec3(1.0, 0.8, 0.55) * pow(s, 6.0) * 0.3;
    return c;
}

// ACES filmic tonemapping (100% dari ocean.html)
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
`;

// Nilai awal sudut matahari identik dengan ocean.html (22 derajat)
const defaultOceanSunEl = THREE.MathUtils.degToRad(22);
const defaultOceanSunDir = new THREE.Vector3(
    Math.cos(defaultOceanSunEl) * 0.5,
    Math.sin(defaultOceanSunEl),
    -Math.cos(defaultOceanSunEl) * 0.85
).normalize();

const dummyDepthTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
dummyDepthTexture.needsUpdate = true;

const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    lights: true,
    fog: false,
    uniforms: Object.assign(
        THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
        {
            uTime: { value: 0 },
            // Mask brush system & terrain height map
            uWaterMask: { value: waterMaskTexture },
            uSceneDepth: { value: dummyDepthTexture },
            uTerrainHeightMap: { value: terrainHeightTexture },
            uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            uCameraNear: { value: 0.1 },
            uCameraFar:  { value: 1000.0 },
            uGroundSize: { value: waterGroundSize },
            // Rubah / fox interaction (mapped ke ocean.html fox/hull system)
            uFoxPos: { value: new THREE.Vector3(0, -999, 0) },
            uFoxDir: { value: new THREE.Vector2(-1, 0) },
            uFoxSpeed: { value: 0.0 },
            uFoxMoving: { value: 0.0 },
            uFoxSubmerge: { value: 1.0 },
            // Matahari / sun (identik ocean.html default: 22 deg)
            uSunDir: { value: defaultOceanSunDir.clone() },
            uSunColor: { value: new THREE.Color(0xfffae6) },
            // Palet warna atmosfer air (Siang, Sore, Malam)
            uWaterDeepColor:    { value: waterAtmospherePresets.day.deep.clone() },
            uWaterShallowColor: { value: waterAtmospherePresets.day.shallow.clone() },
            uWaterSkyColor:     { value: waterAtmospherePresets.day.skyReflect.clone() },
            uWaterFoamColor:    { value: waterAtmospherePresets.day.foam.clone() },
            // Ocean parameters (100% identik ocean.html defaults: 0.70, 1.00, 0.80)
            uAmp: { value: 0.70 },   // Tinggi gelombang Gerstner
            uSpeed: { value: 1.00 },   // Kecepatan gelombang
            uChop: { value: 0.80 },   // Ketajaman puncak gelombang
            // Kelvin wake / trail dari rubah
            uOceanTrailPos: { value: oceanTrailPos },
            uOceanTrailDir: { value: oceanTrailDir },
        }
    ),
    // ============================================================
    // VERTEX SHADER — Gerstner Wave Displacement (100% ocean.html)
    // ============================================================
    vertexShader: `
        #include <common>
        #include <shadowmap_pars_vertex>

        uniform float uTime, uAmp, uSpeed, uChop;
        uniform float uGroundSize;
        uniform vec3  uFoxPos;
        uniform vec2  uFoxDir;
        uniform float uFoxSpeed;
        uniform float uFoxSubmerge;
        uniform vec4  uOceanTrailPos[${OCEAN_TRAIL_MAX}];

        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vH;
        varying float vCrestFoam;
        varying vec2 vBaseUV;
        varying vec2 vBaseXZ;

        ${oceanCommonGLSL}

        void main() {
            // Posisi dunia (sebelum displacement)
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vec3 p0 = worldPosition.xyz;
            vec3 p = p0;
            vec3 n = vec3(0.0, 1.0, 0.0);
            vBaseUV = vec2((p0.x + uGroundSize * 0.5) / uGroundSize, (p0.z + uGroundSize * 0.5) / uGroundSize);
            vBaseXZ = p0.xz;

            // Jacobian untuk deteksi puncak gelombang (foam)
            float jxx = 1.0, jzz = 1.0, jxz = 0.0;
            float S = uChop * 0.9 / 9.0 * clamp(uAmp, 0.0, 1.2);

            // 9-wave Gerstner displacement (100% dari ocean.html vertexShader - kontinu melintasi batas canvas)
            for(int i = 0; i < 9; i++){
                float fi = float(i);
                float a = 0.5 + sin(fi * 12.9898 + 1.3) * 0.85;
                vec2 d = vec2(cos(a), sin(a));
                float L = 95.0 * pow(0.64, fi), k = 6.28318 / L;
                float A = uAmp * L * 0.014;
                float ph = dot(d, p0.xz) * k + uTime * sqrt(9.8 * k) * uSpeed + fi * 1.7;
                float s = sin(ph), c = cos(ph);
                float QA = S / k;
                p.x += QA * d.x * c;
                p.z += QA * d.y * c;
                p.y += A * s;
                n.x -= d.x * k * A * c;
                n.z -= d.y * k * A * c;
                n.y -= S * s;
                jxx -= S * d.x * d.x * s;
                jzz -= S * d.y * d.y * s;
                jxz -= S * d.x * d.y * s;
            }

            // Displacement fisik ombak & Kelvin wake di sekitar rubah (radius optimal)
            if (uFoxPos.y > -900.0 && length(p.xz - uFoxPos.xz) < 22.0) {
                vec2 objDir = (length(uFoxDir) > 0.001) ? normalize(uFoxDir) : vec2(0.0, 1.0);
                vec2 objSize = vec2(0.35, 0.70);
                p.y += hullField(p.xz, uFoxPos, objDir, objSize, uFoxSpeed, uFoxSubmerge).x + foxWakeField(p.xz, uOceanTrailPos, uTime).x;
            }

            float J = jxx * jzz - jxz * jxz;
            vCrestFoam = 1.0 - smoothstep(0.12, 0.65, J);
            vH = p.y;
            vNormal = normalize((modelMatrix * vec4(n, 0.0)).xyz);
            vWorldPos = p;

            worldPosition = vec4(p, 1.0);
            vec4 mvPosition = viewMatrix * worldPosition;
            gl_Position = projectionMatrix * mvPosition;

            vec3 transformedNormal = vNormal;

            #include <shadowmap_vertex>
        }
    `,
    // ============================================================
    // FRAGMENT SHADER — 100% ocean.html visual engine + mask brush
    // ============================================================
    fragmentShader: `
        #include <common>
        #include <packing>
        #include <shadowmap_pars_fragment>

        uniform float uTime, uAmp, uSpeed, uChop;
        uniform sampler2D uWaterMask;
        uniform sampler2D uSceneDepth;
        uniform sampler2D uTerrainHeightMap;
        uniform vec2  uResolution;
        uniform float uCameraNear;
        uniform float uCameraFar;
        uniform float uGroundSize;
        uniform vec3  uFoxPos;
        uniform vec2  uFoxDir;
        uniform float uFoxSpeed;
        uniform float uFoxMoving;
        uniform float uFoxSubmerge;
        uniform vec3  uSunDir;
        uniform vec3  uSunColor;
        uniform vec3  uWaterDeepColor;
        uniform vec3  uWaterShallowColor;
        uniform vec3  uWaterSkyColor;
        uniform vec3  uWaterFoamColor;
        uniform vec4  uOceanTrailPos[${OCEAN_TRAIL_MAX}];

        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vH;
        varying float vCrestFoam;
        varying vec2 vBaseUV;

        ${oceanCommonGLSL}

        void main() {
            // ── MASK CHECK (super-smooth multi-sample anti-aliased shoreline) ───
            vec2 baseUV = vBaseUV;
            if (baseUV.x < 0.0 || baseUV.x > 1.0 || baseUV.y < 0.0 || baseUV.y > 1.0) discard;

            // Cek awal apakah ada air yang digambar di koordinat ini (cegah busa di luar air)
            vec4 rawSample = texture2D(uWaterMask, baseUV);
            float rawMask = max(rawSample.r, rawSample.a);
            if (rawMask <= 0.005) discard;

            // Domain organic anti-aliasing di dalam area air yang digambar
            vec2 orgWarp = vec2(
                onoise(vWorldPos.xz * 0.45 + uTime * 0.12) - 0.5,
                onoise(vWorldPos.zx * 0.45 - uTime * 0.10) - 0.5
            ) * (1.6 / uGroundSize);
            vec2 smoothUV = clamp(baseUV + orgWarp, 0.0, 1.0);

            // 5-tap anti-aliased smooth texture sample
            float texel = 1.0 / 1024.0;
            float mCenter = texture2D(uWaterMask, smoothUV).r;
            float mR = texture2D(uWaterMask, smoothUV + vec2(texel, 0.0)).r;
            float mL = texture2D(uWaterMask, smoothUV - vec2(texel, 0.0)).r;
            float mT = texture2D(uWaterMask, smoothUV + vec2(0.0, texel)).r;
            float mB = texture2D(uWaterMask, smoothUV - vec2(0.0, texel)).r;
            float maskVal = mCenter * 0.40 + (mR + mL + mT + mB) * 0.15;
            if (maskVal <= 0.005) discard;

            // Pasang surut dinamis di tepi pantai (hanya berayun di dalam area air)
            float shoreEdgeFactor = smoothstep(0.005, 0.08, maskVal) * smoothstep(0.40, 0.10, maskVal);
            float tideWave = sin(uTime * 1.8 * uSpeed - maskVal * 18.0 + onoise(vWorldPos.xz * 0.7) * 3.2);
            float dynamicMask = clamp(maskVal + tideWave * 0.032 * clamp(uAmp, 0.2, 1.2) * shoreEdgeFactor, 0.0, 1.0);
            if (dynamicMask <= 0.005) discard;

            // ── DETEKSI OTOMATIS KEDALAMAN AIR TERHADAP SCULPT LANDSCAPE (Bilinear Hermite Smooth) ───
            float terrainH = sampleTerrainHeightSmooth(uTerrainHeightMap, baseUV, float(${terrainGridStride}));
            float waterDepth = vH - terrainH;
            if (waterDepth < -0.05) discard;

            // ── KEDALAMAN FISIK 3D SEJATI VIA DEPTH BUFFER (100% Presisi Mengikuti Geometri 3D Batu, Pohon, Rumput, Tanah) ───
            vec2 screenUV = gl_FragCoord.xy / uResolution;
            float sceneDepthRaw = texture2D(uSceneDepth, screenUV).r;
            float contactDepth = max(0.0, waterDepth);

            if (sceneDepthRaw > 0.0001 && sceneDepthRaw < 0.9999) {
                float sceneViewZ = perspectiveDepthToViewZ(sceneDepthRaw, uCameraNear, uCameraFar);
                float waterViewZ = perspectiveDepthToViewZ(gl_FragCoord.z, uCameraNear, uCameraFar);
                float depthDiff = waterViewZ - sceneViewZ;
                if (depthDiff >= -0.05) {
                    contactDepth = min(contactDepth, max(0.0, depthDiff));
                }
            }

            // ── VIEW & GEOMETRY (100% ocean.html) ─────────────────────
            vec3 V = normalize(cameraPosition - vWorldPos);
            float dist = length(cameraPosition - vWorldPos);
            vec2 q = vWorldPos.xz;

            // ── WAKE & HULL INTERACTION (100% ocean.html) ─────────────
            float wakeFoam = 0.0, wakeWaveH = 0.0;
            vec2 wakeSlope = vec2(0.0);
            vec2 objDir = (length(uFoxDir) > 0.001) ? normalize(uFoxDir) : vec2(0.0, 1.0);
            vec2 objSize = vec2(0.35, 0.70);

            if (uFoxPos.y > -900.0 && length(q - uFoxPos.xz) < 60.0) {
                float e = 0.1;
                vec2 hc = hullField(q, uFoxPos, objDir, objSize, uFoxSpeed, uFoxSubmerge);
                float hx = hullField(q + vec2(e, 0.0), uFoxPos, objDir, objSize, uFoxSpeed, uFoxSubmerge).x;
                float hz = hullField(q + vec2(0.0, e), uFoxPos, objDir, objSize, uFoxSpeed, uFoxSubmerge).x;
                vec4 wk = foxWakeField(q, uOceanTrailPos, uTime);
                wakeSlope = -(vec2(hx - hc.x, hz - hc.x) / e + wk.zw);
                wakeWaveH = hc.x + wk.x;
                wakeFoam = clamp(hc.y + wk.y, 0.0, 1.0);
            } else {
                vec4 wk = foxWakeField(q, uOceanTrailPos, uTime);
                wakeSlope = -wk.zw;
                wakeWaveH = wk.x;
                wakeFoam = clamp(wk.y, 0.0, 1.0);
            }

            // ── OCEAN NORMAL (Analytical Gerstner normal + smooth isotropic capillary micro-detail) ──
            vec2 dt = (mdN(q * 0.7 + uTime * vec2(0.25, 0.10)) + mdN(q * 1.6 - uTime * vec2(0.18, -0.20))) * 0.5;
            float fade = exp(-dist * 0.014);
            float rough = 0.18 * fade + 0.20 * wakeFoam;
            vec3 N = normalize(vNormal + vec3(wakeSlope.x * 0.85 + dt.x * rough, 0.0, wakeSlope.y * 0.85 + dt.y * rough));

            // ── FRESNEL & SUN (100% ocean.html) ──────────────────────
            vec3 R = reflect(-V, N);
            R.y = max(R.y, 0.015);
            R = normalize(R);
            float f = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

            vec3 sunDir = normalize(uSunDir);
            float sunF = clamp(sunDir.y * 2.5, 0.15, 1.0);
            float NdotL = dot(N, sunDir);
            float waveShadow = smoothstep(-0.25, 0.35, NdotL) * 0.45 + 0.55;

            // Shadow map dari pepohonan/batu jika aktif
            float sceneShadow = 1.0;
            #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
                sceneShadow = getShadow(
                    directionalShadowMap[0],
                    directionalLightShadows[0].shadowMapSize,
                    directionalLightShadows[0].shadowBias,
                    directionalLightShadows[0].shadowRadius,
                    vDirectionalShadowCoord[0]
                );
                sceneShadow = mix(0.45, 1.0, smoothstep(0.05, 0.95, sceneShadow));
            #endif

            // Bayangan kontak lembut rubah dihilangkan untuk mencegah bayangan ganda (double shadow)
            // Tiga.js directional shadow map (sceneShadow) sudah merender siluet 3D rubah secara presisi
            float shadow = waveShadow * sceneShadow;

            // ── BODY COLOR & LIT & SSS (Mengikuti suasana: Siang, Sore, Malam) ──────
            vec3 deep    = uWaterDeepColor;
            vec3 shallow = uWaterShallowColor;
            float lit = smoothstep(-1.2 * uAmp, 2.0 * uAmp, vH + wakeWaveH * 1.8);
            vec3 body = mix(deep, shallow, lit * 0.75) * sunF * shadow;

            float back = pow(max(dot(V, -normalize(vec3(sunDir.x, 0.1, sunDir.z))), 0.0), 3.0);
            float wakeSSS = clamp(wakeWaveH * 2.5, 0.0, 0.8);
            body += mix(shallow, vec3(0.08, 0.52, 0.44), 0.45) * (back * lit + wakeSSS * 0.6) * 0.55 * sunF;
            body = mix(body, shallow * sunF, clamp(wakeFoam * 0.45, 0.0, 0.45));

            // ── SKY REFLECTION & COMPOSITION ─────────────────────────
            vec3 col = mix(body, oceanSkyFast(R, sunDir, uWaterSkyColor), clamp(f, 0.0, 1.0));

            // ── SPECULAR HIGHLIGHT (Silky smooth dual lobe ocean specular - tanpa facet/grid) ──
            vec3 H = normalize(sunDir + V);
            float NdotH = max(dot(N, H), 0.0);
            float specVis = smoothstep(-0.05, 0.2, NdotL);
            float spec = (pow(NdotH, 180.0) * 3.5 + pow(NdotH, 32.0) * 0.35) * specVis;

            // ── MULTI-LAYER FOAM (crest foam + wake foam) ──
            float pattern = wakeFoamPattern(q * 1.5, uTime);
            float fineBubbles = onoise(q * 14.0);
            float combinedFoam = max(vCrestFoam * 0.9, wakeFoam);
            float subFoam  = smoothstep(0.24, 0.75, combinedFoam * (0.60 + 0.40 * pattern));
            float coreFoam = smoothstep(0.48, 0.88, combinedFoam * (0.65 + 0.35 * pattern) * (0.70 + 0.30 * fineBubbles));

            col += uSunColor * spec * (1.0 - subFoam * 0.85);

            vec3 underFoamCol = mix(shallow, vec3(0.50, 0.82, 0.88), 0.55) * sunF * (0.7 + 0.3 * shadow);
            vec3 topFoamCol   = mix(uWaterFoamColor, vec3(1.0), 0.40) * (0.60 + 0.40 * sunF) * (0.70 + 0.30 * shadow);
            col = mix(col, underFoamCol, subFoam * 0.55);
            col = mix(col, topFoamCol, coreFoam * 0.90);

            // ── SHORELINE FOAM & SWASH (Hanya pada pantai sculpt tanah/batu di dalam pulau, abaikan batas canvas) ────────
            float effDepth = contactDepth;
            float distToCanvasBorder = min(min(baseUV.x, 1.0 - baseUV.x), min(baseUV.y, 1.0 - baseUV.y)) * uGroundSize;
            float isNearCanvasBorder = 1.0 - smoothstep(0.0, 1.5, distToCanvasBorder);

            // Jika air menyentuh tepi batas canvas (terhubung ke laut luar), abaikan batas canvas (bukan bibir pantai!)
            float dDepth = clamp(effDepth / 0.55, 0.0, 1.0);
            float dMask = mix(clamp((dynamicMask - 0.010) / 0.35, 0.0, 1.0), 1.0, isNearCanvasBorder);
            float shoreDist = min(dDepth, dMask);
            float shoreZone = (1.0 - shoreDist) * (1.0 - isNearCanvasBorder);

            // 2. Ombak bibir pantai (swash & backwash) berirama alami menyapu lereng sculpt tanah
            float swashPhase = uTime * 2.2 * uSpeed - shoreDist * 12.0 + onoise(q * 1.4) * 2.5;
            float waveSwash = sin(swashPhase);
            float waveCrest = smoothstep(0.20, 0.75, waveSwash);

            // 3. Lapisan buih bibir pantai & garis kontak presisi terhadap batu/tanah
            float swashLip = waveCrest * smoothstep(0.42, 0.02, shoreDist) * 1.35;
            float backwashSuds = exp(-shoreDist * 9.0) * 0.70;
            float contactEdge = smoothstep(0.08, 0.00, effDepth) * 0.88;
            float foamBand = clamp(swashLip + backwashSuds + contactEdge, 0.0, 1.0);

            // 4. Pola buih lembut alami (Soft Aerated Froth & Micro-bubbles - bukan garis retakan)
            vec2 foamUV = q * 3.0;
            vec2 fWarp = vec2(onoise(foamUV * 0.6 + uTime * 0.10), onoise(foamUV * 0.6 - uTime * 0.08 + 3.1));
            vec2 pCell = foamUV + (fWarp - 0.5) * 0.85;

            float nMain = onoise(pCell * 2.2);
            float nSub  = onoise(om2 * pCell * 4.6 - uTime * 0.16);
            float nMicro = onoise(q * 12.0 + fWarp * 1.6);
            float naturalFroth = nMain * 0.50 + nSub * 0.32 + nMicro * 0.18;
            float softShorePattern = smoothstep(0.18, 0.72, naturalFroth);

            // 5. Shoreline foam alami menyatu lembut dengan kontak tepi
            float shorelineFoam = smoothstep(0.10, 0.60, foamBand * (0.50 + 0.50 * softShorePattern + contactEdge * 0.35)) * shoreZone;

            // 6. Rona kristal toska-aquamarine sangat cerah dan bercahaya di dekat dataran & objek 3D
            vec3 luminousShoreCol = vec3(0.22, 0.98, 0.92) * (0.88 + 0.35 * sunF);
            vec3 crystalShallowCol = mix(luminousShoreCol, shallow * (1.18 + 0.25 * sunF), 0.28);
            float gradFactor = smoothstep(0.02, 0.95, shoreZone);
            col = mix(col, crystalShallowCol, gradFactor * 0.92);

            // 7. Pewarnaan busa berbayang lembut & berkilau di puncak terkena sinar matahari
            vec3 foamPeakCol = mix(uWaterFoamColor, vec3(1.0), 0.55) * (0.88 + 0.12 * sunF);
            vec3 foamBodyCol = mix(crystalShallowCol, vec3(0.80, 0.94, 0.98), 0.65) * (0.80 + 0.20 * sunF);
            vec3 finalShoreFoamCol = mix(foamBodyCol, foamPeakCol, smoothstep(0.12, 0.65, shorelineFoam));
            col = mix(col, finalShoreFoamCol, shorelineFoam * 0.96);

            // ── ACES TONEMAPPING & GAMMA (Harmonis pada air, specular, dan busa pantai) ───
            col = aces(col * 0.95);

            // 8. Transparansi dinamis jernih kristal di dekat dataran & objek 3D
            // Sangat bening di tepi sehingga kontur batu/tanah terlihat jelas, berangsur pekat di perairan dalam
            float maskAlpha = smoothstep(0.005, 0.35, dynamicMask);
            float depthClarity = mix(0.48, 0.92, smoothstep(0.0, 0.85, contactDepth));
            float baseAlpha = maskAlpha * depthClarity;

            // Buih ombak pantai berkilau di atas air transparan tanpa pernah melubangi air
            float edgeAlpha = clamp(baseAlpha + shorelineFoam * 0.88, 0.0, 1.0);

            gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), edgeAlpha);
        }
    `
});

const waterMesh = new THREE.Mesh(waterGeo, waterMat);
waterMesh.position.y = 0.0;
waterMesh.renderOrder = 2;
waterMesh.receiveShadow = true; // Menerima bayangan dari pohon, bebatuan, dan karakter rubah
scene.add(waterMesh);

// ============================================================
// PARTIKEL PERCIKAN AIR / WATER SPLASH SYSTEM (100% ocean.html)
// ============================================================
const SPLASH_PARTICLE_COUNT = 260;
const splashGeo = new THREE.BufferGeometry();
const splashPos = new Float32Array(SPLASH_PARTICLE_COUNT * 3);
const splashScale = new Float32Array(SPLASH_PARTICLE_COUNT);
const splashData = [];
for (let i = 0; i < SPLASH_PARTICLE_COUNT; i++) {
    splashPos[i * 3 + 1] = -999;
    splashScale[i] = 0;
    splashData.push({ vel: new THREE.Vector3(), life: 0, maxLife: 1 });
}
splashGeo.setAttribute('position', new THREE.BufferAttribute(splashPos, 3));
splashGeo.setAttribute('aScale', new THREE.BufferAttribute(splashScale, 1));

const splashSystem = new THREE.Points(splashGeo, new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `
        attribute float aScale;
        varying float vAlpha;
        void main(){
            vAlpha = clamp(aScale, 0.0, 1.0);
            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aScale * (140.0 / -mvPos.z);
            gl_Position = projectionMatrix * mvPos;
        }`,
    fragmentShader: `
        varying float vAlpha;
        void main(){
            vec2 c = gl_PointCoord - 0.5;
            float r = dot(c, c);
            if(r > 0.25) discard;
            float a = pow(1.0 - r * 4.0, 1.5) * vAlpha * 0.75;
            gl_FragColor = vec4(0.92, 0.97, 1.0, a);
        }`
}));
splashSystem.frustumCulled = false;
scene.add(splashSystem);

let splashCursor = 0;
function spawnSplash(origin, count = 30, power = 1.0, forwardDir = null) {
    if (!origin) return;
    for (let i = 0; i < count; i++) {
        const p = splashData[splashCursor];
        const idx = splashCursor * 3;
        const angle = Math.random() * Math.PI * 2;
        const spread = (0.4 + Math.random() * 1.5) * power;
        splashPos[idx] = origin.x + (Math.random() - 0.5) * 0.8;
        splashPos[idx + 1] = origin.y + 0.12;
        splashPos[idx + 2] = origin.z + (Math.random() - 0.5) * 0.8;
        const fwdX = forwardDir ? forwardDir.x * 2.0 : 0;
        const fwdZ = forwardDir ? forwardDir.z * 2.0 : 0;
        p.vel.set(
            Math.cos(angle) * spread + fwdX,
            (2.2 + Math.random() * 4.0) * power,
            Math.sin(angle) * spread + fwdZ
        );
        p.life = 0.01;
        p.maxLife = 0.4 + Math.random() * 0.4;
        splashCursor = (splashCursor + 1) % SPLASH_PARTICLE_COUNT;
    }
}

// ── FUNGSI SAMPLING GELOMBANG DI CPU (100% ocean.html) ────────
function getWaterWaveHeightAndNormal(x, z, time) {
    const amp = (waterMat && waterMat.uniforms && waterMat.uniforms.uAmp) ? waterMat.uniforms.uAmp.value : 0.70;
    const speed = (waterMat && waterMat.uniforms && waterMat.uniforms.uSpeed) ? waterMat.uniforms.uSpeed.value : 1.00;
    const chop = (waterMat && waterMat.uniforms && waterMat.uniforms.uChop) ? waterMat.uniforms.uChop.value : 0.80;
    const t = (typeof time === 'number') ? time : ((waterMat && waterMat.uniforms && waterMat.uniforms.uTime) ? waterMat.uniforms.uTime.value : 0);
    let py = 0, nx = 0, ny = 1, nz = 0;
    const S = chop * 0.9 / 9.0 * Math.min(Math.max(amp, 0.0), 1.2);
    for (let i = 0; i < 9; i++) {
        const fi = i;
        const a = 0.5 + Math.sin(fi * 12.9898 + 1.3) * 0.85;
        const dx = Math.cos(a), dz = Math.sin(a);
        const L = 95.0 * Math.pow(0.64, fi), k = 6.28318 / L;
        const A = amp * L * 0.014;
        const ph = (dx * x + dz * z) * k + t * Math.sqrt(9.8 * k) * speed + fi * 1.7;
        const s = Math.sin(ph), c = Math.cos(ph);
        py += A * s;
        nx -= dx * k * A * c;
        nz -= dz * k * A * c;
        ny -= S * s;
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    return { y: py, normal: new THREE.Vector3(nx / len, ny / len, nz / len) };
}

// Cek apakah koordinat dunia berada di area kuas air yang aktif
function isWaterAtWorld(worldX, worldZ) {
    if (typeof isOuterOceanEnabled !== 'undefined' && isOuterOceanEnabled && (Math.abs(worldX) >= 39.8 || Math.abs(worldZ) >= 39.8)) {
        return true;
    }
    const halfSize = waterGroundSize / 2;
    const normX = (worldX + halfSize) / waterGroundSize;
    const normZ = (worldZ + halfSize) / waterGroundSize;
    if (normX < 0 || normX > 1 || normZ < 0 || normZ > 1) return false;
    const px = Math.min(waterMaskResolution - 1, Math.max(0, Math.floor(normX * waterMaskResolution)));
    const py = Math.min(waterMaskResolution - 1, Math.max(0, Math.floor(normZ * waterMaskResolution)));
    try {
        const p = waterCtx.getImageData(px, py, 1, 1).data;
        return (p[0] > 15 || p[3] > 15);
    } catch (e) {
        return false;
    }
}

// Trigger riak hantaman air (impact ripple)
function triggerWaterImpactRipple(x, z, intensity = 1.4) {
    const t = (waterMat && waterMat.uniforms && waterMat.uniforms.uTime) ? waterMat.uniforms.uTime.value : 0;
    oceanTrailPos[oceanTrailIdx].set(x, z, t, intensity);
    oceanTrailDir[oceanTrailIdx].set(0, 1);
    oceanTrailIdx = (oceanTrailIdx + 1) % OCEAN_TRAIL_MAX;
    if (waterMat && waterMat.uniforms && waterMat.uniforms.uOceanTrailPos) {
        waterMat.uniforms.uOceanTrailPos.value = oceanTrailPos;
    }
}

// Bidang geometri air dipertahankan sebagai bidang datar horizontal (flat lake/ocean plane)
// Tidak melengkung mengikuti bentuk scrup/bukit landscape.
function resetWaterGeometryToFlat() {
    if (!waterGeo) return;
    const pos = waterGeo.attributes.position;
    if (!pos) return;
    const half = waterGroundSize / 2;
    const segs = waterSegments;
    let idx = 0;
    for (let iy = 0; iy <= segs; iy++) {
        const z = (iy / segs) * waterGroundSize - half;
        for (let ix = 0; ix <= segs; ix++) {
            const x = (ix / segs) * waterGroundSize - half;
            pos.setXYZ(idx, x, 0.0, z);
            idx++;
        }
    }
    pos.needsUpdate = true;
    waterGeo.computeVertexNormals();
}

// Kompatibilitas panggilan dari brush.js, history.js, dan map-storage.js
// Air tetap horizontal murni dan tidak dibengkokkan oleh lekukan bukit/sculpt
function syncWaterGeometryWithTerrain() {
    // No-op: Sengaja dibiarkan datar horizontal alami (tidak terdistorsi oleh bentuk sculpt tanah)
}

// Inisialisasi awal memastikan bidang air datar sempurna
resetWaterGeometryToFlat();

// State kuas air & interpolasi goresan halus
let waterCurrentLevel = 0.0;
let hasAnyWaterDrawn = false;
let lastStrokePoint = null;

// Menggambar satu titik radial halus pada canvas mask
function drawWaterDot(worldX, worldZ, radius, mode) {
    const halfSize = waterGroundSize / 2;
    const normX = (worldX + halfSize) / waterGroundSize;
    const normZ = (worldZ + halfSize) / waterGroundSize;

    if (normX < -0.1 || normX > 1.1 || normZ < -0.1 || normZ > 1.1) return;

    const cx = normX * waterMaskResolution;
    const cy = normZ * waterMaskResolution;
    const pixelRadius = Math.max(3, (radius / waterGroundSize) * waterMaskResolution);

    if (mode === 'paint') {
        const grad = waterCtx.createRadialGradient(cx, cy, 0, cx, cy, pixelRadius);
        grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.60, 'rgba(255, 255, 255, 0.98)');
        grad.addColorStop(0.82, 'rgba(255, 255, 255, 0.52)');
        grad.addColorStop(0.95, 'rgba(255, 255, 255, 0.12)');
        grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

        waterCtx.globalCompositeOperation = 'source-over';
        waterCtx.fillStyle = grad;
        waterCtx.beginPath();
        waterCtx.arc(cx, cy, pixelRadius, 0, Math.PI * 2);
        waterCtx.fill();

        hasAnyWaterDrawn = true;
    } else {
        const grad = waterCtx.createRadialGradient(cx, cy, 0, cx, cy, pixelRadius);
        grad.addColorStop(0.0, 'rgba(0, 0, 0, 1.0)');
        grad.addColorStop(0.60, 'rgba(0, 0, 0, 0.98)');
        grad.addColorStop(0.82, 'rgba(0, 0, 0, 0.52)');
        grad.addColorStop(0.95, 'rgba(0, 0, 0, 0.12)');
        grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

        waterCtx.globalCompositeOperation = 'destination-out';
        waterCtx.fillStyle = grad;
        waterCtx.beginPath();
        waterCtx.arc(cx, cy, pixelRadius, 0, Math.PI * 2);
        waterCtx.fill();
    }
}

// Menggambar jalur goresan air dengan interpolasi kontinu (mencegah tepi bergerigi/kasar)
function paintWaterAt(hitPoint, radius, mode = 'paint') {
    if (!hitPoint) return;

    if (!lastStrokePoint) {
        lastStrokePoint = new THREE.Vector2(hitPoint.x, hitPoint.z);
        drawWaterDot(hitPoint.x, hitPoint.z, radius, mode);
    } else {
        const dist = Math.hypot(hitPoint.x - lastStrokePoint.x, hitPoint.z - lastStrokePoint.z);
        // Step interpolasi rapat (8% dari radius kuas) agar garis sapuan mulus tanpa patahan atau pixelated
        const stepDist = Math.max(0.08, radius * 0.08);
        const steps = Math.max(1, Math.ceil(dist / stepDist));

        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const ix = lastStrokePoint.x + (hitPoint.x - lastStrokePoint.x) * t;
            const iz = lastStrokePoint.z + (hitPoint.z - lastStrokePoint.z) * t;
            drawWaterDot(ix, iz, radius, mode);
        }

        lastStrokePoint.set(hitPoint.x, hitPoint.z);
    }

    if (mode === 'paint' && typeof removeGrassInRadius === 'function') {
        removeGrassInRadius(hitPoint, radius * 0.9);
    }

    waterMaskTexture.needsUpdate = true;
}

// Reset titik goresan saat mouse dilepas
function resetWaterStroke() {
    lastStrokePoint = null;
}

// Menghapus seluruh genangan air di map
function clearAllWater() {
    waterCtx.globalCompositeOperation = 'source-over';
    waterCtx.clearRect(0, 0, waterMaskResolution, waterMaskResolution);
    waterMaskTexture.needsUpdate = true;
    hasAnyWaterDrawn = false;
    lastStrokePoint = null;
}

// Mengatur ketinggian permukaan air (Water Level Y)
function setWaterLevel(y) {
    waterCurrentLevel = y;
    waterMesh.position.y = y;
    if (outerOceanMesh) {
        outerOceanMesh.position.y = y;
    }
    if (typeof groundMat !== 'undefined' && groundMat && groundMat.userData && groundMat.userData.shader && groundMat.userData.shader.uniforms) {
        if (groundMat.userData.shader.uniforms.uGroundWaterLevel) {
            groundMat.userData.shader.uniforms.uGroundWaterLevel.value = y;
        }
    }
}

// Variable state untuk kontrol matahari ocean
let oceanSunDeg = 22;
let oceanSunManual = false; // Default: sinkron realtime mengikuti matahari in-game

// Mengatur sudut elevasi matahari secara manual
function setOceanSunAngle(deg) {
    oceanSunDeg = deg;
    oceanSunManual = true;
    const el = THREE.MathUtils.degToRad(deg);
    const dir = new THREE.Vector3(
        Math.cos(el) * 0.5,
        Math.sin(el),
        -Math.cos(el) * 0.85
    ).normalize();
    if (waterMat && waterMat.uniforms && waterMat.uniforms.uSunDir) {
        waterMat.uniforms.uSunDir.value.copy(dir);
    }
}

// Mengatur parameter dinamis gelombang air (Tinggi / uAmp, Kecepatan / uSpeed, Chop / uChop, Sudut Matahari / sun)
function setWaterParam(param, val) {
    if (!waterMat || !waterMat.uniforms) return;
    const num = parseFloat(val);
    if (param === 'uAmp' && waterMat.uniforms.uAmp) {
        waterMat.uniforms.uAmp.value = num;
    } else if (param === 'uSpeed' && waterMat.uniforms.uSpeed) {
        waterMat.uniforms.uSpeed.value = num;
    } else if (param === 'uChop' && waterMat.uniforms.uChop) {
        waterMat.uniforms.uChop.value = num;
    } else if (param === 'sun' || param === 'uSun') {
        setOceanSunAngle(num);
    } else if (waterMat.uniforms[param]) {
        waterMat.uniforms[param].value = (typeof val === 'number') ? num : val;
    }
}

// ============================================================
// OUTER OCEAN & ISLAND CLIFF SYSTEM
// Menjadikan kanvas tampak seperti pulau alami di tengah samudra
// Menggunakan Ocean Engine yang sama + Dinding Tebing Pantai
// ============================================================
let outerOceanMesh = null;
let islandCliffMesh = null;
let isOuterOceanEnabled = true;

function createOuterOceanGeometry(islandHalf, outerHalf, numRings, segmentsPerSide) {
    const N = segmentsPerSide;
    const vertsPerRing = 4 * N;
    const totalVerts = (numRings + 1) * vertsPerRing;
    const totalQuads = numRings * vertsPerRing;
    const totalTris = totalQuads * 2;

    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);
    const indices = new Uint32Array(totalTris * 3);

    let vIdx = 0;
    for (let r = 0; r <= numRings; r++) {
        const t = r / numRings;
        // Non-linear: kerapatan sangat rapat di tepi pulau (0.8m) menyebar mulus ke cakrawala luar (450m)
        const S = islandHalf + (outerHalf - islandHalf) * Math.pow(t, 1.85);

        for (let side = 0; side < 4; side++) {
            for (let i = 0; i < N; i++) {
                const frac = i / N;
                let x = 0, z = 0;
                if (side === 0) {
                    x = -S + (2 * S) * frac;
                    z = -S;
                } else if (side === 1) {
                    x = S;
                    z = -S + (2 * S) * frac;
                } else if (side === 2) {
                    x = S - (2 * S) * frac;
                    z = S;
                } else if (side === 3) {
                    x = -S;
                    z = S - (2 * S) * frac;
                }

                positions[vIdx * 3]     = x;
                positions[vIdx * 3 + 1] = 0.0;
                positions[vIdx * 3 + 2] = z;

                normals[vIdx * 3]       = 0.0;
                normals[vIdx * 3 + 1]   = 1.0;
                normals[vIdx * 3 + 2]   = 0.0;

                uvs[vIdx * 2]     = (x / (2 * outerHalf)) + 0.5;
                uvs[vIdx * 2 + 1] = (z / (2 * outerHalf)) + 0.5;

                vIdx++;
            }
        }
    }

    let iIdx = 0;
    for (let r = 0; r < numRings; r++) {
        const ringStart = r * vertsPerRing;
        const nextRingStart = (r + 1) * vertsPerRing;

        for (let k = 0; k < vertsPerRing; k++) {
            const next_k = (k + 1) % vertsPerRing;

            const v0 = ringStart + k;
            const v1 = ringStart + next_k;
            const v2 = nextRingStart + k;
            const v3 = nextRingStart + next_k;

            // 2 segitiga CCW menghadap ke atas (+Y)
            indices[iIdx++] = v0;
            indices[iIdx++] = v1;
            indices[iIdx++] = v2;

            indices[iIdx++] = v1;
            indices[iIdx++] = v3;
            indices[iIdx++] = v2;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    return geo;
}

function initOuterOcean() {
    if (outerOceanMesh || typeof scene === 'undefined' || !scene) return;

    const islandHalf = (typeof waterGroundSize !== 'undefined' ? waterGroundSize : 80) / 2;
    const segsPerSide = (typeof waterSegments !== 'undefined') ? waterSegments : 100;
    const outerGeo = createOuterOceanGeometry(islandHalf, 450.0, 90, segsPerSide);

    // 2. Material Lautan Luar: 100% Identik dengan Ocean Engine kanvas (Gerstner, Fox Wake, SSS, Multi-layer Foam, mdN)
    const outerMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        lights: true,
        fog: false,
        uniforms: Object.assign(
            THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
            waterMat.uniforms,
            {
                uIslandHalfSize: { value: islandHalf }
            }
        ),
        vertexShader: `
            #include <common>
            #include <shadowmap_pars_vertex>

            uniform float uTime, uAmp, uSpeed, uChop;
            uniform float uGroundSize;
            uniform float uIslandHalfSize;
            uniform vec3  uFoxPos;
            uniform vec2  uFoxDir;
            uniform float uFoxSpeed;
            uniform float uFoxSubmerge;
            uniform vec4  uOceanTrailPos[${OCEAN_TRAIL_MAX}];

            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying float vH;
            varying float vCrestFoam;
            varying vec2 vBaseUV;
            varying vec2 vBaseXZ;

            ${oceanCommonGLSL}

            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vec3 p0 = worldPosition.xyz;
                vec3 p = p0;
                vec3 n = vec3(0.0, 1.0, 0.0);
                vBaseUV = vec2((p0.x + uGroundSize * 0.5) / uGroundSize, (p0.z + uGroundSize * 0.5) / uGroundSize);
                vBaseXZ = p0.xz;

                float jxx = 1.0, jzz = 1.0, jxz = 0.0;
                float S = uChop * 0.9 / 9.0 * clamp(uAmp, 0.0, 1.2);

                // 9-wave Gerstner displacement (100% dari ocean.html vertexShader - kontinu melintasi batas canvas)
                for(int i = 0; i < 9; i++){
                    float fi = float(i);
                    float a = 0.5 + sin(fi * 12.9898 + 1.3) * 0.85;
                    vec2 d = vec2(cos(a), sin(a));
                    float L = 95.0 * pow(0.64, fi), k = 6.28318 / L;
                    float A = uAmp * L * 0.014;
                    float ph = dot(d, p0.xz) * k + uTime * sqrt(9.8 * k) * uSpeed + fi * 1.7;
                    float s = sin(ph), c = cos(ph);
                    float QA = S / k;
                    p.x += QA * d.x * c;
                    p.z += QA * d.y * c;
                    p.y += A * s;
                    n.x -= d.x * k * A * c;
                    n.z -= d.y * k * A * c;
                    n.y -= S * s;
                    jxx -= S * d.x * d.x * s;
                    jzz -= S * d.y * d.y * s;
                    jxz -= S * d.x * d.y * s;
                }

                // Displacement fisik ombak & Kelvin wake di sekitar rubah
                if (uFoxPos.y > -900.0 && length(p.xz - uFoxPos.xz) < 22.0) {
                    vec2 objDir = (length(uFoxDir) > 0.001) ? normalize(uFoxDir) : vec2(0.0, 1.0);
                    vec2 objSize = vec2(0.35, 0.70);
                    p.y += hullField(p.xz, uFoxPos, objDir, objSize, uFoxSpeed, uFoxSubmerge).x + foxWakeField(p.xz, uOceanTrailPos, uTime).x;
                }

                float J = jxx * jzz - jxz * jxz;
                vCrestFoam = 1.0 - smoothstep(0.12, 0.65, J);
                vH = p.y;
                vNormal = normalize((modelMatrix * vec4(n, 0.0)).xyz);
                vWorldPos = p;

                worldPosition = vec4(p, 1.0);
                vec4 mvPosition = viewMatrix * worldPosition;
                gl_Position = projectionMatrix * mvPosition;

                vec3 transformedNormal = vNormal;

                #include <shadowmap_vertex>
            }
        `,
        fragmentShader: `
            #include <common>
            #include <packing>
            #include <shadowmap_pars_fragment>

            uniform float uTime, uAmp, uSpeed, uChop;
            uniform sampler2D uSceneDepth;
            uniform vec2  uResolution;
            uniform float uCameraNear;
            uniform float uCameraFar;
            uniform float uGroundSize;
            uniform float uIslandHalfSize;
            uniform vec3  uFoxPos;
            uniform vec2  uFoxDir;
            uniform float uFoxSpeed;
            uniform float uFoxMoving;
            uniform float uFoxSubmerge;
            uniform vec3  uSunDir;
            uniform vec3  uSunColor;
            uniform vec3  uWaterDeepColor;
            uniform vec3  uWaterShallowColor;
            uniform vec3  uWaterSkyColor;
            uniform vec3  uWaterFoamColor;
            uniform vec4  uOceanTrailPos[${OCEAN_TRAIL_MAX}];

            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying float vH;
            varying float vCrestFoam;
            varying vec2 vBaseUV;
            varying vec2 vBaseXZ;

            ${oceanCommonGLSL}

            void main() {
                // Jarak ke batas pulau (canvas): 0.0 di tebing pulau, membesar ke laut lepas
                float distToIsland = max(max(abs(vBaseXZ.x), abs(vBaseXZ.y)) - uIslandHalfSize, 0.0);

                // Deteksi 3D Depth kontak fisik terhadap tebing pulau & objek 3D (batu/karang)
                vec2 screenUV = gl_FragCoord.xy / uResolution;
                float sceneDepthRaw = texture2D(uSceneDepth, screenUV).r;
                float contactDepth = 999.0;
                if (sceneDepthRaw > 0.0001 && sceneDepthRaw < 0.9999) {
                    float sceneViewZ = perspectiveDepthToViewZ(sceneDepthRaw, uCameraNear, uCameraFar);
                    float waterViewZ = perspectiveDepthToViewZ(gl_FragCoord.z, uCameraNear, uCameraFar);
                    float depthDiff = waterViewZ - sceneViewZ;
                    if (depthDiff >= -0.05) {
                        contactDepth = max(0.0, depthDiff);
                    }
                }

                // ── VIEW & GEOMETRY (100% ocean.html) ─────────────────────
                vec3 V = normalize(cameraPosition - vWorldPos);
                float dist = length(cameraPosition - vWorldPos);
                vec2 q = vWorldPos.xz;

                // ── WAKE & HULL INTERACTION (100% ocean.html) ─────────────
                float wakeFoam = 0.0, wakeWaveH = 0.0;
                vec2 wakeSlope = vec2(0.0);
                vec2 objDir = (length(uFoxDir) > 0.001) ? normalize(uFoxDir) : vec2(0.0, 1.0);
                vec2 objSize = vec2(0.35, 0.70);

                if (uFoxPos.y > -900.0 && length(q - uFoxPos.xz) < 60.0) {
                    float e = 0.1;
                    vec2 hc = hullField(q, uFoxPos, objDir, objSize, uFoxSpeed, uFoxSubmerge);
                    float hx = hullField(q + vec2(e, 0.0), uFoxPos, objDir, objSize, uFoxSpeed, uFoxSubmerge).x;
                    float hz = hullField(q + vec2(0.0, e), uFoxPos, objDir, objSize, uFoxSpeed, uFoxSubmerge).x;
                    vec4 wk = foxWakeField(q, uOceanTrailPos, uTime);
                    wakeSlope = -(vec2(hx - hc.x, hz - hc.x) / e + wk.zw);
                    wakeWaveH = hc.x + wk.x;
                    wakeFoam = clamp(hc.y + wk.y, 0.0, 1.0);
                } else {
                    vec4 wk = foxWakeField(q, uOceanTrailPos, uTime);
                    wakeSlope = -wk.zw;
                    wakeWaveH = wk.x;
                    wakeFoam = clamp(wk.y, 0.0, 1.0);
                }

                // ── OCEAN NORMAL (Analytical Gerstner normal + smooth isotropic capillary micro-detail) ──
                vec2 dt = (mdN(q * 0.7 + uTime * vec2(0.25, 0.10)) + mdN(q * 1.6 - uTime * vec2(0.18, -0.20))) * 0.5;
                float fade = exp(-dist * 0.014);
                float rough = 0.18 * fade + 0.20 * wakeFoam;
                vec3 N = normalize(vNormal + vec3(wakeSlope.x * 0.85 + dt.x * rough, 0.0, wakeSlope.y * 0.85 + dt.y * rough));

                // ── FRESNEL & SUN (100% ocean.html) ──────────────────────
                vec3 R = reflect(-V, N);
                R.y = max(R.y, 0.015);
                R = normalize(R);
                float f = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

                vec3 sunDir = normalize(uSunDir);
                float sunF = clamp(sunDir.y * 2.5, 0.15, 1.0);
                float NdotL = dot(N, sunDir);
                float waveShadow = smoothstep(-0.25, 0.35, NdotL) * 0.45 + 0.55;

                // Shadow map dari pepohonan/batu jika aktif
                float sceneShadow = 1.0;
                #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
                    sceneShadow = getShadow(
                        directionalShadowMap[0],
                        directionalLightShadows[0].shadowMapSize,
                        directionalLightShadows[0].shadowBias,
                        directionalLightShadows[0].shadowRadius,
                        vDirectionalShadowCoord[0]
                    );
                    sceneShadow = mix(0.45, 1.0, smoothstep(0.05, 0.95, sceneShadow));
                #endif

                float shadow = waveShadow * sceneShadow;

                // ── BODY COLOR & LIT & SSS (Mengikuti suasana: Siang, Sore, Malam) ──────
                vec3 deep    = uWaterDeepColor;
                vec3 shallow = uWaterShallowColor;
                float lit = smoothstep(-1.2 * uAmp, 2.0 * uAmp, vH + wakeWaveH * 1.8);
                vec3 body = mix(deep, shallow, lit * 0.75) * sunF * shadow;

                float back = pow(max(dot(V, -normalize(vec3(sunDir.x, 0.1, sunDir.z))), 0.0), 3.0);
                float wakeSSS = clamp(wakeWaveH * 2.5, 0.0, 0.8);
                body += mix(shallow, vec3(0.08, 0.52, 0.44), 0.45) * (back * lit + wakeSSS * 0.6) * 0.55 * sunF;
                body = mix(body, shallow * sunF, clamp(wakeFoam * 0.45, 0.0, 0.45));

                // ── SKY REFLECTION & COMPOSITION ─────────────────────────
                vec3 col = mix(body, oceanSkyFast(R, sunDir, uWaterSkyColor), clamp(f, 0.0, 1.0));

                // ── SPECULAR HIGHLIGHT (Silky smooth dual lobe ocean specular - tanpa facet/grid) ──
                vec3 H = normalize(sunDir + V);
                float NdotH = max(dot(N, H), 0.0);
                float specVis = smoothstep(-0.05, 0.2, NdotL);
                float spec = (pow(NdotH, 180.0) * 3.5 + pow(NdotH, 32.0) * 0.35) * specVis;

                // ── MULTI-LAYER FOAM (crest foam + wake foam) ──
                float pattern = wakeFoamPattern(q * 1.5, uTime);
                float fineBubbles = onoise(q * 14.0);
                float combinedFoam = max(vCrestFoam * 0.9, wakeFoam);
                float subFoam  = smoothstep(0.24, 0.75, combinedFoam * (0.60 + 0.40 * pattern));
                float coreFoam = smoothstep(0.48, 0.88, combinedFoam * (0.65 + 0.35 * pattern) * (0.70 + 0.30 * fineBubbles));

                col += uSunColor * spec * (1.0 - subFoam * 0.85);

                vec3 underFoamCol = mix(shallow, vec3(0.50, 0.82, 0.88), 0.55) * sunF * (0.7 + 0.3 * shadow);
                vec3 topFoamCol   = mix(uWaterFoamColor, vec3(1.0), 0.40) * (0.60 + 0.40 * sunF) * (0.70 + 0.30 * shadow);
                col = mix(col, underFoamCol, subFoam * 0.55);
                col = mix(col, topFoamCol, coreFoam * 0.90);

                // ── ACES TONEMAPPING & GAMMA (Harmonis pada air dan specular) ───
                col = aces(col * 0.95);

                gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
            }
        `,
        side: THREE.DoubleSide
    });

    outerOceanMesh = new THREE.Mesh(outerGeo, outerMat);
    outerOceanMesh.position.y = (typeof waterCurrentLevel === 'number') ? waterCurrentLevel : 0.0;
    outerOceanMesh.renderOrder = 2;
    scene.add(outerOceanMesh);

    // 3. Dinding Tebing Pantai Pulau (Island Cliff Skirt)
    createIslandCliffSkirt();
}

function createIslandCliffSkirt() {
    if (islandCliffMesh || typeof groundGeo === 'undefined' || !groundGeo) return;

    const segs = (typeof groundSegments !== 'undefined') ? groundSegments : 100;
    const stride = segs + 1;
    const vertCount = (segs + 1) * 2 * 4;

    const cliffGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const indices = [];

    let vIdx = 0;
    function addEdge(getGroundVertexIdx, normalVec) {
        const startV = vIdx;
        for (let i = 0; i <= segs; i++) {
            const gIdx = getGroundVertexIdx(i);
            const gx = groundGeo.attributes.position.getX(gIdx);
            const gy = groundGeo.attributes.position.getY(gIdx);
            const gz = groundGeo.attributes.position.getZ(gIdx);

            // Warna tebing atas sinkron dengan warna tanah/rumput terrain di tepian
            let tr = 0.38, tg = 0.33, tb = 0.27;
            if (groundGeo.attributes.color) {
                tr = groundGeo.attributes.color.getX(gIdx);
                tg = groundGeo.attributes.color.getY(gIdx);
                tb = groundGeo.attributes.color.getZ(gIdx);
            }

            // Vertex atas (mengikuti tinggi tanah pulau & warna tanah tepi)
            positions[vIdx * 3]     = gx;
            positions[vIdx * 3 + 1] = gy;
            positions[vIdx * 3 + 2] = gz;
            normals[vIdx * 3]       = normalVec.x;
            normals[vIdx * 3 + 1]   = normalVec.y;
            normals[vIdx * 3 + 2]   = normalVec.z;
            colors[vIdx * 3]        = tr;
            colors[vIdx * 3 + 1]    = tg;
            colors[vIdx * 3 + 2]    = tb;
            vIdx++;

            // Vertex bawah (menembus ke dasar laut, warna batu gelap alami)
            positions[vIdx * 3]     = gx;
            positions[vIdx * 3 + 1] = -18.0;
            positions[vIdx * 3 + 2] = gz;
            normals[vIdx * 3]       = normalVec.x;
            normals[vIdx * 3 + 1]   = normalVec.y;
            normals[vIdx * 3 + 2]   = normalVec.z;
            colors[vIdx * 3]        = tr * 0.35;
            colors[vIdx * 3 + 1]    = tg * 0.35;
            colors[vIdx * 3 + 2]    = tb * 0.35;
            vIdx++;

            if (i < segs) {
                const base = startV + i * 2;
                indices.push(base, base + 1, base + 2);
                indices.push(base + 2, base + 1, base + 3);
            }
        }
    }

    // Sisi Utara (z = -half)
    addEdge(i => i, new THREE.Vector3(0, 0, -1));
    // Sisi Selatan (z = +half)
    addEdge(i => segs * stride + (segs - i), new THREE.Vector3(0, 0, 1));
    // Sisi Barat (x = -half)
    addEdge(i => (segs - i) * stride, new THREE.Vector3(-1, 0, 0));
    // Sisi Timur (x = +half)
    addEdge(i => i * stride + segs, new THREE.Vector3(1, 0, 0));

    cliffGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    cliffGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    cliffGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    cliffGeo.setIndex(indices);

    const cliffMat = new THREE.MeshToonMaterial({
        vertexColors: true,
        side: THREE.DoubleSide
    });

    islandCliffMesh = new THREE.Mesh(cliffGeo, cliffMat);
    islandCliffMesh.receiveShadow = true;
    scene.add(islandCliffMesh);
}

function syncIslandCliffSkirt() {
    if (!islandCliffMesh || typeof groundGeo === 'undefined' || !groundGeo) return;
    const segs = (typeof groundSegments !== 'undefined') ? groundSegments : 100;
    const stride = segs + 1;
    const cliffPos = islandCliffMesh.geometry.attributes.position;
    const cliffCol = islandCliffMesh.geometry.attributes.color;
    const groundPos = groundGeo.attributes.position;
    const groundCol = groundGeo.attributes.color;

    let vIdx = 0;
    function updateEdge(getGroundVertexIdx) {
        for (let i = 0; i <= segs; i++) {
            const gIdx = getGroundVertexIdx(i);
            const gy = groundPos.getY(gIdx);
            cliffPos.setY(vIdx * 2, gy);

            if (groundCol && cliffCol) {
                const tr = groundCol.getX(gIdx);
                const tg = groundCol.getY(gIdx);
                const tb = groundCol.getZ(gIdx);
                cliffCol.setXYZ(vIdx * 2, tr, tg, tb);
                cliffCol.setXYZ(vIdx * 2 + 1, tr * 0.35, tg * 0.35, tb * 0.35);
            }
            vIdx++;
        }
    }

    updateEdge(i => i);
    updateEdge(i => segs * stride + (segs - i));
    updateEdge(i => (segs - i) * stride);
    updateEdge(i => i * stride + segs);

    cliffPos.needsUpdate = true;
    if (cliffCol) cliffCol.needsUpdate = true;
}

function setOuterOceanEnabled(enabled) {
    isOuterOceanEnabled = !!enabled;
    if (outerOceanMesh) outerOceanMesh.visible = isOuterOceanEnabled;
    if (islandCliffMesh) islandCliffMesh.visible = isOuterOceanEnabled;
}

let lastFoxPos = null;
let lastFoxCalcTime = 0;

// Update animasi shader riak air, sinkronisasi waktu, matahari & interaksi rubah
function updateWater(delta, elapsedTime) {
    if (!waterMat || !waterMat.uniforms) return;
    const u = waterMat.uniforms;

    if (outerOceanMesh && outerOceanMesh.position.y !== waterCurrentLevel) {
        outerOceanMesh.position.y = waterCurrentLevel;
    }

    // Sinkronisasi mask air ke shader tanah agar bayangan tidak ganda di area air
    if (typeof groundMat !== 'undefined' && groundMat && groundMat.userData && groundMat.userData.shader && groundMat.userData.shader.uniforms) {
        const gu = groundMat.userData.shader.uniforms;
        if (gu.uGroundWaterMask && gu.uGroundWaterMask.value !== waterMaskTexture) {
            gu.uGroundWaterMask.value = waterMaskTexture;
        }
        if (gu.uGroundWaterLevel) {
            gu.uGroundWaterLevel.value = (typeof waterCurrentLevel === 'number') ? waterCurrentLevel : 0.0;
        }
    }

    // Sinkronisasi dinamis tinggi terrain ke texture air jika terrain di-sculpt
    if (typeof groundGeo !== 'undefined' && groundGeo && groundGeo.attributes.position && groundGeo.attributes.position.needsUpdate) {
        syncTerrainHeightToWater();
    }

    // 0. Update partikel percikan air (100% ocean.html)
    if (splashData && splashData.length > 0) {
        for (let i = 0; i < SPLASH_PARTICLE_COUNT; i++) {
            const p = splashData[i];
            if (p.life > 0) {
                p.life += delta;
                if (p.life >= p.maxLife) {
                    p.life = 0;
                    splashScale[i] = 0;
                    splashPos[i * 3 + 1] = -999;
                } else {
                    const idx = i * 3;
                    p.vel.y -= 16.0 * delta;
                    splashPos[idx] += p.vel.x * delta;
                    splashPos[idx + 1] += p.vel.y * delta;
                    splashPos[idx + 2] += p.vel.z * delta;
                    splashScale[i] = Math.sin((1.0 - p.life / p.maxLife) * Math.PI) * 1.8;
                }
            }
        }
        splashGeo.attributes.position.needsUpdate = true;
        splashGeo.attributes.aScale.needsUpdate = true;
    }

    // 1. Animasi waktu
    if (u.uTime) {
        u.uTime.value = elapsedTime;
    }

    // 1B. Sinkronisasi waktu dan parameter gelombang air dinamis ke ground shader
    // agar bayangan tanah melacak kontur ombak air yang bergerak secara 100% presisi realtime
    if (typeof groundMat !== 'undefined' && groundMat && groundMat.userData && groundMat.userData.shader && groundMat.userData.shader.uniforms) {
        const gu = groundMat.userData.shader.uniforms;
        if (gu.uGroundWaterTime) gu.uGroundWaterTime.value = elapsedTime;
        if (gu.uGroundWaterAmp && u.uAmp) gu.uGroundWaterAmp.value = u.uAmp.value;
        if (gu.uGroundWaterSpeed && u.uSpeed) gu.uGroundWaterSpeed.value = u.uSpeed.value;
        if (gu.uGroundWaterLevel) gu.uGroundWaterLevel.value = waterCurrentLevel;
        if (gu.uGroundWaterMask && gu.uGroundWaterMask.value !== waterMaskTexture) gu.uGroundWaterMask.value = waterMaskTexture;
    }

    // 2. Sinkronisasi posisi & warna matahari realtime mengikuti sudut matahari in-game
    if (typeof sunLight !== 'undefined' && sunLight && u.uSunDir && !oceanSunManual) {
        u.uSunDir.value.copy(sunLight.position).normalize();
        if (u.uSunColor && sunLight.color) {
            u.uSunColor.value.copy(sunLight.color);
        }
    } else if (oceanSunManual) {
        const el = THREE.MathUtils.degToRad(oceanSunDeg);
        if (u.uSunDir) {
            u.uSunDir.value.set(
                Math.cos(el) * 0.5,
                Math.sin(el),
                -Math.cos(el) * 0.85
            ).normalize();
        }
    }

    // 2B. Transisi warna air realtime mengikuti suasana langit (Siang, Sore, Malam)
    const lerpSpd = Math.min(1.0, (delta || 0.016) * 4.0);
    if (u.uWaterDeepColor)    u.uWaterDeepColor.value.lerp(targetAtmosphere.deep, lerpSpd);
    if (u.uWaterShallowColor) u.uWaterShallowColor.value.lerp(targetAtmosphere.shallow, lerpSpd);
    if (u.uWaterSkyColor)     u.uWaterSkyColor.value.lerp(targetAtmosphere.skyReflect, lerpSpd);
    if (u.uWaterFoamColor)    u.uWaterFoamColor.value.lerp(targetAtmosphere.foam, lerpSpd);

    // 3. Interaksi gelombang dinamis di sekitar karakter rubah (Kelvin Wake + Hull Field)
    if (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root &&
        ((typeof isPlayMode !== 'undefined' && isPlayMode) || (typeof CinematicManager !== 'undefined' && CinematicManager.isFoxEnabled))) {

        const foxPos = wolfCharacter.root.position;

        if (!lastFoxPos) {
            lastFoxPos = foxPos.clone();
            lastFoxCalcTime = elapsedTime;
        }
        const dtFox = Math.max(0.001, elapsedTime - lastFoxCalcTime);
        const distThisFrame = Math.hypot(foxPos.x - lastFoxPos.x, foxPos.z - lastFoxPos.z);
        const computedSpeed = distThisFrame / dtFox;
        lastFoxPos.copy(foxPos);
        lastFoxCalcTime = elapsedTime;

        let speed = computedSpeed;
        if (typeof window.currentFoxSpeed === 'number' && Math.abs(window.currentFoxSpeed) > 0.05) {
            speed = Math.max(speed, Math.abs(window.currentFoxSpeed));
        }

        // Cek apakah posisi Y rubah dekat dengan bidang air (+/- 2.5m)
        if (Math.abs(foxPos.y - waterCurrentLevel) < 2.5) {
            u.uFoxPos.value.set(foxPos.x, foxPos.y, foxPos.z);

            // Submerge ratio (identik ocean.html) dengan damping halus agar busa tidak patah-patah
            if (u.uFoxSubmerge) {
                const targetSubmerge = THREE.MathUtils.clamp(1.2 - Math.abs(foxPos.y - waterCurrentLevel) * 0.5, 0.0, 1.0);
                u.uFoxSubmerge.value = THREE.MathUtils.lerp(
                    u.uFoxSubmerge.value,
                    targetSubmerge,
                    Math.min(1.0, (delta || 0.016) * 6.0)
                );
            }

            // Arah hadap rubah (model rubah di Pandora menghadap -X secara lokal)
            const rotY = (wolfCharacter.root.rotation && typeof wolfCharacter.root.rotation.y === 'number')
                ? wolfCharacter.root.rotation.y : 0;
            const fwdX = -Math.cos(rotY);
            const fwdZ = Math.sin(rotY);
            u.uFoxDir.value.set(fwdX, fwdZ).normalize();

            u.uFoxSpeed.value = THREE.MathUtils.lerp(u.uFoxSpeed.value, speed, Math.min(1.0, (delta || 0.016) * 8.0));

            // Target wave blend
            const targetWave = Math.min(1.5, Math.max(0.35, speed * 1.2 + 0.35));
            u.uFoxMoving.value = THREE.MathUtils.lerp(
                u.uFoxMoving.value,
                targetWave,
                Math.min(1.0, (delta || 0.016) * 8.0)
            );

            // ── KELVIN WAKE TRAIL SPAWN (World-anchored foam trail seperti efek rumput) ──
            const distMoved = Math.hypot(
                foxPos.x - oceanLastTrailSpawnPos.x,
                foxPos.z - oceanLastTrailSpawnPos.y
            );
            if (distMoved > 0.28 && speed > 0.18) {
                const trailX = foxPos.x;
                const trailZ = foxPos.z;
                const intensity = Math.min(1.4, speed * 0.14 + 0.40);
                oceanTrailPos[oceanTrailIdx].set(trailX, trailZ, elapsedTime, intensity);
                oceanTrailDir[oceanTrailIdx].set(fwdX, fwdZ);
                oceanTrailIdx = (oceanTrailIdx + 1) % OCEAN_TRAIL_MAX;
                oceanLastTrailSpawnPos.set(foxPos.x, foxPos.z);
                if (u.uOceanTrailPos) u.uOceanTrailPos.value = oceanTrailPos;
            }
        } else {
            u.uFoxPos.value.set(0, -999, 0);
            u.uFoxMoving.value = 0.0;
            u.uFoxSpeed.value = 0.0;
        }
    } else {
        u.uFoxPos.value.set(0, -999, 0);
        u.uFoxMoving.value = 0.0;
        u.uFoxSpeed.value = 0.0;
    }
}

// Inisialisasi awal preset suasana air sesuai nilai UI saat ini
setTimeout(() => {
    const skySelect = document.getElementById('select-sky-preset');
    if (skySelect && skySelect.value) {
        setWaterAtmospherePreset(skySelect.value);
    }
}, 50);

function updateWaterCanvasSize(newSize) {
    waterGroundSize = newSize;
    window.waterGroundSize = newSize;

    // 1. Rebuild water plane geometry
    if (typeof waterMesh !== 'undefined' && waterMesh) {
        if (waterMesh.geometry) waterMesh.geometry.dispose();
        waterGeo = new THREE.PlaneGeometry(waterGroundSize, waterGroundSize, waterSegments, waterSegments);
        waterGeo.rotateX(-Math.PI / 2);
        waterMesh.geometry = waterGeo;
    }

    // 2. Update water material uniform
    if (typeof waterMat !== 'undefined' && waterMat && waterMat.uniforms) {
        if (waterMat.uniforms.uGroundSize) {
            waterMat.uniforms.uGroundSize.value = newSize;
        }
    }

    // 3. Rebuild outer ocean geometry (lingkaran luar yang mengitari kanvas)
    const islandHalf = newSize / 2;
    if (typeof outerOceanMesh !== 'undefined' && outerOceanMesh) {
        if (outerOceanMesh.geometry) outerOceanMesh.geometry.dispose();
        const segsPerSide = (typeof waterSegments !== 'undefined') ? waterSegments : 100;
        outerOceanMesh.geometry = createOuterOceanGeometry(islandHalf, 450.0, 90, segsPerSide);
        if (outerOceanMesh.material && outerOceanMesh.material.uniforms) {
            if (outerOceanMesh.material.uniforms.uGroundSize) {
                outerOceanMesh.material.uniforms.uGroundSize.value = newSize;
            }
            if (outerOceanMesh.material.uniforms.uIslandHalfSize) {
                outerOceanMesh.material.uniforms.uIslandHalfSize.value = islandHalf;
            }
        }
    }

    // 4. Rebuild tebing pulau (island cliff skirt) yang menempel tepat di perimeter baru
    if (typeof islandCliffMesh !== 'undefined' && islandCliffMesh && typeof scene !== 'undefined') {
        scene.remove(islandCliffMesh);
        if (islandCliffMesh.geometry) islandCliffMesh.geometry.dispose();
        if (islandCliffMesh.material) islandCliffMesh.material.dispose();
        islandCliffMesh = null;
        createIslandCliffSkirt();
    }
}
window.updateWaterCanvasSize = updateWaterCanvasSize;

// Export global untuk digunakan oleh brush.js, UI controls, sky.js, fox-physics.js dan map-storage.js
window.paintWaterAt = paintWaterAt;
window.resetWaterStroke = resetWaterStroke;
window.clearAllWater = clearAllWater;
window.setWaterLevel = setWaterLevel;
window.updateWater = updateWater;
window.setWaterParam = setWaterParam;
window.setOceanSunAngle = setOceanSunAngle;
window.setWaterAtmospherePreset = setWaterAtmospherePreset;
window.waterAtmospherePresets = waterAtmospherePresets;
window.waterMesh = waterMesh;
window.waterCanvas = waterCanvas;
window.waterMaskTexture = waterMaskTexture;
window.syncWaterGeometryWithTerrain = syncWaterGeometryWithTerrain;
window.resetWaterGeometryToFlat = resetWaterGeometryToFlat;
window.getWaterCurrentLevel = () => waterCurrentLevel;
window.hasWaterDrawn = () => hasAnyWaterDrawn;
window.setHasWaterDrawn = (val) => { hasAnyWaterDrawn = !!val; };
window.spawnSplash = spawnSplash;
window.getWaterWaveHeightAndNormal = getWaterWaveHeightAndNormal;
window.isWaterAtWorld = isWaterAtWorld;
window.triggerWaterImpactRipple = triggerWaterImpactRipple;
window.setOuterOceanEnabled = setOuterOceanEnabled;
window.isOuterOceanEnabled = () => isOuterOceanEnabled;
window.syncIslandCliffSkirt = syncIslandCliffSkirt;

setTimeout(initOuterOcean, 100);
