/* Sky dome, volumetric clouds, sun sprite, sky presets */
// ==========================================
// 2. DETAILED VOLUMETRIC CLOUD SYSTEM (NEW)
// ==========================================
// Latar langit gradient Genshin Impact (Cakrawala biru muda terang, tengah biru segar, atas biru pekat)
const skyGeo = new THREE.SphereGeometry(700, 32, 15);
// Awan dihitung per piksel di shader langit (lapisan awan di ketinggian, diproyeksikan ke kubah):
// FBM + domain warp, bayangan diri ke arah matahari, silver lining, dan memudar ke kabut cakrawala.
const SKY_IS_PHONE = typeof PANDORA_IS_PHONE !== 'undefined' && PANDORA_IS_PHONE;
const SKY_CLOUD_OCTAVES = SKY_IS_PHONE ? 4 : 5;
const SKY_CLOUD_STEPS = SKY_IS_PHONE ? 11 : 14;
const skyShader = {
    uniforms: {
        uTopColor: { value: new THREE.Color(0x2f6fd6) },
        uMidColor: { value: new THREE.Color(0x6fa8e6) },
        uBottomColor: { value: new THREE.Color(0xcfe2ef) },
        uSunPosition: { value: new THREE.Vector3(-25, 12, 25) },
        uSunColor: { value: new THREE.Color(0xfffae6) },
        uSunIntensity: { value: 1.0 }, // 0 saat malam (bulan memakai sprite)
        // Awan (diisi PandoraClouds)
        uCloudTime: { value: 0 },
        uCloudCoverage: { value: 0.42 },
        uCloudScale: { value: 1.6 },
        uCloudStretch: { value: new THREE.Vector2(1, 1) },
        uCloudSoftness: { value: 0.22 },
        uCloudOpacity: { value: 1.0 },
        uCloudWarp: { value: 0.35 },
        uCloudAbsorb: { value: 2.2 },
        uCloudBillow: { value: 1.0 },
        uCloudThickness: { value: 0.45 },  // Tebal lapisan relatif terhadap ketinggian dasar awan
        uCloudOvercast: { value: 0 },     // Hujan/salju: langit tertutup awan kelabu
        uCloudWind: { value: new THREE.Vector2(0.012, 0.004) },
        uCloudLit: { value: new THREE.Color(0xffffff) },
        uCloudShade: { value: new THREE.Color(0x8f9db3) }
    },
    vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `,
    fragmentShader: `
        #define CLOUD_OCTAVES ${SKY_CLOUD_OCTAVES}
        #define CLOUD_STEPS ${SKY_CLOUD_STEPS}
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uBottomColor;
        uniform vec3 uSunPosition;
        uniform vec3 uSunColor;
        uniform float uSunIntensity;
        uniform float uCloudTime, uCloudCoverage, uCloudScale, uCloudSoftness, uCloudOpacity;
        uniform float uCloudWarp, uCloudAbsorb, uCloudBillow, uCloudOvercast, uCloudThickness;
        uniform vec2 uCloudStretch, uCloudWind;
        uniform vec3 uCloudLit, uCloudShade;
        varying vec3 vWorldPosition;

        // Cakram matahari ~1.1 derajat (sedikit dibesarkan dari aslinya 0.53 agar terbaca di layar game)
        #define SUN_COS_OUTER 0.99982
        #define SUN_COS_INNER 0.99992

        float cHash(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
        }
        float cNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            // Interpolasi quintic: tanpa sudut/garis lurus khas grid value noise
            vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
            return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), u.x),
                       mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        // Oktaf diputar supaya pola grid noise tidak terlihat; "billow" membuat tepi bergumpal ala kumulus
        float cFbm(vec2 p, int octaves) {
            float a = 0.5, s = 0.0;
            for (int i = 0; i < CLOUD_OCTAVES; i++) {
                if (i >= octaves) break;
                float n = cNoise(p);
                n = mix(n, 1.0 - abs(n * 2.0 - 1.0), uCloudBillow * 0.45);
                s += a * n;
                p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.31;
                a *= 0.5;
            }
            return s;
        }
        // Medan awan di titik bidang (x,z): bentuk besar dari oktaf rendah, detail frekuensi tinggi hanya
        // menggerigiskan permukaan & tepi. detailOut dipakai untuk tekstur warna.
        float cloudField(vec2 xz, int baseOctaves, int detailOctaves, float detailAmp, out float detailOut) {
            vec2 uv = xz / uCloudStretch + uCloudWind * uCloudTime;
            vec2 warp = (vec2(cNoise(uv * 0.45 + 3.1), cNoise(uv * 0.45 + 17.7)) - 0.5) * uCloudWarp * 2.2;
            float n = cFbm(uv + warp, baseOctaves);
            float detail = detailOctaves > 0 ? cFbm(uv * 3.7 + warp * 1.7 + 11.0, detailOctaves) : 0.5;
            detailOut = detail;
            return n + (detail - 0.5) * 0.16 * detailAmp;
        }

        void main() {
            vec3 dir = normalize(vWorldPosition);
            float h = dir.y;

            // Gradasi langit: cakrawala terang berkabut, zenit biru pekat
            float hHorizon = smoothstep(-0.06, 0.28, h);
            float hZenith = smoothstep(0.18, 0.85, h);
            vec3 skyColor = mix(uBottomColor, uMidColor, hHorizon);
            skyColor = mix(skyColor, uTopColor, hZenith);

            vec3 sunDir = normalize(uSunPosition);
            float sunDot = max(0.0, dot(dir, sunDir));
            float sunHigh = smoothstep(-0.02, 0.45, sunDir.y);
            vec3 sunTint = mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.96, 0.88), sunHigh) * mix(vec3(1.0), uSunColor, 0.5);

            // Hamburan Mie: pendar lebar menjadi bagian langit; inti matahari (cakram + aureole) dihitung
            // terpisah supaya bisa TERTUTUP awan (sebelumnya cakram HDR tetap tembus awan tebal)
            float horizonGlow = pow(sunDot, 4.0) * (1.0 - smoothstep(0.0, 0.35, h)) * 0.28;
            // Langit memucat sedikit di sekitar matahari (hamburan multi), lebih jenuh di seberangnya
            skyColor = mix(skyColor, skyColor * vec3(0.92, 0.96, 1.04), (1.0 - sunDot) * 0.5 * hZenith);
            skyColor += sunTint * (pow(sunDot, 6.0) * 0.06 + horizonGlow) * uSunIntensity;
            float aureole = pow(sunDot, 600.0) * 0.28 + pow(sunDot, 40.0) * 0.12;
            float disc = smoothstep(SUN_COS_OUTER, SUN_COS_INNER, sunDot) * smoothstep(-0.03, 0.0, dir.y);
            float limb = sqrt(max(0.0, 1.0 - pow((1.0 - sunDot) / (1.0 - SUN_COS_OUTER), 2.0)));
            vec3 sunCore = sunTint * (aureole + pow(sunDot, 6000.0) * 1.2) * uSunIntensity;
            vec3 discColor = sunTint * (6.0 + 6.0 * limb);
            float sunTrans = 1.0;   // Seberapa banyak cahaya matahari lolos lewat awan di piksel ini

            // ---------- Awan volumetrik ringan ----------
            // Lapisan awan setinggi y=1..1+tebal (satuan relatif, kamera di y=0). Tiap kolom (x,z) punya
            // tutupan c; puncak awan setinggi c (kembang kol), dasar datar. Sinar pandang dilangkahkan melewati
            // lapisan itu. Cahaya matahari = seberapa dalam titik di bawah puncak kolom ke arah matahari.
            float cover = mix(uCloudCoverage, max(uCloudCoverage, 1.05), uCloudOvercast);
            if (h > 0.004 && cover > 0.01 && uCloudOpacity > 0.01) {
                float freq = uCloudScale * 1.3;
                float thick = uCloudThickness;
                float tStart = 1.0 / h;
                // Lintasan dibatasi: bagian lapisan yang lebih jauh sudah tertutup awan di depannya, dan
                // lintasan pendek berarti langkah rapat (tepi awan halus, tanpa gerigi tangga)
                float tEnd = min(min((1.0 + thick) / h, tStart + 1.3), 34.0);
                if (tStart < tEnd) {
                    float dt = (tEnd - tStart) / float(CLOUD_STEPS);
                    // Awal langkah digeser pola interleaved-gradient yang TETAP (tidak berubah tiap frame):
                    // pita langkah hilang tanpa bintik yang berkelip seperti noise acak per frame
                    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
                    float t = tStart + dt * ign;
                    // Arah sampel bayangan diri: menuju matahari, jangkauannya dibatasi di dalam awan yang sama.
                    // Tanpa batas, matahari rendah (cot sudut besar) melompatkan sampel ke awan lain yang tak
                    // berhubungan, sehingga cahaya awan acak (bentuk "abstrak", kelabu datar, goresan putih).
                    vec2 sunXZdir = normalize(sunDir.xz + vec2(1e-4));
                    float sunCot = length(sunDir.xz) / max(sunDir.y, 0.05);
                    vec3 sunCol = sunTint * (1.25 + 0.25 * sunHigh) * uSunIntensity + uCloudLit * (1.0 - uSunIntensity) * 0.6;
                    // Fase hamburan: dasar merata + hamburan ke depan (silver lining) yang dihitung terpisah,
                    // karena hanya tepi TIPIS yang berpendar; massa awan tebal di depan matahari tetap gelap
                    float phase = 0.55 + pow(sunDot, 2.0) * 0.35;
                    // Matahari dekat cakrawala: silver lining dilunakkan (tepi tipis berderet dekat cakrawala
                    // tampak seperti goresan putih acak)
                    float lowSun = 1.0 - smoothstep(0.03, 0.3, sunDir.y);
                    float forward = (pow(sunDot, 8.0) * 2.0 + pow(sunDot, 80.0) * 4.0) * mix(1.0, 0.35, lowSun);
                    float trans = 1.0;
                    vec3 acc = vec3(0.0);
                    vec3 accSilver = vec3(0.0);
                    // Detail halus hanya di awan dekat; di kejauhan detail lebih kecil dari piksel dan berkedip
                    float detailAmp = 1.0 - smoothstep(2.0, 7.0, tStart);
                    // Jumlah oktaf TETAP di seluruh langit (berganti per jarak memunculkan garis batas);
                    // detail memudar halus lewat amplitudo
                    int detailOct = CLOUD_OCTAVES - 3;
                    int baseOct = CLOUD_OCTAVES - 1;
                    // Ambang naik sesuai ketinggian: awan menyempit ke atas sehingga sisinya membulat (kubah),
                    // bukan dinding tegak. Puncak tiap kolom = ketinggian saat ambang melewati nilai medan.
                    float thr = 0.78 - cover * 0.6;
                    float soft = uCloudSoftness * 0.75;
                    const float TAPER = 0.2;
                    for (int i = 0; i < CLOUD_STEPS; i++) {
                        vec3 p = dir * t;
                        float hy = (p.y - 1.0) / thick;              // 0 dasar .. 1 puncak lapisan
                        float detail;
                        float n = cloudField(p.xz * freq, baseOct, detailOct, detailAmp, detail);
                        // Penyempitan kuadratik: sisi tegak di dasar, membulat di atas (kubah, bukan kerucut)
                        float hc = max(hy, 0.0);
                        float thrH = thr + hc * hc * TAPER;
                        float c = smoothstep(thrH, thrH + soft, n);
                        float top = sqrt(clamp((n - thr) / TAPER, 0.0, 1.0));
                        float dens = c * smoothstep(0.0, 0.12, hy + 0.03) * (1.0 - smoothstep(0.9, 1.0, hy));
                        if (dens > 0.01) {
                            // Bayangan diri: puncak kolom ke arah matahari menutupi titik ini
                            float dummy;
                            float reach = min(thick * (1.0 - hy) * sunCot * 0.6, thick * 0.9 + 0.08);
                            float ns = cloudField((p.xz + sunXZdir * reach) * freq, 3, 0, 0.0, dummy);
                            float topSun = sqrt(clamp((ns - thr) / TAPER, 0.0, 1.0));
                            float occl = max(0.0, topSun - hy) + max(0.0, top - hy) * 0.5;
                            float sunVis = exp(-occl * uCloudAbsorb * 1.6);
                            // Melihat ke arah matahari = melihat sisi bayangan awan: badan lebih gelap,
                            // hanya tepi tipis yang bercahaya (silver lining di bawah)
                            sunVis *= mix(1.0, 0.4, pow(sunDot, 3.0));
                            // Cahaya langit: bagian atas lebih terang, dasar awan kelabu
                            vec3 amb = mix(uCloudShade, mix(uCloudShade, uCloudLit, 0.55) + uMidColor * 0.12, hy);
                            float detailShade = 1.0 + (detail - 0.5) * 0.28 * detailAmp;
                            vec3 col = (amb + sunCol * sunVis * phase) * detailShade;
                            float a = 1.0 - exp(-dens * dt * 13.0 * uCloudOpacity / thick);
                            acc += trans * a * col;
                            accSilver += trans * a * sunCol * sunVis * forward;
                            trans *= 1.0 - a;
                            if (trans < 0.02) break;
                        }
                        t += dt;
                    }
                    float alpha = 1.0 - trans;
                    if (alpha > 0.001) {
                        // Silver lining meredup di bagian tebal (alpha tinggi), terang di tepi tipis
                        vec3 cloudCol = (acc + accSilver * pow(1.0 - alpha, 0.7)) / alpha;
                        cloudCol = mix(cloudCol, cloudCol * vec3(0.94, 0.95, 1.0), uCloudOvercast * 0.5);
                        // Perspektif udara: awan jauh larut ke warna cakrawala
                        float haze = 1.0 - exp(-max(0.0, tStart - 1.5) * 0.16);
                        cloudCol = mix(cloudCol, skyColor, haze * 0.75);
                        // Awan sangat jauh memudar perlahan ke cakrawala (tanpa garis batas tajam)
                        alpha *= smoothstep(0.004, 0.035, h) * (1.0 - haze * 0.35) * (1.0 - smoothstep(14.0, 30.0, tStart));
                        skyColor = mix(skyColor, cloudCol, alpha);
                        sunTrans = 1.0 - alpha;
                    }
                }
            }
            // Mendung: langit ikut kelabu rata di bawah awan
            float overcastVeil = uCloudOvercast * 0.35 * smoothstep(-0.05, 0.25, h);
            skyColor = mix(skyColor, mix(uCloudShade, uCloudLit * 0.85, 0.55), overcastVeil);
            sunTrans *= 1.0 - overcastVeil * 2.5;
            sunTrans = clamp(sunTrans, 0.0, 1.0);

            // Matahari di atas awan: tertutup sesuai tebal awan (pangkat 3 = awan tebal menutup penuh, awan
            // tipis masih menampakkan cakram redup), aureole sedikit lebih tembus seperti di dunia nyata
            skyColor += sunCore * (sunTrans * sunTrans * 0.8 + sunTrans * 0.2);
            skyColor = mix(skyColor, discColor, disc * uSunIntensity * sunTrans * sunTrans * sunTrans);

            gl_FragColor = vec4(skyColor, 1.0);
        }
    `
};

const skyMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(skyShader.uniforms),
    vertexShader: skyShader.vertexShader,
    fragmentShader: skyShader.fragmentShader,
    side: THREE.BackSide
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

// Partikel Gumpalan Awan Lembut (Soft Radial Gradient Puff)
function createCloudPuffTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.4)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
}

const puffTexture = createCloudPuffTexture();

// Shader Volumetric Partikel (Menyertakan fitur billboarding & gradasi vertikal bayangan)
const volumetricCloudShader = {
    uniforms: {
        uTexture: { value: puffTexture },
        uBaseColor: { value: new THREE.Color(0xffffff) },
        uShadowColor: { value: new THREE.Color(0x8a9bb4) },
        uTime: { value: 0.0 },           // Tambahan waktu
        uWindSpeed: { value: 1.0 }       // Kecepatan angin
    },
    vertexShader: `
        attribute float aShadowFactor;
        varying vec2 vUv;
        varying float vShadow;

        uniform float uTime;
        uniform float uWindSpeed;
        uniform float uPuffScale;

        void main() {
            vUv = uv;
            vShadow = aShadowFactor;

            vec4 instancePos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            
            vec3 cameraRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
            vec3 cameraUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
            
            vec3 scale = vec3(
                length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2])),
                length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2])),
                length(vec3(instanceMatrix[2][0], instanceMatrix[2][1], instanceMatrix[2][2]))
            );

            float animTime = uTime * 1.2;
            vec3 windOffset = vec3(
                sin(animTime + instancePos.x * 0.02) * 3.0,
                cos(animTime + instancePos.y * 0.02) * 2.0,
                sin(animTime + instancePos.z * 0.02) * 3.0
            );

            vec3 vertexPos = (instancePos.xyz + windOffset) 
                           + cameraRight * position.x * scale.x * uPuffScale 
                           + cameraUp * position.y * scale.y * uPuffScale;

            gl_Position = projectionMatrix * viewMatrix * vec4(vertexPos, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D uTexture;
        uniform vec3 uBaseColor;
        uniform vec3 uShadowColor;
        varying vec2 vUv;
        varying float vShadow;

        void main() {
            vec4 texColor = texture2D(uTexture, vUv);
            if(texColor.a < 0.02) discard;
            
            vec3 finalColor = mix(uShadowColor, uBaseColor, vShadow);
            gl_FragColor = vec4(finalColor, texColor.a * 0.95); // Sedikit diturunkan opacity-nya
        }
    `
};

const volumetricCloudMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(volumetricCloudShader.uniforms),
    vertexShader: volumetricCloudShader.vertexShader,
    fragmentShader: volumetricCloudShader.fragmentShader,
    transparent: true,
    depthWrite: false, // Penting agar tumpukan partikel transparan tidak glitch
});

volumetricCloudMat.uniforms.uPuffScale = { value: PandoraSettings.preset().cloudPuffScale || 1 };

const cloudGroup = new THREE.Group();
scene.add(cloudGroup);

// Buat InstancedMesh skala besar
const maxTotalPuffs = 12000;
const cloudPuffGeo = new THREE.PlaneGeometry(1, 1);
const cloudInstancedMesh = new THREE.InstancedMesh(cloudPuffGeo, volumetricCloudMat, maxTotalPuffs);

const shadowData = new Float32Array(maxTotalPuffs);
cloudPuffGeo.setAttribute('aShadowFactor', new THREE.InstancedBufferAttribute(shadowData, 1));

cloudGroup.add(cloudInstancedMesh);

let globalPuffIndex = 0;
const tempDummy = new THREE.Object3D();

// Fungsi untuk menghasilkan satu formasi awan cumulonimbus (ratusan partikel dirangkai)
// Fungsi untuk menghasilkan satu formasi awan yang lebih ramping, horizontal, dan ramah POV rendah
function spawnCumulonimbus(centerX, baseY, centerZ, scaleBase) {
    const numPuffs = Math.floor(70 + Math.random() * 45);
    const maxRadius = 105 * scaleBase;                       // Bentuk lebih melebar & megah
    const maxHeight = 52 * scaleBase;                        // Ketinggian vertikal proporsional (tidak menjulang tinggi ke luar layar)

    for (let i = 0; i < numPuffs; i++) {
        if (globalPuffIndex >= maxTotalPuffs) break;

        // Distribusi partikel
        const r = Math.pow(Math.random(), 0.6) * maxRadius;
        const angle = Math.random() * Math.PI * 2;

        const lx = Math.cos(angle) * r;
        const lz = Math.sin(angle) * r;

        // Kubah awan
        const heightProfile = 1.0 - Math.pow(r / maxRadius, 1.8);
        const ly = (Math.random() * maxHeight * heightProfile) + (Math.random() * 8);

        const px = centerX + lx;
        const py = baseY + ly;
        const pz = centerZ + lz;

        // Ukuran partikel puff proporsional
        const puffScale = (29 + Math.random() * 40) * scaleBase * (0.6 + 0.4 * heightProfile);

        tempDummy.position.set(px, py, pz);
        tempDummy.scale.set(puffScale, puffScale, puffScale);
        tempDummy.updateMatrix();

        cloudInstancedMesh.setMatrixAt(globalPuffIndex, tempDummy.matrix);

        // Faktor shading vertikal
        const shadowVal = Math.min(1.0, Math.max(0.0, ly / maxHeight));
        shadowData[globalPuffIndex] = shadowVal;

        globalPuffIndex++;
    }
}

// Hasilkan awan dengan posisi ketinggian (Y) yang disesuaikan agar terlihat jelas dari POV Fox
function buildSkyDomeClouds() {
    globalPuffIndex = 0;
    const numberOfClouds = 34;

    for (let c = 0; c < numberOfClouds; c++) {
        // Beri jarak sudut yang rata antar awan
        const angle = (c / numberOfClouds) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
        const distance = 430 + Math.random() * 60;

        const px = Math.cos(angle) * distance;
        // Ketinggian dasar awan diturunkan (dari 35-55 menjadi 2-10) agar masuk ke dalam frame kamera Fox
        const py = 2 + Math.random() * 8;
        const pz = Math.sin(angle) * distance;

        const scale = 0.85 + Math.random() * 0.4;
        spawnCumulonimbus(px, py, pz, scale);
    }

    // Bersihkan sisa buffer instanced mesh jika jumlah partikel berkurang
    for (let i = globalPuffIndex; i < maxTotalPuffs; i++) {
        tempDummy.position.set(0, -9999, 0);
        tempDummy.scale.set(0, 0, 0);
        tempDummy.updateMatrix();
        cloudInstancedMesh.setMatrixAt(i, tempDummy.matrix);
    }

    cloudInstancedMesh.count = Math.round(globalPuffIndex * PandoraSettings.preset().cloudFraction);
    cloudInstancedMesh.instanceMatrix.needsUpdate = true;
    cloudPuffGeo.attributes.aShadowFactor.needsUpdate = true;
}

buildSkyDomeClouds();
// Gumpalan billboard lama diganti awan di shader langit (PandoraClouds). Objeknya dibiarkan ada karena
// dirujuk sistem lain (pengaturan grafis, pass kedalaman air), tapi tidak digambar.
cloudGroup.visible = false;

// Matahari (Sprite Diperkecil)
// Membuat Tekstur Korona Matahari Berlapis yang Realistis
// Membuat Tekstur Korona Matahari Berlapis dengan Ukuran Lebih Besar
function createRealSunTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.2, 'rgba(255, 240, 190, 0.95)');
    grad.addColorStop(0.5, 'rgba(255, 160, 50, 0.45)');
    grad.addColorStop(0.8, 'rgba(255, 100, 10, 0.1)');
    grad.addColorStop(1, 'rgba(255, 80, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(canvas);
}

const sunTexture = createRealSunTexture();

function createRealMoonTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // 1. Pendar pudar atmosfer bulan (Soft Celestial Lunar Halo)
    const haloGrad = ctx.createRadialGradient(128, 128, 45, 128, 128, 128);
    haloGrad.addColorStop(0, 'rgba(180, 220, 255, 0.45)');
    haloGrad.addColorStop(0.35, 'rgba(120, 185, 255, 0.22)');
    haloGrad.addColorStop(0.7, 'rgba(80, 150, 240, 0.08)');
    haloGrad.addColorStop(1, 'rgba(50, 120, 220, 0)');
    ctx.fillStyle = haloGrad;
    ctx.fillRect(0, 0, 256, 256);

    // 2. Lingkaran Piringan Bulan Utama (Luminous Moon Disc)
    ctx.beginPath();
    ctx.arc(128, 128, 48, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fbff';
    ctx.shadowColor = '#b8e0ff';
    ctx.shadowBlur = 25;
    ctx.fill();

    // 3. Tekstur Kawah & Lautan Lunar (Lunar Maria & Details)
    ctx.shadowBlur = 0;
    const craters = [
        { x: 115, y: 110, r: 16, a: 0.28 },
        { x: 140, y: 125, r: 14, a: 0.22 },
        { x: 120, y: 145, r: 18, a: 0.25 },
        { x: 148, y: 105, r: 10, a: 0.20 },
        { x: 105, y: 130, r: 12, a: 0.18 },
        { x: 135, y: 155, r: 13, a: 0.23 }
    ];
    craters.forEach(c => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(145, 175, 205, ${c.a})`;
        ctx.fill();
    });

    // 4. Tepian Cahaya Terang Bulan (Limb Brightening)
    ctx.beginPath();
    ctx.arc(128, 128, 48, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();

    return new THREE.CanvasTexture(canvas);
}

