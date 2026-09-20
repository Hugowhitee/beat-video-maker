import { expect, test } from '@playwright/test';

test('title can be centered, aligned and placed directly on the preview', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Authoring interaction is viewport-independent.');

  await page.goto('/?fixture=1');

  await page.getByTestId('title-position-center').click();
  await expect(page.getByTestId('title-align-center')).toHaveClass(/is-active/);
  await expect(page.getByTestId('title-x')).toHaveValue('50');
  await expect(page.getByTestId('title-y')).toHaveValue('50');

  await page.getByTestId('place-title').click();
  await expect(page.getByTestId('title-placement-hint')).toBeVisible();
  await expect(page.getByTestId('safe-guides-toggle')).toHaveClass(/is-active/);
  await expect(page.getByTestId('grid-guides-toggle')).toHaveClass(/is-active/);

  const canvas = page.getByTestId('preview-canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await canvas.click({
    position: {
      x: box!.width * 0.84,
      y: box!.height * 0.27,
    },
  });

  await expect(page.getByTestId('title-placement-hint')).toHaveCount(0);
  await expect(page.getByTestId('title-align-right')).toHaveClass(/is-active/);

  const x = Number(await page.getByTestId('title-x').inputValue());
  const y = Number(await page.getByTestId('title-y').inputValue());
  expect(x).toBeGreaterThan(82);
  expect(x).toBeLessThan(86);
  expect(y).toBeGreaterThan(25);
  expect(y).toBeLessThan(29);
});

test('editable template download reopens into normal editor state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Template IO is viewport-independent.');

  await page.goto('/?fixture=1');
  await page.getByTestId('title-input').fill('SAVED TEMPLATE');
  await page.getByTestId('title-position-center').click();
  await page.getByTestId('title-font').selectOption('serif');
  await page.getByTestId('brand-input').fill('prod. template');
  await page.getByTestId('brand-layout').selectOption('grid');
  await page.getByTestId('preset-reactive').click();
  await page.getByTestId('motion-amount').selectOption('medium');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('save-template').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('SAVED TEMPLATE.beatvideo-template.json');
  const templatePath = await download.path();
  expect(templatePath).not.toBeNull();

  await page.getByTestId('title-input').fill('CHANGED');
  await page.getByTestId('title-position-top-left').click();
  await page.getByTestId('title-font').selectOption('clean');
  await page.getByTestId('brand-input').fill('');
  await page.getByTestId('brand-layout').selectOption('corner');
  await page.getByTestId('preset-clean').click();
  await page.getByTestId('motion-amount').selectOption('off');

  await page.getByTestId('template-input').setInputFiles(templatePath!);

  await expect(page.getByTestId('title-input')).toHaveValue('SAVED TEMPLATE');
  await expect(page.getByTestId('title-x')).toHaveValue('50');
  await expect(page.getByTestId('title-y')).toHaveValue('50');
  await expect(page.getByTestId('title-align-center')).toHaveClass(/is-active/);
  await expect(page.getByTestId('title-font')).toHaveValue('serif');
  await expect(page.getByTestId('brand-input')).toHaveValue('prod. template');
  await expect(page.getByTestId('brand-layout')).toHaveValue('grid');
  await expect(page.getByTestId('preset-reactive')).toHaveClass(/is-selected/);
  await expect(page.getByTestId('motion-amount')).toHaveValue('medium');
  await expect(page.getByTestId('template-message')).toContainText('Opened ');
});

test('invalid template fails before changing current authoring state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Template validation is viewport-independent.');

  await page.goto('/?fixture=1');
  await page.getByTestId('title-position-center').click();
  await page.getByTestId('title-input').fill('KEEP ME');

  await page.getByTestId('template-input').setInputFiles({
    name: 'broken.beatvideo-template.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"beatvideo-template","version":99}'),
  });

  await expect(page.getByTestId('title-input')).toHaveValue('KEEP ME');
  await expect(page.getByTestId('title-x')).toHaveValue('50');
  await expect(page.getByTestId('title-y')).toHaveValue('50');
  await expect(page.getByTestId('template-message')).toContainText('version is not supported');
});
