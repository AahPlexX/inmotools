import { expect, test, type Page } from '@playwright/test';

const FIXTURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAUAAAADwCAIAAAD+Tyo8AAACqElEQVR42u3VQQ0AMQwDwbVU/pj7OBQ9zTyWQeJVqzVVfa6nBTzqtO+CVfW9WmCwwKpqgQELrGqBAQusqhYYsMCqFhiwwKpqgcEC+2SqFhiwwKpqgcECq6oFBiywqlpgsMCqaoEBC6xqgQELrKoWGLDAqhYYsMCqaoEBC6xqgQELrKoWGCywqlpgwAKrqgUGC6yqFhiwwKoW2AKDBVZVCwxYYFULDFhgVbXAgAVWtcCABVZVCwwWWFUtMGCBVdUCgwVWVQsMWGBVtcBggVXVAgMWWNUCAxZYVS0wYIFVLTBggVXVAgMWWNUCAxZYVS0wWGBVtcCABVZVCwwWWFUtMGCBVS0wYIFV1QIDFljVAgMWWFUtMGCBVS0wYIFV1QKDBVZVCwxYYFW1wGCBVdUCAxZYVS0wWGBVtcCABVa1wIAFVlULDFhgVQsMWGBVtcCABVa1wIAFVlULDBZYVS0wYIFV1QKDBVZVCwxYYFULDFhgVbXAgAVWtcCABVZVCwxYYFULDFhgVbXAYIFV1QIDFlhVLTBYYFW1wIAFVlULDBZYVS0wYIFVLTBggVXVAgMWWNUCAxZYVS0wWGALrGqBAQusqhYYLLCqWmDAAquqBQYLrKoWGLDAqhYYsMCqaoEBC6xqgQELrKoWGLDAqhYYsMCqaoHBAquqBQYssKpaYLDAqmqBAQusqhYYLLCqWmDAAqtaYMACq6oFBiywqgUGLLCqWmCwwD6ZqgUGLLCqWmCwwKpqgQELrKoWGCywqlpgwAKrWmDAAquqBQYssKoFBiywqlpgwAKrWmDAAquqBQYLrKoWGLDAqmqBwQKrqgUGLLCqWmCwwKpqgQELrGqBAQusqhYYsMCqFhiwwKpqgcEC+2SqFhiwwKpqgcECq6oFBiywqlpg+I0LLVVQ6zZs79UAAAAASUVORK5CYII=',
  'base64',
);

async function openStudio(page: Page) {
  await page.goto('/inmotools/#/tools/photo-studio');
  await expect(page.getByTestId('suite-workspace').getByRole('heading', { name: 'Photo Studio', exact: true })).toBeVisible();
}

async function openNamedFixture(page: Page, name: string) {
  await page.setInputFiles('[data-testid="photo-file-input"]', {
    name,
    mimeType: 'image/png',
    buffer: FIXTURE_PNG,
  });
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('320 × 240');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
}

test('opens a dropped image through the shared import target', async ({ page }) => {
  await openStudio(page);
  const dropTarget = page.getByTestId('photo-drop-target');
  const dataTransfer = await page.evaluateHandle(({ bytes }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(bytes)], 'dropped-photo.png', { type: 'image/png' }));
    return transfer;
  }, { bytes: Array.from(FIXTURE_PNG) });

  await dropTarget.dispatchEvent('dragenter', { dataTransfer });
  await expect(dropTarget).toHaveClass(/is-photo-dragging/);
  await dropTarget.dispatchEvent('drop', { dataTransfer });
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('320 × 240');
  await expect(page.locator('.photo-status-strip')).toContainText('dropped-photo.png');
  await dataTransfer.dispose();
});

test('routes the progressive camera input through the same importer', async ({ page }) => {
  await openStudio(page);
  const cameraInput = page.getByTestId('photo-camera-input');
  await expect(cameraInput).toHaveAttribute('accept', 'image/*');
  await expect(cameraInput).toHaveAttribute('capture', 'environment');
  await cameraInput.focus();
  await expect(cameraInput.locator('..')).toHaveCSS('outline-style', 'solid');
  await cameraInput.setInputFiles({
    name: 'camera-capture.png',
    mimeType: 'image/png',
    buffer: FIXTURE_PNG,
  });

  await expect(page.getByTestId('photo-source-dimensions')).toContainText('320 × 240');
  await expect(page.locator('.photo-status-strip')).toContainText('camera-capture.png');
});

