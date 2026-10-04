import { describe, expect, it } from 'vitest';
import opentype from 'opentype.js';
import { collectRequiredCodePoints, glyphOutlines, inspectFont, scanFontContainerTableTags, subsetToWoff2, unicodeRangeForCodePoints, unsupportedFeaturesForTableTags } from '../../src/tools/font/font-engine';

const TINY_TTF_BASE64='AAEAAAAKAIAAAwAgT1MvMkUhRCwAAAEoAAAAYGNtYXAADACVAAABlAAAADRnbHlmssEZlgAAAdAAAABMaGVhZC7goYoAAACsAAAANmhoZWEFKgIqAAAA5AAAACRobXR4BuoALQAAAYgAAAAMbG9jYQAZADMAAAHIAAAACG1heHAABQAGAAABCAAAACBuYW1lKwzfCgAAAhwAAAEscG9zdAApACUAAANIAAAAKAABAAAAAQAA6SrXUV8PPPUAAQPoAAAAAOa6LvcAAAAA5rou9wAyAAACJgK8AAAAAwACAAAAAAAAAAEAAAMg/zgAAAKKAAAAZAIIAAEAAAAAAAAAAAAAAAAAAAADAAEAAAADAAQAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAwJOAZAABQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAPz8/PwAAAEEAQgMg/zgAAAMgAMgAAAAAAAAAAAAAAAAAAAAgAAAB9AAAAooAFAJsABkAAAACAAAAAwAAABQAAwABAAAAFAAEACAAAAAEAAQAAQAAAEL//wAAAEH////AAAEAAAAAAAAADQAZACYAAQAyAAABwgK8AAMAADMhESEyAZD+cAK8AAABADIAAAImArwAAgAAMxMTMvr6Arz9RAABADIAAAH0ArwAAwAAMxEhETIBwgK8/UQAAAAACgB+AAEAAAAAAAEADAAAAAEAAAAAAAIABwAMAAEAAAAAAAMAEwATAAEAAAAAAAQAFAAmAAEAAAAAAAYAEwATAAMAAQQJAAEAGAA6AAMAAQQJAAIADgBSAAMAAQQJAAMAJgBgAAMAAQQJAAQAKACGAAMAAQQJAAYAJgBgSW5tbyBGaXh0dXJlUmVndWxhcklubW9GaXh0dXJlLVJlZ3VsYXJJbm1vIEZpeHR1cmUgUmVndWxhcgBJAG4AbQBvACAARgBpAHgAdAB1AHIAZQBSAGUAZwB1AGwAYQByAEkAbgBtAG8ARgBpAHgAdAB1AHIAZQAtAFIAZQBnAHUAbABhAHIASQBuAG0AbwAgAEYAaQB4AHQAdQByAGUAIABSAGUAZwB1AGwAYQByAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAACQAJQ==';
function decodeFixture(){const binary=atob(TINY_TTF_BASE64);return Uint8Array.from(binary,(character)=>character.charCodeAt(0)).buffer;}
function patchWeight(buffer:ArrayBuffer,weight:number){const bytes=new Uint8Array(buffer.slice(0));const view=new DataView(bytes.buffer);const count=view.getUint16(4,false);for(let index=0;index<count;index+=1){const entry=12+index*16;const tag=String.fromCharCode(...bytes.slice(entry,entry+4));if(tag!=='OS/2')continue;const offset=view.getUint32(entry+8,false);view.setUint16(offset+4,weight,false);return bytes.buffer;}throw new Error('OS/2 table not found in fixture.');}
function syntheticWoffWithTag(tag:string){const bytes=new Uint8Array(64);const view=new DataView(bytes.buffer);view.setUint32(0,0x774f4646,false);view.setUint32(8,64,false);view.setUint16(12,1,false);view.setUint32(16,32,false);for(let index=0;index<4;index+=1)bytes[44+index]=tag.charCodeAt(index);view.setUint32(48,64,false);view.setUint32(52,0,false);view.setUint32(56,0,false);return bytes.buffer;}

describe('font subsetter engine',()=>{
 it('deduplicates and sorts Unicode code points from presets plus custom text',()=>{expect(collectRequiredCodePoints({presets:[],customText:'BAA😀B'})).toEqual([65,66,0x1f600]);});
 it('extracts source metrics, weight/style, cmap glyphs, and safety diagnostics',async()=>{const inspection=await inspectFont(decodeFixture(),'fixture.ttf');expect(inspection.familyName).toBe('Inmo Fixture');expect(inspection.styleName).toBe('Regular');expect(inspection.cssStyle).toBe('normal');expect(inspection.weight).toBeGreaterThan(0);expect(inspection.glyphs.some((glyph)=>glyph.codePoint===65&&glyph.name==='A')).toBe(true);expect(inspection.safeToSubset).toBe(true);});
 it('reads WOFF1 table directories and treats shaping-table tags case-insensitively',()=>{expect(scanFontContainerTableTags(syntheticWoffWithTag('GSUB'))).toEqual(['GSUB']);expect(unsupportedFeaturesForTableTags(['gsub'])).toEqual(['glyph substitution (GSUB)']);expect(unsupportedFeaturesForTableTags(['GPOS'])).toEqual(['glyph positioning (GPOS)']);});
 it('recognizes the standard four-character SVG color table tag as unsafe to subset',()=>{expect(scanFontContainerTableTags(syntheticWoffWithTag('SVG '))).toEqual(['SVG ']);expect(unsupportedFeaturesForTableTags(['SVG '])).toEqual(['SVG glyphs']);});
 it('generates compact unicode-range descriptors',()=>{expect(unicodeRangeForCodePoints([65,66,67,70,0x1f600])).toBe('U+41-43, U+46, U+1F600');});
 it('retains notdef plus requested glyphs, reports missing coverage, and emits WOFF2 metadata',async()=>{const result=await subsetToWoff2(decodeFixture(),{presets:[],customText:'A😀'});expect(result.codePoints).toEqual([65]);expect(result.missingCodePoints).toEqual([0x1f600]);expect(result.glyphCount).toBe(2);expect(result.unicodeRange).toBe('U+41');expect(result.cssStyle).toBe('normal');expect(String.fromCharCode(...result.bytes.slice(0,4))).toBe('wOF2');});
 it('preserves and verifies the actual generated OS/2 weight instead of reporting the source weight blindly',async()=>{const source=patchWeight(decodeFixture(),700);expect((await inspectFont(source,'bold.ttf')).weight).toBe(700);const result=await subsetToWoff2(source,{presets:[],customText:'A'});const output=await inspectFont(result.bytes.slice().buffer as ArrayBuffer,'subset.woff2');expect(result.sourceWeight).toBe(700);expect(result.weight).toBe(700);expect(output.weight).toBe(700);});
 it('blocks an output that would retain only .notdef',async()=>{await expect(subsetToWoff2(decodeFixture(),{presets:[],customText:'😀'})).rejects.toThrow(/none of the requested characters are present/i);});
});

