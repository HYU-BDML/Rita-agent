import { lookup } from 'node:dns/promises';
import https from 'node:https';
export function publicIPv4(ip:string){const p=ip.split('.').map(Number);return p.length===4&&p.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&![0,10,127].includes(p[0])&&!(p[0]===169&&p[1]===254)&&!(p[0]===172&&p[1]>=16&&p[1]<=31)&&!(p[0]===192&&p[1]===168)&&!(p[0]===100&&p[1]>=64&&p[1]<=127)&&p[0]<224;}
export async function fetchPublic(url:string,depth=0):Promise<{title:string;text:string;url:string}>{
 const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||depth>3)throw new Error('공개 HTTPS 주소만 가져올 수 있습니다.');
 const resolved=await lookup(u.hostname,{all:true,family:4});if(!resolved.length||resolved.some(a=>!publicIPv4(a.address)))throw new Error('내부 네트워크 주소는 가져올 수 없습니다.');
 const result=await new Promise<{status:number;location?:string;content:string}>((resolve,reject)=>{
  const req=https.get(u,{family:4,headers:{'User-Agent':'Cora/0.1 source reader','Accept':'text/html,text/plain'},lookup:(_hostname,_options,cb)=>cb(null,resolved[0].address,4)},res=>{
   if([301,302,303,307,308].includes(res.statusCode||0)){res.resume();resolve({status:res.statusCode!,location:res.headers.location,content:''});return;}
   if(res.statusCode!==200||!String(res.headers['content-type']).match(/text\/(html|plain)/)){res.resume();reject(new Error('본문을 읽을 수 없는 응답입니다. 텍스트를 직접 붙여 넣어 주세요.'));return;}
   let total=0;const chunks:Buffer[]=[];res.on('data',c=>{total+=c.length;if(total>2_000_000){req.destroy();reject(new Error('원문이 너무 큽니다.'));}else chunks.push(c);});res.on('end',()=>resolve({status:200,content:Buffer.concat(chunks).toString('utf8')}));res.on('error',reject);
  });req.setTimeout(10000,()=>req.destroy(new Error('원문 가져오기 시간 초과')));req.on('error',reject);
 });
 if(result.location)return fetchPublic(new URL(result.location,u).href,depth+1);
 const decode=(s:string)=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ');
 const title=decode(result.content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g,' ')||u.hostname).trim();
 const main=result.content.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i)?.[1]||result.content;
 const text=decode(main.replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<\/(p|div|h[1-6]|li|section)>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n')).trim().slice(0,16000);
 if(text.length<30)throw new Error('추출한 본문이 부족합니다. 직접 입력해 주세요.');return{title,text,url:u.href};
}
