/* Water Manager - Genshin Impact Serene Glassy Water v2 (Brushable & Interactive) */
// ==========================================
// 4B. GENSHIN SERENE GLASSY WATER MANAGER
// ==========================================

const waterGroundSize = (typeof groundSize !== 'undefined') ? groundSize : 80;
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

// Geometry bidang air yang menyatu dengan kontur topografi tanah (terhindar dari tertimbun bukit)
const waterSegments = (typeof groundSegments !== 'undefined') ? groundSegments : 100;
const waterGeo = new THREE.PlaneGeometry(waterGroundSize, waterGroundSize, waterSegments, waterSegments);
waterGeo.rotateX(-Math.PI / 2);

// Preset Palet Warna Air Berdasarkan Suasana Waktu (Siang, Sore, Malam)
const waterAtmospherePresets = {
    day: {
        warmShallowTint: new THREE.Color(0x7be3b5), // Hijau kekuningan lembut di tepi paling dangkal
        emeraldGreen:    new THREE.Color(0x45dfb8), // Hijau zamrud / mint jernih
        aquaTurquoise:   new THREE.Color(0x1dbcd1), // Transisi biru toska halus
        lakeAzure:       new THREE.Color(0x1c92cf), // Biru danau tenang di area tengah
        deepReflection:  new THREE.Color(0x3a8cd9), // Biru pantulan di kejauhan
        skyReflect:      new THREE.Color(0x78bcf5), // Pantulan langit cerah
        cloudWhite:      new THREE.Color(0xeef8ff), // Pantulan awan putih lembut
        horizonFog:      new THREE.Color(0xbce4fa), // Kabut cakrawala siang
        sunSpecular:     new THREE.Color(0xfffae6), // Kilau specular matahari siang
        underlightColor: new THREE.Color(0x0c3022), // Pendar kejernihan dasar air dangkal
        waterClarity:    1.0
    },
    sunset: {
        warmShallowTint: new THREE.Color(0xf0a875), // Dangkal keemasan tembaga sore
        emeraldGreen:    new THREE.Color(0xdb7150), // Air hangat rona jingga amber
        aquaTurquoise:   new THREE.Color(0xbd5066), // Transisi dusky coral rose
        lakeAzure:       new THREE.Color(0x662a52), // Danau ungu pekat bernuansa senja
        deepReflection:  new THREE.Color(0x3f1a40), // Kedalaman violet gelap sore
        skyReflect:      new THREE.Color(0xff8c55), // Pantulan mega merah / sunset glow
        cloudWhite:      new THREE.Color(0xffd5a2), // Pantulan awan senja keemasan
        horizonFog:      new THREE.Color(0xffa052), // Kabut cakrawala senja
        sunSpecular:     new THREE.Color(0xffb04a), // Kilau pendar matahari terbenam
        underlightColor: new THREE.Color(0x38180d), // Pendar dasar air bernuansa hangat
        waterClarity:    0.85
    },
    night: {
        warmShallowTint: new THREE.Color(0x103448), // Dangkal bernuansa nocturnal cyan gelap
        emeraldGreen:    new THREE.Color(0x092233), // Biru laut malam pekat
        aquaTurquoise:   new THREE.Color(0x061726), // Sapphire navy tenang
        lakeAzure:       new THREE.Color(0x030f1b), // Danau malam obsidian
        deepReflection:  new THREE.Color(0x020810), // Kedalaman gelap pekat di kejauhan
        skyReflect:      new THREE.Color(0x163454), // Pantulan langit malam bertabur bintang
        cloudWhite:      new THREE.Color(0x456c90), // Pendar awan malam lembut
        horizonFog:      new THREE.Color(0x061322), // Kabut malam menyatu
        sunSpecular:     new THREE.Color(0x9ed3ff), // Pendar kilau rembulan perak kebiruan
        underlightColor: new THREE.Color(0x020a10), // Pendar dasar air malam
        waterClarity:    0.45
    }
};

