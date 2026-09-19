import { expect, test } from '@playwright/test';

function writeWav(samples: Float32Array, sampleRate = 44_100) {
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

function clickTrack(bpm = 120, seconds = 14, sampleRate = 44_100) {
  const samples = new Float32Array(Math.floor(seconds * sampleRate));
  const beatSeconds = 60 / bpm;
  const firstBeat = 0.25;
  const burstSeconds = 0.045;
  const burstSamples = Math.floor(burstSeconds * sampleRate);

  let beat = 0;
  for (let time = firstBeat; time < seconds; time += beatSeconds) {
    const start = Math.floor(time * sampleRate);
    const accent = beat % 4 === 0 ? 1 : 0.55;
    const frequency = beat % 4 === 0 ? 82 : 150;
    for (let index = 0; index < burstSamples && start + index < samples.length; index += 1) {
      const t = index / sampleRate;
      const envelope = Math.exp(-t * 55);
      samples[start + index] += Math.sin(t * Math.PI * 2 * frequency) * envelope * accent;
    }
    beat += 1;
  }

  return writeWav(samples, sampleRate);
}

function steadyTone(seconds = 4, sampleRate = 44_100) {
  const samples = new Float32Array(Math.floor(seconds * sampleRate));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.sin(index / sampleRate * Math.PI * 2 * 220) * 0.12;
  }
  return writeWav(samples, sampleRate);
}

test('detects a synthetic 120 BPM grid and keeps manual correction available', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Analysis is viewport-independent.');

  await page.goto('/');
  await page.getByTestId('audio-input').setInputFiles({
    name: '120-bpm-accented.wav',
    mimeType: 'audio/wav',
    buffer: clickTrack(),
  });

  const card = page.getByTestId('analysis-card');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('bpm-input')).not.toHaveValue('', { timeout: 30_000 });

  const bpm = Number(await page.getByTestId('bpm-input').inputValue());
  expect(bpm).toBeGreaterThanOrEqual(118);
  expect(bpm).toBeLessThanOrEqual(122);

  await page.getByTestId('bpm-input').fill('121.5');
  await expect(page.getByTestId('bpm-input')).toHaveValue('121.5');

  await page.getByRole('button', { name: 'Set here' }).click();
  await expect(page.getByTestId('bar-offset')).not.toHaveText('Unverified');
});

test('does not invent a confident BPM for a steady tone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Analysis is viewport-independent.');

  await page.goto('/');
  await page.getByTestId('audio-input').setInputFiles({
    name: 'steady-tone.wav',
    mimeType: 'audio/wav',
    buffer: steadyTone(),
  });

  await expect(page.getByTestId('analysis-card')).toBeVisible();
  await expect(page.getByText(/Tempo uncertain|LOW confidence|No reliable/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('bar-offset')).toHaveText('Unverified');
});
