import { expect, test } from '@playwright/test';

test('exposes live convolution controls, bypass, gain safety, and idle spectrum without requiring audio fixtures',async({page})=>{
 await page.goto('./#/tools/convolution-room-profiler');
 await expect(page.locator('#audio-wet')).toBeVisible();
 await expect(page.locator('#audio-output')).toBeVisible();
 await page.locator('#audio-output').fill('1.25');
 await expect(page.getByText(/Above unity can clip/i)).toBeVisible();
 await page.getByRole('checkbox',{name:/Bypass convolution/}).check();
 await expect(page.getByRole('img',{name:'Audio frequency spectrum idle'})).toBeVisible();
 await expect(page.getByRole('button',{name:/Render 24-bit WAV/})).toBeDisabled();
});
