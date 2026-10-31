/* Dipanggil api/export-game.php: node bake-clips.js <folder-hero> <folder-vendor>
   File animasi FBX membawa mesh dan rig penuh, padahal game hanya memakai klipnya. File itu diganti
   klip biner (nama file tetap) sehingga jauh lebih kecil dan hampir tanpa waktu parsing.
   idle.fbx dilewati karena menjadi model karakter. Format: 'PCLP', u32 panjang JSON, JSON, data Float32. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.THREE = require('three');
global.window = global;
global.self = global;
global.document = {
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }),
    createElement: () => ({ addEventListener() {}, removeEventListener() {}, style: {} })
};
const quiet = console.warn;
console.warn = () => {};

const [heroDir, vendorDir] = process.argv.slice(2);
vm.runInThisContext(fs.readFileSync(path.join(vendorDir, 'fflate.min.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(vendorDir, 'FBXLoader.js'), 'utf8'));

function walk(dir, out = []) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) walk(full, out);
        else if (/\.fbx$/i.test(item.name) && !/^idle\.fbx$/i.test(item.name)) out.push(full);
    }
    return out;
}

function pack(clip) {
    const chunks = [];
    const tracks = clip.tracks.map((track) => {
        const times = new Float32Array(track.times);
        const values = new Float32Array(track.values);
        chunks.push(Buffer.from(times.buffer), Buffer.from(values.buffer));
        return { n: track.name, k: track.ValueTypeName, c: times.length, v: values.length };
    });
    const header = Buffer.from(JSON.stringify({ n: clip.name, d: clip.duration, t: tracks }), 'utf8');
    const padding = Buffer.alloc((4 - (header.length % 4)) % 4, 0x20);
    const length = Buffer.alloc(4);
    length.writeUInt32LE(header.length + padding.length);
    return Buffer.concat([Buffer.from('PCLP'), length, header, padding, ...chunks]);
}

let baked = 0;
let before = 0;
let after = 0;
const failed = [];
for (const file of walk(heroDir)) {
    const source = fs.readFileSync(file);
    try {
        const raw = source.buffer.slice(source.byteOffset, source.byteOffset + source.length);
        const object = new THREE.FBXLoader().parse(raw, '');
        if (!object.animations || !object.animations.length) throw new Error('tanpa animasi');
        const output = pack(object.animations[0]);
        fs.writeFileSync(file, output);
        baked++;
        before += source.length;
        after += output.length;
    } catch (err) {
        failed.push(path.basename(file) + ': ' + err.message);
    }
}
console.warn = quiet;
console.log(JSON.stringify({ baked, before, after, failed }));
