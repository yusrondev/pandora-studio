/* Dipanggil api/export-game.php: node compress-hero-textures.js <folder-build>
   Model hero (hero/<id>/idle.fbx) membawa tekstur PNG/JPEG tertanam 2048px, yang di GPU menjadi RGBA mentah (±21 MB).
   Gambar tertanam diambil, disimpan sebagai KTX2 di sebelah file FBX (idle-tex0.ktx2), lalu di dalam FBX diganti
   gambar 4x4 supaya file lebih kecil. Runtime (PandoraAssetCache.loadFBX) memasang KTX2 itu ke material.
   Keluaran stdout baris terakhir: JSON { textures: { 'hero/red/idle.fbx': [{ name, file }] }, vramBeforeMB, vramAfterMB, failed } */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Karakter hanya mengisi beberapa ratus piksel layar; 1024 tetap tajam dan file KTX2 tidak membengkakkan APK
const MAX_TEXTURE = 1024;
const MAGIC = 'Kaydara FBX Binary  \0';

// ---------- Baca/tulis FBX biner: properti disimpan mentah, hanya ukuran node yang dihitung ulang ----------
function readNodes(buf, version) {
    const wide = version >= 7500;
    const headerSize = wide ? 25 : 13;
    let pos = 27;

    function readProp() {
        const start = pos;
        const type = String.fromCharCode(buf[pos++]);
        let value = null;
        switch (type) {
            case 'Y': pos += 2; break;
            case 'C': pos += 1; break;
            case 'I': case 'F': pos += 4; break;
            case 'D': pos += 8; break;
            case 'L': value = Number(buf.readBigInt64LE(pos)); pos += 8; break;
            case 'S': case 'R': {
                const len = buf.readUInt32LE(pos);
                value = buf.subarray(pos + 4, pos + 4 + len);
                pos += 4 + len;
                break;
            }
            case 'f': case 'd': case 'l': case 'i': case 'b': case 'c': {
                const compressedLength = buf.readUInt32LE(pos + 8);
                pos += 12 + compressedLength;
                break;
            }
            default: throw new Error('Tipe properti FBX tidak dikenal: ' + type);
        }
        return { type, value, raw: buf.subarray(start, pos) };
    }

    function readNode() {
        const start = pos;
        const endOffset = wide ? Number(buf.readBigUInt64LE(pos)) : buf.readUInt32LE(pos);
        const numProps = wide ? Number(buf.readBigUInt64LE(pos + 8)) : buf.readUInt32LE(pos + 4);
        const nameLen = buf[pos + headerSize - 1];
        pos += headerSize;
        const name = buf.toString('latin1', pos, pos + nameLen);
        pos += nameLen;
        if (endOffset === 0) return null; // null-record
        const props = [];
        for (let i = 0; i < numProps; i++) props.push(readProp());
        const children = [];
        let hasNull = false;
        while (pos < endOffset) {
            const child = readNode();
            if (child === null) { hasNull = true; break; }
            children.push(child);
        }
        if (pos !== endOffset) throw new Error('Struktur FBX tidak sesuai di node ' + name + ' (' + start + ')');
        return { name, props, children, hasNull };
    }

    const nodes = [];
    for (;;) {
        const node = readNode();
        if (node === null) break;
        nodes.push(node);
    }
    return { nodes, footer: buf.subarray(pos) };
}

function writeNodes(header, version, tree) {
    const wide = version >= 7500;
    const headerSize = wide ? 25 : 13;
    const chunks = [header];
    let offset = header.length;

    function nodeSize(node) {
        let size = headerSize + node.name.length + node.props.reduce((s, p) => s + p.raw.length, 0);
        for (const child of node.children) size += nodeSize(child);
        if (node.hasNull) size += headerSize;
        return size;
    }
    function writeHeader(endOffset, numProps, propLen, name) {
        const head = Buffer.alloc(headerSize);
        if (wide) {
            head.writeBigUInt64LE(BigInt(endOffset), 0);
            head.writeBigUInt64LE(BigInt(numProps), 8);
            head.writeBigUInt64LE(BigInt(propLen), 16);
        } else {
            head.writeUInt32LE(endOffset, 0);
            head.writeUInt32LE(numProps, 4);
            head.writeUInt32LE(propLen, 8);
        }
        head[headerSize - 1] = name.length;
        chunks.push(head, Buffer.from(name, 'latin1'));
        offset += headerSize + name.length;
    }
    function writeNode(node) {
        const end = offset + nodeSize(node);
        const propLen = node.props.reduce((s, p) => s + p.raw.length, 0);
        writeHeader(end, node.props.length, propLen, node.name);
        for (const p of node.props) { chunks.push(p.raw); offset += p.raw.length; }
        for (const child of node.children) writeNode(child);
        if (node.hasNull) { chunks.push(Buffer.alloc(headerSize)); offset += headerSize; }
    }
    for (const node of tree.nodes) writeNode(node);
    chunks.push(Buffer.alloc(headerSize)); // null-record akhir daftar node teratas
    chunks.push(tree.footer);
    return Buffer.concat(chunks);
}

function rawBinaryProp(data) {
    const head = Buffer.alloc(5);
    head.write('R', 0, 'latin1');
    head.writeUInt32LE(data.length, 1);
    return { type: 'R', value: data, raw: Buffer.concat([head, data]) };
}

function stringProp(text) {
    const data = Buffer.from(text, 'latin1');
    const head = Buffer.alloc(5);
    head.write('S', 0, 'latin1');
    head.writeUInt32LE(data.length, 1);
    return { type: 'S', value: data, raw: Buffer.concat([head, data]) };
}