const moonTexture = createRealMoonTexture();

const sunSpriteMat = new THREE.SpriteMaterial({
    map: sunTexture,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false, // Berada 500m jauhnya; tanpa ini kabut menelan bulan hingga pudar
    opacity: 0.95
});

// Siang/sore: matahari digambar oleh shader langit; sprite ini dipakai untuk bulan saat malam
const sunSprite = new THREE.Sprite(sunSpriteMat);
sunSprite.scale.set(130, 130, 1);
sunSprite.renderOrder = -1;
sunSprite.visible = false;
scene.add(sunSprite);

// ==========================================
// 2C. STARFIELD SYSTEM (RIBUAN BINTANG GEMERLAP & BIMA SAKTI)
// ==========================================
function createStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);

    // 1. Inti pendar bulat lembut bercahaya (Soft radial glow)
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 28);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.15, 'rgba(240, 250, 255, 0.95)');
    grad.addColorStop(0.40, 'rgba(170, 220, 255, 0.40)');
    grad.addColorStop(0.70, 'rgba(120, 180, 255, 0.10)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();

    // 2. Kilauan 4-arah bintang berlian tipis & halus (Natural Diamond Diffraction)
    const gradH = ctx.createLinearGradient(0, 32, 64, 32);
    gradH.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
    gradH.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
    gradH.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.strokeStyle = gradH;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(6, 32);
    ctx.lineTo(58, 32);
    ctx.stroke();

    const gradV = ctx.createLinearGradient(32, 0, 32, 64);
    gradV.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
    gradV.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
    gradV.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.strokeStyle = gradV;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(32, 6);
    ctx.lineTo(32, 58);
    ctx.stroke();

    return new THREE.CanvasTexture(canvas);
}

