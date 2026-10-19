/* ===================================================================
   PANDORA EDITOR - CINEMATIC CAMERA & TIMELINE SYSTEM
   Waypoint Spline Path, Professional Sequencer & Dynamic DoF Blur
   =================================================================== */

const FOX_PALETTES = [
    { color: 0xf97316, hex: '#f97316', label: 'Oranye' },
    { color: 0x06b6d4, hex: '#06b6d4', label: 'Sian' },
    { color: 0x10b981, hex: '#10b981', label: 'Zamrud' },
    { color: 0xa855f7, hex: '#a855f7', label: 'Ungu' },
    { color: 0xec4899, hex: '#ec4899', label: 'Merah Muda' },
    { color: 0xeab308, hex: '#eab308', label: 'Kuning' }
];

const CinematicManager = {
    // Camera Waypoints state
    waypoints: [],
    cameraHeightOffset: 3.5, // Ketinggian kamera default di atas tanah
    isDrawingMode: false,

    // Fox Actor Choreography state (Supports multiple independent fox actors)
    isFoxEnabled: false,
    foxes: [],               // Array of independent Fox Actor objects
    activeFoxIndex: 0,
    isDrawingFoxMode: false,
    foxPreviewMarker: null,

    // Backward-compatibility getters for active fox
    getActiveFox() {
        if (!this.foxes || this.foxes.length === 0) {
            this.initDefaultFox();
        }
        if (this.activeFoxIndex < 0 || this.activeFoxIndex >= this.foxes.length) {
            this.activeFoxIndex = 0;
        }
        return this.foxes[this.activeFoxIndex];
    },

    get foxWaypoints() {
        const fox = this.getActiveFox();
        return fox ? fox.waypoints : [];
    },
    set foxWaypoints(val) {
        const fox = this.getActiveFox();
        if (fox) fox.waypoints = val;
    },
    get foxSpecies() {
        const fox = this.getActiveFox();
        return fox ? fox.species : 'red';
    },
    set foxSpecies(val) {
        const fox = this.getActiveFox();
        if (fox) fox.species = val;
    },
    get foxMovementMode() {
        const fox = this.getActiveFox();
        return fox ? fox.movementMode : 'trot';
    },
    set foxMovementMode(val) {
        const fox = this.getActiveFox();
        if (fox) fox.movementMode = val;
    },
    get foxIdlePose() {
        const fox = this.getActiveFox();
        return fox ? fox.idlePose : 'alert';
    },
    set foxIdlePose(val) {
        const fox = this.getActiveFox();
        if (fox) fox.idlePose = val;
    },
    get foxHeading() {
        const fox = this.getActiveFox();
        return fox ? fox.heading : 0;
    },
    set foxHeading(val) {
        const fox = this.getActiveFox();
        if (fox) fox.heading = val;
    },
    get foxCurve() {
        const fox = this.getActiveFox();
        return fox ? fox.curve : null;
    },
    get foxPathGroup() {
        const fox = this.getActiveFox();
        return fox ? fox.pathGroup : null;
    },

    // Three.js 3D helper objects
    pathGroup: null,
    curve: null,
    pathLineMesh: null,
    waypointMarkers: [],
    previewMarker: null,

    // Sequencer / Timeline state
    progress: 0.0,           // 0.0 sampai 1.0
    duration: 10.0,          // Durasi total dalam detik
    isPlaying: false,
    isLooping: true,
    playbackSpeed: 1.0,
    easing: 'smooth',        // 'smooth', 'linear', 'dramatic'

    // Focus & Depth-of-Field (DoF) state
    focusMode: 'angles',   // 'angles', 'character', 'forward', 'tree', 'center', 'custom'
    selectedWaypointIndex: 0,
    customFocusPoint: new THREE.Vector3(0, 1.2, 0),
    isDoFActive: true,
    blurAmount: 6.0,         // px blur
    isLetterboxActive: true,
    isDraggingWaypoint: false,
    draggedWaypointIndex: -1,
    dragStartFixedY: null,
    dragPlane: null,
    dragOffset: null,
    isDragModeActive: false,
    isDraggingHeight: false,
    draggedHeightIndex: -1,
    dragStartScreenY: 0,
    dragStartHeightOffset: 3.5,

    // Multi-Scene Sequencer state (Scene 1, Scene 2, Scene 3...)
    scenes: [],
    activeSceneIndex: 0,
    isPlayingAllScenes: false,

    // Stored camera state for restore
    savedCameraPos: new THREE.Vector3(),
    savedControlsTarget: new THREE.Vector3(),

    init() {
        // Buat group untuk helper jalur kamera
        this.pathGroup = new THREE.Group();
        this.pathGroup.name = 'CinematicPathGroup';
        scene.add(this.pathGroup);

        this.initFoxes();
        this.createPreviewMarker();
        this.createFoxPreviewMarker();
        this.createLetterboxAndDoFDOM();
        this.initBottomPanelResizer();
        this.initTracksSidebarWidthResizer();
        this.bindEvents();
        this.renderFoxSelectorUI();
        this.syncActiveFoxControlsUI();

        // Di awal cinematic sudah di bawah, sebagai footer toolbar yang aktif
        this.toggleBottomPanel(true);

        // Inisialisasi sistem multi-scene (Scene 1, Scene 2, Scene 3...)
        this.initScenes();

        // Pastikan kamera editor selalu berada dalam posisi aman dan tidak berada di bawah tanah/gelap
        this.rescueEditorCamera();
    },

    createPreviewMarker() {
        const geo = new THREE.SphereGeometry(0.35, 16, 16);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            wireframe: true,
            transparent: true,
            opacity: 0.8
        });
        this.previewMarker = new THREE.Mesh(geo, mat);
        this.previewMarker.visible = false;
        this.pathGroup.add(this.previewMarker);
    },

    createFoxPreviewMarker() {
        const geo = new THREE.SphereGeometry(0.28, 16, 16);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xf97316,
            wireframe: true,
            transparent: true,
            opacity: 0.9
        });
        this.foxPreviewMarker = new THREE.Mesh(geo, mat);
        this.foxPreviewMarker.visible = false;
        if (scene) scene.add(this.foxPreviewMarker);
    },

    initBottomPanelResizer() {
        const resizer = document.getElementById('resizer-cinematic-bottom');
        const panel = document.getElementById('cinematic-bottom-panel');
        if (!resizer || !panel) return;

        let isDragging = false;
        let startY = 0;
        let startHeight = 0;

        resizer.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            isDragging = true;
            startY = e.clientY;
            startHeight = panel.getBoundingClientRect().height;
            resizer.classList.add('dragging');
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'row-resize';
        });

        window.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const deltaY = startY - e.clientY;
            const newHeight = Math.min(520, Math.max(140, startHeight + deltaY));
            panel.style.height = newHeight + 'px';
            panel.style.setProperty('--cinematic-bottom-height', newHeight + 'px');
        });

        window.addEventListener('pointerup', () => {
            if (!isDragging) return;
            isDragging = false;
            resizer.classList.remove('dragging');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        });
    },

    initTracksSidebarWidthResizer() {
        const resizer = document.getElementById('resizer-cinematic-tracks');
        const sidebar = document.querySelector('.cinematic-tracks-sidebar');
        if (!resizer || !sidebar) return;

        // Restore saved width from localStorage
        try {
            const savedWidth = localStorage.getItem('pandora_cinematic_tracks_width');
            if (savedWidth) {
                const w = parseInt(savedWidth, 10);
                if (!isNaN(w) && w >= 190 && w <= 650) {
                    sidebar.style.width = w + 'px';
                    sidebar.style.minWidth = w + 'px';
                    sidebar.style.maxWidth = w + 'px';
                }
            }
        } catch (err) {
            console.warn(err);
        }

        let isDragging = false;
        let startX = 0;
        let startWidth = 0;

        resizer.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            isDragging = true;
            startX = e.clientX;
            startWidth = sidebar.getBoundingClientRect().width;
            resizer.classList.add('dragging');
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
        });

        window.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const deltaX = e.clientX - startX;
            const newWidth = Math.min(650, Math.max(190, startWidth + deltaX));
            sidebar.style.width = newWidth + 'px';
            sidebar.style.minWidth = newWidth + 'px';
            sidebar.style.maxWidth = newWidth + 'px';
        });

        window.addEventListener('pointerup', () => {
            if (!isDragging) return;
            isDragging = false;
            resizer.classList.remove('dragging');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            try {
                localStorage.setItem('pandora_cinematic_tracks_width', parseInt(sidebar.style.width, 10));
            } catch (err) {
                console.warn(err);
            }
        });
    },

    createLetterboxAndDoFDOM() {
        // 1. Top & Bottom Black Letterbox Bars
        if (!document.getElementById('cinematic-letterbox-top')) {
            const topBar = document.createElement('div');
            topBar.id = 'cinematic-letterbox-top';
            topBar.className = 'cinematic-letterbox-bar cinematic-letterbox-top';
            document.body.appendChild(topBar);

            const botBar = document.createElement('div');
            botBar.id = 'cinematic-letterbox-bottom';
            botBar.className = 'cinematic-letterbox-bar cinematic-letterbox-bottom';
            document.body.appendChild(botBar);
        }

        // 2. Optical Depth-of-Field Lens Blur Overlay
        if (!document.getElementById('cinematic-dof-overlay')) {
            const dof = document.createElement('div');
            dof.id = 'cinematic-dof-overlay';
            dof.className = 'cinematic-dof-overlay';
            document.body.appendChild(dof);
        }
    },

    // --- 1. WAYPOINTS & 3D SPLINE RECONSTRUCTION ---
    addWaypoint(x, z, customY = null, customYaw = null, customPitch = null, customFov = null) {
        if (typeof saveState === 'function') {
            saveState();
        }

        const groundY = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(x, z) : 0;
        const y = customY !== null ? customY : groundY + this.cameraHeightOffset;

        let defaultYaw = 0;
        let defaultPitch = 0;
        if (customYaw !== null && customYaw !== undefined) {
            defaultYaw = customYaw;
        } else if (this.waypoints.length > 0) {
            const prev = this.waypoints[this.waypoints.length - 1];
            defaultYaw = Math.round(THREE.MathUtils.radToDeg(Math.atan2(x - prev.x, z - prev.z)));
            if (defaultYaw < 0) defaultYaw += 360;
        } else if (typeof controls !== 'undefined' && controls && controls.target) {
            defaultYaw = Math.round(THREE.MathUtils.radToDeg(Math.atan2(controls.target.x - x, controls.target.z - z)));
            if (defaultYaw < 0) defaultYaw += 360;
        }

        if (customPitch !== null && customPitch !== undefined) {
            defaultPitch = customPitch;
        }

        const defaultFov = (customFov !== null && customFov !== undefined) ? Math.round(customFov) : 45;
        const initialHOffset = customY !== null ? Math.max(0.5, customY - groundY) : this.cameraHeightOffset;

        this.waypoints.push({
            id: 'wp_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            x: Math.round(x * 100) / 100,
            y: Math.round(y * 100) / 100,
            z: Math.round(z * 100) / 100,
            heightOffset: Math.round(initialHOffset * 10) / 10,
            yaw: Math.round(defaultYaw),
            pitch: Math.round(defaultPitch),
            fov: defaultFov
        });

        this.selectedWaypointIndex = this.waypoints.length - 1;
        this.rebuildSpline();
        this.renderWaypointUI();
        this.updateWaypointAngleUI();
    },

    removeWaypoint(idx) {
        if (idx >= 0 && idx < this.waypoints.length) {
            if (typeof saveState === 'function') {
                saveState();
            }

            const deletedNum = idx + 1;
            this.waypoints.splice(idx, 1);
            if (this.waypoints.length === 0) {
                this.selectedWaypointIndex = -1;
            } else if (this.selectedWaypointIndex >= this.waypoints.length) {
                this.selectedWaypointIndex = this.waypoints.length - 1;
            }
            this.rebuildSpline();
            this.renderWaypointUI();
            this.updateWaypointAngleUI();
            this.renderTimelineLanePips();
            this.saveCurrentSceneState();

            if (typeof PandoraToast !== 'undefined') {
                PandoraToast.show(`🗑️ Titik kamera #${deletedNum} berhasil dihapus!`, 'info');
            }
        }
    },

    clearAllWaypoints() {
        if (this.waypoints.length > 0 && typeof saveState === 'function') {
            saveState();
        }
        this.waypoints = [];
        this.rebuildSpline();
        this.renderWaypointUI();
    },

    rebuildSpline() {
        // Bersihkan objek 3D sebelumnya di pathGroup
        while (this.pathGroup.children.length > 0) {
            const child = this.pathGroup.children[0];
            this.pathGroup.remove(child);
        }
        if (this.previewMarker) this.pathGroup.add(this.previewMarker);

        this.waypointMarkers = [];

        if (this.waypoints.length < 2) {
            this.curve = null;
            this.renderWaypointMarkersOnly();
            return;
        }

        const points = this.waypoints.map(wp => new THREE.Vector3(wp.x, wp.y, wp.z));
        const isClosed = this.isLooping && this.waypoints.length >= 3;
        this.curve = new THREE.CatmullRomCurve3(points, isClosed, 'catmullrom', 0.5);

        // Buat visual garis jalur neon di viewport
        const sampleCount = Math.max(50, this.waypoints.length * 25);
        const curvePoints = this.curve.getPoints(sampleCount);
        const lineGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x38bdf8,
            linewidth: 2,
            transparent: true,
            opacity: 0.85
        });
        this.pathLineMesh = new THREE.Line(lineGeo, lineMat);
        this.pathGroup.add(this.pathLineMesh);

        this.renderWaypointMarkersOnly();
    },

    // --- HELPER 3D BADGE NOMOR URUTAN WAYPOINT (1, 2, 3...) ---
    createWaypointNumberSprite(text, isStart = false) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Shadow untuk kontras di segala sudut viewport
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;

        // Lingkaran badge nomor (Hijau emerald untuk start, Biru langit untuk waypoint lanjutan)
        ctx.beginPath();
        ctx.arc(64, 64, 48, 0, Math.PI * 2);
        ctx.fillStyle = isStart ? '#10b981' : '#0284c7';
        ctx.fill();

        ctx.lineWidth = 6;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.shadowColor = 'transparent';

        // Teks nomor urutan
        const fontSize = text.length > 2 ? 38 : (text.length > 1 ? 46 : 56);
        ctx.font = `bold ${fontSize}px "JetBrains Mono", "Segoe UI", Arial, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 66);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            depthTest: false,
            depthWrite: false,
            transparent: true
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(1.4, 1.4, 1.0);
        sprite.position.set(0, 0.85, 0); // Melayang tepat di atas bola waypoint
        sprite.renderOrder = 9999;
        return sprite;
    },

    createFoxWaypointNumberSprite(text, isStart = false, colorHex = '#ea580c') {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 3;

        // Lingkaran badge nomor rubah (Warna tema rubah / Hijau untuk start)
        ctx.beginPath();
        ctx.arc(64, 64, 48, 0, Math.PI * 2);
        ctx.fillStyle = isStart ? '#16a34a' : (colorHex || '#ea580c');
        ctx.fill();

        ctx.lineWidth = 5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.shadowColor = 'transparent';

        const fontSize = text.length > 2 ? 38 : (text.length > 1 ? 44 : 54);
        ctx.font = `bold ${fontSize}px "JetBrains Mono", "Segoe UI", Arial, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 66);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            depthTest: false,
            depthWrite: false,
            transparent: true
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(1.2, 1.2, 1.0);
        sprite.position.set(0, 0.75, 0);
        sprite.renderOrder = 9999;
        return sprite;
    },

    // --- 3D CAMERA MODEL GIZMO WITH ORIENTATION FRUSTUM ---
    createCameraGizmo(wp, idx, isSelected, isStart) {
        const camGroup = new THREE.Group();
        camGroup.name = 'CameraGizmo_' + idx;

        const mainColor = isSelected ? 0xfbbf24 : (isStart ? 0x10b981 : 0x38bdf8);

        // 1. Camera Body (sleek metallic box)
        const bodyGeo = new THREE.BoxGeometry(0.55, 0.38, 0.42);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: isSelected ? 0x2e2610 : 0x111827,
            roughness: 0.35,
            metalness: 0.8
        });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.name = 'CameraBoxMesh_' + idx;
        bodyMesh.userData = { isCameraMesh: true, waypointIndex: idx };
        camGroup.add(bodyMesh);

        // 2. Camera Lens Barrel (pointing forward along +Z)
        const lensGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.28, 16);
        lensGeo.rotateX(Math.PI / 2);
        const lensMat = new THREE.MeshStandardMaterial({
            color: 0x030712,
            roughness: 0.2,
            metalness: 0.95
        });
        const lensMesh = new THREE.Mesh(lensGeo, lensMat);
        lensMesh.position.set(0, 0, 0.32);
        lensMesh.name = 'CameraLensMesh_' + idx;
        lensMesh.userData = { isCameraMesh: true, waypointIndex: idx };
        camGroup.add(lensMesh);

        // 3. Lens Accent Rim
        const rimGeo = new THREE.TorusGeometry(0.16, 0.025, 8, 24);
        const rimMat = new THREE.MeshBasicMaterial({ color: mainColor });
        const rimMesh = new THREE.Mesh(rimGeo, rimMat);
        rimMesh.position.set(0, 0, 0.46);
        rimMesh.userData = { isCameraMesh: true, waypointIndex: idx };
        camGroup.add(rimMesh);

        // 4. Viewfinder / Top Prism
        const topGeo = new THREE.BoxGeometry(0.24, 0.12, 0.24);
        const topMat = new THREE.MeshStandardMaterial({ color: isSelected ? 0xd97706 : 0x1e293b });
        const topMesh = new THREE.Mesh(topGeo, topMat);
        topMesh.position.set(0, 0.25, 0.0);
        topMesh.name = 'CameraTopMesh_' + idx;
        topMesh.userData = { isCameraMesh: true, waypointIndex: idx };
        camGroup.add(topMesh);

        // 5. Wireframe Frustum Pyramid pandangan kamera (Field of View sesuai wp.fov)
        const fDist = 2.4;
        const fovVal = (wp.fov !== undefined && wp.fov >= 10) ? wp.fov : 45;
        const radFov = THREE.MathUtils.degToRad(fovVal);
        const fHalfH = Math.max(0.2, fDist * Math.tan(radFov / 2));
        const fHalfW = fHalfH * (16 / 9);
        const frustumPoints = [
            new THREE.Vector3(0, 0, 0.46),
            new THREE.Vector3(-fHalfW, fHalfH, fDist),
            new THREE.Vector3(fHalfW, fHalfH, fDist),
            new THREE.Vector3(fHalfW, -fHalfH, fDist),
            new THREE.Vector3(-fHalfW, -fHalfH, fDist),
        ];

        const linePairs = [
            frustumPoints[0], frustumPoints[1],
            frustumPoints[0], frustumPoints[2],
            frustumPoints[0], frustumPoints[3],
            frustumPoints[0], frustumPoints[4],
            frustumPoints[1], frustumPoints[2],
            frustumPoints[2], frustumPoints[3],
            frustumPoints[3], frustumPoints[4],
            frustumPoints[4], frustumPoints[1],
            new THREE.Vector3(0, fHalfH, fDist),
            new THREE.Vector3(0, fHalfH + 0.25, fDist) // Top orientation notch
        ];

        const frustumGeo = new THREE.BufferGeometry().setFromPoints(linePairs);
        const frustumMat = new THREE.LineBasicMaterial({
            color: mainColor,
            transparent: true,
            opacity: isSelected ? 0.95 : 0.65,
            linewidth: isSelected ? 2 : 1
        });
        const frustumLines = new THREE.LineSegments(frustumGeo, frustumMat);
        camGroup.add(frustumLines);

        // Putar kamera sesuai wp.pitch dan wp.yaw
        const radYaw = THREE.MathUtils.degToRad(wp.yaw || 0);
        const radPitch = THREE.MathUtils.degToRad(wp.pitch || 0);
        camGroup.rotation.set(radPitch, radYaw, 0, 'YXZ');

        return camGroup;
    },

    selectWaypoint(idx) {
        if (idx < 0 || idx >= this.waypoints.length) return;
        this.selectedWaypointIndex = idx;
        this.updateWaypointAngleUI();
        this.renderWaypointMarkersOnly();
        this.renderWaypointUI();
    },

    updateWaypointAngleUI() {
        const panel = document.getElementById('waypoint-angle-controls');
        if (this.waypoints.length === 0) {
            if (panel) panel.style.display = 'none';
            return;
        }
        if (panel) panel.style.display = 'flex';

        if (this.selectedWaypointIndex < 0 || this.selectedWaypointIndex >= this.waypoints.length) {
            this.selectedWaypointIndex = 0;
        }

        const wp = this.waypoints[this.selectedWaypointIndex];
        if (!wp) return;

        const lbl = document.getElementById('txt-selected-wp-label');
        if (lbl) lbl.innerText = `🎥 Angle Titik #${this.selectedWaypointIndex + 1}`;

        const sliderHeight = document.getElementById('slider-wp-height');
        const valHeight = document.getElementById('val-wp-height');
        const gy = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(wp.x, wp.z) : 0;
        const currentH = (wp.heightOffset !== undefined) ? wp.heightOffset : Math.max(0.5, Math.round((wp.y - gy) * 10) / 10);
        if (sliderHeight) sliderHeight.value = currentH;
        if (valHeight) valHeight.innerText = `${currentH.toFixed(1)}m`;

        const sliderYaw = document.getElementById('slider-wp-yaw');
        const valYaw = document.getElementById('val-wp-yaw');
        if (sliderYaw) sliderYaw.value = wp.yaw !== undefined ? wp.yaw : 0;
        if (valYaw) valYaw.innerText = `${wp.yaw !== undefined ? wp.yaw : 0}°`;

        const sliderPitch = document.getElementById('slider-wp-pitch');
        const valPitch = document.getElementById('val-wp-pitch');
        if (sliderPitch) sliderPitch.value = wp.pitch !== undefined ? wp.pitch : 0;
        if (valPitch) valPitch.innerText = `${wp.pitch !== undefined ? wp.pitch : 0}°`;

        const sliderFov = document.getElementById('slider-wp-fov');
        const valFov = document.getElementById('val-wp-fov');
        const fovVal = wp.fov !== undefined ? wp.fov : 45;
        if (sliderFov) sliderFov.value = fovVal;
        if (valFov) valFov.innerText = `${fovVal}°`;

        const btnDrag = document.getElementById('btn-drag-selected-wp');
        if (btnDrag) {
            btnDrag.classList.toggle('active', this.isDragModeActive);
            if (this.isDragModeActive) {
                btnDrag.style.background = '#0284c7';
                btnDrag.style.borderColor = '#38bdf8';
                btnDrag.style.color = '#fff';
            } else {
                btnDrag.style.background = 'rgba(56,189,248,0.18)';
                btnDrag.style.borderColor = '#38bdf8';
                btnDrag.style.color = '#e0f2fe';
            }
        }
    },

    setWaypointHeight(h) {
        if (this.selectedWaypointIndex < 0 || this.selectedWaypointIndex >= this.waypoints.length) return;
        const wp = this.waypoints[this.selectedWaypointIndex];
        if (!wp) return;

        wp.heightOffset = Math.max(0.5, Math.min(30.0, Math.round(h * 10) / 10));
        const gy = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(wp.x, wp.z) : 0;
        wp.y = Math.round((gy + wp.heightOffset) * 100) / 100;

        const valH = document.getElementById('val-wp-height');
        if (valH) valH.innerText = `${wp.heightOffset.toFixed(1)}m`;

        this.rebuildSpline();
        this.renderWaypointMarkersOnly();
        this.saveCurrentSceneState();
    },

    startDraggingHeight(idx, e) {
        if (idx < 0 || idx >= this.waypoints.length) return;
        if (typeof saveState === 'function') {
            saveState();
        }
        this.isDraggingHeight = true;
        this.draggedHeightIndex = idx;
        this.dragStartScreenY = e.clientY;
        const wp = this.waypoints[idx];
        const gy = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(wp.x, wp.z) : 0;
        this.dragStartHeightOffset = (wp.heightOffset !== undefined) ? wp.heightOffset : Math.max(0.5, wp.y - gy);
        if (typeof controls !== 'undefined') {
            controls.enabled = false;
        }
        document.body.style.cursor = 'ns-resize';
    },

    stopDraggingHeight() {
        if (!this.isDraggingHeight) return;
        const idx = this.draggedHeightIndex;
        const wp = this.waypoints[idx];
        this.isDraggingHeight = false;
        this.draggedHeightIndex = -1;
        if (typeof controls !== 'undefined') {
            controls.enabled = true;
        }
        document.body.style.cursor = '';
        this.rebuildSpline();
        this.renderWaypointUI();
        this.saveCurrentSceneState();

        if (wp && typeof PandoraToast !== 'undefined') {
            PandoraToast.show(`📏 Ketinggian Titik #${idx + 1} diatur ke ${wp.heightOffset || wp.y}m`, 'success');
        }
    },

    setWaypointAngle(yaw, pitch) {
        if (this.selectedWaypointIndex < 0 || this.selectedWaypointIndex >= this.waypoints.length) return;
        const wp = this.waypoints[this.selectedWaypointIndex];
        if (!wp) return;

        if (yaw !== null && yaw !== undefined) wp.yaw = Math.round(yaw);
        if (pitch !== null && pitch !== undefined) wp.pitch = Math.round(pitch);

        this.updateWaypointAngleUI();

        // Update rotasi model kamera 3D yang aktif secara instan tanpa menduplikasi objek
        if (this.waypointMarkers && this.waypointMarkers[this.selectedWaypointIndex]) {
            const markerGroup = this.waypointMarkers[this.selectedWaypointIndex];
            const camGizmo = markerGroup.getObjectByName('CameraGizmo_' + this.selectedWaypointIndex);
            if (camGizmo) {
                const radYaw = THREE.MathUtils.degToRad(wp.yaw || 0);
                const radPitch = THREE.MathUtils.degToRad(wp.pitch || 0);
                camGizmo.rotation.set(radPitch, radYaw, 0, 'YXZ');
            }
        } else {
            this.renderWaypointMarkersOnly();
        }

        this.saveCurrentSceneState();
    },

    setWaypointFov(fov) {
        if (this.selectedWaypointIndex < 0 || this.selectedWaypointIndex >= this.waypoints.length) return;
        const wp = this.waypoints[this.selectedWaypointIndex];
        if (!wp) return;

        wp.fov = Math.round(fov);
        this.updateWaypointAngleUI();
        this.renderWaypointMarkersOnly();
        this.saveCurrentSceneState();
    },

    toggleDragMode(force = null) {
        this.isDragModeActive = force !== null ? force : !this.isDragModeActive;
        this.updateWaypointAngleUI();
        if (this.isDragModeActive) {
            if (typeof PandoraToast !== 'undefined') {
                PandoraToast.show(`✋ Mode Geser Aktif: Klik & tahan tepat pada mesh kotak kamera di arena untuk menggeser posisinya (Esc selesai)`, 'info');
            }
        }
    },

    startDraggingWaypoint(idx, e, hitPoint = null) {
        if (idx < 0 || idx >= this.waypoints.length) return;
        if (typeof saveState === 'function') {
            saveState();
        }
        this.isDraggingWaypoint = true;
        this.draggedWaypointIndex = idx;
        const wp = this.waypoints[idx];
        const currentY = (wp && wp.y !== undefined) ? wp.y : 3.5;
        this.dragStartFixedY = currentY;

        // Bidang drag horizontal pada ketinggian persis wp.y kamera
        this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -currentY);

        if (hitPoint && wp) {
            this.dragOffset = new THREE.Vector3(wp.x - hitPoint.x, 0, wp.z - hitPoint.z);
        } else {
            this.dragOffset = new THREE.Vector3(0, 0, 0);
        }

        if (typeof controls !== 'undefined') {
            controls.enabled = false;
        }
        document.body.style.cursor = 'grabbing';
    },

    moveSelectedWaypointTo(x, z) {
        const idx = this.isDraggingWaypoint ? this.draggedWaypointIndex : this.selectedWaypointIndex;
        if (idx < 0 || idx >= this.waypoints.length) return;
        const wp = this.waypoints[idx];
        if (!wp) return;

        wp.x = Math.round(x * 100) / 100;
        wp.z = Math.round(z * 100) / 100;

        // PASTIKAN TIDAK MERUBAH KETINGGIAN KAMERA:
        // wp.y tetap terkunci pada ketinggian awal (tidak boleh berubah saat menggeser kamera)
        if (this.dragStartFixedY !== null && this.dragStartFixedY !== undefined) {
            wp.y = this.dragStartFixedY;
        }

        // Sinkronkan heightOffset dengan kontur tanah di bawahnya untuk tampilan UI
        const gy = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(wp.x, wp.z) : 0;
        wp.heightOffset = Math.max(0.5, Math.round((wp.y - gy) * 10) / 10);

        this.rebuildSpline();
        this.renderWaypointUI();
        this.updateWaypointAngleUI();
        this.saveCurrentSceneState();
    },

    stopDraggingWaypoint() {
        if (!this.isDraggingWaypoint) return;
        const idx = this.draggedWaypointIndex;
        const wp = this.waypoints[idx];
        this.isDraggingWaypoint = false;
        this.draggedWaypointIndex = -1;
        this.dragStartFixedY = null;
        this.dragPlane = null;
        this.dragOffset = null;
        if (typeof controls !== 'undefined') {
            controls.enabled = true;
        }
        document.body.style.cursor = '';
        this.rebuildSpline();
        this.renderWaypointUI();
        this.updateWaypointAngleUI();
        this.saveCurrentSceneState();

        if (wp && typeof PandoraToast !== 'undefined') {
            PandoraToast.show(`📍 Posisi Titik #${idx + 1} digeser ke (${wp.x}, ${wp.z})`, 'success');
        }
    },

    snapCurrentWaypointToView() {
        if (this.selectedWaypointIndex < 0 || this.selectedWaypointIndex >= this.waypoints.length) return;
        const wp = this.waypoints[this.selectedWaypointIndex];
        if (!wp) return;

        if (typeof saveState === 'function') {
            saveState();
        }

        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);

        let yawDeg = THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z));
        if (yawDeg < 0) yawDeg += 360;
        const pitchDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)));

        wp.yaw = Math.round(yawDeg);
        wp.pitch = Math.round(pitchDeg);

        this.updateWaypointAngleUI();

        // Update rotasi camGizmo langsung
        if (this.waypointMarkers && this.waypointMarkers[this.selectedWaypointIndex]) {
            const markerGroup = this.waypointMarkers[this.selectedWaypointIndex];
            const camGizmo = markerGroup.getObjectByName('CameraGizmo_' + this.selectedWaypointIndex);
            if (camGizmo) {
                const radYaw = THREE.MathUtils.degToRad(wp.yaw || 0);
                const radPitch = THREE.MathUtils.degToRad(wp.pitch || 0);
                camGizmo.rotation.set(radPitch, radYaw, 0, 'YXZ');
            }
        } else {
            this.renderWaypointMarkersOnly();
        }

        this.saveCurrentSceneState();

        if (typeof PandoraToast !== 'undefined') {
            PandoraToast.show(`Angle Titik #${this.selectedWaypointIndex + 1} diarahkan ke pandangan editor (${wp.yaw}°, ${wp.pitch}°)`, 'success');
        }
    },

    renderWaypointMarkersOnly() {
        // HAPUS SEMUA MARKER WAYPOINT LAMA DARI PATHGROUP AGAR TIDAK MENUMPUK
        if (this.waypointMarkers && this.waypointMarkers.length > 0) {
            this.waypointMarkers.forEach(m => {
                if (m.parent) {
                    m.parent.remove(m);
                } else if (this.pathGroup) {
                    this.pathGroup.remove(m);
                }
            });
        }
        this.waypointMarkers = [];

        this.waypoints.forEach((wp, idx) => {
            const markerGroup = new THREE.Group();
            markerGroup.position.set(wp.x, wp.y, wp.z);
            markerGroup.userData = { isWaypointMarker: true, index: idx };

            const isSelected = idx === this.selectedWaypointIndex;

            // 1. Model Kamera 3D dengan Frustum arah pandang
            const camGizmo = this.createCameraGizmo(wp, idx, isSelected, idx === 0);
            markerGroup.add(camGizmo);

            // 2. Cincin elevasi horizontal
            const ringGeo = new THREE.RingGeometry(0.45, 0.55, 24);
            ringGeo.rotateX(-Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({
                color: isSelected ? 0xfbbf24 : (idx === 0 ? 0x10b981 : 0x38bdf8),
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.6
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            markerGroup.add(ring);

            // 3. Angka nomor urutan waypoint kamera (1, 2, 3...)
            const numBadge = this.createWaypointNumberSprite(String(idx + 1), idx === 0);
            markerGroup.add(numBadge);

            // 4. Garis vertikal ke tanah untuk visualisasi ketinggian
            const groundY = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(wp.x, wp.z) : 0;
            const heightDiff = wp.y - groundY;
            if (heightDiff > 0.1) {
                const dropGeo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, -heightDiff, 0)
                ]);
                const dropMat = new THREE.LineDashedMaterial({
                    color: isSelected ? 0xfbbf24 : 0x64748b,
                    dashSize: 0.3,
                    gapSize: 0.2
                });
                const dropLine = new THREE.Line(dropGeo, dropMat);
                dropLine.computeLineDistances();
                markerGroup.add(dropLine);
            }

            // 5. Gizmo Handle Ketinggian Vertikal 3D (Hanya untuk kamera terpilih)
            if (isSelected) {
                const handleGroup = new THREE.Group();
                handleGroup.name = 'HeightHandleGroup_' + idx;

                const arrowMat = new THREE.MeshStandardMaterial({
                    color: 0x38bdf8,
                    emissive: 0x0284c7,
                    emissiveIntensity: 0.35,
                    roughness: 0.25,
                    metalness: 0.85
                });

                // Panah Atas
                const coneUpGeo = new THREE.ConeGeometry(0.13, 0.28, 12);
                coneUpGeo.translate(0, 0.46, 0);
                const coneUp = new THREE.Mesh(coneUpGeo, arrowMat);
                coneUp.userData = { isHeightHandle: true, waypointIndex: idx };
                handleGroup.add(coneUp);

                // Panah Bawah
                const coneDownGeo = new THREE.ConeGeometry(0.13, 0.28, 12);
                coneDownGeo.rotateX(Math.PI);
                coneDownGeo.translate(0, -0.46, 0);
                const coneDown = new THREE.Mesh(coneDownGeo, arrowMat);
                coneDown.userData = { isHeightHandle: true, waypointIndex: idx };
                handleGroup.add(coneDown);

                // Batang vertikal
                const stemGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8);
                const stemMesh = new THREE.Mesh(stemGeo, arrowMat);
                stemMesh.userData = { isHeightHandle: true, waypointIndex: idx };
                handleGroup.add(stemMesh);

                // Posisikan di samping kanan kamera agar jelas terlihat dan mudah diklik/ditarik
                handleGroup.position.set(0.65, 0, 0);
                markerGroup.add(handleGroup);
            }

            this.pathGroup.add(markerGroup);
            this.waypointMarkers.push(markerGroup);
        });
        this.renderTimelineLanePips();
        this.updateWaypointAngleUI();
    },

    // --- 1B. MULTI-FOX ACTOR CHOREOGRAPHY SYSTEM (INDEPENDENT ACTORS & SPLINE PATHS) ---
    initFoxes() {
        if (!this.foxes || this.foxes.length === 0) {
            this.initDefaultFox();
        }
    },

    initDefaultFox() {
        const palette = FOX_PALETTES[0];
        const fox = {
            id: 'fox_1',
            name: 'Rubah 1',
            species: 'red',
            movementMode: 'trot',
            idlePose: 'alert',
            heading: 0,
            waypoints: [],
            curve: null,
            pathGroup: null,
            model: null,
            color: palette.color,
            hex: palette.hex
        };
        this.foxes = [fox];
        this.activeFoxIndex = 0;
        this.ensureFoxGroupAndModel(fox, 0);
    },

    ensureFoxGroupAndModel(fox, idx = 0) {
        if (!fox) return;
        if (!fox.pathGroup) {
            fox.pathGroup = new THREE.Group();
            fox.pathGroup.name = `CinematicFoxPathGroup_${fox.id}`;
            if (scene) scene.add(fox.pathGroup);
        }
        if (!fox.model) {
            if (idx === 0 && typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
                fox.model = wolfCharacter;
            } else if (typeof createWolfCharacterModel === 'function') {
                fox.model = createWolfCharacterModel(fox.species || 'red');
                if (scene) scene.add(fox.model.root);
                if (idx === 0 && (typeof wolfCharacter === 'undefined' || !wolfCharacter)) {
                    wolfCharacter = fox.model;
                }
            }
        }
        if (fox.model && fox.model.root) {
            fox.model.root.visible = this.isFoxEnabled || (idx === 0 && typeof isPlayMode !== 'undefined' && isPlayMode);
        }
        if (fox.pathGroup) {
            fox.pathGroup.visible = this.isFoxEnabled;
        }
    },

    toggleFoxEnabled(enabled) {
        this.isFoxEnabled = enabled;
        const controlsEl = document.getElementById('fox-track-controls');
        const statusBadge = document.getElementById('fox-status-badge');
        const hintEl = document.getElementById('fox-lane-hint');
        if (controlsEl) controlsEl.style.display = enabled ? 'flex' : 'none';
        if (statusBadge) statusBadge.style.display = enabled ? 'inline-flex' : 'none';

        if (enabled) {
            this.initFoxes();

            this.foxes.forEach((fox, idx) => {
                this.ensureFoxGroupAndModel(fox, idx);

                if (fox.model && fox.model.root) {
                    fox.model.root.visible = true;
                    if (fox.waypoints.length === 1) {
                        const wp1 = fox.waypoints[0];
                        const gy = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(wp1.x, wp1.z) : wp1.y;
                        fox.model.root.position.set(wp1.x, gy, wp1.z);
                        fox.model.root.rotation.y = fox.heading || 0;
                    } else if (fox.waypoints.length === 0) {
                        // Jika belum ada waypoint, posisikan rubah di area dekat target kamera tanpa membuat waypoint otomatis
                        if (fox.model.root.position.lengthSq() < 0.001) {
                            const cx = (camera.position.x + controls.target.x) * 0.5 + (idx * 2.5 - 1.25);
                            const cz = (camera.position.z + controls.target.z) * 0.5 + ((idx % 2 === 0 ? 1 : -1) * 2.0);
                            const groundY = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(cx, cz) : 0;
                            fox.model.root.position.set(cx, groundY, cz);
                        }
                    }
                }

                if (fox.pathGroup) {
                    fox.pathGroup.visible = true;
                }

                this.rebuildFoxSpline(fox);
            });

            this.renderFoxSelectorUI();
            this.syncActiveFoxControlsUI();
            this.renderTimelineLanePips();
            this.updateFoxPlayback(this.progress * this.duration, 0.016, 0, false);
        } else {
            this.foxes.forEach((fox, idx) => {
                if (idx > 0 || (typeof isPlayMode === 'undefined' || !isPlayMode)) {
                    if (fox.model && fox.model.root) fox.model.root.visible = false;
                }
                if (fox.pathGroup) fox.pathGroup.visible = false;
            });
            if (this.foxPreviewMarker) this.foxPreviewMarker.visible = false;
            if (hintEl) hintEl.innerText = '(Nonaktif)';
        }
    },

    renderFoxSelectorUI() {
        const selectActive = document.getElementById('select-cinematic-active-fox');
        const badge = document.getElementById('fox-total-badge');
        const btnDelete = document.getElementById('btn-cinematic-delete-fox');

        if (badge) badge.innerText = `${this.foxes.length} Rubah`;
        if (btnDelete) btnDelete.disabled = this.foxes.length <= 1;

        if (!selectActive) return;
        selectActive.innerHTML = '';

        this.foxes.forEach((fox, idx) => {
            const opt = document.createElement('option');
            opt.value = String(idx);
            const stats = this.getFoxStatsForSpecies(fox.species);
            const wpCount = fox.waypoints ? fox.waypoints.length : 0;
            opt.text = `🦊 ${fox.name} (${stats.name} - ${wpCount} Titik)`;
            opt.selected = (idx === this.activeFoxIndex);
            selectActive.appendChild(opt);
        });
    },

    syncActiveFoxControlsUI() {
        const activeFox = this.getActiveFox();
        if (!activeFox) return;

        const selSpecies = document.getElementById('select-cinematic-fox-species');
        if (selSpecies) selSpecies.value = activeFox.species || 'red';

        const selGait = document.getElementById('select-cinematic-fox-gait');
        if (selGait) selGait.value = activeFox.movementMode || 'trot';

        const selIdle = document.getElementById('select-cinematic-fox-idle');
        if (selIdle) selIdle.value = activeFox.idlePose || 'alert';

        const btnDraw = document.getElementById('btn-cinematic-fox-draw');
        if (btnDraw) btnDraw.classList.toggle('active', this.isDrawingFoxMode);

        if (this.foxPreviewMarker && this.foxPreviewMarker.material) {
            this.foxPreviewMarker.material.color.setHex(activeFox.color || 0xf97316);
        }

        this.updateFoxGaitOptionsUI();
        this.updateFoxLaneHintUI();
    },

    addFoxActor(speciesKey = null) {
        if (!this.isFoxEnabled) {
            this.toggleFoxEnabled(true);
            const toggleFox = document.getElementById('toggle-cinematic-fox');
            if (toggleFox) toggleFox.checked = true;
        }

        const idx = this.foxes.length;
        const palette = FOX_PALETTES[idx % FOX_PALETTES.length];

        // Pilih spesies variatif otomatis jika tidak ditentukan
        const speciesKeys = ['red', 'fennec', 'arctic', 'silver', 'swift', 'corsac', 'darwin'];
        const chosenSpecies = speciesKey || speciesKeys[idx % speciesKeys.length];

        const newFox = {
            id: 'fox_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            name: `Rubah ${idx + 1}`,
            species: chosenSpecies,
            movementMode: 'trot',
            idlePose: 'alert',
            heading: 0,
            waypoints: [],
            curve: null,
            pathGroup: null,
            model: null,
            color: palette.color,
            hex: palette.hex
        };

        this.ensureFoxGroupAndModel(newFox, idx);

        // Posisikan rubah baru di tanah dekat kamera/target tanpa membuat waypoint otomatis
        const cx = (camera.position.x + controls.target.x) * 0.5 + ((idx % 2 === 0 ? 1 : -1) * (2.2 * idx));
        const cz = (camera.position.z + controls.target.z) * 0.5 + ((idx % 3 === 0 ? 1 : -1) * (2.0 * idx));
        const groundY = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(cx, cz) : 0;
        if (newFox.model && newFox.model.root) {
            newFox.model.root.position.set(cx, groundY, cz);
            newFox.model.root.visible = true;
        }

        // newFox.waypoints dibiarkan kosong ([]), hanya dibuat jika pengguna menggambar jalur
        newFox.waypoints = [];

        this.foxes.push(newFox);
        this.activeFoxIndex = this.foxes.length - 1;

        this.rebuildFoxSpline(newFox);
        this.renderFoxSelectorUI();
        this.syncActiveFoxControlsUI();
        this.renderTimelineLanePips();

        if (typeof PandoraToast !== 'undefined') {
            const stats = this.getFoxStatsForSpecies(chosenSpecies);
            PandoraToast.show(`🦊 ${newFox.name} (${stats.name}) berhasil ditambahkan dengan jalur mandiri!`, 'success');
        }
    },

    deleteFoxActor(idx) {
        if (this.foxes.length <= 1) {
            if (typeof PandoraToast !== 'undefined') {
                PandoraToast.show('Minimal harus ada 1 Aktor Rubah!', 'warning');
            }
            return;
        }

        const fox = this.foxes[idx];
        const name = fox ? fox.name : `Rubah ${idx + 1}`;

        if (fox) {
            if (fox.pathGroup && scene) {
                scene.remove(fox.pathGroup);
            }
            if (fox.model && fox.model.root && scene) {
                if (idx > 0) {
                    scene.remove(fox.model.root);
                } else {
                    fox.model.root.visible = false;
                }
            }
        }

        this.foxes.splice(idx, 1);
        if (this.activeFoxIndex >= this.foxes.length) {
            this.activeFoxIndex = this.foxes.length - 1;
        }

        // Re-link wolfCharacter ke fox 0
        if (this.foxes[0] && this.foxes[0].model && typeof wolfCharacter !== 'undefined') {
            wolfCharacter = this.foxes[0].model;
        }

        this.renderFoxSelectorUI();
        this.syncActiveFoxControlsUI();
        this.renderTimelineLanePips();

        if (typeof PandoraToast !== 'undefined') {
            PandoraToast.show(`🗑️ ${name} berhasil dihapus.`, 'info');
        }
    },

    selectActiveFox(idx) {
        if (idx < 0 || idx >= this.foxes.length) return;
        this.activeFoxIndex = idx;
        this.syncActiveFoxControlsUI();
        this.renderFoxSelectorUI();
    },

    setFoxSpecies(speciesKey) {
        const fox = this.getActiveFox();
        if (!fox) return;
        fox.species = speciesKey;

        if (fox.model && fox.model.root && scene) {
            const oldPos = fox.model.root.position.clone();
            const oldRot = fox.model.root.rotation.y;
            const wasVis = fox.model.root.visible;

            if (this.activeFoxIndex === 0 && typeof switchFoxSpecies === 'function') {
                switchFoxSpecies(speciesKey);
                fox.model = wolfCharacter;
            } else if (typeof createWolfCharacterModel === 'function') {
                scene.remove(fox.model.root);
                fox.model = createWolfCharacterModel(speciesKey);
                scene.add(fox.model.root);
            }

            if (fox.model && fox.model.root) {
                fox.model.root.position.copy(oldPos);
                fox.model.root.rotation.y = oldRot;
                fox.model.root.visible = wasVis;
            }
        }

        this.renderFoxSelectorUI();
        this.syncActiveFoxControlsUI();
        this.renderTimelineLanePips();
    },

    setFoxGait(gaitKey) {
        const fox = this.getActiveFox();
        if (!fox) return;
        fox.movementMode = gaitKey;
        this.syncActiveFoxControlsUI();
        this.renderTimelineLanePips();
        this.updateFoxPlayback(this.progress * this.duration, 0.016, performance.now() * 0.001, this.isPlaying);
    },

    setFoxIdlePose(poseKey) {
        const fox = this.getActiveFox();
        if (!fox) return;
        fox.idlePose = poseKey;
        this.updateIdleFox(0.016, performance.now() * 0.001);
        this.updateFoxLaneHintUI();
    },

    snapFoxToWaypoint1() {
        const fox = this.getActiveFox();
        if (!fox) return;

        if (fox.waypoints.length === 0) {
            const cx = controls ? controls.target.x : 0;
            const cz = controls ? controls.target.z : 0;
            this.addFoxWaypoint(cx, cz);
        }

        const wp1 = fox.waypoints[0];
        const gy = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(wp1.x, wp1.z) : wp1.y;

        this.ensureFoxGroupAndModel(fox, this.activeFoxIndex);
        if (fox.model && fox.model.root) {
            fox.model.root.position.set(wp1.x, gy, wp1.z);
            fox.model.root.rotation.y = fox.heading || 0;
            fox.model.root.visible = true;
        }

        if (typeof PandoraToast !== 'undefined') {
            PandoraToast.show(`🎯 ${fox.name} diposisikan di Waypoint #1 [${wp1.x.toFixed(1)}, ${wp1.z.toFixed(1)}]`, 'success');
        }
    },

    rotateFoxHeading(deltaAngle = Math.PI / 4) {
        const fox = this.getActiveFox();
        if (!fox) return;
        fox.heading = (fox.heading + deltaAngle) % (Math.PI * 2);
        if (fox.model && fox.model.root) {
            fox.model.root.rotation.y = fox.heading;
        }
        const deg = Math.round(THREE.MathUtils.radToDeg(fox.heading));
        const normalizedDeg = (deg % 360 + 360) % 360;
        if (typeof PandoraToast !== 'undefined') {
            PandoraToast.show(`↻ Arah hadap ${fox.name}: ${normalizedDeg}°`, 'info');
        }
    },

    addFoxWaypoint(x, z) {
        const fox = this.getActiveFox();
        if (!fox) return;
        const groundY = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(x, z) : 0;
        fox.waypoints.push({
            id: 'fox_wp_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            x: Math.round(x * 100) / 100,
            y: Math.round(groundY * 100) / 100,
            z: Math.round(z * 100) / 100
        });
        this.rebuildFoxSpline(fox);
        this.renderFoxSelectorUI();
    },

    clearFoxWaypoints() {
        const fox = this.getActiveFox();
        if (!fox) return;
        fox.waypoints = [];
        this.rebuildFoxSpline(fox);
        this.renderFoxSelectorUI();
        if (typeof isPlayMode !== 'undefined' && !isPlayMode && fox.model && fox.model.root) {
            fox.model.root.visible = false;
        }
        const hintEl = document.getElementById('fox-lane-hint');
        if (hintEl) hintEl.innerText = `(${fox.name}: Jalur Kosong)`;
    },

    rebuildFoxSpline(targetFox) {
        const fox = targetFox || this.getActiveFox();
        if (!fox) return;

        this.ensureFoxGroupAndModel(fox, this.foxes.indexOf(fox));

        while (fox.pathGroup.children.length > 0) {
            const child = fox.pathGroup.children[0];
            fox.pathGroup.remove(child);
        }

        if (fox.waypoints.length === 0) {
            fox.curve = null;
            if (this.foxes.indexOf(fox) > 0 || (typeof isPlayMode === 'undefined' || !isPlayMode)) {
                if (fox.model && fox.model.root) fox.model.root.visible = false;
            }
            return;
        }

        // KETIKA WAYPOINT CUMAN 1: Pastikan rubah terspawn langsung di titik angka 1 itu & standby idle
        if (fox.waypoints.length === 1) {
            fox.curve = null;
            this.renderSingleFoxMarkersOnly(fox);
            const wp1 = fox.waypoints[0];
            const gy = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(wp1.x, wp1.z) : wp1.y;
            if (fox.model && fox.model.root) {
                fox.model.root.position.set(wp1.x, gy, wp1.z);
                fox.model.root.rotation.y = fox.heading || 0;
                fox.model.root.visible = this.isFoxEnabled;
            }
            this.updateFoxLaneHintUI();
            this.renderTimelineLanePips();
            return;
        }

        // Waypoints >= 2: Bentuk CatmullRomCurve3 untuk jalur mandiri rubah ini
        const pts = fox.waypoints.map(wp => {
            const gy = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(wp.x, wp.z) : wp.y;
            return new THREE.Vector3(wp.x, gy + 0.12, wp.z);
        });

        fox.curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);

        const sampleCount = Math.max(40, fox.waypoints.length * 20);
        const curvePoints = fox.curve.getPoints(sampleCount);
        const lineGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
        const lineMat = new THREE.LineBasicMaterial({
            color: fox.color || 0xf97316,
            linewidth: 3,
            transparent: true,
            opacity: 0.95
        });
        const lineMesh = new THREE.Line(lineGeo, lineMat);
        fox.pathGroup.add(lineMesh);

        this.renderSingleFoxMarkersOnly(fox);
        if (fox.model && fox.model.root) {
            fox.model.root.visible = this.isFoxEnabled;
        }
        this.updateSingleFoxPlayback(fox, this.progress * this.duration, 0.016, 0, false, this.foxes.indexOf(fox));
        this.updateFoxLaneHintUI();
        this.renderTimelineLanePips();
    },

    renderSingleFoxMarkersOnly(fox) {
        const foxIdx = this.foxes.indexOf(fox) + 1;
        const markerColor = fox.color || 0xf97316;

        fox.waypoints.forEach((wp, idx) => {
            const markerGroup = new THREE.Group();
            const gy = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(wp.x, wp.z) : wp.y;
            markerGroup.position.set(wp.x, gy + 0.25, wp.z);

            const sphereGeo = new THREE.SphereGeometry(0.24, 16, 16);
            const sphereMat = new THREE.MeshBasicMaterial({
                color: idx === 0 ? 0x22c55e : markerColor
            });
            const sphere = new THREE.Mesh(sphereGeo, sphereMat);
            markerGroup.add(sphere);

            // Badge nomor: Jika > 1 rubah beri label misal F1:1, F2:1
            const badgeText = this.foxes.length > 1 ? `F${foxIdx}:${idx + 1}` : String(idx + 1);
            const foxNumBadge = this.createFoxWaypointNumberSprite(badgeText, idx === 0, fox.hex);
            markerGroup.add(foxNumBadge);

            fox.pathGroup.add(markerGroup);
        });
    },

    renderFoxMarkersOnly() {
        this.foxes.forEach(fox => {
            if (fox && fox.pathGroup) {
                while (fox.pathGroup.children.length > 0) {
                    fox.pathGroup.remove(fox.pathGroup.children[0]);
                }
                if (fox.waypoints.length >= 2 && fox.curve) {
                    const sampleCount = Math.max(40, fox.waypoints.length * 20);
                    const curvePoints = fox.curve.getPoints(sampleCount);
                    const lineGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
                    const lineMat = new THREE.LineBasicMaterial({
                        color: fox.color || 0xf97316,
                        linewidth: 3,
                        transparent: true,
                        opacity: 0.95
                    });
                    fox.pathGroup.add(new THREE.Line(lineGeo, lineMat));
                }
                this.renderSingleFoxMarkersOnly(fox);
            }
        });
    },

    toggleFoxDrawingMode(forcedState) {
        this.isDrawingFoxMode = forcedState !== undefined ? forcedState : !this.isDrawingFoxMode;
        if (this.isDrawingFoxMode) {
            this.toggleDrawingMode(false);
        }
        const btnDraw = document.getElementById('btn-cinematic-fox-draw');
        if (btnDraw) btnDraw.classList.toggle('active', this.isDrawingFoxMode);

        const bannerText = document.getElementById('mode-banner-text');
        const activeBanner = document.getElementById('active-mode-banner');
        if (this.isDrawingFoxMode) {
            const activeFox = this.getActiveFox();
            const foxName = activeFox ? activeFox.name : 'Rubah';
            if (activeBanner && bannerText) {
                bannerText.innerText = `Mode Gambar Jalur: ${foxName} (Klik tanah untuk tambah titik pergerakan)`;
                activeBanner.style.display = 'inline-flex';
            }
        } else {
            if (activeBanner && !this.isDrawingMode) {
                activeBanner.style.display = 'none';
            }
            if (this.foxPreviewMarker) {
                this.foxPreviewMarker.visible = false;
            }
        }
    },

    // --- 1C. NATURAL FOX SPEED & BIOLOGICAL STATS CONFIGURATION ---
    getFoxStatsForSpecies(speciesKey) {
        const key = speciesKey || 'red';
        return (typeof FOX_STATS_CONFIG !== 'undefined' && FOX_STATS_CONFIG[key])
            ? FOX_STATS_CONFIG[key]
            : (typeof FOX_STATS_CONFIG !== 'undefined' && FOX_STATS_CONFIG.red)
                ? FOX_STATS_CONFIG.red
                : { walkSpeed: 4.6, runSpeed: 9.6, turnRate: 2.6, name: 'Red Fox' };
    },

    getFoxStats() {
        const activeFox = this.getActiveFox();
        return this.getFoxStatsForSpecies(activeFox ? activeFox.species : 'red');
    },

    getFoxNaturalSpeedForFox(fox) {
        const stats = this.getFoxStatsForSpecies(fox ? fox.species : 'red');
        const mode = fox ? fox.movementMode : 'trot';
        if (mode === 'walk') {
            return { speed: stats.walkSpeed, huntRatio: 0.0 };
        } else if (mode === 'sprint') {
            return { speed: stats.runSpeed, huntRatio: 1.0 };
        } else {
            const trotSpeed = THREE.MathUtils.lerp(stats.walkSpeed, stats.runSpeed, 0.42);
            return { speed: trotSpeed, huntRatio: 0.35 };
        }
    },

    getFoxNaturalSpeed() {
        return this.getFoxNaturalSpeedForFox(this.getActiveFox());
    },

    updateFoxGaitOptionsUI() {
        const selectGait = document.getElementById('select-cinematic-fox-gait');
        if (!selectGait) return;
        const stats = this.getFoxStats();
        const walkSpd = stats.walkSpeed.toFixed(1);
        const trotSpd = THREE.MathUtils.lerp(stats.walkSpeed, stats.runSpeed, 0.42).toFixed(1);
        const runSpd = stats.runSpeed.toFixed(1);

        if (selectGait.options.length >= 3) {
            selectGait.options[0].text = `🐾 Jalan (${walkSpd} m/s)`;
            selectGait.options[1].text = `🦊 Trot (${trotSpd} m/s)`;
            selectGait.options[2].text = `⚡ Sprint (${runSpd} m/s)`;
        }
    },

    updateFoxLaneHintUI() {
        const laneHint = document.getElementById('fox-lane-hint');
        if (!laneHint) return;

        if (this.isFoxEnabled) {
            const activeFox = this.getActiveFox();
            if (activeFox) {
                const stats = this.getFoxStatsForSpecies(activeFox.species);
                if (activeFox.waypoints.length === 1) {
                    const wp1 = activeFox.waypoints[0];
                    const poseName = activeFox.idlePose === 'sit' ? 'Duduk' : (activeFox.idlePose === 'sleep' ? 'Tidur' : 'Waspada');
                    laneHint.innerText = `(${activeFox.name}: ${stats.name} Standby Titik #1 [${wp1.x.toFixed(1)}, ${wp1.z.toFixed(1)}] | ${poseName})`;
                } else if (activeFox.waypoints.length >= 2 && activeFox.curve) {
                    const gaitName = activeFox.movementMode === 'walk' ? 'Jalan' : (activeFox.movementMode === 'sprint' ? 'Sprint' : 'Trot');
                    const { speed } = this.getFoxNaturalSpeedForFox(activeFox);
                    const pathLen = activeFox.curve.getLength().toFixed(1);
                    laneHint.innerText = `(${activeFox.name}: ${stats.name} - ${gaitName} ${speed.toFixed(1)} m/s | Jalur: ${pathLen}m)`;
                } else {
                    laneHint.innerText = `(${activeFox.name}: Jalur Kosong)`;
                }
            }
        } else {
            laneHint.innerText = "(Centang 'Aktif' & Gambar Jalur)";
        }
    },

    applyFoxPose(character, poseMode = 'alert', dt = 0.016, elapsed = 0, timeOffset = 0) {
        if (!character || !character.root || !character.bodyTiltGroup) return;

        const t = (elapsed || performance.now() * 0.001) + timeOffset;

        if (poseMode === 'alert') {
            if (character === wolfCharacter && typeof updateWolfLocomotionAnimation === 'function') {
                updateWolfLocomotionAnimation(dt, t, 0, 0, 0, true, 0);
            } else {
                // Animasi idle waspada alami
                const breath = Math.sin(t * 2.3) * 0.014;
                const baseHipY = character.BASE_HIP_Y || 1.62;
                character.bodyTiltGroup.position.y = THREE.MathUtils.lerp(character.bodyTiltGroup.position.y, baseHipY + breath, 8 * dt);
                character.bodyTiltGroup.rotation.z = THREE.MathUtils.lerp(character.bodyTiltGroup.rotation.z, 0, 8 * dt);
                character.bodyTiltGroup.rotation.x = THREE.MathUtils.lerp(character.bodyTiltGroup.rotation.x, 0, 8 * dt);

                const lookYaw = Math.sin(t * 0.6) * 0.25;
                character.neckJoint.rotation.y = THREE.MathUtils.lerp(character.neckJoint.rotation.y, lookYaw * 0.45, 7 * dt);
                character.headJoint.rotation.y = THREE.MathUtils.lerp(character.headJoint.rotation.y, lookYaw * 0.70, 8 * dt);
                character.neckJoint.rotation.z = THREE.MathUtils.lerp(character.neckJoint.rotation.z, Math.sin(t * 2.3 - 0.5) * 0.02, 7 * dt);
                character.headJoint.rotation.z = THREE.MathUtils.lerp(character.headJoint.rotation.z, -Math.sin(t * 2.3 - 0.5) * 0.015, 8 * dt);

                const tailWave = Math.sin(t * 1.6) * 0.055;
                character.tailBaseJoint.rotation.y = THREE.MathUtils.lerp(character.tailBaseJoint.rotation.y, tailWave, 7 * dt);
                character.tailMidJoint.rotation.y = THREE.MathUtils.lerp(character.tailMidJoint.rotation.y, tailWave * 1.4, 7 * dt);
                character.tailTipJoint.rotation.y = THREE.MathUtils.lerp(character.tailTipJoint.rotation.y, tailWave * 1.8, 7 * dt);

                ['legFL', 'legFR', 'legBL', 'legBR'].forEach(legKey => {
                    if (character[legKey]) {
                        character[legKey].hip.rotation.z = THREE.MathUtils.lerp(character[legKey].hip.rotation.z, 0, 8 * dt);
                        character[legKey].knee.rotation.z = THREE.MathUtils.lerp(character[legKey].knee.rotation.z, 0, 8 * dt);
                        character[legKey].paw.rotation.z = THREE.MathUtils.lerp(character[legKey].paw.rotation.z, 0, 8 * dt);
                    }
                });
            }
        } else if (poseMode === 'sit') {
            const breath = Math.sin(t * 1.8) * 0.012;
            const baseHipY = character.BASE_HIP_Y || 1.62;
            character.bodyTiltGroup.position.y = THREE.MathUtils.lerp(character.bodyTiltGroup.position.y, baseHipY - 0.28 + breath, 8 * dt);
            character.bodyTiltGroup.rotation.z = THREE.MathUtils.lerp(character.bodyTiltGroup.rotation.z, -0.32, 8 * dt);
            character.bodyTiltGroup.rotation.x = THREE.MathUtils.lerp(character.bodyTiltGroup.rotation.x, 0, 8 * dt);

            if (character.legFL) {
                character.legFL.hip.rotation.z = THREE.MathUtils.lerp(character.legFL.hip.rotation.z, 0.28, 8 * dt);
                character.legFL.knee.rotation.z = THREE.MathUtils.lerp(character.legFL.knee.rotation.z, -0.12, 8 * dt);
                character.legFL.paw.rotation.z = THREE.MathUtils.lerp(character.legFL.paw.rotation.z, 0.05, 8 * dt);
            }
            if (character.legFR) {
                character.legFR.hip.rotation.z = THREE.MathUtils.lerp(character.legFR.hip.rotation.z, 0.28, 8 * dt);
                character.legFR.knee.rotation.z = THREE.MathUtils.lerp(character.legFR.knee.rotation.z, -0.12, 8 * dt);
                character.legFR.paw.rotation.z = THREE.MathUtils.lerp(character.legFR.paw.rotation.z, 0.05, 8 * dt);
            }
            if (character.legBL) {
                character.legBL.hip.rotation.z = THREE.MathUtils.lerp(character.legBL.hip.rotation.z, -0.75, 8 * dt);
                character.legBL.knee.rotation.z = THREE.MathUtils.lerp(character.legBL.knee.rotation.z, 1.15, 8 * dt);
                character.legBL.paw.rotation.z = THREE.MathUtils.lerp(character.legBL.paw.rotation.z, -0.40, 8 * dt);
            }
            if (character.legBR) {
                character.legBR.hip.rotation.z = THREE.MathUtils.lerp(character.legBR.hip.rotation.z, -0.75, 8 * dt);
                character.legBR.knee.rotation.z = THREE.MathUtils.lerp(character.legBR.knee.rotation.z, 1.15, 8 * dt);
                character.legBR.paw.rotation.z = THREE.MathUtils.lerp(character.legBR.paw.rotation.z, -0.40, 8 * dt);
            }

            const lookYaw = Math.sin(t * 0.45) * 0.18;
            character.neckJoint.rotation.z = THREE.MathUtils.lerp(character.neckJoint.rotation.z, 0.35, 8 * dt);
            character.headJoint.rotation.z = THREE.MathUtils.lerp(character.headJoint.rotation.z, -0.15, 8 * dt);
            character.neckJoint.rotation.y = THREE.MathUtils.lerp(character.neckJoint.rotation.y, lookYaw * 0.5, 8 * dt);
            character.headJoint.rotation.y = THREE.MathUtils.lerp(character.headJoint.rotation.y, lookYaw, 8 * dt);

            character.tailBaseJoint.rotation.z = THREE.MathUtils.lerp(character.tailBaseJoint.rotation.z, -0.20, 8 * dt);
            character.tailBaseJoint.rotation.y = THREE.MathUtils.lerp(character.tailBaseJoint.rotation.y, 0.65 + Math.sin(t * 1.5) * 0.05, 8 * dt);
            character.tailMidJoint.rotation.y = THREE.MathUtils.lerp(character.tailMidJoint.rotation.y, 0.85 + Math.sin(t * 1.5 - 0.5) * 0.08, 8 * dt);
            character.tailTipJoint.rotation.y = THREE.MathUtils.lerp(character.tailTipJoint.rotation.y, 0.95 + Math.sin(t * 1.5 - 1.0) * 0.10, 8 * dt);
        } else if (poseMode === 'sleep') {
            const sleepBreath = Math.sin(t * 1.2) * 0.010;
            const baseHipY = character.BASE_HIP_Y || 1.62;
            character.bodyTiltGroup.position.y = THREE.MathUtils.lerp(character.bodyTiltGroup.position.y, baseHipY - 0.42 + sleepBreath, 6 * dt);
            character.bodyTiltGroup.rotation.z = THREE.MathUtils.lerp(character.bodyTiltGroup.rotation.z, 0.08, 6 * dt);
            character.bodyTiltGroup.rotation.x = THREE.MathUtils.lerp(character.bodyTiltGroup.rotation.x, -0.22, 6 * dt);

            if (character.legFL) {
                character.legFL.hip.rotation.z = THREE.MathUtils.lerp(character.legFL.hip.rotation.z, -0.85, 6 * dt);
                character.legFL.knee.rotation.z = THREE.MathUtils.lerp(character.legFL.knee.rotation.z, 0.95, 6 * dt);
            }
            if (character.legFR) {
                character.legFR.hip.rotation.z = THREE.MathUtils.lerp(character.legFR.hip.rotation.z, -0.75, 6 * dt);
                character.legFR.knee.rotation.z = THREE.MathUtils.lerp(character.legFR.knee.rotation.z, 0.85, 6 * dt);
            }
            if (character.legBL) {
                character.legBL.hip.rotation.z = THREE.MathUtils.lerp(character.legBL.hip.rotation.z, -0.90, 6 * dt);
                character.legBL.knee.rotation.z = THREE.MathUtils.lerp(character.legBL.knee.rotation.z, 1.20, 6 * dt);
            }
            if (character.legBR) {
                character.legBR.hip.rotation.z = THREE.MathUtils.lerp(character.legBR.hip.rotation.z, -0.80, 6 * dt);
                character.legBR.knee.rotation.z = THREE.MathUtils.lerp(character.legBR.knee.rotation.z, 1.10, 6 * dt);
            }

            character.neckJoint.rotation.z = THREE.MathUtils.lerp(character.neckJoint.rotation.z, -0.38, 6 * dt);
            character.headJoint.rotation.z = THREE.MathUtils.lerp(character.headJoint.rotation.z, -0.32, 6 * dt);
            character.neckJoint.rotation.y = THREE.MathUtils.lerp(character.neckJoint.rotation.y, 0.35, 6 * dt);
            character.headJoint.rotation.y = THREE.MathUtils.lerp(character.headJoint.rotation.y, 0.45, 6 * dt);

            character.tailBaseJoint.rotation.y = THREE.MathUtils.lerp(character.tailBaseJoint.rotation.y, 1.10 + sleepBreath * 0.5, 6 * dt);
            character.tailMidJoint.rotation.y = THREE.MathUtils.lerp(character.tailMidJoint.rotation.y, 1.35, 6 * dt);
            character.tailTipJoint.rotation.y = THREE.MathUtils.lerp(character.tailTipJoint.rotation.y, 1.40, 6 * dt);
        }
    },

    applyFoxLocomotionToCharacter(character, dt, elapsed, speed, turnRate, huntRatio) {
        if (!character || !character.root || !character.bodyTiltGroup) return;
        const isMoving = Math.abs(speed) > 0.05 || Math.abs(turnRate) > 0.05;

        if (isMoving) {
            const freq = 9.2 + Math.abs(speed) * 0.95;
            const phase = elapsed * freq;
            const moveActivity = Math.min(1.0, Math.abs(speed) / 4.6);
            const bob = Math.abs(Math.sin(phase)) * (0.055 + 0.045 * huntRatio) * moveActivity;

            const baseHipY = character.BASE_HIP_Y || 1.62;
            character.bodyTiltGroup.position.y = THREE.MathUtils.lerp(character.bodyTiltGroup.position.y, baseHipY + bob, 14 * dt);
            character.bodyTiltGroup.rotation.z = THREE.MathUtils.lerp(character.bodyTiltGroup.rotation.z, Math.cos(phase) * 0.04 * moveActivity, 12 * dt);

            if (typeof updateLegArticulation === 'function') {
                const phaseFL = phase;
                const phaseFR = phase + Math.PI;
                const phaseBR = phase + 0.35;
                const phaseBL = phase + Math.PI + 0.35;

                updateLegArticulation(character.legFL, phaseFL, moveActivity, true, huntRatio, false);
                updateLegArticulation(character.legFR, phaseFR, moveActivity, true, huntRatio, false);
                updateLegArticulation(character.legBR, phaseBR, moveActivity, false, huntRatio, false);
                updateLegArticulation(character.legBL, phaseBL, moveActivity, false, huntRatio, false);
            }
        } else {
            this.applyFoxPose(character, 'alert', dt, elapsed, 0);
        }
    },

    updateSingleFoxPlayback(fox, timeSeconds, dt = 0.016, elapsed = 0, isPlaying = false, foxIdx = 0) {
        if (!fox || !fox.model || !fox.model.root || !fox.model.root.visible) return;

        // KETIKA WAYPOINT CUMAN 1: Diam di tempat & jalankan pose idle
        if (fox.waypoints.length === 1) {
            const wp1 = fox.waypoints[0];
            const gy = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(wp1.x, wp1.z) : wp1.y;
            fox.model.root.position.set(wp1.x, gy, wp1.z);
            fox.model.root.rotation.y = fox.heading || 0;
            this.applyFoxPose(fox.model, fox.idlePose || 'alert', dt, elapsed, foxIdx * 1.5);
            return;
        }

        if (!fox.curve) return;
        const pathLength = fox.curve.getLength();
        if (pathLength < 0.1) return;

        const { speed: naturalSpeed, huntRatio } = this.getFoxNaturalSpeedForFox(fox);
        const distanceTraveled = Math.max(0, timeSeconds * naturalSpeed);

        let u = 0;
        let isMoving = false;
        let currentSpeed = 0;

        if (this.isLooping) {
            u = (distanceTraveled % pathLength) / pathLength;
            isMoving = isPlaying;
            currentSpeed = isPlaying ? naturalSpeed : 0;
        } else {
            if (distanceTraveled < pathLength) {
                u = distanceTraveled / pathLength;
                isMoving = isPlaying;
                currentSpeed = isPlaying ? naturalSpeed : 0;
            } else {
                u = 1.0;
                isMoving = false;
                currentSpeed = 0;
            }
        }

        u = THREE.MathUtils.clamp(u, 0.0, 1.0);

        const pt = fox.curve.getPointAt(u);
        const groundY = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(pt.x, pt.z) : pt.y;
        fox.model.root.position.set(pt.x, groundY, pt.z);

        // Orientasi arah hadap tangen kurva
        let turnRate = 0;
        const deltaU = 0.008;
        let uNext = Math.min(1.0, u + deltaU);
        let uPrev = Math.max(0.0, u - deltaU);

        if (u >= 0.999 && !this.isLooping) {
            uNext = 1.0;
            uPrev = Math.max(0.0, 1.0 - deltaU * 2);
        } else if (u <= 0.001) {
            uPrev = 0.0;
            uNext = Math.min(1.0, deltaU * 2);
        }

        const ptPrev = fox.curve.getPointAt(uPrev);
        const ptNext = fox.curve.getPointAt(uNext);
        const dir = new THREE.Vector3().subVectors(ptNext, ptPrev);
        dir.y = 0;

        if (dir.lengthSq() > 0.00001) {
            dir.normalize();
            const angle = Math.atan2(dir.z, -dir.x);
            fox.model.root.rotation.y = angle;

            if (isMoving && uNext < 1.0 - deltaU) {
                const ptFarNext = fox.curve.getPointAt(Math.min(1.0, uNext + deltaU));
                const dirNext = new THREE.Vector3().subVectors(ptFarNext, ptNext);
                dirNext.y = 0;
                if (dirNext.lengthSq() > 0.00001) {
                    dirNext.normalize();
                    const nextAngle = Math.atan2(dirNext.z, -dirNext.x);
                    let angleDiff = (nextAngle - angle) % (Math.PI * 2);
                    if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    const dtStep = Math.max(0.001, (deltaU * pathLength) / naturalSpeed);
                    turnRate = THREE.MathUtils.clamp(angleDiff / dtStep, -3.5, 3.5);
                }
            }
        }

        // Animasi pergerakan artikulasi biologis rubah
        if (fox.model === wolfCharacter && typeof updateWolfLocomotionAnimation === 'function') {
            updateWolfLocomotionAnimation(
                dt,
                elapsed || performance.now() * 0.001,
                currentSpeed,
                turnRate,
                isMoving ? huntRatio : 0,
                true,
                0
            );
        } else {
            this.applyFoxLocomotionToCharacter(
                fox.model,
                dt,
                (elapsed || performance.now() * 0.001) + foxIdx * 0.7,
                currentSpeed,
                turnRate,
                isMoving ? huntRatio : 0
            );
        }
    },

    updateFoxPlayback(timeSeconds, dt = 0.016, elapsed = 0, isPlaying = false) {
        if (!this.isFoxEnabled || !this.foxes) return;
        this.foxes.forEach((fox, idx) => {
            if (fox && fox.model && fox.model.root && fox.model.root.visible) {
                this.updateSingleFoxPlayback(fox, timeSeconds, dt, elapsed, isPlaying, idx);
            }
        });
    },

    updateFoxPosition(rawT) {
        const timeSeconds = (rawT !== undefined ? rawT : this.progress) * this.duration;
        this.updateFoxPlayback(timeSeconds, 0.016, 0, false);
    },

    renderTimelineLanePips() {
        const camLane = document.getElementById('camera-waypoint-markers-lane');
        const foxLane = document.getElementById('fox-waypoint-markers-lane');

        if (camLane) {
            camLane.innerHTML = '';
            const n = this.waypoints.length;
            if (n > 1) {
                this.waypoints.forEach((wp, i) => {
                    const pip = document.createElement('div');
                    pip.className = 'cinematic-keyframe-pip';
                    pip.style.left = `${((i / (n - 1)) * 100).toFixed(1)}%`;
                    camLane.appendChild(pip);
                });
            }
        }

        if (foxLane) {
            foxLane.innerHTML = '';
            // Render pips untuk semua aktor rubah dengan warna khas masing-masing
            this.foxes.forEach((fox, fIdx) => {
                const fn = fox.waypoints ? fox.waypoints.length : 0;
                if (fn > 1 && fox.curve) {
                    const totalPathLen = fox.curve.getLength();
                    const { speed: naturalSpeed } = this.getFoxNaturalSpeedForFox(fox);

                    let accumulatedDist = 0;
                    let prevPt = fox.curve.getPointAt(0);

                    fox.waypoints.forEach((wp, i) => {
                        const u = i / (fn - 1);
                        const pt = fox.curve.getPointAt(u);
                        if (i > 0) accumulatedDist += pt.distanceTo(prevPt);
                        prevPt = pt;

                        const pipTime = naturalSpeed > 0 ? (accumulatedDist / naturalSpeed) : (u * this.duration);
                        const pipPercent = Math.min(100, (pipTime / Math.max(0.1, this.duration)) * 100);

                        const pip = document.createElement('div');
                        pip.className = 'cinematic-keyframe-pip fox-pip';
                        pip.style.left = `${pipPercent.toFixed(1)}%`;
                        pip.style.backgroundColor = fox.hex || '#f97316';
                        pip.title = `${fox.name} Titik #${i + 1} (${pipTime.toFixed(1)}s)`;
                        foxLane.appendChild(pip);
                    });
                }
            });
        }

        const camCount = document.getElementById('camera-waypoints-badge');
        if (camCount) camCount.innerText = `${this.waypoints.length} Titik`;
    },

    // --- 2. PRESET JALUR SINEMATIK CEPAT ---
    applyPreset(presetName) {
        this.clearAllWaypoints();

        const targetX = (wolfCharacter && wolfCharacter.root) ? wolfCharacter.root.position.x : 0;
        const targetZ = (wolfCharacter && wolfCharacter.root) ? wolfCharacter.root.position.z : 0;
        const groundY = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(targetX, targetZ) : 0;

        if (presetName === 'orbit') {
            // Orbit 360 derajat melingkar mengelilingi karakter / pusat map (kamera menghadap ke tengah)
            const radius = 14;
            const segments = 8;
            for (let i = 0; i < segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const wx = targetX + Math.cos(angle) * radius;
                const wz = targetZ + Math.sin(angle) * radius;
                const wy = groundY + 4.5 + Math.sin(angle * 2) * 1.5;
                const yaw = (Math.round(THREE.MathUtils.radToDeg(Math.atan2(targetX - wx, targetZ - wz))) + 360) % 360;
                this.addWaypoint(wx, wz, wy, yaw, -12);
            }
        } else if (presetName === 'flythrough') {
            // Terbang meluncur menembus map dari ketinggian ke tanah
            this.addWaypoint(targetX - 22, targetZ - 18, groundY + 12, 45, -16);
            this.addWaypoint(targetX - 10, targetZ - 8, groundY + 6.5, 45, -10);
            this.addWaypoint(targetX, targetZ, groundY + 3.2, 45, -4);
            this.addWaypoint(targetX + 12, targetZ + 8, groundY + 4.8, 45, 6);
            this.addWaypoint(targetX + 22, targetZ + 18, groundY + 9.5, 45, 14);
        } else if (presetName === 'spiral') {
            // Spiral naik ke atas (Crane Shot menghadap tengah)
            const segments = 8;
            for (let i = 0; i < segments; i++) {
                const angle = (i / segments) * Math.PI * 2.5;
                const r = 6 + i * 1.8;
                const wx = targetX + Math.cos(angle) * r;
                const wz = targetZ + Math.sin(angle) * r;
                const wy = groundY + 2.5 + i * 2.2;
                const yaw = (Math.round(THREE.MathUtils.radToDeg(Math.atan2(targetX - wx, targetZ - wz))) + 360) % 360;
                this.addWaypoint(wx, wz, wy, yaw, -15);
            }
        } else if (presetName === 'dolly') {
            // Low-Angle Cinematic Dolly Pass
            this.addWaypoint(targetX - 12, targetZ - 4, groundY + 2.0, 70, 0);
            this.addWaypoint(targetX - 4, targetZ - 2, groundY + 1.8, 70, 2);
            this.addWaypoint(targetX + 3, targetZ + 1, groundY + 2.2, 70, 0);
            this.addWaypoint(targetX + 11, targetZ + 5, groundY + 3.0, 70, -2);
        }

        this.progress = 0.0;
        this.updateTimelineUI();
        this.saveCurrentSceneState();
    },

    // --- 2B. MULTI-SCENE SEQUENCER (SCENE 1, SCENE 2, SCENE 3... PLAY BERGANTIAN) ---
    getEnvironmentSnapshot() {
        const pickerPlaneColor = document.getElementById('picker-plane-color');
        const toggleGrid = document.getElementById('toggle-studio-grid');
        const selectSky = document.getElementById('select-sky-preset');
        const sliderAzim = document.getElementById('slider-azimuth');
        const sliderElev = document.getElementById('slider-elevation');
        const sliderWind = document.getElementById('slider-wind-speed');
        const sliderLeaf = document.getElementById('slider-leaf-fall');

        return {
            planeColor: pickerPlaneColor ? pickerPlaneColor.value : '#cbb6b8',
            showGrid: toggleGrid ? toggleGrid.checked : true,
            skyPreset: selectSky ? selectSky.value : 'day',
            sunAzimuth: sliderAzim ? parseFloat(sliderAzim.value) : 300,
            sunElevation: sliderElev ? parseFloat(sliderElev.value) : 45,
            windSpeed: sliderWind ? parseFloat(sliderWind.value) : 1.0,
            leafFall: sliderLeaf ? parseFloat(sliderLeaf.value) : 1.0
        };
    },

    applyEnvironmentSnapshot(env) {
        if (!env) return;
        if (env.skyPreset && typeof applySkyPreset === 'function') {
            const selectSky = document.getElementById('select-sky-preset');
            if (selectSky) selectSky.value = env.skyPreset;
            applySkyPreset(env.skyPreset);
        }
        if (env.sunAzimuth !== undefined) {
            const sliderAzim = document.getElementById('slider-azimuth');
            if (sliderAzim) sliderAzim.value = env.sunAzimuth;
        }
        if (env.sunElevation !== undefined) {
            const sliderElev = document.getElementById('slider-elevation');
            if (sliderElev) sliderElev.value = env.sunElevation;
        }
        if (typeof updateSunPosition === 'function') {
            updateSunPosition();
        }
        if (env.windSpeed !== undefined) {
            const sliderWind = document.getElementById('slider-wind-speed');
            if (sliderWind) {
                sliderWind.value = env.windSpeed;
                if (typeof windSpeedRate !== 'undefined') windSpeedRate = env.windSpeed;
            }
        }
        if (env.leafFall !== undefined) {
            const sliderLeaf = document.getElementById('slider-leaf-fall');
            if (sliderLeaf) {
                sliderLeaf.value = env.leafFall;
                if (typeof leafFallRate !== 'undefined') leafFallRate = env.leafFall;
            }
        }
        if (env.planeColor) {
            const picker = document.getElementById('picker-plane-color');
            if (picker) {
                picker.value = env.planeColor;
                if (typeof groundMaterial !== 'undefined' && groundMaterial && groundMaterial.color) {
                    groundMaterial.color.set(env.planeColor);
                }
            }
        }
        if (env.showGrid !== undefined) {
            const toggleGrid = document.getElementById('toggle-studio-grid');
            if (toggleGrid) {
                toggleGrid.checked = env.showGrid;
                if (typeof studioGrid !== 'undefined' && studioGrid) {
                    studioGrid.visible = env.showGrid;
                }
            }
        }
    },

    getTreesSnapshot() {
        if (typeof treesList === 'undefined' || !Array.isArray(treesList)) return [];
        return treesList.map(t => ({
            type: (t.userData && t.userData.typeCode) ? t.userData.typeCode : 'oak',
            posX: Math.round(t.position.x * 100) / 100,
            posZ: Math.round(t.position.z * 100) / 100,
            rotY: Math.round(t.rotation.y * 100) / 100,
            trunkScaleY: (t.userData && t.userData.trunkGroup) ? Math.round(t.userData.trunkGroup.scale.y * 100) / 100 : 1.0,
            trunkThickness: (t.userData && t.userData.trunkGroup) ? Math.round(t.userData.trunkGroup.scale.x * 100) / 100 : 1.0,
            branchCount: (t.userData && t.userData.branchCount) || 3,
            curvature: (t.userData && t.userData.curvature !== undefined) ? Math.round(t.userData.curvature * 100) / 100 : 0.5,
            leafCount: (t.userData && t.userData.leafMesh) ? t.userData.leafMesh.count : 1200,
            seed: t.userData ? t.userData.seed : undefined
        }));
    },

    initScenes() {
        if (!this.scenes || this.scenes.length === 0) {
            this.scenes = [
                {
                    id: 'scene_1_' + Date.now(),
                    name: 'Scene 1',
                    duration: 10.0,
                    cameraHeightOffset: 3.5,
                    focusMode: 'character',
                    easing: 'smooth',
                    blurAmount: 6.0,
                    isDoFActive: true,
                    isLetterboxActive: true,
                    isFoxEnabled: this.isFoxEnabled,
                    activeFoxIndex: 0,
                    foxes: (this.foxes && this.foxes.length > 0) ? this.foxes.map(f => ({
                        id: f.id,
                        name: f.name,
                        species: f.species,
                        movementMode: f.movementMode,
                        idlePose: f.idlePose,
                        heading: f.heading,
                        waypoints: JSON.parse(JSON.stringify(f.waypoints || []))
                    })) : [],
                    environment: this.getEnvironmentSnapshot(),
                    treesSnapshot: this.getTreesSnapshot(),
                    waypoints: []
                }
            ];
            this.activeSceneIndex = 0;
            this.applyPreset('orbit');
            this.saveCurrentSceneState();
        }
        this.renderSceneTabsUI();
    },

    saveCurrentSceneState() {
        if (!this.scenes || this.scenes.length === 0) return;
        if (this.activeSceneIndex < 0 || this.activeSceneIndex >= this.scenes.length) return;
        const cur = this.scenes[this.activeSceneIndex];
        cur.duration = this.duration;
        cur.cameraHeightOffset = this.cameraHeightOffset;
        cur.focusMode = this.focusMode;
        cur.easing = this.easing;
        cur.blurAmount = this.blurAmount;
        cur.isDoFActive = this.isDoFActive;
        cur.isLetterboxActive = this.isLetterboxActive;
        cur.isFoxEnabled = this.isFoxEnabled;
        cur.activeFoxIndex = this.activeFoxIndex;
        cur.foxes = this.foxes.map(f => ({
            id: f.id,
            name: f.name,
            species: f.species,
            movementMode: f.movementMode,
            idlePose: f.idlePose,
            heading: f.heading,
            waypoints: JSON.parse(JSON.stringify(f.waypoints || []))
        }));
        cur.environment = this.getEnvironmentSnapshot();
        cur.treesSnapshot = this.getTreesSnapshot();
        cur.waypoints = JSON.parse(JSON.stringify(this.waypoints || []));

        this.syncFoxContinuityAcrossScenes();
    },

    syncFoxContinuityAcrossScenes() {
        if (!this.scenes || this.scenes.length <= 1) return;

        for (let i = 0; i < this.scenes.length - 1; i++) {
            const curScene = this.scenes[i];
            const nextScene = this.scenes[i + 1];
            if (!curScene || !nextScene) continue;

            const curFoxes = curScene.foxes || [];
            if (!nextScene.foxes) nextScene.foxes = [];

            // Untuk setiap rubah yang ada di curScene
            curFoxes.forEach((cf, cfIdx) => {
                let endPos = null;
                let endHeading = cf.heading || 0;

                if (cf.waypoints && cf.waypoints.length > 0) {
                    const lastWp = cf.waypoints[cf.waypoints.length - 1];
                    endPos = { x: lastWp.x, y: lastWp.y, z: lastWp.z };
                    if (cf.waypoints.length >= 2) {
                        const prevWp = cf.waypoints[cf.waypoints.length - 2];
                        endHeading = Math.atan2(lastWp.x - prevWp.x, lastWp.z - prevWp.z);
                    }
                }

                // Cari rubah yang cocok di nextScene (berdasarkan id)
                let nf = nextScene.foxes.find(f => f.id === cf.id);
                if (!nf) {
                    // Rubah baru dari scene sebelumnya belum ada di nextScene -> Tambahkan ke nextScene!
                    const newWps = endPos ? [{
                        id: 'fwp_' + Date.now() + '_' + cfIdx + '_' + Math.floor(Math.random() * 1000),
                        x: endPos.x,
                        y: endPos.y,
                        z: endPos.z
                    }] : [];

                    nextScene.foxes.push({
                        id: cf.id,
                        name: cf.name,
                        species: cf.species,
                        movementMode: cf.movementMode,
                        idlePose: cf.idlePose,
                        heading: endHeading,
                        waypoints: newWps
                    });
                } else {
                    // Rubah sudah ada di nextScene.
                    // Jika di nextScene rubah ini belum memiliki jalur pergerakan (0 atau 1 titik statis),
                    // posisinya di sinkronkan tepat ke posisi terakhir langkah gerakan scene sebelumnya!
                    if (endPos && (!nf.waypoints || nf.waypoints.length <= 1)) {
                        nf.heading = endHeading;
                        nf.waypoints = [{
                            id: (nf.waypoints && nf.waypoints[0] && nf.waypoints[0].id) || ('fwp_' + Date.now() + '_' + cfIdx),
                            x: endPos.x,
                            y: endPos.y,
                            z: endPos.z
                        }];
                    }
                }
            });
        }
    },

    loadScene(idx, keepPlaying = false) {
        if (idx < 0 || idx >= this.scenes.length) return;
        if (idx !== this.activeSceneIndex) {
            this.saveCurrentSceneState();
        }
        this.syncFoxContinuityAcrossScenes();

        this.activeSceneIndex = idx;
        const sc = this.scenes[idx];

        this.duration = sc.duration !== undefined ? sc.duration : 10.0;
        this.cameraHeightOffset = sc.cameraHeightOffset !== undefined ? sc.cameraHeightOffset : 3.5;
        this.focusMode = sc.focusMode || 'character';
        this.easing = sc.easing || 'smooth';
        this.blurAmount = sc.blurAmount !== undefined ? sc.blurAmount : 6.0;
        this.isDoFActive = sc.isDoFActive !== undefined ? sc.isDoFActive : true;
        this.isLetterboxActive = sc.isLetterboxActive !== undefined ? sc.isLetterboxActive : true;
        this.isFoxEnabled = !!sc.isFoxEnabled;
        this.waypoints = JSON.parse(JSON.stringify(sc.waypoints || []));

        // Restore Multi-Fox Actors
        if (sc.foxes && Array.isArray(sc.foxes) && sc.foxes.length > 0) {
            // Bersihkan model rubah tambahan (idx > 0) dan pathGroups lama dari 3D scene
            this.foxes.forEach((f, fIdx) => {
                if (fIdx > 0 && f.model && f.model.root && scene) {
                    scene.remove(f.model.root);
                }
                if (f.pathGroup && scene) {
                    scene.remove(f.pathGroup);
                }
            });

            this.foxes = sc.foxes.map((sf, fIdx) => {
                const palette = FOX_PALETTES[fIdx % FOX_PALETTES.length];
                const fox = {
                    id: sf.id || ('fox_' + (fIdx + 1)),
                    name: sf.name || `Rubah ${fIdx + 1}`,
                    species: sf.species || 'red',
                    movementMode: sf.movementMode || 'trot',
                    idlePose: sf.idlePose || 'alert',
                    heading: sf.heading || 0,
                    waypoints: JSON.parse(JSON.stringify(sf.waypoints || [])),
                    curve: null,
                    pathGroup: null,
                    model: null,
                    color: palette.color,
                    hex: palette.hex
                };
                this.ensureFoxGroupAndModel(fox, fIdx);
                this.rebuildFoxSpline(fox);
                return fox;
            });
            this.activeFoxIndex = sc.activeFoxIndex !== undefined ? Math.min(sc.activeFoxIndex, this.foxes.length - 1) : 0;
        } else if (sc.foxWaypoints && this.foxes && this.foxes[0]) {
            // Fallback backward compatibility
            this.foxes[0].waypoints = JSON.parse(JSON.stringify(sc.foxWaypoints || []));
            if (sc.foxSpecies) this.foxes[0].species = sc.foxSpecies;
            if (sc.foxMovementMode) this.foxes[0].movementMode = sc.foxMovementMode;
            if (sc.foxIdlePose) this.foxes[0].idlePose = sc.foxIdlePose;
            if (sc.foxHeading !== undefined) this.foxes[0].heading = sc.foxHeading;
            this.rebuildFoxSpline(this.foxes[0]);
        }

        // Restore Environment (Langit, Matahari, Angin, Daun, Warna Tanah)
        if (sc.environment) {
            this.applyEnvironmentSnapshot(sc.environment);
        }

        // Rebuild Camera Spline & Fox State
        this.rebuildSpline();
        this.toggleFoxEnabled(this.isFoxEnabled);

        // Sync UI inputs
        const sliderH = document.getElementById('slider-cinematic-height');
        const valH = document.getElementById('val-cinematic-height');
        if (sliderH) sliderH.value = this.cameraHeightOffset;
        if (valH) valH.innerText = this.cameraHeightOffset.toFixed(1) + 'm';

        const sliderD = document.getElementById('slider-cinematic-duration');
        const valD = document.getElementById('val-cinematic-duration');
        if (sliderD) sliderD.value = this.duration;
        if (valD) valD.innerText = this.duration + 's';

        const selFocus = document.getElementById('select-cinematic-focus');
        if (selFocus) selFocus.value = this.focusMode;

        const selEasing = document.getElementById('select-cinematic-easing');
        if (selEasing) selEasing.value = this.easing;

        const toggleFox = document.getElementById('toggle-cinematic-fox');
        if (toggleFox) toggleFox.checked = this.isFoxEnabled;

        const toggleDoF = document.getElementById('toggle-cinematic-dof');
        if (toggleDoF) toggleDoF.checked = this.isDoFActive && this.blurAmount > 0.1;

        const selAperture = document.getElementById('select-cinematic-aperture');
        if (selAperture) {
            if (!this.isDoFActive || this.blurAmount <= 0.1) {
                selAperture.value = '0';
            } else if (this.blurAmount <= 4.0) {
                selAperture.value = '3.5';
            } else if (this.blurAmount <= 7.0) {
                selAperture.value = '6.0';
            } else {
                selAperture.value = '10.0';
            }
        }

        this.renderFoxSelectorUI();
        this.syncActiveFoxControlsUI();
        this.renderSceneTabsUI();
        this.renderWaypointUI();
        this.renderTimelineLanePips();

        if (keepPlaying || this.isPlaying) {
            if (this.pathGroup) this.pathGroup.visible = false;
            if (this.previewMarker) this.previewMarker.visible = false;
            if (this.foxes) {
                this.foxes.forEach(f => {
                    if (f && f.pathGroup) f.pathGroup.visible = false;
                });
            }
            if (this.foxPreviewMarker) this.foxPreviewMarker.visible = false;
        } else {
            this.progress = 0.0;
            this.updateTimelineUI();
        }
    },

    addNewScene() {
        if (typeof saveState === 'function') {
            saveState();
        }
        this.saveCurrentSceneState();
        this.syncFoxContinuityAcrossScenes();

        // Ambil scene sebelumnya sebagai acuan
        const prevScene = (this.scenes && this.scenes.length > 0)
            ? ((this.activeSceneIndex >= 0 && this.activeSceneIndex < this.scenes.length) ? this.scenes[this.activeSceneIndex] : this.scenes[this.scenes.length - 1])
            : null;
        const nextNum = this.scenes.length + 1;

        // Ambil seluruh aktor rubah dari scene sebelumnya
        const curFoxes = (prevScene && prevScene.foxes && prevScene.foxes.length > 0)
            ? prevScene.foxes
            : this.foxes;

        // Salin seluruh aktor rubah: jika rubah memiliki pergerakan, posisikan tepat di titik langkah terakhir gerakan scene sebelumnya
        const newFoxes = curFoxes.map((f, fIdx) => {
            let newWaypoints = [];
            let newHeading = f.heading || 0;
            if (f.waypoints && f.waypoints.length > 0) {
                const lastWp = f.waypoints[f.waypoints.length - 1];
                if (f.waypoints.length >= 2) {
                    const prevWp = f.waypoints[f.waypoints.length - 2];
                    newHeading = Math.atan2(lastWp.x - prevWp.x, lastWp.z - prevWp.z);
                }
                newWaypoints = [{
                    id: 'fwp_' + Date.now() + '_' + fIdx + '_' + Math.floor(Math.random() * 1000),
                    x: lastWp.x,
                    y: lastWp.y,
                    z: lastWp.z
                }];
            } else if (f.model && f.model.root) {
                const px = Math.round(f.model.root.position.x * 100) / 100;
                const pz = Math.round(f.model.root.position.z * 100) / 100;
                const py = Math.round(f.model.root.position.y * 100) / 100;
                newWaypoints = [{
                    id: 'fwp_' + Date.now() + '_' + fIdx + '_' + Math.floor(Math.random() * 1000),
                    x: px,
                    y: py,
                    z: pz
                }];
            }
            return {
                id: f.id,
                name: f.name,
                species: f.species,
                movementMode: f.movementMode,
                idlePose: f.idlePose,
                heading: newHeading,
                waypoints: newWaypoints
            };
        });

        const newScene = {
            id: 'scene_' + nextNum + '_' + Date.now(),
            name: `Scene ${nextNum}`,
            duration: prevScene ? prevScene.duration : this.duration,
            cameraHeightOffset: prevScene ? prevScene.cameraHeightOffset : this.cameraHeightOffset,
            focusMode: prevScene ? prevScene.focusMode : this.focusMode,
            easing: prevScene ? prevScene.easing : this.easing,
            blurAmount: prevScene ? prevScene.blurAmount : this.blurAmount,
            isDoFActive: prevScene ? prevScene.isDoFActive : this.isDoFActive,
            isLetterboxActive: prevScene ? prevScene.isLetterboxActive : this.isLetterboxActive,
            isFoxEnabled: prevScene ? prevScene.isFoxEnabled : this.isFoxEnabled,
            activeFoxIndex: prevScene ? (prevScene.activeFoxIndex || 0) : this.activeFoxIndex,
            foxes: newFoxes,
            environment: prevScene && prevScene.environment
                ? JSON.parse(JSON.stringify(prevScene.environment))
                : this.getEnvironmentSnapshot(),
            treesSnapshot: prevScene && prevScene.treesSnapshot
                ? JSON.parse(JSON.stringify(prevScene.treesSnapshot))
                : this.getTreesSnapshot(),
            waypoints: []
        };

        this.scenes.push(newScene);
        this.renderSceneTabsUI();
        this.loadScene(this.scenes.length - 1);
        this.saveCurrentSceneState();

        if (typeof PandoraToast !== 'undefined') {
            PandoraToast.show(`🎬 ${newScene.name} dibuat (Semua rubah berada di posisi langkah terakhir scene sebelumnya, kamera baru siap diatur)!`, 'success');
        }
    },

    deleteScene(idx, e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (this.scenes.length <= 1) {
            if (typeof PandoraToast !== 'undefined') {
                PandoraToast.show('Minimal harus ada 1 Scene!', 'warning');
            }
            return;
        }

        if (typeof saveState === 'function') {
            saveState();
        }

        const name = this.scenes[idx].name;
        this.scenes.splice(idx, 1);

        let targetIdx = this.activeSceneIndex;
        if (idx === this.activeSceneIndex) {
            targetIdx = Math.max(0, idx - 1);
        } else if (idx < this.activeSceneIndex) {
            targetIdx = this.activeSceneIndex - 1;
        }
        this.activeSceneIndex = -1;
        this.loadScene(targetIdx);

        if (typeof PandoraToast !== 'undefined') {
            PandoraToast.show(`🗑️ ${name} dihapus.`, 'info');
        }
    },

    renderSceneTabsUI() {
        const container = document.getElementById('cinematic-scene-tabs');
        if (!container) return;
        container.innerHTML = '';

        this.scenes.forEach((sc, idx) => {
            const tab = document.createElement('div');
            tab.className = `cinematic-scene-tab ${idx === this.activeSceneIndex ? 'active' : ''}`;
            tab.title = `Pilih ${sc.name} (Durasi: ${sc.duration}s)`;

            tab.innerHTML = `
                <span>🎬 ${sc.name}</span>
                ${this.scenes.length > 1 ? `<button type="button" class="btn-del-scene" title="Hapus ${sc.name}">✕</button>` : ''}
            `;

            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-del-scene')) return;
                if (this.isPlaying) this.pause();
                this.loadScene(idx);
            });

            const delBtn = tab.querySelector('.btn-del-scene');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    this.deleteScene(idx, e);
                });
            }

            container.appendChild(tab);
        });

        // Tombol + Scene
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn-scene-add';
        addBtn.title = 'Tambah Scene Baru (Scene ' + (this.scenes.length + 1) + ')';
        addBtn.innerHTML = `<span>+ Scene</span>`;
        addBtn.addEventListener('click', () => {
            if (this.isPlaying) this.pause();
            this.addNewScene();
        });
        container.appendChild(addBtn);
    },

    playAll() {
        if (this.scenes.length === 0) return;
        this.saveCurrentSceneState();

        // Mulai memutar bergantian dari Scene 1
        this.loadScene(0);
        if (!this.curve && this.waypoints.length === 0) {
            if (typeof PandoraToast !== 'undefined') {
                PandoraToast.show('Scene 1 belum memiliki titik kamera!', 'warning');
            }
            this.isPlayingAllScenes = false;
            return;
        }

        this.isPlayingAllScenes = true;
        this.progress = 0.0;
        this.updateTimelineUI();
        this.play();

        const btnPlayAll = document.getElementById('btn-floating-play-all');
        if (btnPlayAll) {
            btnPlayAll.classList.add('playing');
            btnPlayAll.classList.add('active');
            btnPlayAll.innerHTML = `<span>❚❚ Pause All</span>`;
        }

        if (typeof PandoraToast !== 'undefined') {
            PandoraToast.show(`Memutar bergantian Scene 1 s/d ${this.scenes.length}...`, 'info');
        }
    },

    // --- 3. SEQUENCER PLAYBACK & TIMELINE CONTROLS ---
    play() {
        if (!this.curve && this.waypoints.length === 0) {
            if (typeof PandoraToast !== 'undefined') {
                PandoraToast.show('Tambahkan minimal 1 titik kamera terlebih dahulu!', 'warning');
            }
            return;
        }

        if (!this.isPlaying) {
            // Simpan status kamera sebelum mulai playback
            this.savedCameraPos.copy(camera.position);
            this.savedControlsTarget.copy(controls.target);
            controls.enabled = false; // Matikan kontrol manual agar kamera terbang mulus
        }

        this.isPlaying = true;

        // HILANGKAN SEMUA TANDA JALUR (KAMERA & SEMUA RUBAH) & SELECTOR SAAT PLAY
        if (this.pathGroup) this.pathGroup.visible = false;
        if (this.previewMarker) this.previewMarker.visible = false;
        if (this.foxes) {
            this.foxes.forEach(f => {
                if (f && f.pathGroup) f.pathGroup.visible = false;
            });
        }
        if (this.foxPreviewMarker) this.foxPreviewMarker.visible = false;
        if (typeof brushReticleGroup !== 'undefined') brushReticleGroup.visible = false;
        if (typeof SelectionOutlineManager !== 'undefined') {
            SelectionOutlineManager.clearSelection();
            if (SelectionOutlineManager.group) SelectionOutlineManager.group.visible = false;
        }
        if (typeof studioGrid !== 'undefined' && studioGrid) studioGrid.visible = false;

        this.setLetterboxActive(this.isLetterboxActive);
        this.setDoFActive(this.isDoFActive);

        const btnPlay = document.getElementById('btn-cinematic-play');
        const btnFloatingPlay = document.getElementById('btn-floating-play');
        if (btnPlay) btnPlay.innerHTML = `<span>❚❚ Pause</span>`;
        if (btnFloatingPlay) btnFloatingPlay.innerHTML = `<span>❚❚ Pause</span>`;

        this.showFloatingTimeline(true);
    },

    pause() {
        this.isPlaying = false;
        this.isPlayingAllScenes = false;
        controls.enabled = true;

        const dofOverlay = document.getElementById('cinematic-dof-overlay');
        if (dofOverlay) {
            dofOverlay.classList.remove('active');
            dofOverlay.style.display = 'none';
        }

        document.body.classList.remove('cinematic-mode-active');

        // Tampilkan kembali penanda di editor saat pause
        if (this.pathGroup) this.pathGroup.visible = true;
        if (this.foxes && this.isFoxEnabled) {
            this.foxes.forEach(f => {
                if (f && f.pathGroup) f.pathGroup.visible = true;
            });
        }

        // Kembalikan status grid studio sesuai settingan user
        const toggleGrid = document.getElementById('toggle-studio-grid');
        if (typeof studioGrid !== 'undefined' && studioGrid && toggleGrid) {
            studioGrid.visible = toggleGrid.checked;
        }

        const btnPlay = document.getElementById('btn-cinematic-play');
        const btnFloatingPlay = document.getElementById('btn-floating-play');
        const btnFloatingPlayAll = document.getElementById('btn-floating-play-all');
        if (btnPlay) btnPlay.innerHTML = `<span>▶ Play</span>`;
        if (btnFloatingPlay) btnFloatingPlay.innerHTML = `<span>▶ Play</span>`;
        if (btnFloatingPlayAll) {
            btnFloatingPlayAll.classList.remove('playing');
            btnFloatingPlayAll.innerHTML = `<span>▶▶ Play All</span>`;
        }

        // Pastikan target pivot OrbitControls berada di jarak natural di depan kamera & di atas tanah (cegah tembus underground)
        if (typeof camera !== 'undefined' && typeof controls !== 'undefined') {
            const fwdDir = new THREE.Vector3();
            camera.getWorldDirection(fwdDir);
            controls.target.copy(camera.position).addScaledVector(fwdDir, 10.0);
            controls.target.y = Math.max(0.6, controls.target.y);
            controls.maxPolarAngle = Math.PI / 2 - 0.04;
            controls.update();
        }

        if (typeof camera !== 'undefined' && camera && camera.fov !== 45) {
            camera.fov = 45;
            camera.updateProjectionMatrix();
        }

        this.rescueEditorCamera();
    },

    stop() {
        this.isPlaying = false;
        this.isPlayingAllScenes = false;
        this.progress = 0.0;
        this.updateTimelineUI();
        controls.enabled = true;

        if (typeof camera !== 'undefined' && camera && camera.fov !== 45) {
            camera.fov = 45;
            camera.updateProjectionMatrix();
        }

        this.setLetterboxActive(false);
        const dofOverlay = document.getElementById('cinematic-dof-overlay');
        if (dofOverlay) {
            dofOverlay.classList.remove('active');
            dofOverlay.style.display = 'none';
        }
        document.body.classList.remove('cinematic-mode-active');

        if (this.savedCameraPos && (this.savedCameraPos.x !== 0 || this.savedCameraPos.y !== 0 || this.savedCameraPos.z !== 0)) {
            camera.position.copy(this.savedCameraPos);
            controls.target.copy(this.savedControlsTarget);
            controls.update();
        } else {
            this.rescueEditorCamera();
        }

        // Tampilkan kembali penanda jalur di scene saat di editor
        if (this.pathGroup) this.pathGroup.visible = true;
        if (this.previewMarker) this.previewMarker.visible = false;
        if (this.foxes && this.isFoxEnabled) {
            this.foxes.forEach(f => {
                if (f && f.pathGroup) f.pathGroup.visible = true;
            });
        }
        if (this.foxPreviewMarker) this.foxPreviewMarker.visible = false;

        // Kembalikan status grid studio sesuai settingan user
        const toggleGrid = document.getElementById('toggle-studio-grid');
        if (typeof studioGrid !== 'undefined' && studioGrid && toggleGrid) {
            studioGrid.visible = toggleGrid.checked;
        }

        if (this.isFoxEnabled) {
            this.updateFoxPlayback(0, 0.016, performance.now() * 0.001, false);
        }

        const btnPlay = document.getElementById('btn-cinematic-play');
        const btnFloatingPlay = document.getElementById('btn-floating-play');
        const btnFloatingPlayAll = document.getElementById('btn-floating-play-all');
        if (btnPlay) btnPlay.innerHTML = `<span>▶ Play</span>`;
        if (btnFloatingPlay) btnFloatingPlay.innerHTML = `<span>▶ Play</span>`;
        if (btnFloatingPlayAll) {
            btnFloatingPlayAll.classList.remove('playing');
            btnFloatingPlayAll.innerHTML = `<span>▶▶ Play All</span>`;
        }
    },

    togglePlay() {
        this.isPlayingAllScenes = false;
        const btnFloatingPlayAll = document.getElementById('btn-floating-play-all');
        if (btnFloatingPlayAll) {
            btnFloatingPlayAll.classList.remove('playing');
            btnFloatingPlayAll.innerHTML = `<span>▶▶ Play All</span>`;
        }
        if (this.isPlaying) this.pause();
        else this.play();
    },

    seek(newProgress) {
        this.progress = THREE.MathUtils.clamp(newProgress, 0.0, 1.0);
        const currentTimeSeconds = this.progress * this.duration;
        if (this.isFoxEnabled) {
            this.updateFoxPlayback(currentTimeSeconds, 0.016, performance.now() * 0.001, this.isPlaying);
        }
        if (this.curve || this.waypoints.length === 1) {
            this.applyProgressToCamera(this.progress);
        }
        this.updateTimelineUI();
    },

    // Terapkan kalkulasi easing matematis
    getEasedProgress(t) {
        if (this.easing === 'smooth') {
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        } else if (this.easing === 'dramatic') {
            return Math.sin((t * Math.PI) / 2);
        }
        return t; // Linear
    },

    rescueEditorCamera() {
        if (typeof camera === 'undefined' || typeof controls === 'undefined') return;
        if (isNaN(camera.position.x) || camera.position.y < 0.6 || camera.position.length() > 250) {
            camera.position.set(0, 14, 28);
            controls.target.set(0, 1.2, 0);
            controls.maxPolarAngle = Math.PI / 2 - 0.04;
            controls.update();
        }
    },

    // --- 4. CAMERA MOVEMENT & FOCUS TARGET TRACKING ---
    applyProgressToCamera(rawT) {
        if (!this.isPlaying) return;

        let camPos;
        if (this.curve) {
            const t = this.getEasedProgress(rawT);
            camPos = this.curve.getPointAt(t);
        } else if (this.waypoints.length === 1) {
            const wp = this.waypoints[0];
            camPos = new THREE.Vector3(wp.x, wp.y, wp.z);
        }

        if (!camPos || isNaN(camPos.x)) return;
        camera.position.copy(camPos);

        const t = this.curve ? this.getEasedProgress(rawT) : rawT;
        const targetPos = this.calculateFocusTarget(t);
        if (targetPos && !isNaN(targetPos.x)) {
            camera.lookAt(targetPos);
            controls.target.copy(targetPos);
            this.updateDepthOfField(targetPos);
        }

        // Interpolasi Zoom / FOV dari masing-masing Waypoint Kamera
        let targetFov = 45;
        if (this.waypoints.length === 1) {
            targetFov = this.waypoints[0].fov !== undefined ? this.waypoints[0].fov : 45;
        } else if (this.waypoints.length >= 2) {
            const total = this.waypoints.length;
            const segments = this.isLooping ? total : (total - 1);
            const globalT = THREE.MathUtils.clamp(t, 0, 1) * segments;
            const idxA = Math.floor(globalT) % total;
            const idxB = (idxA + 1) % total;
            const alpha = globalT - Math.floor(globalT);
            const fovA = this.waypoints[idxA].fov !== undefined ? this.waypoints[idxA].fov : 45;
            const fovB = this.waypoints[idxB].fov !== undefined ? this.waypoints[idxB].fov : 45;
            targetFov = fovA + (fovB - fovA) * alpha;
        }
        if (camera && Math.abs(camera.fov - targetFov) > 0.05) {
            camera.fov = targetFov;
            camera.updateProjectionMatrix();
        }
    },

    calculateFocusTarget(t) {
        const easedT = this.getEasedProgress(t);
        const camPos = this.curve ? this.curve.getPointAt(easedT) : camera.position;

        // 0. Fokus Berdasarkan Angle Tiap Titik Kamera (Interpolasi Smooth Rotasi Yaw & Pitch)
        if (this.focusMode === 'angles') {
            if (this.waypoints.length === 0) return new THREE.Vector3(0, 1.2, 0);
            if (this.waypoints.length === 1) {
                const wp = this.waypoints[0];
                const rYaw = THREE.MathUtils.degToRad(wp.yaw || 0);
                const rPitch = THREE.MathUtils.degToRad(wp.pitch || 0);
                const fwd = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(rPitch, rYaw, 0, 'YXZ'));
                return camPos.clone().add(fwd.multiplyScalar(25));
            }

            const total = this.waypoints.length;
            const segments = this.isLooping ? total : (total - 1);
            const globalT = THREE.MathUtils.clamp(t, 0, 1) * segments;
            const idxA = Math.floor(globalT) % total;
            const idxB = (idxA + 1) % total;
            const alpha = globalT - Math.floor(globalT);

            const wpA = this.waypoints[idxA];
            const wpB = this.waypoints[idxB];

            const yawA = wpA.yaw !== undefined ? wpA.yaw : 0;
            const yawB = wpB.yaw !== undefined ? wpB.yaw : 0;
            const pitchA = wpA.pitch !== undefined ? wpA.pitch : 0;
            const pitchB = wpB.pitch !== undefined ? wpB.pitch : 0;

            let diffYaw = (yawB - yawA) % 360;
            if (diffYaw > 180) diffYaw -= 360;
            if (diffYaw < -180) diffYaw += 360;
            const interpYaw = yawA + diffYaw * alpha;
            const interpPitch = pitchA + (pitchB - pitchA) * alpha;

            const radYaw = THREE.MathUtils.degToRad(interpYaw);
            const radPitch = THREE.MathUtils.degToRad(interpPitch);
            const fwd = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(radPitch, radYaw, 0, 'YXZ'));
            return camPos.clone().add(fwd.multiplyScalar(25));
        }

        // 1. Fokus Menghadap Depan Jalur (Look Ahead Tangent)
        if (this.focusMode === 'forward') {
            if (this.curve) {
                const nextT = Math.min(1.0, t + 0.02);
                return this.curve.getPointAt(nextT);
            } else if (this.waypoints.length === 1) {
                const wp = this.waypoints[0];
                const rYaw = THREE.MathUtils.degToRad(wp.yaw || 0);
                const rPitch = THREE.MathUtils.degToRad(wp.pitch || 0);
                const fwd = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(rPitch, rYaw, 0, 'YXZ'));
                return camPos.clone().add(fwd.multiplyScalar(25));
            }
        }

        // 2. Fokus ke Karakter Rubah (wolfCharacter)
        if (this.focusMode === 'character') {
            if (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
                return wolfCharacter.root.position.clone().add(new THREE.Vector3(0, 0.75, 0));
            }
        }

        // 3. Fokus ke Pohon Terpilih
        if (this.focusMode === 'tree') {
            if (typeof selectedTreeIndex !== 'undefined' && selectedTreeIndex >= 0 && treesList[selectedTreeIndex]) {
                const tObj = treesList[selectedTreeIndex];
                return tObj.position.clone().add(new THREE.Vector3(0, 2.5, 0));
            } else if (treesList.length > 0) {
                return treesList[0].position.clone().add(new THREE.Vector3(0, 2.5, 0));
            }
        }

        // 4. Fokus ke Titik Kustom
        if (this.focusMode === 'custom') {
            return this.customFocusPoint.clone();
        }

        // Default: Pusat Map (0, 1.2, 0)
        return new THREE.Vector3(0, 1.2, 0);
    },

    // --- 5. DEPTH-OF-FIELD (DoF) & BOKEH OPTICAL SIMULATION ---
    updateDepthOfField(targetPos) {
        const dofOverlay = document.getElementById('cinematic-dof-overlay');
        if (!dofOverlay) return;

        if (!this.isDoFActive || !this.isPlaying || this.blurAmount <= 0.1) {
            dofOverlay.classList.remove('active');
            dofOverlay.style.display = 'none';
            return;
        }

        dofOverlay.style.display = 'block';
        dofOverlay.classList.add('active');

        const screenPos = targetPos.clone().project(camera);
        const screenX = ((screenPos.x + 1) / 2) * 100;
        const screenY = ((-screenPos.y + 1) / 2) * 100;

        const distanceToTarget = camera.position.distanceTo(targetPos);
        const dynamicBlur = Math.min(12, Math.max(2, this.blurAmount * (1 + distanceToTarget * 0.03)));

        dofOverlay.style.setProperty('--dof-focus-x', `${screenX.toFixed(1)}%`);
        dofOverlay.style.setProperty('--dof-focus-y', `${screenY.toFixed(1)}%`);
        dofOverlay.style.setProperty('--dof-blur-amount', `${dynamicBlur.toFixed(1)}px`);
    },

    setLetterboxActive(active) {
        this.isLetterboxActive = active;
        const body = document.body;
        if (active && this.isPlaying) body.classList.add('cinematic-mode-active');
        else body.classList.remove('cinematic-mode-active');
    },

    setDoFActive(active) {
        this.isDoFActive = active;
        const dofOverlay = document.getElementById('cinematic-dof-overlay');
        if (dofOverlay) {
            if (active && this.isPlaying && this.blurAmount > 0.1) {
                dofOverlay.style.display = 'block';
                dofOverlay.classList.add('active');
            } else {
                dofOverlay.classList.remove('active');
                dofOverlay.style.display = 'none';
            }
        }
    },

    // --- 6. TICK PER FRAME DARI RENDER LOOP ---
    update(dt, elapsed) {
        if (!this.isPlaying) return;

        // Pastikan visual jalur 3D kamera, semua rubah & semua selector selalu disembunyikan saat play
        if (this.pathGroup && this.pathGroup.visible) this.pathGroup.visible = false;
        if (this.previewMarker && this.previewMarker.visible) this.previewMarker.visible = false;
        if (this.foxes) {
            this.foxes.forEach(f => {
                if (f && f.pathGroup && f.pathGroup.visible) f.pathGroup.visible = false;
            });
        }
        if (this.foxPreviewMarker && this.foxPreviewMarker.visible) this.foxPreviewMarker.visible = false;
        if (typeof brushReticleGroup !== 'undefined' && brushReticleGroup.visible) brushReticleGroup.visible = false;
        if (typeof SelectionOutlineManager !== 'undefined' && SelectionOutlineManager.group && SelectionOutlineManager.group.visible) {
            SelectionOutlineManager.group.visible = false;
        }
        if (typeof studioGrid !== 'undefined' && studioGrid && studioGrid.visible) studioGrid.visible = false;

        const step = (dt * this.playbackSpeed) / this.duration;
        this.progress += step;

        if (this.progress >= 1.0) {
            if (this.isPlayingAllScenes && this.scenes.length > 1) {
                // Play bergantian antar scene secara berurutan
                if (this.activeSceneIndex < this.scenes.length - 1) {
                    const nextIdx = this.activeSceneIndex + 1;
                    if (typeof PandoraToast !== 'undefined') {
                        PandoraToast.show(`🎬 Beralih ke ${this.scenes[nextIdx].name}...`, 'info');
                    }
                    this.loadScene(nextIdx, true);
                    this.progress = 0.0;
                } else {
                    // Akhir scene terakhir
                    if (this.isLooping) {
                        if (typeof PandoraToast !== 'undefined') {
                            PandoraToast.show(`⟳ Loop: Kembali ke ${this.scenes[0].name}...`, 'info');
                        }
                        this.loadScene(0, true);
                        this.progress = 0.0;
                    } else {
                        this.progress = 1.0;
                        this.pause();
                    }
                }
            } else {
                if (this.isLooping) {
                    this.progress = this.progress % 1.0;
                } else {
                    this.progress = 1.0;
                    this.pause();
                }
            }
        }

        const currentTimeSeconds = this.progress * this.duration;

        // 1. Update Fox Actor Movement & Kinematika untuk semua rubah mandiri
        if (this.isFoxEnabled) {
            this.updateFoxPlayback(currentTimeSeconds, dt, elapsed, true);
        }

        // 2. Update Posisi & Arah Kamera Sinematik
        if (this.curve || this.waypoints.length === 1) {
            this.applyProgressToCamera(this.progress);
        }

        this.updateTimelineUI();
    },

    updateIdleFox(dt, elapsed) {
        if (!this.isFoxEnabled || !this.foxes) return;

        this.foxes.forEach((fox, idx) => {
            if (!fox || !fox.model || !fox.model.root || !fox.model.root.visible) return;

            // Saat mengatur waypoint cuma 1, kunci posisi rubah tepat di titik #1 tersebut
            if (fox.waypoints && fox.waypoints.length === 1) {
                const wp1 = fox.waypoints[0];
                const gy = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(wp1.x, wp1.z) : wp1.y;
                fox.model.root.position.set(wp1.x, gy, wp1.z);
                fox.model.root.rotation.y = fox.heading || 0;
            }

            // Jalankan pose animasi idle (alert waspada / sit duduk / sleep tidur)
            this.applyFoxPose(fox.model, fox.idlePose || 'alert', dt, elapsed, idx * 1.5);
        });
    },

    // --- 7. UI SYNC & EVENT HANDLERS ---
    updateTimelineUI() {
        const currentTime = (this.progress * this.duration).toFixed(1);
        const totalTime = this.duration.toFixed(1);
        const timeStr = `${currentTime}s / ${totalTime}s`;

        const inspectorSlider = document.getElementById('slider-cinematic-scrubber');
        const inspectorTimecode = document.getElementById('cinematic-timecode-text');
        if (inspectorSlider) inspectorSlider.value = this.progress;
        if (inspectorTimecode) inspectorTimecode.innerText = timeStr;

        const floatingSlider = document.getElementById('floating-timeline-slider');
        const floatingTimecode = document.getElementById('floating-timeline-timecode');
        if (floatingSlider) floatingSlider.value = this.progress;
        if (floatingTimecode) floatingTimecode.innerText = timeStr;
    },

    renderWaypointUI() {
        const list = document.getElementById('cinematic-waypoints-list');
        const countBadge = document.getElementById('cinematic-waypoint-count');
        if (countBadge) countBadge.innerText = this.waypoints.length;

        if (!list) return;
        list.innerHTML = '';

        if (this.waypoints.length === 0) {
            list.innerHTML = `<div style="text-align:center; padding:12px; color:var(--text-dim); font-size:10.5px;">Belum ada titik jalur.<br>Aktifkan "Mode Gambar" &amp; klik map.</div>`;
            return;
        }

        this.waypoints.forEach((wp, idx) => {
            const item = document.createElement('div');
            item.className = 'cinematic-waypoint-item';
            item.innerHTML = `
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-family:'JetBrains Mono',monospace; color:#38bdf8; font-weight:700;">#${idx + 1}</span>
                    <span style="font-size:9.5px; opacity:0.8;">X: ${wp.x}, Y: ${wp.y}, Z: ${wp.z}</span>
                </div>
                <button type="button" class="btn-icon-only" style="width:20px; height:20px; color:#f87171;" title="Hapus Titik">✕</button>
            `;
            item.querySelector('button').onclick = (e) => {
                e.stopPropagation();
                this.removeWaypoint(idx);
            };
            item.onclick = () => {
                // Kamera melompat ke posisi pandang yang nyaman menghadap titik ini (bukan masuk ke dalam objek gizmo)
                const wpPos = new THREE.Vector3(wp.x, wp.y, wp.z);
                controls.target.copy(wpPos);
                const rYaw = THREE.MathUtils.degToRad(wp.yaw || 0);
                const backX = -Math.sin(rYaw) * 6;
                const backZ = -Math.cos(rYaw) * 6;
                camera.position.set(wp.x + backX, Math.max(1.5, wp.y + 2.5), wp.z + backZ);
                controls.maxPolarAngle = Math.PI / 2 - 0.04;
                controls.update();
                this.selectWaypoint(idx);
            };
            list.appendChild(item);
        });
    },

    toggleBottomPanel(forceState) {
        const panel = document.getElementById('cinematic-bottom-panel');
        const btnToolbar = document.getElementById('btn-toggle-cinematic-dock');
        if (!panel) return;
        const willOpen = forceState !== undefined ? forceState : !panel.classList.contains('visible');
        if (willOpen) {
            panel.classList.add('visible');
            if (btnToolbar) btnToolbar.classList.add('active');
            this.renderTimelineLanePips();
            this.rescueEditorCamera();
        } else {
            panel.classList.remove('visible');
            if (btnToolbar) btnToolbar.classList.remove('active');
            if (this.isDrawingMode) this.toggleDrawingMode(false);
            if (this.isDrawingFoxMode) this.toggleFoxDrawingMode(false);
        }
    },

    showFloatingTimeline(visible) {
        this.toggleBottomPanel(visible);
        const floatingEl = document.getElementById('cinematic-floating-timeline');
        if (floatingEl) {
            if (visible) floatingEl.classList.add('visible');
            else floatingEl.classList.remove('visible');
        }
    },

    toggleDrawingMode(forcedState) {
        this.isDrawingMode = forcedState !== undefined ? forcedState : !this.isDrawingMode;

        if (this.isDrawingMode && this.isDrawingFoxMode) {
            this.toggleFoxDrawingMode(false);
        }

        const btnDraw = document.getElementById('btn-cinematic-draw');
        const btnBottomDraw = document.getElementById('btn-bottom-camera-draw');
        if (btnDraw) btnDraw.classList.toggle('active', this.isDrawingMode);
        if (btnBottomDraw) btnBottomDraw.classList.toggle('active', this.isDrawingMode);

        const bannerText = document.getElementById('mode-banner-text');
        const activeBanner = document.getElementById('active-mode-banner');

        if (this.isDrawingMode) {
            if (activeBanner && bannerText) {
                bannerText.innerText = 'Mode Gambar Jalur Kamera (Klik arena untuk tambah titik)';
                activeBanner.style.display = 'inline-flex';
            }
            if (typeof PandoraToast !== 'undefined') {
                PandoraToast.show('Mode Gambar Kamera Aktif: Klik tanah di arena untuk menambah titik!', 'info');
            }
        } else {
            if (activeBanner && !this.isDrawingFoxMode) activeBanner.style.display = 'none';
            if (this.previewMarker) this.previewMarker.visible = false;
        }
    },

    bindEvents() {
        // 0. Toggle Bottom Sequencer Dock
        const btnToggleDock = document.getElementById('btn-toggle-cinematic-dock');
        if (btnToggleDock) {
            btnToggleDock.addEventListener('click', () => this.toggleBottomPanel());
        }

        const btnOpenBottom = document.getElementById('btn-open-bottom-sequencer');
        if (btnOpenBottom) {
            btnOpenBottom.addEventListener('click', () => this.toggleBottomPanel(true));
        }

        const btnExitBottom = document.getElementById('btn-floating-exit');
        if (btnExitBottom) {
            btnExitBottom.addEventListener('click', () => {
                this.stop();
                this.toggleBottomPanel(false);
            });
        }

        // 1. Tombol Camera Draw Mode (Inspector & Bottom Panel)
        const btnDraw = document.getElementById('btn-cinematic-draw');
        if (btnDraw) btnDraw.addEventListener('click', () => this.toggleDrawingMode());

        const btnBottomCamDraw = document.getElementById('btn-bottom-camera-draw');
        if (btnBottomCamDraw) btnBottomCamDraw.addEventListener('click', () => this.toggleDrawingMode());

        // 2. Tombol Clear Jalur Kamera
        const btnClear = document.getElementById('btn-cinematic-clear');
        if (btnClear) btnClear.addEventListener('click', () => this.clearAllWaypoints());

        const btnBottomCamClear = document.getElementById('btn-bottom-camera-clear');
        if (btnBottomCamClear) btnBottomCamClear.addEventListener('click', () => this.clearAllWaypoints());

        // 2B. Fox Actor Choreography Controls
        const toggleFox = document.getElementById('toggle-cinematic-fox');
        if (toggleFox) {
            toggleFox.addEventListener('change', (e) => this.toggleFoxEnabled(e.target.checked));
        }

        const selectActiveFox = document.getElementById('select-cinematic-active-fox');
        if (selectActiveFox) {
            selectActiveFox.addEventListener('change', (e) => this.selectActiveFox(parseInt(e.target.value, 10)));
        }

        const btnAddFox = document.getElementById('btn-cinematic-add-fox');
        if (btnAddFox) {
            btnAddFox.addEventListener('click', () => this.addFoxActor());
        }

        const btnDeleteFox = document.getElementById('btn-cinematic-delete-fox');
        if (btnDeleteFox) {
            btnDeleteFox.addEventListener('click', () => this.deleteFoxActor(this.activeFoxIndex));
        }

        const btnFoxDraw = document.getElementById('btn-cinematic-fox-draw');
        if (btnFoxDraw) {
            btnFoxDraw.addEventListener('click', () => this.toggleFoxDrawingMode());
        }

        const btnFoxClear = document.getElementById('btn-cinematic-fox-clear');
        if (btnFoxClear) {
            btnFoxClear.addEventListener('click', () => this.clearFoxWaypoints());
        }

        const selectFoxSpecies = document.getElementById('select-cinematic-fox-species');
        if (selectFoxSpecies) {
            selectFoxSpecies.addEventListener('change', (e) => this.setFoxSpecies(e.target.value));
        }

        const selectFoxGait = document.getElementById('select-cinematic-fox-gait');
        if (selectFoxGait) {
            selectFoxGait.addEventListener('change', (e) => this.setFoxGait(e.target.value));
        }

        const selectFoxIdle = document.getElementById('select-cinematic-fox-idle');
        if (selectFoxIdle) {
            selectFoxIdle.addEventListener('change', (e) => this.setFoxIdlePose(e.target.value));
        }

        const btnSnapWp1 = document.getElementById('btn-fox-snap-wp1');
        if (btnSnapWp1) {
            btnSnapWp1.addEventListener('click', () => this.snapFoxToWaypoint1());
        }

        const btnRotateHeading = document.getElementById('btn-fox-rotate-heading');
        if (btnRotateHeading) {
            btnRotateHeading.addEventListener('click', () => this.rotateFoxHeading());
        }

        // 3. Slider Ketinggian Kamera
        const sliderH = document.getElementById('slider-cinematic-height');
        const valH = document.getElementById('val-cinematic-height');
        if (sliderH) {
            sliderH.addEventListener('input', (e) => {
                this.cameraHeightOffset = parseFloat(e.target.value);
                if (valH) valH.innerText = this.cameraHeightOffset.toFixed(1) + 'm';
            });
        }

        // 4. Slider Durasi
        const sliderD = document.getElementById('slider-cinematic-duration');
        const valD = document.getElementById('val-cinematic-duration');
        if (sliderD) {
            sliderD.addEventListener('input', (e) => {
                this.duration = parseFloat(e.target.value);
                if (valD) valD.innerText = this.duration + 's';
                this.updateTimelineUI();
            });
        }

        // 5. Scrubber Timeline (Inspector & Bottom Dock)
        const scrubber = document.getElementById('slider-cinematic-scrubber');
        if (scrubber) {
            scrubber.addEventListener('input', (e) => {
                this.seek(parseFloat(e.target.value));
            });
        }
        const floatingScrubber = document.getElementById('floating-timeline-slider');
        if (floatingScrubber) {
            floatingScrubber.addEventListener('input', (e) => {
                this.seek(parseFloat(e.target.value));
            });
        }

        // 6. Play / Pause
        const btnPlay = document.getElementById('btn-cinematic-play');
        if (btnPlay) btnPlay.addEventListener('click', () => this.togglePlay());
        const btnFloatingPlay = document.getElementById('btn-floating-play');
        if (btnFloatingPlay) btnFloatingPlay.addEventListener('click', () => this.togglePlay());

        const btnFloatingPlayAll = document.getElementById('btn-floating-play-all');
        if (btnFloatingPlayAll) {
            btnFloatingPlayAll.addEventListener('click', () => {
                if (this.isPlaying && this.isPlayingAllScenes) {
                    this.pause();
                } else {
                    this.playAll();
                }
            });
        }

        // 7. Stop / Reset
        const btnStop = document.getElementById('btn-cinematic-stop');
        if (btnStop) btnStop.addEventListener('click', () => this.stop());
        const btnFloatingStop = document.getElementById('btn-floating-stop');
        if (btnFloatingStop) btnFloatingStop.addEventListener('click', () => this.stop());

        // 8. Toggle Loop
        const btnLoop = document.getElementById('btn-cinematic-loop');
        const btnFloatingLoop = document.getElementById('btn-floating-loop');
        const toggleLoopHandler = () => {
            this.isLooping = !this.isLooping;
            if (btnLoop) btnLoop.classList.toggle('active', this.isLooping);
            if (btnFloatingLoop) btnFloatingLoop.classList.toggle('active', this.isLooping);
            this.rebuildSpline();
        };
        if (btnLoop) btnLoop.addEventListener('click', toggleLoopHandler);
        if (btnFloatingLoop) btnFloatingLoop.addEventListener('click', toggleLoopHandler);

        // 8B. Playback Speed & Easing Curve Selectors
        const selectSpeed = document.getElementById('select-cinematic-speed');
        if (selectSpeed) {
            selectSpeed.addEventListener('change', (e) => {
                this.playbackSpeed = parseFloat(e.target.value);
            });
        }

        const selectEasing = document.getElementById('select-cinematic-easing');
        if (selectEasing) {
            selectEasing.addEventListener('change', (e) => {
                this.easing = e.target.value;
            });
        }

        // 9. Presets
        document.querySelectorAll('.btn-cinematic-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = btn.dataset.preset;
                if (p) this.applyPreset(p);
            });
        });

        const selectPreset = document.getElementById('select-cinematic-preset');
        if (selectPreset) {
            selectPreset.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.applyPreset(e.target.value);
                    e.target.value = '';
                }
            });
        }

        // 10. Focus Target
        const selectFocus = document.getElementById('select-cinematic-focus');
        const floatingFocusBadge = document.getElementById('floating-focus-badge');
        if (selectFocus) {
            selectFocus.addEventListener('change', (e) => {
                this.focusMode = e.target.value;
                if (floatingFocusBadge) {
                    const txt = selectFocus.options[selectFocus.selectedIndex].text;
                    floatingFocusBadge.innerText = 'Fokus: ' + (txt.includes(' ') ? txt.split(' ')[1] : txt);
                }
            });
        }

        // 11. DoF Blur Toggle & Aperture
        const toggleDoF = document.getElementById('toggle-cinematic-dof');
        if (toggleDoF) {
            toggleDoF.addEventListener('change', (e) => {
                this.setDoFActive(e.target.checked);
            });
        }
        const selectAperture = document.getElementById('select-cinematic-aperture');
        const valBlur = document.getElementById('val-cinematic-blur');
        if (selectAperture) {
            selectAperture.addEventListener('change', (e) => {
                this.blurAmount = parseFloat(e.target.value);
                if (this.blurAmount <= 0.1) {
                    this.setDoFActive(false);
                } else {
                    this.setDoFActive(true);
                    if (toggleDoF) toggleDoF.checked = true;
                }
                if (valBlur) {
                    valBlur.innerText = selectAperture.options[selectAperture.selectedIndex].text.split(' ')[0];
                }
                this.saveCurrentSceneState();
            });
        }

        // 12. Letterbox Toggle
        const toggleLetterbox = document.getElementById('toggle-cinematic-letterbox');
        if (toggleLetterbox) {
            toggleLetterbox.addEventListener('change', (e) => {
                this.setLetterboxActive(e.target.checked);
            });
        }

        // 12B. Waypoint Camera Angle, Height & Zoom (FOV) Controls
        const sliderHeight = document.getElementById('slider-wp-height');
        if (sliderHeight) {
            sliderHeight.addEventListener('input', (e) => {
                this.setWaypointHeight(parseFloat(e.target.value));
            });
            sliderHeight.addEventListener('change', () => {
                if (typeof saveState === 'function') saveState();
            });
        }
        const sliderYaw = document.getElementById('slider-wp-yaw');
        if (sliderYaw) {
            sliderYaw.addEventListener('input', (e) => {
                this.setWaypointAngle(parseFloat(e.target.value), null);
            });
            sliderYaw.addEventListener('change', () => {
                if (typeof saveState === 'function') saveState();
            });
        }
        const sliderPitch = document.getElementById('slider-wp-pitch');
        if (sliderPitch) {
            sliderPitch.addEventListener('input', (e) => {
                this.setWaypointAngle(null, parseFloat(e.target.value));
            });
            sliderPitch.addEventListener('change', () => {
                if (typeof saveState === 'function') saveState();
            });
        }
        const sliderFov = document.getElementById('slider-wp-fov');
        if (sliderFov) {
            sliderFov.addEventListener('input', (e) => {
                this.setWaypointFov(parseFloat(e.target.value));
            });
            sliderFov.addEventListener('change', () => {
                if (typeof saveState === 'function') saveState();
            });
        }
        const btnDragSelectedWp = document.getElementById('btn-drag-selected-wp');
        if (btnDragSelectedWp) {
            btnDragSelectedWp.addEventListener('click', () => {
                this.toggleDragMode();
            });
        }
        const btnSnapView = document.getElementById('btn-snap-view-to-cam');
        if (btnSnapView) {
            btnSnapView.addEventListener('click', () => {
                this.snapCurrentWaypointToView();
            });
        }
        const btnDeleteSelectedWp = document.getElementById('btn-delete-selected-wp');
        if (btnDeleteSelectedWp) {
            btnDeleteSelectedWp.addEventListener('click', () => {
                if (this.selectedWaypointIndex >= 0 && this.selectedWaypointIndex < this.waypoints.length) {
                    this.removeWaypoint(this.selectedWaypointIndex);
                } else if (this.waypoints.length > 0) {
                    this.removeWaypoint(this.waypoints.length - 1);
                }
            });
        }

        // 13. Pointerdown: Tambah waypoint / Seleksi & Geser Kamera Waypoint / Adjust Ketinggian dengan Mouse
        window.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return; // Hanya klik kiri
            if (e.target && e.target.tagName !== 'CANVAS') return;

            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            // Jika sedang play cinematic, abaikan interaksi edit
            if (this.isPlaying) return;

            // A. Interaksi Seleksi & Drag Bebas Waypoint Kamera & Height Handle (HARUS KLIK TEPAT PADA MESH KOTAK KAMERA ATAU HANDLE TINGGI)
            if (!this.isDrawingMode && !this.isDrawingFoxMode && this.pathGroup && this.pathGroup.visible) {
                const hits = raycaster.intersectObjects(this.pathGroup.children, true);
                let hitHeightHandle = null;
                let hitCameraMesh = null;
                let hitCameraPoint = null;
                for (let hit of hits) {
                    if (hit.object && hit.object.userData) {
                        if (hit.object.userData.isHeightHandle) {
                            hitHeightHandle = hit.object;
                            break;
                        }
                        if (hit.object.userData.isCameraMesh && !hitCameraMesh) {
                            hitCameraMesh = hit.object;
                            hitCameraPoint = hit.point;
                        }
                    }
                }

                if (hitHeightHandle) {
                    const idx = hitHeightHandle.userData.waypointIndex;
                    this.selectWaypoint(idx);
                    this.startDraggingHeight(idx, e);
                    return;
                }

                if (hitCameraMesh) {
                    const idx = hitCameraMesh.userData.waypointIndex;
                    this.selectWaypoint(idx);
                    this.startDraggingWaypoint(idx, e, hitCameraPoint);
                    return;
                }
            }

            if (!this.isDrawingMode && !this.isDrawingFoxMode) return;

            const intersects = raycaster.intersectObject(ground);
            if (intersects.length > 0) {
                const pt = intersects[0].point;
                if (this.isDrawingFoxMode) {
                    this.addFoxWaypoint(pt.x, pt.z);
                    if (typeof PandoraToast !== 'undefined') {
                        PandoraToast.show(`Titik jalur rubah #${this.foxWaypoints.length} ditambahkan!`, 'info');
                    }
                } else if (this.isDrawingMode) {
                    this.addWaypoint(pt.x, pt.z);
                    if (typeof PandoraToast !== 'undefined') {
                        PandoraToast.show(`Titik jalur kamera #${this.waypoints.length} ditambahkan!`, 'info');
                    }
                }
            }
        });

        // 14. Pointermove: Menggeser Waypoint Kamera & Height Handle, Hover Cursor Feedback, & Pratinjau Marker
        window.addEventListener('pointermove', (e) => {
            // A0. Drag Ketinggian Kamera (Vertical Height Handle)
            if (this.isDraggingHeight && this.draggedHeightIndex >= 0) {
                const deltaY = (this.dragStartScreenY - e.clientY) * 0.05; // Drag ke atas menambah tinggi
                const newHeight = Math.max(0.5, Math.min(30.0, this.dragStartHeightOffset + deltaY));
                this.setWaypointHeight(newHeight);
                const sliderH = document.getElementById('slider-wp-height');
                if (sliderH) sliderH.value = newHeight.toFixed(1);
                return;
            }

            // A. Drag Kamera yang Sedang Digeser (Horizontal pada bidang Y tetap kamera, TIDAK MERUBAH KETINGGIAN)
            if (this.isDraggingWaypoint && this.draggedWaypointIndex >= 0) {
                mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                raycaster.setFromCamera(mouse, camera);

                let targetX = null;
                let targetZ = null;

                // 1. Proyeksikan ke bidang horizontal tepat pada ketinggian Y kamera
                if (this.dragPlane) {
                    const planeIntersect = new THREE.Vector3();
                    if (raycaster.ray.intersectPlane(this.dragPlane, planeIntersect)) {
                        targetX = planeIntersect.x + (this.dragOffset ? this.dragOffset.x : 0);
                        targetZ = planeIntersect.z + (this.dragOffset ? this.dragOffset.z : 0);
                    }
                }

                // 2. Fallback jika ray tidak berpotongan dengan bidang horizontal
                if (targetX === null || targetZ === null) {
                    const groundHits = raycaster.intersectObject(ground);
                    if (groundHits.length > 0) {
                        targetX = groundHits[0].point.x;
                        targetZ = groundHits[0].point.z;
                    }
                }

                if (targetX !== null && targetZ !== null) {
                    this.moveSelectedWaypointTo(targetX, targetZ);
                }
                return;
            }

            // B. Visual Feedback Hover Cursor pada Kamera Waypoint & Height Handle
            if (!this.isPlaying && !this.isDrawingMode && !this.isDrawingFoxMode && this.pathGroup && this.pathGroup.visible) {
                if (e.target && e.target.tagName === 'CANVAS') {
                    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                    raycaster.setFromCamera(mouse, camera);
                    const hits = raycaster.intersectObjects(this.pathGroup.children, true);
                    let isOverHandle = false;
                    let isOverCam = false;
                    for (let hit of hits) {
                        if (hit.object && hit.object.userData) {
                            if (hit.object.userData.isHeightHandle) {
                                isOverHandle = true;
                                break;
                            }
                            if (hit.object.userData.isCameraMesh) {
                                isOverCam = true;
                            }
                        }
                    }
                    if (isOverHandle) {
                        document.body.style.cursor = 'ns-resize';
                    } else if (isOverCam) {
                        document.body.style.cursor = 'grab';
                    } else if (document.body.style.cursor === 'grab' || document.body.style.cursor === 'ns-resize') {
                        document.body.style.cursor = '';
                    }
                }
            }

            if ((!this.isDrawingMode || !this.previewMarker) && (!this.isDrawingFoxMode || !this.foxPreviewMarker)) {
                if (this.foxPreviewMarker && this.foxPreviewMarker.visible) this.foxPreviewMarker.visible = false;
                if (this.previewMarker && this.previewMarker.visible) this.previewMarker.visible = false;
                return;
            }
            if (e.target && e.target.tagName !== 'CANVAS') return;

            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(ground);

            if (intersects.length > 0) {
                const pt = intersects[0].point;
                const groundY = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(pt.x, pt.z) : 0;

                if (this.isDrawingFoxMode && this.foxPreviewMarker) {
                    this.foxPreviewMarker.position.set(pt.x, groundY + 0.15, pt.z);
                    this.foxPreviewMarker.visible = true;
                } else if (this.foxPreviewMarker) {
                    this.foxPreviewMarker.visible = false;
                }

                if (this.isDrawingMode && this.previewMarker) {
                    this.previewMarker.position.set(pt.x, groundY + this.cameraHeightOffset, pt.z);
                    this.previewMarker.visible = true;
                } else if (this.previewMarker) {
                    this.previewMarker.visible = false;
                }
            } else {
                if (this.previewMarker) this.previewMarker.visible = false;
                if (this.foxPreviewMarker) this.foxPreviewMarker.visible = false;
            }
        });

        // 14B. Pointerup: Selesai dragging kamera waypoint atau height handle
        window.addEventListener('pointerup', () => {
            if (this.isDraggingHeight) {
                this.stopDraggingHeight();
            }
            if (this.isDraggingWaypoint) {
                this.stopDraggingWaypoint();
            }
        });

        // 15. Shortcuts Keyboard
        window.addEventListener('keydown', (e) => {
            const activeTag = document.activeElement ? document.activeElement.tagName : '';
            const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

            if (e.key === 'Escape' || e.key === 'Esc') {
                if (this.isDraggingHeight) {
                    this.stopDraggingHeight();
                }
                if (this.isDragModeActive) {
                    this.toggleDragMode(false);
                }
                if (this.isDraggingWaypoint) {
                    this.stopDraggingWaypoint();
                }
                if (this.isDrawingFoxMode) {
                    this.toggleFoxDrawingMode(false);
                }
                if (this.isDrawingMode) {
                    this.toggleDrawingMode(false);
                }
                if (this.foxPreviewMarker) this.foxPreviewMarker.visible = false;
                if (this.previewMarker) this.previewMarker.visible = false;
                if (typeof brushReticleGroup !== 'undefined') brushReticleGroup.visible = false;
                if (this.isPlaying) {
                    this.stop();
                }
            }

            // 'c' / 'C' untuk toggle bottom cinematic panel
            if ((e.key === 'c' || e.key === 'C') && !isTyping && typeof isPlayMode !== 'undefined' && !isPlayMode) {
                e.preventDefault();
                this.toggleBottomPanel();
            }

            // Spacebar untuk play/pause saat bottom panel terbuka & bukan Play Demo
            const bottomPanel = document.getElementById('cinematic-bottom-panel');
            const isBottomOpen = bottomPanel && bottomPanel.classList.contains('visible');
            if (e.key === ' ' && isBottomOpen && !isTyping && typeof isPlayMode !== 'undefined' && !isPlayMode) {
                e.preventDefault();
                this.togglePlay();
            }

            // Tombol Delete / Backspace untuk menghapus titik kamera terpilih saat di editor
            if ((e.key === 'Delete' || e.key === 'Del') && !isTyping && typeof isPlayMode !== 'undefined' && !isPlayMode && !this.isPlaying) {
                if (this.selectedWaypointIndex >= 0 && this.selectedWaypointIndex < this.waypoints.length) {
                    e.preventDefault();
                    this.removeWaypoint(this.selectedWaypointIndex);
                }
            }
        });
    }
};

// Inisialisasi otomatis setelah dokumen siap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CinematicManager.init());
} else {
    CinematicManager.init();
}
