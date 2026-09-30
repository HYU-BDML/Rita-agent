export type SceneTiming={seconds:number;subtitle:string;keyword?:string};
export function timeline(count:number,value:unknown,legacySeconds=3):SceneTiming[]{
 if(!Number.isInteger(count)||count<2||count>12)throw new Error('장면은 2~12개입니다.');
 const scenes=value===undefined?Array.from({length:count},()=>({seconds:legacySeconds,subtitle:''})):value;
 if(!Array.isArray(scenes)||scenes.length!==count)throw new Error('장면과 타임라인 수가 일치해야 합니다.');
 return scenes.map(s=>{if(!s||!Number.isInteger(s.seconds)||s.seconds<1||s.seconds>10||typeof s.subtitle!=='string'||s.subtitle.length>200||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s.subtitle))throw new Error('장면 길이는 1~10초, 자막은 200자 이하입니다.');
  const subtitle=s.subtitle.replace(/\r/g,'').trim();
  // F044 optional highlight keyword: must literally occur in the scene's subtitle.
  if(s.keyword===undefined||s.keyword===null||s.keyword==='')return{seconds:s.seconds,subtitle};
  if(typeof s.keyword!=='string'||s.keyword.length>30||/[\u0000-\u001f]/.test(s.keyword)||!subtitle.includes(s.keyword.trim()))throw new Error('강조 단어는 30자 이하이며 같은 장면의 자막에 들어 있어야 합니다.');
  return{seconds:s.seconds,subtitle,keyword:s.keyword.trim()};});
}
const stamp=(seconds:number)=>`${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')},000`;
export function subtitles(scenes:SceneTiming[]){let elapsed=0,index=0;return scenes.map(s=>{const start=elapsed;elapsed+=s.seconds;return s.subtitle?`${++index}\n${stamp(start)} --> ${stamp(elapsed)}\n${s.subtitle.replace(/\n\s*\n/g,'\n')}\n\n`:'';}).join('');}
/** Start/end seconds of every scene, used by burned-in subtitle overlays. */
export const sceneSpans=(scenes:SceneTiming[])=>{let t=0;return scenes.map(s=>{const span={start:t,end:t+s.seconds};t+=s.seconds;return span;});};
