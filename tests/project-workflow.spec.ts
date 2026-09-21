import { expect, test } from '@playwright/test';
import { PNG, sineWave } from './fixtures/media';

test('project output settings drive the real preview geometry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Project settings behavior is viewport-independent.');

  await page.goto('/?fixture=1');

  const outputButton = page.getByTestId('output-settings-button');
  await expect(outputButton).toContainText('1920×1080 · 30 fps');

  await outputButton.click();
  await expect(page.getByTestId('project-settings-dialog')).toBeVisible();
  await page.getByTestId('output-format-shorts').click();
  await page.getByTestId('output-fps').selectOption('60');
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(outputButton).toContainText('1080×1920 · 60 fps');

  const ratio = await page.getByTestId('preview-canvas').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.width / rect.height;
  });
  expect(ratio).toBeCloseTo(9 / 16, 2);
});

test('project fill is a real compositor choice and remains undoable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Project rendering is viewport-independent.');

  await page.goto('/?fixture=1');
  const canvas = page.getByTestId('preview-canvas');
  const before = await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL('image/png'));

  await page.getByTestId('output-settings-button').click();
  await page.getByTestId('fill-black').click();
  await page.getByRole('button', { name: 'Done' }).click();

  await expect.poll(async () =>
    canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL('image/png')),
  ).not.toBe(before);

  await page.getByTestId('undo-button').click();
  await page.getByTestId('output-settings-button').click();
  await expect(page.getByTestId('fill-blur')).toHaveClass(/is-active/);
});

test('one media intake accepts image and beat without hunting separate controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Media intake is viewport-independent.');

  await page.goto('/');
  await page.getByTestId('media-intake-input').setInputFiles([
    {
      name: 'dropped-cover.png',
      mimeType: 'image/png',
      buffer: PNG,
    },
    {
      name: 'dropped-beat.wav',
      mimeType: 'audio/wav',
      buffer: sineWave(2),
    },
  ]);

  const sources = page.getByRole('complementary', { name: 'Sources' });
  await expect(sources.getByText('dropped-cover.png')).toBeVisible();
  await expect(sources.getByText('dropped-beat.wav')).toBeVisible();
  await expect(sources.getByText(/Audio ready/)).toBeVisible();
});

test('empty preview is an actual media action', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'File chooser behavior is viewport-independent.');

  await page.goto('/');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('empty-media-action').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'clicked-cover.png',
    mimeType: 'image/png',
    buffer: PNG,
  });

  await expect(page.getByText('clicked-cover.png')).toBeVisible();
});


test('project output settings persist independently from style templates', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Project persistence is viewport-independent.');

  await page.goto('/');
  await page.getByTestId('output-settings-button').click();
  await page.getByTestId('output-format-square').click();
  await page.getByTestId('output-fps').selectOption('25');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('output-settings-button')).toContainText('1080×1080 · 25 fps');

  await page.reload();
  await expect(page.getByTestId('output-settings-button')).toContainText('1080×1080 · 25 fps');
});
