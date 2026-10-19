// =====================================================================
// CHARACTER REGISTRY & VARIATION CATALOG
// =====================================================================
const CHARACTER_CATALOG = [
    {
        id: 'lupus-ignis',
        name: 'Lupus Ignis',
        subtitle: 'Serigala Roh Oranye (Cyber Visor)',
        tag: 'Genshin × Ghibli',
        description: 'Serigala petualang berbulu oranye dengan visor AMOLED Astro Bot dan runic gold aesthetic.',
        active: true,
        rootModel: () => (typeof wolfRoot !== 'undefined' ? wolfRoot : null),
        stats: {
            speed: '12.5 m/s',
            fur: 'Oranye Hangat #F97316',
            visor: 'AMOLED Cyan #00F0FF',
            type: 'Spirit Fox / Wolf'
        }
    },
    {
        id: 'custom-slot-1',
        name: '+ Karakter Baru',
        subtitle: 'Slot Karakter Kustom',
        tag: 'Ekspansi',
        description: 'Slot siap pakai untuk mengimpor model atau variasi karakter baru.',
        active: false,
        rootModel: () => null,
        stats: {
            speed: '--',
            fur: '--',
            visor: '--',
            type: 'Coming Soon'
        }
    }
];

let currentCharacterId = 'lupus-ignis';

function getActiveCharacter() {
    return CHARACTER_CATALOG.find(c => c.id === currentCharacterId) || CHARACTER_CATALOG[0];
}

function selectCharacter(charId) {
    const found = CHARACTER_CATALOG.find(c => c.id === charId);
    if (!found) return;
    if (!found.active) {
        alert('Slot karakter "' + found.name + '" siap untuk dihubungkan dengan model 3D baru di folder models/ !');
        return;
    }
    currentCharacterId = charId;
    console.log('Karakter aktif:', found.name);
}

