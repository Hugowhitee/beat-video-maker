import { expect, test } from '@playwright/test';

test('style preferences persist locally and reset cleanly', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Preference persistence is viewport-independent.');

  await page.goto('/');
  await page.getByTestId('brand-input').fill('prod. local');
  await page.getByTestId('preset-ambient').click();
  await page.getByTestId('title-font').selectOption('serif');
  await page.getByTestId('motion-amount').selectOption('medium');

  await page.reload();

  await expect(page.getByTestId('brand-input')).toHaveValue('prod. local');
  await expect(page.getByTestId('preset-ambient')).toHaveClass(/is-selected/);
  await expect(page.getByTestId('title-font')).toHaveValue('serif');
  await expect(page.getByTestId('motion-amount')).toHaveValue('medium');

  await page.getByTestId('reset-settings').click();
  await page.reload();

  await expect(page.getByTestId('brand-input')).toHaveValue('');
  await expect(page.getByTestId('preset-clean')).toHaveClass(/is-selected/);
  await expect(page.getByTestId('title-font')).toHaveValue('clean');
  await expect(page.getByTestId('motion-amount')).toHaveValue('low');
});
