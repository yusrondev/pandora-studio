/* =========================================================
   PENGGABUNG OBJEK 3D IMPOR (Studio dan game hasil generate)
   Ubin lantai 3D dan properti yang diulang adalah clone dengan geometri + material yang sama, tapi tanpa
   penggabungan setiap clone digambar sendiri: 1 draw call per mesh per objek (dan sekali lagi untuk
   bayangan). Ratusan ubin = ratusan sampai ribuan draw call.
   Di sini objek statis dengan file sama digambar sebagai InstancedMesh per area (chunk) supaya area di
   luar layar tetap terpotong. Area jauh memakai geometri yang disederhanakan (LOD).
   Objek aslinya tetap ada (fisika, seleksi, simpan map); hanya mesh-nya yang tidak digambar.
   Objek yang sedang dipilih, disembunyikan, atau beranimasi tidak digabung.
   ========================================================= */
const IMPORT_BATCH_MIN_COPIES = 3;      // File yang muncul sesering ini atau lebih digabung
const IMPORT_BATCH_CHUNK = 24;          // Ukuran area penggabungan (m)
const IMPORT_BATCH_LOD_DISTANCE = 30;   // Area lebih jauh dari ini memakai geometri ringan
const IMPORT_BATCH_LOD_MIN_TRIS = 3000; // Mesh kecil tidak perlu LOD
const IMPORT_BATCH_LOD_RATIO = 0.22;

