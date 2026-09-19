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
    const rect = canvas?.getBoundingClientRect();
    return {
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      ratio: rect ? rect.width / rect.height : 0,
      rendered: (canvas as HTMLCanvasElement | null)?.dataset.rendered || '',
      dataLength: (canvas as HTMLCanvasElement | null)?.toDataURL('image/png').length || 0,
    };
  });

  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(Math.abs(metrics.ratio - (16 / 9))).toBeLessThan(0.02);
  expect(metrics.rendered).toBe('true');
  expect(metrics.dataLength).toBeGreaterThan(10_000);

  await mkdir('artifacts/visual-qa', { recursive: true });
  await page.screenshot({
    path: 'artifacts/visual-qa/' + testInfo.project.name + '.png',
    fullPage: true,
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
      fullPage: true,
    });
  }
});
