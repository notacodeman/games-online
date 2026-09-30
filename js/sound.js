// Sound effects, made with the Web Audio API so there are no files to load. Browsers only allow sound after the
// person has clicked something, so the audio context is created on the first click (unlock()).
// The main two: a soft tick every time a turn ends, and a chime when it becomes your turn.

import { store } from './util.js';

const VOLUME = 0.35;   // master volume, 0–1
let context = null;
let master = null;
let muted = store.get('muted', false);

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  store.set('muted', value);
}

export function unlock() {
  if (!context) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = VOLUME;
    master.connect(context.destination);
  }
  if (context.state === 'suspended') context.resume();
}
document.addEventListener('pointerdown', unlock, { capture: true });
document.addEventListener('keydown', unlock, { capture: true });

// One note: frequency in Hz, start offset and length in seconds, with a quick fade in and out so it doesn't click.
function tone(freq, start, length, { type = 'sine', gain = 0.5, slideTo = null } = {}) {
  const t = context.currentTime + start;
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(amp).connect(master);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

// A burst of filtered noise: the sound of a card sliding or snapping down.
function noise(start, length, { freq = 2000, q = 1, gain = 0.4 } = {}) {
  const t = context.currentTime + start;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * length), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const amp = context.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  amp.gain.value = gain;
  source.connect(filter).connect(amp).connect(master);
  source.start(t);
}

const SOUNDS = {
  // a turn ended (anyone's): short, soft, two-step tick
  turnEnd: () => { tone(880, 0, 0.07, { gain: 0.18 }); tone(660, 0.06, 0.09, { gain: 0.14 }); },
  // it's your turn now: bright rising three-note chime
  yourTurn: () => {
    tone(523.25, 0, 0.18, { type: 'triangle', gain: 0.4 });
    tone(659.25, 0.09, 0.18, { type: 'triangle', gain: 0.4 });
    tone(783.99, 0.18, 0.32, { type: 'triangle', gain: 0.45 });
  },
  play: () => noise(0, 0.07, { freq: 2600, q: 0.8, gain: 0.55 }),
  draw: () => noise(0, 0.16, { freq: 1200, q: 0.6, gain: 0.35 }),
  lastCard: () => { tone(988, 0, 0.12, { type: 'square', gain: 0.15 }); tone(1319, 0.12, 0.2, { type: 'square', gain: 0.15 }); },
  caught: () => tone(220, 0, 0.35, { type: 'sawtooth', gain: 0.2, slideTo: 110 }),
  roundOver: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.1, 0.3, { type: 'triangle', gain: 0.35 })),
  error: () => tone(180, 0, 0.12, { type: 'square', gain: 0.1 }),
};

export function play(name, delay = 0) {
  if (muted || !context || context.state !== 'running' || !SOUNDS[name]) return;
  if (delay) setTimeout(() => SOUNDS[name](), delay);
  else SOUNDS[name]();
}
