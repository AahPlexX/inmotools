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
 await expect(page.locator('.status-line[role="status"]')).toContainText('dry.wav decoded');
 await page.locator('#audio-ir').setInputFiles({name:'room.wav',mimeType:'audio/wav',buffer:wav(.5)});
 await expect(page.locator('.status-line[role="status"]')).toContainText('room.wav decoded');
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
 await page.locator('#audio-dry').setInputFiles({name:'dry.wav',mimeType:'audio/wav',buffer:wav(.2)});
 await expect(page.locator('.status-line[role="status"]')).toContainText('dry.wav decoded');
 // A 2 s IR: without the extension the graph is released about 2.2 s after Play; with a 2000 ms pre-delay, about 4.2 s.
 await page.locator('#audio-ir').setInputFiles({name:'room.wav',mimeType:'audio/wav',buffer:wav(2)});
 await expect(page.locator('.status-line[role="status"]')).toContainText('room.wav decoded');
 await page.getByRole('button',{name:'Play preview'}).click();
 await expect(page.locator('.status-line[role="status"]')).toContainText('remaining convolution tail');
 await page.locator('#audio-predelay').fill('2000');
 await page.waitForTimeout(2300);
 await expect(page.locator('.status-line[role="status"]')).toContainText('remaining convolution tail');
 await expect(page.locator('.status-line[role="status"]')).toContainText('audio graph released',{timeout:5000});
});