test('opens a clipboard image when direct clipboard reading is available', async ({ page }) => {
  await page.addInitScript(({ bytes }) => {
    const blob = new Blob([Uint8Array.from(bytes)], { type: 'image/png' });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: async () => [{ types: ['image/png'], getType: async () => blob }] },
    });
  }, { bytes: Array.from(FIXTURE_PNG) });
  await openStudio(page);

  await page.getByRole('button', { name: 'Paste image' }).click();
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('320 × 240');
  await expect(page.locator('.photo-status-strip')).toContainText('clipboard-image.png');
});

test('opens an image pasted while focus is outside the Photo Studio root', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {} });
  });
  await openStudio(page);
  await page.evaluate(({ bytes }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(bytes)], 'keyboard-paste.png', { type: 'image/png' }));
    document.body.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: transfer,
      bubbles: true,
      cancelable: true,
    }));
  }, { bytes: Array.from(FIXTURE_PNG) });

  await expect(page.getByTestId('photo-source-dimensions')).toContainText('320 × 240');
  await expect(page.locator('.photo-status-strip')).toContainText('keyboard-paste.png');
});

test('a delayed clipboard read cannot replace a newer file import', async ({ page }) => {
  await page.addInitScript(({ bytes }) => {
    const state = window as unknown as {
      releasePhotoClipboard: () => void;
      staleClipboardDecodeStarted: boolean;
    };
    const blob = new Blob([Uint8Array.from(bytes)], { type: 'image/png' });
    let release!: (items: Array<{ types: string[]; getType: () => Promise<Blob> }>) => void;
    const pending = new Promise<Array<{ types: string[]; getType: () => Promise<Blob> }>>((resolve) => {
      release = resolve;
    });
    state.releasePhotoClipboard = () => release([{ types: ['image/png'], getType: async () => blob }]);
    state.staleClipboardDecodeStarted = false;
    const nativeCreateImageBitmap = window.createImageBitmap.bind(window);
    window.createImageBitmap = (source, ...options) => {
      if (source instanceof File && source.name === 'clipboard-image.png') state.staleClipboardDecodeStarted = true;
      return nativeCreateImageBitmap(source, ...options);
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: () => pending },
    });
  }, { bytes: Array.from(FIXTURE_PNG) });
  await openStudio(page);
  await page.getByRole('button', { name: 'Paste image' }).click();
  await openNamedFixture(page, 'newer-photo.png');
  const exposure = page.getByLabel('Exposure value');
  await exposure.fill('1.5');
  await exposure.press('Enter');

  await page.evaluate(() => {
    (window as unknown as { releasePhotoClipboard: () => void }).releasePhotoClipboard();
  });
  await page.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 0)));
  expect(await page.evaluate(() => (
    window as unknown as { staleClipboardDecodeStarted: boolean }
  ).staleClipboardDecodeStarted)).toBe(false);
  await expect(page.locator('.photo-status-strip')).toContainText('newer-photo.png');
  await expect(exposure).toHaveValue('1.5');
});

test('clipboard denial explains the fallback without replacing the active edit', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        read: async () => { throw new DOMException('denied', 'NotAllowedError'); },
      },
    });
  });
  await openStudio(page);
  await openNamedFixture(page, 'active-photo.png');
  const preview = page.getByTestId('photo-preview');
  const exposure = page.getByLabel('Exposure value');
  await exposure.fill('1.5');
  await exposure.press('Enter');

  await page.getByRole('button', { name: 'Paste image' }).click();
  await expect(page.locator('.photo-status-message')).toContainText('Clipboard access was denied');
  await expect(page.locator('.photo-status-strip')).toContainText('active-photo.png');
  await expect(exposure).toHaveValue('1.5');
  await expect(preview).toBeVisible();
});

