import { expect, test } from '@playwright/test';

const geojson={type:'FeatureCollection',features:[{type:'Feature',properties:{id:1,label:'route one'},geometry:{type:'LineString',coordinates:[[0,0],[1,1],[2,1],[3,2]]}}]};

test('binds simplification output to its settings, format, inspection, and statistics',async({page})=>{
 await page.goto('./#/tools/geojson-simplifier');
 await page.locator('#geo-file').setInputFiles({name:'route.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(geojson))});
 await expect(page.getByText(/RFC 7946 structural check: passes/i)).toBeVisible();
 await expect(page.locator('#geo-feature-select')).toHaveValue('0');
 await expect(page.getByTestId('geo-feature-inspector')).toContainText('route one');
 await page.getByRole('button',{name:'Simplify geometry'}).click();
 await expect(page.getByText(/Generated settings/)).toBeVisible();
 await expect(page.getByText(/Post-simplification check: passes/i)).toBeVisible();
 await expect(page.getByRole('button',{name:/Download generated GeoJSON/})).toBeEnabled();

 const statsDownload=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download processing stats'}).click();
 expect((await statsDownload).suggestedFilename()).toBe('route.simplification-stats.json');

 await page.locator('#geo-output').selectOption('topojson');
 await expect(page.getByText(/Generated settings/)).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Download generated GeoJSON/})).toHaveCount(0);
 await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText(/Run simplification again/);
});

test('a slower previous file read cannot overwrite a newer GeoJSON selection',async({page})=>{
 await page.addInitScript(()=>{
   const original=File.prototype.text;
   File.prototype.text=function(this:File){
     const read=()=>original.call(this);
     return this.name==='slow.geojson'?new Promise<string>((resolve,reject)=>setTimeout(()=>void read().then(resolve,reject),250)):read();
   };
 });
 await page.goto('./#/tools/geojson-simplifier');
 const input=page.locator('#geo-file');
 const slow={type:'LineString',coordinates:[[0,0],[1,1]]};
 const fast={type:'LineString',coordinates:[[0,0],[1,1],[2,2],[3,3]]};
 await input.setInputFiles({name:'slow.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(slow))});
 await input.setInputFiles({name:'fast.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(fast))});
 await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText('4 positions loaded');
 await page.waitForTimeout(400);
 await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText('4 positions loaded');
 await expect(page.getByText(/4 positions/)).toBeVisible();
});

test('all interoperability warnings remain reachable instead of silently truncating after twenty',async({page})=>{
 await page.goto('./#/tools/geojson-simplifier');
 const positions=Array.from({length:25},(_,index)=>[index,-20+index,100,index]);
 const source={type:'MultiPoint',coordinates:positions};
 await page.locator('#geo-file').setInputFiles({name:'warnings.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(source))});
 await expect(page.getByTestId('geo-warnings-range')).toContainText('Rows 1–20 of 25');
 await page.getByRole('button',{name:'Next'}).click();
 await expect(page.getByTestId('geo-warnings-range')).toContainText('Rows 21–25 of 25');
 await expect(page.getByTestId('geo-warnings')).toContainText('coordinates[24]');
});
