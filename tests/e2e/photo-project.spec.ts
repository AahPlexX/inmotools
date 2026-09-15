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
