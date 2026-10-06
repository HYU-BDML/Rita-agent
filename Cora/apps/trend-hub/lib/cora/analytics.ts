export function parseCSV(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}else field+=c;}
 if(quoted)throw new Error('CSV 따옴표가 닫히지 않았습니다.');row.push(field);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export function analyzeCSV(text:string){
 const data=parseCSV(text.replace(/^\uFEFF/,''));if(data.length<2||data.length>501)throw new Error('헤더와 게시물 1~500행이 필요합니다.');
 const headers=data.shift()!.map(x=>x.trim().toLowerCase());const required=['date','title','reach','saves','likes','comments'];for(const key of required)if(!headers.includes(key))throw new Error(`필수 열: ${required.join(', ')}`);
 if(new Set(headers).size!==headers.length)throw new Error('중복된 열 이름이 있습니다.');
 const hasShares=headers.includes('shares'),hasFollowers=headers.includes('followers');
 const seen=new Set<string>();let duplicates=0;
 const val=(row:string[],key:string)=>row[headers.indexOf(key)]?.trim()??'';const warnings:string[]=[];
 const rows=data.map((r,i)=>{if(r.length!==headers.length)throw new Error(`${i+2}행 열 수가 헤더와 다릅니다.`);const date=val(r,'date');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error(`${i+2}행 날짜 형식 오류`);
  const num=(key:string)=>{const raw=val(r,key);if(raw==='')return null;const n=Number(raw);if(!/^\d+$/.test(raw)||!Number.isSafeInteger(n))throw new Error(`${i+2}행 ${key}: 0 이상의 정수 또는 빈칸`);return n;};
  const reach=num('reach'),saves=num('saves'),likes=num('likes'),comments=num('comments');if(reach===null||reach===0)warnings.push(`${i+2}행: 도달이 없거나 0이라 비율 미계산`);
  const shares=hasShares?num('shares'):null,followers=hasFollowers?num('followers'):null;const key=JSON.stringify([date,val(r,'title'),reach,saves,likes,comments,...(hasShares?[shares]:[]),...(hasFollowers?[followers]:[])]);const duplicate=seen.has(key);seen.add(key);if(duplicate){duplicates++;warnings.push(`${i+2}행: 동일 기록이 중복되어 집계에서 제외`);}
  const inconsistent=reach!==null&&saves!==null&&saves>reach;if(inconsistent)warnings.push(`${i+2}행: 저장 수가 도달보다 큽니다. 집계 기준 확인 전 저장률 제외`);
  return{duplicate,date,title:val(r,'title').slice(0,200),reach,saves,likes,comments,...(hasShares?{shares}:{}),...(hasFollowers?{followers}:{}),saveRate:!duplicate&&!inconsistent&&reach&&saves!==null?saves/reach:null};
 });
 const valid=rows.filter(r=>r.saveRate!==null);const totalReach=valid.reduce((s,r)=>s+r.reach!,0);const totalSaves=valid.reduce((s,r)=>s+r.saves!,0);
 const missing=Object.fromEntries(['reach','saves','likes','comments',...(hasShares?['shares']:[]),...(hasFollowers?['followers']:[])].map(k=>[k,rows.filter(r=>(r as Record<string,unknown>)[k]===null).length]));
 const quality={inputRows:rows.length,uniqueRows:rows.length-duplicates,duplicateRows:duplicates,rateEligibleRows:valid.length,missing};
 return{rows,quality,warnings:[...warnings,'사용자가 제공한 수동 자료입니다. 공식 Instagram 동기화가 아닙니다.','같은 계정·형식·기간·광고 여부인지 확인하세요. 관찰 차이는 인과효과가 아닙니다.'],summary:`${rows.length}개 게시물 중 ${valid.length}개에서 저장률을 계산했습니다. ${totalReach?`비교 가능 행의 도달 가중 저장률은 ${(100*totalSaves/totalReach).toFixed(2)}%입니다.`:'비교 가능한 도달 데이터가 없습니다.'}`,recommendations:valid.length>=3?['저장률이 높은 게시물의 주제·형식을 직접 비교하고 다음 콘텐츠 한 건의 가설로 사용하세요.','같은 형식과 광고 집행 조건에서 비교한 뒤 결과를 기록하세요.']:['비교 가능한 게시물이 적습니다. 점수화하지 않고 자료부터 보완하세요.'],source:'manual-csv',columns:{shares:hasShares,followers:hasFollowers}};
}

