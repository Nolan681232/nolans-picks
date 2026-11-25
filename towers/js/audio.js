export function createAudio() {
  let ctx = null;
  let muted = false;

  function ac() {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, gain, slide = 0) {
    if (muted) return;
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }

  return {
    unlock() {
      try { ac(); } catch { /* autoplay */ }
    },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      return muted;
    },
    jump() { tone(520, 0.12, "sine", 0.05, 180); },
    tag() { tone(180, 0.14, "square", 0.04, -80); },
    score() {
      tone(523, 0.12, "triangle", 0.06);
      setTimeout(() => tone(659, 0.14, "triangle", 0.06), 90);
    },
    bad() { tone(140, 0.22, "sawtooth", 0.035, -60); },
    go() { tone(392, 0.1, "square", 0.04); },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, "triangle", 0.06), i * 120));
    },
  };
}
