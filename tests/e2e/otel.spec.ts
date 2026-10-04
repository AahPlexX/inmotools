import { expect, test } from '@playwright/test';

const fixture={data:[{traceID:'trace-a',processes:{p:{serviceName:'svc-a'}},spans:[{traceID:'trace-a',spanID:'same',operationName:'first',references:[],startTime:1000000,duration:100000,processID:'p',tags:[]}]},{traceID:'trace-b',processes:{p:{serviceName:'svc-b'}},spans:[{traceID:'trace-b',spanID:'same',operationName:'second',references:[],startTime:2000000,duration:120000,processID:'p',tags:[]}]}]};

test('keeps reused span IDs isolated by trace and exposes searchable span navigation',async({page})=>{
 await page.goto('./#/tools/otel-flamegraph');
 await page.locator('#otel-file').setInputFiles({name:'traces.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await expect(page.locator('#otel-trace')).toHaveValue('trace-a');
 await expect(page.getByRole('button',{name:'first'})).toBeVisible();
 await page.locator('#otel-trace').selectOption('trace-b');
 await expect(page.getByRole('button',{name:'second'})).toBeVisible();
 await expect(page.getByRole('cell', { name: 'svc-b' })).toBeVisible();
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

type Page = import('@playwright/test').Page;

const jaegerSpan=(traceID:string,spanID:string,operationName:string,startMs:number,durationMs:number,processID:string,extra:Record<string,unknown>={})=>({traceID,spanID,operationName,references:[],startTime:1_000_000_000+startMs*1000,duration:durationMs*1000,processID,tags:[],...extra});
const siblings={data:[{traceID:'trace-zoom',processes:{p:{serviceName:'svc'}},spans:[jaegerSpan('trace-zoom','span-a','left-half',0,50,'p'),jaegerSpan('trace-zoom','span-b','right-half',50,50,'p')]}]};
const otlpRich={resourceSpans:[
 {resource:{attributes:[{key:'service.name',value:{stringValue:'checkout-api'}}]},scopeSpans:[{spans:[
  {traceId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',spanId:'1111111111111111',name:'POST /checkout',startTimeUnixNano:'1788024000000000000',endTimeUnixNano:'1788024000100000000',attributes:[{key:'http.route',value:{stringValue:'/checkout'}}],status:{code:1}},
  {traceId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',spanId:'3333333333333333',parentSpanId:'1111111111111111',name:'load cart',startTimeUnixNano:'1788024000002000000',endTimeUnixNano:'1788024000007000000',attributes:[],status:{code:1}},
 ]}]},
 {resource:{attributes:[{key:'service.name',value:{stringValue:'payments-api'}}]},scopeSpans:[{spans:[
  {traceId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',spanId:'2222222222222222',parentSpanId:'1111111111111111',name:'charge card',startTimeUnixNano:'1788024000020000000',endTimeUnixNano:'1788024000090000000',attributes:[{key:'error.type',value:{stringValue:'payment_declined'}},{key:'card.brand',value:{stringValue:'visa-gold'}}],status:{code:2}},
 ]}]},
]};

async function loadTrace(page:Page,payload:unknown,name='trace.json'){
 await page.goto('./#/tools/otel-flamegraph');
 await page.locator('#otel-file').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
 await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText('spans loaded');
}
const metric=(page:Page,label:string)=>page.locator('.metric',{has:page.locator('span',{hasText:new RegExp(`^${label}$`)})}).locator('strong');
const detail=(page:Page,label:string)=>page.locator('[aria-label="Selected trace span identifiers"]').locator('tr',{has:page.locator('th',{hasText:new RegExp(`^${label}$`)})}).locator('td');
const flamegraph=(page:Page)=>page.locator('canvas[aria-label^="Trace flamegraph"]');

async function clickPlot(page:Page,fraction:number,row=0){
 const canvas=flamegraph(page);
 await canvas.scrollIntoViewIfNeeded();
 const box=(await canvas.boundingBox())!;
 const width=Math.floor(box.width),left=Math.min(72,Math.max(40,Math.floor(width*.24))),plotWidth=Math.max(24,width-left-8);
 await page.mouse.click(box.x+left+plotWidth*fraction,box.y+30+row*34+12);
}

async function plotPixel(page:Page,fraction:number,row=0){
 return flamegraph(page).evaluate((node:HTMLCanvasElement,[fraction,row])=>{const rect=node.getBoundingClientRect(),width=Math.floor(rect.width),left=Math.min(72,Math.max(40,Math.floor(width*.24))),plotWidth=Math.max(24,width-left-8),scale=node.width/width;const x=Math.floor((left+plotWidth*fraction)*scale),y=Math.floor((30+row*34+4)*scale);return Array.from(node.getContext('2d')!.getImageData(x,y,1,1).data)},[fraction,row] as const);
}

test('OTF-R04 choosing another trace switches the flamegraph, table and details',async({page})=>{
 const twoTraces={data:[...fixture.data,{traceID:'trace-c',processes:{q:{serviceName:'svc-c'}},spans:[jaegerSpan('trace-c','c1','third-root',0,30,'q'),jaegerSpan('trace-c','c2','third-child',5,10,'q')]}]};
 await loadTrace(page,twoTraces);
 const trace=page.locator('#otel-trace');
 await expect(trace.locator('option')).toHaveText(['trace-a','trace-b','trace-c']);
 await expect(trace).toHaveValue('trace-a');
 await expect(metric(page,'Trace spans')).toHaveText('1');
 await expect(detail(page,'Operation')).toHaveText('first');
 await trace.selectOption('trace-c');
 await expect(metric(page,'Trace spans')).toHaveText('2');
 await expect(flamegraph(page)).toHaveAttribute('aria-label',/with 2 spans/);
 await expect(page.getByRole('button',{name:'third-root'})).toBeVisible();
 await expect(page.getByRole('button',{name:'third-child'})).toBeVisible();
 await expect(page.getByRole('button',{name:'first',exact:true})).toHaveCount(0);
 await expect(detail(page,'Trace ID')).toHaveText('trace-c');
 await expect(detail(page,'Operation')).toHaveText('third-root');
});

test('OTF-R07 zoom buttons, + and - keys, Home and arrow keys change the timeline and selection',async({page})=>{
 await loadTrace(page,siblings);
 const canvas=flamegraph(page);
 await expect(canvas).toBeVisible();
 await clickPlot(page,.75);
 await expect(detail(page,'Operation')).toHaveText('right-half');
 const zoomIn=page.getByRole('button',{name:'Zoom in'}),zoomOut=page.getByRole('button',{name:'Zoom out'});
 for(let index=0;index<3;index++)await zoomIn.click();
 await clickPlot(page,.75);
 await expect(detail(page,'Operation')).toHaveText('left-half');
 for(let index=0;index<3;index++)await zoomOut.click();
 await clickPlot(page,.75);
 await expect(detail(page,'Operation')).toHaveText('right-half');
 for(let index=0;index<3;index++)await zoomIn.click();
 await page.getByRole('button',{name:'Fit timeline'}).click();
 await clickPlot(page,.75);
 await expect(detail(page,'Operation')).toHaveText('right-half');

 await canvas.focus();
 for(let index=0;index<3;index++)await page.keyboard.press('+');
 await clickPlot(page,.75);
 await expect(detail(page,'Operation')).toHaveText('left-half');
 await canvas.focus();
 for(let index=0;index<3;index++)await page.keyboard.press('-');
 await clickPlot(page,.75);
 await expect(detail(page,'Operation')).toHaveText('right-half');
 await canvas.focus();
 for(let index=0;index<3;index++)await page.keyboard.press('=');
 await page.keyboard.press('Home');
 await clickPlot(page,.75);
 await expect(detail(page,'Operation')).toHaveText('right-half');

 await canvas.focus();
 await page.keyboard.press('ArrowUp');
 await expect(detail(page,'Operation')).toHaveText('left-half');
 await page.keyboard.press('ArrowDown');
 await expect(detail(page,'Operation')).toHaveText('right-half');
});

test('OTF-R08 clicking a span on the flamegraph selects it and shows it in the details',async({page})=>{
 await loadTrace(page,otlpRich);
 await expect(detail(page,'Operation')).toHaveText('POST /checkout');
 await clickPlot(page,.5,1);
 await expect(detail(page,'Operation')).toHaveText('charge card');
 await expect(detail(page,'Span ID')).toHaveText('2222222222222222');
 await clickPlot(page,.05,1);
 await expect(detail(page,'Operation')).toHaveText('load cart');
 await clickPlot(page,.5,0);
 await expect(detail(page,'Operation')).toHaveText('POST /checkout');
});

test('OTF-R09 services get distinct styling and labels, and errors are marked in text',async({page})=>{
 await page.addInitScript(()=>{const drawn:string[]=[];(window as unknown as {drawnText:string[]}).drawnText=drawn;const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(this:CanvasRenderingContext2D,text:string,...rest:[number,number,number?]){drawn.push(text);return original.call(this,text,...rest)}});
 await loadTrace(page,otlpRich);
 await expect(flamegraph(page)).toBeVisible();
 const drawn=await page.evaluate(()=>(window as unknown as {drawnText:string[]}).drawnText);
 expect(drawn).toContain('!');
 expect(drawn.some(text=>/^(◆ |! )charge card$/.test(text))).toBe(true);
 expect(drawn).not.toContain('! load cart');
 const checkout=await plotPixel(page,.5,0),payments=await plotPixel(page,.5,1),cart=await plotPixel(page,.04,1);
 expect(checkout).not.toEqual(payments);
 expect(cart).toEqual(checkout);
 const rows=page.getByRole('table',{name:'Searchable spans in selected trace'}).locator('tbody tr');
 await expect(rows.filter({hasText:'charge card'})).toContainText('payments-api');
 await expect(rows.filter({hasText:'charge card'}).getByRole('cell',{name:'Error',exact:true})).toBeVisible();
 await expect(rows.filter({hasText:'POST /checkout'})).toContainText('checkout-api');
 await expect(rows.filter({hasText:'POST /checkout'}).getByRole('cell',{name:'OK',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'charge card'}).click();
 await expect(metric(page,'Status')).toHaveText('Error !');
 await expect(metric(page,'Service')).toHaveText('payments-api');
 await expect(metric(page,'Errors')).toHaveText('1');
});

test('OTF-R10 service, errors-only, minimum-latency and attribute search filters narrow the spans',async({page})=>{
 await loadTrace(page,otlpRich);
 const rows=page.getByRole('table',{name:'Searchable spans in selected trace'}).locator('tbody tr');
 await expect(metric(page,'Visible')).toHaveText('3');
 await page.locator('#otel-service').selectOption('payments-api');
 await expect(metric(page,'Visible')).toHaveText('1');
 await expect(rows).toHaveCount(1);
 await expect(rows).toContainText('charge card');
 await page.locator('#otel-service').selectOption('all');
 await page.getByRole('checkbox',{name:'Errors only'}).check();
 await expect(metric(page,'Visible')).toHaveText('1');
 await expect(rows).toContainText('charge card');
 await page.getByRole('checkbox',{name:'Errors only'}).uncheck();
 await page.locator('#otel-latency').fill('50');
 await expect(metric(page,'Visible')).toHaveText('2');
 await expect(rows.filter({hasText:'load cart'})).toHaveCount(0);
 await page.locator('#otel-latency').fill('0');
 await page.locator('#otel-search').fill('visa-gold');
 await expect(metric(page,'Visible')).toHaveText('1');
 await expect(rows).toContainText('charge card');
 await page.locator('#otel-search').fill('LOAD CART');
 await expect(rows).toHaveCount(1);
 await expect(rows).toContainText('load cart');
 await page.locator('#otel-search').fill('');
 await page.locator('#otel-latency').fill('1000');
 await expect(page.getByText('No spans match the current filters.')).toBeVisible();
 await expect(flamegraph(page)).toHaveCount(0);
});

test('OTF-R12 span details show service, duration, status, operation, IDs, parent, start and attributes',async({page})=>{
 await loadTrace(page,otlpRich);
 await page.getByRole('button',{name:'charge card'}).click();
 await expect(metric(page,'Service')).toHaveText('payments-api');
 await expect(metric(page,'Duration')).toHaveText('70.000 ms');
 await expect(metric(page,'Status')).toHaveText('Error !');
 await expect(detail(page,'Operation')).toHaveText('charge card');
 await expect(detail(page,'Trace ID')).toHaveText('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
 await expect(detail(page,'Span ID')).toHaveText('2222222222222222');
 await expect(detail(page,'Parent')).toHaveText('1111111111111111');
 await expect(detail(page,'Start')).toHaveText('20.000 ms');
 const attributes=JSON.parse(await page.locator('details pre.code-output').textContent()??'{}');
 expect(attributes).toEqual({'error.type':'payment_declined','card.brand':'visa-gold'});
 await page.getByRole('button',{name:'POST /checkout'}).click();
 await expect(detail(page,'Parent')).toHaveText('root');
 await expect(metric(page,'Status')).toHaveText('OK');
});

for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
 test(`OTF-R15 lays out without horizontal overflow at ${width} px`, async ({ page, isMobile }) => {
  test.skip(isMobile, 'viewport matrix runs on the desktop project');
  await page.setViewportSize({ width, height: width < 800 ? 800 : 1000 });
  await loadTrace(page, otlpRich);
  await page.getByRole('button',{name:'charge card'}).click();
  await expect(flamegraph(page)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  for (const locator of [page.getByRole('button',{name:'Fit timeline'}),page.getByRole('button',{name:'Zoom in'}),page.getByRole('button',{name:'Zoom out'}),page.locator('#otel-trace'),page.locator('#otel-service'),page.locator('#otel-latency'),page.locator('#otel-search'),page.getByRole('checkbox',{name:'Errors only'}),flamegraph(page)]) {
   const box = await locator.boundingBox();
   expect(box && box.x >= 0 && box.x + box.width <= width + 1, `control inside viewport at ${width}px`).toBe(true);
  }
 });
}
