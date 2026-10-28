/* ===================================================================
   PANDORA 3D GLB ASSET IMPORTER & BLENDER-STYLE DESKTOP INSPECTOR
   Features:
   - Desktop DCC aesthetic (Blender Outliner, Property panels, matte theme)
   - Asset Duplication (Shift+D) with Blender .001 numbering
   - Draggable horizontal number scrubbers on XYZ, Rotation, and Scale
   - Unconstrained Y height (bisa menembus canvas/tanah ke nilai minus)
   - 3D Viewport TransformControls Gizmo (Translate, Rotate, Scale)
   - Dynamic Auto-Collision physics for character play mode
   - Viewport drag & drop and 3D direct-click selection
   =================================================================== */

class GLBImporterManager {
    constructor() {
        this.importedObjectsList = [];
        window.importedObjectsList = this.importedObjectsList;
        this.containerGroup = new THREE.Group();
        this.containerGroup.name = 'GLBImportedObjectsContainer';
        this.selectedIndex = -1;
        this.isInitialized = false;
        this.gltfLoader = null;
        this.transformControl = null;
        this.currentGizmoMode = 'translate';
        this.isDraggingGizmo = false;
        this.raycaster = new THREE.Raycaster();
        this.mousePos = new THREE.Vector2();
    }

    init() {
        if (this.isInitialized) return;
        if (typeof scene === 'undefined' || typeof camera === 'undefined' || typeof renderer === 'undefined') return;

        if (!this.containerGroup.parent) {
            scene.add(this.containerGroup);
        }

        this.gltfLoader = this.setupGLTFLoader();

        // Initialize Three.js TransformControls Gizmo for 3D Viewport
        if (typeof THREE.TransformControls !== 'undefined') {
            this.transformControl = new THREE.TransformControls(camera, renderer.domElement);
            this.transformControl.size = 0.85;
            this.transformControl.setMode(this.currentGizmoMode);

            this.transformControl.addEventListener('dragging-changed', (event) => {
                this.isDraggingGizmo = event.value;
                if (typeof controls !== 'undefined') {
                    controls.enabled = !event.value;
                }
            });

            this.transformControl.addEventListener('change', () => {
                if (this.selectedIndex >= 0 && this.importedObjectsList[this.selectedIndex]) {
                    this.syncUIFromTransform(this.selectedIndex);
                }
            });

            scene.add(this.transformControl);
        }

        this.bindEvents();
        this.renderUI();
        this.isInitialized = true;
    }

    bindEvents() {
        // 1. File Input Picker
        const fileInput = document.getElementById('input-import-glb');
        if (fileInput) {
            fileInput.onchange = (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    this.importFile(e.target.files[0]);
                    fileInput.value = '';
                }
            };
        }

