/* Dipanggil api/export-game.php: node optimize-attachments.js <folder> [maks-segitiga] [maks-tekstur]
   Model attachment dari generator AI bisa jutaan segitiga dengan tekstur 4K. Dikecilkan sekali saat
   Generate, supaya ponsel tidak perlu mengunduh dan menyederhanakannya sendiri saat bermain.
   Tekstur diubah ke KTX2 (Basis Universal): tetap terkompresi di GPU (ASTC/ETC/BC), jadi memori grafis
   jauh lebih kecil dan tidak ada jeda saat tekstur diunggah. Runtime memuatnya lewat KTX2Loader. */
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS, KHRTextureBasisu } = require('@gltf-transform/extensions');
const { weld, simplify, prune, dedup } = require('@gltf-transform/functions');
const { MeshoptDecoder, MeshoptSimplifier, MeshoptEncoder } = require('meshoptimizer');
const sharp = require('sharp');

// Bawaan sama dengan ATTACHMENT_MAX_TRIANGLES di attachment-system.js; objek stage diberi batas lebih longgar
const MAX_TRIANGLES = Number(process.argv[3]) || 15000;
const MAX_TEXTURE = Number(process.argv[4]) || 1024;

// Warna dibaca sebagai sRGB; peta data (normal, roughness, AO) harus linear
const COLOR_SLOTS = /baseColor|emissive|diffuse|specularColor|sheenColor/i;
const NORMAL_SLOTS = /normal/i;
// Warna dan normal memakai UASTC (kualitas tinggi, jadi ASTC/ETC2 di ponsel);
// peta data lain memakai ETC1S (paling hemat, jadi ETC1/ETC2 4 bit per piksel).
// RDO dimatikan: 10x lebih lama untuk file sedikit lebih kecil, kualitas di GPU sama.
const UASTC_COLOR = { isUASTC: true, uastcLDRQualityLevel: 1, isPerceptual: true, isSetKTX2SRGBTransferFunc: true, needSupercompression: true, generateMipmap: true };
const UASTC_NORMAL = { isUASTC: true, uastcLDRQualityLevel: 1, isNormalMap: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false, needSupercompression: true, generateMipmap: true };
const ETC1S_DATA = { isUASTC: false, qualityLevel: 220, compressionLevel: 1, isPerceptual: false, isSetKTX2SRGBTransferFunc: false, generateMipmap: true };

function triangleCount(document) {
    let total = 0;
    for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            const indices = primitive.getIndices();
            const position = primitive.getAttribute('POSITION');
            total += (indices ? indices.getCount() : (position ? position.getCount() : 0)) / 3;
        }
    }
    return total;
}

// Pangkat dua terdekat (tidak melebihi batas): mipmap dan blok kompresi 4x4 butuh ukuran yang rapi
function powerOfTwo(value) {
    const lower = 2 ** Math.floor(Math.log2(Math.max(4, value)));
    const target = value - lower > lower * 2 - value ? lower * 2 : lower;
    return Math.max(4, Math.min(MAX_TEXTURE, target));
}

function textureSlots(document, texture) {
    return document.getGraph().listParentEdges(texture)
        .filter(edge => edge.getParent() !== document.getRoot())
        .map(edge => edge.getName());
}

