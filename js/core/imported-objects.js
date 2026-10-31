/* =========================================================
   OBJEK 3D IMPOR (Studio dan game hasil generate)
   Membuat objek GLB dari data stage. File modelnya ada di assets/imported/.
   ========================================================= */
const PandoraImportedObjects = {
    pending: 0,
    total: 0,
    currentName: '',
    generation: 0,
    missing: [],      // Studio: entri map lama yang filenya belum pernah tersimpan
    models: new Map(), // file -> { scene, animations }, dipakai ulang oleh objek yang sama
    group: null,
    loader: null,

    list() {
        if (!window.importedObjectsList) window.importedObjectsList = [];
        return window.importedObjectsList;
    },

    container() {
        if (window.glbImporterInstance && window.glbImporterInstance.containerGroup) return window.glbImporterInstance.containerGroup;
        if (!this.group) {
            this.group = new THREE.Group();
            this.group.name = 'ImportedObjects';
            scene.add(this.group);
        }
        return this.group;
    },

    getLoader() {
        if (this.loader) return this.loader;
        const loader = new THREE.GLTFLoader();
        if (THREE.DRACOLoader) {
            const draco = new THREE.DRACOLoader();
            draco.setDecoderPath(window.PANDORA_RUNTIME ? window.PANDORA_VENDOR_PATH + 'draco/' : 'https://www.gstatic.com/draco/versioned/decoders/1.4.3/');
            loader.setDRACOLoader(draco);
        }
        if (window.MeshoptDecoder && loader.setMeshoptDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);
        this.loader = loader;
        return loader;
    },

    loadModel(file) {
        if (!this.models.has(file)) {
            this.models.set(file, (async () => {
                if (window.MeshoptDecoder && window.MeshoptDecoder.ready) await window.MeshoptDecoder.ready;
                const buffer = window.PandoraAssetCache
                    ? await PandoraAssetCache.getAssetBuffer(file)
                    : await (await fetch(file)).arrayBuffer();
                const gltf = await new Promise((resolve, reject) => this.getLoader().parse(buffer, '', resolve, reject));
                return { scene: gltf.scene, animations: gltf.animations || [] };
            })());
        }
        return this.models.get(file);
    },

    // Rekaman objek yang dipakai fisika, AI, dan panel importer. Titik pivot di tengah bawah model.
    createRecord(model, animations, name, file) {
        const clone = model.clone(true);
        clone.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material && !Array.isArray(child.material)) child.material.side = THREE.DoubleSide;
            }
        });
        const bbox = new THREE.Box3().setFromObject(clone);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        // Relatif terhadap posisi sekarang, karena model sumber bisa sudah bergeser
        clone.position.x -= center.x;
        clone.position.y -= bbox.min.y;
        clone.position.z -= center.z;
        const root = new THREE.Group();
        root.name = `GLB_${name}_${Date.now()}`;
        root.add(clone);

        let mixer = null;
        if (animations.length > 0) {
            mixer = new THREE.AnimationMixer(clone);
            animations.forEach(clip => mixer.clipAction(clip).play());
        }
        return {
            id: `glb_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
            name, file, root,
            model: clone,
            baseSize: { x: size.x, y: size.y, z: size.z },
            scale: 1,
            rotY: 0,
            hasCollision: true,
            collisionRadius: 0.35,
            collisionHeight: 0.6,
            gltfAnimations: animations,
            mixer
        };
    },

    placeRecord(item, saved) {
        item.root.position.set(saved.posX, saved.posY, saved.posZ);
        item.root.rotation.set(saved.rotX || 0, THREE.MathUtils.degToRad(saved.rotY || 0), saved.rotZ || 0);
        item.rotY = saved.rotY || 0;
        item.scale = saved.scale || 1;
        item.root.scale.setScalar(item.scale);
        item.hasCollision = saved.hasCollision !== false;
        item.collisionRadius = Math.max(0.35, Math.max(item.baseSize.x, item.baseSize.z) * item.scale * 0.55);
        item.collisionHeight = Math.max(0.6, item.baseSize.y * item.scale);
        item._meshCollider = null;
    },

    // Dipanggil setiap data stage diterapkan. Objek yang sama hanya dipindah, tidak dimuat ulang (undo/redo).
    apply(savedList) {
        const entries = Array.isArray(savedList) ? savedList : [];
        const usable = entries.filter(saved => saved.file);
        this.missing = entries.filter(saved => !saved.file);

        const list = this.list();
        const sameObjects = list.length === usable.length && list.every((item, i) => item.file === usable[i].file && item.name === usable[i].name);
        if (sameObjects) {
            list.forEach((item, i) => this.placeRecord(item, usable[i]));
            this.refreshEditor();
            this.reportMissing();
            return;
        }

        const generation = ++this.generation;
        list.forEach(item => item.root.parent && item.root.parent.remove(item.root));
        list.length = 0;
        this.refreshEditor();
        this.reportMissing();

        this.pending = usable.length;
        this.total = usable.length;
        this.loadInOrder(usable, generation);
    },

    async loadInOrder(usable, generation) {
        for (const saved of usable) {
            if (generation !== this.generation) return;
            this.currentName = saved.name;
            // Beri kesempatan layar menggambar progres sebelum model berikutnya mengurai
            await new Promise(resolve => setTimeout(resolve, 0));
            try {
                const loaded = await this.loadModel(saved.file);
                if (generation !== this.generation) return;
                const item = this.createRecord(loaded.scene, loaded.animations, saved.name, saved.file);
                this.placeRecord(item, saved);
                this.container().add(item.root);
                this.list().push(item);
                this.refreshEditor();
            } catch (err) {
                console.error('[ImportedObjects] Gagal memuat ' + saved.file + ':', err);
            }
            if (generation === this.generation) this.pending--;
        }
    },

    refreshEditor() {
        const importer = window.glbImporterInstance;
        if (importer && importer.renderUI) {
            importer.selectedIndex = -1;
            if (importer.transformControl) importer.transformControl.detach();
            importer.renderUI();
        }
    },

    reportMissing() {
        if (window.PANDORA_RUNTIME || this.missing.length === 0) return;
        const names = [...new Set(this.missing.map(saved => saved.name.replace(/\.\d{3}$/, '')))];
        if (typeof PandoraToast !== 'undefined' && PandoraToast.show) {
            PandoraToast.show('Impor ulang file GLB: ' + names.join(', ') + '. Posisinya akan dipulihkan otomatis.', 'warning');
        }
    },

    // Studio: file diimpor ulang, objek lama dengan nama sama kembali ke posisi tersimpannya
    restoreMissing(baseName, firstItem, loaded) {
        const matches = this.missing.filter(saved => saved.name.replace(/\.\d{3}$/, '') === baseName);
        if (matches.length === 0) return;
        this.missing = this.missing.filter(saved => !matches.includes(saved));
        this.placeRecord(firstItem, matches[0]);
        firstItem.name = matches[0].name;
        matches.slice(1).forEach((saved) => {
            const item = this.createRecord(loaded.scene, loaded.animations, saved.name, firstItem.file);
            this.placeRecord(item, saved);
            this.container().add(item.root);
            this.list().push(item);
        });
    },

    // Build game: importer Studio tidak ada, jadi animasi objek diputar dari sini
    update(dt) {
        if (window.glbImporterInstance) return;
        this.list().forEach((item) => {
            if (item.mixer) item.mixer.update(dt);
        });
    }
};
window.PandoraImportedObjects = PandoraImportedObjects;
