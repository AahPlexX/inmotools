import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  type AudioCodec,
  type InputAudioTrack,
  type InputVideoTrack,
  type OutputFormat,
  type VideoCodec,
} from 'mediabunny';

export type SnappedRange = { requestedStart:number; requestedEnd:number; start:number; end:number; startAdjusted:boolean; endAdjusted:boolean };
export type VideoTrackInspection = { id:number; number:number; codec:string; codecString:string|null; width:number; height:number; keyframes:number[] };
export type AudioTrackInspection = { id:number; number:number; codec:string; codecString:string|null; sampleRate:number|null; numberOfChannels:number|null };
export type MediaInspection = { fileName:string; size:number; mimeType:string; duration:number; videos:VideoTrackInspection[]; audios:AudioTrackInspection[]; primaryVideoId:number|null; primaryAudioId:number|null };
export type PacketExportOptions = { videoTrackId:number; audioTrackId:number|null; signal?:AbortSignal; onProgress?:(progress:number)=>void };

const finite=(value:number,fallback:number)=>Number.isFinite(value)?value:fallback;
const clamp=(value:number,minimum:number,maximum:number)=>Math.min(maximum,Math.max(minimum,value));

export function snapTrimRange(requestedStart:number,requestedEnd:number,keyframes:number[],duration:number):SnappedRange{
  if(!Number.isFinite(duration)||duration<=0)throw new Error('Media duration must be greater than zero.');
  const normalizedStart=clamp(finite(requestedStart,0),0,duration),normalizedEnd=clamp(finite(requestedEnd,duration),0,duration);
  if(normalizedStart>=normalizedEnd)throw new Error('Trim start must be before trim end.');
  const usable=[...new Set(keyframes.filter((value)=>Number.isFinite(value)&&value>=0&&value<=duration))].sort((a,b)=>a-b);
  if(!usable.length)throw new Error('No usable video keyframe was found.');
  let start=usable[0];for(const keyframe of usable){if(keyframe>normalizedStart)break;start=keyframe;}
  let end=duration;for(const keyframe of usable){if(keyframe>=normalizedEnd){end=keyframe;break;}}
  if(end<=start)end=usable.find((keyframe)=>keyframe>start)??duration;
  if(end<=start)throw new Error('The selected range does not contain a complete keyframe interval.');
  return {requestedStart:normalizedStart,requestedEnd:normalizedEnd,start,end,startAdjusted:Math.abs(start-normalizedStart)>1e-9,endAdjusted:Math.abs(end-normalizedEnd)>1e-9};
}

export function adjacentKeyframe(keyframes:number[],time:number,direction:'previous'|'next'):number|null{
  const usable=[...new Set(keyframes.filter(Number.isFinite))].sort((a,b)=>a-b);
  if(direction==='previous'){for(let index=usable.length-1;index>=0;index--)if(usable[index]<time-1e-9)return usable[index];return null;}
  return usable.find((value)=>value>time+1e-9)??null;
}

async function enumerateKeyframes(track:InputVideoTrack):Promise<number[]>{const sink=new EncodedPacketSink(track);const keyframes:number[]=[];let packet=await sink.getFirstKeyPacket({verifyKeyPackets:true});while(packet){if(Number.isFinite(packet.timestamp))keyframes.push(packet.timestamp);packet=await sink.getNextKeyPacket(packet,{verifyKeyPackets:true});}return [...new Set(keyframes)].sort((a,b)=>a-b);}

async function inspectVideo(track:InputVideoTrack):Promise<VideoTrackInspection>{const [codec,codecString,width,height,keyframes]=await Promise.all([track.getCodec(),track.getCodecParameterString(),track.getDisplayWidth(),track.getDisplayHeight(),enumerateKeyframes(track)]);return{id:track.id,number:track.number,codec:codec??'unknown',codecString,width,height,keyframes};}
async function inspectAudio(track:InputAudioTrack):Promise<AudioTrackInspection>{const [codec,codecString,config]=await Promise.all([track.getCodec(),track.getCodecParameterString(),track.getDecoderConfig()]);return{id:track.id,number:track.number,codec:codec??'unknown',codecString,sampleRate:config?.sampleRate??null,numberOfChannels:config?.numberOfChannels??null};}

export async function inspectLocalMedia(file:File):Promise<MediaInspection>{
 const input=new Input({formats:ALL_FORMATS,source:new BlobSource(file)});try{if(!(await input.canRead()))throw new Error('This media container is not supported by the local parser.');const [duration,mimeType,videoTracks,audioTracks,primaryVideo,primaryAudio]=await Promise.all([input.computeDuration(),input.getMimeType(),input.getVideoTracks(),input.getAudioTracks(),input.getPrimaryVideoTrack(),input.getPrimaryAudioTrack()]);const [videos,audios]=await Promise.all([Promise.all(videoTracks.map(inspectVideo)),Promise.all(audioTracks.map(inspectAudio))]);return{fileName:file.name,size:file.size,mimeType,duration,videos,audios,primaryVideoId:primaryVideo?.id??null,primaryAudioId:primaryAudio?.id??null};}finally{input.dispose();}
}