function wrapAsWoff1(sfnt:ArrayBuffer):ArrayBuffer{
  const source=new DataView(sfnt);const count=source.getUint16(4,false);
  const tables=Array.from({length:count},(_,index)=>{const entry=12+index*16;return{tag:source.getUint32(entry,false),checksum:source.getUint32(entry+4,false),offset:source.getUint32(entry+8,false),length:source.getUint32(entry+12,false)};});
  const pad=(value:number)=>(value+3)&~3;
  let offset=44+count*20;const placed=tables.map((table)=>{const at=offset;offset+=pad(table.length);return{...table,at};});
  const out=new Uint8Array(offset);const view=new DataView(out.buffer);
  view.setUint32(0,0x774f4646,false);view.setUint32(4,source.getUint32(0,false),false);view.setUint32(8,offset,false);view.setUint16(12,count,false);
  view.setUint32(16,12+count*16+tables.reduce((sum,table)=>sum+pad(table.length),0),false);view.setUint16(20,1,false);
  placed.forEach((table,index)=>{const entry=44+index*20;view.setUint32(entry,table.tag,false);view.setUint32(entry+4,table.at,false);view.setUint32(entry+8,table.length,false);view.setUint32(entry+12,table.length,false);view.setUint32(entry+16,table.checksum,false);out.set(new Uint8Array(sfnt,table.offset,table.length),table.at);});
  return out.buffer;
}

function cffFixture():ArrayBuffer{
  const square=new opentype.Path();square.moveTo(50,0);square.lineTo(450,0);square.lineTo(450,600);square.lineTo(50,600);square.close();
  const font=new opentype.Font({familyName:'Inmo Cff',styleName:'Regular',unitsPerEm:1000,ascender:800,descender:-200,glyphs:[new opentype.Glyph({name:'.notdef',advanceWidth:500,path:new opentype.Path()}),new opentype.Glyph({name:'A',unicode:65,advanceWidth:500,path:square})]});
  return font.toArrayBuffer();
}

it('FNT-R01 inspects TTF, OTF (CFF), WOFF and WOFF2 input',async()=>{
  const ttf=await inspectFont(decodeFixture(),'fixture.ttf');
  const otfBytes=cffFixture();
  expect(String.fromCharCode(...new Uint8Array(otfBytes).slice(0,4))).toBe('OTTO');
  const otf=await inspectFont(otfBytes,'fixture.otf');
  expect(otf.familyName).toBe('Inmo Cff');
  expect(otf.tableTags).toContain('CFF ');
  expect(otf.glyphs.map((glyph)=>glyph.codePoint)).toEqual([65]);
  const woffBytes=wrapAsWoff1(decodeFixture());
  expect(String.fromCharCode(...new Uint8Array(woffBytes).slice(0,4))).toBe('wOFF');
  const woff=await inspectFont(woffBytes,'fixture.woff');
  const woff2Bytes=(await subsetToWoff2(decodeFixture(),{presets:['basic-latin'],customText:''})).bytes;
  expect(String.fromCharCode(...woff2Bytes.slice(0,4))).toBe('wOF2');
  const woff2=await inspectFont(woff2Bytes.slice().buffer as ArrayBuffer,'fixture.woff2');
  for(const inspection of [woff,woff2]){
    expect(inspection.familyName).toBe(ttf.familyName);
    expect(inspection.unitsPerEm).toBe(ttf.unitsPerEm);
    expect(inspection.glyphs.map((glyph)=>glyph.codePoint)).toEqual(ttf.glyphs.map((glyph)=>glyph.codePoint));
  }
});

it('FNT-R06 builds each glyph preview from its parsed outline',async()=>{
  const buffer=decodeFixture();
  const inspection=await inspectFont(buffer,'fixture.ttf');
  const outlines=await glyphOutlines(buffer,inspection.glyphs.map((glyph)=>glyph.glyphIndex));
  expect(outlines.size).toBe(inspection.glyphs.length);
  for(const glyph of inspection.glyphs){
    const outline=outlines.get(glyph.glyphIndex);
    expect(outline?.d).toMatch(/^M/);
    expect(outline?.viewBox.split(' ').map(Number).every(Number.isFinite)).toBe(true);
  }
  const square=(await glyphOutlines(cffFixture(),[1])).get(1);
  expect(square?.d).toBe('M50 800L450 800L450 200L50 200Z');
  expect(square?.viewBox).toBe('0 0 500 1000');
});