const starCount = 5000;
const starGeo = new THREE.BufferGeometry();
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);
const starSizes = new Float32Array(starCount);
const starTwinkle = new Float32Array(starCount * 2);

const starPalette = [
    new THREE.Color(0xf0f6ff), // Berlian Putih Kebiruan
    new THREE.Color(0xd6e8ff), // Biru Muda Es
    new THREE.Color(0xfff1cf), // Topaz Emas Hangat
    new THREE.Color(0xa8f0ff), // Cyan Neon
    new THREE.Color(0xedd4ff)  // Lilac Violet
];

for (let i = 0; i < starCount; i++) {
    const isMilkyWay = (i < starCount * 0.35);
    const radius = 660 + (Math.random() - 0.5) * 30;

    let x, y, z;
    if (isMilkyWay) {
        const u = (Math.random() - 0.5) * Math.PI * 1.8;
        const widthSpread = (Math.random() + Math.random() - 1.0) * 0.22;
        x = radius * Math.cos(u);
        z = radius * Math.sin(u);
        y = radius * Math.sin(Math.abs(u) * 0.6 + 0.35 + widthSpread);
    } else {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.pow(Math.random(), 1.6) * (Math.PI * 0.44) + 0.04;
        x = radius * Math.sin(phi) * Math.cos(theta);
        y = radius * Math.cos(phi);
        z = radius * Math.sin(phi) * Math.sin(theta);
    }

    starPositions[i * 3 + 0] = x;
    starPositions[i * 3 + 1] = y;
    starPositions[i * 3 + 2] = z;

    const c = starPalette[Math.floor(Math.random() * starPalette.length)];
    starColors[i * 3 + 0] = c.r;
    starColors[i * 3 + 1] = c.g;
    starColors[i * 3 + 2] = c.b;

    // Ukuran bintang natural dan bervariasi
    starSizes[i] = 4.0 + Math.pow(Math.random(), 2.2) * 16.0;
    starTwinkle[i * 2 + 0] = Math.random() * Math.PI * 2;
    starTwinkle[i * 2 + 1] = 1.8 + Math.random() * 4.2;
}

starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
starGeo.setAttribute('aTwinkle', new THREE.BufferAttribute(starTwinkle, 2));

const starShader = {
    uniforms: {
        uTime: { value: 0 },
        uTexture: { value: createStarTexture() }
    },
    vertexShader: `
        attribute float aSize;
        attribute vec2 aTwinkle;
        varying vec3 vColor;
        varying float vTwinkle;
        uniform float uTime;

        void main() {
            vColor = color;
            // Twinkle selalu positif (0.0 s/d 1.0), tidak akan pernah NaN
            float tw = sin(uTime * aTwinkle.y + aTwinkle.x) * 0.5 + 0.5;
            vTwinkle = 0.25 + 0.75 * pow(tw, 2.5);
            gl_PointSize = aSize * (0.65 + 0.35 * vTwinkle);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D uTexture;
        varying vec3 vColor;
        varying float vTwinkle;

        void main() {
            vec4 tex = texture2D(uTexture, gl_PointCoord);
            if (tex.a < 0.01) discard;
            gl_FragColor = vec4(vColor * tex.rgb * 1.5 * vTwinkle, tex.a * vTwinkle);
        }
    `
};

const starMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(starShader.uniforms),
    vertexShader: starShader.vertexShader,
    fragmentShader: starShader.fragmentShader,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true
});

