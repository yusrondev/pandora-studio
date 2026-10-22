/* Scene, camera, renderer, lighting */
// ==========================================
// 1. SCENE, CAMERA, RENDERER & LIGHTING
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb8ecff);

// Fog dinonaktifkan total (scene.fog = null)
scene.fog = null;

const viewportContainer = document.getElementById('viewport-container') || document.body;
const initW = viewportContainer.clientWidth || window.innerWidth;
const initH = viewportContainer.clientHeight || window.innerHeight;

const camera = new THREE.PerspectiveCamera(45, initW / initH, 0.1, 1000);
camera.position.set(0, 16, 32);

const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || ('ontouchstart' in window && window.innerWidth <= 1024);
const maxDPR = isMobileDevice ? 1.25 : 1.75;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(initW, initH);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDPR));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

viewportContainer.appendChild(renderer.domElement);

// Global Mouse Coordinate Transformer: akurat terhadap bounding box viewport canvas
function updateMouseCoords(e, mouseObj) {
    if (!mouseObj) return;
    const clientX = (e && typeof e.clientX === 'number') ? e.clientX : 0;
    const clientY = (e && typeof e.clientY === 'number') ? e.clientY : 0;
    if (!renderer || !renderer.domElement) {
        mouseObj.x = (clientX / window.innerWidth) * 2 - 1;
        mouseObj.y = -(clientY / window.innerHeight) * 2 + 1;
        return mouseObj;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    const w = rect.width || window.innerWidth;
    const h = rect.height || window.innerHeight;
    mouseObj.x = ((clientX - rect.left) / w) * 2 - 1;
    mouseObj.y = -((clientY - rect.top) / h) * 2 + 1;
    return mouseObj;
}
window.updateMouseCoords = updateMouseCoords;

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
controls.maxPolarAngle = Math.PI / 2 - 0.04; // Proteksi: cegah kamera menembus bawah tanah ke ruang hampa gelap
controls.minDistance = 1.0;
controls.maxDistance = 160.0;


const sunLight = new THREE.DirectionalLight(0xfffae6, 2.1);
sunLight.position.set(-25, 12, 25);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = isMobileDevice ? 2048 : 4096;
sunLight.shadow.mapSize.height = isMobileDevice ? 2048 : 4096;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 120;

const shadowExtent = 45;
sunLight.shadow.camera.left = -shadowExtent;
sunLight.shadow.camera.right = shadowExtent;
sunLight.shadow.camera.top = shadowExtent;
sunLight.shadow.camera.bottom = -shadowExtent;
sunLight.shadow.bias = 0.00005;
sunLight.shadow.normalBias = 0.04;

scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0x7397c0, 0.85);
scene.add(ambientLight);

const foliageMaterialsList = [];
