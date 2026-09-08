import { describe, expect, it } from 'vitest';
import { clampAudioSample, encodePcm24Wav, equalPowerMix, renderedChannelCount, validateFilterRange, validateImpulseChannels } from '../../src/tools/audio/audio-engine';

const ascii=(view:DataView,offset:number,length:number)=>String.fromCharCode(...Array.from({length},(_,index)=>view.getUint8(offset+index)));
function signed24(view:DataView,offset:number){const raw=view.getUint8(offset)|(view.getUint8(offset+1)<<8)|(view.getUint8(offset+2)<<16);return raw&0x800000?raw|~0xffffff:raw}

describe('room graph configuration',()=>{
 it('computes a bounded equal-power wet/dry crossfade',()=>{expect(equalPowerMix(0)).toEqual({dryGain:1,wetGain:0});expect(equalPowerMix(1).dryGain).toBeCloseTo(0,10);expect(equalPowerMix(1).wetGain).toBeCloseTo(1,10);const middle=equalPowerMix(.5);expect(middle.dryGain).toBeCloseTo(Math.SQRT1_2,10);expect(middle.wetGain).toBeCloseTo(Math.SQRT1_2,10);});
 it('accepts only ConvolverNode-supported IR channel counts',()=>{for(const count of[1,2,4])expect(()=>validateImpulseChannels(count)).not.toThrow();for(const count of[0,3,6,8])expect(()=>validateImpulseChannels(count)).toThrow(/mono, stereo, or 4-channel/i);});
 it('caps filter frequencies to the current Nyquist range',()=>{expect(validateFilterRange(80,24_000,44_100)).toEqual({lowCutHz:80,highCutHz:22049});expect(validateFilterRange(30_000,31_000,48_000)).toEqual({lowCutHz:23980,highCutHz:23999});});
 it('keeps offline rendering channel counts compatible with the convolution graph',()=>{expect(renderedChannelCount(1,1)).toBe(1);expect(renderedChannelCount(2,4)).toBe(4);expect(()=>renderedChannelCount(2,6)).toThrow(/ConvolverNode/i);});
});

describe('PCM24 WAV encoder',()=>{
 it('clamps finite audio samples to the normalized PCM range',()=>{expect(clampAudioSample(-2)).toBe(-1);expect(clampAudioSample(-.25)).toBe(-.25);expect(clampAudioSample(.75)).toBe(.75);expect(clampAudioSample(2)).toBe(1);expect(clampAudioSample(Number.NaN)).toBe(0);});
 it('writes a little-endian 24-bit PCM RIFF/WAVE file with correct metadata',()=>{const left=new Float32Array([-1,0,1]),right=new Float32Array([1,.5,-1]),buffer=encodePcm24Wav([left,right],48_000),view=new DataView(buffer);expect(ascii(view,0,4)).toBe('RIFF');expect(ascii(view,8,4)).toBe('WAVE');expect(view.getUint16(22,true)).toBe(2);expect(view.getUint32(24,true)).toBe(48_000);expect(view.getUint16(34,true)).toBe(24);expect(buffer.byteLength).toBe(62);expect(signed24(view,44)).toBe(-8_388_608);expect(signed24(view,47)).toBe(8_388_607);expect(signed24(view,53)).toBeCloseTo(4_194_304,0);});
 it('rejects missing, mismatched, or invalid channel/sample-rate inputs',()=>{expect(()=>encodePcm24Wav([],48_000)).toThrow(/channel/i);expect(()=>encodePcm24Wav([new Float32Array(2),new Float32Array(3)],48_000)).toThrow(/length/i);expect(()=>encodePcm24Wav([new Float32Array(2)],0)).toThrow(/sample rate/i);});
});
