/* Dipanggil api/export-game.php: node optimize-attachments.js <folder> [maks-segitiga] [maks-tekstur]
   Model attachment dari generator AI bisa jutaan segitiga dengan tekstur 4K. Dikecilkan sekali saat
   Generate, supaya ponsel tidak perlu mengunduh dan menyederhanakannya sendiri saat bermain. */
const fs = require('fs');
const path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { weld, simplify, prune, dedup, textureCompress } = require('@gltf-transform/functions');
const { MeshoptDecoder, MeshoptSimplifier, MeshoptEncoder } = require('meshoptimizer');
const sharp = require('sharp');

// Bawaan sama dengan ATTACHMENT_MAX_TRIANGLES di attachment-system.js; objek stage diberi batas lebih longgar
const MAX_TRIANGLES = Number(process.argv[3]) || 15000;
const MAX_TEXTURE = Number(process.argv[4]) || 1024;

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

(async () => {
    await MeshoptDecoder.ready;
    await MeshoptSimplifier.ready;
    await MeshoptEncoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder
    });

    const result = { optimized: 0, before: 0, after: 0, failed: [] };
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
            steps.push(textureCompress({ encoder: sharp, resize: [MAX_TEXTURE, MAX_TEXTURE] }), prune());
            await document.transform(...steps);
            // Kompresi meshopt dilepas: GLTFLoader tidak perlu dekoder, gzip saat Generate sudah memperkecil file
            const compression = document.getRoot().listExtensionsUsed().find(ext => ext.extensionName === 'EXT_meshopt_compression');
            if (compression) compression.dispose();
            const output = await io.writeBinary(document);
            if (output.length < original) {
                fs.writeFileSync(file, output);
                result.optimized++;
                result.after += output.length;
            } else {
                result.after += original;
            }
            result.before += original;
        } catch (err) {
            result.failed.push(name + ': ' + err.message);
        }
    }
    console.log(JSON.stringify(result));
})().catch((err) => {
    console.error(err && err.stack || err);
    process.exit(1);
});
