import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { clickTrack } from './fixtures/media';

test('workspace is visually reviewable at the fixed viewport matrix', async ({ page }, testInfo) => {
  await page.goto('/?fixture=1');
  await expect(page.getByText('Beatvideo Maker', { exact: true })).toBeVisible();
  await expect(page.getByTestId('preview-canvas')).toBeVisible();

  await page.getByTestId('inspector-tab-text').click();
  await page.getByTestId('title-input').fill('MIDNIGHT STATIC');
  await page.getByTestId('brand-disclosure').locator('summary').click();
  await page.getByTestId('brand-input').fill('prod. usolido');
  await page.getByTestId('inspector-tab-look').click();

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
  await page.getByTestId('inspector-tab-text').click();
  await page.getByTestId('brand-disclosure').locator('summary').click();
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
  await page.getByTestId('inspector-tab-text').click();
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


test('stacked beat-video effects are visually reviewable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Effect stack uses the normal review viewport.');

  await page.goto('/?fixture=1');
  await page.getByTestId('inspector-tab-effects').click();
  for (const [type, name] of [
    ['zoom-punch', 'Zoom punch'],
    ['shake', 'Shake'],
    ['glow', 'Glow'],
  ] as const) {
    await page.getByTestId('effect-add-type').selectOption(type);
    await page.getByTestId('effect-add').click();
    await page.locator('[data-effect-type="' + type + '"]').last()
      .getByLabel(name + ' driver')
      .selectOption('static');
  }

  await expect(page.locator('[data-testid="effect-stack"] .effect-row')).toHaveCount(3);
  await mkdir('artifacts/visual-qa', { recursive: true });
  await page.screenshot({
    path: 'artifacts/visual-qa/effect-stack.png',
    fullPage: false,
  });
});


test('Project Settings is visually reviewable from the explicit toolbar action', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Project Settings uses the normal review viewport.');

  await page.goto('/?fixture=1');
  await page.getByTestId('project-settings-trigger').click();
  await expect(page.getByTestId('project-settings-dialog')).toBeVisible();

  await mkdir('artifacts/visual-qa', { recursive: true });
  await page.screenshot({
    path: 'artifacts/visual-qa/project-settings.png',
    fullPage: false,
  });
});

test('vertical project output keeps the workstation hierarchy readable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Vertical output uses the normal review viewport.');

  await page.goto('/?fixture=1');
  await page.getByTestId('output-settings-button').click();
  await page.getByTestId('output-format-shorts').click();
  await page.getByRole('button', { name: 'Done' }).click();

  const canvas = page.getByTestId('preview-canvas');
  const frame = await canvas.evaluate((node) => {
    const canvasNode = node as HTMLCanvasElement;
    const rect = canvasNode.getBoundingClientRect();
    const context = canvasNode.getContext('2d');
    const pixel = context?.getImageData(
      Math.floor(canvasNode.width / 2),
      Math.floor(canvasNode.height / 2),
      1,
      1,
    ).data;
    return {
      ratio: rect.width / rect.height,
      centerLuma: pixel ? pixel[0] + pixel[1] + pixel[2] : 0,
    };
  });
  expect(frame.ratio).toBeCloseTo(9 / 16, 2);
  expect(frame.centerLuma).toBeGreaterThan(40);

  await mkdir('artifacts/visual-qa', { recursive: true });
  await page.screenshot({
    path: 'artifacts/visual-qa/output-shorts.png',
    fullPage: false,
  });
});


test('precision beat-grid review is visually reviewable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Beat-grid review uses the normal review viewport.');

  await page.goto('/?fixture=1');
  await page.getByTestId('audio-input').setInputFiles({
    name: 'visual-grid.wav',
    mimeType: 'audio/wav',
    buffer: clickTrack(120, 16),
  });
  await expect(page.getByTestId('bpm-input')).not.toHaveValue('', { timeout: 30_000 });
  await page.getByTestId('review-grid').click();
  await expect(page.getByTestId('waveform-detail-panel')).toBeVisible();

  const detailBox = await page.getByTestId('waveform-detail').boundingBox();
  expect(detailBox).not.toBeNull();
  expect(detailBox!.height).toBeGreaterThan(100);
  expect(detailBox!.width).toBeGreaterThan(360);

  await mkdir('artifacts/visual-qa', { recursive: true });
  await page.screenshot({
    path: 'artifacts/visual-qa/beat-grid-detail.png',
    fullPage: false,
  });
});
