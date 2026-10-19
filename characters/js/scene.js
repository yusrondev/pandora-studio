/* Scene, Lighting, Sky & Meadow */
// =====================================================================
// 2. SCENE, CAMERA, RENDERER, CEL LIGHTING
// =====================================================================
const canvas = document.getElementById('webgl-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1887e8);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.2, 500);
camera.position.set(0, 3.8, -8.5);

const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // Mencegah kamera tembus tanah
controls.minDistance = 2.5;
controls.maxDistance = 35;
controls.target.set(0, 1.4, 0);

// Pencahayaan Cel-Shading ala Genshin Impact & Ghibli
const sunLight = new THREE.DirectionalLight(0xfffae6, 2.2);
sunLight.position.set(-20, 28, 20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 80;
const shadowBound = 22;
sunLight.shadow.camera.left = -shadowBound;
sunLight.shadow.camera.right = shadowBound;
sunLight.shadow.camera.top = shadowBound;
sunLight.shadow.camera.bottom = -shadowBound;
sunLight.shadow.bias = -0.0003;
sunLight.shadow.normalBias = 0.03;
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0x7397c0, 0.95);
scene.add(ambientLight);

// Rim Light untuk kilau tepi anime (Genshin Rim Light)
const rimLight = new THREE.DirectionalLight(0xffeedd, 1.1);
rimLight.position.set(18, 12, -18);
scene.add(rimLight);

// =====================================================================
// 3. SKY DOME & PRESETS (KONSISTEN DENGAN INDEX.HTML)
// =====================================================================
const skyGeo = new THREE.SphereGeometry(300, 32, 16);
const skyShader = {
    uniforms: {
        uTopColor: { value: new THREE.Color(0x1a75ff) },
        uBottomColor: { value: new THREE.Color(0x66b3ff) }
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
        uniform vec3 uBottomColor;
        varying vec3 vWorldPosition;
        void main() {
            float h = normalize(vWorldPosition).y;
            float mixFactor = clamp(h * 0.7 + 0.3, 0.0, 1.0);
            vec3 skyGradient = mix(uBottomColor, uTopColor, pow(mixFactor, 0.85));
            gl_FragColor = vec4(skyGradient, 1.0);
        }
    `
};
const skyMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(skyShader.uniforms),
    vertexShader: skyShader.vertexShader,
    fragmentShader: skyShader.fragmentShader,
    side: THREE.BackSide
});
const skyMesh = new THREE.Mesh(skyGeo, skyMat);
scene.add(skyMesh);

// Preset Cuaca & Waktu (Day, Sunset Gold, Night Spirit)
const envPresets = {
    day: {
        topColor: 0x1a75ff,
        bottomColor: 0x66b3ff,
        sunColor: 0xfffae6,
        sunIntensity: 2.2,
        ambientColor: 0x7397c0,
        ambientIntensity: 0.95,
        rimColor: 0xffeedd,
        fogColor: 0x66b3ff
    },
    sunset: {
        topColor: 0x5e2b69,
        bottomColor: 0xff8c42,
        sunColor: 0xffaa42,
        sunIntensity: 2.6,
        ambientColor: 0x9c5e52,
        ambientIntensity: 1.05,
        rimColor: 0xffcc77,
        fogColor: 0xff8c42
    },
    night: {
        topColor: 0x070c1a,
        bottomColor: 0x162c4a,
        sunColor: 0x6888ff,
        sunIntensity: 0.9,
        ambientColor: 0x223555,
        ambientIntensity: 0.85,
        rimColor: 0x38bdf8,
        fogColor: 0x162c4a
    }
};

function setEnvironmentPreset(presetKey) {
    const p = envPresets[presetKey];
    if (!p) return;
    skyMat.uniforms.uTopColor.value.setHex(p.topColor);
    skyMat.uniforms.uBottomColor.value.setHex(p.bottomColor);
    sunLight.color.setHex(p.sunColor);
    sunLight.intensity = p.sunIntensity;
    ambientLight.color.setHex(p.ambientColor);
    ambientLight.intensity = p.ambientIntensity;
    rimLight.color.setHex(p.rimColor);
}

// =====================================================================
// 4. CEL-SHADING TOON GRADIENTS (GHIBLI / GENSHIN PALETTE)
// =====================================================================
// Membuat tekstur gradien cel 3-tingkat untuk efek kartun anime mulus
function createCelGradientTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    // 4 level kuantisasi bayangan khas Genshin Toon Shader
    ctx.fillStyle = '#666666'; ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = '#999999'; ctx.fillRect(1, 0, 1, 1);
    ctx.fillStyle = '#cccccc'; ctx.fillRect(2, 0, 1, 1);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(3, 0, 1, 1);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    return tex;
}
const celGradientTex = createCelGradientTexture();


// =====================================================================
// 6. MEADOW ENVIRONMENT (PADANG RUMPUT ALUR GHIBLI & GENSHIN)
// =====================================================================
// Tanah bergelombang lembut dengan gradasi warna tanah / rumput cerah
const groundSize = 120;
const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, 40, 40);
groundGeo.rotateX(-Math.PI / 2);

// Modulasi ketinggian bukit kecil lembut
const posArr = groundGeo.attributes.position.array;
for (let i = 0; i < posArr.length; i += 3) {
    const x = posArr[i];
    const z = posArr[i + 2];
    const dist = Math.sqrt(x * x + z * z);
    if (dist > 8) {
        posArr[i + 1] = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 1.5;
    } else {
        posArr[i + 1] = 0; // Dataran tengah datar untuk aksi serigala
    }
}
groundGeo.computeVertexNormals();

const groundMat = new THREE.MeshToonMaterial({
    color: 0x4ade80, // Hijau rumput segar khas Mondstadt / Totoro
    gradientMap: celGradientTex,
    roughness: 0.8
});
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.receiveShadow = true;
scene.add(groundMesh);



// Instanced Clumps of Anime Grass (Rumput Bergoyang)
const grassCount = 1200;
const grassBladeGeo = new THREE.ConeGeometry(0.12, 0.75, 3);
const grassInstanced = new THREE.InstancedMesh(
    grassBladeGeo,
    new THREE.MeshToonMaterial({
        color: 0x22c55e,
        gradientMap: celGradientTex
    }),
    grassCount
);
grassInstanced.receiveShadow = true;

const dummy = new THREE.Object3D();
for (let i = 0; i < grassCount; i++) {
    const r = 2.5 + Math.random() * 45;
    const theta = Math.random() * Math.PI * 2;
    const gx = Math.cos(theta) * r;
    const gz = Math.sin(theta) * r;
    dummy.position.set(gx, 0.35, gz);
    dummy.rotation.y = Math.random() * Math.PI;
    dummy.rotation.z = (Math.random() - 0.5) * 0.25;
    const s = 0.6 + Math.random() * 0.8;
    dummy.scale.set(s, s * 1.2, s);
    dummy.updateMatrix();
    grassInstanced.setMatrixAt(i, dummy.matrix);
}
scene.add(grassInstanced);

// Dandelion Spores & Glowing Amber Firefly Particles
const particleCount = 200;
const particleGeo = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);
const particleVelocities = [];

for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * 60;
    particlePositions[i * 3 + 1] = Math.random() * 10 + 0.2;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    particleVelocities.push({
        x: (Math.random() - 0.5) * 0.04 + 0.02,
        y: Math.random() * 0.02 + 0.005,
        z: (Math.random() - 0.5) * 0.04,
        wobble: Math.random() * Math.PI * 2
    });
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

// Tekstur Glowing Particle
function createParticleGlowTexture() {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64;
    pCanvas.height = 64;
    const pCtx = pCanvas.getContext('2d');
    const g = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255, 250, 200, 1)');
    g.addColorStop(0.3, 'rgba(251, 191, 36, 0.8)');
    g.addColorStop(0.7, 'rgba(249, 115, 22, 0.2)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    pCtx.fillStyle = g;
    pCtx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(pCanvas);
}

const particleMat = new THREE.PointsMaterial({
    size: 0.65,
    map: createParticleGlowTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});
const particlesSystem = new THREE.Points(particleGeo, particleMat);
scene.add(particlesSystem);