        // 2. Drag & Drop onto 3D Viewport Container
        const viewport = document.getElementById('viewport-container') || document.body;
        if (viewport) {
            viewport.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            });

            viewport.addEventListener('drop', (e) => {
                e.preventDefault();
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    const file = e.dataTransfer.files[0];
                    const ext = file.name.split('.').pop().toLowerCase();
                    if (ext === 'glb' || ext === 'gltf') {
                        this.importFile(file);
                    }
                }
            });

            // 3. Click to Select Asset directly in 3D Viewport
            viewport.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return; // Klik kiri saja
                if (typeof isPlayMode !== 'undefined' && isPlayMode) return;
                if (this.isDraggingGizmo) return;

                // Jangan intercept jika kuas terrain/pohon sedang aktif
                const isAnyBrushActive = (
                    (typeof selectTerrainMode !== 'undefined' && selectTerrainMode.value !== 'none') ||
                    (typeof selectRoadBrush !== 'undefined' && selectRoadBrush.value !== 'none') ||
                    (typeof selectTreeMode !== 'undefined' && selectTreeMode.value !== 'none')
                );
                if (isAnyBrushActive) return;

                const rect = renderer.domElement.getBoundingClientRect();
                this.mousePos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                this.mousePos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

                this.raycaster.setFromCamera(this.mousePos, camera);
                const intersects = this.raycaster.intersectObjects(this.containerGroup.children, true);

                if (intersects.length > 0) {
                    const hit = intersects[0].object;
                    const hitIdx = this.findAssetIndexFromChild(hit);
                    if (hitIdx !== -1) {
                        this.selectObject(hitIdx);
                    }
                }
            });
        }

        // 4. Desktop Blender-style Hotkeys
        window.addEventListener('keydown', (e) => {
            if (typeof isPlayMode !== 'undefined' && isPlayMode) return;
            const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            // Shift + D: Duplicate selected asset (Blender standard)
            if ((e.key === 'd' || e.key === 'D') && e.shiftKey) {
                if (this.selectedIndex >= 0) {
                    e.preventDefault();
                    this.duplicateObject(this.selectedIndex);
                }
                return;
            }

            if (this.selectedIndex < 0) return;

            // Transform mode shortcuts: G/W for Move, R/E for Rotate, S for Scale
            if (e.key === 'g' || e.key === 'G' || e.key === 'w' || e.key === 'W') {
                this.setGizmoMode('translate');
            } else if (e.key === 'r' || e.key === 'R' || e.key === 'e' || e.key === 'E') {
                this.setGizmoMode('rotate');
            } else if (e.key === 's' || e.key === 'S') {
                this.setGizmoMode('scale');
            } else if (e.key === 'f' || e.key === 'F') {
                this.focusObject(this.selectedIndex);
            } else if (e.key === 'Delete' || e.key === 'x' || e.key === 'X') {
                this.deleteObject(this.selectedIndex);
            } else if (e.key === 'Escape') {
                this.selectObject(-1);
            }
        });
    }

    findAssetIndexFromChild(childObj) {
        let current = childObj;
        while (current && current.parent && current.parent !== this.containerGroup) {
            current = current.parent;
        }
        for (let i = 0; i < this.importedObjectsList.length; i++) {
            if (this.importedObjectsList[i].root === current) return i;
        }
        return -1;
    }

    setupGLTFLoader() {
        if (typeof THREE.GLTFLoader === 'undefined') return null;
        const loader = new THREE.GLTFLoader();
        if (typeof THREE.DRACOLoader !== 'undefined') {
            const dracoLoader = new THREE.DRACOLoader();
            dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.4.3/');
            loader.setDRACOLoader(dracoLoader);
            this.dracoLoader = dracoLoader;
        }
        return loader;
    }

    importFile(file) {
        if (!file) return;

        if (!this.gltfLoader) {
            this.gltfLoader = this.setupGLTFLoader();
            if (!this.gltfLoader) {
                alert('THREE.GLTFLoader belum terpasang di runtime.');
                return;
            }
        } else if (!this.dracoLoader && typeof THREE.DRACOLoader !== 'undefined') {
            const dracoLoader = new THREE.DRACOLoader();
            dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.4.3/');
            this.gltfLoader.setDRACOLoader(dracoLoader);
            this.dracoLoader = dracoLoader;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const arrayBuffer = e.target.result;
            this.gltfLoader.parse(
                arrayBuffer,
                '',
                (gltf) => {
                    this.handleLoadedGLTF(gltf, file.name);
                },
                (error) => {
                    console.error('[GLBImporter] Gagal mem-parse file GLB:', error);
                    alert('Gagal memproses file 3D GLB. Pastikan file valid.');
                }
            );
        };
        reader.readAsArrayBuffer(file);
    }

    handleLoadedGLTF(gltf, fileName) {
        const model = gltf.scene;
        if (!model) return;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    child.material.side = THREE.DoubleSide;
                }
            }
        });

        const rootGroup = new THREE.Group();
        const cleanName = fileName.replace(/\.[^/.]+$/, "");
        rootGroup.name = `GLB_${cleanName}_${Date.now()}`;

        // Compute Bounding Box & Center Pivot at bottom
        const bbox = new THREE.Box3().setFromObject(model);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());

        // Center model so bottom rests on Y=0
        model.position.set(-center.x, -bbox.min.y, -center.z);
        rootGroup.add(model);

        // Auto-scale normalized
        const maxDim = Math.max(size.x, size.y, size.z);
        let defaultScale = 1.0;
        if (maxDim > 8.0) {
            defaultScale = 3.5 / maxDim;
        } else if (maxDim < 0.25) {
            defaultScale = 1.2 / maxDim;
        }
        rootGroup.scale.setScalar(defaultScale);

        // Position at Camera Focus Point on terrain
        const targetX = (typeof controls !== 'undefined' && controls.target) ? controls.target.x : 0;
        const targetZ = (typeof controls !== 'undefined' && controls.target) ? controls.target.z : 0;
        const groundY = (typeof getTerrainHeightFast === 'function') ? getTerrainHeightFast(targetX, targetZ) : 0;
        rootGroup.position.set(targetX, groundY, targetZ);

        this.containerGroup.add(rootGroup);

        const colRadius = Math.max(size.x, size.z) * defaultScale * 0.55;
        const colHeight = size.y * defaultScale;

        let mixer = null;
        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            gltf.animations.forEach((clip) => {
                mixer.clipAction(clip).play();
            });
        }

        const assetRecord = {
            id: `glb_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            name: cleanName,
            root: rootGroup,
            model: model,
            baseSize: { x: size.x, y: size.y, z: size.z },
            scale: defaultScale,
            rotY: 0,
            hasCollision: true,
            collisionRadius: Math.max(0.35, colRadius),
            collisionHeight: Math.max(0.6, colHeight),
            gltfAnimations: gltf.animations || [],
            mixer: mixer
        };

        this.importedObjectsList.push(assetRecord);
        window.importedObjectsList = this.importedObjectsList;
        this.selectObject(this.importedObjectsList.length - 1);
    }

    /* ===================================================================
       DUPLICATION FEATURE (Blender Shift+D)
       Clones hierarchy, deep clones materials, keeps collision settings,
       increments name (e.g. tree.001), offsets position, and auto-selects.
       =================================================================== */
    duplicateObject(idx) {
        if (idx < 0 || idx >= this.importedObjectsList.length) return null;
        const source = this.importedObjectsList[idx];
        if (!source || !source.root || !source.model) return null;

        // 1. Deep clone the model hierarchy
        const clonedModel = source.model.clone(true);
        clonedModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(m => m.clone());
                    } else {
                        child.material = child.material.clone();
                    }
                    child.material.side = THREE.DoubleSide;
                }
            }
        });

        // 2. Compute Blender-style increment name: "Model.001", "Model.002", etc.
        const baseName = source.name.replace(/\.\d{3}$/, '');
        let maxIdx = 0;
        this.importedObjectsList.forEach(item => {
            if (item.name.startsWith(baseName)) {
                const match = item.name.match(/\.(\d{3})$/);
                if (match) {
                    const n = parseInt(match[1], 10);
                    if (n > maxIdx) maxIdx = n;
                } else if (item.name === baseName && maxIdx === 0) {
                    maxIdx = 0;
                }
            }
        });
        const nextNum = String(maxIdx + 1).padStart(3, '0');
        const newName = `${baseName}.${nextNum}`;

        // 3. Create Root Group and position slightly offset (+1.5m X & Z)
        const newRoot = new THREE.Group();
        newRoot.name = `GLB_${newName}_${Date.now()}`;
        newRoot.add(clonedModel);

        newRoot.scale.copy(source.root.scale);
        newRoot.rotation.copy(source.root.rotation);

        const offsetX = 1.5;
        const offsetZ = 1.5;
        const targetX = source.root.position.x + offsetX;
        const targetZ = source.root.position.z + offsetZ;
        // Keep source Y height (even if sub-surface / negative)
        newRoot.position.set(targetX, source.root.position.y, targetZ);

        this.containerGroup.add(newRoot);

        // 4. Clone AnimationMixer if animations exist
        let mixer = null;
        if (source.gltfAnimations && source.gltfAnimations.length > 0) {
            mixer = new THREE.AnimationMixer(clonedModel);
            source.gltfAnimations.forEach((clip) => {
                mixer.clipAction(clip).play();
            });
        }

        const newRecord = {
            id: `glb_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            name: newName,
            root: newRoot,
            model: clonedModel,
            baseSize: { ...source.baseSize },
            scale: source.scale,
            rotY: source.rotY,
            hasCollision: source.hasCollision,
            collisionRadius: source.collisionRadius,
            collisionHeight: source.collisionHeight,
            gltfAnimations: source.gltfAnimations || [],
            mixer: mixer
        };

        this.importedObjectsList.push(newRecord);
        window.importedObjectsList = this.importedObjectsList;

        // Auto-select duplicate and set to Translate mode
        const newIdx = this.importedObjectsList.length - 1;
        this.selectObject(newIdx);
        this.setGizmoMode('translate');

        return newRecord;
    }

    selectObject(idx) {
        if (idx < 0 || idx >= this.importedObjectsList.length) {
            this.selectedIndex = -1;
            if (this.transformControl) this.transformControl.detach();
            this.renderUI();
            return;
        }

        this.selectedIndex = idx;
        const item = this.importedObjectsList[idx];
        if (this.transformControl && item && item.root) {
            this.transformControl.attach(item.root);
            this.transformControl.setMode(this.currentGizmoMode);
        }
        this.renderUI();
    }

    setGizmoMode(mode) {
        this.currentGizmoMode = mode;
        if (this.transformControl) {
            this.transformControl.setMode(mode);
        }
        this.renderUI();
    }

    setPosition(idx, axis, value) {
        const item = this.importedObjectsList[idx];
        if (!item || !item.root) return;
        const numVal = parseFloat(value);
        if (isNaN(numVal)) return;

        item.root.position[axis] = numVal;
        this.syncUIFromTransform(idx);
    }

    groundToTerrain(idx) {
        const item = this.importedObjectsList[idx];
        if (!item || !item.root) return;
        const px = item.root.position.x;
        const pz = item.root.position.z;
        const gy = (typeof getTerrainHeightFast === 'function') ? getTerrainHeightFast(px, pz) : 0;
        item.root.position.y = Math.round(gy * 100) / 100;
        this.syncUIFromTransform(idx);
    }

    focusObject(idx) {
        const item = this.importedObjectsList[idx];
        if (!item || !item.root) return;
        if (typeof controls !== 'undefined' && controls.target) {
            controls.target.copy(item.root.position);
            if (typeof camera !== 'undefined') {
                const offset = new THREE.Vector3(3.5, 2.5, 3.5);
                camera.position.copy(item.root.position).add(offset);
                camera.lookAt(item.root.position);
            }
        }
    }

    setCollision(idx, enabled) {
        if (!this.importedObjectsList[idx]) return;
        this.importedObjectsList[idx].hasCollision = enabled;
        this.renderUI();
    }

    setScale(idx, scaleVal) {
        const item = this.importedObjectsList[idx];
        if (!item) return;
        scaleVal = Math.max(0.02, scaleVal);
        item.scale = scaleVal;
        item.root.scale.setScalar(scaleVal);
        item.collisionRadius = Math.max(0.35, Math.max(item.baseSize.x, item.baseSize.z) * scaleVal * 0.55);
        item.collisionHeight = Math.max(0.6, item.baseSize.y * scaleVal);
        this.syncUIFromTransform(idx);
    }

    setRotationY(idx, rotDeg) {
        const item = this.importedObjectsList[idx];
        if (!item) return;
        item.rotY = rotDeg;
        item.root.rotation.y = THREE.MathUtils.degToRad(rotDeg);
        this.syncUIFromTransform(idx);
    }

    deleteObject(idx) {
        const item = this.importedObjectsList[idx];
        if (!item) return;

        if (this.transformControl && this.selectedIndex === idx) {
            this.transformControl.detach();
        }

        if (item.root && item.root.parent) {
            item.root.parent.remove(item.root);
        }

        if (item.model) {
            item.model.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                        else child.material.dispose();
                    }
                }
            });
        }

        this.importedObjectsList.splice(idx, 1);
        window.importedObjectsList = this.importedObjectsList;

        if (this.selectedIndex === idx) {
            this.selectedIndex = this.importedObjectsList.length - 1;
            if (this.selectedIndex >= 0) {
                this.selectObject(this.selectedIndex);
            }
        } else if (this.selectedIndex > idx) {
            this.selectedIndex--;
        }

        this.renderUI();
    }

    syncUIFromTransform(idx) {
        const item = this.importedObjectsList[idx];
        if (!item || !item.root) return;

        const px = item.root.position.x;
        const py = item.root.position.y;
        const pz = item.root.position.z;
        const scaleVal = item.root.scale.x;
        const rotYDeg = (THREE.MathUtils.radToDeg(item.root.rotation.y) % 360 + 360) % 360;

        item.scale = scaleVal;
        item.rotY = rotYDeg;
        item.collisionRadius = Math.max(0.35, Math.max(item.baseSize.x, item.baseSize.z) * scaleVal * 0.55);
        item.collisionHeight = Math.max(0.6, item.baseSize.y * scaleVal);

        const inX = document.getElementById(`in-glb-x-${idx}`);
        const inY = document.getElementById(`in-glb-y-${idx}`);
        const inZ = document.getElementById(`in-glb-z-${idx}`);
        const inRot = document.getElementById(`in-glb-rot-${idx}`);
        const inScale = document.getElementById(`in-glb-scale-${idx}`);

        if (inX && document.activeElement !== inX) inX.value = px.toFixed(2);
        if (inY && document.activeElement !== inY) inY.value = py.toFixed(2);
        if (inZ && document.activeElement !== inZ) inZ.value = pz.toFixed(2);
        if (inRot && document.activeElement !== inRot) inRot.value = Math.round(rotYDeg) + '°';
        if (inScale && document.activeElement !== inScale) inScale.value = scaleVal.toFixed(2);
    }

    /* ===================================================================
       DESKTOP BLENDER UI RENDERING
       High-density, Outliner collection list, unified Location XYZ scrubbers,
       Blender toolbar, and interactive mouse scrub events.
       =================================================================== */
    renderUI() {
        const countBadge = document.getElementById('val-glb-count');
        if (countBadge) {
            countBadge.innerText = this.importedObjectsList.length;
        }

        const container = document.getElementById('glb-objects-container');
        if (!container) return;

        let html = '<div class="blender-root">';

        // 1. Top Blender Toolbar
        html += `
            <div class="blender-toolbar">
                <button type="button" class="blender-btn blender-btn-primary" id="blender-btn-import" title="Import file 3D (.glb / .gltf)">
                    + Import GLB
                </button>
                <div style="width:1px; height:16px; background:#333; margin:0 2px;"></div>
                <button type="button" class="blender-btn ${this.currentGizmoMode === 'translate' ? 'active' : ''}" onclick="window.glbImporterInstance.setGizmoMode('translate')" title="Translate / Geser (G / W)">
                    Move
                </button>
                <button type="button" class="blender-btn ${this.currentGizmoMode === 'rotate' ? 'active' : ''}" onclick="window.glbImporterInstance.setGizmoMode('rotate')" title="Rotate / Putar (R / E)">
                    Rot
                </button>
                <button type="button" class="blender-btn ${this.currentGizmoMode === 'scale' ? 'active' : ''}" onclick="window.glbImporterInstance.setGizmoMode('scale')" title="Scale / Ukuran (S)">
                    Scale
                </button>
                <div style="flex:1;"></div>
                ${this.selectedIndex >= 0 ? `
                    <button type="button" class="blender-btn" onclick="window.glbImporterInstance.duplicateObject(${this.selectedIndex})" title="Duplikat Objek Terpilih (Shift + D)">
                        ⎘ Dup
                    </button>
                    <button type="button" class="blender-btn" onclick="window.glbImporterInstance.groundToTerrain(${this.selectedIndex})" title="Snap ke Permukaan Tanah (Ground)">
                        ⚓
                    </button>
                    <button type="button" class="blender-btn" onclick="window.glbImporterInstance.focusObject(${this.selectedIndex})" title="Fokus Kamera ke Objek (F)">
                        📍
                    </button>
                    <button type="button" class="blender-btn blender-btn-danger" onclick="window.glbImporterInstance.deleteObject(${this.selectedIndex})" title="Hapus Objek (Del / X)">
                        ✕
                    </button>
                ` : ''}
            </div>
        `;

        // 2. Outliner Panel (Scene Collections)
        html += `
            <div class="blender-panel">
                <div class="blender-panel-header">
                    <span>Scene Collection (${this.importedObjectsList.length})</span>
                    <span style="font-size:9px; color:#888;">Outliner</span>
                </div>
                <div class="blender-outliner">
        `;

        if (this.importedObjectsList.length === 0) {
            html += `
                <div style="font-size:10.5px; color:#777; text-align:center; padding:16px 8px; line-height:1.5;">
                    Belum ada asset 3D di map.<br>
                    Klik <b>+ Import GLB</b> di atas atau Drag & Drop file ke viewport.
                </div>
            `;
        } else {
            this.importedObjectsList.forEach((item, idx) => {
                const isSelected = (idx === this.selectedIndex);
                html += `
                    <div class="blender-outliner-row ${isSelected ? 'selected' : ''}" onclick="window.glbImporterInstance.selectObject(${idx})">
                        <div class="blender-outliner-item-left">
                            <span class="blender-icon-mesh">◬</span>
                            <span style="font-weight:${isSelected ? '600' : '400'};">${item.name}</span>
                        </div>
                        <div class="blender-outliner-actions">
                            <span class="blender-pill-badge ${item.hasCollision ? 'blender-badge-solid' : 'blender-badge-ghost'}" title="Status Collision">
                                ${item.hasCollision ? 'SOLID' : 'GHOST'}
                            </span>
                            <button type="button" class="blender-btn" style="padding:1px 5px; font-size:9.5px;" onclick="event.stopPropagation(); window.glbImporterInstance.duplicateObject(${idx});" title="Duplikasi (Shift+D)">
                                ⎘
                            </button>
                            <button type="button" class="blender-btn blender-btn-danger" style="padding:1px 5px; font-size:9.5px;" onclick="event.stopPropagation(); window.glbImporterInstance.deleteObject(${idx});" title="Hapus (Del)">
                                ✕
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        html += `
                </div>
            </div>
        `;

        // 3. Properties Panel (Active Selection Transform & Collision)
        if (this.selectedIndex >= 0 && this.importedObjectsList[this.selectedIndex]) {
            const selItem = this.importedObjectsList[this.selectedIndex];
            const posX = selItem.root.position.x;
            const posY = selItem.root.position.y;
            const posZ = selItem.root.position.z;

            html += `
                <!-- Transform Properties -->
                <div class="blender-panel">
                    <div class="blender-panel-header">
                        <span>▼ Transform</span>
                        <span style="font-size:9.5px; color:#888;">${selItem.name}</span>
                    </div>
                    <div class="blender-panel-body">
                        <!-- Location XYZ -->
                        <div class="blender-property-row">
                            <span class="blender-property-label">Location</span>
                            <div class="blender-scrub-group">
                                <div class="blender-scrub-field" data-axis="x" data-idx="${this.selectedIndex}" title="Geser horizontal untuk scrub, atau klik untuk mengetik nilai X">
                                    <span class="blender-axis-tag blender-tag-x">X</span>
                                    <input type="text" class="blender-scrub-input" id="in-glb-x-${this.selectedIndex}" value="${posX.toFixed(2)}">
                                </div>
                                <div class="blender-scrub-field" data-axis="y" data-idx="${this.selectedIndex}" title="Ketinggian Y (Bisa minus untuk menembus/tenggelam ke bawah tanah)">
                                    <span class="blender-axis-tag blender-tag-y">Y</span>
                                    <input type="text" class="blender-scrub-input" id="in-glb-y-${this.selectedIndex}" value="${posY.toFixed(2)}">
                                </div>
                                <div class="blender-scrub-field" data-axis="z" data-idx="${this.selectedIndex}" title="Geser horizontal untuk scrub, atau klik untuk mengetik nilai Z">
                                    <span class="blender-axis-tag blender-tag-z">Z</span>
                                    <input type="text" class="blender-scrub-input" id="in-glb-z-${this.selectedIndex}" value="${posZ.toFixed(2)}">
                                </div>
                            </div>
                        </div>

                        <!-- Rotation Y -->
                        <div class="blender-property-row">
                            <span class="blender-property-label">Rotation</span>
                            <div class="blender-scrub-group">
                                <div class="blender-scrub-field" data-axis="rot" data-idx="${this.selectedIndex}" title="Rotasi Sudut Sumbu Y">
                                    <span class="blender-axis-tag blender-tag-rot">Y</span>
                                    <input type="text" class="blender-scrub-input" id="in-glb-rot-${this.selectedIndex}" value="${Math.round(selItem.rotY)}°">
                                </div>
                            </div>
                        </div>

                        <!-- Scale -->
                        <div class="blender-property-row">
                            <span class="blender-property-label">Scale</span>
                            <div class="blender-scrub-group">
                                <div class="blender-scrub-field" data-axis="scale" data-idx="${this.selectedIndex}" title="Faktor Skala Seragam">
                                    <span class="blender-axis-tag blender-tag-scale">S</span>
                                    <input type="text" class="blender-scrub-input" id="in-glb-scale-${this.selectedIndex}" value="${selItem.scale.toFixed(2)}">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Collision Physics Panel -->
                <div class="blender-panel">
                    <div class="blender-panel-header">
                        <span>▼ Collision / Physics</span>
                    </div>
                    <div class="blender-panel-body">
                        <div class="blender-checkbox-row">
                            <label class="blender-checkbox-label">
                                <input type="checkbox" class="blender-checkbox" ${selItem.hasCollision ? 'checked' : ''} onchange="window.glbImporterInstance.setCollision(${this.selectedIndex}, this.checked)">
                                <span>Rigid Collision Body</span>
                            </label>
                            <span class="blender-pill-badge ${selItem.hasCollision ? 'blender-badge-solid' : 'blender-badge-ghost'}">
                                ${selItem.hasCollision ? 'SOLID' : 'GHOST'}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }

        // 4. Desktop Shortcuts Hint Bar
        html += `
            <div class="blender-hint-bar">
                <span><b>Hotkeys:</b> G Move · R Rot · S Scale · Shift+D Dup · Del Hapus</span>
            </div>
        `;

        html += '</div>'; // End blender-root

        container.innerHTML = html;

        // Wire up File Import button
        const btnImport = document.getElementById('blender-btn-import');
        const fileInput = document.getElementById('input-import-glb');
        if (btnImport && fileInput) {
            btnImport.onclick = () => fileInput.click();
        }

        // Attach interactive scrubber behavior
        this.bindScrubberEvents(container);
    }

    /* ===================================================================
       BLENDER DRAGGABLE NUMBER SCRUBBER LOGIC
       Click-and-drag horizontally to scrub values with precision.
       Single click to focus and type directly.
       =================================================================== */
    bindScrubberEvents(container) {
        const fields = container.querySelectorAll('.blender-scrub-field');
        fields.forEach((field) => {
            const axis = field.dataset.axis;
            const idx = parseInt(field.dataset.idx, 10);
            const input = field.querySelector('.blender-scrub-input');
            if (!input) return;

            // Handle typing and commit on change/Enter
            const commitInput = () => {
                let textVal = input.value.replace(/[^0-9.-]/g, '');
                let numVal = parseFloat(textVal);
                if (isNaN(numVal)) return;

                if (axis === 'rot') {
                    numVal = ((numVal % 360) + 360) % 360;
                    this.setRotationY(idx, numVal);
                } else if (axis === 'scale') {
                    numVal = Math.max(0.02, numVal);
                    this.setScale(idx, numVal);
                } else {
                    this.setPosition(idx, axis, numVal);
                }
            };

            input.addEventListener('change', commitInput);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    commitInput();
                    input.blur();
                }
            });

            // Handle horizontal mouse drag scrubbing
            field.addEventListener('pointerdown', (e) => {
                // If input is already focused, let user edit text naturally
                if (document.activeElement === input) return;

                let isScrubbing = false;
                const startX = e.clientX;
                let startVal = parseFloat(input.value.replace(/[^0-9.-]/g, '')) || 0;

                const onPointerMove = (moveEvt) => {
                    const deltaX = moveEvt.clientX - startX;
                    if (Math.abs(deltaX) > 2) {
                        isScrubbing = true;
                        document.body.style.cursor = 'ew-resize';
                        field.classList.add('focus');

                        let step = 0.04;
                        if (axis === 'rot') step = 0.75;
                        else if (axis === 'scale') step = 0.015;

                        if (moveEvt.shiftKey) step *= 0.15; // Fine precision
                        if (moveEvt.ctrlKey) step *= 4.0;   // Fast snapping

                        let currentVal = startVal + deltaX * step;
                        if (axis === 'rot') {
                            currentVal = ((currentVal % 360) + 360) % 360;
                            this.setRotationY(idx, currentVal);
                            input.value = Math.round(currentVal) + '°';
                        } else if (axis === 'scale') {
                            currentVal = Math.max(0.02, currentVal);
                            this.setScale(idx, currentVal);
                            input.value = currentVal.toFixed(2);
                        } else {
                            this.setPosition(idx, axis, currentVal);
                            input.value = currentVal.toFixed(2);
                        }
                    }
                };

                const onPointerUp = () => {
                    window.removeEventListener('pointermove', onPointerMove);
                    window.removeEventListener('pointerup', onPointerUp);
                    document.body.style.cursor = '';
                    field.classList.remove('focus');

                    // If user only clicked without dragging, focus input for typing
                    if (!isScrubbing) {
                        input.focus();
                        input.select();
                    }
                };

                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', onPointerUp);
            });
        });
    }

    update(dt, elapsedTime) {
        if (!this.importedObjectsList || this.importedObjectsList.length === 0) return;
        for (let i = 0; i < this.importedObjectsList.length; i++) {
            const item = this.importedObjectsList[i];
            if (item && item.mixer) {
                item.mixer.update(dt);
            }
        }
    }
}

// Global instance
window.glbImporterInstance = new GLBImporterManager();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.glbImporterInstance.init());
} else {
    window.glbImporterInstance.init();
}
