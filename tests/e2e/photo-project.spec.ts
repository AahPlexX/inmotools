import { expect, test, type Locator, type Page } from '@playwright/test';

const FIXTURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAUAAAADwCAIAAAD+Tyo8AAACqElEQVR42u3VQQ0AMQwDwbVU/pj7OBQ9zTyWQeJVqzVVfa6nBTzqtO+CVfW9WmCwwKpqgQELrGqBAQusqhYYsMCqFhiwwKpqgcEC+2SqFhiwwKpqgcECq6oFBiywqlpgsMCqaoEBC6xqgQELrKoWGLDAqhYYsMCqaoEBC6xqgQELrKoWGCywqlpgwAKrqgUGC6yqFhiwwKoW2AKDBVZVCwxYYFULDFhgVbXAgAVWtcCABVZVCwwWWFUtMGCBVdUCgwVWVQsMWGBVtcBggVXVAgMWWNUCAxZYVS0wYIFVLTBggVXVAgMWWNUCAxZYVS0wWGBVtcCABVZVCwwWWFUtMGCBVS0wYIFV1QIDFljVAgMWWFUtMGCBVS0wYIFV1QKDBVZVCwxYYFW1wGCBVdUCAxZYVS0wWGBVtcCABVa1wIAFVlULDFhgVQsMWGBVtcCABVa1wIAFVlULDBZYVS0wYIFV1QKDBVZVCwxYYFULDFhgVbXAgAVWtcCABVZVCwxYYFULDFhgVbXAYIFV1QIDFlhVLTBYYFW1wIAFVlULDBZYVS0wYIFVLTBggVXVAgMWWNUCAxZYVS0wWGALrGqBAQusqhYYLLCqWmDAAquqBQYLrKoWGLDAqhYYsMCqaoEBC6xqgQELrKoWGLDAqhYYsMCqaoHBAquqBQYssKpaYLDAqmqBAQusqhYYLLCqWmDAAqtaYMACq6oFBiywqgUGLLCqWmCwwD6ZqgUGLLCqWmCwwKpqgQELrKoWGCywqlpgwAKrWmDAAquqBQYssKoFBiywqlpgwAKrWmDAAquqBQYLrKoWGLDAqmqBwQKrqgUGLLCqWmCwwKpqgQELrGqBAQusqhYYsMCqFhiwwKpqgcEC+2SqFhiwwKpqgcECq6oFBiywqlpg+I0LLVVQ6zZs79UAAAAASUVORK5CYII=',
  'base64',
);

async function openStudio(page: Page): Promise<Locator> {
  await page.goto('/inmotools/#/tools/photo-studio');
  const studio = page.getByTestId('suite-workspace');
  await expect(studio.getByRole('heading', { name: 'Photo Studio', exact: true })).toBeVisible({ timeout: 10_000 });
  return studio;
}

async function importPhoto(studio: Locator, name: string) {
  await studio.getByTestId('photo-file-input').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: FIXTURE_PNG,
  });
  await expect(studio.getByTestId('photo-source-dimensions')).toContainText(/320.*240/);
  await expect(studio.getByTestId('photo-preview')).toBeVisible();
}

async function setExposure(studio: Locator, value: string) {
  const exposure = studio.getByLabel('Exposure value');
  await exposure.fill(value);
  await exposure.press('Enter');
  await expect(exposure).toHaveValue(value);
}

test('recovers an autosaved source and recipe after reload', async ({ page }) => {
  let studio = await openStudio(page);
  await importPhoto(studio, 'recovery-proof.png');
  await setExposure(studio, '1.5');

  await expect(studio.getByTestId('photo-project-save-state')).toContainText('Saved locally');
  await page.reload();
  studio = page.getByTestId('suite-workspace');

  const recovery = studio.getByTestId('photo-recovery-prompt');
  await expect(recovery).toContainText('recovery-proof');
  await recovery.getByRole('button', { name: 'Recover project' }).click();
  await expect(studio.locator('.photo-status-message')).toContainText('recovered locally');
  await expect(studio.locator('.photo-status-strip')).toContainText('recovery-proof.png');
  await expect(studio.getByTestId('photo-source-dimensions')).toContainText(/320.*240/);
  await expect(studio.getByLabel('Exposure value')).toHaveValue('1.5');
});

