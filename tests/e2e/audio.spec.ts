import { expect, test } from '@playwright/test';

test('exposes live convolution controls, bypass, gain safety, and idle spectrum without requiring audio fixtures',async({page})=>{
 await page.goto('./#/tools/convolution-room-profiler');
 await expect(page.locator('#audio-wet')).toBeVisible();
 await expect(page.locator('#audio-output')).toBeVisible();
 await page.locator('#audio-output').fill('1.25');
 await expect(page.getByText(/Above unity can clip/i)).toBeVisible();
 await page.getByRole('checkbox',{name:/Bypass convolution/}).check();
 await expect(page.getByRole('img',{name:'Audio frequency spectrum idle'})).toBeVisible();
 await expect(page.getByRole('button',{name:/Render 24-bit WAV/})).toBeDisabled();
});

function wav(seconds: number) {
 const rate=8000,frames=Math.ceil(rate*seconds),buffer=Buffer.alloc(44+frames*2);
 buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(frames*2,40);
 return buffer;
}
async function loadAudioPair(page: import('@playwright/test').Page) {
 await page.locator('#audio-dry').setInputFiles({name:'dry.wav',mimeType:'audio/wav',buffer:wav(.2)});
 await expect(page.getByRole('status')).toContainText('dry.wav decoded');
 await page.locator('#audio-ir').setInputFiles({name:'room.wav',mimeType:'audio/wav',buffer:wav(.5)});
 await expect(page.getByRole('status')).toContainText('room.wav decoded');
}

test('a cancelled render cannot finish or reset a newer render',async({page})=>{
 await page.addInitScript(()=>{
  const finishers:Array<()=>void>=[];
  class ControlledOfflineContext extends OfflineAudioContext {
   startRendering():Promise<AudioBuffer>{return new Promise(resolve=>finishers.push(()=>resolve(this.createBuffer(1,80,8000))))}
  }
  window.OfflineAudioContext=ControlledOfflineContext;
  (window as unknown as {finishAudioRender:(index:number)=>void}).finishAudioRender=index=>finishers[index]();
 });
 await page.goto('./#/tools/convolution-room-profiler');
 await loadAudioPair(page);
 let downloads=0;page.on('download',()=>downloads++);
 await page.getByRole('button',{name:'Render 24-bit WAV'}).click();
 await page.getByRole('button',{name:'Cancel render output'}).click();
 await page.getByRole('button',{name:'Render 24-bit WAV'}).click();
 await page.evaluate(()=>(window as unknown as {finishAudioRender:(index:number)=>void}).finishAudioRender(0));
 await expect(page.getByRole('button',{name:'Cancel render output'})).toBeVisible();
 expect(downloads).toBe(0);
 const download=page.waitForEvent('download');
 await page.evaluate(()=>(window as unknown as {finishAudioRender:(index:number)=>void}).finishAudioRender(1));
 await download;
 await expect(page.getByRole('button',{name:'Cancel render output'})).toHaveCount(0);
 expect(downloads).toBe(1);
});

test('extending pre-delay during the tail postpones graph cleanup',async({page})=>{
 await page.goto('./#/tools/convolution-room-profiler');
 await loadAudioPair(page);
 await page.getByRole('button',{name:'Play preview'}).click();
 await expect(page.getByRole('status')).toContainText('remaining convolution tail');
 await page.locator('#audio-predelay').fill('1500');
 await page.waitForTimeout(900);
 await expect(page.getByRole('status')).toContainText('remaining convolution tail');
 await expect(page.getByRole('status')).toContainText('audio graph released',{timeout:5000});
});
