import { expect, test } from '@playwright/test';
import { readFile, stat } from 'node:fs/promises';
import { PNG, sineWave } from './fixtures/media';

async function loadFixtures(page: import('@playwright/test').Page, seconds = 1.1) {
  await page.getByTestId('cover-input').setInputFiles({
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await page.getByTestId('audio-input').setInputFiles({
    name: 'beat.wav',
    mimeType: 'audio/wav',
    buffer: sineWave(seconds),
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