/* ---------------------------------------------------------------------------------------------
 * F087 exposure-normalized metrics, F088 period comparison and follower trend.
 * Descriptive only: no p-values, no causal claims. A blank cell is missing (excluded and counted),
 * a written 0 is a real zero (included).
 * ------------------------------------------------------------------------------------------- */
export const SMALL_SAMPLE=10;
export const METRICS=['likes','saves','shares','comments'] as const;
export type MetricKey=typeof METRICS[number];
export const METRIC_LABEL:Record<MetricKey,string>={likes:'좋아요율(좋아요/도달)',saves:'저장률(저장/도달)',shares:'공유율(공유/도달)',comments:'댓글률(댓글/도달)'};
export type AnalysisRow={date:string;title:string;reach:number|null;saves:number|null;likes:number|null;comments:number|null;shares?:number|null;followers?:number|null;duplicate:boolean};
export type MetricStat={available:boolean;label:string;/** posts with reach>0 that could have had this metric */considered:number;/** used in the rates */n:number;missing:number;inconsistent:number;median:number|null;mean:number|null;weighted:number|null;smallSample:boolean;note:string};
export type NormalizedMetrics={sample:{inputRows:number;duplicateRows:number;uniqueRows:number;reachMissingOrZero:number;reachEligibleRows:number};metrics:Record<MetricKey,MetricStat>;perPost:{date:string;title:string;reach:number;likeRate:number|null;saveRate:number|null;shareRate:number|null;commentRate:number|null}[];smallSampleThreshold:number;notes:string[]};

