/* Sky dome, volumetric clouds, sun sprite, sky presets */
// ==========================================
// 2. DETAILED VOLUMETRIC CLOUD SYSTEM (NEW)
// ==========================================
// Latar langit gradient Genshin Impact (Cakrawala biru muda terang, tengah biru segar, atas biru pekat)
const skyGeo = new THREE.SphereGeometry(700, 32, 15);
const skyShader = {
    uniforms: {
        uTopColor: { value: new THREE.Color(0x1878ec) },      // Atas: Biru langit pekat kaya saturasi
        uMidColor: { value: new THREE.Color(0x56b6fb) },      // Tengah: Biru cerah anime
        uBottomColor: { value: new THREE.Color(0xb8ecff) },   // Bawah (Horizon): Biru muda terang bercahaya
        uSunPosition: { value: new THREE.Vector3(-25, 12, 25) }
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
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uBottomColor;
        uniform vec3 uSunPosition;
        varying vec3 vWorldPosition;

        void main() {
            vec3 dir = normalize(vWorldPosition);
            float h = dir.y;

            // Gradasi langit berlapis ala Genshin Impact:
            // Bawah (Cakrawala): Biru muda terang berseri
            // Tengah: Biru langit cerah segar
            // Atas: Biru pekat kaya saturasi
            float hHorizon = smoothstep(-0.06, 0.28, h);
            float hZenith = smoothstep(0.18, 0.85, h);

            vec3 skyColor = mix(uBottomColor, uMidColor, hHorizon);
            skyColor = mix(skyColor, uTopColor, hZenith);

            // Sentuhan pendar cahaya matahari lembut di langit (Atmospheric Solar Halo)
            vec3 sunDir = normalize(uSunPosition);
            float sunDot = max(0.0, dot(dir, sunDir));
            vec3 sunHalo = vec3(1.0, 0.95, 0.85) * pow(sunDot, 18.0) * 0.22;
            skyColor += sunHalo;

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
                           + cameraRight * position.x * scale.x 
                           + cameraUp * position.y * scale.y;

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
    opacity: 0.95
});

const sunSprite = new THREE.Sprite(sunSpriteMat);
sunSprite.scale.set(130, 130, 1);
sunSprite.renderOrder = -1;
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
        topColor: 0x1878ec,        // Biru pekat kaya saturasi
        midColor: 0x56b6fb,        // Biru cerah anime
        bottomColor: 0xb8ecff,     // Biru muda terang (cakrawala)
        fogColor: 0xb8ecff,        // Kabut atmosfer menyatu ke cakrawala
        fogNear: 35,
        fogFar: 120,
        sunColor: 0xfffae6,
        ambientColor: 0x7397c0,
        ambientIntensity: 0.85,
        sunIntensity: 2.1,
        azimuth: 300,
        elevation: 45,
        cloudBase: 0xffffff,
        cloudShadow: 0x8a9bb4
    },
    sunset: {
        topColor: 0x5e2b69,
        midColor: 0xd65353,
        bottomColor: 0xffa052,
        fogColor: 0xffa052,
        fogNear: 30,
        fogFar: 110,
        sunColor: 0xffaa42,    // Warna matahari oranye sore
        ambientColor: 0x9c5e52,
        ambientIntensity: 0.95,
        sunIntensity: 2.5,
        azimuth: 210,
        elevation: 15,
        cloudBase: 0xffe6b3,
        cloudShadow: 0x8a5b6b
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
        cloudBase: 0x101b2b,
        cloudShadow: 0x08101a
    }
};

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

    // Beralih antara mode Siang/Sore vs Malam Penuh Bintang & Aurora
    if (presetKey === 'night') {
        cloudGroup.visible = false;  // Tanpa awan di langit malam
        cloudInstancedMesh.visible = false;
        starGroup.visible = true;    // Ribuan bintang bertaburan
        auroraGroup.visible = true;  // Kubah aurora borealis volumetrik berliku-liku persis foto lampiran
        sunSprite.material.map = moonTexture;
        sunSprite.material.color.setHex(0xd0e8ff);
        sunSprite.scale.set(95, 95, 1);
    } else {
        cloudGroup.visible = true;
        cloudInstancedMesh.visible = true;
        starGroup.visible = false;
        auroraGroup.visible = false;
        sunSprite.material.map = sunTexture;
        sunSprite.material.color.setHex(p.sunColor);
        sunSprite.scale.set(130, 130, 1);
    }
    sunSprite.material.needsUpdate = true;

    document.getElementById('slider-azimuth').value = p.azimuth;
    document.getElementById('slider-elevation').value = p.elevation;
    updateSunPosition();

    if (typeof window.setWaterAtmospherePreset === 'function') {
        window.setWaterAtmospherePreset(presetKey);
    }
}

window.applySkyPreset = applySkyPreset;

document.getElementById('select-sky-preset').addEventListener('change', (e) => {
    applySkyPreset(e.target.value);
});
