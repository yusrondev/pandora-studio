/**
 * PANDORA 3D - CHARACTER ATTACHMENT & SOCKET SYSTEM
 * Sistem penyisipan dan penempelan model 3D eksternal (.GLB / .GLTF / .FBX)
 * ke tulang (Bone Socket) tiap karakter. Terintegrasi penuh antara Character Manager
 * di Hit Tool Studio (T-Pose & 3D Gizmo XYZ) dan Gameplay / Demo Mode.
 */

(function () {
    'use strict';

    function getRootPrefix() {
        if (typeof window === 'undefined') return '';
        const path = window.location.pathname;
        if (path.includes('/hit-tool.html') || path.includes('/index.html')) {
            return '';
        }
        return '';
    }

    // Cache model 3D yang telah dimuat agar hemat memori & cepat di-clone
    const _modelCache = new Map();
    let _gltfLoader = null;
    let _fbxLoader = null;
    let _meshoptPromise = null;

    function ensureMeshoptDecoder() {
        const getDecoder = () => (typeof window !== 'undefined' && window.MeshoptDecoder) || (typeof MeshoptDecoder !== 'undefined' ? MeshoptDecoder : null);
        const dec = getDecoder();
        if (dec) {
            if (dec.ready && typeof dec.ready.then === 'function') {
                return dec.ready.then(() => dec);
            }
            return Promise.resolve(dec);
        }
        if (_meshoptPromise) return _meshoptPromise;

        _meshoptPromise = new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = window.PANDORA_VENDOR_PATH ? (window.PANDORA_VENDOR_PATH + 'meshopt_decoder.js') : 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/meshopt_decoder.js';
            script.onload = () => {
                const loadedDec = getDecoder();
                if (loadedDec && loadedDec.ready && typeof loadedDec.ready.then === 'function') {
                    loadedDec.ready.then(() => resolve(loadedDec)).catch(() => resolve(loadedDec));
                } else {
                    resolve(loadedDec);
                }
            };
            script.onerror = () => {
                console.warn('[AttachmentSystem] Gagal memuat meshopt_decoder.js');
                resolve(null);
            };
            document.head.appendChild(script);
        });
        return _meshoptPromise;
    }

    // Model hasil generator AI bisa berisi jutaan segitiga dan digambar beberapa kali per frame.
    // Diperkecil saat dimuat supaya aksesori tidak menghabiskan GPU.
    const ATTACHMENT_MAX_TRIANGLES = 15000;
    const ATTACHMENT_SHADOW_MAX_TRIANGLES = 8000;

    function geometryTriangles(geometry) {
        if (!geometry) return 0;
        return (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    }

    function simplifyHeavyGeometry(mesh) {
        const simplifier = window.MeshoptSimplifier;
        const geometry = mesh.geometry;
        if (!simplifier || !simplifier.supported || !geometry || !geometry.index || geometryTriangles(geometry) <= ATTACHMENT_MAX_TRIANGLES) return;

        const position = geometry.attributes.position;
        const positions = new Float32Array(position.count * 3);
        for (let i = 0; i < position.count; i++) {
            positions[i * 3] = position.getX(i);
            positions[i * 3 + 1] = position.getY(i);
            positions[i * 3 + 2] = position.getZ(i);
        }
        const before = geometryTriangles(geometry);
        const indices = new Uint32Array(geometry.index.array);
        const [result] = simplifier.simplify(indices, positions, 3, ATTACHMENT_MAX_TRIANGLES * 3, 0.05, ['LockBorder']);
        let finalIndices = result;
        if (finalIndices.length / 3 > ATTACHMENT_MAX_TRIANGLES * 1.5 && simplifier.simplifySloppy) {
            finalIndices = simplifier.simplifySloppy(finalIndices, positions, 3, ATTACHMENT_MAX_TRIANGLES * 3, 0.2)[0];
        }
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(finalIndices), 1));
        console.log('[AttachmentSystem] Model disederhanakan: ' + before + ' -> ' + (finalIndices.length / 3) + ' segitiga');
    }

    async function getGLTFLoader() {
        if (window.MeshoptSimplifier && window.MeshoptSimplifier.ready) await window.MeshoptSimplifier.ready;
        if (!_gltfLoader && typeof THREE !== 'undefined' && THREE.GLTFLoader) {
            _gltfLoader = new THREE.GLTFLoader();
        }
        if (!_gltfLoader) return null;

        // Pasang MeshoptDecoder jika model GLB menggunakan ekstensi kompresi meshopt
        const decoder = await ensureMeshoptDecoder();
        if (decoder && typeof _gltfLoader.setMeshoptDecoder === 'function') {
            _gltfLoader.setMeshoptDecoder(decoder);
        }

        // Pasang DRACOLoader jika tersedia
        if (typeof THREE.DRACOLoader !== 'undefined' && !_gltfLoader.dracoLoader) {
            const draco = new THREE.DRACOLoader();
            draco.setDecoderPath(window.PANDORA_VENDOR_PATH ? (window.PANDORA_VENDOR_PATH + 'draco/') : 'https://www.gstatic.com/draco/versioned/decoders/1.4.3/');
            _gltfLoader.setDRACOLoader(draco);
        }

        return _gltfLoader;
    }

    function getFBXLoader() {
        if (!_fbxLoader && typeof THREE !== 'undefined' && THREE.FBXLoader) {
            _fbxLoader = new THREE.FBXLoader();
        }
        return _fbxLoader;
    }

    const PandoraAttachmentSystem = {
        // Socket Bones yang didukung untuk penempelan model 3D
        socketBones: [
            { key: 'RightArm', label: 'Lengan Atas Kanan (Right Arm) - Pauldron / Pelindung Bahu' },
            { key: 'RightForeArm', label: 'Lengan Bawah Kanan (Right ForeArm) - Bracer / Pelindung Lengan' },
            { key: 'RightShoulder', label: 'Bahu Kanan (Right Shoulder)' },
            { key: 'RightHand', label: 'Tangan Kanan (Right Hand) - Senjata Utama / Pedang / Pistol' },
            { key: 'LeftArm', label: 'Lengan Atas Kiri (Left Arm) - Pauldron / Pelindung Bahu' },
            { key: 'LeftForeArm', label: 'Lengan Bawah Kiri (Left ForeArm) - Bracer / Perisai Tangan' },
            { key: 'LeftShoulder', label: 'Bahu Kiri (Left Shoulder)' },
            { key: 'LeftHand', label: 'Tangan Kiri (Left Hand) - Perisai / Senjata Kedua' },
            { key: 'Head', label: 'Kepala (Head) - Helm / Topi / Kacamata / Tanduk' },
            { key: 'Spine2', label: 'Punggung Atas (Spine2) - Sayap / Jubah / Tas / Sarung Pedang' },
            { key: 'Spine1', label: 'Dada (Spine1) - Armor Dada / Kalung' },
            { key: 'Hips', label: 'Pinggang (Hips) - Sabuk / Sarung Pistol / Ekor' },
            { key: 'RightUpLeg', label: 'Paha Kanan (Right Leg)' },
            { key: 'LeftUpLeg', label: 'Paha Kiri (Left Leg)' },
            { key: 'RightLeg', label: 'Betis Kanan (Right Calf)' },
            { key: 'LeftLeg', label: 'Betis Kiri (Left Calf)' },
            { key: 'RightFoot', label: 'Kaki Kanan (Right Foot) - Sepatu / Efek Kaki' },
            { key: 'LeftFoot', label: 'Kaki Kiri (Left Foot) - Sepatu / Efek Kaki' }
        ],

        // Konfigurasi Tersimpan (Per Karakter)
        config: {
            version: 1,
            characters: {}
        },
        isLoaded: false,
        isLoading: false,
        _loadPromise: null,

        normalizeCharKey(rawKey) {
            if (!rawKey) return 'red';
            const s = String(rawKey).trim().toLowerCase();
            if (s === 'hero' || s === 'red-fox') return 'red';
            if (s === 'enemy-foxtree') return 'foxtree';
            return s;
        },

        /**
         * Membersihkan seluruh model cache 3D di memori RAM Three.js
         */
        clearCache() {
            _modelCache.clear();
            this.isLoaded = false;
            this._loadPromise = null;
            this.isLoading = false;
            console.log('[AttachmentSystem] Model cache & RAM 3D attachment telah dikosongkan.');
        },

        async loadConfig(forceReload = false) {
            if (this._loadPromise && !forceReload) return this._loadPromise;

            this.isLoading = true;
            this._loadPromise = (async () => {
                const prefix = getRootPrefix();
                let loadedData = null;

                // 1. Coba panggil api/attachments.php
                try {
                    const res = await fetch(prefix + 'api/attachments.php?t=' + Date.now(), { cache: 'no-store' });
                    if (res.ok) {
                        const json = await res.json();
                        if (json && typeof json === 'object') {
                            loadedData = json;
                        }
                    }
                } catch (eApi) {}

                // 2. Fallback ke config/attachments.json
                if (!loadedData) {
                    try {
                        const resFallback = await fetch(prefix + 'config/attachments.json?t=' + Date.now(), { cache: 'no-store' });
                        if (resFallback.ok) {
                            const jsonFallback = await resFallback.json();
                            if (jsonFallback && typeof jsonFallback === 'object') {
                                loadedData = jsonFallback;
                            }
                        }
                    } catch (eFallback) {}
                }

                // 3. Fallback ke localStorage
                if (!loadedData && typeof localStorage !== 'undefined') {
                    try {
                        const localStr = localStorage.getItem('pandora_attachments_config');
                        if (localStr) {
                            loadedData = JSON.parse(localStr);
                        }
                    } catch (eLocal) {}
                }

                if (loadedData) {
                    this.config.version = loadedData.version || 1;
                    this.config.characters = loadedData.characters || {};
                } else if (!this.config.characters) {
                    this.config.characters = {};
                }

                this.isLoaded = true;
                this.isLoading = false;
                return this.config;
            })();

            return this._loadPromise;
        },

        getCharacterAttachments(charKey) {
            const key = this.normalizeCharKey(charKey);
            if (!this.config.characters[key]) {
                this.config.characters[key] = [];
            }
            return this.config.characters[key];
        },

        saveCharacterAttachments(charKey, attachmentsArray) {
            const key = this.normalizeCharKey(charKey);
            // Bersihkan properti non-serializable (seperti arrayBuffer di RAM) sebelum disimpan
            const cleanArray = (Array.isArray(attachmentsArray) ? attachmentsArray : []).map(att => {
                const copy = Object.assign({}, att);
                delete copy.arrayBuffer;
                return copy;
            });
            this.config.characters[key] = cleanArray;
            return this.persistConfig();
        },

        async persistConfig() {
            // Bersihkan semua arrayBuffer dari semua karakter sebelum disimpan ke storage/server
            const cleanConfig = JSON.parse(JSON.stringify(this.config));
            if (cleanConfig.characters && typeof cleanConfig.characters === 'object') {
                Object.keys(cleanConfig.characters).forEach(cKey => {
                    if (Array.isArray(cleanConfig.characters[cKey])) {
                        cleanConfig.characters[cKey].forEach(att => {
                            if (att && typeof att === 'object') {
                                delete att.arrayBuffer;
                            }
                        });
                    }
                });
            }

            if (typeof localStorage !== 'undefined') {
                try {
                    localStorage.setItem('pandora_attachments_config', JSON.stringify(cleanConfig));
                } catch (e) {}
            }

            const prefix = getRootPrefix();
            try {
                const res = await fetch(prefix + 'api/attachments.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cleanConfig)
                });
                if (res.ok) {
                    return true;
                }
            } catch (ePost) {}
            return false;
        },

        /**
         * Upload file 3D (.glb, .gltf, .fbx) ke server via api/upload-attachment.php
         * @param {File} file
         * @returns {Promise<Object>} { success, fileUrl, fileName, fileType, fileSize }
         */
        async upload3DFile(file) {
            if (!file) throw new Error('File tidak valid.');
            const prefix = getRootPrefix();
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch(prefix + 'api/upload-attachment.php', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error || ('Upload gagal dengan HTTP status ' + res.status));
            }

            return await res.json();
        },

        /**
         * Mengambil daftar seluruh file 3D yang pernah diupload ke server (assets/attachments/)
         * @returns {Promise<Array>}
         */
        async fetchUploadedFiles() {
            const prefix = getRootPrefix();
            try {
                const res = await fetch(prefix + 'api/upload-attachment.php?t=' + Date.now(), { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.success && Array.isArray(data.files)) {
                        return data.files;
                    }
                }
            } catch (err) {
                console.warn('[AttachmentSystem] Gagal fetch uploaded files:', err);
            }
            return [];
        },

        /**
         * Menghapus file berkas 3D dari direktori project (assets/attachments/)
         * @param {string} fileUrl
         * @returns {Promise<Object>}
         */
        async deleteUploadedFile(fileUrl) {
            if (!fileUrl) throw new Error('URL file tidak valid.');
            const prefix = getRootPrefix();
            const res = await fetch(prefix + 'api/upload-attachment.php', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: fileUrl })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(data.error || ('Gagal menghapus file dengan status ' + res.status));
            }
            // Hapus dari cache Three.js jika ada
            if (_modelCache.has(fileUrl)) {
                _modelCache.delete(fileUrl);
            }
            return data;
        },

        /**
         * Parsing file 3D dari ArrayBuffer secara langsung di memori client
         * @param {ArrayBuffer} arrayBuffer
         * @param {string} fileType 'glb' | 'gltf' | 'fbx'
         * @returns {Promise<THREE.Object3D>}
         */
        async parse3DArrayBuffer(arrayBuffer, fileType) {
            const type = (fileType || 'glb').toLowerCase();
            if (type === 'glb' || type === 'gltf') {
                const loader = await getGLTFLoader();
                if (!loader) throw new Error('GLTFLoader tidak tersedia di Three.js');
                return new Promise((resolve, reject) => {
                    loader.parse(
                        arrayBuffer,
                        '',
                        (gltf) => {
                            const sceneObj = gltf.scene || gltf.scenes[0];
                            this.prepareLoaded3DObject(sceneObj);
                            resolve(sceneObj);
                        },
                        (err) => reject(err)
                    );
                });
            } else if (type === 'fbx') {
                const loader = getFBXLoader();
                if (!loader) throw new Error('FBXLoader tidak tersedia di Three.js');
                const fbxObj = loader.parse(arrayBuffer, '');
                this.prepareLoaded3DObject(fbxObj);
                return fbxObj;
            } else {
                throw new Error('Tipe file 3D tidak didukung: ' + type);
            }
        },

        /**
         * Load file 3D dari URL / path file
         * @param {string} fileUrl
         * @param {string} fileType 'glb' | 'fbx'
         * @returns {Promise<THREE.Object3D>}
         */
        // Jumlah model yang masih dimuat. Mengurai dan menyederhanakan model menghentikan frame,
        // jadi layar pemuatan stage menunggu sampai angka ini nol.
        pendingModelLoads: 0,

        load3DModelFromUrl(fileUrl, fileType) {
            this.pendingModelLoads++;
            return this.loadModelFile(fileUrl, fileType).finally(() => { this.pendingModelLoads--; });
        },

        async loadModelFile(fileUrl, fileType) {
            const cacheKey = (fileUrl || '').trim();
            if (_modelCache.has(cacheKey)) {
                const cached = _modelCache.get(cacheKey);
                return cached.clone(true);
            }

            const ext = (fileType || fileUrl.split('.').pop() || 'glb').toLowerCase();
            const prefix = getRootPrefix();
            const fullUrl = (fileUrl.startsWith('http') || fileUrl.startsWith('/')) ? fileUrl : (prefix + fileUrl);

            if (ext === 'glb' || ext === 'gltf') {
                const loader = await getGLTFLoader();
                if (!loader) throw new Error('GLTFLoader tidak tersedia');
                return new Promise((resolve, reject) => {
                    loader.load(
                        fullUrl,
                        (gltf) => {
                            const sceneObj = gltf.scene || gltf.scenes[0];
                            this.prepareLoaded3DObject(sceneObj);
                            _modelCache.set(cacheKey, sceneObj);
                            resolve(sceneObj.clone(true));
                        },
                        undefined,
                        (err) => reject(err)
                    );
                });
            } else if (ext === 'fbx') {
                const loader = getFBXLoader();
                if (!loader) throw new Error('FBXLoader tidak tersedia');
                return new Promise((resolve, reject) => {
                    loader.load(
                        fullUrl,
                        (fbxObj) => {
                            this.prepareLoaded3DObject(fbxObj);
                            _modelCache.set(cacheKey, fbxObj);
                            resolve(fbxObj.clone(true));
                        },
                        undefined,
                        (err) => reject(err)
                    );
                });
            } else {
                throw new Error('Ekstensi file tidak didukung: ' + ext);
            }
        },

        /**
         * Normalisasi properti rendering model 3D (shadows, frustum, dll)
         */
        prepareLoaded3DObject(obj) {
            if (!obj) return;
            obj.traverse((child) => {
                if (child.isMesh) {
                    simplifyHeavyGeometry(child);
                    child.castShadow = geometryTriangles(child.geometry) <= ATTACHMENT_SHADOW_MAX_TRIANGLES;
                    child.receiveShadow = true;
                    child.frustumCulled = false;
                    if (child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(m => {
                            m.side = THREE.DoubleSide;
                            if (m.map) m.map.encoding = THREE.sRGBEncoding;
                            if (m.emissive) m.emissive.set(0x000000);
                        });
                    }
                }
            });
        },

        /**
         * Membuat Mesh Wrapper 3D untuk sebuah Attachment kustom
         * @param {Object} att Data attachment dari config
         * @returns {THREE.Group}
         */
        createAttachmentMesh(att) {
            const wrapper = new THREE.Group();
            wrapper.name = 'SocketWrapper_' + (att.id || 'unnamed');
            wrapper.userData.isAttachmentSocket = true;
            wrapper.userData.attachmentId = att.id;

            // Terapkan Transform Lokal (Posisi, Rotasi Euler dlm derajat, Skala)
            const p = att.position || [0, 0, 0];
            wrapper.position.set(Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0);

            const r = att.rotation || [0, 0, 0];
            wrapper.rotation.set(
                THREE.MathUtils.degToRad(Number(r[0]) || 0),
                THREE.MathUtils.degToRad(Number(r[1]) || 0),
                THREE.MathUtils.degToRad(Number(r[2]) || 0)
            );

            const s = att.scale || [1, 1, 1];
            wrapper.scale.set(Number(s[0]) || 1, Number(s[1]) || 1, Number(s[2]) || 1);
            wrapper.visible = (att.visible !== false) && (att.enabled !== false);

            // Placeholder ringan saat model sedang dimuat — HANYA dibuat di editor T-Pose (hit-tool.html)
            // Di demo mode (index.html), jangan pernah tampilkan kubus wireframe apapun di tubuh karakter
            const isEditorMode = (typeof document !== 'undefined' &&
                document.getElementById('tab-mode-attachment') !== null);
            let placeholderMesh = null;
            let placeholderGeo = null;
            let placeholderMat = null;

            if (isEditorMode) {
                placeholderGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
                placeholderMat = new THREE.MeshBasicMaterial({
                    color: 0x38bdf8,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.45
                });
                placeholderMesh = new THREE.Mesh(placeholderGeo, placeholderMat);
                placeholderMesh.name = 'AttachmentLoadingPlaceholder';
                wrapper.add(placeholderMesh);
            }

            // Handler ketika model 3D berhasil di-load
            const onModelReady = (loadedModel) => {
                if (placeholderMesh && placeholderMesh.parent) {
                    placeholderMesh.parent.remove(placeholderMesh);
                }
                if (placeholderGeo) placeholderGeo.dispose();
                if (placeholderMat) placeholderMat.dispose();
                loadedModel.name = 'Custom3D_' + (att.name || 'Model');
                wrapper.add(loadedModel);
                wrapper.userData.visualObject = loadedModel;
                wrapper.userData.isModelLoaded = true;
                wrapper.updateMatrixWorld(true);
            };

            const onModelError = (err) => {
                console.warn('[AttachmentSystem] Gagal memuat model 3D:', att.name || att.fileUrl, err);
                if (isEditorMode && placeholderMesh) {
                    if (placeholderMesh.material) {
                        placeholderMesh.material.color.setHex(0xef4444);
                        placeholderMesh.material.opacity = 0.8;
                    }
                    placeholderMesh.visible = true;
                } else if (placeholderMesh) {
                    placeholderMesh.visible = false;
                    if (placeholderMesh.parent) placeholderMesh.parent.remove(placeholderMesh);
                }
            };

            // arrayBuffer dari JSON akan tersimpan sebagai [] (array kosong) bukan ArrayBuffer asli.
            // Hanya parse jika benar-benar merupakan ArrayBuffer yang valid.
            const hasValidBuffer = att.arrayBuffer &&
                att.arrayBuffer instanceof ArrayBuffer &&
                att.arrayBuffer.byteLength > 0;

            if (hasValidBuffer) {
                // 1. Buffer 3D sudah ada di memori (baru di-drop ke editor di sesi ini)
                this.parse3DArrayBuffer(att.arrayBuffer, att.fileType)
                    .then(onModelReady)
                    .catch(onModelError);
            } else if (att.fileUrl) {
                // 2. Muat dari URL / path file di server
                this.load3DModelFromUrl(att.fileUrl, att.fileType)
                    .then(onModelReady)
                    .catch(onModelError);
            } else {
                // Tidak ada sumber — sembunyikan placeholder
                placeholderMesh.visible = false;
            }

            return wrapper;
        },

        /**
         * Mencari tulang Mixamo / Rig pada karakter dengan resolusi nama toleran
         */
        resolveBone(characterInstance, targetKey) {
            if (!characterInstance || !targetKey) return null;
            if (window.PandoraHitboxSystem && typeof window.PandoraHitboxSystem.resolveBone === 'function') {
                const b = window.PandoraHitboxSystem.resolveBone(characterInstance, targetKey);
                if (b && b.isBone) return b;
            }

            const model = characterInstance.modelMesh || characterInstance.meshContainer || characterInstance.root;
            if (!model) return null;

            let found = null;
            const normTarget = targetKey.toLowerCase();

            // Prioritas 1: Pencocokan persis setelah menghapus prefix mixamorig: atau mixamorig_
            model.traverse(child => {
                if (found) return;
                if (child.isBone) {
                    const clean = child.name.replace(/^mixamorig[:_]?/i, '').toLowerCase();
                    if (clean === normTarget || child.name.toLowerCase() === normTarget) {
                        found = child;
                    }
                }
            });
            if (found) return found;

            // Prioritas 2: Suffix match (misal diakhiri dengan rightarm)
            model.traverse(child => {
                if (found) return;
                if (child.isBone) {
                    const clean = child.name.replace(/^mixamorig[:_]?/i, '').toLowerCase();
                    if (clean.endsWith(normTarget)) {
                        found = child;
                    }
                }
            });
            if (found) return found;

            // Prioritas 3: Termasuk kata target
            model.traverse(child => {
                if (found) return;
                if (child.isBone) {
                    const clean = child.name.replace(/^mixamorig[:_]?/i, '').toLowerCase();
                    if (clean.includes(normTarget)) {
                        found = child;
                    }
                }
            });

            return found;
        },

        /**
         * Pasang seluruh objek 3D attachment ke karakter (dipanggil saat Play / Demo Mode)
         */
        applyAttachmentsToCharacter(characterInstance, charKey) {
            if (!characterInstance) return;
            const key = this.normalizeCharKey(charKey || characterInstance.speciesKey || characterInstance.charKey);

            // Bersihkan socket attachment lama jika sudah pernah dipasang
            if (characterInstance._attachedSockets && Array.isArray(characterInstance._attachedSockets)) {
                characterInstance._attachedSockets.forEach(sock => {
                    if (sock && sock.parent) {
                        sock.parent.remove(sock);
                    }
                });
            }
            characterInstance._attachedSockets = [];

            const attachments = this.getCharacterAttachments(key);
            if (!Array.isArray(attachments) || attachments.length === 0) return;

            attachments.forEach(att => {
                if (att.enabled === false) return;
                const bone = this.resolveBone(characterInstance, att.bone || 'RightHand');
                const meshWrapper = this.createAttachmentMesh(att);
                if (bone) {
                    bone.add(meshWrapper);
                    characterInstance._attachedSockets.push(meshWrapper);
                } else if (characterInstance.root) {
                    characterInstance.root.add(meshWrapper);
                    characterInstance._attachedSockets.push(meshWrapper);
                }
            });
        }
    };

    window.PandoraAttachmentSystem = PandoraAttachmentSystem;
    // Segera jalankan pemuatan konfigurasi di background
    PandoraAttachmentSystem.loadConfig();
})();
