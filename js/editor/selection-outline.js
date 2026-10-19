/* ===================================================================
   PANDORA EDITOR - 3D SELECTION BOUNDING CAGE & GLOW HIGHLIGHT SYSTEM
   Glowing 3D bounding box, corner brackets, ground target reticle &
   dynamic point light illumination for selected layer objects.
   =================================================================== */

const SelectionOutlineManager = {
    group: null,
    targetObject: null,

    // 3D Visual Sub-components
    boxWireframe: null,
    boxXRay: null,
    boxFaces: null,
    cornerGroup: null,
    selectionLight: null,
    wireMat: null,
    xrayMat: null,
    facesMat: null,

    // Animation & Smooth Camera Focus
    isFocusing: false,
    focusStartPos: new THREE.Vector3(),
    focusEndPos: new THREE.Vector3(),
    focusStartTarget: new THREE.Vector3(),
    focusEndTarget: new THREE.Vector3(),
    focusProgress: 1.0,
    focusDuration: 0.45,

    init() {
        if (this.group) return;

        this.group = new THREE.Group();
        this.group.name = 'SelectionOutlineGizmo';
        this.group.visible = false;
        scene.add(this.group);

        this.createBoxComponents();
        this.createCornerBrackets();
        this.createLight();
    },

    createBoxComponents() {
        // Base Unit Cube (1 x 1 x 1)
        const unitGeo = new THREE.BoxGeometry(1, 1, 1);
        const edgesGeo = new THREE.EdgesGeometry(unitGeo);

        // 1. Solid Primary Glowing Wireframe Edges (Gold/Amber #fbbf24)
        this.wireMat = new THREE.LineBasicMaterial({
            color: 0xfbbf24,
            linewidth: 2,
            transparent: true,
            opacity: 0.95,
            depthTest: true
        });
        this.boxWireframe = new THREE.LineSegments(edgesGeo, this.wireMat);
        this.boxWireframe.renderOrder = 1000;
        this.group.add(this.boxWireframe);

        // 2. Ghost/X-Ray Wireframe (visible through trees/terrain)
        this.xrayMat = new THREE.LineBasicMaterial({
            color: 0xf59e0b,
            linewidth: 1,
            transparent: true,
            opacity: 0.3,
            depthTest: false
        });
        this.boxXRay = new THREE.LineSegments(edgesGeo, this.xrayMat);
        this.boxXRay.renderOrder = 999;
        this.group.add(this.boxXRay);

        // 3. Holographic Translucent Containment Cube Faces
        this.facesMat = new THREE.MeshBasicMaterial({
            color: 0xfbbf24,
            transparent: true,
            opacity: 0.07,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.boxFaces = new THREE.Mesh(unitGeo, this.facesMat);
        this.boxFaces.renderOrder = 998;
        this.group.add(this.boxFaces);
    },

    createCornerBrackets() {
        this.cornerGroup = new THREE.Group();
        this.group.add(this.cornerGroup);
    },

    createLight() {
        // Cahaya emas radiant yang menyinari pohon secara intens dari tengah
        this.selectionLight = new THREE.PointLight(0xffea75, 3.5, 18, 1.2);
        this.selectionLight.castShadow = false;
        this.group.add(this.selectionLight);
    },

    selectObject(object, smoothFocus = false) {
        if (!object) {
            this.clearSelection();
            return;
        }

        if (!this.group) this.init();

        this.targetObject = object;
        this.group.visible = true;
        this.updateBounds();

        if (smoothFocus) {
            this.triggerSmoothFocus();
        }
    },

    clearSelection() {
        this.targetObject = null;
        if (this.group) {
            this.group.visible = false;
        }
        this.isFocusing = false;
    },

    updateBounds() {
        if (!this.targetObject || !this.group) return;

        // Hitung Bounding Box aktual dari targetObject
        const box = new THREE.Box3();
        box.setFromObject(this.targetObject);

        if (box.isEmpty()) {
            const p = this.targetObject.position;
            box.min.set(p.x - 1.5, p.y, p.z - 1.5);
            box.max.set(p.x + 1.5, p.y + 5, p.z + 1.5);
        }

        // Tambahkan padding proporsional agar sangkar membungkus sempurna
        box.expandByScalar(0.25);

        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Skala dan posisikan Box Wireframe & Faces
        this.boxWireframe.position.copy(center);
        this.boxWireframe.scale.copy(size);

        this.boxXRay.position.copy(center);
        this.boxXRay.scale.copy(size);

        this.boxFaces.position.copy(center);
        this.boxFaces.scale.copy(size);

        // Posisikan Selection Light di tengah pohon
        this.selectionLight.position.copy(center);
        this.selectionLight.distance = Math.max(16, size.y * 3.5);

        // Perbarui 8 Corner Brackets
        this.updateCornerBrackets(box);
    },

    updateCornerBrackets(box) {
        while (this.cornerGroup.children.length > 0) {
            const c = this.cornerGroup.children[0];
            if (c.geometry) c.geometry.dispose();
            this.cornerGroup.remove(c);
        }

        const min = box.min;
        const max = box.max;
        const size = new THREE.Vector3();
        box.getSize(size);

        // Panjang lengan bracket
        const arm = Math.min(0.65, Math.min(size.x, size.y, size.z) * 0.22);
        const pts = [];

        // 8 Sudut Kubus
        const corners = [
            [min.x, min.y, min.z, 1, 1, 1],
            [max.x, min.y, min.z, -1, 1, 1],
            [min.x, max.y, min.z, 1, -1, 1],
            [max.x, max.y, min.z, -1, -1, 1],
            [min.x, min.y, max.z, 1, 1, -1],
            [max.x, min.y, max.z, -1, 1, -1],
            [min.x, max.y, max.z, 1, -1, -1],
            [max.x, max.y, max.z, -1, -1, -1]
        ];

        corners.forEach(([cx, cy, cz, dx, dy, dz]) => {
            // Sumbu X
            pts.push(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(cx + dx * arm, cy, cz));
            // Sumbu Y
            pts.push(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(cx, cy + dy * arm, cz));
            // Sumbu Z
            pts.push(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(cx, cy, cz + dz * arm));
        });

        const cornerGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const cornerMat = new THREE.LineBasicMaterial({
            color: 0xffffff,
            linewidth: 3,
            transparent: true,
            opacity: 0.95
        });
        const cornerMesh = new THREE.LineSegments(cornerGeo, cornerMat);
        cornerMesh.renderOrder = 1003;
        this.cornerGroup.add(cornerMesh);
    },

    triggerSmoothFocus() {
        if (!this.targetObject) return;

        const box = new THREE.Box3().setFromObject(this.targetObject);
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);

        this.focusStartTarget.copy(controls.target);
        this.focusEndTarget.copy(center);

        this.focusStartPos.copy(camera.position);

        // Hitung jarak pandang ideal agar seluruh pohon pas di layar
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.8;
        cameraDistance = Math.min(22, Math.max(7.5, cameraDistance));

        // Arahkan dari sudut elevasi miring alami
        const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
        if (dir.lengthSq() < 0.001) dir.set(0.6, 0.4, 0.8).normalize();

        dir.y = Math.max(0.25, Math.min(0.6, dir.y));
        dir.normalize();

        this.focusEndPos.copy(center).addScaledVector(dir, cameraDistance);

        this.focusProgress = 0.0;
        this.isFocusing = true;
    },

    updateAnimation(elapsedTime, delta) {
        if (!this.group || !this.group.visible) return;

        // 1. Efek Breathing/Pulsing Cahaya & Wireframe
        const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * 4.2);
        if (this.selectionLight) {
            this.selectionLight.intensity = 2.6 + pulse * 1.6;
        }
        if (this.wireMat) {
            this.wireMat.opacity = 0.8 + pulse * 0.2;
        }
        if (this.facesMat) {
            this.facesMat.opacity = 0.05 + pulse * 0.04;
        }

        // 2. Smooth Camera Focus Interpolation (Cubic Ease-Out)
        if (this.isFocusing) {
            this.focusProgress += delta / this.focusDuration;
            if (this.focusProgress >= 1.0) {
                this.focusProgress = 1.0;
                this.isFocusing = false;
            }

            const t = 1 - Math.pow(1 - this.focusProgress, 3);

            controls.target.lerpVectors(this.focusStartTarget, this.focusEndTarget, t);
            camera.position.lerpVectors(this.focusStartPos, this.focusEndPos, t);
            controls.update();
        }
    }
};

// Inisialisasi otomatis setelah DOM siap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SelectionOutlineManager.init());
} else {
    SelectionOutlineManager.init();
}
