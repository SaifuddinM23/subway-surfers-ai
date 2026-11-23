// Procedural Audio Synthesizer using Web Audio API
class AudioSystem {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.bgmOsc = null;
    this.bgmGain = null;
    this.bgmSequenceInterval = null;
    this.bpm = 100;
    this.bgmPlaying = false;
  }

  init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    
    this.ctx = new AudioContextClass();
    this.enabled = true;
    
    // Resume context if suspended (browser autoplay policy)
    if (this.ctx.state === 'suspended') {
      const resume = () => {
        this.ctx.resume();
        window.removeEventListener('click', resume);
        window.removeEventListener('keydown', resume);
      };
      window.addEventListener('click', resume);
      window.addEventListener('keydown', resume);
    }
  }

  toggle() {
    if (!this.ctx) {
      this.init();
    }
    
    this.enabled = !this.enabled;
    
    if (!this.enabled) {
      this.stopBGM();
    } else {
      this.playBGM();
    }
    return this.enabled;
  }

  playCoin() {
    if (!this.enabled || !this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    // Arpeggio chime
    osc.frequency.setValueAtTime(987.77, now); // B5
    osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6
    
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.36);
  }

  playJump() {
    if (!this.enabled || !this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.2);
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.23);
  }

  playSlide() {
    if (!this.enabled || !this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.25);
    
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    
    // Add lowpass filter to make it sound swooshy
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.25);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.29);
  }

  playCrash() {
    if (!this.enabled || !this.ctx) return;
    
    const now = this.ctx.currentTime;
    
    // Low frequency rumbling impact
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(30, now + 0.6);
    
    oscGain.gain.setValueAtTime(0.2, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    
    // Noise buffer for the crash explosion
    const bufferSize = this.ctx.sampleRate * 0.5; // 0.5 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(500, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(30, now + 0.5);
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    osc.start(now);
    noise.start(now);
    
    osc.stop(now + 0.6);
    noise.stop(now + 0.6);
  }

  playBGM() {
    if (!this.enabled || !this.ctx || this.bgmPlaying) return;
    this.bgmPlaying = true;
    
    const bassline = [
      110.00, 110.00, 130.81, 130.81, // A2, A2, C3, C3
      146.83, 146.83, 164.81, 164.81, // D3, D3, E3, E3
      110.00, 110.00, 98.00,  98.00,  // A2, A2, G2, G2
      110.00, 110.00, 110.00, 110.00  // A2, A2, A2, A2
    ];
    
    const melody = [
      440.00, 0, 523.25, 587.33, // A4, 0, C5, D5
      659.25, 0, 587.33, 523.25, // E5, 0, D5, C5
      440.00, 0, 392.00, 440.00, // A4, 0, G4, A4
      0,      0, 0,      0
    ];
    
    let step = 0;
    const stepDuration = 60 / this.bpm / 2; // Eighth notes
    
    this.bgmSequenceInterval = setInterval(() => {
      if (!this.enabled || !this.ctx) {
        this.stopBGM();
        return;
      }
      
      const now = this.ctx.currentTime;
      
      // Play bass note
      const bassFreq = bassline[step % bassline.length];
      if (bassFreq > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(bassFreq, now);
        
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + stepDuration - 0.02);
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, now);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + stepDuration);
      }
      
      // Play melody note
      const melFreq = melody[step % melody.length];
      if (melFreq > 0 && Math.random() > 0.1) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(melFreq, now);
        
        gain.gain.setValueAtTime(0.02, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + stepDuration * 1.5);
        
        // Add a bit of delay/echo vibe
        const delay = this.ctx.createDelay();
        delay.delayTime.value = stepDuration * 0.5;
        const delayGain = this.ctx.createGain();
        delayGain.gain.value = 0.3; // Echo volume
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        // Connect to delay line
        gain.connect(delay);
        delay.connect(delayGain);
        delayGain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + stepDuration * 2);
      }
      
      step++;
    }, stepDuration * 1000);
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmSequenceInterval) {
      clearInterval(this.bgmSequenceInterval);
      this.bgmSequenceInterval = null;
    }
  }
}

export const audioSystem = new AudioSystem();