async function compressTextures(document, encodeToKTX2, stats) {
    let converted = 0;
    for (const texture of document.getRoot().listTextures()) {
        const image = texture.getImage();
        if (!image || texture.getMimeType() === 'image/ktx2') continue;
        const slots = textureSlots(document, texture);
        const options = slots.some(s => NORMAL_SLOTS.test(s)) ? UASTC_NORMAL
            : slots.some(s => COLOR_SLOTS.test(s)) ? UASTC_COLOR
            : ETC1S_DATA;
        try {
            if (!encodeToKTX2) throw new Error('encoder KTX2 tidak tersedia');
            const meta = await sharp(image).metadata();
            const width = powerOfTwo(meta.width);
            const height = powerOfTwo(meta.height);
            const resized = sharp(image).resize(width, height, { fit: 'fill' }).ensureAlpha();
            const imageDecoder = async () => {
                const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true });
                return { data: new Uint8Array(data), width: info.width, height: info.height };
            };
            // Encoder WASM mencetak log per slice ke stdout; baris terakhir stdout harus tetap JSON hasil
            const log = console.log;
            console.log = () => {};
            let ktx;
            try {
                ktx = await encodeToKTX2(image, { ...options, imageDecoder });
            } finally {
                console.log = log;
            }
            texture.setImage(ktx).setMimeType('image/ktx2');
            converted++;
            stats.vramBefore += meta.width * meta.height * 4 * 4 / 3;
            stats.vramAfter += width * height * (options.isUASTC ? 1 : 0.5) * 4 / 3;
        } catch (err) {
            // Tetap PNG/JPEG tetapi diperkecil, supaya satu tekstur bermasalah tidak menggagalkan model
            stats.textureFailed.push((texture.getName() || texture.getURI() || 'tanpa nama') + ': ' + err.message);
            try {
                const meta = await sharp(image).metadata();
                if (meta.width > MAX_TEXTURE || meta.height > MAX_TEXTURE) {
                    const format = texture.getMimeType() === 'image/png' ? 'png' : 'jpeg';
                    texture.setImage(await sharp(image).resize(MAX_TEXTURE, MAX_TEXTURE, { fit: 'inside' })[format]().toBuffer());
                }
            } catch (resizeErr) { /* gambar tidak terbaca: dibiarkan apa adanya */ }
        }
    }
    if (converted) document.createExtension(KHRTextureBasisu).setRequired(true);
    // WebP tidak lagi dipakai bila semua teksturnya sudah KTX2
    const webp = document.getRoot().listExtensionsUsed().find(ext => ext.extensionName === 'EXT_texture_webp');
    if (webp && !document.getRoot().listTextures().some(t => t.getMimeType() === 'image/webp')) webp.dispose();
    return converted;
}

(async () => {
    await MeshoptDecoder.ready;
    await MeshoptSimplifier.ready;
    await MeshoptEncoder.ready;
    // ktx2-encoder hanya tersedia sebagai modul ES; bila belum terpasang, tekstur hanya diperkecil
    let encodeToKTX2 = null;
    try {
        ({ encodeToKTX2 } = await import('ktx2-encoder'));
    } catch (err) {
        console.error('ktx2-encoder tidak tersedia (jalankan npm install di tools/protect): ' + err.message);
    }
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder
    });

    const result = { optimized: 0, before: 0, after: 0, textures: 0, vramBeforeMB: 0, vramAfterMB: 0, failed: [] };
    const stats = { vramBefore: 0, vramAfter: 0, textureFailed: [] };
    for (const name of fs.readdirSync(process.argv[2])) {
        if (!/\.glb$/i.test(name)) continue;
        const file = path.join(process.argv[2], name);
        const original = fs.statSync(file).size;
        try {
            const document = await io.read(file);
            const triangles = triangleCount(document);
            const steps = [dedup(), weld()];
            if (triangles > MAX_TRIANGLES) {
                steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: MAX_TRIANGLES / triangles, error: 0.05, lockBorder: true }));
            }
            await document.transform(...steps);
            const converted = await compressTextures(document, encodeToKTX2, stats);
            await document.transform(prune());
            // Kompresi meshopt dilepas: GLTFLoader tidak perlu dekoder, gzip saat Generate sudah memperkecil file
            const compression = document.getRoot().listExtensionsUsed().find(ext => ext.extensionName === 'EXT_meshopt_compression');
            if (compression) compression.dispose();
            const output = await io.writeBinary(document);
            // Tekstur KTX2 selalu dipakai walau file sedikit lebih besar: yang dihemat adalah memori GPU
            if (converted || output.length < original) {
                fs.writeFileSync(file, output);
                result.optimized++;
                result.after += output.length;
            } else {
                result.after += original;
            }
            result.before += original;
            result.textures += converted;
        } catch (err) {
            result.failed.push(name + ': ' + err.message);
        }
    }
    result.vramBeforeMB = Math.round(stats.vramBefore / 1048576);
    result.vramAfterMB = Math.round(stats.vramAfter / 1048576);
    result.failed.push(...stats.textureFailed.map(t => 'tekstur ' + t));
    console.log(JSON.stringify(result));
})().catch((err) => {
    console.error(err && err.stack || err);
    process.exit(1);
});
