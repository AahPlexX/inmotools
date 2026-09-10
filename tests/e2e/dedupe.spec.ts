import { expect, test } from '@playwright/test';

test('requires explicit cluster review, reports export progress, and allows zero-cluster export',async({page})=>{
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
 await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText(/No duplicate clusters/);
 const exportButton=page.getByRole('button',{name:'Export reconciled CSV'});
 await expect(exportButton).toBeEnabled();
 await page.evaluate(()=>{
   const statuses:string[]=[];
   (window as unknown as {__dedupeStatuses:string[]}).__dedupeStatuses=statuses;
   const node=document.querySelector('.workspace-body .status-line');
   if(node)new MutationObserver(()=>statuses.push(node.textContent??'')).observe(node,{childList:true,subtree:true,characterData:true});
 });
 const download=page.waitForEvent('download');
 await exportButton.click();
 expect((await download).suggestedFilename()).toBe('unique.deduplicated.csv');
 await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText(/Exported 2 reconciled records/);
 const statuses=await page.evaluate(()=>(window as unknown as {__dedupeStatuses:string[]}).__dedupeStatuses);
 expect(statuses.some(value=>/Preparing reconciled export/i.test(value))).toBe(true);
});

test('rejects malformed CSV with an unterminated quoted field',async({page})=>{
 await page.goto('./#/tools/fuzzy-deduplicator');
 await page.locator('#dedupe-file').setInputFiles({name:'malformed.csv',mimeType:'text/csv',buffer:Buffer.from('name,email\r\n"Ada,a@example.com\r\n')});
 await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText(/File load failed:.*quote/i);
});

test('a slower previous CSV read cannot overwrite a newer file selection',async({page})=>{
 await page.addInitScript(()=>{
   const originalText=File.prototype.text;
   File.prototype.text=function(this:File){
     const read=()=>originalText.call(this);
     return this.name==='slow.csv'?new Promise<string>((resolve,reject)=>setTimeout(()=>void read().then(resolve,reject),250)):read();
   };
   const originalArrayBuffer=File.prototype.arrayBuffer;
   File.prototype.arrayBuffer=function(this:File){
     const read=()=>originalArrayBuffer.call(this);
     return this.name==='slow.csv'?new Promise<ArrayBuffer>((resolve,reject)=>setTimeout(()=>void read().then(resolve,reject),250)):read();
   };
 });
 await page.goto('./#/tools/fuzzy-deduplicator');
 const input=page.locator('#dedupe-file');
 await input.setInputFiles({name:'slow.csv',mimeType:'text/csv',buffer:Buffer.from('name\nSlow\n')});
 await input.setInputFiles({name:'fast.csv',mimeType:'text/csv',buffer:Buffer.from('name\nFast A\nFast B\nFast C\n')});
 const status=page.locator('.workspace-body .status-line[role="status"]');
 await expect(status).toContainText(/3 records? loaded/);
 await page.waitForTimeout(400);
 await expect(status).toContainText(/3 records? loaded/);
});

test('decodes Windows-1252 CSV when selected without replacement characters',async({page})=>{
 await page.goto('./#/tools/fuzzy-deduplicator');
 await page.locator('#dedupe-encoding').selectOption('windows-1252');
 const bytes=Buffer.concat([Buffer.from('name\r\nJos','ascii'),Buffer.from([0xe9]),Buffer.from('\r\nJos','ascii'),Buffer.from([0xe9]),Buffer.from('\r\n','ascii')]);
 await page.locator('#dedupe-file').setInputFiles({name:'western.csv',mimeType:'text/csv',buffer:bytes});
 await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText(/2 records? loaded/);
 await page.getByRole('button',{name:'Find duplicate clusters'}).click();
 await expect(page.getByText('José',{exact:true}).first()).toBeVisible();
});

test('labels transitive cluster confidence as the weakest pair',async({page})=>{
 await page.goto('./#/tools/fuzzy-deduplicator');
 await page.locator('#dedupe-file').setInputFiles({name:'chain.csv',mimeType:'text/csv',buffer:Buffer.from('company\naaaa\naabb\nabbb\n')});
 await page.locator('#dedupe-threshold').fill('0.70');
 await page.getByRole('button',{name:'Find duplicate clusters'}).click();
 await expect(page.getByRole('heading',{name:/Cluster 1 · weakest pair 55%/i})).toBeVisible();
});

test('bounds large cluster rows and lets users control review columns independently',async({page})=>{
 await page.goto('./#/tools/fuzzy-deduplicator');
 const headers=['name','email','company','city','state','zip','phone','team','notes','external_id'];
 const row=['Ada','same@example.com','Acme','Boston','MA','02108','555-0100','Ops','same note','A-1'];
 const csv=[headers.join(','),...Array.from({length:30},()=>row.join(','))].join('\n');
 await page.locator('#dedupe-file').setInputFiles({name:'wide.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await page.getByRole('button',{name:'Find duplicate clusters'}).click();
 await expect(page.getByText(/8 of 10 review columns visible/i)).toBeVisible();
 await page.getByLabel('Show notes in review').uncheck();
 const members=page.locator('[data-testid^="dedupe-members-"]').first();
 await expect(members.getByRole('columnheader',{name:'notes'})).toHaveCount(0);
 await expect(members.locator('[data-testid$="-range"]')).toContainText('Rows 1–25 of 30');
 await members.getByRole('button',{name:'Next'}).click();
 await expect(members.locator('[data-testid$="-range"]')).toContainText('Rows 26–30 of 30');
});
