/* Scene, camera, renderer, lighting */
// ==========================================
// 1. SCENE, CAMERA, RENDERER & LIGHTING
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb8ecff);

// Genshin Impact Atmospheric Distance Fog (Kabut Jarak Jauh)
// Jarak dekat tetap jernih dan tajam (35m), jarak jauh melebur lembut ke biru muda cakrawala (120m)
scene.fog = new THREE.Fog(0xb8ecff, 35, 120);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 16, 32);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
controls.maxPolarAngle = Math.PI / 2 - 0.04; // Proteksi: cegah kamera menembus bawah tanah ke ruang hampa gelap
controls.minDistance = 1.0;
controls.maxDistance = 160.0;


const sunLight = new THREE.DirectionalLight(0xfffae6, 2.1);
sunLight.position.set(-25, 12, 25);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 120;

const shadowExtent = 45;
sunLight.shadow.camera.left = -shadowExtent;
sunLight.shadow.camera.right = shadowExtent;
sunLight.shadow.camera.top = shadowExtent;
sunLight.shadow.camera.bottom = -shadowExtent;
sunLight.shadow.bias = -0.0001;
sunLight.shadow.normalBias = 0.02;

scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0x7397c0, 0.85);
scene.add(ambientLight);

const foliageMaterialsList = [];