test('saves, loads, and deletes a named local project while reporting storage honestly', async ({ page }) => {
  const studio = await openStudio(page);
  await importPhoto(studio, 'named-project-source.png');
  await setExposure(studio, '0.8');
  await studio.getByRole('button', { name: 'Inspect & workflow' }).click();

  const projects = studio.getByTestId('photo-project-panel');
  await projects.getByRole('textbox', { name: 'Project name' }).fill('Persistence proof');
  await projects.getByRole('button', { name: 'Save project now' }).click();

  let project = projects.getByTestId('photo-project-card').filter({ hasText: 'Persistence proof' });
  await expect(project).toContainText('named-project-source.png');
  await expect(studio.getByTestId('photo-storage-status')).toContainText(
    /(?:OPFS source storage available|Using IndexedDB source fallback).*?(?:durable storage granted|best-effort storage|durability status unavailable)/,
  );

  await page.reload();
  const recoveredStudio = page.getByTestId('suite-workspace');
  await expect(recoveredStudio.getByTestId('photo-recovery-prompt')).toBeVisible();
  await recoveredStudio.getByRole('button', { name: 'Not now' }).click();
  await recoveredStudio.getByRole('button', { name: 'Inspect & workflow' }).click();
  const recoveredProjects = recoveredStudio.getByTestId('photo-project-panel');
  project = recoveredProjects.getByTestId('photo-project-card').filter({ hasText: 'Persistence proof' });
  await project.getByRole('button', { name: 'Load project' }).click();
  await expect(recoveredStudio.locator('.photo-status-message')).toContainText('recovered locally');
  await recoveredStudio.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(recoveredStudio.getByLabel('Exposure value')).toHaveValue('0.8');

  await recoveredStudio.getByRole('button', { name: 'Inspect & workflow' }).click();
  await project.getByRole('button', { name: 'Delete local project' }).click();
  await expect(project).toHaveCount(0);
  await expect(recoveredProjects).toContainText('No local Photo projects saved yet.');
});

test('virtual copies share a source while keeping independent editable histories', async ({ page }) => {
  const studio = await openStudio(page);
  await importPhoto(studio, 'shared-portrait.png');
  await setExposure(studio, '0.8');
  await studio.getByRole('button', { name: 'Inspect & workflow' }).click();
  const projects = studio.getByTestId('photo-project-panel');
  await projects.getByRole('textbox', { name: 'Project name' }).fill('Original portrait');
  await projects.getByRole('button', { name: 'Save project now' }).click();

  const original = projects.getByTestId('photo-project-card').filter({
    has: page.getByText('Original portrait', { exact: true }),
  });
  await original.getByRole('button', { name: 'Create virtual copy' }).click();
  const copy = projects.getByTestId('photo-project-card').filter({
    has: page.getByText('Original portrait copy', { exact: true }),
  });
  await expect(copy).toBeVisible();

  await copy.getByRole('button', { name: 'Load project' }).click();
  await studio.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(studio.getByLabel('Exposure value')).toHaveValue('0.8');
  await setExposure(studio, '1.6');
  await studio.getByRole('button', { name: 'Inspect & workflow' }).click();
  await projects.getByRole('button', { name: 'Save project now' }).click();

  await original.getByRole('button', { name: 'Load project' }).click();
  await studio.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(studio.getByLabel('Exposure value')).toHaveValue('0.8');
  await studio.getByRole('button', { name: 'Inspect & workflow' }).click();
  await original.getByRole('button', { name: 'Delete local project' }).click();
  await expect(original).toHaveCount(0);
  await copy.getByRole('button', { name: 'Load project' }).click();
  await studio.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(studio.getByLabel('Exposure value')).toHaveValue('1.6');
});

test('creates, edits, exports, imports, applies, and removes local user presets', async ({ page }) => {
  const studio = await openStudio(page);
  await importPhoto(studio, 'preset-source.png');
  await setExposure(studio, '1.1');
  await studio.getByRole('button', { name: 'Inspect & workflow' }).click();
  const presets = studio.getByTestId('photo-user-preset-panel');
  const presetName = presets.getByRole('textbox', { name: 'User preset name' });
  await presetName.fill('Bright portrait');
  await presets.getByRole('button', { name: 'Save current as preset' }).click();

  let card = presets.getByTestId('photo-user-preset-card').filter({ hasText: 'Bright portrait' });
  await expect(card).toBeVisible();
  await studio.getByRole('button', { name: 'Edit', exact: true }).click();
  await setExposure(studio, '-0.4');
  await studio.getByRole('button', { name: 'Inspect & workflow' }).click();
  await card.getByRole('button', { name: 'Edit preset' }).click();
  await presetName.fill('Bright portrait refined');
  await studio.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(studio.getByLabel('Exposure value')).toHaveValue('1.1');
  await setExposure(studio, '1.4');
  await studio.getByRole('button', { name: 'Inspect & workflow' }).click();
  await presets.getByRole('button', { name: 'Update preset' }).click();

  card = presets.getByTestId('photo-user-preset-card').filter({ hasText: 'Bright portrait refined' });
  const downloadPromise = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Export preset' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('bright-portrait-refined-photo-preset.json');

  await studio.getByRole('button', { name: 'Edit', exact: true }).click();
  await setExposure(studio, '-0.6');
  await studio.getByRole('button', { name: 'Inspect & workflow' }).click();
  await card.getByRole('button', { name: 'Apply preset' }).click();
  await studio.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(studio.getByLabel('Exposure value')).toHaveValue('1.4');

  await studio.getByRole('button', { name: 'Inspect & workflow' }).click();
  await card.getByRole('button', { name: 'Delete preset' }).click();
  await expect(card).toHaveCount(0);
  await presets.getByTestId('photo-user-preset-input').setInputFiles({
    name: 'imported.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      kind: 'inmotools-photo-preset',
      version: 1,
      name: 'Imported portrait',
      recipe: { version: 1, exposure: 0.7 },
    })),
  });
  card = presets.getByTestId('photo-user-preset-card').filter({ hasText: 'Imported portrait' });
  await expect(card).toBeVisible();
});
