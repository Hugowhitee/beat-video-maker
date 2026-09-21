import { expect, test } from '@playwright/test';

async function addStaticEffect(page: import('@playwright/test').Page, type: string, name: string) {
  await page.getByTestId('effect-add-type').selectOption(type);
  await page.getByTestId('effect-add').click();
  const row = page.locator('[data-effect-type="' + type + '"]').last();
  await row.getByLabel(name + ' driver').selectOption('static');
  return row;
}

test('three effects stack, reorder and participate in undo history', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Effect editing is viewport-independent.');

  await page.goto('/?fixture=1');
  await page.getByTestId('inspector-tab-effects').click();
  const canvas = page.getByTestId('preview-canvas');
  const before = await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL('image/png'));

  const zoom = await addStaticEffect(page, 'zoom-punch', 'Zoom punch');
  const shake = await addStaticEffect(page, 'shake', 'Shake');
  const glow = await addStaticEffect(page, 'glow', 'Glow');

  await expect(page.locator('[data-testid="effect-stack"] .effect-row')).toHaveCount(3);

  const stacked = await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL('image/png'));
  expect(stacked).not.toBe(before);

  const orderedBefore = stacked;
  await shake.getByLabel('Move Shake up').click();
  const reordered = await canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL('image/png'));
  expect(reordered).not.toBe(orderedBefore);

  await glow.getByLabel('Enable Glow').uncheck();
  await expect(glow).toHaveClass(/is-disabled/);
  await expect(page.getByTestId('undo-button')).toBeEnabled();
  await page.getByTestId('undo-button').click();
  await expect(glow.getByLabel('Enable Glow')).toBeChecked();

  await zoom.getByLabel('Remove Zoom punch').click();
  await expect(page.locator('[data-effect-type="zoom-punch"]')).toHaveCount(0);
  await page.getByTestId('undo-button').click();
  await expect(page.locator('[data-effect-type="zoom-punch"]')).toHaveCount(1);
});

test('blur can target background or composite without leaving the curated effect row', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Effect target editing is viewport-independent.');

  await page.goto('/?fixture=1');
  await page.getByTestId('inspector-tab-effects').click();
  await page.getByTestId('effect-add-type').selectOption('blur');
  await page.getByTestId('effect-add').click();

  const blur = page.locator('[data-effect-type="blur"]');
  const target = blur.getByLabel('Blur target');
  await expect(target).toHaveValue('background');
  await target.selectOption('composite');
  await expect(target).toHaveValue('composite');

  const before = await page.getByTestId('preview-canvas')
    .evaluate((node) => (node as HTMLCanvasElement).toDataURL('image/png'));

  const strength = blur.getByLabel('Blur strength');
  await strength.focus();
  await strength.press('End');
  await expect(strength).toHaveValue('1');
  await expect(blur.locator('output')).toHaveText('100%');

  await expect.poll(async () => (
    page.getByTestId('preview-canvas')
      .evaluate((node) => (node as HTMLCanvasElement).toDataURL('image/png'))
  )).not.toBe(before);
});
