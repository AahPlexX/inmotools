import { expect, test } from '@playwright/test';

const geojson={type:'FeatureCollection',features:[{type:'Feature',properties:{id:1},geometry:{type:'LineString',coordinates:[[0,0],[1,1],[2,1],[3,2]]}}]};

test('binds simplification output to its settings and format',async({page})=>{
 await page.goto('./#/tools/geojson-simplifier');
 await page.locator('#geo-file').setInputFiles({name:'route.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(geojson))});
 await expect(page.getByText(/RFC 7946 structural check: passes/i)).toBeVisible();
 await page.getByRole('button',{name:'Simplify geometry'}).click();
 await expect(page.getByText(/Generated settings/)).toBeVisible();
 await expect(page.getByRole('button',{name:/Download generated GeoJSON/})).toBeEnabled();
 await page.locator('#geo-output').selectOption('topojson');
 await expect(page.getByText(/Generated settings/)).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Download generated GeoJSON/})).toHaveCount(0);
 await expect(page.getByRole('status')).toContainText(/Run simplification again/);
});
