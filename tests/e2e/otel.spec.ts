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