function chooseOutputFormat(file:File,videoCodec:VideoCodec|null,audioCodec:AudioCodec|null):OutputFormat{const extension=file.name.split('.').pop()?.toLowerCase();const candidates:OutputFormat[]=extension==='webm'?[new WebMOutputFormat(),new Mp4OutputFormat(),new MovOutputFormat()]:extension==='mov'?[new MovOutputFormat(),new Mp4OutputFormat(),new WebMOutputFormat()]:[new Mp4OutputFormat(),new MovOutputFormat(),new WebMOutputFormat()];const selected=candidates.find((format)=>(!videoCodec||format.getSupportedVideoCodecs().includes(videoCodec))&&(!audioCodec||format.getSupportedAudioCodecs().includes(audioCodec)));if(!selected)throw new Error('No supported output container can preserve the selected encoded audio/video codecs without re-encoding.');return selected;}
async function firstAudioPacketAtOrAfter(track:InputAudioTrack,timestamp:number){const sink=new EncodedPacketSink(track);let packet=await sink.getPacket(timestamp);while(packet&&packet.timestamp<timestamp-1e-9)packet=await sink.getNextPacket(packet);return{sink,packet};}
const throwIfAborted=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('Export canceled.','AbortError');};

export async function exportPacketRange(file:File,range:SnappedRange,options:PacketExportOptions):Promise<Blob>{
 if(range.start<0||range.end<=range.start)throw new Error('The snapped packet range is invalid.');const input=new Input({formats:ALL_FORMATS,source:new BlobSource(file)});let output:Output|null=null;try{throwIfAborted(options.signal);if(!(await input.canRead()))throw new Error('This media container is not supported by the local parser.');const [duration,videoTracks,audioTracks]=await Promise.all([input.computeDuration(),input.getVideoTracks(),input.getAudioTracks()]);const videoTrack=videoTracks.find((track)=>track.id===options.videoTrackId);const audioTrack=options.audioTrackId===null?null:audioTracks.find((track)=>track.id===options.audioTrackId)??null;if(!videoTrack)throw new Error('The selected video track is no longer available.');if(range.end>duration+1e-6)throw new Error('The snapped range exceeds the media duration.');const [videoCodec,videoConfig,audioCodec,audioConfig]=await Promise.all([videoTrack.getCodec(),videoTrack.getDecoderConfig(),audioTrack?.getCodec()??null,audioTrack?.getDecoderConfig()??null]);if(!videoCodec||!videoConfig)throw new Error('The selected video codec configuration could not be determined.');if(audioTrack&&(!audioCodec||!audioConfig))throw new Error('The selected audio codec configuration could not be determined.');const format=chooseOutputFormat(file,videoCodec,audioCodec);const target=new BufferTarget();output=new Output({format,target});const videoSource=new EncodedVideoPacketSource(videoCodec);output.addVideoTrack(videoSource,{decoderConfig:videoConfig});const audioSource=audioCodec?new EncodedAudioPacketSource(audioCodec):null;if(audioSource&&audioConfig)output.addAudioTrack(audioSource,{decoderConfig:audioConfig});await output.start();
 const videoSink=new EncodedPacketSink(videoTrack);const startPacket=await videoSink.getKeyPacket(range.start,{verifyKeyPackets:true});if(!startPacket||Math.abs(startPacket.timestamp-range.start)>1e-5)throw new Error('The selected start is not a verified keyframe.');const endPacket=range.end<duration-1e-6?await videoSink.getKeyPacket(range.end,{verifyKeyPackets:true}):undefined;let firstVideo=true;for await(const packet of videoSink.packets(startPacket,endPacket??undefined)){throwIfAborted(options.signal);const shifted=packet.clone({timestamp:packet.timestamp-range.start});await videoSource.add(shifted,firstVideo?{decoderConfig:videoConfig}:undefined);firstVideo=false;options.onProgress?.(Math.max(0,Math.min(.9,(packet.timestamp-range.start)/Math.max(1e-9,range.end-range.start)*.9)));}if(firstVideo)throw new Error('No video packets were found inside the snapped range.');
 if(audioTrack&&audioSource&&audioConfig){const{sink:audioSink,packet:audioStart}=await firstAudioPacketAtOrAfter(audioTrack,range.start);const audioEnd=await audioSink.getPacket(range.end,{metadataOnly:true});let firstAudio=true;if(audioStart){for await(const packet of audioSink.packets(audioStart,audioEnd??undefined)){throwIfAborted(options.signal);if(packet.timestamp>=range.end-1e-9)break;await audioSource.add(packet.clone({timestamp:Math.max(0,packet.timestamp-range.start)}),firstAudio?{decoderConfig:audioConfig}:undefined);firstAudio=false;}}}
 throwIfAborted(options.signal);await output.finalize();options.onProgress?.(1);if(!target.buffer)throw new Error('The output container finalized without a buffer.');return new Blob([target.buffer],{type:format.mimeType});
 }catch(error){if(output&&output.state==='started')await output.cancel().catch(()=>undefined);throw error;}finally{input.dispose();}
}
