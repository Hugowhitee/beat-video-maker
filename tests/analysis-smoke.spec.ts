import { expect, test } from '@playwright/test';
import { clickTrack, steadyTone } from './fixtures/media';

test('uses the upstream detector for 120 BPM and keeps bar 1 manual', async ({ page }, testInfo) => {
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
  await expect(page.getByTestId('bar-offset')).toHaveText('Unverified');
  await expect(card).not.toContainText('HIGH');

  await page.getByTestId('bpm-half').click();
  const halfBpm = Number(await page.getByTestId('bpm-input').inputValue());
  expect(halfBpm).toBeGreaterThanOrEqual(59);
  expect(halfBpm).toBeLessThanOrEqual(61);

  await page.getByTestId('bpm-double').click();
  const restoredBpm = Number(await page.getByTestId('bpm-input').inputValue());
  expect(restoredBpm).toBeGreaterThanOrEqual(118);
  expect(restoredBpm).toBeLessThanOrEqual(122);

  await page.getByTestId('bpm-input').fill('121.5');
  await page.getByTestId('bpm-input').press('Enter');
  await expect(page.getByTestId('bpm-input')).toHaveValue('121.5');
  await expect(card).toContainText('Manual tempo');

  await page.keyboard.press('KeyB');
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


test('keyboard transport seeks without hijacking focused form controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Keyboard transport is viewport-independent.');

  await page.goto('/');
  await page.getByTestId('audio-input').setInputFiles({
    name: 'keyboard-transport.wav',
    mimeType: 'audio/wav',
    buffer: clickTrack(120, 8),
  });

  await expect(page.getByTestId('bpm-input')).not.toHaveValue('', { timeout: 30_000 });
  await page.getByTestId('bpm-input').press('Enter');

  const seek = page.getByTestId('seek-input');
  await page.keyboard.press('ArrowRight');
  expect(Number(await seek.inputValue())).toBeGreaterThanOrEqual(0.9);

  await page.keyboard.press('Home');
  expect(Number(await seek.inputValue())).toBeLessThan(0.01);

  await page.keyboard.press('Shift+ArrowRight');
  const barSeek = Number(await seek.inputValue());
  expect(barSeek).toBeGreaterThanOrEqual(1.8);
  expect(barSeek).toBeLessThanOrEqual(2.2);

  await page.keyboard.press('Home');
  await page.getByTestId('bpm-input').focus();
  await page.keyboard.press('ArrowRight');
  expect(Number(await seek.inputValue())).toBeLessThan(0.01);
});