// Target suasana aktif untuk transisi lerp halus antar preset
let currentWaterPresetKey = 'day';
const targetAtmosphere = {
    warmShallowTint: waterAtmospherePresets.day.warmShallowTint.clone(),
    emeraldGreen:    waterAtmospherePresets.day.emeraldGreen.clone(),
    aquaTurquoise:   waterAtmospherePresets.day.aquaTurquoise.clone(),
    lakeAzure:       waterAtmospherePresets.day.lakeAzure.clone(),
    deepReflection:  waterAtmospherePresets.day.deepReflection.clone(),
    skyReflect:      waterAtmospherePresets.day.skyReflect.clone(),
    cloudWhite:      waterAtmospherePresets.day.cloudWhite.clone(),
    horizonFog:      waterAtmospherePresets.day.horizonFog.clone(),
    sunSpecular:     waterAtmospherePresets.day.sunSpecular.clone(),
    underlightColor: waterAtmospherePresets.day.underlightColor.clone(),
    waterClarity:    waterAtmospherePresets.day.waterClarity
};

// Fungsi beralih preset suasana air (dipanggil saat preset langit berubah)
function setWaterAtmospherePreset(presetKey) {
    const p = waterAtmospherePresets[presetKey] || waterAtmospherePresets.day;
    currentWaterPresetKey = presetKey;
    targetAtmosphere.warmShallowTint.copy(p.warmShallowTint);
    targetAtmosphere.emeraldGreen.copy(p.emeraldGreen);
    targetAtmosphere.aquaTurquoise.copy(p.aquaTurquoise);
    targetAtmosphere.lakeAzure.copy(p.lakeAzure);
    targetAtmosphere.deepReflection.copy(p.deepReflection);
    targetAtmosphere.skyReflect.copy(p.skyReflect);
    targetAtmosphere.cloudWhite.copy(p.cloudWhite);
    targetAtmosphere.horizonFog.copy(p.horizonFog);
    targetAtmosphere.sunSpecular.copy(p.sunSpecular);
    targetAtmosphere.underlightColor.copy(p.underlightColor);
    targetAtmosphere.waterClarity = p.waterClarity;
}