/** 16-bit PCM WAV at 8 kHz; each channel is silent except for full-scale clicks at the given times (seconds). */
function clickWav(seconds: number, clicks: number[][]) {
 const rate=8000,channels=clicks.length,frames=Math.ceil(rate*seconds),buffer=Buffer.alloc(44+frames*2*channels);
 buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(channels,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2*channels,28);buffer.writeUInt16LE(2*channels,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(frames*2*channels,40);
 clicks.forEach((times,channel)=>{for(const time of times){const frame=Math.min(frames-1,Math.round(time*rate));buffer.writeInt16LE(32767,44+(frame*channels+channel)*2)}});
 return buffer;
}

function readPcm24Wav(bytes: Buffer) {
 expect(bytes.toString('ascii',0,4)).toBe('RIFF');
 expect(bytes.toString('ascii',8,12)).toBe('WAVE');
 const channels=bytes.readUInt16LE(22),sampleRate=bytes.readUInt32LE(24),bits=bytes.readUInt16LE(34),dataSize=bytes.readUInt32LE(40),frames=dataSize/(3*channels);
 const data=Array.from({length:channels},()=>new Float32Array(frames));
 for(let frame=0;frame<frames;frame++)for(let channel=0;channel<channels;channel++){const offset=44+(frame*channels+channel)*3;let value=bytes[offset]|(bytes[offset+1]<<8)|(bytes[offset+2]<<16);if(value&0x800000)value-=0x1000000;data[channel][frame]=value/8_388_608}
 return {channels,sampleRate,bits,data};
}

const peakTime=(samples: Float32Array,sampleRate: number)=>{let best=0;for(let index=1;index<samples.length;index++)if(Math.abs(samples[index])>Math.abs(samples[best]))best=index;return {seconds:best/sampleRate,level:Math.abs(samples[best])}};

test('CRP-R08 live controls update the running graph without rebuilding it or stopping playback',async({page})=>{
 await page.addInitScript(()=>{
  const counts={convolvers:0,sources:0,starts:0,targets:[] as number[]};
  (window as unknown as {__roomProbe:typeof counts}).__roomProbe=counts;
  const createConvolver=BaseAudioContext.prototype.createConvolver,createBufferSource=BaseAudioContext.prototype.createBufferSource,start=AudioBufferSourceNode.prototype.start,setTargetAtTime=AudioParam.prototype.setTargetAtTime;
  BaseAudioContext.prototype.createConvolver=function(){counts.convolvers+=1;return createConvolver.call(this)};
  BaseAudioContext.prototype.createBufferSource=function(){counts.sources+=1;return createBufferSource.call(this)};
  AudioBufferSourceNode.prototype.start=function(...args:Parameters<AudioBufferSourceNode['start']>){counts.starts+=1;return start.apply(this,args)};
  AudioParam.prototype.setTargetAtTime=function(value:number,time:number,constant:number){counts.targets.push(value);return setTargetAtTime.call(this,value,time,constant)};
 });
 await page.goto('./#/tools/convolution-room-profiler');
 await page.locator('#audio-dry').setInputFiles({name:'long.wav',mimeType:'audio/wav',buffer:clickWav(6,[[0,1,2,3,4,5]])});
 await expect(page.locator('.status-line[role="status"]')).toContainText('long.wav decoded');
 await page.locator('#audio-ir').setInputFiles({name:'room.wav',mimeType:'audio/wav',buffer:clickWav(.5,[[0]])});
 await expect(page.locator('.status-line[role="status"]')).toContainText('room.wav decoded');
 const probe=()=>page.evaluate(()=>(window as unknown as {__roomProbe:{convolvers:number;sources:number;starts:number;targets:number[]}}).__roomProbe);
 await page.getByRole('button',{name:'Play preview'}).click();
 await expect(page.locator('.status-line[role="status"]')).toContainText('Playing locally');
 await expect(page.getByRole('img',{name:'Live audio frequency spectrum'})).toBeVisible();
 const before=await probe();
 expect(before).toMatchObject({convolvers:1,sources:1,starts:1});
 await page.locator('#audio-wet').fill('1');
 await page.locator('#audio-output').fill('0.5');
 await page.locator('#audio-predelay').fill('250');
 await page.locator('#audio-lowcut').fill('200');
 await page.locator('#audio-highcut').fill('3000');
 await page.getByRole('checkbox',{name:/Bypass convolution/}).check();
 await page.getByRole('checkbox',{name:/Bypass convolution/}).uncheck();
 const after=await probe();
 expect(after).toMatchObject({convolvers:1,sources:1,starts:1});
 const applied=after.targets.slice(before.targets.length);
 expect(applied).toContain(1);
 expect(applied).toContain(0.5);
 expect(applied).toContain(0.25);
 expect(applied).toContain(200);
 expect(applied).toContain(3000);
 await expect(page.getByRole('button',{name:'Pause'})).toBeEnabled();
 await expect(page.getByRole('img',{name:'Live audio frequency spectrum'})).toBeVisible();
 await expect(page.locator('.status-line[role="status"]')).not.toContainText(/failed/i);
 const position=async()=>Number((await page.getByText(/^Playback position · /).innerText()).match(/· ([\d.]+) \//)![1]);
 const first=await position();
 await expect.poll(position,{timeout:5000}).toBeGreaterThan(first);
 await page.getByRole('button',{name:'Stop + clear tail'}).click();
 await expect(page.locator('.status-line[role="status"]')).toContainText('audio graph released');
});

test('CRP-R13 a stereo source with a stereo IR renders a stereo WAV that keeps each IR channel',async({page})=>{
 await page.goto('./#/tools/convolution-room-profiler');
 await page.locator('#audio-dry').setInputFiles({name:'stereo-dry.wav',mimeType:'audio/wav',buffer:clickWav(.1,[[0],[0]])});
 await expect(page.locator('.status-line[role="status"]')).toContainText('stereo-dry.wav decoded');
 await expect(page.locator('.status-line[role="status"]')).toContainText('2 channels');
 await page.locator('#audio-ir').setInputFiles({name:'stereo-ir.wav',mimeType:'audio/wav',buffer:clickWav(.5,[[0],[.3]])});
 await expect(page.locator('.status-line[role="status"]')).toContainText('stereo-ir.wav decoded');
 await expect(page.locator('.metric').filter({hasText:'IR channels'})).toContainText('2');
 await page.locator('#audio-wet').fill('1');
 await page.locator('#audio-predelay').fill('0');
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Render 24-bit WAV'}).click();
 const file=await download;
 expect(file.suggestedFilename()).toBe('stereo-dry.convolved-24bit.wav');
 const stream=await file.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(chunk as Buffer);
 const wavFile=readPcm24Wav(Buffer.concat(chunks));
 expect(wavFile.channels).toBe(2);
 expect(wavFile.bits).toBe(24);
 await expect(page.locator('.status-line[role="status"]')).toContainText('2-channel 24-bit PCM WAV');
 const left=peakTime(wavFile.data[0],wavFile.sampleRate),right=peakTime(wavFile.data[1],wavFile.sampleRate);
 expect(left.level).toBeGreaterThan(0.01);
 expect(right.level).toBeGreaterThan(0.01);
 expect(left.seconds).toBeLessThan(0.05);
 expect(right.seconds).toBeGreaterThan(0.28);
 expect(right.seconds).toBeLessThan(0.35);
});

for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
 test(`CRP-R15 lays out without horizontal overflow and keeps controls usable at ${width} px`,async({page,isMobile})=>{
  test.skip(isMobile,'viewport matrix runs on the desktop project');
  await page.setViewportSize({width,height:width<800?800:1000});
  await page.goto('./#/tools/convolution-room-profiler');
  await loadAudioPair(page);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  for(const name of ['Play preview','Pause','Stop + clear tail','Render 24-bit WAV']){
   const box=await page.getByRole('button',{name,exact:true}).boundingBox();
   expect(box&&box.x>=0&&box.x+box.width<=width+1&&box.height>=24,`${name} inside viewport at ${width}px`).toBe(true);
  }
  for(const id of ['audio-dry','audio-ir','audio-wet','audio-predelay','audio-lowcut','audio-highcut','audio-output']){
   const box=await page.locator(`#${id}`).boundingBox();
   expect(box&&box.x>=0&&box.x+box.width<=width+1,`#${id} inside viewport at ${width}px`).toBe(true);
  }
  const spectrum=await page.getByRole('img',{name:'Audio frequency spectrum idle'}).boundingBox();
  expect(spectrum&&spectrum.x>=0&&spectrum.x+spectrum.width<=width+1).toBe(true);
  await page.getByRole('button',{name:'Play preview'}).click();
  await expect(page.locator('.status-line[role="status"]')).toContainText('audio graph released',{timeout:5000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
 });
}
