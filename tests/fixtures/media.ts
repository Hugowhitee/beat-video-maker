export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR4nGP4z8DAwMAAAAQBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

export function writeWav(samples: Float32Array, sampleRate = 44_100) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + index * 2);
  }
  return buffer;
}

export function sineWave(seconds = 1.1, sampleRate = 44_100) {
  const samples = new Float32Array(Math.floor(seconds * sampleRate));
  for (let index = 0; index < samples.length; index += 1) {
    const t = index / sampleRate;
    const envelope = Math.min(1, t * 8) * Math.min(1, (seconds - t) * 8);
    samples[index] = Math.sin(t * Math.PI * 2 * 110) * 0.18 * Math.max(0, envelope);
  }
  return writeWav(samples, sampleRate);
}

export function clickTrack(bpm = 120, seconds = 14, sampleRate = 44_100) {
  const samples = new Float32Array(Math.floor(seconds * sampleRate));
  const beatSeconds = 60 / bpm;
  const firstBeat = 0.25;
  const burstSamples = Math.floor(0.045 * sampleRate);

  let beat = 0;
  for (let time = firstBeat; time < seconds; time += beatSeconds) {
    const start = Math.floor(time * sampleRate);
    const accent = beat % 4 === 0 ? 1 : 0.55;
    const frequency = beat % 4 === 0 ? 82 : 150;
    for (let index = 0; index < burstSamples && start + index < samples.length; index += 1) {
      const t = index / sampleRate;
      samples[start + index] += Math.sin(t * Math.PI * 2 * frequency) * Math.exp(-t * 55) * accent;
    }
    beat += 1;
  }

  return writeWav(samples, sampleRate);
}

export function steadyTone(seconds = 4, sampleRate = 44_100) {
  const samples = new Float32Array(Math.floor(seconds * sampleRate));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.sin(index / sampleRate * Math.PI * 2 * 220) * 0.12;
  }
  return writeWav(samples, sampleRate);
}