const starGroup = new THREE.Group();
const starPoints = new THREE.Points(starGeo, starMat);
starGroup.add(starPoints);
starGroup.visible = false;
scene.add(starGroup);

// ==========================================
// 2D. KABUT DEBU AURORA BOREALIS UTUH (ORGANIC, SEAMLESS, TANPA KOTAK / POTONGAN)
// ==========================================
const auroraShader = {
    uniforms: {
        u_time: { value: 0 }
    },
    vertexShader: `
        varying vec3 vWorldDir;

        void main() {
            vWorldDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float u_time;
        varying vec3 vWorldDir;

        // Hash 2D & Perlin Noise halus
        vec2 hash2(vec2 p) {
            p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
            return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
        }

        float perlin(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                           dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
                       mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                           dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
        }

        void main() {
            vec3 rd = normalize(vWorldDir);

            // Horizon fade: memudar sangat halus di dekat batas cakrawala/pegunungan
            float el = clamp(rd.y, 0.0, 1.0);
            float horizonFade = smoothstep(0.005, 0.05, el);

            // Sudut azimuth sferis kontinu (-PI s/d +PI)
            float az = atan(rd.x, -rd.z);

            float t = u_time * 0.12;

            // Amplop posisi ketinggian aurora: diturunkan ke level awan (el ~ 0.04 s/d 0.25)
            // agar terlihat megah melayang di atas cakrawala persis seperti formasi awan
            float azEnvelope = exp(-pow(az * 0.58, 2.0));
            float elEnvelope = smoothstep(0.01, 0.1, el) * exp(-pow((el - 0.1) * 6.5, 2.0));
            float globalEnvelope = horizonFade * azEnvelope * elEnvelope;

            if (globalEnvelope <= 0.001) {
                discard;
            }

            // Skala UV vertikal disesuaikan dengan rentang ketinggian awan
            vec2 skyUv = vec2(az * 1.5, el * 8.5);

            // Jalur sungai berliku dinamis (Sinuous meandering curve)
            float river = perlin(vec2(skyUv.x * 0.7 + t * 0.14, 0.4)) * 0.42
                        + perlin(vec2(skyUv.x * 1.6 - t * 0.10, 1.1)) * 0.18;

            // Domain warping untuk pusaran fluida kabut debu aurora
            vec2 warpCoord = skyUv + vec2(t * 0.15, 0.0);
            vec2 q = vec2(
                perlin(warpCoord * 1.3 + vec2(t * 0.12, t * 0.06)),
                perlin(warpCoord * 1.2 + vec2(4.3, 1.7) - vec2(t * 0.08, t * 0.10))
            );
            vec2 r = vec2(
                perlin(warpCoord * 1.5 + q * 1.5 + vec2(t * 0.18, 0.0)),
                perlin(warpCoord * 1.4 + q * 1.3 + vec2(2.1, 7.8) - vec2(0.0, t * 0.12))
            );

            // Tekstur gumpalan debu aurora utama (Soft billowing dust plasma)
            float dustCloud = perlin(warpCoord * 1.4 + r * 1.4) * 0.5 + 0.5;

            // Butiran debu kosmik halus (Fine cosmic dust mist)
            float fineMist = perlin(skyUv * 3.6 + r * 1.8 + vec2(t * 0.22, -t * 0.12)) * 0.5 + 0.5;

            // Filamen sutra lentur organik yang beriak mengikuti fluida
            float fluidWisps = sin(skyUv.x * 14.0 + q.x * 5.5 + r.y * 3.5 + t * 1.8) * 0.5 + 0.5;
            fluidWisps = pow(fluidWisps, 2.2);

            // Jarak ke sungai aurora utama di posisi awan (el ~ 0.12 - 0.14)
            float distMain = abs(el * 8.5 - 1.05 - river);
            float glowMain = exp(-pow(distMain * 2.2, 2.0));

            // Cabang sekunder kabut cahaya tepat di atas pita utama (el ~ 0.18 - 0.22)
            float distBranch = abs(el * 8.5 - 1.50 - river * 0.65);
            float glowBranch = exp(-pow(distBranch * 2.5, 2.0)) * 0.50;

            // Total densitas debu aurora:
            float dustDensity = (glowMain + glowBranch) 
                              * (dustCloud * 0.65 + fineMist * 0.35) 
                              * mix(0.85, 1.28, fluidWisps) 
                              * globalEnvelope;

            if (dustDensity <= 0.002) {
                discard;
            }

            // Palet emisi spektral oksigen alami:
            // Hijau zamrud -> Hijau neon cemerlang -> Inti putih menyala -> Tepi ungu/violet
            vec3 colFringe  = vec3(0.04, 0.62, 0.25);
            vec3 colEmerald = vec3(0.12, 0.98, 0.40);
            vec3 colLime    = vec3(0.42, 1.00, 0.56);
            vec3 colCore    = vec3(0.90, 1.00, 0.95);
            vec3 colViolet  = vec3(0.46, 0.12, 0.70);

            vec3 dustColor;
            if (dustDensity < 0.28) {
                dustColor = mix(colFringe, colEmerald, dustDensity / 0.28);
            } else if (dustDensity < 0.65) {
                dustColor = mix(colEmerald, colLime, (dustDensity - 0.28) / 0.37);
            } else {
                dustColor = mix(colLime, colCore, (dustDensity - 0.65) / 0.35);
            }
            dustColor = mix(dustColor, colViolet, smoothstep(0.14, 0.26, el) * 0.45);

            vec3 aurora = dustColor * dustDensity * 1.65;
            gl_FragColor = vec4(aurora, dustDensity);
        }
    `
};

const auroraMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(auroraShader.uniforms),
    vertexShader: auroraShader.vertexShader,
    fragmentShader: auroraShader.fragmentShader,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

// Kubah Langit Aurora Volumetrik (Radius 680 memeluk cakrawala secara penuh)
const auroraGeo = new THREE.SphereGeometry(680, 96, 48, 0, Math.PI * 2, 0, Math.PI * 0.52);
const auroraMesh = new THREE.Mesh(auroraGeo, auroraMat);
auroraMesh.renderOrder = 0;

const auroraGroup = new THREE.Group();
auroraGroup.add(auroraMesh);
auroraGroup.visible = false;
scene.add(auroraGroup);

function updateNightSky(elapsedTime, delta) {
    PandoraClouds.update(delta);
    if (auroraGroup && auroraGroup.visible) {
        auroraMat.uniforms.u_time.value = elapsedTime;
        auroraMesh.position.copy(camera.position);
    }
    if (starGroup && starGroup.visible) {
        starMat.uniforms.uTime.value = elapsedTime;
        starGroup.rotation.y = elapsedTime * 0.0012;
        starGroup.position.copy(camera.position);
    }
}

// Pengaturan Preset Cuaca & Waktu Ala Genshin Impact
const skyPresets = {
    day: {
        // Biru langit nyata: zenit pekat, cakrawala pucat berkabut (bukan biru anime merata)
        topColor: 0x2a63c9,
        midColor: 0x67a3e3,
        bottomColor: 0xc9dfee,
        fogColor: 0xc9dfee,
        fogNear: 35,
        fogFar: 120,
        sunColor: 0xfffae6,
        ambientColor: 0x7397c0,
        ambientIntensity: 0.85,
        sunIntensity: 2.1,
        azimuth: 300,
        elevation: 45,
        cloudBase: 0xffffff,
        cloudShadow: 0x8798b3
    },
    sunset: {
        topColor: 0x2d3a78,
        midColor: 0xc8687a,
        bottomColor: 0xffb067,
        fogColor: 0xffa052,
        fogNear: 30,
        fogFar: 110,
        sunColor: 0xffaa42,    // Warna matahari oranye sore
        ambientColor: 0x9c5e52,
        ambientIntensity: 0.95,
        sunIntensity: 2.5,
        azimuth: 210,
        elevation: 15,
        cloudBase: 0xffd5a0,
        cloudShadow: 0x6a4a66
    },
    night: {
        topColor: 0x030718,        // Obsidian navy gelap pekat
        midColor: 0x06152d,        // Sapphire twilight malam
        bottomColor: 0x0d2238,     // Pendar cakrawala malam berkabut
        fogColor: 0x061322,        // Kabut malam atmosferik menyatu
        fogNear: 35,
        fogFar: 130,
        sunColor: 0x9ed3ff,        // Pendar lembut rembulan
        ambientColor: 0x243754,    // Cahaya malam sejuk
        ambientIntensity: 0.65,
        sunIntensity: 1.1,
        azimuth: 140,
        elevation: 55,
        cloudBase: 0x34445e,       // Awan diterangi bulan
        cloudShadow: 0x0a1220
    }
};

