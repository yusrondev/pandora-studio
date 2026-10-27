/**
 * ===================================================================
 * PANDORA ASSET CACHE (Browser Persistent Caching)
 * ===================================================================
 * Menyimpan seluruh asset 3D (FBX, textures, rig) di browser storage
 * (Cache API + IndexedDB fallback).
 * 
 * - First load: Asset diunduh dan otomatis disimpan ke cache browser.
 * - Reload / Revisit berikutnya: 100% dimuat instan dari local cache
 *   (0ms latency, hemat kuota data, anti-blank saat masuk demo mode).
 * ===================================================================
 */

(function () {
    const CACHE_NAME = 'pandora-assets-v1';
    const IDB_NAME = 'pandora_asset_cache_db';
    const IDB_VERSION = 1;
    const IDB_STORE = 'asset_buffers';

    // Aktifkan in-memory Three.js cache
    if (typeof THREE !== 'undefined' && THREE.Cache) {
        THREE.Cache.enabled = true;
    }

    // --- IndexedDB Fallback Store ---
    function openIDB() {
        return new Promise((resolve, reject) => {
            if (typeof window === 'undefined' || !('indexedDB' in window)) {
                return reject(new Error('IndexedDB tidak didukung'));
            }
            try {
                const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(IDB_STORE)) {
                        db.createObjectStore(IDB_STORE);
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    async function idbGet(url) {
        try {
            const db = await openIDB();
            return new Promise((resolve) => {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const store = tx.objectStore(IDB_STORE);
                const req = store.get(url);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch {
            return null;
        }
    }

    async function idbSet(url, buffer) {
        try {
            const db = await openIDB();
            return new Promise((resolve) => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                const store = tx.objectStore(IDB_STORE);
                store.put(buffer, url);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        } catch {
            return false;
        }
    }

    // --- Cache API Store ---
    async function cacheApiGet(url) {
        if (typeof window === 'undefined' || !('caches' in window)) return null;
        try {
            const cache = await caches.open(CACHE_NAME);
            const match = await cache.match(url);
            if (match && match.ok) {
                return await match.arrayBuffer();
            }
        } catch (e) {
            // Abaikan jika sandbox / origin tidak mengizinkan Cache API
        }
        return null;
    }

    async function cacheApiSet(url, responseClone) {
        if (typeof window === 'undefined' || !('caches' in window)) return false;
        try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(url, responseClone);
            return true;
        } catch (e) {
            return false;
        }
    }

    function extractUrlBase(url) {
        if (typeof THREE !== 'undefined' && THREE.LoaderUtils && THREE.LoaderUtils.extractUrlBase) {
            return THREE.LoaderUtils.extractUrlBase(url);
        }
        const parts = url.split('/');
        parts.pop();
        return parts.length === 0 ? '' : parts.join('/') + '/';
    }

    const PandoraAssetCache = {
        stats: {
            cacheHits: 0,
            cacheMisses: 0
        },

        isCacheSupported() {
            return (typeof window !== 'undefined') && (('caches' in window) || ('indexedDB' in window));
        },

        /**
         * Mengambil ArrayBuffer dari cache atau download jika belum ada
         */
        async getAssetBuffer(url) {
            // 1. Cek Cache API
            let buffer = await cacheApiGet(url);
            if (buffer && buffer.byteLength > 0) {
                this.stats.cacheHits++;
                console.log(`[PandoraAssetCache ⚡] HIT (Cache API): ${url} (${(buffer.byteLength / 1024).toFixed(1)} KB)`);
                return buffer;
            }

            // 2. Cek IndexedDB
            buffer = await idbGet(url);
            if (buffer && buffer.byteLength > 0) {
                this.stats.cacheHits++;
                console.log(`[PandoraAssetCache ⚡] HIT (IndexedDB): ${url} (${(buffer.byteLength / 1024).toFixed(1)} KB)`);
                // Replikasi ke Cache API jika memungkinkan
                try {
                    const blob = new Blob([buffer]);
                    cacheApiSet(url, new Response(blob, { headers: { 'Content-Type': 'application/octet-stream' } }));
                } catch (_) {}
                return buffer;
            }

            // 3. Cache Miss: Unduh via Network
            this.stats.cacheMisses++;
            console.log(`[PandoraAssetCache 🌐] MISS (Downloading): ${url}`);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Gagal memuat asset (${response.status}): ${url}`);
            }

            const responseClone = response.clone();
            const freshBuffer = await response.arrayBuffer();

            // Simpan ke Cache API dan IndexedDB secara asynchronous
            (async () => {
                try {
                    await cacheApiSet(url, responseClone);
                } catch (_) {}
                try {
                    await idbSet(url, freshBuffer);
                } catch (_) {}
            })();

            return freshBuffer;
        },

        /**
         * Memuat FBX dengan caching terintegrasi
         * @param {string} url - URL path file FBX
         * @param {THREE.FBXLoader} [loader] - Instance FBXLoader opsional
         * @returns {Promise<THREE.Group>}
         */
        async loadFBX(url, loader) {
            if (!loader) {
                loader = (typeof THREE !== 'undefined' && THREE.FBXLoader) ? new THREE.FBXLoader() : null;
            }
            if (!loader) {
                throw new Error('THREE.FBXLoader tidak tersedia.');
            }

            const basePath = extractUrlBase(url);

            try {
                const buffer = await this.getAssetBuffer(url);
                // Parse langsung dari buffer memori (0ms network)
                return loader.parse(buffer, basePath);
            } catch (err) {
                if (err && err.message && err.message.includes('404')) {
                    throw err;
                }
                console.warn(`[PandoraAssetCache] Gagal parse buffer ${url}, fallback ke loader.load:`, err);
                return new Promise((resolve, reject) => {
                    loader.load(url, resolve, undefined, reject);
                });
            }
        },

        /**
         * Membersihkan semua asset yang tersimpan di cache browser
         */
        async clear() {
            let res = false;
            if (typeof window !== 'undefined' && 'caches' in window) {
                try {
                    await caches.delete(CACHE_NAME);
                    res = true;
                } catch (_) {}
            }
            if (typeof window !== 'undefined' && 'indexedDB' in window) {
                try {
                    window.indexedDB.deleteDatabase(IDB_NAME);
                    res = true;
                } catch (_) {}
            }
            this.stats.cacheHits = 0;
            this.stats.cacheMisses = 0;
            console.log('[PandoraAssetCache] Seluruh cache asset berhasil dihapus.');
            return res;
        }
    };

    window.PandoraAssetCache = PandoraAssetCache;
})();
