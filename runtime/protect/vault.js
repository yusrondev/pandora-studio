/* Pemuat aset terenkripsi untuk build game. Disalin per build dengan __CONFIG__ terisi, lalu diobfuscate.
   Aset disimpan sebagai data/p/<nama-acak>.bin: 12 byte IV, data AES-256-GCM, 16 byte tag. */
(function () {
    const CONFIG = __CONFIG__;
    const COVERED = /^(hero\/|assets\/attachments\/|assets\/imported\/|data\/maps\/|data\/project\.json$|config\/)/;
    const API_PATH = /(^|\/)api\/[^\/]+\.php/;
    const TOKEN_LIFETIME_S = 172800;
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();

    window.PANDORA_RUNTIME = true;
    window.PANDORA_VENDOR_PATH = 'vendor/';
    window.PANDORA_BUILD_ID = CONFIG.id;
    window.PANDORA_GAME_CHARACTERS = CONFIG.characters;

    const toBytes = (text) => encoder.encode(text);
    const toHex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    const fromHex = (hex) => new Uint8Array(hex.match(/../g).map(h => parseInt(h, 16)));
    const join = (a, b) => {
        const out = new Uint8Array(a.length + b.length);
        out.set(a);
        out.set(b, a.length);
        return out;
    };

    function sha256(data) {
        const K = [];
        const H = [];
        let n = 2;
        while (K.length < 64) {
            let prime = true;
            for (let d = 2; d * d <= n; d++) if (n % d === 0) prime = false;
            if (prime) {
                if (H.length < 8) H.push((Math.pow(n, 1 / 2) % 1) * 4294967296 >>> 0);
                K.push((Math.pow(n, 1 / 3) % 1) * 4294967296 >>> 0);
            }
            n++;
        }
        const length = data.length;
        const blocks = ((length + 8) >> 6) + 1;
        const words = new Uint32Array(blocks * 16);
        for (let i = 0; i < length; i++) words[i >> 2] |= data[i] << (24 - (i % 4) * 8);
        words[length >> 2] |= 0x80 << (24 - (length % 4) * 8);
        words[blocks * 16 - 1] = length * 8;
        const w = new Uint32Array(64);
        const rotr = (x, c) => (x >>> c) | (x << (32 - c));
        for (let b = 0; b < blocks; b++) {
            for (let t = 0; t < 64; t++) {
                if (t < 16) {
                    w[t] = words[b * 16 + t];
                } else {
                    const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
                    const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
                    w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
                }
            }
            let [a, c1, c2, d, e, f, g, h] = H;
            for (let t = 0; t < 64; t++) {
                const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) >>> 0;
                const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & c1) ^ (a & c2) ^ (c1 & c2))) >>> 0;
                h = g; g = f; f = e; e = (d + t1) >>> 0;
                d = c2; c2 = c1; c1 = a; a = (t1 + t2) >>> 0;
            }
            [a, c1, c2, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) >>> 0; });
        }
        const out = new Uint8Array(32);
        H.forEach((v, i) => {
            out[i * 4] = v >>> 24;
            out[i * 4 + 1] = (v >>> 16) & 255;
            out[i * 4 + 2] = (v >>> 8) & 255;
            out[i * 4 + 3] = v & 255;
        });
        return out;
    }

    // Tanda tangan URL untuk modul secure_link nginx
    function md5(data) {
        const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
        const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
        const blocks = ((data.length + 8) >> 6) + 1;
        const words = new Uint32Array(blocks * 16);
        data.forEach((b, i) => { words[i >> 2] |= b << ((i % 4) * 8); });
        words[data.length >> 2] |= 0x80 << ((data.length % 4) * 8);
        words[blocks * 16 - 2] = data.length * 8;
        let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
        for (let b = 0; b < blocks; b++) {
            let A = a0, B = b0, C = c0, D = d0;
            for (let i = 0; i < 64; i++) {
                const round = i >> 4;
                let f, g;
                if (round === 0) { f = (B & C) | (~B & D); g = i; }
                else if (round === 1) { f = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
                else if (round === 2) { f = B ^ C ^ D; g = (3 * i + 5) % 16; }
                else { f = C ^ (B | ~D); g = (7 * i) % 16; }
                const sum = (A + f + K[i] + words[b * 16 + g]) >>> 0;
                const shift = S[round * 4 + (i % 4)];
                A = D; D = C; C = B;
                B = (B + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0;
            }
            a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
        }
        const out = new Uint8Array(16);
        [a0, b0, c0, d0].forEach((v, i) => {
            for (let j = 0; j < 4; j++) out[i * 4 + j] = (v >>> (j * 8)) & 255;
        });
        return out;
    }

    // AES-CTR perangkat lunak untuk halaman http://, karena WebCrypto hanya ada di konteks aman.
    // Tag GCM tidak diperiksa di jalur ini; alur kuncinya tetap sama dengan GCM (penghitung mulai dari 2).
    function softwareGcmOpen(key, packed) {
        const sbox = new Uint8Array(256);
        let p = 1, q = 1;
        do {
            p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 255;
            q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 255;
            if (q & 0x80) q ^= 0x09;
            sbox[p] = (q ^ (q << 1 | q >> 7) ^ (q << 2 | q >> 6) ^ (q << 3 | q >> 5) ^ (q << 4 | q >> 4) ^ 0x63) & 255;
        } while (p !== 1);
        sbox[0] = 0x63;
        const T = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            const s = sbox[i];
            const s2 = ((s << 1) ^ (s & 0x80 ? 0x1b : 0)) & 255;
            T[i] = ((s2 << 24) | (s << 16) | (s << 8) | (s2 ^ s)) >>> 0;
        }
        const ror = (x, c) => (x >>> c) | (x << (32 - c));
        const rk = new Uint32Array(60);
        for (let i = 0; i < 8; i++) rk[i] = ((key[i * 4] << 24) | (key[i * 4 + 1] << 16) | (key[i * 4 + 2] << 8) | key[i * 4 + 3]) >>> 0;
        let rcon = 1;
        const sub = (x) => ((sbox[x >>> 24] << 24) | (sbox[(x >>> 16) & 255] << 16) | (sbox[(x >>> 8) & 255] << 8) | sbox[x & 255]) >>> 0;
        for (let i = 8; i < 60; i++) {
            let t = rk[i - 1];
            if (i % 8 === 0) {
                t = (sub((t << 8) | (t >>> 24)) ^ (rcon << 24)) >>> 0;
                rcon = ((rcon << 1) ^ (rcon & 0x80 ? 0x1b : 0)) & 255;
            } else if (i % 8 === 4) {
                t = sub(t);
            }
            rk[i] = (rk[i - 8] ^ t) >>> 0;
        }
        const iv = packed.subarray(0, 12);
        const body = packed.subarray(12, packed.length - 16);
        const out = new Uint8Array(body.length);
        const n0 = ((iv[0] << 24) | (iv[1] << 16) | (iv[2] << 8) | iv[3]) >>> 0;
        const n1 = ((iv[4] << 24) | (iv[5] << 16) | (iv[6] << 8) | iv[7]) >>> 0;
        const n2 = ((iv[8] << 24) | (iv[9] << 16) | (iv[10] << 8) | iv[11]) >>> 0;
        let counter = 2;
        for (let offset = 0; offset < body.length; offset += 16, counter++) {
            let a = n0 ^ rk[0], b = n1 ^ rk[1], c = n2 ^ rk[2], d = (counter ^ rk[3]) >>> 0;
            for (let r = 1; r < 14; r++) {
                const k = r * 4;
                const na = T[a >>> 24] ^ ror(T[(b >>> 16) & 255], 8) ^ ror(T[(c >>> 8) & 255], 16) ^ ror(T[d & 255], 24) ^ rk[k];
                const nb = T[b >>> 24] ^ ror(T[(c >>> 16) & 255], 8) ^ ror(T[(d >>> 8) & 255], 16) ^ ror(T[a & 255], 24) ^ rk[k + 1];
                const nc = T[c >>> 24] ^ ror(T[(d >>> 16) & 255], 8) ^ ror(T[(a >>> 8) & 255], 16) ^ ror(T[b & 255], 24) ^ rk[k + 2];
                const nd = T[d >>> 24] ^ ror(T[(a >>> 16) & 255], 8) ^ ror(T[(b >>> 8) & 255], 16) ^ ror(T[c & 255], 24) ^ rk[k + 3];
                a = na >>> 0; b = nb >>> 0; c = nc >>> 0; d = nd >>> 0;
            }
            const last = (w0, w1, w2, w3, k) => ((sbox[w0 >>> 24] << 24) | (sbox[(w1 >>> 16) & 255] << 16) | (sbox[(w2 >>> 8) & 255] << 8) | sbox[w3 & 255]) ^ rk[k];
            const words = [last(a, b, c, d, 56), last(b, c, d, a, 57), last(c, d, a, b, 58), last(d, a, b, c, 59)];
            const end = Math.min(16, body.length - offset);
            for (let i = 0; i < end; i++) out[offset + i] = body[offset + i] ^ ((words[i >> 2] >>> (24 - (i % 4) * 8)) & 255);
        }
        return out.buffer;
    }

    function showRefusal() {
        const show = () => {
            const box = document.createElement('div');
            box.style.cssText = 'position:fixed;inset:0;z-index:2000001;display:flex;align-items:center;justify-content:center;padding:0 30px;background:#000;color:#e8e4da;font:500 16px/1.5 sans-serif;text-align:center';
            box.textContent = 'Game ini tidak diizinkan berjalan di alamat ini.';
            document.body.appendChild(box);
        };
        if (document.body) show();
        else document.addEventListener('DOMContentLoaded', show);
    }

    let master = null;
    let nameKey = null;
    let cryptoKey = null;

    async function readSecret(bytes) {
        const secret = new Uint8Array(32);
        try {
            const module = await WebAssembly.instantiate(bytes);
            for (let i = 0; i < 32; i++) secret[i] = module.instance.exports.k(i);
        } catch (err) {
            // Safari di bawah 16 menolak WebAssembly di bawah CSP ketat
            const data = new Uint8Array(bytes).subarray(-64);
            for (let i = 0; i < 32; i++) secret[i] = data[i] ^ data[i + 32] ^ ((i * 167 + CONFIG.keySalt) & 255);
        }
        return secret;
    }

    async function unlock() {
        const res = await nativeFetch(CONFIG.keyFile);
        const secret = await readSecret(await res.arrayBuffer());
        const hex = toHex(secret);

        const parts = location.hostname.toLowerCase().split('.');
        const candidates = [parts.join('.')];
        for (let i = 1; i < parts.length; i++) candidates.push('*.' + parts.slice(i).join('.'));
        candidates.push('*');

        for (const host of candidates) {
            const entry = CONFIG.locks[toHex(sha256(toBytes(hex + '|' + host)))];
            if (!entry) continue;
            const pad = sha256(toBytes(hex + '#' + host));
            master = fromHex(entry).map((b, i) => b ^ pad[i]);
            nameKey = toHex(sha256(join(master, toBytes('n'))));
            if (window.crypto && crypto.subtle) {
                cryptoKey = await crypto.subtle.importKey('raw', master, 'AES-GCM', false, ['decrypt']);
            }
            return;
        }
        throw new Error('locked');
    }

    const ready = unlock().catch((err) => {
        showRefusal();
        throw err;
    });

    function relativePath(url) {
        try {
            const parsed = new URL(String(url), location.href);
            if (parsed.origin !== location.origin) return null;
            const base = location.pathname.replace(/[^\/]*$/, '');
            if (!parsed.pathname.startsWith(base)) return null;
            return decodeURIComponent(parsed.pathname.slice(base.length));
        } catch (err) {
            return null;
        }
    }

    function packKey(path) {
        return CONFIG.packDir + toHex(sha256(toBytes(nameKey + '|' + path))).slice(0, 32) + '.bin';
    }

    function signedUrl(key) {
        const uri = new URL(key, location.href).pathname;
        const expires = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_S;
        const digest = md5(toBytes(expires + uri + ' ' + CONFIG.linkSecret));
        const signature = btoa(String.fromCharCode.apply(null, digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return key + '?s=' + signature + '&e=' + expires;
    }

    // Byte pertama isi: 1 = gzip, 0 = apa adanya. Data terenkripsi tidak bisa dikompres oleh server.
    async function inflate(opened) {
        const body = new Uint8Array(opened, 1);
        if (new Uint8Array(opened, 0, 1)[0] !== 1) return opened.slice(1);
        if (window.DecompressionStream) {
            const stream = new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'));
            return new Response(stream).arrayBuffer();
        }
        const out = window.fflate.gunzipSync(body);
        return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    }

    async function open(buffer) {
        if (cryptoKey) {
            const packed = new Uint8Array(buffer);
            return inflate(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: packed.subarray(0, 12) }, cryptoKey, packed.subarray(12)));
        }
        return inflate(softwareGcmOpen(master, new Uint8Array(buffer)));
    }

    window.PandoraVault = {
        ready,
        covers(url) {
            const path = relativePath(url);
            return path !== null && COVERED.test(path);
        },
        // Kunci cache memakai nama acak tanpa tanda tangan, karena tanda tangannya kedaluwarsa
        locate(url) {
            const key = packKey(relativePath(url));
            return { key, url: signedUrl(key) };
        },
        open
    };

    window.fetch = (url, options) => {
        const text = String(url);
        if (API_PATH.test(text)) return Promise.resolve(new Response('', { status: 404 }));
        if (!window.PandoraVault.covers(text)) return nativeFetch(url, options);
        return ready.then(async () => {
            const pack = window.PandoraVault.locate(text);
            const res = await nativeFetch(pack.url);
            if (!res.ok) return new Response('', { status: 404 });
            return new Response(await open(await res.arrayBuffer()), { status: 200 });
        });
    };
})();