// Langit pucat hangat dan cahaya keemasan seperti video referensi
skyPresets.reference = Object.assign({}, skyPresets.day, {
    topColor: 0xb5c4bc,
    midColor: 0xd6d4bd,
    bottomColor: 0xe9dcbd,
    fogColor: 0xcfc4a0,
    fogNear: 30,
    fogFar: 110,
    sunColor: 0xffdca8,
    ambientColor: 0x8a8560,
    ambientIntensity: 0.55,
    sunIntensity: 1.9
});

function applySkyPreset(presetKey) {
    const p = skyPresets[presetKey];
    if (!p) return;

    skyMat.uniforms.uTopColor.value.setHex(p.topColor);
    skyMat.uniforms.uMidColor.value.setHex(p.midColor);
    skyMat.uniforms.uBottomColor.value.setHex(p.bottomColor);

    scene.fog = null;
    if (scene.background) {
        scene.background.setHex(p.bottomColor);
    }

    ambientLight.color.setHex(p.ambientColor);
    ambientLight.intensity = p.ambientIntensity;
    sunLight.color.setHex(p.sunColor);
    sunLight.intensity = p.sunIntensity;

    volumetricCloudMat.uniforms.uBaseColor.value.setHex(p.cloudBase);
    volumetricCloudMat.uniforms.uShadowColor.value.setHex(p.cloudShadow);
    skyMat.uniforms.uCloudLit.value.setHex(p.cloudBase);
    skyMat.uniforms.uCloudShade.value.setHex(p.cloudShadow);
    PandoraClouds.nightDim = presetKey === 'night' ? 0.55 : 1;

    // Beralih antara mode Siang/Sore vs Malam Penuh Bintang & Aurora
    if (presetKey === 'night') {
        cloudGroup.visible = false;
        starGroup.visible = true;    // Ribuan bintang bertaburan
        auroraGroup.visible = true;  // Kubah aurora borealis volumetrik berliku-liku persis foto lampiran
        sunSprite.material.map = moonTexture;
        sunSprite.material.color.setHex(0xd0e8ff);
        sunSprite.scale.set(95, 95, 1);
        sunSprite.visible = true;
        skyMat.uniforms.uSunIntensity.value = 0.0;
    } else {
        cloudGroup.visible = false;   // Awan kini digambar shader langit
        starGroup.visible = false;
        auroraGroup.visible = false;
        sunSprite.material.map = sunTexture;
        sunSprite.material.color.setHex(p.sunColor);
        sunSprite.scale.set(130, 130, 1);
        // Matahari siang/sore digambar langsung oleh shader langit
        sunSprite.visible = false;
        skyMat.uniforms.uSunIntensity.value = 1.0;
    }
    skyMat.uniforms.uSunColor.value.setHex(p.sunColor);
    sunSprite.material.needsUpdate = true;

    document.getElementById('slider-azimuth').value = p.azimuth;
    document.getElementById('slider-elevation').value = p.elevation;
    updateSunPosition();

    if (typeof window.setWaterAtmospherePreset === 'function') {
        window.setWaterAtmospherePreset(presetKey);
    }
}

window.applySkyPreset = applySkyPreset;