// Material air kustom Genshin Serene Glassy Water v3:
// 1. Dukungan Shadow Map Three.js (terkena bayangan pohon, batu, rubah)
// 2. Transisi warna tone dinamis siang/sore/malam
// 3. Gelombang ombak dinamis rubah: V-shaped Kelvin bow wake, trailing stern ripples & buih
const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    lights: true,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -1.0,
    polygonOffsetUnits: -4.0,
    uniforms: Object.assign(
        THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
        THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        {
            uTime:            { value: 0 },
            uWarmShallowTint: { value: targetAtmosphere.warmShallowTint },
            uEmeraldGreen:    { value: targetAtmosphere.emeraldGreen },
            uAquaTurquoise:   { value: targetAtmosphere.aquaTurquoise },
            uLakeAzure:       { value: targetAtmosphere.lakeAzure },
            uDeepReflection:  { value: targetAtmosphere.deepReflection },
            uSkyReflect:      { value: targetAtmosphere.skyReflect },
            uCloudWhite:      { value: targetAtmosphere.cloudWhite },
            uHorizonFog:      { value: targetAtmosphere.horizonFog },
            uSunSpecular:     { value: targetAtmosphere.sunSpecular },
            uUnderlightColor: { value: targetAtmosphere.underlightColor },
            uWaterClarity:    { value: targetAtmosphere.waterClarity },
            uWaterMask:       { value: waterMaskTexture },
            uGroundSize:      { value: waterGroundSize },
            uFoxPos:          { value: new THREE.Vector3(0, -999, 0) },
            uFoxDir:          { value: new THREE.Vector2(-1, 0) },
            uFoxSpeed:        { value: 0.0 },
            uFoxMoving:       { value: 0.0 },
            uSunDir:          { value: new THREE.Vector3(0, 1, 0) },
            uSunColor:        { value: new THREE.Color(0xfffae6) }
        }
    ),
    vertexShader: `
        #include <common>
        #include <shadowmap_pars_vertex>
        #include <fog_pars_vertex>

        varying vec3 vWorldPos;
        varying vec3 vNormal;

        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vec4 worldPos = worldPosition;
            vWorldPos = worldPosition.xyz;

            vec3 objectNormal = normal;
            vec3 transformedNormal = normalMatrix * objectNormal;
            vNormal = transformedNormal;

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

        uniform float uTime;
        uniform vec3 uWarmShallowTint;
        uniform vec3 uEmeraldGreen;
        uniform vec3 uAquaTurquoise;
        uniform vec3 uLakeAzure;
        uniform vec3 uDeepReflection;
        uniform vec3 uSkyReflect;
        uniform vec3 uCloudWhite;
        uniform vec3 uHorizonFog;
        uniform vec3 uSunSpecular;
        uniform vec3 uUnderlightColor;
        uniform float uWaterClarity;
        uniform sampler2D uWaterMask;
        uniform float uGroundSize;

        uniform vec3 uFoxPos;
        uniform vec2 uFoxDir;
        uniform float uFoxSpeed;
        uniform float uFoxMoving;

        uniform vec3 uSunDir;
        uniform vec3 uSunColor;

        varying vec3 vWorldPos;
        varying vec3 vNormal;

        // Fungsi Smooth Noise C2 (Sangat lembut seperti sapuan kuas, tanpa bintik kasar)
        float hash(vec2 p) {
            p = fract(p * vec2(127.1, 311.7));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }

        float smoothNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
            return mix(
                mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
                u.y
            );
        }

        // FBM untuk siluet pantulan awan lembut di atas air
        float cloudFBM(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 3; i++) {
                v += a * smoothNoise(p);
                p *= 1.95;
                a *= 0.5;
            }
            return v;
        }

        // Ria Khas Genshin Tenang (Stretched Calm Ripples)
        float getCalmRipple(vec2 xz, float t) {
            vec2 uv1 = vec2(xz.x * 0.18, xz.y * 1.15) + vec2(t * 0.08, t * 0.05);
            vec2 uv2 = vec2(xz.x * 0.24, xz.y * 1.45) - vec2(t * 0.06, -t * 0.04);
            float r1 = smoothNoise(uv1);
            float r2 = smoothNoise(uv2);
            return (r1 * 0.6 + r2 * 0.4);
        }

        // Fungsi simulasi ketinggian gelombang interaksi fluida rubah (Doppler wake alami, organik, dan melengkung)
        float getFoxWaveSample(vec2 worldXZ, vec2 foxXZ, vec2 fwdDir, float speed, float moving, float time) {
            vec2 toPos = worldXZ - foxXZ;
            float r = length(toPos);
            if (r > 6.0 || moving < 0.01) return 0.0;

            float speedRatio = clamp(speed * 0.28, 0.0, 1.0);

            // Pergeseran pusat ekspansi riak ke belakang sesuai arah lari (Doppler displacement)
            // Menghasilkan kurva wake parabola/hiperbola alami tanpa ada garis patah atau efek tangga
            vec2 shiftedPos = toPos + fwdDir * (r * 0.40 * speedRatio);
            float sDist = length(shiftedPos);

            // Modulasi noise fluida lembut agar ombak beriak dinamis seperti air jernih Genshin
            float noiseVal = smoothNoise(shiftedPos * 1.6 + vec2(time * 0.35, 0.0)) * 0.25;
            float wavePhase = sDist * 7.5 - time * (4.8 + speed * 1.4) + noiseVal;
            float waveSin = sin(wavePhase);

            // Redaman eksponensial lembut seiring jarak
            float falloff = exp(-sDist * 0.92) * smoothstep(5.5, 0.2, sDist);

            // Pembobotan arah: riak lebih dominan di belakang dan samping daripada di depan dada
            float fwdDot = dot(normalize(toPos + vec2(0.0001)), fwdDir);
            float dirWeight = mix(0.40, 1.0, smoothstep(0.4, -0.6, fwdDot));

            return waveSin * falloff * dirWeight * (0.018 + speedRatio * 0.028) * moving;
        }

        void main() {
            // Periksa sapuan kuas pada mask UV (akurat 1:1 terhadap koordinat dunia)
            vec2 maskUV = vec2(
                (vWorldPos.x + uGroundSize * 0.5) / uGroundSize,
                (vWorldPos.z + uGroundSize * 0.5) / uGroundSize
            );

            if (maskUV.x < 0.0 || maskUV.x > 1.0 || maskUV.y < 0.0 || maskUV.y > 1.0) {
                discard;
            }

            vec4 maskSample = texture2D(uWaterMask, maskUV);
            float maskVal = max(maskSample.r, maskSample.a);
            if (maskVal < 0.005) {
                discard;
            }

            vec3 viewVec = cameraPosition - vWorldPos;
            float dist = length(viewVec);
            vec3 viewDir = viewVec / max(dist, 0.001);

            // 1. HITUNG RIAK TENANG
            float rippleVal = getCalmRipple(vWorldPos.xz, uTime);
            float rippleRight = getCalmRipple(vWorldPos.xz + vec2(0.15, 0.0), uTime);
            float rippleFront = getCalmRipple(vWorldPos.xz + vec2(0.0, 0.15), uTime);

            float normalTilt = 0.085 * (1.0 - smoothstep(15.0, 90.0, dist) * 0.6);
            vec3 waterNormal = normalize(vec3(
                (rippleVal - rippleRight) * normalTilt,
                1.0,
                (rippleVal - rippleFront) * normalTilt * 2.5
            ));

            // 2. GELOMBANG INTERAKSI DINAMIS KARAKTER RUBAH (ORGANIC FLUID WAKES & RIPPLES)
            vec2 foxToPos = vWorldPos.xz - uFoxPos.xz;
            float distFox = length(foxToPos);
            float totalFoam = 0.0;

            if (distFox < 6.0 && uFoxPos.y > -900.0 && uFoxMoving > 0.01) {
                vec2 fwd = (length(uFoxDir) > 0.001) ? normalize(uFoxDir) : vec2(-1.0, 0.0);
                float speedRatio = clamp(uFoxSpeed * 0.28, 0.0, 1.0);

                // Perhitungan gradien kemiringan normal gelombang secara analitis (Finite Difference)
                // Menghilangkan 100% artefak garis laser lurus atau lonjakan specular abnormal
                float eps = 0.08;
                float hC = getFoxWaveSample(vWorldPos.xz, uFoxPos.xz, fwd, uFoxSpeed, uFoxMoving, uTime);
                float hR = getFoxWaveSample(vWorldPos.xz + vec2(eps, 0.0), uFoxPos.xz, fwd, uFoxSpeed, uFoxMoving, uTime);
                float hF = getFoxWaveSample(vWorldPos.xz + vec2(0.0, eps), uFoxPos.xz, fwd, uFoxSpeed, uFoxMoving, uTime);

                vec3 waveGrad = vec3(
                    (hC - hR) / eps,
                    0.0,
                    (hC - hF) / eps
                );

                // Terapkan kemiringan normal riak air secara anggun, halus dan terkontrol
                waterNormal = normalize(waterNormal + clamp(waveGrad * 1.1, -0.16, 0.16));

                // Buih putih lembut di sekitar tapak kaki dan puncak riak terdekat (Cel-Shaded Ring Crests)
                vec2 shiftedPos = foxToPos + fwd * (distFox * 0.40 * speedRatio);
                float sDist = length(shiftedPos);
                float wavePhase = sDist * 7.5 - uTime * (4.8 + uFoxSpeed * 1.4);
                float crest = smoothstep(0.65, 0.94, sin(wavePhase));
                float footGlow = exp(-distFox * 2.4) * (0.2 + 0.5 * speedRatio);
                float wakeFoam = crest * exp(-sDist * 1.35) * (0.3 + 0.5 * speedRatio);
                totalFoam = clamp((footGlow + wakeFoam) * uFoxMoving * 0.65, 0.0, 0.75);
            }

            // 3. GRADASI WARNA LUKISAN AIR (SESUAI TONE SUASANA SIANG / SORE / MALAM)
            float gradDist = clamp((dist - 3.0) / 36.0, 0.0, 1.0);
            float smoothGrad = clamp(gradDist + (rippleVal - 0.5) * 0.03, 0.0, 1.0);

            vec3 waterColor = mix(uWarmShallowTint, uEmeraldGreen, smoothstep(0.0, 0.15, smoothGrad));
            waterColor = mix(waterColor, uAquaTurquoise, smoothstep(0.12, 0.42, smoothGrad));
            waterColor = mix(waterColor, uLakeAzure, smoothstep(0.38, 0.78, smoothGrad));
            waterColor = mix(waterColor, uDeepReflection, smoothstep(0.72, 1.0, smoothGrad));

            // Tekstur halus pendar bawah air dangkal
            float shallowZone = 1.0 - smoothstep(3.0, 22.0, dist);
            float softUnderlight = smoothNoise(vWorldPos.xz * 0.45 + vec2(uTime * 0.04, 0.0));
            waterColor += uUnderlightColor * (softUnderlight - 0.5) * shallowZone * uWaterClarity;

            // 4. PANTULAN CERMIN LANGIT & AWAN (FRESNEL GLASSY REFLECTION)
            float NdotV = max(dot(waterNormal, viewDir), 0.0);
            float fresnel = pow(1.0 - NdotV, 2.5);
            fresnel = smoothstep(0.08, 0.92, fresnel) * 0.82;

            vec3 reflectDir = reflect(-viewDir, waterNormal);
            vec2 skyUV = reflectDir.xz / (abs(reflectDir.y) + 0.32);
            skyUV.x += (rippleVal - 0.5) * 0.18;

            float cloudNoise = cloudFBM(skyUV * 0.75 + vec2(uTime * 0.008, 0.0));
            float cloudMask = smoothstep(0.50, 0.68, cloudNoise);

            float subtleRibbon = smoothstep(0.38, 0.62, rippleVal);
            vec3 skyReflection = mix(uSkyReflect, uCloudWhite, cloudMask * 0.75);
            skyReflection = mix(skyReflection * 0.95, skyReflection * 1.03, subtleRibbon);

            // 5. EVALUASI BAYANGAN OBJEK DI SEKITAR AIR (SHADOW MAP)
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

            // Faktor bayangan: air di dalam bayangan meredam sinar matahari langsung
            // namun tetap memantulkan pendar atmosferik langit sekitarnya
            float shadowFactor = mix(0.42, 1.0, smoothstep(0.05, 0.95, shadowVal));

            // 6. KILAU CAHAYA MATAHARI / BULAN (DIRECT SUN SPECULAR GLINT)
            vec3 lightDir = (length(uSunDir) > 0.001) ? normalize(uSunDir) : vec3(0.0, 1.0, 0.0);
            vec3 halfVec = normalize(viewDir + lightDir);
            float NdotH = max(dot(waterNormal, halfVec), 0.0);
            float sunSpec = clamp(pow(NdotH, 85.0) * 1.3, 0.0, 1.4);
            vec3 specularColor = uSunSpecular * sunSpec * shadowVal; // Specular otomatis hilang di area berbayang

            // 7. KOMPOSISI AKHIR WARNA AIR
            vec3 litWater = waterColor * shadowFactor;
            vec3 finalColor = mix(litWater, skyReflection * mix(0.72, 1.0, shadowFactor), fresnel);
            finalColor += specularColor;

            // Tambahkan buih ombak putih di sekitar rubah
            finalColor += mix(vec3(0.68, 0.92, 0.88), uCloudWhite, 0.5) * totalFoam * shadowFactor;

            // Ujung kuas sangat halus (Ultra Smooth Shoreline) tanpa efek gerigi
            float edgeAlpha = smoothstep(0.005, 0.32, maskVal);
            gl_FragColor = vec4(finalColor, edgeAlpha * (0.88 * uWaterClarity + 0.1));

            #include <fog_fragment>
        }
    `
});