// ---------- Proses satu file idle.fbx ----------
async function processFbx(file, buildRoot, encodeToKTX2, result) {
    const buf = fs.readFileSync(file);
    if (buf.toString('latin1', 0, MAGIC.length) !== MAGIC) return; // FBX ASCII: dibiarkan
    const version = buf.readUInt32LE(23);
    const tree = readNodes(buf, version);
    const objects = tree.nodes.find(n => n.name === 'Objects');
    const connections = tree.nodes.find(n => n.name === 'Connections');
    if (!objects || !connections) return;

    // Video -> Texture (anak -> induk), Texture -> material beserta slotnya
    const links = connections.children.filter(c => c.name === 'C').map(c => ({
        kind: c.props[0].value.toString('latin1'),
        child: c.props[1].value,
        parent: c.props[2].value,
        slot: c.props[3] ? c.props[3].value.toString('latin1') : ''
    }));
    const textures = objects.children.filter(n => n.name === 'Texture');
    const rel = path.relative(buildRoot, file).split(path.sep).join('/');
    const entries = [];
    let index = 0;
    let changed = false;

    for (const video of objects.children.filter(n => n.name === 'Video')) {
        const contentNode = video.children.find(c => c.name === 'Content');
        const content = contentNode && contentNode.props[0] && contentNode.props[0].value;
        if (!content || content.length < 64) continue;
        const videoId = video.props[0].value;
        const textureNodes = links.filter(l => l.child === videoId).map(l => textures.find(t => t.props[0].value === l.parent)).filter(Boolean);
        if (!textureNodes.length) continue;
        const slots = textureNodes.flatMap(t => links.filter(l => l.child === t.props[0].value).map(l => l.slot));
        const isNormal = slots.some(s => /normal|bump/i.test(s));
        const isColor = !isNormal && (slots.length === 0 || slots.some(s => /diffuse|color|emissive/i.test(s)));

        try {
            const meta = await sharp(content).metadata();
            const pot = (v) => Math.max(4, Math.min(MAX_TEXTURE, 2 ** Math.round(Math.log2(v))));
            const width = pot(meta.width);
            const height = pot(meta.height);
            const imageDecoder = async () => {
                const { data, info } = await sharp(content).resize(width, height, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                return { data: new Uint8Array(data), width: info.width, height: info.height };
            };
            const options = {
                isUASTC: true, uastcLDRQualityLevel: 1, needSupercompression: true, generateMipmap: true,
                // FBXLoader mengunggah gambar dengan flipY; tekstur terkompresi tidak bisa di-flip GPU, jadi dibalik di sini
                isYFlip: true,
                isNormalMap: isNormal, isPerceptual: isColor, isSetKTX2SRGBTransferFunc: isColor
            };
            const log = console.log;
            console.log = () => {};
            let ktx;
            try {
                ktx = await encodeToKTX2(content, { ...options, imageDecoder });
            } finally {
                console.log = log;
            }
            const outName = path.basename(file, path.extname(file)) + '-tex' + index++ + '.ktx2';
            fs.writeFileSync(path.join(path.dirname(file), outName), ktx);
            const fileRel = path.posix.join(path.posix.dirname(rel), outName);
            // Nama tekstur di FBX sering kosong; diberi nama unik agar runtime tahu tekstur mana yang diganti
            for (const t of textureNodes) {
                const name = 'pandoraKtx' + entries.length;
                t.props[1] = stringProp(name + '\0\x01Texture');
                entries.push({ name, file: fileRel });
            }

            // Gambar asli diganti 4x4 berformat sama (FBXLoader menebak jenis dari ekstensi nama file)
            const format = meta.format === 'png' ? 'png' : 'jpeg';
            const placeholder = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 128, g: 128, b: 128 } } })[format]().toBuffer();
            contentNode.props[0] = rawBinaryProp(placeholder);
            changed = true;
            result.vramBefore += meta.width * meta.height * 4 * 4 / 3;
            result.vramAfter += width * height * 4 / 3; // UASTC -> ASTC/ETC2/BC7: 1 byte per piksel
        } catch (err) {
            result.failed.push(rel + ': ' + err.message);
        }
    }

    if (!changed) return;
    const out = writeNodes(buf.subarray(0, 27), version, tree);
    // Pastikan hasil tulis bisa dibaca lagi sebelum menimpa file asli
    readNodes(out, version);
    fs.writeFileSync(file, out);
    result.textures[rel] = entries;
}

function findModels(dir, out = []) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) findModels(full, out);
        else if (/^idle\.fbx$/i.test(item.name)) out.push(full);
    }
    return out;
}

(async () => {
    const buildRoot = path.resolve(process.argv[2]);
    const heroDir = path.join(buildRoot, 'hero');
    const result = { textures: {}, vramBefore: 0, vramAfter: 0, failed: [] };
    let encodeToKTX2 = null;
    try {
        ({ encodeToKTX2 } = await import('ktx2-encoder'));
    } catch (err) {
        result.failed.push('ktx2-encoder tidak tersedia (jalankan npm install di tools/protect)');
    }
    if (encodeToKTX2 && fs.existsSync(heroDir)) {
        for (const file of findModels(heroDir)) {
            try {
                await processFbx(file, buildRoot, encodeToKTX2, result);
            } catch (err) {
                result.failed.push(path.relative(buildRoot, file) + ': ' + err.message);
            }
        }
    }
    console.log(JSON.stringify({
        textures: result.textures,
        vramBeforeMB: Math.round(result.vramBefore / 1048576),
        vramAfterMB: Math.round(result.vramAfter / 1048576),
        failed: result.failed
    }));
})().catch((err) => {
    console.error(err && err.stack || err);
    process.exit(1);
});
