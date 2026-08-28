const NOTES = {
  collect: [659.25, 987.77],
  jump: [329.63, 493.88],
  stomp: [220, 329.63],
  checkpoint: [523.25, 659.25, 783.99],
  hurt: [196, 146.83],
  win: [523.25, 659.25, 783.99, 1046.5],
};

export class AudioManager {
  constructor() {
    this.context = null;
    this.master = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  async enable() {
    if (!this.context) {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.75;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.75, this.context.currentTime, 0.03);
    }
  }

  play(name) {
    if (!this.context || !this.master || this.muted) return;
    const notes = NOTES[name];
    if (!notes) return;
    notes.forEach((frequency, index) => {
      this.tone(frequency, 0.07 + index * 0.018, index * 0.055, name === "hurt" ? "sawtooth" : "sine");
    });
  }

  tone(frequency, duration, delay = 0, type = "sine", volume = 0.09) {
    if (!this.context || !this.master || this.muted) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  startMusic() {
    if (this.musicTimer) return;
    const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 392];
    this.musicTimer = window.setInterval(() => {
      if (!this.muted && this.context?.state === "running") {
        this.tone(melody[this.musicStep % melody.length], 0.22, 0, "triangle", 0.025);
        if (this.musicStep % 2 === 0) {
          this.tone(melody[this.musicStep % melody.length] / 2, 0.28, 0, "sine", 0.018);
        }
      }
      this.musicStep += 1;
    }, 360);
  }

  stopMusic() {
    window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}
