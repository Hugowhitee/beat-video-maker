import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('workspace is visually reviewable at the fixed viewport matrix', async ({ page }, testInfo) => {
  await page.goto('/?fixture=1');
  await expect(page.getByText('Beatvideo Maker', { exact: true })).toBeVisible();
  await expect(page.getByTestId('preview-canvas')).toBeVisible();

  await page.getByTestId('title-input').fill('MIDNIGHT STATIC');
  await page.getByTestId('brand-input').fill('prod. usolido');

  const metrics = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="preview-canvas"]');
    const sources = document.querySelector('[aria-label="Sources"]');
    const inspector = document.querySelector('[aria-label="Inspector"]');
    const rect = canvas?.getBoundingClientRect();
    return {
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      ratio: rect ? rect.width / rect.height : 0,
      previewWidth: rect?.width || 0,
      sourcesWidth: sources?.getBoundingClientRect().width || 0,
      inspectorWidth: inspector?.getBoundingClientRect().width || 0,
      rendered: (canvas as HTMLCanvasElement | null)?.dataset.rendered || '',
      dataLength: (canvas as HTMLCanvasElement | null)?.toDataURL('image/png').length || 0,
    };
  });

  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(Math.abs(metrics.ratio - (16 / 9))).toBeLessThan(0.02);
  expect(metrics.previewWidth).toBeGreaterThan(metrics.sourcesWidth);
  expect(metrics.previewWidth).toBeGreaterThan(metrics.inspectorWidth);
  expect(metrics.rendered).toBe('true');
  expect(metrics.dataLength).toBeGreaterThan(10_000);

  await mkdir('artifacts/visual-qa', { recursive: true });
  await page.screenshot({
    path: 'artifacts/visual-qa/' + testInfo.project.name + '.png',
    fullPage: false,
  });
});

test('all five presets have a reviewable normal-viewport state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Preset gallery uses the normal review viewport.');

  await page.goto('/?fixture=1');
  await mkdir('artifacts/visual-qa', { recursive: true });

  const presets = ['clean', 'ambient', 'reactive', 'pulse', 'visualizer'] as const;
  for (const preset of presets) {
    const button = page.getByTestId('preset-' + preset);
    await button.click();
    await expect(button).toHaveClass(/is-selected/);
    await page.screenshot({
      path: 'artifacts/visual-qa/preset-' + preset + '.png',
      fullPage: false,
    });
  }
});


test('watermark grid stays subtle and clipped to the cover', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Watermark grid uses the normal review viewport.');

  await page.goto('/?fixture=1');
  const canvas = page.getByTestId('preview-canvas');
  const before = await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL('image/png'));

  await page.getByTestId('brand-layout').selectOption('grid');
  await expect(page.getByTestId('brand-layout')).toHaveValue('grid');
  await expect.poll(async () =>
    canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL('image/png')),
  ).not.toBe(before);

  await mkdir('artifacts/visual-qa', { recursive: true });
  await page.screenshot({
    path: 'artifacts/visual-qa/watermark-grid.png',
    fullPage: false,
  });
});


test('install help is visually reviewable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Install help uses the normal review viewport.');

  await page.goto('/?fixture=1');
  await page.getByTestId('install-button').click();
  await expect(page.getByTestId('install-help')).toBeVisible();

  await mkdir('artifacts/visual-qa', { recursive: true });
  await page.screenshot({
    path: 'artifacts/visual-qa/install-help.png',
    fullPage: false,
  });
});


test('centered title and composition grid are visually reviewable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Authoring layout uses the normal review viewport.');

  await page.goto('/?fixture=1');
  await page.getByTestId('title-position-center').click();
  await page.getByTestId('grid-guides-toggle').click();
  await page.getByTestId('safe-guides-toggle').click();
  await expect(page.getByTestId('title-align-center')).toHaveClass(/is-active/);

  await mkdir('artifacts/visual-qa', { recursive: true });
  await page.screenshot({
    path: 'artifacts/visual-qa/title-center-grid.png',
    fullPage: false,
  });
});
