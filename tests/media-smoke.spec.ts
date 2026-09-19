import { expect, test } from '@playwright/test';
import { readFile, stat } from 'node:fs/promises';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR4nGP4z8DAwMAAAAQBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

function makeWave(seconds = 1.1, sampleRate = 44_100) {
  const sampleCount = Math.floor(seconds * sampleRate);
  const dataSize = sampleCount * 2;
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

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t * 8) * Math.min(1, (seconds - t) * 8);
    const sample = Math.sin(t * Math.PI * 2 * 110) * 0.18 * Math.max(0, envelope);
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  return buffer;
}

async function loadFixtures(page: import('@playwright/test').Page, seconds = 1.1) {
  await page.getByTestId('cover-input').setInputFiles({
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await page.getByTestId('audio-input').setInputFiles({
    name: 'beat.wav',
    mimeType: 'audio/wav',
    buffer: makeWave(seconds),
  });
  await expect(page.getByText(/Audio ready/)).toBeVisible();
}

test('imports local media and encodes a real browser-supported video', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Media export is viewport-independent.');

  await page.goto('/');
  await loadFixtures(page);
  await page.getByTestId('title-input').fill('CI export smoke');
  await page.getByTestId('brand-input').fill('local only');

  const exportButton = page.getByTestId('export-button');
  const disabled = await exportButton.isDisabled();

  if (disabled) {
    console.log('[media-smoke] result=codec-gated');
    await expect(page.getByTestId('export-status')).toContainText(/unavailable|No supported/i);
    return;
  }

  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
  await exportButton.click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  const file = await stat(path!);
  expect(file.size).toBeGreaterThan(1_000);
  const bytes = await readFile(path!);
  const name = download.suggestedFilename();

  if (name.endsWith('.mp4')) {
    expect(bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
    console.log('[media-smoke] result=encoded-mp4 bytes=' + file.size);
  } else {
    expect([...bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    console.log('[media-smoke] result=encoded-webm bytes=' + file.size);
  }

  await expect(page.getByTestId('export-status')).toContainText(/encoded and downloaded/);
});

test('an in-progress export can be cancelled without keeping a partial file', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Media export is viewport-independent.');

  await page.goto('/');
  await loadFixtures(page, 5);

  const exportButton = page.getByTestId('export-button');
  if (await exportButton.isDisabled()) {
    test.skip(true, 'No supported encoder on this runner.');
  }

  await exportButton.click();
  await expect(exportButton).toContainText('Cancel');
  await exportButton.click();

  await expect(page.getByTestId('export-status')).toContainText('Export cancelled');
  await expect(exportButton).not.toContainText('Cancel');
});
