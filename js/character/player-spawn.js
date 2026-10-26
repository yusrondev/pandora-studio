/* Player Spawn Area & Point Manager for Pandora Editor
 * Memungkinkan user menentukan dan memvisualisasikan titik awal spawn Player (Rubah) di map.
 */

class PlayerSpawnManagerClass {
    constructor() {
        this.x = 0;
        this.z = 0;
        this.y = 0;
        this.rotY = 0; // Sudut hadap dalam radian
        this.hasSpawnPoint = true;
        this.isPlacementModeActive = false;

        this.markerGroup = null;
        this.beaconRing = null;
        this.beaconDisc = null;
        this.arrowMesh = null;
        this.beaconPillar = null;
        this.floatingDiamond = null;
        this.floatingCore = null;
        this.labelSprite = null;

        this.cachedDOMElements = false;
    }

    init() {
        if (this.markerGroup) return;

        this.markerGroup = new THREE.Group();
        this.markerGroup.name = 'PlayerSpawnMarker';

        // Hitung Y tanah awal
        this.y = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(this.x, this.z) : 0;
        this.markerGroup.position.set(this.x, this.y, this.z);

        // 1. Lingkaran Luar (Outer Ring Glowing Emerald)
        const ringGeo = new THREE.RingGeometry(1.65, 1.95, 48);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x10b981,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.88,
            depthWrite: false
        });
        this.beaconRing = new THREE.Mesh(ringGeo, ringMat);
        this.beaconRing.renderOrder = 996;
        this.beaconRing.position.y = 0.04;
        this.markerGroup.add(this.beaconRing);

        // 2. Lingkaran Dalam (Inner Soft Glow Disc)
        const discGeo = new THREE.CircleGeometry(1.65, 48);
        discGeo.rotateX(-Math.PI / 2);
        const discMat = new THREE.MeshBasicMaterial({
            color: 0x059669,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.18,
            depthWrite: false
        });
        this.beaconDisc = new THREE.Mesh(discGeo, discMat);
        this.beaconDisc.renderOrder = 995;
        this.beaconDisc.position.y = 0.035;
        this.markerGroup.add(this.beaconDisc);

        // 3. Panah Petunjuk Arah Hadap (Direction Arrow)
        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(-1.45, 0);
        arrowShape.lineTo(-0.55, 0.48);
        arrowShape.lineTo(-0.65, 0.18);
        arrowShape.lineTo(0.85, 0.18);
        arrowShape.lineTo(0.85, -0.18);
        arrowShape.lineTo(-0.65, -0.18);
        arrowShape.lineTo(-0.55, -0.48);
        arrowShape.closePath();

        const arrowGeo = new THREE.ShapeGeometry(arrowShape);
        arrowGeo.rotateX(-Math.PI / 2);
        const arrowMat = new THREE.MeshBasicMaterial({
            color: 0x34d399,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.88,
            depthWrite: false
        });
        this.arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
        this.arrowMesh.renderOrder = 997;
        this.arrowMesh.position.y = 0.045;
        this.markerGroup.add(this.arrowMesh);

        // 4. Pilar Cahaya Holografis (Beacon Light Cylinder)
        const beaconGeo = new THREE.CylinderGeometry(1.60, 1.70, 2.8, 32, 1, true);
        beaconGeo.translate(0, 1.4, 0);
        const beaconMat = new THREE.MeshBasicMaterial({
            color: 0x10b981,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.15,
            depthWrite: false
        });
        this.beaconPillar = new THREE.Mesh(beaconGeo, beaconMat);
        this.beaconPillar.renderOrder = 994;
        this.markerGroup.add(this.beaconPillar);

        // 5. Floating Holographic Diamond Gem di Tengah
        const diamondGeo = new THREE.OctahedronGeometry(0.38, 0);
        const diamondMat = new THREE.MeshBasicMaterial({
            color: 0x6ee7b7,
            wireframe: true,
            transparent: true,
            opacity: 0.85
        });
        this.floatingDiamond = new THREE.Mesh(diamondGeo, diamondMat);
        this.floatingDiamond.position.y = 1.45;
        this.markerGroup.add(this.floatingDiamond);

        const coreGeo = new THREE.OctahedronGeometry(0.20, 0);
        const coreMat = new THREE.MeshBasicMaterial({
            color: 0x10b981,
            transparent: true,
            opacity: 0.70
        });
        this.floatingCore = new THREE.Mesh(coreGeo, coreMat);
        this.floatingCore.position.y = 1.45;
        this.markerGroup.add(this.floatingCore);

        // 6. Billboard Label Badge "🚩 PLAYER SPAWN"
        this.createBillboardLabel();

        // Tag child mesh agar mudah dikenali
        this.markerGroup.traverse(child => {
            child.userData = { isPlayerSpawnMarker: true };
        });

        if (typeof scene !== 'undefined' && scene) {
            scene.add(this.markerGroup);
        }

        this.applyRotation();
        this.bindEvents();
        this.syncUI();
    }

    createBillboardLabel() {
        const canvas = document.createElement('canvas');
        canvas.width = 384;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');

        // Background rounded box badge
        ctx.fillStyle = 'rgba(6, 78, 59, 0.88)';
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 4;

        const x = 8, y = 8, w = 368, h = 80, r = 18;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Text title
        ctx.font = 'bold 34px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#f0fdf4';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🚩 PLAYER SPAWN', 192, 48);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });
        this.labelSprite = new THREE.Sprite(spriteMat);
        this.labelSprite.scale.set(2.4, 0.6, 1);
        this.labelSprite.position.y = 2.45;
        this.markerGroup.add(this.labelSprite);
    }

    setSpawnPosition(x, z) {
        this.x = Math.round(x * 10) / 10;
        this.z = Math.round(z * 10) / 10;
        this.y = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(this.x, this.z) : 0;

        if (this.markerGroup) {
            this.markerGroup.position.set(this.x, this.y, this.z);
        }

        this.hasSpawnPoint = true;
        this.syncUI();
    }

    setSpawnRotation(degrees) {
        this.rotY = THREE.MathUtils.degToRad(degrees);
        this.applyRotation();
        this.syncUI();
    }

    applyRotation() {
        if (this.arrowMesh) {
            this.arrowMesh.rotation.y = this.rotY;
        }
    }

    getSpawnPosition() {
        const groundY = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(this.x, this.z) : 0;
        return {
            x: this.x,
            y: groundY,
            z: this.z,
            rotY: this.rotY
        };
    }

    setSpawnAtCameraTarget() {
        if (typeof controls !== 'undefined' && controls && controls.target) {
            this.setSpawnPosition(controls.target.x, controls.target.z);

            // Arah hadap menghadap searah forward kamera horizontal
            if (typeof camera !== 'undefined') {
                const forward = new THREE.Vector3();
                camera.getWorldDirection(forward);
                forward.y = 0;
                forward.normalize();
                // Three.js fox model forward adalah (-1, 0, 0)
                const targetRotY = Math.atan2(forward.z, -forward.x);
                this.setSpawnRotation(Math.round(THREE.MathUtils.radToDeg(targetRotY)));
            }
        }
    }

    focusCameraOnSpawn() {
        if (typeof controls !== 'undefined' && controls) {
            const gy = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(this.x, this.z) : 0;
            controls.target.set(this.x, gy + 0.85, this.z);
            if (typeof camera !== 'undefined') {
                camera.position.set(this.x + 4.5, gy + 3.2, this.z + 4.5);
            }
            controls.update();
        }
    }

    togglePlacementMode(forceState) {
        const nextState = (typeof forceState === 'boolean') ? forceState : !this.isPlacementModeActive;
        this.isPlacementModeActive = nextState;
        window.isPlayerSpawnModeActive = nextState;

        const btnToolbar = document.getElementById('btn-player-spawn-tool');
        if (btnToolbar) {
            if (nextState) btnToolbar.classList.add('active');
            else btnToolbar.classList.remove('active');
        }

        const btnInspector = document.getElementById('btn-player-spawn-pick');
        if (btnInspector) {
            if (nextState) {
                btnInspector.classList.add('active');
                btnInspector.innerHTML = '<span>🎯 Klik pada Map... (ESC Batal)</span>';
            } else {
                btnInspector.classList.remove('active');
                btnInspector.innerHTML = '<span>🎯 Klik Map untuk Pindah</span>';
            }
        }

        // Matikan mode tool lain jika aktif dan buka accordion
        if (nextState) {
            const acc = document.getElementById('accordion-player-spawn');
            if (acc && acc.classList.contains('collapsed')) {
                acc.classList.remove('collapsed');
            }
            const sLeft = document.getElementById('sidebar-left');
            if (sLeft && sLeft.classList.contains('collapsed')) {
                sLeft.classList.remove('collapsed');
                if (typeof updateSidebarCSSVariables === 'function') updateSidebarCSSVariables();
            }

            if (window.isItemBoxSpawnerActive && window.itemBoxManagerInstance) {
                window.itemBoxManagerInstance.toggleSpawnerMode(false);
            }
            const selFox = document.getElementById('select-fox-mode');
            if (selFox) selFox.value = 'none';
            const selTree = document.getElementById('select-tree-mode');
            if (selTree) selTree.value = 'none';
        }
    }

    update(dt, elapsed) {
        if (!this.markerGroup || !this.markerGroup.visible) return;

        // 1. Hover & Spin animasi floating diamond
        if (this.floatingDiamond && this.floatingCore) {
            const hover = Math.sin(elapsed * 2.4) * 0.08;
            this.floatingDiamond.position.y = 1.45 + hover;
            this.floatingDiamond.rotation.y = elapsed * 1.2;
            this.floatingDiamond.rotation.x = Math.sin(elapsed * 1.5) * 0.2;

            this.floatingCore.position.y = 1.45 + hover;
            this.floatingCore.rotation.y = -elapsed * 0.8;
        }

        // 2. Pulse animasi breathing ring & beacon
        if (this.beaconRing && this.beaconRing.material) {
            const pulse = Math.sin(elapsed * 2.8);
            this.beaconRing.material.opacity = 0.75 + pulse * 0.20;
        }
        if (this.beaconPillar && this.beaconPillar.material) {
            const pillarPulse = Math.sin(elapsed * 1.8);
            this.beaconPillar.material.opacity = 0.12 + pillarPulse * 0.05;
        }
    }

    updateVisibility(isPlay) {
        if (!this.markerGroup) return;
        // Sembunyikan saat Play Demo agar arena bersih, tampilkan saat Studio Editor
        this.markerGroup.visible = !isPlay;
    }

    bindEvents() {
        if (this.cachedDOMElements) return;
        this.cachedDOMElements = true;

        // Toolbar Button
        const btnToolbar = document.getElementById('btn-player-spawn-tool');
        if (btnToolbar) {
            btnToolbar.addEventListener('click', () => {
                this.togglePlacementMode();
            });
        }

        // Inspector UI Inputs
        const sliderX = document.getElementById('slider-player-spawn-x');
        const sliderZ = document.getElementById('slider-player-spawn-z');
        const sliderRot = document.getElementById('slider-player-spawn-rot');

        if (sliderX) {
            sliderX.addEventListener('input', (e) => {
                this.setSpawnPosition(parseFloat(e.target.value), this.z);
            });
        }
        if (sliderZ) {
            sliderZ.addEventListener('input', (e) => {
                this.setSpawnPosition(this.x, parseFloat(e.target.value));
            });
        }
        if (sliderRot) {
            sliderRot.addEventListener('input', (e) => {
                this.setSpawnRotation(parseFloat(e.target.value));
            });
        }

        const btnCamera = document.getElementById('btn-player-spawn-camera');
        if (btnCamera) {
            btnCamera.addEventListener('click', () => {
                this.setSpawnAtCameraTarget();
            });
        }

        const btnFocus = document.getElementById('btn-player-spawn-focus');
        if (btnFocus) {
            btnFocus.addEventListener('click', () => {
                this.focusCameraOnSpawn();
            });
        }

        const btnPick = document.getElementById('btn-player-spawn-pick');
        if (btnPick) {
            btnPick.addEventListener('click', () => {
                this.togglePlacementMode();
            });
        }

        const btnReset = document.getElementById('btn-player-spawn-reset');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                this.setSpawnPosition(0, 0);
                this.setSpawnRotation(0);
            });
        }

        // Batalkan mode dengan ESC
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isPlacementModeActive) {
                this.togglePlacementMode(false);
            }
        });
    }

    syncUI() {
        const sliderX = document.getElementById('slider-player-spawn-x');
        const sliderZ = document.getElementById('slider-player-spawn-z');
        const sliderRot = document.getElementById('slider-player-spawn-rot');
        const valX = document.getElementById('val-player-spawn-x');
        const valZ = document.getElementById('val-player-spawn-z');
        const valRot = document.getElementById('val-player-spawn-rot');
        const badge = document.getElementById('badge-player-spawn-status');

        if (sliderX) sliderX.value = this.x;
        if (sliderZ) sliderZ.value = this.z;
        if (valX) valX.innerText = `${this.x.toFixed(1)} m`;
        if (valZ) valZ.innerText = `${this.z.toFixed(1)} m`;

        const deg = Math.round(THREE.MathUtils.radToDeg(this.rotY)) % 360;
        const normDeg = deg < 0 ? deg + 360 : deg;
        if (sliderRot) sliderRot.value = normDeg;
        if (valRot) valRot.innerText = `${normDeg}°`;

        if (badge) {
            badge.innerText = `X: ${this.x.toFixed(1)}m, Z: ${this.z.toFixed(1)}m (${normDeg}°)`;
        }
    }

    serialize() {
        return {
            x: Math.round(this.x * 100) / 100,
            z: Math.round(this.z * 100) / 100,
            rotY: Math.round(this.rotY * 100) / 100
        };
    }

    deserialize(data) {
        if (!data) return;
        const x = typeof data.x === 'number' ? data.x : 0;
        const z = typeof data.z === 'number' ? data.z : 0;
        const rotY = typeof data.rotY === 'number' ? data.rotY : 0;
        this.setSpawnPosition(x, z);
        this.setSpawnRotation(Math.round(THREE.MathUtils.radToDeg(rotY)));
    }
}

// Global Singleton
const PlayerSpawnManager = new PlayerSpawnManagerClass();
window.PlayerSpawnManager = PlayerSpawnManager;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PlayerSpawnManager.init());
} else {
    setTimeout(() => PlayerSpawnManager.init(), 120);
}
