import { expect, test } from '@playwright/test';

test('Sources accepts multiple local videos and keeps each item removable/retryable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Source-list behavior is viewport-independent.');

  await page.goto('/');

  await page.getByTestId('video-sources-input').setInputFiles([
    {
      name: 'camera-a.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('not-a-real-video-a'),
    },
    {
      name: 'camera-b.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('not-a-real-video-b'),
    },
  ]);

  const rows = page.getByTestId('video-source-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('camera-a.mp4');
  await expect(rows.nth(1)).toContainText('camera-b.mp4');

  await expect(rows.nth(0).getByRole('button', { name: 'Retry' })).toBeVisible({ timeout: 15_000 });
  await expect(rows.nth(1).getByRole('button', { name: 'Retry' })).toBeVisible({ timeout: 15_000 });

  await rows.nth(0).getByTestId('video-source-role').selectOption('intro');
  await expect(rows.nth(0).getByTestId('video-source-role')).toHaveValue('intro');

  await rows.nth(1).getByRole('button', { name: 'Remove' }).click();
  await expect(rows).toHaveCount(1);

  await rows.nth(0).getByRole('button', { name: 'Retry' }).click();
  await expect(rows.nth(0).getByRole('button', { name: 'Retry' })).toBeVisible({ timeout: 15_000 });

  await rows.nth(0).getByRole('button', { name: 'Remove' }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.getByText(/Optional · add one or more clips/i)).toBeVisible();
});