const PandoraImportBatcher = {
    enabled: true,
    group: null,
    files: new Map(),        // file -> { signature, chunks: [{ sphere, near: [InstancedMesh], far: [InstancedMesh] }] }
    lodCache: new Map(),     // geometry.uuid -> geometri LOD (atau null bila tidak perlu/tidak bisa)
    batchedItems: new Set(),
    checkTimer: 0,
    _box: new THREE.Box3(),
    _sphere: new THREE.Sphere(),
    _v: new THREE.Vector3(),

    container() {
        if (!this.group) {
            this.group = new THREE.Group();
            this.group.name = 'ImportedBatches';
            this.group.matrixAutoUpdate = false;
            this.group.userData.noPick = true;
            scene.add(this.group);
        }
        return this.group;
    },

    selectedItem(list) {
        const importer = window.glbImporterInstance;
        if (!importer || importer.selectedIndex < 0) return null;
        return list[importer.selectedIndex] || null;
    },

    meshesOf(item) {
        if (!item._batchMeshes) {
            const meshes = [];
            let skinned = false;
            item.model.traverse((child) => {
                if (child.isSkinnedMesh) skinned = true;
                else if (child.isMesh && child.geometry && child.material && !child.isInstancedMesh) meshes.push(child);
            });
            item._batchMeshes = skinned ? null : meshes;
        }
        return item._batchMeshes;
    },

    eligible(item, selected) {
        if (!item || !item.root || !item.model || !item.file || item === selected) return false;
        if (!item.root.visible || !item.root.parent) return false;
        if (item.mixer || (item.gltfAnimations && item.gltfAnimations.length > 0)) return false;
        const meshes = this.meshesOf(item);
        return !!(meshes && meshes.length > 0);
    },

    // Sidik jari ringan per file: anggota + posisi/rotasi/skala. Berubah = susun ulang batch file itu.
    signature(items) {
        let h = items.length * 7919;
        for (let i = 0; i < items.length; i++) {
            const e = items[i].root.matrixWorld.elements;
            h = (h * 31 + Math.round(e[12] * 1000) + Math.round(e[13] * 1000) * 3 + Math.round(e[14] * 1000) * 7
                + Math.round(e[0] * 1e4) * 11 + Math.round(e[2] * 1e4) * 13 + Math.round(e[5] * 1e4) * 17) | 0;
            h = (h * 31 + (items[i].id ? items[i].id.length : 0) + i) | 0;
        }
        return h;
    },

    lodGeometry(geometry) {
        if (this.lodCache.has(geometry.uuid)) return this.lodCache.get(geometry.uuid);
        let lod = null;
        const simplifier = window.MeshoptSimplifier;
        const index = geometry.index;
        const pos = geometry.attributes.position;
        const tris = index ? index.count / 3 : 0;
        if (simplifier && simplifier.supported && index && pos && tris >= IMPORT_BATCH_LOD_MIN_TRIS) {
            try {
                const positions = new Float32Array(pos.count * 3);
                for (let i = 0; i < pos.count; i++) {
                    positions[i * 3] = pos.getX(i);
                    positions[i * 3 + 1] = pos.getY(i);
                    positions[i * 3 + 2] = pos.getZ(i);
                }
                const target = Math.floor(tris * IMPORT_BATCH_LOD_RATIO) * 3;
                const [result] = simplifier.simplify(new Uint32Array(index.array), positions, 3, target, 0.02, ['LockBorder']);
                if (result && result.length >= 3 && result.length < index.count * 0.8) {
                    lod = this.shareAttributes(geometry);
                    lod.setIndex(new THREE.BufferAttribute(pos.count > 65535 ? new Uint32Array(result) : new Uint16Array(result), 1));
                    lod.groups = [];   // Satu material untuk seluruh LOD
                }
            } catch (err) {
                console.warn('[ImportBatcher] LOD gagal dibuat:', err);
            }
        }
        // MeshoptSimplifier memuat WASM secara async: jangan simpan "tidak ada LOD" sebelum siap
        if (lod || (simplifier && simplifier.supported)) this.lodCache.set(geometry.uuid, lod);
        return lod;
    },

    // Geometri baru yang memakai atribut yang sama (buffer GPU tidak digandakan), dengan bola batas sendiri
    shareAttributes(geometry) {
        const g = new THREE.BufferGeometry();
        for (const key in geometry.attributes) g.setAttribute(key, geometry.attributes[key]);
        g.index = geometry.index;
        g.groups = geometry.groups.map(gr => Object.assign({}, gr));
        return g;
    },

    makeInstanced(geometry, mesh, items, meshIndex, sphere) {
        const g = this.shareAttributes(geometry);
        g.boundingSphere = sphere.clone();
        const inst = new THREE.InstancedMesh(g, mesh.material, items.length);
        for (let i = 0; i < items.length; i++) {
            inst.setMatrixAt(i, this.meshesOf(items[i])[meshIndex].matrixWorld);
        }
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = mesh.castShadow;
        inst.receiveShadow = mesh.receiveShadow;
        inst.matrixAutoUpdate = false;
        inst.userData.noPick = true;
        inst.userData.importBatch = true;
        inst.raycast = () => {};   // Seleksi & raycast tetap ke objek aslinya
        return inst;
    },

    disposeFile(entry) {
        entry.chunks.forEach((chunk) => {
            chunk.near.concat(chunk.far).forEach((inst) => {
                if (inst.parent) inst.parent.remove(inst);
                // Hanya buffer matriks instance yang dilepas. geometry.dispose() TIDAK dipanggil: atributnya
                // dipakai bersama objek asli, dan dispose akan menghapus buffer GPU milik objek asli juga.
                inst.dispose();
            });
        });
        entry.chunks = [];
    },

    setHidden(item, hidden) {
        const meshes = this.meshesOf(item);
        if (!meshes) return;
        meshes.forEach((m) => { m.visible = !hidden; });
        if (hidden) this.batchedItems.add(item); else this.batchedItems.delete(item);
    },

    buildFile(file, items, entry) {
        this.disposeFile(entry);
        const container = this.container();
        const byChunk = new Map();
        items.forEach((item) => {
            item.root.updateMatrixWorld(true);
            const p = item.root.position;
            const key = Math.floor(p.x / IMPORT_BATCH_CHUNK) + ',' + Math.floor(p.z / IMPORT_BATCH_CHUNK);
            if (!byChunk.has(key)) byChunk.set(key, []);
            byChunk.get(key).push(item);
        });
        const template = this.meshesOf(items[0]);
        byChunk.forEach((chunkItems) => {
            // Semua clone punya susunan mesh yang sama dengan objek pertama
            const valid = chunkItems.filter(it => this.meshesOf(it).length === template.length);
            if (valid.length === 0) return;
            this._box.makeEmpty();
            valid.forEach(it => this._box.expandByObject(it.model));
            const sphere = this._box.getBoundingSphere(new THREE.Sphere());
            const chunk = { sphere, near: [], far: [] };
            template.forEach((mesh, meshIndex) => {
                const near = this.makeInstanced(mesh.geometry, mesh, valid, meshIndex, sphere);
                container.add(near);
                chunk.near.push(near);
                const lod = Array.isArray(mesh.material) ? null : this.lodGeometry(mesh.geometry);
                if (lod) {
                    const far = this.makeInstanced(lod, mesh, valid, meshIndex, sphere);
                    far.geometry.groups = [];
                    far.visible = false;
                    container.add(far);
                    chunk.far.push(far);
                }
            });
            entry.chunks.push(chunk);
        });
    },

    // Dipanggil tiap frame dari render loop
    update(dt) {
        const list = window.importedObjectsList;
        if (!this.enabled || !Array.isArray(list)) return;

        // Susunan batch diperiksa beberapa kali per detik; LOD tiap frame
        this.checkTimer -= dt || 0;
        if (this.checkTimer <= 0) {
            this.checkTimer = 0.25;
            this.refresh(list);
        }

        const cam = typeof camera !== 'undefined' ? camera.position : null;
        if (!cam) return;
        this.files.forEach((entry) => {
            entry.chunks.forEach((chunk) => {
                if (chunk.far.length === 0) return;
                const dist = Math.max(0, cam.distanceTo(chunk.sphere.center) - chunk.sphere.radius);
                const useFar = dist > IMPORT_BATCH_LOD_DISTANCE;
                if (chunk.useFar === useFar) return;
                chunk.useFar = useFar;
                chunk.near.forEach((m, i) => {
                    // Mesh tanpa LOD (kecil) tetap memakai versi penuh
                    const hasFar = !!chunk.far[i];
                    m.visible = !useFar || !hasFar;
                    if (hasFar) chunk.far[i].visible = useFar;
                });
            });
        });
    },

    refresh(list) {
        const selected = this.selectedItem(list);
        const byFile = new Map();
        list.forEach((item) => {
            if (!this.eligible(item, selected)) return;
            if (!byFile.has(item.file)) byFile.set(item.file, []);
            byFile.get(item.file).push(item);
        });

        const keep = new Set();
        byFile.forEach((items, file) => {
            if (items.length < IMPORT_BATCH_MIN_COPIES) return;
            items.forEach(it => keep.add(it));
            let entry = this.files.get(file);
            if (!entry) {
                entry = { signature: null, chunks: [], lodReady: false };
                this.files.set(file, entry);
            }
            const sig = this.signature(items);
            // LOD baru bisa dibuat setelah WASM simplifier siap: susun ulang sekali saat itu terjadi
            const lodReady = !!(window.MeshoptSimplifier && window.MeshoptSimplifier.supported && this.simplifierReady);
            if (sig !== entry.signature || lodReady !== entry.lodReady) {
                entry.signature = sig;
                entry.lodReady = lodReady;
                this.buildFile(file, items, entry);
            }
            items.forEach(it => { if (!this.batchedItems.has(it)) this.setHidden(it, true); });
        });

        // Objek yang keluar dari batch (dipilih, disembunyikan, dihapus, jumlahnya turun) digambar sendiri lagi
        Array.from(this.batchedItems).forEach((item) => {
            if (!keep.has(item)) this.setHidden(item, false);
        });
        this.files.forEach((entry, file) => {
            const items = byFile.get(file);
            if (!items || items.length < IMPORT_BATCH_MIN_COPIES) {
                this.disposeFile(entry);
                this.files.delete(file);
            }
        });
    },

    stats() {
        let instanced = 0, instances = 0;
        this.files.forEach(entry => entry.chunks.forEach(chunk => chunk.near.forEach((m) => { instanced++; instances += m.count; })));
        return { files: this.files.size, drawCalls: instanced, instances, batchedObjects: this.batchedItems.size };
    }
};
window.PandoraImportBatcher = PandoraImportBatcher;

if (window.MeshoptSimplifier && window.MeshoptSimplifier.ready) {
    window.MeshoptSimplifier.ready.then(() => { PandoraImportBatcher.simplifierReady = true; }).catch(() => {});
}
