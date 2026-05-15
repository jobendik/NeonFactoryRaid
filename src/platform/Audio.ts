// Minimal WebAudio synth placeholder. A full audio bus (per §20) arrives later;
// for now this exists so the extraction "moment" has the rising chord that §7.7 calls for.

type AudioContextCtor = new () => AudioContext;

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  const C = w.AudioContext ?? w.webkitAudioContext;
  if (!C) return null;
  try {
    ctx = new C();
    return ctx;
  } catch {
    return null;
  }
}

export function playRisingChord(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const now = c.currentTime;
  const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5 - major arpeggio
  for (let i = 0; i < notes.length; i++) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = notes[i];
    osc.type = 'triangle';
    osc.connect(gain).connect(c.destination);
    const start = now + i * 0.08;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
    osc.start(start);
    osc.stop(start + 0.6);
  }
}
