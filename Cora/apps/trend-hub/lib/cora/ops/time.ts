import{OpsError}from'./errors';
/** Korea has no daylight saving time, so Asia/Seoul is a fixed UTC+9 offset. */
export const SEOUL_OFFSET_MS=9*3600_000;
export const toSeoulLocal=(ms:number)=>new Date(ms+SEOUL_OFFSET_MS).toISOString().slice(0,16);
export const seoulDate=(ms:number)=>new Date(ms+SEOUL_OFFSET_MS).toISOString().slice(0,10);
/** 'YYYY-MM-DDTHH:mm' typed as Seoul wall-clock time to a UTC ISO string. Impossible dates (02-30) are refused. */
export function seoulLocalToUtc(local:unknown):string{
 if(typeof local!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw new OpsError('예약 일시는 YYYY-MM-DDTHH:mm 형식(한국 시간)이어야 합니다.');
 const ms=Date.parse(local+':00+09:00');
 if(!Number.isFinite(ms)||toSeoulLocal(ms)!==local)throw new OpsError('존재하지 않는 날짜 또는 시각입니다.');
 return new Date(ms).toISOString();
}
/** Stored calendar items may hold a zone-less local string from the older form; those are read as Seoul time. */
export function calendarMs(v:unknown):number{
 if(typeof v!=='string')return NaN;
 if(/(Z|[+-]\d{2}:\d{2})$/.test(v))return Date.parse(v);
 return/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)?Date.parse((v.length===16?v+':00':v)+'+09:00'):NaN;
}
export function monthBounds(month:unknown){
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new OpsError('월은 YYYY-MM 형식이어야 합니다.');
 const y=Number(month.slice(0,4)),m=Number(month.slice(5,7));
 return{year:y,month:m,startMs:Date.UTC(y,m-1,1)-SEOUL_OFFSET_MS,endMs:Date.UTC(y,m,1)-SEOUL_OFFSET_MS,daysInMonth:new Date(Date.UTC(y,m,0)).getUTCDate(),firstWeekday:new Date(Date.UTC(y,m-1,1)).getUTCDay()};
}
export const shiftMonth=(month:string,delta:number)=>{const y=Number(month.slice(0,4)),m=Number(month.slice(5,7))-1+delta;const d=new Date(Date.UTC(y,m,1));return d.toISOString().slice(0,7);};
