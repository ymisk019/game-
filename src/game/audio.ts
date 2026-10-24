// ===================== الصوت (Audio) =====================
// كل الأصوات تتولد برمجياً بـ Web Audio API بدون أي ملفات خارجية

class AudioSystem {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxGain!: GainNode;
  musicGain!: GainNode;
  crowdGain!: GainNode;
  crowdFilter!: BiquadFilterNode;
  noiseBuf!: AudioBuffer;
  sfxVol = 0.8;
  musicVol = 0.4;
  musicTimer: number | null = null;
  musicStep = 0;
  nextNoteTime = 0;
  crowdLevel = 0.25;

  // يجب تشغيل الصوت بعد تفاعل المستخدم (قيود المتصفح)
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.master);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.musicVol * 0.35;
    this.musicGain.connect(this.master);

    // ضوضاء جاهزة (بنية) لاستعمالها في الجمهور والضربات
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5 * 0.6 + w * 0.12;
    }

    // صوت الجمهور الخلفي: ضوضاء مفلترة مستمرة
    const crowd = ctx.createBufferSource();
    crowd.buffer = this.noiseBuf;
    crowd.loop = true;
    this.crowdFilter = ctx.createBiquadFilter();
    this.crowdFilter.type = 'bandpass';
    this.crowdFilter.frequency.value = 700;
    this.crowdFilter.Q.value = 0.6;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    crowd.connect(this.crowdFilter).connect(this.crowdGain).connect(this.sfxGain);
    crowd.start();
    // تذبذب بسيط في صوت الجمهور ليبدو حياً
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(this.crowdFilter.frequency);
    lfo.start();
  }

  setVolumes(sfx: number, music: number) {
    this.sfxVol = sfx;
    this.musicVol = music;
    if (!this.ctx) return;
    this.sfxGain.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.musicGain.gain.setTargetAtTime(music * 0.35, this.ctx.currentTime, 0.05);
  }

  setCrowd(level: number) {
    this.crowdLevel = level;
    if (!this.ctx) return;
    this.crowdGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.4);
  }

  private noise(dur: number, freq: number, type: BiquadFilterType, vol: number, q = 1, when = 0) {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
    return { f, g, t0 };
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number, dest?: AudioNode) {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest ?? this.sfxGain);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return o;
  }

  // صوت التسديد: ضربة منخفضة + نقرة
  kick(power: number) {
    if (!this.ctx) return;
    this.tone(150, 0.18, 'sine', 0.9 * (0.5 + power * 0.5), 0, 45);
    this.noise(0.08, 2500, 'highpass', 0.5 * (0.4 + power));
  }

  // لمسة خفيفة للكرة أثناء المراوغة
  touch() {
    if (!this.ctx) return;
    this.tone(220, 0.06, 'sine', 0.15, 0, 120);
  }

  // صوت الصد: ارتطام مكتوم
  save() {
    if (!this.ctx) return;
    this.tone(110, 0.25, 'triangle', 0.8, 0, 50);
    this.noise(0.2, 600, 'lowpass', 0.8);
    this.crowdSwell(0.6, 1.2);
  }

  // ارتطام بالقائم: رنين معدني
  post() {
    if (!this.ctx) return;
    [523, 1046, 1568].forEach((f, i) => this.tone(f, 0.6 - i * 0.12, 'sine', 0.35 / (i + 1)));
    this.noise(0.05, 4000, 'highpass', 0.4);
    this.crowdSwell(0.5, 1);
  }

  bounce(v: number) {
    if (!this.ctx) return;
    this.tone(90, 0.1, 'sine', Math.min(0.5, v * 0.06), 0, 50);
  }

  // صافرة الحكم
  whistle(long = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const blasts = long ? [[0, 0.25], [0.32, 0.25], [0.64, 0.7]] : [[0, 0.35]];
    blasts.forEach(([w, d]) => {
      const t0 = ctx.currentTime + w;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 2650;
      const vib = ctx.createOscillator();
      vib.frequency.value = 28;
      const vg = ctx.createGain();
      vg.gain.value = 90;
      vib.connect(vg).connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2700;
      f.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.setValueAtTime(0.25, t0 + d - 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(f).connect(g).connect(this.sfxGain);
      o.start(t0);
      vib.start(t0);
      o.stop(t0 + d + 0.05);
      vib.stop(t0 + d + 0.05);
    });
  }

  // هدف: هدير الجمهور + بوق احتفالي
  goal() {
    if (!this.ctx) return;
    this.crowdSwell(1.4, 3.5);
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => {
      this.tone(n, 0.35, 'sawtooth', 0.12, i * 0.12);
      this.tone(n * 1.005, 0.35, 'square', 0.05, i * 0.12);
    });
    this.tone(1046, 0.9, 'sawtooth', 0.12, 0.5);
  }

  // تضخيم صوت الجمهور مؤقتاً
  crowdSwell(amount: number, dur: number) {
    if (!this.ctx) return;
    const { g, f, t0 } = this.noise(dur, 900, 'bandpass', 0.001, 0.5);
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.001, t0);
    g.gain.exponentialRampToValueAtTime(amount, t0 + 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    f.frequency.setValueAtTime(700, t0);
    f.frequency.linearRampToValueAtTime(1300, t0 + 0.4);
  }

  // تكتكة العد التنازلي
  beep(high = false) {
    if (!this.ctx) return;
    this.tone(high ? 1320 : 880, high ? 0.4 : 0.15, 'square', 0.15);
  }

  click() {
    if (!this.ctx) return;
    this.tone(660, 0.05, 'triangle', 0.15);
  }

  // شحن القوة: نغمة صاعدة خفيفة
  charge(p: number) {
    if (!this.ctx) return;
    this.tone(300 + p * 600, 0.05, 'sine', 0.05);
  }

  // ===== الموسيقى: لحن إلكتروني بسيط يتولد على مراحل =====
  startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleMusic() {
    if (!this.ctx) return;
    const stepDur = 60 / 118 / 2; // ثُمن نوتة
    const bass = [45, 45, 57, 45, 43, 43, 55, 43, 41, 41, 53, 41, 43, 43, 55, 47];
    const arp = [69, 72, 76, 72, 67, 71, 74, 71, 65, 69, 72, 69, 67, 71, 74, 79];
    const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
      const s = this.musicStep % 16;
      const when = this.nextNoteTime - this.ctx.currentTime;
      this.tone(mtof(bass[s]), stepDur * 0.9, 'triangle', 0.5, when, undefined, this.musicGain);
      if (s % 2 === 0) this.tone(mtof(arp[(s + Math.floor(this.musicStep / 16) * 2) % 16]), stepDur * 1.6, 'square', 0.08, when, undefined, this.musicGain);
      if (s % 4 === 0) {
        // طبلة
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const t0 = this.nextNoteTime;
        o.frequency.setValueAtTime(140, t0);
        o.frequency.exponentialRampToValueAtTime(40, t0 + 0.12);
        g.gain.setValueAtTime(0.6, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
        o.connect(g).connect(this.musicGain);
        o.start(t0);
        o.stop(t0 + 0.2);
      }
      this.nextNoteTime += stepDur;
      this.musicStep++;
    }
  }
}

export const audio = new AudioSystem();