export function median(xs:number[]):number|null{if(!xs.length)return null;const a=[...xs].sort((x,y)=>x-y),m=a.length>>1;return a.length%2?a[m]:(a[m-1]+a[m])/2;}
const isInt=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
/** Reads rows of a saved analysis defensively (older analyses have no shares/followers). */
export function rowsOf(data:unknown):AnalysisRow[]{
 const raw=(data as {rows?:unknown})?.rows;if(!Array.isArray(raw))throw new Error('지원하는 성과 진단 자료가 아닙니다.');
 return raw.map(r=>{const o=r as Record<string,unknown>;const n=(k:string)=>isInt(o[k])?o[k] as number:null;
  return{date:String(o.date??''),title:String(o.title??'').slice(0,200),reach:n('reach'),saves:n('saves'),likes:n('likes'),comments:n('comments'),...('shares' in o?{shares:n('shares')}:{}),...('followers' in o?{followers:n('followers')}:{}),duplicate:o.duplicate===true};});
}
function metricStat(unique:AnalysisRow[],m:MetricKey,allRows:AnalysisRow[]):MetricStat{
 const label=METRIC_LABEL[m];const has=allRows.some(r=>r[m]!==undefined);
 if(!has)return{available:false,label,considered:0,n:0,missing:0,inconsistent:0,median:null,mean:null,weighted:null,smallSample:true,note:'이 CSV에 해당 열이 없어 계산하지 않았습니다(0으로 채우지 않음).'};
 const considered=unique.filter(r=>r.reach!==null&&r.reach>0);
 const blank=considered.filter(r=>r[m]==null);const present=considered.filter(r=>r[m]!=null);
 // A count above reach usually means a different counting basis; keep it visible but out of the rates.
 const bad=present.filter(r=>(r[m] as number)>(r.reach as number));const ok=present.filter(r=>(r[m] as number)<=(r.reach as number));
 const rates=ok.map(r=>(r[m] as number)/(r.reach as number));const sumV=ok.reduce((t,r)=>t+(r[m] as number),0),sumR=ok.reduce((t,r)=>t+(r.reach as number),0);
 const small=ok.length<SMALL_SAMPLE;
 return{available:true,label,considered:considered.length,n:ok.length,missing:blank.length,inconsistent:bad.length,median:median(rates),mean:rates.length?rates.reduce((a,b)=>a+b,0)/rates.length:null,weighted:sumR>0?sumV/sumR:null,smallSample:small,note:`표본 ${ok.length}개, 빈칸 ${blank.length}개 제외${bad.length?`, 도달보다 큰 값 ${bad.length}개 제외`:''}${small?`. 표본이 ${SMALL_SAMPLE}개 미만이라 중앙값이 쉽게 흔들립니다.`:''}`};
}
export function normalizedMetrics(rows:AnalysisRow[]):NormalizedMetrics{
 const unique=rows.filter(r=>!r.duplicate);const eligible=unique.filter(r=>r.reach!==null&&r.reach>0);
 const rate=(v:number|null|undefined,reach:number,cap=true)=>v==null||(cap&&v>reach)?null:v/reach;
 return{sample:{inputRows:rows.length,duplicateRows:rows.length-unique.length,uniqueRows:unique.length,reachMissingOrZero:unique.length-eligible.length,reachEligibleRows:eligible.length},
  metrics:Object.fromEntries(METRICS.map(m=>[m,metricStat(unique,m,rows)])) as Record<MetricKey,MetricStat>,
  perPost:eligible.map(r=>({date:r.date,title:r.title,reach:r.reach as number,likeRate:rate(r.likes,r.reach as number),saveRate:rate(r.saves,r.reach as number),shareRate:rate(r.shares,r.reach as number),commentRate:rate(r.comments,r.reach as number)})),
  smallSampleThreshold:SMALL_SAMPLE,
  notes:['비율은 게시물마다 (반응 수 ÷ 도달)로 계산했고, 도달이 빈칸이거나 0인 게시물은 비율 계산에서 뺐습니다.','빈칸은 결측으로 세고 0으로 바꾸지 않습니다. 0으로 적힌 값은 실제 0으로 계산합니다.','가중 비율은 반응 합계 ÷ 도달 합계이고, 중앙값은 게시물별 비율의 가운데 값입니다.']};
}
export type Range={from:string;to:string};
const validDay=(d:unknown)=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export function checkRange(r:unknown,name:string):Range{const o=r as Range|undefined;if(!o||!validDay(o.from)||!validDay(o.to))throw new Error(`${name} 기간은 YYYY-MM-DD 형식의 시작일과 종료일이 필요합니다.`);if(o.from>o.to)throw new Error(`${name} 기간의 시작일이 종료일보다 늦습니다.`);return{from:o.from,to:o.to};}
export type PeriodSummary={range:Range;posts:number;reachMissing:number;reachMedian:number|null;metrics:Record<MetricKey,MetricStat>};
export function comparePeriods(rows:AnalysisRow[],aIn:unknown,bIn:unknown){
 const a=checkRange(aIn,'A'),b=checkRange(bIn,'B');if(a.from<=b.to&&b.from<=a.to)throw new Error('두 기간이 겹칩니다. 겹치지 않는 기간을 골라 주세요.');
 const side=(range:Range):PeriodSummary=>{const inRange=rows.filter(r=>r.date>=range.from&&r.date<=range.to);const unique=inRange.filter(r=>!r.duplicate);
  return{range,posts:unique.length,reachMissing:unique.filter(r=>r.reach===null).length,reachMedian:median(unique.filter(r=>r.reach!==null).map(r=>r.reach as number)),metrics:Object.fromEntries(METRICS.map(m=>[m,metricStat(unique,m,rows)])) as Record<MetricKey,MetricStat>};};
 const A=side(a),B=side(b);const diff=(x:number|null,y:number|null)=>x===null||y===null?null:y-x;
 const differences=Object.fromEntries(METRICS.map(m=>[m,{medianDiff:diff(A.metrics[m].median,B.metrics[m].median),weightedDiff:diff(A.metrics[m].weighted,B.metrics[m].weighted),nA:A.metrics[m].n,nB:B.metrics[m].n,smallSample:A.metrics[m].smallSample||B.metrics[m].smallSample}])) as Record<MetricKey,{medianDiff:number|null;weightedDiff:number|null;nA:number;nB:number;smallSample:boolean}>;
 const warnings:string[]=[];if(A.posts===0||B.posts===0)warnings.push('한쪽 기간에 게시물이 없어 비교할 수 없습니다.');
 for(const m of METRICS){if(!A.metrics[m].available)continue;if(differences[m].smallSample)warnings.push(`${METRIC_LABEL[m]}: 표본이 A ${A.metrics[m].n}개, B ${B.metrics[m].n}개로 ${SMALL_SAMPLE}개 미만인 쪽이 있어 차이를 판단하기 이릅니다.`);}
 warnings.push('두 기간의 관찰 차이를 나란히 놓은 것이며 검정(p값)이나 인과효과가 아닙니다. 게시 형식·광고·시기 요인을 확인하세요.');
 return{a:A,b:B,differences,warnings};
}
export type FollowerTrend={available:boolean;reason?:string;points:{date:string;followers:number}[];first:{date:string;followers:number}|null;last:{date:string;followers:number}|null;change:number|null;changePct:number|null;pointCount:number;missingRows:number;conflictingDates:number;notes:string[]};
export function followerTrend(rows:AnalysisRow[]):FollowerTrend{
 const empty={points:[],first:null,last:null,change:null,changePct:null,pointCount:0,missingRows:0,conflictingDates:0};
 if(!rows.some(r=>r.followers!==undefined))return{...empty,available:false,reason:'CSV에 followers 열이 없어 팔로워 추이를 계산하지 않았습니다.',notes:[]};
 const unique=rows.filter(r=>!r.duplicate);const byDate=new Map<string,number>();let conflicts=0;const conflicted=new Set<string>();
 for(const r of unique){if(r.followers==null)continue;const prev=byDate.get(r.date);if(prev!==undefined&&prev!==r.followers&&!conflicted.has(r.date)){conflicted.add(r.date);conflicts++;}byDate.set(r.date,r.followers);}
 const points=[...byDate.entries()].sort((x,y)=>x[0].localeCompare(y[0])).map(([date,followers])=>({date,followers}));
 const missingRows=unique.filter(r=>r.followers==null).length;const first=points[0]??null,last=points.at(-1)??null;
 const notes=[`팔로워 값이 있는 날짜 ${points.length}개, 빈칸 ${missingRows}행은 제외했습니다(0으로 채우지 않음).`];
 if(conflicted.size)notes.push(`같은 날짜에 서로 다른 팔로워 값이 ${conflicted.size}곳 있어 파일의 마지막 값을 썼습니다.`);
 if(points.length<3)notes.push(`측정 시점이 ${points.length}개뿐이라 추이라고 부르기 어렵습니다.`);
 return{available:points.length>0,reason:points.length?undefined:'팔로워 값이 모두 비어 있습니다.',points,first,last,change:first&&last&&points.length>1?last.followers-first.followers:null,changePct:first&&last&&points.length>1&&first.followers>0?(last.followers-first.followers)/first.followers:null,pointCount:points.length,missingRows,conflictingDates:conflicted.size,notes};
}
/** Aggregates only (no titles, no per-post rows) so it can be shown to an AI or a report reader. */
export function aggregateSummary(data:unknown,periods?:{a?:unknown;b?:unknown}){
 const rows=rowsOf(data);const n=normalizedMetrics(rows);const {perPost:_perPost,...aggregate}=n;void _perPost;
 const f=followerTrend(rows);const {points:_points,...followers}=f;void _points;
 return{normalized:aggregate,followers,comparison:periods?.a&&periods?.b?comparePeriods(rows,periods.a,periods.b):null};
}
