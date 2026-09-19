import { expect, test } from '@playwright/test';
import { clickTrack, steadyTone } from './fixtures/media';

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
  await expect(page.getByTestId('bpm-input')).toHaveValue('', { timeout: 30_000 });
  await expect(page.getByTestId('bar-offset')).toHaveText('Unverified');
});
