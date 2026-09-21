import { expect, test } from '@playwright/test';
import { PNG, sineWave } from './fixtures/media';

test('authoring controls stay grouped in Inspector instead of Sources', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Panel grouping is viewport-independent.');

  await page.goto('/?fixture=1');

  const sources = page.getByRole('complementary', { name: 'Sources' });
  const inspector = page.getByRole('complementary', { name: 'Inspector' });

  await expect(inspector.getByTestId('inspector-look')).toBeVisible();
  await inspector.getByTestId('inspector-tab-text').click();
  await expect(inspector.getByTestId('title-input')).toBeVisible();
  const brandDisclosure = inspector.getByTestId('brand-disclosure');
  await brandDisclosure.locator('summary').click();
  await expect(inspector.getByTestId('brand-input')).toBeVisible();
  await expect(inspector.getByTestId('brand-graphic-input')).toHaveCount(1);
  await expect(sources.getByTestId('title-input')).toHaveCount(0);
  await expect(sources.getByTestId('brand-input')).toHaveCount(0);
});

test('Inspector exposes one authoring family at a time', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Inspector context is viewport-independent.');

  await page.goto('/?fixture=1');

  await expect(page.getByTestId('inspector-look')).toBeVisible();
  await expect(page.getByTestId('title-input')).toHaveCount(0);
  await expect(page.getByTestId('effects-control')).toHaveCount(0);

  await page.getByTestId('inspector-tab-effects').click();
  await expect(page.getByTestId('effects-control')).toBeVisible();
  await expect(page.getByTestId('title-input')).toHaveCount(0);
  await expect(page.getByTestId('preset-list')).toHaveCount(0);

  await page.getByTestId('inspector-tab-text').click();
  await expect(page.getByTestId('title-input')).toBeVisible();
  await expect(page.getByTestId('effects-control')).toHaveCount(0);
  await expect(page.getByTestId('preset-list')).toHaveCount(0);
});

test('project output settings drive the real preview geometry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Project settings behavior is viewport-independent.');

  await page.goto('/?fixture=1');

  const outputButton = page.getByTestId('output-settings-button');
  const projectButton = page.getByTestId('project-settings-trigger');
  await expect(outputButton).toContainText('1920×1080 · 30 fps');
  await expect(projectButton).toBeVisible();

  await projectButton.click();
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

test('Project Settings traps the active task and closes with Escape', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Project dialog keyboard behavior is viewport-independent.');

  await page.goto('/?fixture=1');
  const projectButton = page.getByTestId('project-settings-trigger');
  await projectButton.click();

  const dialog = page.getByTestId('project-settings-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(projectButton).toBeFocused();
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

test('Sources keeps one primary add-media action instead of duplicate empty Choose controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Source intake grouping is viewport-independent.');

  await page.goto('/');
  const sources = page.getByRole('complementary', { name: 'Sources' });

  await expect(sources.getByTestId('media-intake')).toBeVisible();
  await expect(sources.getByText('Add videos')).toHaveCount(0);
  await expect(sources.locator('.file-control .source-slot-action')).toHaveCount(0);

  await page.getByTestId('media-intake-input').setInputFiles([
    {
      name: 'slots-cover.png',
      mimeType: 'image/png',
      buffer: PNG,
    },
    {
      name: 'slots-beat.wav',
      mimeType: 'audio/wav',
      buffer: sineWave(2),
    },
  ]);

  await expect(sources.locator('.file-control .source-slot-action')).toHaveCount(2);
  await expect(sources.getByText('Replace')).toHaveCount(2);
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

  const sources = page.getByRole('complementary', { name: 'Sources' });
  await expect(sources.getByText('clicked-cover.png')).toBeVisible();
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