const waterMesh = new THREE.Mesh(waterGeo, waterMat);
waterMesh.position.y = 0.0;
waterMesh.renderOrder = 2;
waterMesh.receiveShadow = true; // Menerima bayangan dari pohon, bebatuan, dan karakter rubah
scene.add(waterMesh);

// Sinkronisasi geometri air mengikuti kontur topografi tanah (terhindar dari tertimbun bukit)
function syncWaterGeometryWithTerrain() {
    if (typeof groundGeo === 'undefined' || !groundGeo || !waterGeo) return;
    const gPos = groundGeo.attributes.position;
    const wPos = waterGeo.attributes.position;
    if (!gPos || !wPos || gPos.count !== wPos.count) return;

    for (let i = 0; i < gPos.count; i++) {
        wPos.setXYZ(
            i,
            gPos.getX(i),
            gPos.getY(i) + 0.035, // 3.5cm tepat di atas permukaan tanah agar tidak tertimbun bukit & bebas z-fighting
            gPos.getZ(i)
        );
    }
    wPos.needsUpdate = true;
    waterGeo.computeVertexNormals();
}

// Inisialisasi awal penyelarasan mesh air dengan tanah
syncWaterGeometryWithTerrain();

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
        grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.96)');
        grad.addColorStop(0.82, 'rgba(255, 255, 255, 0.45)');
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
        grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.9)');
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
        // Step interpolasi rapat (15% dari radius kuas) agar garis sapuan mulus tanpa patahan
        const stepDist = Math.max(0.15, radius * 0.15);
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
}

