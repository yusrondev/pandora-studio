/* =========================================================
   UNGGAH MODEL 3D KE PROJECT (assets/imported/)
   File dikirim dalam potongan 2 MB. Satu request besar melewati batas unggah PHP (post_max_size,
   bawaan 8 MB): PHP lalu membuang isinya dan membalas peringatan HTML, yang di klien muncul sebagai
   "Unexpected token '<' ... is not valid JSON". Potongan kecil selalu di bawah batas itu.
   ========================================================= */
const MODEL_UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024;

// Balasan selalu dibaca sebagai teks dulu, supaya halaman error server tampil sebagai pesan yang terbaca
async function readModelUploadResponse(res) {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch (err) {
        const plain = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        throw new Error(`Server tidak membalas data yang valid (HTTP ${res.status})${plain ? ': ' + plain.slice(0, 180) : ''}`);
    }
}

const PandoraModelUpload = {
    // onProgress(0..1) dipanggil tiap potongan terkirim. Mengembalikan path file di project.
    async upload(arrayBuffer, onProgress) {
        if (!arrayBuffer || arrayBuffer.byteLength === 0) throw new Error('Data model 3D kosong');
        const bytes = new Uint8Array(arrayBuffer);
        const total = Math.max(1, Math.ceil(bytes.length / MODEL_UPLOAD_CHUNK_BYTES));
        const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
        let json = null;
        for (let index = 0; index < total; index++) {
            const part = bytes.subarray(index * MODEL_UPLOAD_CHUNK_BYTES, Math.min(bytes.length, (index + 1) * MODEL_UPLOAD_CHUNK_BYTES));
            const res = await fetch(`api/upload-model.php?upload=${id}&index=${index}&total=${total}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-pandora-model' },
                body: part
            });
            json = await readModelUploadResponse(res);
            if (!res.ok || !json || !json.success) {
                throw new Error((json && json.error) || `Gagal mengunggah potongan ${index + 1}/${total} (HTTP ${res.status})`);
            }
            if (typeof onProgress === 'function') onProgress((index + 1) / total);
        }
        if (!json || !json.file) throw new Error('Server tidak mengembalikan path file model');
        return json.file;
    }
};
window.PandoraModelUpload = PandoraModelUpload;
