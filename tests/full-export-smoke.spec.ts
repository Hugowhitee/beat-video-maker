import { expect, test } from '@playwright/test';
import { open, stat } from 'node:fs/promises';
import { PNG, sineWave } from './fixtures/media';

const requestedSeconds = Number(process.env.FULL_EXPORT_SECONDS || 0);

test('release-only sustained export stays finalized and disk-backed', async ({ page }) => {
  test.skip(
    !Number.isFinite(requestedSeconds) || requestedSeconds < 30,
    'Set FULL_EXPORT_SECONDS to at least 30 to run the release smoke.',
  );
  test.setTimeout(20 * 60 * 1000);

  await page.goto('/');
  await page.getByTestId('cover-input').setInputFiles({
    name: 'full-export-cover.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await page.getByTestId('audio-input').setInputFiles({
    name: 'full-export-beat.wav',
    mimeType: 'audio/wav',
    buffer: sineWave(requestedSeconds),
  });
  await expect(page.getByText(/Audio ready/)).toBeVisible();

  const exportButton = page.getByTestId('export-button');
  if (await exportButton.isDisabled()) {
    test.skip(true, 'No supported encoder on this runner.');
  }

  const downloadPromise = page.waitForEvent('download', { timeout: 20 * 60 * 1000 });
  await exportButton.click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  const file = await stat(path!);
  expect(file.size).toBeGreaterThan(1_000);

  const handle = await open(path!, 'r');
  const header = Buffer.alloc(8);
  try {
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }

  const name = download.suggestedFilename();
  if (name.endsWith('.mp4')) {
    expect(header.subarray(4, 8).toString('ascii')).toBe('ftyp');
  } else {
    expect([...header.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  }

  const status = page.getByTestId('export-status');
  await expect(status).toContainText(/encoded and downloaded/);
  await expect(status).toContainText('disk-backed render');

  console.log(
    '[full-export-smoke] seconds=' + requestedSeconds
      + ' bytes=' + file.size
      + ' target=opfs',
  );
});
