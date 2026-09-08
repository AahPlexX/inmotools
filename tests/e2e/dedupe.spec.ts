import { expect, test } from '@playwright/test';

test('requires explicit cluster review and allows export after a zero-cluster analysis',async({page})=>{
 await page.goto('./#/tools/fuzzy-deduplicator');
 const input=page.locator('#dedupe-file');
 await input.setInputFiles({name:'records.csv',mimeType:'text/csv',buffer:Buffer.from('name,email\nSteven Smith,same@example.com\nStephen Smith,same@example.com\n')});
 await page.getByRole('button',{name:'Find duplicate clusters'}).click();
 await expect(page.getByText(/Review status: pending/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Export reconciled CSV'})).toBeDisabled();
 await page.getByRole('button',{name:'Approve merge'}).click();
 await expect(page.getByRole('button',{name:'Export reconciled CSV'})).toBeEnabled();

 await input.setInputFiles({name:'unique.csv',mimeType:'text/csv',buffer:Buffer.from('name,email\nAda,a@example.com\nGrace,g@example.com\n')});
 await page.getByRole('button',{name:'Find duplicate clusters'}).click();
 await expect(page.getByRole('status')).toContainText(/No duplicate clusters/);
 await expect(page.getByRole('button',{name:'Export reconciled CSV'})).toBeEnabled();
});
