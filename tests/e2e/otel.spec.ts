import { expect, test } from '@playwright/test';

const fixture={data:[{traceID:'trace-a',processes:{p:{serviceName:'svc-a'}},spans:[{traceID:'trace-a',spanID:'same',operationName:'first',references:[],startTime:1000000,duration:100000,processID:'p',tags:[]}]},{traceID:'trace-b',processes:{p:{serviceName:'svc-b'}},spans:[{traceID:'trace-b',spanID:'same',operationName:'second',references:[],startTime:2000000,duration:120000,processID:'p',tags:[]}]}]};

test('keeps reused span IDs isolated by trace and exposes searchable span navigation',async({page})=>{
 await page.goto('./#/tools/otel-flamegraph');
 await page.locator('#otel-file').setInputFiles({name:'traces.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await expect(page.locator('#otel-trace')).toHaveValue('trace-a');
 await expect(page.getByRole('button',{name:'first'})).toBeVisible();
 await page.locator('#otel-trace').selectOption('trace-b');
 await expect(page.getByRole('button',{name:'second'})).toBeVisible();
 await expect(page.getByText('svc-b').first()).toBeVisible();
 await page.locator('#otel-search').fill('does-not-exist');
 await expect(page.getByText(/No spans match/)).toBeVisible();
});

test('matches the backing canvas to a narrow rendered width and caps vertical bitmap allocation',async({page})=>{
 await page.setViewportSize({width:280,height:760});
 const spans=Array.from({length:80},(_,index)=>({traceID:'trace-many',spanID:String(index).padStart(16,'0'),operationName:`overlap-${index}`,references:[],startTime:1000000,duration:100000,processID:'p',tags:[]}));
 const many={data:[{traceID:'trace-many',processes:{p:{serviceName:'svc'}},spans}]};
 await page.goto('./#/tools/otel-flamegraph');
 await page.locator('#otel-file').setInputFiles({name:'many.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(many))});
 const canvas=page.getByRole('img',{name:/Trace flamegraph/}).or(page.locator('canvas[aria-label^="Trace flamegraph"]'));
 await expect(canvas).toBeVisible();
 const metrics=await canvas.evaluate((node:HTMLCanvasElement)=>({rectWidth:node.getBoundingClientRect().width,width:node.width,height:node.height,dpr:window.devicePixelRatio,touchAction:getComputedStyle(node).touchAction}));
 expect(metrics.rectWidth).toBeLessThan(320);
 expect(metrics.width).toBeLessThanOrEqual(Math.ceil(metrics.rectWidth*metrics.dpr)+1);
 expect(metrics.height).toBeLessThanOrEqual(Math.ceil(520*metrics.dpr));
 expect(metrics.touchAction).toContain('pan-y');
 expect(metrics.touchAction).toContain('pinch-zoom');
});

test('ordinary wheel scrolling reaches later lanes without changing timeline zoom', async ({ page, isMobile }) => {
 test.skip(isMobile, 'Mouse wheel behavior is checked in the desktop project.');
 const spans=Array.from({length:80},(_,index)=>({traceID:'trace-many',spanID:String(index).padStart(16,'0'),operationName:`overlap-${index}`,references:[],startTime:1000000,duration:100000,processID:'p',tags:[]}));
 await page.goto('./#/tools/otel-flamegraph');
 await page.locator('#otel-file').setInputFiles({name:'many.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({data:[{traceID:'trace-many',processes:{p:{serviceName:'svc'}},spans}]}))});
 const canvas=page.locator('canvas[aria-label^="Trace flamegraph"]');
 await expect(canvas).toBeVisible();
 await canvas.hover();
 await page.mouse.wheel(0, 400);
 await expect.poll(() => page.getByRole('region', { name: 'Scrollable trace flamegraph' }).evaluate(node => node.scrollTop)).toBeGreaterThan(0);
});
