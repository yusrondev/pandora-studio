/* =========================================================
   TEKSTUR KTX2 (Basis Universal) UNTUK GAME HASIL GENERATE
   Generate Game mengubah tekstur GLB menjadi KTX2 (tools/protect/optimize-attachments.js) dan
   mengeluarkan tekstur hero dari idle.fbx menjadi file KTX2 tersendiri (tools/protect/compress-hero-textures.js).
   Di sini satu KTX2Loader dipakai bersama; transcoder memilih format GPU yang didukung perangkat
   (ASTC/ETC di ponsel, BC di PC), jadi tekstur tetap terkompresi di VRAM.
   Studio tidak memuat vendor KTX2Loader dan modelnya masih PNG/JPEG, jadi semua fungsi di sini tidak berbuat apa-apa.
   ========================================================= */
// Ponsel: tekstur lebih besar dari ini memakai mip berikutnya (setengah ukuran), PC tetap penuh
const KTX2_PHONE_MAX_SIZE = 1024;
const FBX_TEXTURE_SLOTS = ['map', 'normalMap', 'emissiveMap', 'specularMap', 'bumpMap', 'aoMap', 'alphaMap'];

const PandoraKTX2 = {
    loader: null,

    get() {
        if (this.loader) return this.loader;
        if (typeof THREE === 'undefined' || !THREE.KTX2Loader || typeof renderer === 'undefined') return null;
        const loader = new THREE.KTX2Loader();
        loader.setTranscoderPath((window.PANDORA_VENDOR_PATH || 'runtime/vendor/') + 'basis/');
        // Transcoding berjalan di worker; dua worker cukup dan tidak berebut CPU dengan game di ponsel
        loader.setWorkerLimit(2);
        loader.detectSupport(renderer);

        const maxSize = (typeof PANDORA_IS_PHONE !== 'undefined' && PANDORA_IS_PHONE) ? KTX2_PHONE_MAX_SIZE : Infinity;
        if (maxSize !== Infinity) {
            // GLTFLoader memanggil load(), yang memanggil parse() milik instance ini
            const parse = loader.parse.bind(loader);
            loader.parse = (buffer, onLoad, onError) => parse(buffer, (texture) => {
                PandoraKTX2.limitSize(texture, maxSize);
                if (onLoad) onLoad(texture);
            }, onError);
        }
        this.loader = loader;
        return loader;
    },

    // Membuang mip teratas selama masih lebih besar dari batas: memori GPU turun 4x per tingkat
    limitSize(texture, maxSize) {
        const mipmaps = texture && texture.mipmaps;
        if (!mipmaps || mipmaps.length < 2) return;
        let drop = 0;
        while (drop < mipmaps.length - 1 && Math.max(mipmaps[drop].width, mipmaps[drop].height) > maxSize) drop++;
        if (!drop) return;
        texture.mipmaps = mipmaps.slice(drop);
        texture.image = { width: texture.mipmaps[0].width, height: texture.mipmaps[0].height };
    },

    attach(gltfLoader) {
        const loader = this.get();
        if (loader && gltfLoader && typeof gltfLoader.setKTX2Loader === 'function') gltfLoader.setKTX2Loader(loader);
        return gltfLoader;
    },

    async loadTexture(file) {
        const loader = this.get();
        const buffer = window.PandoraAssetCache
            ? await PandoraAssetCache.getAssetBuffer(file)
            : await (await fetch(file)).arrayBuffer();
        return new Promise((resolve, reject) => loader.parse(buffer, resolve, reject));
    },

    // Model hero hasil Generate membawa gambar 4x4 bernama pandoraKtxN; diganti tekstur KTX2 aslinya
    async applyToFbx(object, url) {
        const table = window.PANDORA_FBX_TEXTURES;
        if (!object || !table || !this.get()) return object;
        const clean = String(url).split('?')[0].replace(/^(\.\/)+/, '');
        const key = Object.keys(table).find(k => clean === k || clean.endsWith('/' + k));
        if (!key) return object;

        const fileByName = {};
        table[key].forEach(entry => { fileByName[entry.name] = entry.file; });
        const pending = {};
        const jobs = [];
        object.traverse((child) => {
            if (!child.material) return;
            [].concat(child.material).forEach((material) => {
                FBX_TEXTURE_SLOTS.forEach((slot) => {
                    const old = material[slot];
                    const file = old && fileByName[old.name];
                    if (!file) return;
                    pending[file] = pending[file] || this.loadTexture(file);
                    jobs.push(pending[file].then((texture) => {
                        texture.name = old.name;
                        texture.wrapS = old.wrapS;
                        texture.wrapT = old.wrapT;
                        texture.repeat.copy(old.repeat);
                        texture.offset.copy(old.offset);
                        material[slot] = texture;
                        material.needsUpdate = true;
                        old.dispose();
                    }));
                });
            });
        });
        try {
            await Promise.all(jobs);
        } catch (err) {
            console.warn('[PandoraKTX2] Tekstur model ' + key + ' gagal dimuat:', err);
        }
        return object;
    }
};
window.PandoraKTX2 = PandoraKTX2;
