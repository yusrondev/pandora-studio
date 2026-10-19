/* Seeded random utilities */
// ==========================================
// PRNG (PSEUDO-RANDOM NUMBER GENERATOR)
// ==========================================
let currentSeed = 0;
let useSeededRandom = false;
const originalRandom = Math.random;

Math.random = function () {
    if (useSeededRandom) {
        currentSeed = (currentSeed * 16807) % 2147483647;
        return (currentSeed - 1) / 2147483646;
    }
    return originalRandom();
};

function setSeed(s) {
    currentSeed = s % 2147483647;
    if (currentSeed <= 0) currentSeed += 2147483646;
    useSeededRandom = true;
}

function resetSeed() {
    useSeededRandom = false;
}
