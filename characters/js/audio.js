/* Web Audio Synthesizer */
// =====================================================================
// 1. WEB AUDIO SYNTHESIZER (PROCEDURAL SOUND EFFECTS)
// =====================================================================
// Menghasilkan efek suara wolf howl, loncatan, langkah rumput tanpa file eksternal!
class WolfAudioSynthesizer {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.initialized = true;
        } catch (e) {
            console.warn("AudioContext not supported");
        }
    }

    playJump() {
        if (this.muted || !this.ctx) return;
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(380, now + 0.18);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(900, now);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.24);
    }

    playLand() {
        if (this.muted || !this.ctx) return;
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const now = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 0.12;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(450, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start(now);
    }

    playFootstep() {
        if (this.muted || !this.ctx) return;
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(70 + Math.random() * 30, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.06);

        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.08);
    }

    playHowl() {
        if (this.muted || !this.ctx) return;
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const now = this.ctx.currentTime;

        // Suara auman harmonik magis wolf spirit (Ghibli / Genshin Boreas vibe)
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc1.type = 'sawtooth';
        osc2.type = 'sine';

        // Pitch envelope melengkung khas lolongan serigala
        osc1.frequency.setValueAtTime(260, now);
        osc1.frequency.linearRampToValueAtTime(360, now + 0.4);
        osc1.frequency.exponentialRampToValueAtTime(540, now + 0.9);
        osc1.frequency.linearRampToValueAtTime(500, now + 1.6);
        osc1.frequency.exponentialRampToValueAtTime(220, now + 2.3);

        osc2.frequency.setValueAtTime(130, now);
        osc2.frequency.linearRampToValueAtTime(180, now + 0.4);
        osc2.frequency.exponentialRampToValueAtTime(270, now + 0.9);
        osc2.frequency.linearRampToValueAtTime(250, now + 1.6);
        osc2.frequency.exponentialRampToValueAtTime(110, now + 2.3);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(650, now);
        filter.frequency.linearRampToValueAtTime(1800, now + 0.9);
        filter.frequency.exponentialRampToValueAtTime(500, now + 2.3);

        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.35, now + 0.4);
        gain.gain.setValueAtTime(0.35, now + 1.4);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.3);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 2.35);
        osc2.stop(now + 2.35);
    }
}

const soundFX = new WolfAudioSynthesizer();
document.body.addEventListener('click', () => soundFX.init(), { once: true });
document.body.addEventListener('keydown', () => soundFX.init(), { once: true });

