/* Dipanggil api/export-game.php: node build-js.js <tugas.json>
   Tugas: { engineIn, engineOut, vaultIn, vaultOut }
   Engine diminifikasi; nama global tetap karena kode saling memanggil lewat window dan typeof.
   Pemuat aset diobfuscate penuh; loop game tidak ikut agar FPS tidak turun. */
const fs = require('fs');
const { minify } = require('terser');
const JavaScriptObfuscator = require('javascript-obfuscator');

(async () => {
    const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

    const engine = await minify(fs.readFileSync(job.engineIn, 'utf8'), {
        toplevel: false,
        compress: { passes: 1 },
        mangle: true,
        format: { comments: false }
    });
    fs.writeFileSync(job.engineOut, engine.code);

    const vault = JavaScriptObfuscator.obfuscate(fs.readFileSync(job.vaultIn, 'utf8'), {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.3,
        identifierNamesGenerator: 'hexadecimal',
        stringArray: true,
        stringArrayEncoding: ['rc4'],
        stringArrayThreshold: 1,
        splitStrings: true,
        splitStringsChunkLength: 8,
        selfDefending: false,
        renameGlobals: false,
        transformObjectKeys: true
    });
    fs.writeFileSync(job.vaultOut, vault.getObfuscatedCode());
})().catch((err) => {
    console.error(err && err.stack || err);
    process.exit(1);
});