// ==========================================
// BENTUK AWAN (dipilih di editor, disimpan per map)
// ==========================================
const CLOUD_SHAPES = {
    cumulus:       { label: 'Kumulus (Gumpalan)',       coverage: 0.47, scale: 1.5, stretch: [1.0, 1.0], softness: 0.24, opacity: 1.0,  warp: 0.35, absorb: 2.2, billow: 1.0, speed: 1.0, thickness: 0.32 },
    towering:      { label: 'Kumulus Menjulang',        coverage: 0.45, scale: 1.0, stretch: [1.0, 1.0], softness: 0.22, opacity: 1.0,  warp: 0.45, absorb: 2.6, billow: 1.0, speed: 0.7, thickness: 0.55 },
    stratocumulus: { label: 'Stratokumulus (Berlapis)', coverage: 0.58, scale: 2.0, stretch: [1.7, 1.0], softness: 0.28, opacity: 0.95, warp: 0.25, absorb: 1.8, billow: 0.8, speed: 1.0, thickness: 0.22 },
    altocumulus:   { label: 'Altokumulus (Sisik)',      coverage: 0.48, scale: 4.5, stretch: [1.0, 1.0], softness: 0.20, opacity: 0.85, warp: 0.15, absorb: 1.2, billow: 1.0, speed: 0.8, thickness: 0.08 },
    cirrus:        { label: 'Sirus (Tipis Tinggi)',     coverage: 0.45, scale: 0.8, stretch: [4.5, 0.6], softness: 0.60, opacity: 0.32, warp: 0.65, absorb: 0.3, billow: 0.0, speed: 1.6, thickness: 0.04 },
    overcast:      { label: 'Mendung',                  coverage: 1.15, scale: 1.2, stretch: [1.3, 1.0], softness: 0.60, opacity: 1.0,  warp: 0.30, absorb: 2.6, billow: 0.5, speed: 0.9, thickness: 0.45 },
    none:          { label: 'Tanpa Awan',               coverage: 0.0,  scale: 1.4, stretch: [1.0, 1.0], softness: 0.22, opacity: 0.0,  warp: 0.35, absorb: 2.0, billow: 1.0, speed: 1.0, thickness: 0.40 }
};

const PandoraClouds = {
    shape: 'cumulus',
    coverageBias: 0,     // Slider "Tutupan": -0.4 .. +0.4 dari bawaan bentuk
    nightDim: 1,
    current: null,
    time: 0,

    target() {
        const base = CLOUD_SHAPES[this.shape] || CLOUD_SHAPES.cumulus;
        const t = Object.assign({}, base);
        if (this.shape !== 'none') t.coverage = Math.max(0, Math.min(1.2, base.coverage + this.coverageBias));
        return t;
    },

    // instant: dipakai saat stage dimuat; di editor bentuk berganti halus ~1.5 detik
    set(shape, coverageBias, instant) {
        if (CLOUD_SHAPES[shape]) this.shape = shape;
        if (typeof coverageBias === 'number' && isFinite(coverageBias)) this.coverageBias = Math.max(-0.4, Math.min(0.4, coverageBias));
        if (instant || !this.current) this.current = this.target();
        this.apply();
        const select = document.getElementById('select-cloud-shape');
        if (select && select.value !== this.shape) select.value = this.shape;
        const slider = document.getElementById('slider-cloud-coverage');
        if (slider && Math.abs(parseFloat(slider.value) - this.coverageBias) > 0.001) slider.value = this.coverageBias;
    },

    apply() {
        const c = this.current, u = skyMat.uniforms;
        u.uCloudCoverage.value = c.coverage;
        u.uCloudScale.value = c.scale;
        u.uCloudStretch.value.set(c.stretch[0], c.stretch[1]);
        u.uCloudSoftness.value = c.softness;
        u.uCloudOpacity.value = c.opacity * (this.shape === 'none' ? 1 : this.nightDim);
        u.uCloudWarp.value = c.warp;
        u.uCloudAbsorb.value = c.absorb;
        u.uCloudBillow.value = c.billow;
        u.uCloudThickness.value = c.thickness;
    },

    update(dt) {
        if (!this.current) this.current = this.target();
        const t = this.target();
        const k = Math.min(1, (dt || 0) * 1.8);
        const c = this.current;
        ['coverage', 'scale', 'softness', 'opacity', 'warp', 'absorb', 'billow', 'speed', 'thickness'].forEach((key) => { c[key] += (t[key] - c[key]) * k; });
        c.stretch = [c.stretch[0] + (t.stretch[0] - c.stretch[0]) * k, c.stretch[1] + (t.stretch[1] - c.stretch[1]) * k];
        this.apply();
        // Awan bergerak searah angin; slider angin mempercepat
        const windSlider = document.getElementById('slider-wind-speed');
        const wind = windSlider ? (parseFloat(windSlider.value) || 1) : 1;
        this.time += (dt || 0) * c.speed * (0.5 + wind * 0.5);
        skyMat.uniforms.uCloudTime.value = this.time;
    },

    serialize() {
        return { shape: this.shape, coverage: Math.round(this.coverageBias * 100) / 100 };
    }
};
window.PandoraClouds = PandoraClouds;
window.CLOUD_SHAPES = CLOUD_SHAPES;
PandoraClouds.set('cumulus', 0, true);

// Panel Studio (elemen hanya ada di Studio)
(function bindCloudControls() {
    const select = document.getElementById('select-cloud-shape');
    const slider = document.getElementById('slider-cloud-coverage');
    const label = document.getElementById('val-cloud-coverage');
    if (!select) return;
    if (select.options.length === 0) {
        Object.keys(CLOUD_SHAPES).forEach((key) => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = CLOUD_SHAPES[key].label;
            select.appendChild(opt);
        });
    }
    select.value = PandoraClouds.shape;
    const refresh = () => {
        if (slider) slider.disabled = select.value === 'none';
        if (label && slider) {
            const v = parseFloat(slider.value);
            label.textContent = (v > 0 ? '+' : '') + Math.round(v * 100) + '%';
        }
    };
    select.addEventListener('change', () => { PandoraClouds.set(select.value); refresh(); });
    if (slider) slider.addEventListener('input', () => { PandoraClouds.set(select.value, parseFloat(slider.value)); refresh(); });
    refresh();
    window.refreshCloudControls = refresh;
})();

document.getElementById('select-sky-preset').addEventListener('change', (e) => {
    applySkyPreset(e.target.value);
});
