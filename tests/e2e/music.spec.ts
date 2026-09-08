import { expect, test } from '@playwright/test';

test('starts and explicitly stops the local Web Audio progression', async ({ page }) => {
  await page.goto('./#/tools/midi-harmony-lab');
  const play = page.getByRole('button', { name: 'Play progression' });
  const stop = page.getByRole('button', { name: 'Stop' });
  await expect(stop).toBeDisabled();
  await play.click();
  await expect(stop).toBeEnabled();
  await stop.click();
  await expect(stop).toBeDisabled();
  await expect(page.locator('.status-line')).toContainText(/audio graph was released/i);
});