// Update animasi shader riak air, sinkronisasi suasana waktu & interaksi ombak rubah
function updateWater(delta, elapsedTime) {
    if (!waterMat || !waterMat.uniforms) return;

    // 1. Animasi waktu
    if (waterMat.uniforms.uTime) {
        waterMat.uniforms.uTime.value = elapsedTime;
    }

    // 2. Transisi halus tone warna air sesuai suasana (Siang, Sore, Malam)
    const lerpRate = Math.min(1.0, (delta || 0.016) * 3.5);
    const u = waterMat.uniforms;
    if (u.uWarmShallowTint) u.uWarmShallowTint.value.lerp(targetAtmosphere.warmShallowTint, lerpRate);
    if (u.uEmeraldGreen)    u.uEmeraldGreen.value.lerp(targetAtmosphere.emeraldGreen, lerpRate);
    if (u.uAquaTurquoise)   u.uAquaTurquoise.value.lerp(targetAtmosphere.aquaTurquoise, lerpRate);
    if (u.uLakeAzure)       u.uLakeAzure.value.lerp(targetAtmosphere.lakeAzure, lerpRate);
    if (u.uDeepReflection)  u.uDeepReflection.value.lerp(targetAtmosphere.deepReflection, lerpRate);
    if (u.uSkyReflect)      u.uSkyReflect.value.lerp(targetAtmosphere.skyReflect, lerpRate);
    if (u.uCloudWhite)      u.uCloudWhite.value.lerp(targetAtmosphere.cloudWhite, lerpRate);
    if (u.uHorizonFog)      u.uHorizonFog.value.lerp(targetAtmosphere.horizonFog, lerpRate);
    if (u.uSunSpecular)     u.uSunSpecular.value.lerp(targetAtmosphere.sunSpecular, lerpRate);
    if (u.uUnderlightColor) u.uUnderlightColor.value.lerp(targetAtmosphere.underlightColor, lerpRate);
    if (u.uWaterClarity) {
        u.uWaterClarity.value = THREE.MathUtils.lerp(u.uWaterClarity.value, targetAtmosphere.waterClarity, lerpRate);
    }

    // 3. Sinkronisasi posisi dan warna cahaya matahari aktual
    if (typeof sunLight !== 'undefined' && sunLight) {
        if (u.uSunDir) u.uSunDir.value.copy(sunLight.position).normalize();
        if (u.uSunColor) u.uSunColor.value.copy(sunLight.color);
    }

    // 4. Interaksi gelombang dinamis di sekitar karakter rubah
    if (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root && 
        ((typeof isPlayMode !== 'undefined' && isPlayMode) || (typeof CinematicManager !== 'undefined' && CinematicManager.isFoxEnabled))) {
        
        const foxPos = wolfCharacter.root.position;
        // Cek apakah posisi Y rubah dekat dengan bidang air (+/- 2.5m)
        if (Math.abs(foxPos.y - waterCurrentLevel) < 2.5) {
            u.uFoxPos.value.set(foxPos.x, foxPos.y, foxPos.z);

            // Arah hadap rubah (model rubah di Pandora menghadap -X secara lokal)
            const rotY = (wolfCharacter.root.rotation && typeof wolfCharacter.root.rotation.y === 'number') 
                ? wolfCharacter.root.rotation.y : 0;
            const fwdX = -Math.cos(rotY);
            const fwdZ = Math.sin(rotY);
            u.uFoxDir.value.set(fwdX, fwdZ).normalize();

            // Dapatkan kecepatan pergerakan rubah
            let speed = 0.0;
            if (typeof currentSpeed !== 'undefined' && typeof currentSpeed === 'number') {
                speed = Math.abs(currentSpeed);
            } else if (typeof wolfCharacter.currentSpeed === 'number') {
                speed = Math.abs(wolfCharacter.currentSpeed);
            } else if (wolfCharacter.velocity) {
                speed = Math.hypot(wolfCharacter.velocity.x, wolfCharacter.velocity.z);
            } else if (typeof isMoving !== 'undefined' && isMoving) {
                speed = 1.0;
            }

            u.uFoxSpeed.value = THREE.MathUtils.lerp(u.uFoxSpeed.value, speed, (delta || 0.016) * 6.0);

            // Target wave blend: jika diam di air ada riak idle (0.35), jika jalan/lari ombak membesar hingga 1.5
            const targetWave = Math.min(1.5, Math.max(0.35, speed * 1.2 + 0.35));
            u.uFoxMoving.value = THREE.MathUtils.lerp(
                u.uFoxMoving.value,
                targetWave,
                (delta || 0.016) * 6.0
            );
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

// Export global untuk digunakan oleh brush.js, UI controls, sky.js, dan map-storage.js
window.paintWaterAt = paintWaterAt;
window.resetWaterStroke = resetWaterStroke;
window.clearAllWater = clearAllWater;
window.setWaterLevel = setWaterLevel;
window.updateWater = updateWater;
window.setWaterAtmospherePreset = setWaterAtmospherePreset;
window.waterAtmospherePresets = waterAtmospherePresets;
window.waterMesh = waterMesh;
window.waterCanvas = waterCanvas;
window.waterMaskTexture = waterMaskTexture;
window.syncWaterGeometryWithTerrain = syncWaterGeometryWithTerrain;
window.getWaterCurrentLevel = () => waterCurrentLevel;
window.hasWaterDrawn = () => hasAnyWaterDrawn;
