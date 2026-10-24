/* Species & Breed Configurations for Low-Poly Foxes */

const FOX_SPECIES = {
    red: {
        id: 'red',
        name: 'Red Fox',
        subtitle: 'Vulpes vulpes',
        badge: '🦊',
        scale: 0.58,
        colors: {
            ORANGE: new THREE.Color(0xfb6d1b),       // Oranye hangat cerah
            ORANGE_TOP: new THREE.Color(0xee5c11),   // Punggung oranye tua
            EYE_BROW: new THREE.Color(0xcc4709),     // Aksen kemerahan
            WHITE: new THREE.Color(0xfffcf7),        // Putih bulu dada/tenggorokan
            WHITE_SHADE: new THREE.Color(0xf2ece4),  // Bayangan putih lembut
            DARK: new THREE.Color(0x272428),         // Moncong & aksen telinga hitam
            DARK_PAW: new THREE.Color(0x1d1a1e),     // Cakar gelap
            EAR_IN: new THREE.Color(0xa3989c),       // Dalam telinga lembut
            EAR_IN_DEEP: new THREE.Color(0x84797d)   // Rongga dalam telinga
        },
        legGradient: function (t) {
            t = THREE.MathUtils.clamp(t, 0.0, 1.0);
            if (t < 0.25) return new THREE.Color(0xfb6d1b).lerp(new THREE.Color(0xdc5c16), t / 0.25);
            if (t < 0.50) return new THREE.Color(0xdc5c16).lerp(new THREE.Color(0xa23e0e), (t - 0.25) / 0.25);
            if (t < 0.75) return new THREE.Color(0xa23e0e).lerp(new THREE.Color(0x562316), (t - 0.50) / 0.25);
            return new THREE.Color(0x562316).lerp(new THREE.Color(0x1d1a1e), (t - 0.75) / 0.25);
        }
    },

    arctic: {
        id: 'arctic',
        name: 'Arctic Fox',
        subtitle: 'Vulpes lagopus',
        badge: '❄️',
        scale: 0.56,
        colors: {
            ORANGE: new THREE.Color(0xf6f8fc),       // Putih salju primer
            ORANGE_TOP: new THREE.Color(0xe5ecf5),   // Punggung putih es keperakan
            EYE_BROW: new THREE.Color(0xdbe3ee),     // Aksen dahi es lembut
            WHITE: new THREE.Color(0xffffff),        // Putih mutiara murni dada
            WHITE_SHADE: new THREE.Color(0xedf2f9),  // Bayangan salju sejuk
            DARK: new THREE.Color(0x1c1e22),         // Hidung hitam kontras arktik
            DARK_PAW: new THREE.Color(0x282c34),     // Bantalan cakar salju gelap
            EAR_IN: new THREE.Color(0xd5dde8),       // Dalam telinga putih keabuan es
            EAR_IN_DEEP: new THREE.Color(0xb2bdce)   // Rongga dalam telinga
        },
        legGradient: function (t) {
            t = THREE.MathUtils.clamp(t, 0.0, 1.0);
            if (t < 0.35) return new THREE.Color(0xf6f8fc).lerp(new THREE.Color(0xe5ecf5), t / 0.35);
            if (t < 0.70) return new THREE.Color(0xe5ecf5).lerp(new THREE.Color(0xb8c5d6), (t - 0.35) / 0.35);
            return new THREE.Color(0xb8c5d6).lerp(new THREE.Color(0x282c34), (t - 0.70) / 0.30);
        }
    },

    corsac: {
        id: 'corsac',
        name: 'Corsac Fox',
        subtitle: 'Vulpes corsac',
        badge: '🌾',
        scale: 0.54,
        colors: {
            ORANGE: new THREE.Color(0xbfa988),       // Bulu abu-abu keemasan padang rumput
            ORANGE_TOP: new THREE.Color(0xa68f6f),   // Punggung abu-abu kecokelatan pasir
            EYE_BROW: new THREE.Color(0x8a7253),     // Aksen cokelat gurun
            WHITE: new THREE.Color(0xf6f1e8),        // Putih krem dada
            WHITE_SHADE: new THREE.Color(0xe3dbcf),  // Bayangan pasir lembut
            DARK: new THREE.Color(0x2e2723),         // Ujung ekor & moncong gelap
            DARK_PAW: new THREE.Color(0x221c19),     // Cakar gelap
            EAR_IN: new THREE.Color(0xc2b5a5),       // Dalam telinga buff keabuan
            EAR_IN_DEEP: new THREE.Color(0x9d9082)   // Rongga dalam telinga
        },
        legGradient: function (t) {
            t = THREE.MathUtils.clamp(t, 0.0, 1.0);
            if (t < 0.30) return new THREE.Color(0xbfa988).lerp(new THREE.Color(0x9c8567), t / 0.30);
            if (t < 0.65) return new THREE.Color(0x9c8567).lerp(new THREE.Color(0x615243), (t - 0.30) / 0.35);
            return new THREE.Color(0x615243).lerp(new THREE.Color(0x221c19), (t - 0.65) / 0.35);
        }
    },

    swift: {
        id: 'swift',
        name: 'Swift Fox',
        subtitle: 'Vulpes velox',
        badge: '⚡',
        scale: 0.53,
        colors: {
            ORANGE: new THREE.Color(0xe9a656),       // Buff-yellow keemasan terang prairie
            ORANGE_TOP: new THREE.Color(0xd28d3e),   // Punggung cokelat keemasan hangat
            EYE_BROW: new THREE.Color(0xb26e2a),     // Aksen dahi emas
            WHITE: new THREE.Color(0xfefcf7),        // Putih cerah tenggorokan
            WHITE_SHADE: new THREE.Color(0xf2e8da),  // Bayangan krem hangat
            DARK: new THREE.Color(0x2b2420),         // Bercak samping moncong & ujung ekor hitam
            DARK_PAW: new THREE.Color(0x231d1a),     // Cakar gelap
            EAR_IN: new THREE.Color(0xd2beaa),       // Dalam telinga buff muda
            EAR_IN_DEEP: new THREE.Color(0xad9782)   // Rongga dalam telinga
        },
        legGradient: function (t) {
            t = THREE.MathUtils.clamp(t, 0.0, 1.0);
            if (t < 0.30) return new THREE.Color(0xe9a656).lerp(new THREE.Color(0xca883e), t / 0.30);
            if (t < 0.65) return new THREE.Color(0xca883e).lerp(new THREE.Color(0x7c4e23), (t - 0.30) / 0.35);
            return new THREE.Color(0x7c4e23).lerp(new THREE.Color(0x231d1a), (t - 0.65) / 0.35);
        }
    },

    darwin: {
        id: 'darwin',
        name: 'Darwin Fox',
        subtitle: 'Lycalopex fulvipes',
        badge: '🌲',
        scale: 0.56,
        colors: {
            ORANGE: new THREE.Color(0x282b31),       // Abu-abu arang gelap hutan dingin & elegan (senada tone Silver Fox)
            ORANGE_TOP: new THREE.Color(0x1a1c21),   // Punggung arang pekat bertekstur
            EYE_BROW: new THREE.Color(0x5c6270),     // Aksen dahi & pipi perak slate sejuk (bersih, tanpa karat kusam)
            WHITE: new THREE.Color(0xeef2f7),        // Dagu & tenggorokan putih mutiara kontras cerah
            WHITE_SHADE: new THREE.Color(0x9199aa),  // Bayangan putih perak lembut
            DARK: new THREE.Color(0x101114),         // Moncong & ekor hitam legam tegas
            DARK_PAW: new THREE.Color(0x0c0d10),     // Cakar pekat
            EAR_IN: new THREE.Color(0x545a68),       // Dalam telinga perak arang elegan
            EAR_IN_DEEP: new THREE.Color(0x363a44)   // Rongga dalam telinga gelap pekat
        },
        legGradient: function (t) {
            t = THREE.MathUtils.clamp(t, 0.0, 1.0);
            if (t < 0.30) return new THREE.Color(0x3c404b).lerp(new THREE.Color(0x282b31), t / 0.30);
            if (t < 0.70) return new THREE.Color(0x282b31).lerp(new THREE.Color(0x16181d), (t - 0.30) / 0.40);
            return new THREE.Color(0x16181d).lerp(new THREE.Color(0x0c0d10), (t - 0.70) / 0.30);
        }
    },

    fennec: {
        id: 'fennec',
        name: 'Fennec Fox',
        subtitle: 'Vulpes zerda',
        badge: '🏜️',
        scale: 0.50,
        colors: {
            ORANGE: new THREE.Color(0xf6d8ae),       // Pasir krem gurun cerah
            ORANGE_TOP: new THREE.Color(0xe8be87),   // Punggung krem keemasan
            EYE_BROW: new THREE.Color(0xd29d60),     // Aksen gurun lembut
            WHITE: new THREE.Color(0xfffdfa),        // Putih murni dada & dagu
            WHITE_SHADE: new THREE.Color(0xf8f1e5),  // Bayangan pasir lembut
            DARK: new THREE.Color(0x2d2118),         // Moncong & ujung ekor gelap
            DARK_PAW: new THREE.Color(0x241a13),     // Cakar pasir
            EAR_IN: new THREE.Color(0xf2cfc2),       // Dalam telinga lebar khas fennec
            EAR_IN_DEEP: new THREE.Color(0xd49b8a)   // Rongga dalam telinga
        },
        legGradient: function (t) {
            t = THREE.MathUtils.clamp(t, 0.0, 1.0);
            if (t < 0.35) return new THREE.Color(0xf6d8ae).lerp(new THREE.Color(0xe8be87), t / 0.35);
            if (t < 0.70) return new THREE.Color(0xe8be87).lerp(new THREE.Color(0xb58b5a), (t - 0.35) / 0.35);
            return new THREE.Color(0xb58b5a).lerp(new THREE.Color(0x241a13), (t - 0.70) / 0.30);
        }
    },

    silver: {
        id: 'silver',
        name: 'Silver Fox',
        subtitle: 'Vulpes vulpes var.',
        badge: '✨',
        scale: 0.58,
        colors: {
            ORANGE: new THREE.Color(0x25272c),       // Bulu hitam perak gelap
            ORANGE_TOP: new THREE.Color(0x191a1e),   // Punggung hitam arang
            EYE_BROW: new THREE.Color(0x606573),     // Aksen perak dahi
            WHITE: new THREE.Color(0xe9edf5),        // Ujung ekor & leher perak terang
            WHITE_SHADE: new THREE.Color(0x8a92a3),  // Bayangan abu-abu perak
            DARK: new THREE.Color(0x0e0f12),         // Moncong pekat
            DARK_PAW: new THREE.Color(0x0a0b0d),     // Cakar hitam pekat
            EAR_IN: new THREE.Color(0x565c6c),       // Dalam telinga perak gelap
            EAR_IN_DEEP: new THREE.Color(0x383c47)   // Rongga dalam telinga
        },
        legGradient: function (t) {
            t = THREE.MathUtils.clamp(t, 0.0, 1.0);
            if (t < 0.30) return new THREE.Color(0x3c404b).lerp(new THREE.Color(0x25272c), t / 0.30);
            if (t < 0.70) return new THREE.Color(0x25272c).lerp(new THREE.Color(0x15161a), (t - 0.30) / 0.40);
            return new THREE.Color(0x15161a).lerp(new THREE.Color(0x0a0b0d), (t - 0.70) / 0.30);
        }
    }
};

// Alias sinkronisasi nama spesies Golden <-> Swift
FOX_SPECIES.golden = FOX_SPECIES.swift;

let currentFoxSpeciesKey = 'red';
