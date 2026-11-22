/**
 * Original generative ambient score (Web Audio API) – no copyrighted material.
 * Thai pentatonic "ranat"-like plucks, a soft khong gong, a warm drone and gentle water noise.
 */
const PENTATONIC = [0, 2, 4, 7, 9]; // C D E G A
const BASE_MIDI = 62; // D4

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AmbientMusic {
  private ctx: AudioContext;
  private master: GainNode;
  private reverb: ConvolverNode;
  private wet: GainNode;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private phrase: number[] = [];
  private noise: AudioBufferSourceNode | null = null;
  private drones: OscillatorNode[] = [];
  private rand: () => number;

  constructor() {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(this.ctx.destination);

    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.55;
    this.reverb.connect(this.wet).connect(this.master);

    let s = 20261124;
    this.rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }

  private impulse(seconds: number) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  private startBed() {
    // water: brown noise through a moving low-pass
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.2;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(lp.frequency);
    const g = this.ctx.createGain();
    g.gain.value = 0.16;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    lfo.start();
    this.noise = src;

    // drone
    for (const [midi, vol] of [
      [38, 0.05],
      [45, 0.035],
      [50, 0.02],
    ] as const) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = midiToHz(midi);
      const og = this.ctx.createGain();
      og.gain.value = vol;
      const trem = this.ctx.createOscillator();
      trem.frequency.value = 0.11 + this.rand() * 0.08;
      const tg = this.ctx.createGain();
      tg.gain.value = vol * 0.5;
      trem.connect(tg).connect(og.gain);
      o.connect(og);
      og.connect(this.master);
      og.connect(this.reverb);
      o.start();
      trem.start();
      this.drones.push(o, trem);
    }
  }

  private pluck(time: number, midi: number, velocity: number) {
    const f = midiToHz(midi);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(0.22 * velocity, time + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 1.6);
    const tone = this.ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    const o1 = this.ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = f;
    const o2 = this.ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = f * 2.01;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.3;
    o1.connect(tone);
    o2.connect(g2).connect(tone);
    tone.connect(env);
    env.connect(this.master);
    env.connect(this.reverb);
    o1.start(time);
    o2.start(time);
    o1.stop(time + 1.7);
    o2.stop(time + 1.7);
  }

  private gong(time: number) {
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(0.16, time + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 5);
    for (const [ratio, amp] of [
      [1, 1],
      [2.76, 0.3],
      [5.4, 0.12],
    ] as const) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = midiToHz(43) * ratio;
      const g = this.ctx.createGain();
      g.gain.value = amp;
      o.connect(g).connect(env);
      o.start(time);
      o.stop(time + 5.2);
    }
    env.connect(this.master);
    env.connect(this.reverb);
  }

  private newPhrase() {
    const len = 8;
    const phrase: number[] = [];
    let idx = Math.floor(this.rand() * PENTATONIC.length);
    for (let i = 0; i < len; i++) {
      idx = Math.max(0, Math.min(9, idx + Math.round((this.rand() - 0.5) * 3)));
      phrase.push(this.rand() < 0.22 ? -1 : idx);
    }
    phrase[len - 1] = this.rand() < 0.5 ? 0 : 5;
    this.phrase = phrase;
  }

  private schedule = () => {
    const stepDur = 60 / 70 / 2; // eighth notes at 70 BPM
    while (this.nextTime < this.ctx.currentTime + 0.4) {
      if (this.step % 16 === 0) this.newPhrase();
      const deg = this.phrase[this.step % 8];
      if (deg >= 0) {
        const octave = Math.floor(deg / 5);
        const midi = BASE_MIDI + PENTATONIC[deg % 5] + octave * 12;
        const swing = this.step % 2 ? 0.03 : 0;
        this.pluck(this.nextTime + swing, midi, 0.6 + this.rand() * 0.4);
        if (this.rand() < 0.18) this.pluck(this.nextTime + stepDur * 0.5, midi + 12, 0.35);
      }
      if (this.step % 32 === 0) this.gong(this.nextTime);
      this.nextTime += stepDur;
      this.step++;
    }
  };

  async start(volume: number) {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.noise) this.startBed();
    if (this.timer == null) {
      this.nextTime = this.ctx.currentTime + 0.1;
      this.timer = window.setInterval(this.schedule, 120);
    }
    this.setVolume(volume, 1.5);
  }

  setVolume(volume: number, fade = 0.25) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, volume)), t + fade);
  }

  async pause() {
    this.setVolume(0, 0.6);
    await new Promise((r) => setTimeout(r, 650));
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ctx.state === "running") await this.ctx.suspend();
  }

  close() {
    if (this.timer != null) clearInterval(this.timer);
    this.noise?.stop();
    this.drones.forEach((d) => d.stop());
    void this.ctx.close();
  }
}
