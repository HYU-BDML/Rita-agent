import {timeline,subtitles,sceneSpans}from'./timeline';
import {mkdir,mkdtemp,rename,rm,writeFile}from'node:fs/promises';import path from'node:path';
import {run,ffmpegBin}from'./video/ffmpeg';import {ratioGeometry,parseLang,fitFilter,BRAND_COLOR,type Lang,type Ratio}from'./video/geometry';
import {rasterize}from'./video/raster';import {validateStyle,type SubtitleStyle}from'./video/template';import {checkNarration}from'./video/narration';import type {MediaItem}from'./video/manifest';
export const videoPath=(userId:string,id:string)=>path.join(process.env.CORA_DATA_DIR||path.join(process.cwd(),'data','cora'),'videos',userId,id);
export interface RenderOptions{ratio?:unknown;lang?:unknown;track?:boolean;burn?:boolean;style?:unknown;bgm?:{id:string;file:string;volume:number;fadeOut:number};manifest?:MediaItem[];narrationRate?:number}
/** Shared audio chain: volume, fade-out at the end, loop when shorter than the video, trim when longer. */
export const bgmFilter=(input:number,total:number,volume:number,fadeOut:number)=>`[${input}:a]volume=${volume},${fadeOut>0?`afade=t=out:st=${Math.max(0,total-fadeOut).toFixed(2)}:d=${fadeOut},`:''}atrim=0:${total},asetpts=PTS-STARTPTS[aout]`;
export async function renderVideo(userId:string,id:string,frames:string[],seconds:number,sceneInput?:unknown,opts:RenderOptions={}){
 const scenes=timeline(frames.length,sceneInput,seconds);const total=scenes.reduce((sum,s)=>sum+s.seconds,0);const srt=subtitles(scenes);
 const geo=ratioGeometry(opts.ratio);const lang:Lang=parseLang(opts.lang);const style:SubtitleStyle=validateStyle(opts.style);const warnings:string[]=[];
 const track=(opts.track??true)&&!!srt;let burn=!!opts.burn;if(burn&&!srt){burn=false;warnings.push('자막이 있는 장면이 없어 자막 입히기는 건너뛰었습니다.');}
 const dir=videoPath(userId,id);await mkdir(dir,{recursive:true});const work=await mkdtemp(path.join(dir,'work-'));
 try{
 for(const [i,f]of frames.entries()){if(typeof f!=='string'||f.length>800000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(f))throw new Error('PNG 장면 형식을 확인해 주세요.');const data=Buffer.from(f.split(',')[1],'base64');if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('올바른 PNG가 아닙니다.');await writeFile(path.join(work,`frame-${String(i).padStart(2,'0')}.png`),data);}
 await writeFile(path.join(work,'timeline.txt'),scenes.map((s,i)=>`file 'frame-${String(i).padStart(2,'0')}.png'\nduration ${s.seconds}\n`).join('')+`file 'frame-${String(frames.length-1).padStart(2,'0')}.png'\n`);
 if(srt)await writeFile(path.join(dir,'subtitles.srt'),srt);
 const spans=sceneSpans(scenes);const burned:{png:string;start:number;end:number}[]=[];
 if(burn){const jobs=scenes.flatMap((s,i)=>s.subtitle?[{i,out:path.join(work,`sub-${i}.png`),text:s.subtitle,keyword:s.keyword}]:[]);
  await rasterize(jobs.map(j=>({out:j.out,text:j.text,keyword:j.keyword,size:style.size,maxWidth:Math.round(geo.width*.82),color:style.color,highlight:style.highlight,mode:'subtitle' as const,canvasWidth:geo.width,canvasHeight:geo.height,position:style.position})));
  for(const j of jobs)burned.push({png:j.out,start:spans[j.i].start,end:spans[j.i].end});}
 const args=['-y','-f','concat','-safe','1','-i',path.join(work,'timeline.txt')];let n=1;let srtIdx=-1,aIdx=-1;
 if(track){args.push('-i',path.join(dir,'subtitles.srt'));srtIdx=n++;}
 if(opts.bgm){args.push('-stream_loop','-1','-i',opts.bgm.file);aIdx=n++;}
 const firstOverlay=n;for(const b of burned){args.push('-i',b.png);n++;}
 const chains=[`[0:v]${fitFilter(geo.width,geo.height,BRAND_COLOR)},fps=24,tpad=stop_mode=clone:stop_duration=1,setsar=1[v0]`];
 burned.forEach((b,k)=>chains.push(`[v${k}][${firstOverlay+k}:v]overlay=0:0:enable='between(t,${b.start},${b.end})'[v${k+1}]`));
 if(opts.bgm)chains.push(bgmFilter(aIdx,total,opts.bgm.volume,opts.bgm.fadeOut));
 args.push('-filter_complex',chains.join(';'),'-map',`[v${burned.length}]`);if(opts.bgm)args.push('-map','[aout]');
 if(track)args.push('-map',`${srtIdx}:s:0`,'-c:s','mov_text','-metadata:s:s:0',`language=${lang}`);
 if(opts.bgm)args.push('-c:a','aac','-b:a','128k');
 const tmpOut=path.join(dir,'video.tmp.mp4');
 args.push('-t',String(total),'-r','24','-c:v','libx264','-preset','ultrafast','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart',tmpOut);
 await run(ffmpegBin(),args,{timeoutMs:120000,failMessage:'MP4 렌더에 실패했습니다.'});await rename(tmpOut,path.join(dir,'video.mp4'));
 const narration=checkNarration(scenes,opts.narrationRate);
 return{status:'ready',seconds:total,frames:frames.length,width:geo.width,height:geo.height,ratio:geo.ratio as Ratio,audio:!!opts.bgm,subtitles:!!srt,subtitleTrack:track,burned:burn,lang,scenes,warnings,narration,manifest:opts.manifest??[],
  settings:{ratio:geo.ratio,lang,track,burn,style,bgm:opts.bgm?{id:opts.bgm.id,volume:opts.bgm.volume,fadeOut:opts.bgm.fadeOut}:null}};
 }finally{await rm(work,{recursive:true,force:true});await rm(path.join(dir,'video.tmp.mp4'),{force:true});}
}
