import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const geojson={type:'FeatureCollection',features:[{type:'Feature',properties:{id:1,label:'route one'},geometry:{type:'LineString',coordinates:[[0,0],[1,1],[2,1],[3,2]]}}]};

test('binds simplification output to its settings, format, inspection, and statistics',async({page})=>{
 await page.goto('./#/tools/geojson-simplifier');
 const input=Buffer.from(JSON.stringify(geojson,null,2));
 await page.locator('#geo-file').setInputFiles({name:'route.geojson',mimeType:'application/geo+json',buffer:input});
 await expect(page.getByText(/RFC 7946 structural check: passes/i)).toBeVisible();
 await expect(page.locator('#geo-feature-select')).toHaveValue('0');
 await expect(page.getByTestId('geo-feature-inspector')).toContainText('route one');
 await page.getByRole('button',{name:'Simplify geometry'}).click();
 await expect(page.getByText(/Generated settings/)).toBeVisible();
 await expect(page.getByText(/Post-simplification check: passes/i)).toBeVisible();
 await expect(page.getByRole('button',{name:/Download generated GeoJSON/})).toBeEnabled();

 const statsDownload=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download processing stats'}).click();
 const stats=await statsDownload;
 expect(stats.suggestedFilename()).toBe('route.simplification-stats.json');
 const metrics=JSON.parse(await readFile(await stats.path(),'utf8'));
 expect(metrics.output.validation.valid).toBe(true);
 expect(metrics.input.bytes).toBe(input.byteLength);
 const geoDownload=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download generated GeoJSON'}).click();
 const geoBytes=await readFile(await (await geoDownload).path());
 expect(JSON.parse(geoBytes.toString()).type).toBe('FeatureCollection');
 expect(metrics.output.bytes).toBe(geoBytes.byteLength);

 await page.locator('#geo-output').selectOption('topojson');
 await expect(page.getByText(/Generated settings/)).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Download generated GeoJSON/})).toBeDisabled();
 await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText(/Run simplification again/);
 await page.getByRole('button',{name:'Simplify geometry'}).click();
 await expect(page.getByRole('button',{name:'Download generated TopoJSON'})).toBeEnabled();
 const topologyDownload=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download generated TopoJSON'}).click();
 const topology=JSON.parse(await readFile(await (await topologyDownload).path(),'utf8'));
 expect(topology.type).toBe('Topology');
 expect(topology.objects.data.type).toBe('GeometryCollection');
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
 await input.setInputFiles({name:'old.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(fast))});
 await page.getByRole('button',{name:'Simplify geometry'}).click();
 await expect(page.getByRole('button',{name:'Download generated GeoJSON'})).toBeEnabled();
 await input.setInputFiles({name:'slow.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(slow))});
 await expect(page.getByRole('button',{name:'Download generated GeoJSON'})).toHaveCount(0);
 await input.setInputFiles({name:'fast.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(fast))});
 await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText('4 coordinate positions loaded');
 await page.waitForTimeout(400);
 await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText('4 coordinate positions loaded');
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

test('point collections preview as separate points and linked view works without dragging',async({page})=>{
 await page.goto('./#/tools/geojson-simplifier');
 await page.locator('#geo-file').setInputFiles({name:'sites.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify({type:'MultiPoint',coordinates:[[0,0],[1,1],[2,2]]}))});
 const preview=page.getByRole('img',{name:'Original GeoJSON geometry preview'});
 await expect(preview.locator('circle')).toHaveCount(3);
 await expect(preview.locator('path')).toHaveCount(0);
 const before=await preview.locator('circle').first().boundingBox();
 await page.getByRole('button',{name:'Pan right'}).click();
 const after=await preview.locator('circle').first().boundingBox();
 expect(after!.x).toBeGreaterThan(before!.x);
 await page.getByRole('button',{name:'Reset linked view'}).click();
 const reset=await preview.locator('circle').first().boundingBox();
 expect(Math.abs(reset!.x-before!.x)).toBeLessThan(1);
 await page.setViewportSize({width:320,height:700});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 const accessibility=await new AxeBuilder({page}).include('[data-testid="suite-workspace"]').analyze();
 expect(accessibility.violations.filter((item)=>item.impact==='serious'||item.impact==='critical')).toEqual([]);
});

test('Stop terminates an in-flight worker and leaves no downloadable partial result',async({page})=>{
 await page.addInitScript(()=>{
   (window as typeof window & {geoWorkerTerminated:boolean}).geoWorkerTerminated=false;
   window.Worker=class {
     onmessage=null;
     onerror=null;
     postMessage(){}
     terminate(){(window as typeof window & {geoWorkerTerminated:boolean}).geoWorkerTerminated=true;}
   } as unknown as typeof Worker;
 });
 await page.goto('./#/tools/geojson-simplifier');
 await page.locator('#geo-file').setInputFiles({name:'held.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(geojson))});
 await page.getByRole('button',{name:'Simplify geometry'}).click();
 await page.getByRole('button',{name:'Stop'}).click();
 await expect(page.getByRole('button',{name:'Download generated GeoJSON'})).toBeDisabled();
 expect(await page.evaluate(()=>(window as typeof window & {geoWorkerTerminated:boolean}).geoWorkerTerminated)).toBe(true);
 await expect(page.locator('.workspace-body .status-line')).toContainText('Simplification stopped');
});
