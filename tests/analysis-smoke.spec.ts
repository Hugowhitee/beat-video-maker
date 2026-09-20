import { expect, test } from '@playwright/test';
import { clickTrack, steadyTone } from './fixtures/media';

test('detects tempo and aligns the downbeat directly on the waveform', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Analysis is viewport-independent.');

  await page.goto('/');
  await page.getByTestId('audio-input').setInputFiles({
    name: '120-bpm-accented.wav',
    mimeType: 'audio/wav',
    buffer: clickTrack(),
  });

  const strip = page.getByTestId('grid-strip');
  await expect(strip).toBeVisible();
  await expect(page.getByTestId('bpm-input')).not.toHaveValue('', { timeout: 30_000 });

  const bpm = Number(await page.getByTestId('bpm-input').inputValue());
  expect(bpm).toBeGreaterThanOrEqual(118);
  expect(bpm).toBeLessThanOrEqual(122);
  await expect(page.getByTestId('bar-offset')).toContainText('not set');
  await expect(page.getByTestId('grid-confidence')).not.toContainText('high');

  await page.getByTestId('bpm-half').click();
  expect(Number(await page.getByTestId('bpm-input').inputValue())).toBeGreaterThanOrEqual(59);

  await page.getByTestId('bpm-double').click();
  const restoredBpm = Number(await page.getByTestId('bpm-input').inputValue());
  expect(restoredBpm).toBeGreaterThanOrEqual(118);
  expect(restoredBpm).toBeLessThanOrEqual(122);

  await page.getByTestId('grid-edit-toggle').click();
  const waveform = page.getByTestId('waveform-editor');
  const box = await waveform.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.22, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.31, box!.y + box!.height / 2, { steps: 4 });
  await page.mouse.up();

  await expect(page.getByTestId('downbeat-handle')).toBeVisible();
  await expect(page.getByTestId('bar-offset')).not.toContainText('not set');

  const beforeUndo = await page.getByTestId('bar-offset').textContent();
  await page.getByTestId('undo-button').click();
  await expect(page.getByTestId('bar-offset')).not.toHaveText(beforeUndo ?? '');

  await page.getByTestId('redo-button').click();
  await expect(page.getByTestId('bar-offset')).toHaveText(beforeUndo ?? '');

  await page.getByTestId('grid-reset').click();
  await expect(page.getByTestId('bar-offset')).toContainText('not set');
  expect(Number(await page.getByTestId('bpm-input').inputValue())).toBeGreaterThanOrEqual(118);
});

test('manual BPM remains editable without turning detector output into a fake manual value', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Analysis is viewport-independent.');

  await page.goto('/');
  await page.getByTestId('audio-input').setInputFiles({
    name: 'manual-tempo.wav',
    mimeType: 'audio/wav',
    buffer: clickTrack(),
  });

  await expect(page.getByTestId('bpm-input')).not.toHaveValue('', { timeout: 30_000 });
  const detected = await page.getByTestId('bpm-input').inputValue();

  await page.getByTestId('bpm-input').fill('121.5');
  await page.getByTestId('bpm-input').press('Enter');
  await expect(page.getByTestId('bpm-input')).toHaveValue('121.5');

  await page.getByTestId('grid-reset').click();
  await expect(page.getByTestId('bpm-input')).toHaveValue(detected);
});

test('does not invent a confident BPM for a steady tone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Analysis is viewport-independent.');

  await page.goto('/');
  await page.getByTestId('audio-input').setInputFiles({
    name: 'steady-tone.wav',
    mimeType: 'audio/wav',
    buffer: steadyTone(),
  });

  await expect(page.getByTestId('grid-strip')).toBeVisible();
  await expect(page.getByTestId('bpm-input')).toHaveValue('', { timeout: 30_000 });
  await expect(page.getByTestId('bar-offset')).toContainText('not set');
});

test('keyboard transport and grid-edit arrows have separate focus behavior', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Keyboard transport is viewport-independent.');

  await page.goto('/');
  await page.getByTestId('audio-input').setInputFiles({
    name: 'keyboard-transport.wav',
    mimeType: 'audio/wav',
    buffer: clickTrack(120, 8),
  });

  await expect(page.getByTestId('bpm-input')).not.toHaveValue('', { timeout: 30_000 });

  const seek = page.getByTestId('seek-input');
  await page.keyboard.press('ArrowRight');
  expect(Number(await seek.inputValue())).toBeGreaterThanOrEqual(0.9);

  await page.keyboard.press('Home');
  expect(Number(await seek.inputValue())).toBeLessThan(0.01);

  await page.getByTestId('set-downbeat').click();
  const firstDownbeat = await page.getByTestId('bar-offset').textContent();
  await page.getByTestId('grid-edit-toggle').click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('bar-offset')).not.toHaveText(firstDownbeat ?? '');

  const seekAfterGridNudge = Number(await seek.inputValue());
  expect(seekAfterGridNudge).toBeLessThan(0.01);

  await page.getByTestId('bpm-input').focus();
  await page.keyboard.press('ArrowRight');
  expect(Number(await seek.inputValue())).toBeLessThan(0.01);
});