test('an older preview failure cannot replace newer clipboard guidance', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        read: async () => { throw new DOMException('denied', 'NotAllowedError'); },
      },
    });
  });
  await openStudio(page);
  await openNamedFixture(page, 'active-during-preview-failure.png');
  await page.evaluate(() => {
    const state = window as unknown as { rejectPhotoPreviewDecode: () => void };
    let rejectPreview!: (error: Error) => void;
    state.rejectPhotoPreviewDecode = () => rejectPreview(new Error('delayed preview failure'));
    window.createImageBitmap = () => new Promise<ImageBitmap>((_resolve, reject) => {
      rejectPreview = reject;
    });
  });

  await page.getByLabel('Exposure value').fill('1.5');
  await expect(page.locator('.photo-render-badge')).toBeVisible();
  await page.getByRole('button', { name: 'Paste image' }).click();
  await expect(page.locator('.photo-status-message')).toContainText('Clipboard access was denied');
  await page.evaluate(() => {
    (window as unknown as { rejectPhotoPreviewDecode: () => void }).rejectPhotoPreviewDecode();
  });
  await expect(page.locator('.photo-render-badge')).toHaveCount(0);
  await expect(page.locator('.photo-status-message')).toContainText('Clipboard access was denied');
});

test('source replacement clears observations before the new preview is ready', async ({ page }) => {
  await openStudio(page);
  await openNamedFixture(page, 'observed-source.png');
  await page.getByRole('button', { name: 'Clipping warnings' }).click();
  await page.getByRole('button', { name: 'Color sampler' }).click();
  await page.getByTestId('photo-preview').click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole('status', { name: 'Sampled color readout' })).toBeVisible();
  await expect(page.getByTestId('photo-clipping-overlay')).toBeVisible();

  await page.evaluate(() => {
    const state = window as unknown as { secondSourcePreviewPending: boolean };
    state.secondSourcePreviewPending = false;
    const nativeCreateImageBitmap = window.createImageBitmap.bind(window);
    let secondSourceDecodes = 0;
    window.createImageBitmap = (source, ...options) => {
      if (source instanceof File && source.name === 'replacement-source.png') {
        secondSourceDecodes += 1;
        if (secondSourceDecodes === 2) {
          state.secondSourcePreviewPending = true;
          return new Promise<ImageBitmap>(() => {});
        }
      }
      return nativeCreateImageBitmap(source, ...options);
    };
  });
  await page.setInputFiles('[data-testid="photo-file-input"]', {
    name: 'replacement-source.png',
    mimeType: 'image/png',
    buffer: FIXTURE_PNG,
  });
  await expect(page.locator('.photo-status-strip')).toContainText('replacement-source.png');
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { secondSourcePreviewPending: boolean }
  ).secondSourcePreviewPending)).toBe(true);

  await expect(page.getByRole('status', { name: 'Sampled color readout' })).toHaveCount(0);
  await expect(page.getByTestId('photo-clipping-overlay')).toHaveCount(0);
  await expect(page.getByTestId('photo-preview')).toHaveCount(0);
});

test('clipboard object URL failure leaves the active document usable', async ({ page }) => {
  await page.addInitScript(({ bytes }) => {
    const blob = new Blob([Uint8Array.from(bytes)], { type: 'image/png' });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: async () => [{ types: ['image/png'], getType: async () => blob }] },
    });
  }, { bytes: Array.from(FIXTURE_PNG) });
  await openStudio(page);
  await openNamedFixture(page, 'active-before-url-failure.png');
  await page.evaluate(() => {
    const state = window as unknown as { photoRevokedUrls: string[] };
    state.photoRevokedUrls = [];
    const nativeCreateObjectUrl = URL.createObjectURL.bind(URL);
    const nativeRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (value) => {
      if (value instanceof File && value.name === 'clipboard-image.png') {
        throw new DOMException('object URL unavailable', 'QuotaExceededError');
      }
      return nativeCreateObjectUrl(value);
    };
    URL.revokeObjectURL = (url) => {
      state.photoRevokedUrls.push(url);
      nativeRevokeObjectUrl(url);
    };
  });

  await page.getByRole('button', { name: 'Paste image' }).click();
  await expect(page.locator('.photo-status-message')).toContainText('object URL unavailable');
  await expect(page.locator('.photo-status-strip')).toContainText('active-before-url-failure.png');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await expect(page.getByTestId('photo-preview')).toHaveJSProperty('complete', true);
  expect(await page.evaluate(() => {
    const previewUrl = (document.querySelector('[data-testid="photo-preview"]') as HTMLImageElement).src;
    return (window as unknown as { photoRevokedUrls: string[] }).photoRevokedUrls.includes(previewUrl);
  })).toBe(false);
});

test('explains the fallback when direct clipboard reading is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {} });
  });
  await openStudio(page);

  await expect(page.getByRole('button', { name: 'Paste image' })).toBeDisabled();
  await expect(page.locator('#photo-import-hint')).toContainText('Direct clipboard reading is unavailable');
});
