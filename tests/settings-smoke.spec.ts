import { expect, test } from '@playwright/test';

test('style preferences persist locally and reset cleanly', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Preference persistence is viewport-independent.');

  await page.goto('/');
  await page.getByTestId('brand-input').fill('prod. local');
  await page.getByTestId('brand-layout').selectOption('grid');
  await page.getByTestId('preset-ambient').click();
  await page.getByTestId('title-font').selectOption('serif');
  await page.getByTestId('title-position-center').click();
  await page.getByTestId('motion-amount').selectOption('medium');
  await page.getByTestId('effect-add-type').selectOption('glow');
  await page.getByTestId('effect-add').click();
  await page.locator('[data-effect-type="glow"]').getByLabel('Glow driver').selectOption('static');

  await page.reload();

  await expect(page.getByTestId('brand-input')).toHaveValue('prod. local');
  await expect(page.getByTestId('brand-layout')).toHaveValue('grid');
  await expect(page.getByTestId('preset-ambient')).toHaveClass(/is-selected/);
  await expect(page.getByTestId('title-font')).toHaveValue('serif');
  await expect(page.getByTestId('title-x')).toHaveValue('50');
  await expect(page.getByTestId('title-y')).toHaveValue('50');
  await expect(page.getByTestId('title-align-center')).toHaveClass(/is-active/);
  await expect(page.getByTestId('motion-amount')).toHaveValue('medium');
  await expect(page.locator('[data-effect-type="glow"]')).toHaveCount(1);
  await expect(page.locator('[data-effect-type="glow"]').getByLabel('Glow driver')).toHaveValue('static');

  await page.getByTestId('reset-settings').click();
  await page.reload();

  await expect(page.getByTestId('brand-input')).toHaveValue('');
  await expect(page.getByTestId('brand-layout')).toHaveValue('corner');
  await expect(page.getByTestId('preset-clean')).toHaveClass(/is-selected/);
  await expect(page.getByTestId('title-font')).toHaveValue('clean');
  await expect(page.getByTestId('title-x')).toHaveValue('5.5');
  await expect(page.getByTestId('title-y')).toHaveValue('88');
  await expect(page.getByTestId('title-align-left')).toHaveClass(/is-active/);
  await expect(page.getByTestId('motion-amount')).toHaveValue('low');
  await expect(page.getByTestId('effect-stack')).toHaveCount(0);
});


test('undo and redo restore relevant editor state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'History is viewport-independent.');
  await page.goto('/?fixture=1');
  await expect(page.getByTestId('preset-clean')).toHaveClass(/is-selected/);
  await page.getByTestId('preset-ambient').click();
  await expect(page.getByTestId('undo-button')).toBeEnabled();
  await page.getByTestId('undo-button').click();
  await expect(page.getByTestId('preset-clean')).toHaveClass(/is-selected/);
  await expect(page.getByTestId('redo-button')).toBeEnabled();
  await page.getByTestId('redo-button').click();
  await expect(page.getByTestId('preset-ambient')).toHaveClass(/is-selected/);
});


test('install control explains the fallback path when no native prompt is available', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Install guidance is viewport-independent.');

  await page.goto('/?fixture=1');
  const install = page.getByTestId('install-button');
  await expect(install).toBeVisible();
  await install.click();

  const help = page.getByTestId('install-help');
  await expect(help).toBeVisible();
  await expect(help).toContainText('Chrome or Edge');
  await expect(help).toContainText('hosted HTTPS version');
});


test('install control uses the native prompt and hides after app installation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-normal', 'Install prompt behavior is viewport-independent.');

  await page.goto('/?fixture=1');
  await page.evaluate(() => {
    const browserWindow = window as Window & { __installPromptCalled?: boolean };
    const event = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted'; platform: string }>;
    };
    event.prompt = async () => {
      browserWindow.__installPromptCalled = true;
    };
    event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
    window.dispatchEvent(event);
  });

  const install = page.getByTestId('install-button');
  await expect(install).toHaveText('Install app');
  await install.click();
  await expect.poll(() => page.evaluate(() =>
    Boolean((window as Window & { __installPromptCalled?: boolean }).__installPromptCalled),
  )).toBe(true);

  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByTestId('install-button')).toHaveCount(0);
});
